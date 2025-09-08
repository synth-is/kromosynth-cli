import fs from 'fs';
import path from 'path';
import { getEvoRunDirPath } from './util/qd-common.js';
import { readCellFeaturesFromDiskForEliteMap } from './util/sqlite-persistence-provider.js';

/**
 * Enhanced KuzuDB integration with feature vector support
 */

export async function initializeKuzuDBWithFeatures(dbPath, vectorDimensions = [96, 128, 512]) {
  console.log(`Initializing enhanced KuzuDB with feature vectors at: ${dbPath}`);
  
  try {
    const kuzu = await import('kuzu');
    
    // Clean up existing database
    if (fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { recursive: true, force: true });
      const walPath = dbPath.replace(/\.kuzu$/, '.wal');
      if (fs.existsSync(walPath)) {
        fs.rmSync(walPath, { force: true });
      }
    }
    
    // Create database connection
    const db = new kuzu.Database(dbPath);
    const conn = new kuzu.Connection(db);
    
    // Build dynamic schema with vector properties
    let createNodeQuery = `CREATE NODE TABLE Sound(
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
      feature_dimension INT64`;
    
    // Add vector properties for each dimension
    for (const dim of vectorDimensions) {
      createNodeQuery += `,\n      features_${dim} FLOAT[${dim}]`;
    }
    
    createNodeQuery += `\n    )`;
    
    console.log('Creating enhanced schema with vector dimensions:', vectorDimensions);
    await conn.query(createNodeQuery);
    await conn.query("CREATE REL TABLE PARENT_OF(FROM Sound TO Sound, method STRING)");
    
    // Create vector indexes for each dimension
    for (const dim of vectorDimensions) {
      await conn.query(`CREATE VECTOR INDEX ON Sound.features_${dim}`);
      console.log(`Created vector index for features_${dim}`);
    }
    
    // Explicit connection cleanup
    if (typeof conn.close === 'function') {
      conn.close();
    }
    if (typeof db.close === 'function') {
      db.close();
    }
    
    console.log(`Enhanced KuzuDB initialized successfully with vector dimensions: ${vectorDimensions.join(', ')}`);
    
    return { 
      dbPath,
      vectorDimensions,
      metadata: { schema_version: '2.0', feature_support: true }
    };
    
  } catch (error) {
    console.error('Error initializing enhanced KuzuDB:', error);
    throw error;
  }
}

export async function extendSchemaForNewDimension(dbPath, newDimension) {
  console.log(`Extending schema for new vector dimension: ${newDimension}`);
  
  try {
    const kuzu = await import('kuzu');
    const db = new kuzu.Database(dbPath);
    const conn = new kuzu.Connection(db);
    
    // Add new vector property
    await conn.query(`ALTER TABLE Sound ADD features_${newDimension} FLOAT[${newDimension}]`);
    await conn.query(`CREATE VECTOR INDEX ON Sound.features_${newDimension}`);
    
    console.log(`Successfully added features_${newDimension} property with vector index`);
    
    // Cleanup
    if (typeof conn.close === 'function') {
      conn.close();
    }
    if (typeof db.close === 'function') {
      db.close();
    }
    
    return true;
    
  } catch (error) {
    console.error(`Error extending schema for dimension ${newDimension}:`, error);
    throw error;
  }
}

