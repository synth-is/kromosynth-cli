import fs from 'fs';
import path from 'path';
import { getEvoRunDirPath } from './util/qd-common.js';
import { SQLitePersistenceProvider } from './util/sqlite-persistence-provider.js';

/**
 * KuzuDB integration using proven Node.js SDK pattern with proper connection management
 */

// ---------------------------------------------------------------------------
// Global handle registry to prevent premature GC finalization of native
// resources. We keep db/connection pairs per dbPath for the lifetime of the
// process, unless the user explicitly opts in to closing them.
// ---------------------------------------------------------------------------
const kuzuHandles = new Map(); // dbPath -> { db, conn }

async function getOrCreateHandle(dbPath) {
  let handle = kuzuHandles.get(dbPath);
  if (handle && handle.db && handle.conn) {
    return handle;
  }
  const kuzu = await import('kuzu');
  const db = new kuzu.Database(dbPath);
  const conn = new kuzu.Connection(db);
  handle = { db, conn };
  kuzuHandles.set(dbPath, handle);
  return handle;
}

// Optional cleanup on exit if user explicitly enables closes.
let exitHookInstalled = false;
function installExitHookOnce() {
  if (exitHookInstalled) return;
  exitHookInstalled = true;
  process.on('beforeExit', () => {
    if (!process.env.KUZU_ENABLE_CLOSE) return;
  try { console.log(`Kuzu: closing ${kuzuHandles.size} DB handle(s) on exit...`); } catch(_) {}
    for (const [dbPath, handle] of kuzuHandles.entries()) {
      const { db, conn } = handle || {};
      try { if (conn && typeof conn.close === 'function') conn.close(); } catch(_) {}
      try { if (db && typeof db.close === 'function') db.close(); } catch(_) {}
      kuzuHandles.delete(dbPath);
    }
  });
}

export async function initializeKuzuDB(dbPath) {
  console.log(`Initializing/Verifying KuzuDB at: ${dbPath}`);
  try {
    // Optional full recreate if explicitly requested
    if (process.env.KUZU_RECREATE_DB === '1') {
      try {
        if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });
        const walPath = dbPath.replace(/\.kuzu$/, '.wal');
        if (fs.existsSync(walPath)) fs.rmSync(walPath, { force: true });
      } catch (_) { /* ignore */ }
    }

    // Ensure directory exists and acquire persistent handle
    await fs.promises.mkdir(path.dirname(dbPath), { recursive: true });
    const { conn } = await getOrCreateHandle(dbPath);
    installExitHookOnce();

    // Create base Sound table (no vector columns here; added lazily later)
    try {
      await conn.query(`CREATE NODE TABLE Sound(
        id STRING PRIMARY KEY,
        name STRING,
        elite_class STRING,
        generation INT64,
        score DOUBLE,
        count INT64,
        uBC INT64,
        duration INT64,
        noteDelta INT64,
        velocity INT64,
        feature_type STRING,
        feature_dimension INT64 DEFAULT 0,
        primary_embedding_type STRING DEFAULT 'mfcc-sans0'
      )`);
    } catch (e) {
      const msg = e?.message || String(e);
      if (!/already exists in catalog/i.test(msg)) throw e;
      // Backfill required columns if missing (best-effort)
      try { await conn.query("ALTER TABLE Sound ADD feature_type STRING"); } catch (_) {}
      try { await conn.query("ALTER TABLE Sound ADD feature_dimension INT64 DEFAULT 0"); } catch (_) {}
      try { await conn.query("ALTER TABLE Sound ADD primary_embedding_type STRING DEFAULT 'mfcc-sans0'"); } catch (_) {}
    }

    try {
      await conn.query("CREATE REL TABLE PARENT_OF(FROM Sound TO Sound, method STRING)");
    } catch (e) {
      const msg = e?.message || String(e);
      if (!/already exists in catalog/i.test(msg)) throw e;
    }

    console.log(`KuzuDB ready at: ${dbPath}`);
    return { dbPath, metadata: { schema_version: '2.1', feature_support: true } };
  } catch (error) {
    console.error('Error initializing KuzuDB:', error);
    throw error;
  }
}

// --- Feature support helpers -------------------------------------------------

