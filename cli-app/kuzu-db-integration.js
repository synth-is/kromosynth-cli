import fs from 'fs';
import path from 'path';
import { getEvoRunDirPath } from './util/qd-common.js';
import { SQLitePersistenceProvider } from './util/sqlite-persistence-provider.js';

/**
 * Unified KuzuDB integration with feature vector support
 */

export async function initializeKuzuDBWithFeatures(dbPath, detectedFeatureDimensions = new Set()) {
  console.log(`Initializing KuzuDB with feature support at: ${dbPath}`);
  
  try {
    const kuzu = await import('kuzu');
    // Allow opting-in to index creation via env flag; default off to avoid parser errors on some Kùzu versions
    const ENABLE_PROPERTY_INDEXES = process.env.KUZU_CREATE_INDEX === '1';
    
    // Clean up existing database
    if (fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { recursive: true, force: true });
      const walPath = dbPath.replace(/\.kuzu$/, '.wal');
      if (fs.existsSync(walPath)) {
        fs.rmSync(walPath, { force: true });
      }
    }
    
    // Create DB + connection
    const db = new kuzu.Database(dbPath);
    const conn = new kuzu.Connection(db);
    
    // Base schema with common vector dimensions
    const knownDimensions = [96, 128, 512];
    const allDimensions = new Set([...knownDimensions, ...detectedFeatureDimensions]);
    
    // Dynamic vector properties
    const vectorProperties = Array.from(allDimensions)
      .sort((a, b) => a - b)
      .map(dim => `audio_features_${dim} FLOAT[${dim}]`)
      .join(', ');
    
    const baseProperties = `
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
      ${vectorProperties ? vectorProperties + ',' : ''}
      feature_type STRING,
      feature_dimension INT64 DEFAULT 0,
      primary_embedding_type STRING DEFAULT 'mfcc-sans0'
    `;
    
    await conn.query(`CREATE NODE TABLE Sound(${baseProperties})`);
    await conn.query("CREATE REL TABLE PARENT_OF(FROM Sound TO Sound, method STRING)");
    
    // Optional indexes (disabled by default)
    if (ENABLE_PROPERTY_INDEXES) {
      for (const dim of allDimensions) {
        try {
          await conn.query(`CREATE INDEX ON Sound.audio_features_${dim}`);
          console.log(`✅ Created index for dimension ${dim}`);
        } catch (error) {
          console.warn(`⚠️ Could not create index for dimension ${dim}:`, error.message);
        }
      }
    } else {
      console.log('ℹ️ Skipping index creation for vector properties (set KUZU_CREATE_INDEX=1 to enable)');
    }
    
    if (typeof conn.close === 'function') conn.close();
    if (typeof db.close === 'function') db.close();
    
    console.log(`KuzuDB initialized successfully with vector support for dimensions: ${Array.from(allDimensions).sort((a, b) => a - b).join(', ')}`);
    
    return { 
      dbPath,
      supportedDimensions: Array.from(allDimensions),
      metadata: { schema_version: '2.0', feature_support: true }
    };
    
  } catch (error) {
    console.error('Error initializing KuzuDB with features:', error);
    throw error;
  }
}

// Internal: extend schema for any new vector dimension not present at init time
async function extendSchemaForNewDimension(dbPath, dimension) {
  const kuzu = await import('kuzu');
  const db = new kuzu.Database(dbPath);
  const conn = new kuzu.Connection(db);
  try {
    await conn.query(`ALTER TABLE Sound ADD ${getVectorPropertyName(dimension)} FLOAT[${dimension}]`);
    const ENABLE_PROPERTY_INDEXES = process.env.KUZU_CREATE_INDEX === '1';
    if (ENABLE_PROPERTY_INDEXES) {
      try {
        await conn.query(`CREATE INDEX ON Sound.${getVectorPropertyName(dimension)}`);
      } catch (e) {
        console.warn(`⚠️ Could not create index for ${dimension}D: ${e.message}`);
      }
    }
    console.log(`✅ Extended schema for ${dimension}D vectors`);
  } catch (err) {
    console.warn(`⚠️ Could not extend schema for ${dimension}D: ${err.message}`);
  } finally {
    if (typeof conn.close === 'function') conn.close();
    if (typeof db.close === 'function') db.close();
  }
}

/**
 * Detect feature dimensions from evolution run data
 */