export async function populateKuzuDBWithLineageAndFeatures(evoRunConfig, evoRunId, lineageData, options = {}) {
  const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
  const dbPath = options.dbPath || path.join(evoRunDirPath, `${evoRunId}.kuzu`);
  
  console.log(`Populating enhanced KuzuDB for ${evoRunId}...`);
  
  try {
    const kuzu = await import('kuzu');
    
    // Load feature data from SQLite
    console.log('Loading feature data from SQLite...');
    const featureData = await loadFeatureDataForGenomes(evoRunDirPath, evoRunId, lineageData);
    
    // Analyze feature dimensions
    const detectedDimensions = analyzeFeatureDimensions(featureData);
    console.log('Detected feature dimensions:', detectedDimensions);
    
    // Initialize or extend schema as needed
    let vectorDimensions = [96, 128, 512]; // Default dimensions
    if (detectedDimensions.length > 0) {
      const newDimensions = detectedDimensions.filter(dim => !vectorDimensions.includes(dim));
      if (newDimensions.length > 0) {
        vectorDimensions = [...vectorDimensions, ...newDimensions];
        console.log('Extended vector dimensions:', vectorDimensions);
      }
    }
    
    // Check if database exists, if not initialize it
    if (!fs.existsSync(dbPath)) {
      await initializeKuzuDBWithFeatures(dbPath, vectorDimensions);
    } else {
      // Extend existing schema for new dimensions
      for (const newDim of detectedDimensions.filter(dim => ![96, 128, 512].includes(dim))) {
        try {
          await extendSchemaForNewDimension(dbPath, newDim);
        } catch (error) {
          console.warn(`Could not add dimension ${newDim}, it may already exist:`, error.message);
        }
      }
    }
    
    // Connect to database
    const db = new kuzu.Database(dbPath);
    const conn = new kuzu.Connection(db);
    
    console.log('Inserting sounds with feature vectors...');
    let soundsWithFeatures = 0;
    let soundsWithoutFeatures = 0;
    
    for (const genome of lineageData) {
      // Extract basic genome attributes
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
      
      // Get feature data for this genome
      const genomeFeatures = featureData[id];
      
      if (genomeFeatures) {
        // Genome has feature data
        const featureType = Object.keys(genomeFeatures)[0]; // e.g., "mfcc-sans0"
        const features = genomeFeatures[featureType]?.features;
        
        if (features && Array.isArray(features)) {
          const dimension = features.length;
          const featureArray = features.map(f => parseFloat(f)).join(',');
          
          // Build insert query with feature vector
          let insertQuery = `CREATE (u:Sound {
            id: '${id}', 
            name: '${name}', 
            elite_class: '${elite_class}', 
            generation: ${generation}, 
            score: ${score}, 
            count: ${count}, 
            uBC: ${uBC}, 
            duration: ${duration}, 
            noteDelta: ${noteDelta}, 
            velocity: ${velocity},
            feature_type: '${featureType}',
            feature_dimension: ${dimension},
            features_${dimension}: [${featureArray}]
          })`;
          
          await conn.query(insertQuery);
          soundsWithFeatures++;
          
          console.log(`✅ Sound ${id} inserted with ${featureType} features (${dimension}D)`);
        } else {
          // Genome has feature record but no valid feature array
          await insertGenomeWithoutFeatures(conn, {
            id, name, elite_class, generation, score, count, uBC, duration, noteDelta, velocity
          });
          soundsWithoutFeatures++;
        }
      } else {
        // Genome has no feature data
        await insertGenomeWithoutFeatures(conn, {
          id, name, elite_class, generation, score, count, uBC, duration, noteDelta, velocity
        });
        soundsWithoutFeatures++;
      }
    }
    
    console.log('Inserting relationships...');
    let relationshipCount = 0;
    for (const genome of lineageData) {
      if (genome.parents && genome.parents.length > 0) {
        for (const parent of genome.parents) {
          await conn.query(`MATCH (u1:Sound), (u2:Sound) WHERE u1.id = '${parent.genomeId || parent.id}' AND u2.id = '${genome.id}' CREATE (u1)-[:PARENT_OF {method: '${parent.breedingMethod || 'unknown'}'}]->(u2)`);
          relationshipCount++;
        }
      }
    }
    
    // Verify results
    const verifyResult = await conn.query('MATCH (s:Sound) RETURN count(s) as count');
    const verifyData = await verifyResult.getAll();
    
    const featureVerifyResult = await conn.query('MATCH (s:Sound) WHERE s.feature_type IS NOT NULL RETURN count(s) as count');
    const featureVerifyData = await featureVerifyResult.getAll();
    
    console.log(`Verification: ${verifyData[0].count} total sounds, ${featureVerifyData[0].count} with features`);
    
    // Cleanup connections
    if (typeof conn.close === 'function') {
      conn.close();
    }
    if (typeof db.close === 'function') {
      db.close();
    }
    
    console.log('Successfully populated enhanced KuzuDB with feature vectors');
    
    return {
      success: true,
      dbPath,
      vectorDimensions: detectedDimensions,
      stats: { 
        total_sounds: lineageData.length,
        sounds_with_features: soundsWithFeatures,
        sounds_without_features: soundsWithoutFeatures,
        total_parent_relationships: relationshipCount,
        feature_dimensions: detectedDimensions
      }
    };
    
  } catch (error) {
    console.error('Error populating enhanced KuzuDB:', error);
    throw error;
  }
}

async function insertGenomeWithoutFeatures(conn, genomeData) {
  const { id, name, elite_class, generation, score, count, uBC, duration, noteDelta, velocity } = genomeData;
  
  const insertQuery = `CREATE (u:Sound {
    id: '${id}', 
    name: '${name}', 
    elite_class: '${elite_class}', 
    generation: ${generation}, 
    score: ${score}, 
    count: ${count}, 
    uBC: ${uBC}, 
    duration: ${duration}, 
    noteDelta: ${noteDelta}, 
    velocity: ${velocity}
  })`;
  
  await conn.query(insertQuery);
  console.log(`✅ Sound ${id} inserted without features`);
}