function getVectorPropertyName(dimension) {
  return `audio_features_${dimension}`;
}

// Detect feature dimensions by sampling available features from SQLite/file
export async function detectFeatureDimensions(evoRunConfig, evoRunId) {
  console.log('Detecting feature dimensions...');
  
  try {
    const persistenceProvider = new SQLitePersistenceProvider();
    const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
    const featureGenomeIds = await persistenceProvider.listAllFeatureGenomeIds(evoRunDirPath);
    if (!featureGenomeIds || featureGenomeIds.length === 0) {
      console.log('No feature data found, using default dimensions');
      return new Set([96, 128, 512]);
    }
    const sampleSize = Math.min(5, featureGenomeIds.length);
    const sampleIds = featureGenomeIds.slice(0, sampleSize);
    const detectedDimensions = new Set();
    for (const genomeId of sampleIds) {
      try {
        const features = await persistenceProvider.readFeaturesForGenomeIdsFromDisk(
          evoRunDirPath, evoRunId, [genomeId]
        );
        if (features[genomeId]) {
          for (const [, featureData] of Object.entries(features[genomeId])) {
            if (featureData && Array.isArray(featureData.features)) {
              detectedDimensions.add(featureData.features.length);
            }
          }
        }
      } catch (err) {
        console.warn(`Could not read features for genome ${genomeId}:`, err?.message || err);
      }
    }
    console.log(`Detected feature dimensions: ${Array.from(detectedDimensions).sort((a,b)=>a-b).join(', ')}`);
    return detectedDimensions.size ? detectedDimensions : new Set([96,128,512]);
  } catch (error) {
    console.error('Error detecting feature dimensions:', error);
    return new Set([96, 128, 512]);
  }
}

// Extend Sound table with a new vector column for given dimension
async function extendSchemaForNewDimension(dbPath, dimension) {
  const { conn } = await getOrCreateHandle(dbPath);
  try {
    await conn.query(`ALTER TABLE Sound ADD ${getVectorPropertyName(dimension)} FLOAT[${dimension}]`);
    if (process.env.KUZU_CREATE_INDEX === '1') {
      try { await conn.query(`CREATE INDEX ON Sound.${getVectorPropertyName(dimension)}`); } catch (e) { /* best-effort */ }
    }
    console.log(`Extended schema for ${dimension}D vectors`);
  } catch (err) {
    console.warn(`Could not extend schema for ${dimension}D: ${err?.message || err}`);
  }
}

export async function populateKuzuDBWithLineage(evoRunConfig, evoRunId, lineageData, options = {}) {
  const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
  const dbPath = options.dbPath || path.join(evoRunDirPath, `${evoRunId}.kuzu`);
  const verbose = process.env.KUZU_VERBOSE_KUZU === '1' || options.verbose;
  const yieldEvery = options.yieldEvery || 500; // micro-yield to event loop
  
  console.log(`Populating KuzuDB for ${evoRunId}...`);
  
  try {
  // Use global handle to avoid repeated open/close churn
  const { db, conn } = await getOrCreateHandle(dbPath);
  installExitHookOnce();
    
  console.log('Inserting sounds...');
    for (const genome of lineageData) {
      // Extract all attributes with defaults for missing values
      const id = genome.id || 'unknown';
      const name = genome.name || genome.class || 'sound';
      const elite_class = genome.class || genome.eliteClass || 'unknown';
      const generation = genome.gN || 0;
      const score = genome.s || 0.0;
      const count = genome.count || 1;
      const uBC = genome.uBC || 0;
      const duration = genome.duration || 0;
      const noteDelta = genome.noteDelta || 0;
      const velocity = genome.velocity || 0;
      
      // Use exact CREATE pattern from documentation
      await conn.query(`CREATE (u:Sound {id: '${id}', name: '${name}', elite_class: '${elite_class}', generation: ${generation}, score: ${score}, count: ${count}, uBC: ${uBC}, duration: ${duration}, noteDelta: ${noteDelta}, velocity: ${velocity}})`);
      if (verbose) {
        console.log(`✅ Sound ${id} inserted (gen: ${generation})`);
      }
      if (yieldEvery && (generation % yieldEvery === 0)) {
        await new Promise(r => setTimeout(r, 0));
      }
    }
    
    console.log('Inserting relationships...');
    let relationshipCount = 0;
    for (const genome of lineageData) {
      if (genome.parents && genome.parents.length > 0) {
        for (const parent of genome.parents) {
          // Use exact MATCH + CREATE pattern from documentation
          await conn.query(`MATCH (u1:Sound), (u2:Sound) WHERE u1.id = '${parent.genomeId || parent.id}' AND u2.id = '${genome.id}' CREATE (u1)-[:PARENT_OF {method: '${parent.breedingMethod || 'unknown'}'}]->(u2)`);
          relationshipCount++;
          if (verbose) {
            console.log(`✅ Relationship ${parent.genomeId || parent.id} -> ${genome.id}`);
          }
        }
      }
    }
    
    // Verify within same connection (like working test)
    const verifyResult = await conn.query('MATCH (s:Sound) RETURN count(s) as count');
    const verifyData = await verifyResult.getAll();
    console.log(`Verification: ${verifyData[0].count} sounds inserted`);
    if (verbose) {
      const m = process.memoryUsage();
      console.log(`Memory RSS: ${(m.rss/1024/1024).toFixed(1)} MB, HeapUsed: ${(m.heapUsed/1024/1024).toFixed(1)} MB`);
    }
    
  // Connection management: defer any closing to the process exit hook.
    
    console.log('Successfully populated KuzuDB');
    
    return {
      success: true,
      dbPath,
      stats: { 
        total_sounds: lineageData.length,
        total_parent_relationships: relationshipCount
      }
    };
    
  } catch (error) {
    console.error('Error populating KuzuDB:', error);
    throw error;
  }
}

