// genomeDB.js - Connection pooling for multiple databases
import Database from 'better-sqlite3';
import zlib from 'zlib';
import path from 'path';
import { promisify } from 'util';
const gunzip = promisify(zlib.gunzip);

// Connection pool for databases
const dbPool = new Map();
const DB_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// Get database for a specific run
export function getRunDBs(runPath) {
  const poolKey = runPath;
  
  if (dbPool.has(poolKey)) {
    const entry = dbPool.get(poolKey);
    clearTimeout(entry.timeout);
    entry.timeout = setTimeout(() => closeRunDBs(poolKey), DB_TIMEOUT);
    return entry.api;
  }
  
  // Open the databases
  const genomesDbPath = path.join(runPath, 'genomes.sqlite');
  const featuresDbPath = path.join(runPath, 'features.sqlite');
  
  const genomesDb = new Database(genomesDbPath, { readonly: true });
  const featuresDb = new Database(featuresDbPath, { readonly: true });
  
  // Optimize for read performance
  for (const db of [genomesDb, featuresDb]) {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = 5000');
  }
  
  // Prepare statements
  const getGenome = genomesDb.prepare('SELECT data FROM genomes WHERE id = ?');
  const getFeature = featuresDb.prepare('SELECT data FROM features WHERE id = ?');
  
  // Create API
  const api = {
    async getGenome(id) {
      const row = getGenome.get(id);
      if (!row) return null;
      
      try {
        const jsonData = await gunzip(row.data);
        return JSON.parse(jsonData);
      } catch (err) {
        console.error(`Error decompressing genome ${id}`, err);
        return null;
      }
    },
    
    async getFeature(id) {
      const row = getFeature.get(id);
      if (!row) return null;
      
      try {
        const jsonData = await gunzip(row.data);
        return JSON.parse(jsonData);
      } catch (err) {
        console.error(`Error decompressing feature ${id}`, err);
        return null;
      }
    },
    
    getGenomeSync(id) {
      const row = getGenome.get(id);
      if (!row) return null;
      
      try {
        const jsonData = zlib.gunzipSync(row.data);
        return JSON.parse(jsonData);
      } catch (err) {
        console.error(`Error decompressing genome ${id}`, err);
        return null;
      }
    },
    
    getFeatureSync(id) {
      const row = getFeature.get(id);
      if (!row) return null;
      
      try {
        const jsonData = zlib.gunzipSync(row.data);
        return JSON.parse(jsonData);
      } catch (err) {
        console.error(`Error decompressing feature ${id}`, err);
        return null;
      }
    },
    
    close() {
      genomesDb.close();
      featuresDb.close();
    }
  };
  
  // Add to pool
  const timeout = setTimeout(() => closeRunDBs(poolKey), DB_TIMEOUT);
  dbPool.set(poolKey, { 
    api, 
    databases: { genomesDb, featuresDb }, 
    timeout 
  });
  
  console.log(`Opened database connections for ${runPath}`);
  return api;
}

function closeRunDBs(poolKey) {
  if (dbPool.has(poolKey)) {
    const entry = dbPool.get(poolKey);
    clearTimeout(entry.timeout);
    entry.databases.genomesDb.close();
    entry.databases.featuresDb.close();
    dbPool.delete(poolKey);
    console.log(`Closed idle database connections for ${poolKey}`);
  }
}

// Clean up connections on process exit
process.on('exit', () => {
  for (const [poolKey, entry] of dbPool.entries()) {
    clearTimeout(entry.timeout);
    entry.databases.genomesDb.close();
    entry.databases.featuresDb.close();
  }
});