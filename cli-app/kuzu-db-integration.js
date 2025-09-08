import fs from 'fs';
import path from 'path';
import { getEvoRunDirPath } from './util/qd-common.js';

/**
 * KuzuDB integration using proven Node.js SDK pattern with proper connection management
 */

export async function initializeKuzuDB(dbPath) {
  console.log(`Initializing KuzuDB at: ${dbPath}`);
  
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
    
    // Use exact pattern from working test
    const db = new kuzu.Database(dbPath);
    const conn = new kuzu.Connection(db);
    
    // Create schema using exact documentation pattern
    await conn.query("CREATE NODE TABLE Sound(id STRING PRIMARY KEY, name STRING, elite_class STRING, generation INT64, score DOUBLE)");
    await conn.query("CREATE REL TABLE PARENT_OF(FROM Sound TO Sound, method STRING)");
    
    // Explicit connection management
    if (typeof conn.close === 'function') {
      conn.close();
    }
    if (typeof db.close === 'function') {
      db.close();
    }
    
    console.log(`KuzuDB initialized successfully at: ${dbPath}`);
    
    return { 
      dbPath,
      metadata: { schema_version: '1.0' }
    };
    
  } catch (error) {
    console.error('Error initializing KuzuDB:', error);
    throw error;
  }
}

export async function populateKuzuDBWithLineage(evoRunConfig, evoRunId, lineageData, options = {}) {
  const evoRunDirPath = getEvoRunDirPath(evoRunConfig, evoRunId);
  const dbPath = options.dbPath || path.join(evoRunDirPath, `${evoRunId}.kuzu`);
  
  console.log(`Populating KuzuDB for ${evoRunId}...`);
  
  try {
    const kuzu = await import('kuzu');
    
    // Use exact pattern from working test
    const db = new kuzu.Database(dbPath);
    const conn = new kuzu.Connection(db);
    
    console.log('Inserting sounds...');
    for (const genome of lineageData) {
      // Use exact CREATE pattern from documentation
      await conn.query(`CREATE (u:Sound {id: '${genome.id}', name: '${genome.eliteClass || 'sound'}', elite_class: '${genome.eliteClass || 'unknown'}', generation: ${genome.gN || 0}, score: ${genome.s || 0.0}})`);
      console.log(`✅ Sound ${genome.id} inserted`);
    }
    
    console.log('Inserting relationships...');
    let relationshipCount = 0;
    for (const genome of lineageData) {
      if (genome.parents && genome.parents.length > 0) {
        for (const parent of genome.parents) {
          // Use exact MATCH + CREATE pattern from documentation
          await conn.query(`MATCH (u1:Sound), (u2:Sound) WHERE u1.id = '${parent.genomeId || parent.id}' AND u2.id = '${genome.id}' CREATE (u1)-[:PARENT_OF {method: '${parent.breedingMethod || 'unknown'}'}]->(u2)`);
          relationshipCount++;
          console.log(`✅ Relationship ${parent.genomeId || parent.id} -> ${genome.id} inserted`);
        }
      }
    }
    
    // Verify within same connection (like working test)
    const verifyResult = await conn.query('MATCH (s:Sound) RETURN count(s) as count');
    const verifyData = await verifyResult.getAll();
    console.log(`Verification: ${verifyData[0].count} sounds inserted`);
    
    // Explicit connection management (like working test)
    if (typeof conn.close === 'function') {
      conn.close();
    }
    if (typeof db.close === 'function') {
      db.close();
    }
    
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
    const kuzu = await import('kuzu');
    const db = new kuzu.Database(dbPath);
    const conn = new kuzu.Connection(db);
    
    const result = await conn.query(`MATCH (ancestor:Sound)-[:PARENT_OF*1..${maxDepth}]->(descendants:Sound) WHERE ancestor.id = '${soundId}' RETURN descendants.id, descendants.name ORDER BY descendants.id`);
    const data = await result.getAll();
    
    // Explicit cleanup
    if (typeof conn.close === 'function') conn.close();
    if (typeof db.close === 'function') db.close();
    
    return data;
    
  } catch (error) {
    console.error('Error finding descendants:', error);
    throw error;
  }
}

export async function getDatabaseStats(dbPath) {
  try {
    const kuzu = await import('kuzu');
    const db = new kuzu.Database(dbPath);
    const conn = new kuzu.Connection(db);
    
    const soundCount = await conn.query('MATCH (s:Sound) RETURN count(s) as count');
    const soundResult = await soundCount.getAll();
    
    const relCount = await conn.query('MATCH ()-[r:PARENT_OF]->() RETURN count(r) as count');
    const relResult = await relCount.getAll();
    
    // Explicit cleanup
    if (typeof conn.close === 'function') conn.close();
    if (typeof db.close === 'function') db.close();
    
    return {
      sounds: soundResult[0].count,
      relationships: relResult[0].count
    };
    
  } catch (error) {
    console.error('Error getting database stats:', error);
    throw error;
  }
}