export async function findDescendants(dbPath, soundId, maxDepth = 10) {
  try {
  const { db, conn } = await getOrCreateHandle(dbPath);
  installExitHookOnce();
    
    const result = await conn.query(`MATCH (ancestor:Sound)-[:PARENT_OF*1..${maxDepth}]->(descendants:Sound) WHERE ancestor.id = '${soundId}' RETURN descendants.id, descendants.name ORDER BY descendants.id`);
    const data = await result.getAll();
    
  // Connection management: defer any closing to the process exit hook.
    
    return data;
    
  } catch (error) {
    console.error('Error finding descendants:', error);
    throw error;
  }
}

export async function getDatabaseStats(dbPath) {
  try {
  const { db, conn } = await getOrCreateHandle(dbPath);
  installExitHookOnce();
    
    const soundCount = await conn.query('MATCH (s:Sound) RETURN count(s) as count');
    const soundResult = await soundCount.getAll();
    
    const relCount = await conn.query('MATCH ()-[r:PARENT_OF]->() RETURN count(r) as count');
    const relResult = await relCount.getAll();
    
    // Get some sample stats
    const generationStats = await conn.query('MATCH (s:Sound) RETURN min(s.generation) as min_gen, max(s.generation) as max_gen, avg(s.generation) as avg_gen');
    const genResult = await generationStats.getAll();
    
    const scoreStats = await conn.query('MATCH (s:Sound) RETURN min(s.score) as min_score, max(s.score) as max_score, avg(s.score) as avg_score');
    const scoreResult = await scoreStats.getAll();
    
    const classCount = await conn.query('MATCH (s:Sound) RETURN count(DISTINCT s.elite_class) as unique_classes');
    const classResult = await classCount.getAll();
    
  // Connection management: defer any closing to the process exit hook.
    
    return {
      sounds: soundResult[0].count,
      relationships: relResult[0].count,
      generations: {
        min: genResult[0].min_gen,
        max: genResult[0].max_gen,
        avg: genResult[0].avg_gen
      },
      scores: {
        min: scoreResult[0].min_score,
        max: scoreResult[0].max_score,
        avg: scoreResult[0].avg_score
      },
      unique_classes: classResult[0].unique_classes
    };
    
  } catch (error) {
    console.error('Error getting database stats:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Backwards / compatibility wrappers
// The analysis layer currently imports initializeKuzuDBWithFeatures and
// populateKuzuDBWithLineageAndFeatures. The underlying feature embedding
// integration hasn't been implemented yet, so we alias to the existing
// lineage-only functions to unblock execution. When feature vector storage
// is added, extend these wrappers accordingly.
// ---------------------------------------------------------------------------

export { initializeKuzuDB as initializeKuzuDBWithFeatures };

export async function populateKuzuDBWithLineageAndFeatures(evoRunConfig, evoRunId, lineageData, options = {}) {
  const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
  const dbPath = options.dbPath || path.join(evoRunDirPath, `${evoRunId}.kuzu`);
  const verbose = process.env.KUZU_VERBOSE_KUZU === '1' || options.verbose;
  const yieldEvery = options.yieldEvery || 500;
  const featureBatchSize = options.featureBatchSize || parseInt(process.env.KUZU_FEATURE_BATCH || '500', 10);
  const useCopy = process.env.KUZU_USE_COPY === '1';

  console.log(`Populating KuzuDB with lineage and features for ${evoRunId}...`);
  try {
    const { conn } = await getOrCreateHandle(dbPath);
    installExitHookOnce();
    // Optional COPY bulk load of base Sound nodes (no feature vectors yet)
    if (useCopy) {
      console.log('[COPY] Checking if bulk load needed...');
      let existing = 0;
      try {
        const r = await conn.query('MATCH (s:Sound) RETURN count(s) as c');
        const rows = await r.getAll();
        existing = rows[0].c || 0;
      } catch (_) {}
      if (existing === 0) {
        console.log('[COPY] Preparing CSV for base Sound rows');
        const tmpDir = path.join(evoRunDirPath, '.kuzu_tmp');
        await fs.promises.mkdir(tmpDir, { recursive: true });
        const csvPath = path.join(tmpDir, `sound_base_${Date.now()}.csv`);
        const ws = fs.createWriteStream(csvPath, { encoding: 'utf8' });
        // Column order matches table definition (without vector columns)
        for (const genome of lineageData) {
          const id = (genome.id || 'unknown').replace(/\n|\r|"/g,'');
          const name = (genome.name || genome.class || 'sound').replace(/\n|\r|"/g,'');
          const elite_class = (genome.class || genome.eliteClass || 'unknown').replace(/\n|\r|"/g,'');
          const generation = genome.gN || 0;
          const score = genome.s || 0.0;
          const count = genome.count || 1;
          const uBC = genome.uBC || 0;
          const duration = genome.duration || 0;
          const noteDelta = genome.noteDelta || 0;
          const velocity = genome.velocity || 0;
          // placeholder feature metadata; real values set later
          ws.write(`${id},${name},${elite_class},${generation},${score},${count},${uBC},${duration},${noteDelta},${velocity},unknown,0,mfcc-sans0\n`);
        }
        await new Promise(res => ws.end(res));
        const start = Date.now();
        console.log(`[COPY] CSV ready (${csvPath}). Executing COPY...`);
        await conn.query(`COPY Sound FROM '${csvPath}'`);
        console.log(`[COPY] Loaded ${lineageData.length} nodes in ${(Date.now()-start)/1000}s`);
      } else {
        console.log(`[COPY] Skipping bulk load; table already has ${existing} rows.`);
      }
    }

    // Prepare streaming ingestion (feature vectors + metadata updates)
    const persistenceProvider = new SQLitePersistenceProvider();
    const lineageById = new Map(lineageData.map(g => [g.id, g]));
    const genomeIds = lineageData.map(g => g.id).filter(Boolean);
    console.log(`Streaming features for ${genomeIds.length} genomes in batches of ${featureBatchSize}...`);

    let soundsInserted = 0;
    let relationshipCount = 0;
    const observedDims = new Set();

    for (let i = 0; i < genomeIds.length; i += featureBatchSize) {
      const batchIds = genomeIds.slice(i, i + featureBatchSize);
      let batchFeatures = {};
      try {
        batchFeatures = await persistenceProvider.readFeaturesForGenomeIdsFromDisk(
          evoRunDirPath, evoRunId, batchIds
        );
      } catch (err) {
        console.warn(`Feature read failure for batch starting at ${i}:`, err?.message || err);
      }

      // Detect new dimensions in this batch and extend schema as needed
      const newDims = new Set();
      for (const featsByType of Object.values(batchFeatures)) {
        for (const fdata of Object.values(featsByType)) {
          if (fdata && Array.isArray(fdata.features)) {
            const dim = fdata.features.length;
            if (!observedDims.has(dim)) newDims.add(dim);
          }
        }
      }
      for (const d of Array.from(newDims).sort((a,b)=>a-b)) {
        await extendSchemaForNewDimension(dbPath, d);
        observedDims.add(d);
      }

  // Insert (or update if COPY used) nodes for this batch
      for (const id of batchIds) {
        const genome = lineageById.get(id) || {};
        const name = genome.name || genome.class || 'sound';
        const elite_class = genome.class || genome.eliteClass || 'unknown';
        const generation = genome.gN || 0;
        const score = genome.s || 0.0;
        const count = genome.count || 1;
        const uBC = genome.uBC || 0;
        const duration = genome.duration || 0;
        const noteDelta = genome.noteDelta || 0;
        const velocity = genome.velocity || 0;

        const featsByType = batchFeatures[id] || {};
        const featureVectors = {};
        let primaryFeatureType = 'unknown';
        for (const [featureType, featureData] of Object.entries(featsByType)) {
          if (featureData && Array.isArray(featureData.features)) {
            const dim = featureData.features.length;
            const prop = getVectorPropertyName(dim);
            featureVectors[prop] = `[${featureData.features.join(', ')}]`;
            if (primaryFeatureType === 'unknown' || featureType === 'mfcc-sans0') {
              primaryFeatureType = featureType;
            }
          }
        }
        const primaryDimension = (featsByType[primaryFeatureType] && Array.isArray(featsByType[primaryFeatureType].features))
          ? featsByType[primaryFeatureType].features.length
          : (() => { const first = Object.values(featsByType).find(v => v && Array.isArray(v.features)); return first ? first.features.length : 0; })();

        const baseProps = {
          id: `'${id}'`, name: `'${name}'`, elite_class: `'${elite_class}'`, generation, score, count, uBC, duration, noteDelta, velocity,
          feature_type: `'${primaryFeatureType}'`, feature_dimension: primaryDimension, primary_embedding_type: `'${primaryFeatureType}'`
        };
        if (useCopy) {
          // Update existing row created by COPY
          const setClauses = [
            `u.name = ${baseProps.name}`,
            `u.elite_class = ${baseProps.elite_class}`,
            `u.generation = ${generation}`,
            `u.score = ${score}`,
            `u.count = ${count}`,
            `u.uBC = ${uBC}`,
            `u.duration = ${duration}`,
            `u.noteDelta = ${noteDelta}`,
            `u.velocity = ${velocity}`,
            `u.feature_type = '${primaryFeatureType}'`,
            `u.feature_dimension = ${primaryDimension}`,
            `u.primary_embedding_type = '${primaryFeatureType}'`
          ];
            for (const [k,v] of Object.entries(featureVectors)) setClauses.push(`u.${k} = ${v}`);
          await conn.query(`MATCH (u:Sound {id: '${id}'}) SET ${setClauses.join(', ')}`);
          soundsInserted++;
        } else {
          const allEntries = [
            ...Object.entries(baseProps).map(([k,v]) => `${k}: ${v}`),
            ...Object.entries(featureVectors).map(([k,v]) => `${k}: ${v}`)
          ];
          await conn.query(`CREATE (u:Sound {${allEntries.join(', ')}})`);
          soundsInserted++;
        }
        if (verbose && soundsInserted % 2000 === 0) {
          const m = process.memoryUsage();
          console.log(`[features] Inserted ${soundsInserted} sounds | RSS ${(m.rss/1024/1024).toFixed(1)} MB`);
        }
        if (yieldEvery && (generation % yieldEvery === 0)) {
          await new Promise(r => setTimeout(r, 0));
        }
      }

      // Allow GC between batches
      batchFeatures = null;
      if (global.gc) { try { global.gc(); } catch(_) {} }
      await new Promise(r => setTimeout(r, 0));
    }

    // Optional: create indexes for known/common dims after ingestion
    if (process.env.KUZU_CREATE_INDEX === '1') {
      for (const d of [96,128,512]) {
        try { await conn.query(`CREATE INDEX ON Sound.${getVectorPropertyName(d)}`); } catch(_) {}
      }
    }

    console.log('Inserting relationships (post node ingestion)...');
    for (const genome of lineageData) {
      if (genome.parents && genome.parents.length > 0) {
        for (const parent of genome.parents) {
          await conn.query(`MATCH (u1:Sound), (u2:Sound) WHERE u1.id = '${parent.genomeId || parent.id}' AND u2.id = '${genome.id}' CREATE (u1)-[:PARENT_OF {method: '${parent.breedingMethod || 'unknown'}'}]->(u2)`);
          relationshipCount++;
        }
      }
    }

    const verifyResult = await conn.query('MATCH (s:Sound) RETURN count(s) as count');
    const verifyData = await verifyResult.getAll();
    console.log(`Verification: ${verifyData[0].count} sounds inserted`);

    const featureStats = {};
    for (const d of Array.from(new Set([96,128,512, ...observedDims]))) {
      const prop = getVectorPropertyName(d);
      try {
        const r = await conn.query(`MATCH (s:Sound) WHERE s.${prop} IS NOT NULL RETURN count(s) as count`);
        const rows = await r.getAll();
        featureStats[`${d}D_vectors`] = rows[0].count;
      } catch { featureStats[`${d}D_vectors`] = 0; }
    }

    console.log('Successfully populated KuzuDB with features (streamed)');
    return {
      success: true,
      dbPath,
      stats: {
        total_sounds: verifyData[0].count,
        sounds_inserted: soundsInserted,
        total_parent_relationships: relationshipCount,
        feature_vectors: featureStats,
        supported_dimensions: Array.from(observedDims).sort((a,b)=>a-b)
      }
    };
  } catch (error) {
    console.error('Error populating KuzuDB with features:', error);
    throw error;
  }
}

// Similarity search using vector_cosine_similarity on a chosen dimension
export async function findSimilarSounds(dbPath, queryVector, featureType = 'mfcc-sans0', limit = 10, threshold = 0.8) {
  try {
    const { conn } = await getOrCreateHandle(dbPath);
    installExitHookOnce();
    const dimension = queryVector.length;
    const vectorProperty = getVectorPropertyName(dimension);
    const queryVectorString = `[${queryVector.join(', ')}]`;
    const result = await conn.query(`
      MATCH (s:Sound)
      WHERE s.${vectorProperty} IS NOT NULL AND s.primary_embedding_type = '${featureType}'
      WITH s, vector_cosine_similarity(s.${vectorProperty}, ${queryVectorString}) as similarity
      WHERE similarity >= ${threshold}
      RETURN s.id, s.name, s.elite_class, s.score, similarity
      ORDER BY similarity DESC
      LIMIT ${limit}
    `);
    return await result.getAll();
  } catch (error) {
    console.error('Error finding similar sounds:', error);
    throw error;
  }
}

export async function getDatabaseStatsWithFeatures(dbPath) {
  try {
    const { conn } = await getOrCreateHandle(dbPath);
    installExitHookOnce();
    const soundCount = await conn.query('MATCH (s:Sound) RETURN count(s) as count');
    const soundResult = await soundCount.getAll();
    const relCount = await conn.query('MATCH ()-[r:PARENT_OF]->() RETURN count(r) as count');
    const relResult = await relCount.getAll();
    const featureTypes = await conn.query('MATCH (s:Sound) WHERE s.feature_type IS NOT NULL RETURN s.feature_type, count(s) as count');
    const featureTypeResult = await featureTypes.getAll();
    const vectorStats = {};
    for (const d of [96,128,512]) {
      const prop = getVectorPropertyName(d);
      try { const r = await conn.query(`MATCH (s:Sound) WHERE s.${prop} IS NOT NULL RETURN count(s) as count`); const rows = await r.getAll(); vectorStats[`${d}D`] = rows[0].count; } catch { vectorStats[`${d}D`] = 0; }
    }
    return {
      sounds: soundResult[0].count,
      relationships: relResult[0].count,
      feature_types: featureTypeResult.reduce((acc, item) => { acc[item.feature_type] = item.count; return acc; }, {}),
      vector_dimensions: vectorStats,
    };
  } catch (error) {
    console.error('Error getting database stats with features:', error);
    throw error;
  }
}