async function loadFeatureDataForGenomes(evoRunDirPath, evolutionRunId, lineageData) {
  const featureData = {};
  
  try {
    // Check if features.sqlite exists
    const featuresDbPath = path.join(evoRunDirPath, 'features.sqlite');
    if (!fs.existsSync(featuresDbPath)) {
      console.warn(`No features.sqlite found at ${featuresDbPath}`);
      return featureData;
    }
    
    // For this implementation, we'll need to create a minimal elite map structure
    // to use with the existing readCellFeaturesFromDiskForEliteMap function
    
    // Create a mock elite map structure from lineage data
    const mockEliteMap = {
      cells: {}
    };
    
    // Group genomes by their elite class to create mock cells
    const genomesByClass = {};
    for (const genome of lineageData) {
      const eliteClass = genome.class || genome.eliteClass || 'unknown';
      if (!genomesByClass[eliteClass]) {
        genomesByClass[eliteClass] = [];
      }
      genomesByClass[eliteClass].push(genome);
    }
    
    // Create mock cells
    Object.keys(genomesByClass).forEach((eliteClass, index) => {
      const cellKey = `${index}_${index}`; // Mock cell key
      const genomes = genomesByClass[eliteClass];
      // Use the most recent genome for each class
      const latestGenome = genomes.reduce((latest, current) => 
        (current.gN || 0) > (latest.gN || 0) ? current : latest
      );
      
      mockEliteMap.cells[cellKey] = {
        elts: [{
          g: latestGenome.id,
          s: latestGenome.s || 0,
          gN: latestGenome.gN || 0
        }]
      };
    });
    
    // Use the existing function to read features
    const cellFeatures = await readCellFeaturesFromDiskForEliteMap(evoRunDirPath, evolutionRunId, mockEliteMap);
    
    // Map cell features back to individual genomes
    for (const cellKey in cellFeatures) {
      const cell = mockEliteMap.cells[cellKey];
      if (cell && cell.elts && cell.elts.length > 0) {
        const genomeId = cell.elts[0].g;
        featureData[genomeId] = cellFeatures[cellKey];
      }
    }
    
    console.log(`Loaded feature data for ${Object.keys(featureData).length} genomes`);
    
  } catch (error) {
    console.error('Error loading feature data:', error);
  }
  
  return featureData;
}

function analyzeFeatureDimensions(featureData) {
  const dimensions = new Set();
  
  for (const genomeId in featureData) {
    const genomeFeatures = featureData[genomeId];
    for (const featureType in genomeFeatures) {
      const features = genomeFeatures[featureType]?.features;
      if (features && Array.isArray(features)) {
        dimensions.add(features.length);
      }
    }
  }
  
  return Array.from(dimensions).sort((a, b) => a - b);
}

// Vector search capabilities
export async function vectorSearchSimilar(dbPath, targetFeatures, featureDimension, topK = 10, featureType = null) {
  try {
    const kuzu = await import('kuzu');
    const db = new kuzu.Database(dbPath);
    const conn = new kuzu.Connection(db);
    
    const targetArray = targetFeatures.map(f => parseFloat(f)).join(',');
    
    let whereClause = '';
    if (featureType) {
      whereClause = `WHERE s.feature_type = '${featureType}'`;
    }
    
    const query = `
      MATCH (s:Sound) 
      ${whereClause}
      WHERE s.features_${featureDimension} IS NOT NULL
      RETURN s.id, s.name, s.elite_class, s.feature_type, s.score,
             array_cosine_similarity(s.features_${featureDimension}, [${targetArray}]) as similarity
      ORDER BY similarity DESC
      LIMIT ${topK}
    `;
    
    const result = await conn.query(query);
    const data = await result.getAll();
    
    // Cleanup
    if (typeof conn.close === 'function') conn.close();
    if (typeof db.close === 'function') db.close();
    
    return data;
    
  } catch (error) {
    console.error('Error performing vector search:', error);
    throw error;
  }
}

export async function getFeatureStats(dbPath) {
  try {
    const kuzu = await import('kuzu');
    const db = new kuzu.Database(dbPath);
    const conn = new kuzu.Connection(db);
    
    // Get overall stats
    const overallStats = await conn.query(`
      MATCH (s:Sound) 
      RETURN 
        count(s) as total_sounds,
        count(s.feature_type) as sounds_with_features,
        count(DISTINCT s.feature_type) as unique_feature_types,
        count(DISTINCT s.feature_dimension) as unique_dimensions
    `);
    const overall = await overallStats.getAll();
    
    // Get breakdown by feature type
    const typeStats = await conn.query(`
      MATCH (s:Sound) 
      WHERE s.feature_type IS NOT NULL
      RETURN s.feature_type, s.feature_dimension, count(s) as count
      ORDER BY s.feature_type, s.feature_dimension
    `);
    const types = await typeStats.getAll();
    
    // Cleanup
    if (typeof conn.close === 'function') conn.close();
    if (typeof db.close === 'function') db.close();
    
    return {
      overall: overall[0],
      by_type: types
    };
    
  } catch (error) {
    console.error('Error getting feature stats:', error);
    throw error;
  }
}