export async function detectFeatureDimensions(evoRunConfig, evoRunId) {
  console.log('Detecting feature dimensions...');
  
  try {
    const persistenceProvider = new SQLitePersistenceProvider();
    const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
    
    // Read available feature genome IDs
    const featureGenomeIds = await persistenceProvider.listAllFeatureGenomeIds(evoRunDirPath);
    
    if (featureGenomeIds.length === 0) {
      console.log('No feature data found, using default dimensions');
      return new Set([96, 128, 512]);
    }
    
    // Sample a few genomes to detect dimensions
    const sampleSize = Math.min(5, featureGenomeIds.length);
    const sampleIds = featureGenomeIds.slice(0, sampleSize);
    
    const detectedDimensions = new Set();
    
    for (const genomeId of sampleIds) {
      try {
        const features = await persistenceProvider.readFeaturesForGenomeIdsFromDisk(
          evoRunDirPath, evoRunId, [genomeId]
        );
        
        if (features[genomeId]) {
          for (const [featureType, featureData] of Object.entries(features[genomeId])) {
            if (featureData && featureData.features && Array.isArray(featureData.features)) {
              const dimension = featureData.features.length;
              detectedDimensions.add(dimension);
              console.log(`🔍 Detected ${featureType}: ${dimension}D vector`);
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ Could not read features for genome ${genomeId}:`, error.message);
      }
    }
    
    console.log(`Detected feature dimensions: ${Array.from(detectedDimensions).sort((a, b) => a - b).join(', ')}`);
    return detectedDimensions;
    
  } catch (error) {
    console.error('Error detecting feature dimensions:', error);
    return new Set([96, 128, 512]);
  }
}

function getVectorPropertyName(dimension) {
  return `audio_features_${dimension}`;
}

/**
 * Populate DB with lineage and features
 */
export async function populateKuzuDBWithLineageAndFeatures(evoRunConfig, evoRunId, lineageData, options = {}) {
  const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
  const dbPath = options.dbPath || path.join(evoRunDirPath, `${evoRunId}.kuzu`);
  
  console.log(`Populating KuzuDB with lineage and features for ${evoRunId}...`);
  
  try {
    // Detect initial dimensions and initialize DB
    const detectedDimensionsInitial = await detectFeatureDimensions(evoRunConfig, evoRunId);
    const initResult = await initializeKuzuDBWithFeatures(dbPath, detectedDimensionsInitial);
    
    const kuzu = await import('kuzu');
    const db = new kuzu.Database(dbPath);
    const conn = new kuzu.Connection(db);
    
    // Read features
    const persistenceProvider = new SQLitePersistenceProvider();
    const genomeIds = lineageData.map(genome => genome.id).filter(id => id);
    console.log(`📊 Reading features for ${genomeIds.length} genomes...`);
    const allFeatures = await persistenceProvider.readFeaturesForGenomeIdsFromDisk(
      evoRunDirPath, evoRunId, genomeIds
    );
    console.log(`📊 Successfully read features for ${Object.keys(allFeatures).length} genomes`);

    // Ensure schema covers observed dimensions
    const observedDims = new Set();
    for (const [, featsByType] of Object.entries(allFeatures)) {
      for (const [, fdata] of Object.entries(featsByType)) {
        if (fdata && Array.isArray(fdata.features)) observedDims.add(fdata.features.length);
      }
    }
    const supported = new Set(initResult.supportedDimensions || []);
    const missingDims = Array.from(observedDims).filter(d => !supported.has(d));
    if (missingDims.length) {
      console.log(`📐 Extending schema for new dimensions: ${missingDims.join(', ')}`);
      for (const d of missingDims) {
        await extendSchemaForNewDimension(dbPath, d);
        supported.add(d);
      }
    }
    
    console.log('Inserting sounds with features...');
    let soundsInserted = 0;
    
    for (const genome of lineageData) {
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
      
      const featureVectors = {};
      let primaryFeatureType = 'unknown';
      
      if (allFeatures[id]) {
        for (const [featureType, featureData] of Object.entries(allFeatures[id])) {
          if (featureData && featureData.features && Array.isArray(featureData.features)) {
            const dimension = featureData.features.length;
            const vectorProperty = getVectorPropertyName(dimension);
            const vectorString = `[${featureData.features.join(', ')}]`;
            featureVectors[vectorProperty] = vectorString;
            if (primaryFeatureType === 'unknown' || featureType === 'mfcc-sans0') {
              primaryFeatureType = featureType;
            }
          }
        }
      }
      
      let primaryDimension = 0;
      if (allFeatures[id] && allFeatures[id][primaryFeatureType] && Array.isArray(allFeatures[id][primaryFeatureType].features)) {
        primaryDimension = allFeatures[id][primaryFeatureType].features.length;
      } else {
        const first = Object.values(allFeatures[id] || {}).find(v => v && Array.isArray(v.features));
        primaryDimension = first ? first.features.length : 0;
      }

      const baseColumns = ['id', 'name', 'elite_class', 'generation', 'score', 'count', 'uBC', 'duration', 'noteDelta', 'velocity', 'feature_type', 'feature_dimension', 'primary_embedding_type'];
      const baseValues = [`'${id}'`, `'${name}'`, `'${elite_class}'`, generation, score, count, uBC, duration, noteDelta, velocity, `'${primaryFeatureType}'`, primaryDimension, `'${primaryFeatureType}'`];
      const vectorColumns = Object.keys(featureVectors);
      const vectorValues = Object.values(featureVectors);
      const allColumns = [...baseColumns, ...vectorColumns];
      const allValues = [...baseValues, ...vectorValues];
      const insertQuery = `CREATE (u:Sound {${allColumns.map((col, idx) => `${col}: ${allValues[idx]}`).join(', ')}})`;
      
      try {
        await conn.query(insertQuery);
        soundsInserted++;
        const vectorInfo = vectorColumns.length > 0 ? ` [${vectorColumns.join(', ')}]` : ' [no vectors]';
        console.log(`✅ Sound ${id} inserted (class: ${elite_class}, gen: ${generation}, score: ${score.toFixed(3)})${vectorInfo}`);
      } catch (error) {
        console.error(`❌ Error inserting sound ${id}:`, error.message);
      }
    }
    
    console.log('Inserting relationships...');
    let relationshipCount = 0;
    for (const genome of lineageData) {
      if (genome.parents && genome.parents.length > 0) {
        for (const parent of genome.parents) {
          try {
            await conn.query(`
              MATCH (u1:Sound), (u2:Sound) 
              WHERE u1.id = '${parent.genomeId || parent.id}' AND u2.id = '${genome.id}' 
              CREATE (u1)-[:PARENT_OF {method: '${parent.breedingMethod || 'unknown'}'}]->(u2)
            `);
            relationshipCount++;
            console.log(`✅ Relationship ${parent.genomeId || parent.id} -> ${genome.id} inserted`);
          } catch (error) {
            console.error(`❌ Error inserting relationship ${parent.genomeId || parent.id} -> ${genome.id}:`, error.message);
          }
        }
      }
    }
    
    const verifyResult = await conn.query('MATCH (s:Sound) RETURN count(s) as count');
    const verifyData = await verifyResult.getAll();
    
    const featureStats = {};
    for (const dim of initResult.supportedDimensions) {
      const vectorProperty = getVectorPropertyName(dim);
      try {
        const featResult = await conn.query(`MATCH (s:Sound) WHERE s.${vectorProperty} IS NOT NULL RETURN count(s) as count`);
        const featData = await featResult.getAll();
        featureStats[`${dim}D_vectors`] = featData[0].count;
      } catch {
        featureStats[`${dim}D_vectors`] = 0;
      }
    }
    
    if (typeof conn.close === 'function') conn.close();
    if (typeof db.close === 'function') db.close();
    
    console.log('✅ Successfully populated KuzuDB with features');
    console.log(`   Database: ${dbPath}`);
    console.log(`   Sounds: ${verifyData[0].count} (${soundsInserted} inserted)`);
    console.log(`   Relationships: ${relationshipCount}`);
    console.log(`   Feature vectors:`, featureStats);
    
    return {
      success: true,
      dbPath,
      stats: { 
        total_sounds: verifyData[0].count,
        sounds_inserted: soundsInserted,
        total_parent_relationships: relationshipCount,
        feature_vectors: featureStats,
        supported_dimensions: initResult.supportedDimensions
      }
    };
    
  } catch (error) {
    console.error('Error populating KuzuDB with features:', error);
    throw error;
  }
}

export async function findSimilarSounds(dbPath, queryVector, featureType = 'mfcc-sans0', limit = 10, threshold = 0.8) {
  try {
    const kuzu = await import('kuzu');
    const db = new kuzu.Database(dbPath);
    const conn = new kuzu.Connection(db);
    
    const dimension = queryVector.length;
    const vectorProperty = getVectorPropertyName(dimension);
    const queryVectorString = `[${queryVector.join(', ')}]`;
    
    const result = await conn.query(`
      MATCH (s:Sound) 
      WHERE s.${vectorProperty} IS NOT NULL 
        AND s.primary_embedding_type = '${featureType}'
      WITH s, vector_cosine_similarity(s.${vectorProperty}, ${queryVectorString}) as similarity
      WHERE similarity >= ${threshold}
      RETURN s.id, s.name, s.elite_class, s.score, similarity
      ORDER BY similarity DESC
      LIMIT ${limit}
    `);
    
    const similarSounds = await result.getAll();
    if (typeof conn.close === 'function') conn.close();
    if (typeof db.close === 'function') db.close();
    return similarSounds;
    
  } catch (error) {
    console.error('Error finding similar sounds:', error);
    throw error;
  }
}

export async function getDatabaseStatsWithFeatures(dbPath) {
  try {
    const kuzu = await import('kuzu');
    const db = new kuzu.Database(dbPath);
    const conn = new kuzu.Connection(db);
    
    const soundCount = await conn.query('MATCH (s:Sound) RETURN count(s) as count');
    const soundResult = await soundCount.getAll();
    const relCount = await conn.query('MATCH ()-[r:PARENT_OF]->() RETURN count(r) as count');
    const relResult = await relCount.getAll();
    
    const featureTypes = await conn.query('MATCH (s:Sound) WHERE s.feature_type IS NOT NULL RETURN s.feature_type, count(s) as count');
    const featureTypeResult = await featureTypes.getAll();
    
    const vectorStats = {};
    const commonDimensions = [96, 128, 512];
    for (const dim of commonDimensions) {
      const vectorProperty = getVectorPropertyName(dim);
      try {
        const vectorCount = await conn.query(`MATCH (s:Sound) WHERE s.${vectorProperty} IS NOT NULL RETURN count(s) as count`);
        const vectorResult = await vectorCount.getAll();
        vectorStats[`${dim}D`] = vectorResult[0].count;
      } catch {
        vectorStats[`${dim}D`] = 0;
      }
    }
    
    const generationStats = await conn.query('MATCH (s:Sound) RETURN min(s.generation) as min_gen, max(s.generation) as max_gen, avg(s.generation) as avg_gen');
    const genResult = await generationStats.getAll();
    const scoreStats = await conn.query('MATCH (s:Sound) RETURN min(s.score) as min_score, max(s.score) as max_score, avg(s.score) as avg_score');
    const scoreResult = await scoreStats.getAll();
    const classCount = await conn.query('MATCH (s:Sound) RETURN count(DISTINCT s.elite_class) as unique_classes');
    const classResult = await classCount.getAll();
    
    if (typeof conn.close === 'function') conn.close();
    if (typeof db.close === 'function') db.close();
    
    return {
      sounds: soundResult[0].count,
      relationships: relResult[0].count,
      feature_types: featureTypeResult.reduce((acc, item) => {
        acc[item.feature_type] = item.count;
        return acc;
      }, {}),
      vector_dimensions: vectorStats,
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
    console.error('Error getting database stats with features:', error);
    throw error;
  }
}

// Back-compat API
export async function initializeKuzuDB(dbPath) {
  return initializeKuzuDBWithFeatures(dbPath, new Set());
}

export async function populateKuzuDBWithLineage(evoRunConfig, evoRunId, lineageData, options = {}) {
  return populateKuzuDBWithLineageAndFeatures(evoRunConfig, evoRunId, lineageData, options);
}

export async function findDescendants(dbPath, soundId, maxDepth = 10) {
  const kuzu = await import('kuzu');
  const db = new kuzu.Database(dbPath);
  const conn = new kuzu.Connection(db);
  try {
    const result = await conn.query(`
      MATCH (ancestor:Sound)-[:PARENT_OF*1..${maxDepth}]->(descendants:Sound)
      WHERE ancestor.id = '${soundId}'
      RETURN descendants.id, descendants.name
      ORDER BY descendants.id
    `);
    const data = await result.getAll();
    return data;
  } finally {
    if (typeof conn.close === 'function') conn.close();
    if (typeof db.close === 'function') db.close();
  }
}

export async function getDatabaseStats(dbPath) {
  const kuzu = await import('kuzu');
  const db = new kuzu.Database(dbPath);
  const conn = new kuzu.Connection(db);
  try {
    const soundCount = await conn.query('MATCH (s:Sound) RETURN count(s) as count');
    const soundResult = await soundCount.getAll();
    const relCount = await conn.query('MATCH ()-[r:PARENT_OF]->() RETURN count(r) as count');
    const relResult = await relCount.getAll();
    const generationStats = await conn.query('MATCH (s:Sound) RETURN min(s.generation) as min_gen, max(s.generation) as max_gen, avg(s.generation) as avg_gen');
    const genResult = await generationStats.getAll();
    const scoreStats = await conn.query('MATCH (s:Sound) RETURN min(s.score) as min_score, max(s.score) as max_score, avg(s.score) as avg_score');
    const scoreResult = await scoreStats.getAll();
    const classCount = await conn.query('MATCH (s:Sound) RETURN count(DISTINCT s.elite_class) as unique_classes');
    const classResult = await classCount.getAll();
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
  } finally {
    if (typeof conn.close === 'function') conn.close();
    if (typeof db.close === 'function') db.close();
  }
}
