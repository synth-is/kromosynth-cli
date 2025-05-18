// genome-db.js - Database access module
import Database from 'better-sqlite3';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import fs from 'fs-extra';
const gunzip = promisify(zlib.gunzip);

// Connection pool for databases
const dbPool = new Map();
const DB_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function makeRunDbApi({
  genomesDb,
  featuresDb,
  getGenome,
  getFeature,
  insertGenome,
  insertFeature,
  runPath
}) {
  return {
    async getGenome(id) {
      if (!genomesDb || !getGenome) return null;
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
      if (!featuresDb || !getFeature) return null;
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
      if (!genomesDb || !getGenome) return null;
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
      if (!featuresDb || !getFeature) return null;
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
    async saveGenome(id, genomeData) {
      if (!genomesDb || !insertGenome) return false;
      try {
        let compressedData;
        if (Buffer.isBuffer(genomeData)) {
          compressedData = genomeData;
        } else {
          const jsonData = JSON.stringify(genomeData);
          compressedData = await promisify(zlib.gzip)(jsonData, { level: 9 });
        }
        insertGenome.run(id, compressedData);
        return true;
      } catch (err) {
        console.error(`Error saving genome ${id} to database`, err);
        return false;
      }
    },
    async saveFeature(id, featureData) {
      if (!featuresDb || !insertFeature) return false;
      try {
        let compressedData;
        if (Buffer.isBuffer(featureData)) {
          compressedData = featureData;
        } else {
          const jsonData = JSON.stringify(featureData);
          compressedData = await promisify(zlib.gzip)(jsonData, { level: 9 });
        }
        insertFeature.run(id, compressedData);
        return true;
      } catch (err) {
        console.error(`Error saving feature ${id} to database`, err);
        return false;
      }
    },
    close() {
      if (genomesDb) genomesDb.close();
      if (featuresDb) featuresDb.close();
      if (runPath && dbPool.has(runPath)) {
        dbPool.delete(runPath);
      }
    },
    get hasGenomeDb() {
      return genomesDb !== null;
    },
    get hasFeatureDb() {
      return featuresDb !== null;
    },
    /**
     * List all genome IDs for which features are available in the features DB.
     * Returns an array of genome IDs (as strings).
     */
    async listAllFeatureGenomeIds() {
      if (!featuresDb) return [];
      try {
        const rows = featuresDb.prepare('SELECT id FROM features').all();
        return rows.map(row => row.id);
      } catch (err) {
        console.error('Error listing all feature genome IDs:', err);
        return [];
      }
    }
  };
}

/**
 * Get a database connection for a specific run
 * @param {string} runPath - Path to the evolution run directory
 * @param {Object} [options] - Options object
 * @param {boolean} [options.writable=false] - Open DB in read-write mode if true
 * @returns {Object} Database API object
 */
export function getRunDB(runPath, options = {}) {
  const { writable = false } = options;
  if (dbPool.has(runPath)) {
    const entry = dbPool.get(runPath);
    // If a writable connection is requested but the cached one is not writable, replace it
    if (writable && !entry.writable) {
      clearTimeout(entry.timeout);
      if (entry.genomesDb) entry.genomesDb.close();
      if (entry.featuresDb) entry.featuresDb.close();
      dbPool.delete(runPath);
      // proceed to open a new writable connection below
    } else {
      clearTimeout(entry.timeout);
      entry.timeout = setTimeout(() => closeRunDB(runPath), DB_TIMEOUT);
      return entry.api;
    }
  }
  
  // Check if genome and feature databases exist
  const genomesDbPath = path.join(runPath, 'genomes.sqlite');
  const featuresDbPath = path.join(runPath, 'features.sqlite');
  
  const genomesDbExists = fs.existsSync(genomesDbPath);
  const featuresDbExists = fs.existsSync(featuresDbPath);
  
  if (!genomesDbExists && !featuresDbExists && !writable) {
    return null; // Databases don't exist, will fall back to file-based storage
  }
  
  // Open the databases with appropriate access
  const genomesDb = genomesDbExists || writable
    ? new Database(genomesDbPath, { readonly: !writable })
    : null;
  const featuresDb = featuresDbExists || writable
    ? new Database(featuresDbPath, { readonly: !writable })
    : null;
  
  // Optimize for read performance
  if (genomesDb) {
    genomesDb.pragma('journal_mode = WAL');
    genomesDb.pragma('synchronous = NORMAL');
    genomesDb.pragma('cache_size = 10000');
  }
  
  if (featuresDb) {
    featuresDb.pragma('journal_mode = WAL');
    featuresDb.pragma('synchronous = NORMAL');
    featuresDb.pragma('cache_size = 10000');
  }
  
  // Create tables if writable and DB newly created
  if (writable && genomesDb) {
    genomesDb.exec(`
      CREATE TABLE IF NOT EXISTS genomes (
        id TEXT PRIMARY KEY,
        data BLOB
      );
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  }
  if (writable && featuresDb) {
    featuresDb.exec(`
      CREATE TABLE IF NOT EXISTS features (
        id TEXT PRIMARY KEY,
        data BLOB
      );
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  }
  
  // Prepare statements if databases exist
  const getGenome = genomesDb ? genomesDb.prepare('SELECT data FROM genomes WHERE id = ?') : null;
  const getFeature = featuresDb ? featuresDb.prepare('SELECT data FROM features WHERE id = ?') : null;
  const insertGenome = genomesDb ? genomesDb.prepare('INSERT OR REPLACE INTO genomes (id, data) VALUES (?, ?)') : null;
  const insertFeature = featuresDb ? featuresDb.prepare('INSERT OR REPLACE INTO features (id, data) VALUES (?, ?)') : null;

  // Create API
  const api = makeRunDbApi({
    genomesDb,
    featuresDb,
    getGenome,
    getFeature,
    insertGenome,
    insertFeature,
    runPath
  });
  
  // Add to pool
  const timeout = setTimeout(() => closeRunDB(runPath), DB_TIMEOUT);
  dbPool.set(runPath, { 
    api, 
    genomesDb, 
    featuresDb, 
    timeout,
    writable // track if this connection is writable
  });
  
  console.log(`Opened database connection for ${runPath}`);
  return api;
}

/**
 * Creates new SQLite databases for genomes and features
 * @param {string} runPath - Path to the evolution run directory
 * @returns {Object} Database API object with functions to save genomes and features
 */
export function createRunDB(runPath) {
  if (dbPool.has(runPath)) {
    closeRunDB(runPath);
  }

  // Create database files
  const genomesDbPath = path.join(runPath, 'genomes.sqlite');
  const featuresDbPath = path.join(runPath, 'features.sqlite');
  
  // Create/open genome database
  const genomesDb = new Database(genomesDbPath);
  console.log(`Created/opened genomes database at: ${genomesDbPath}`);
  
  // Create/open features database
  const featuresDb = new Database(featuresDbPath);
  console.log(`Created/opened features database at: ${featuresDbPath}`);
  
  // Configure both databases for performance
  for (const db of [genomesDb, featuresDb]) {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = 10000');
  }
  
  // Create tables
  genomesDb.exec(`
    CREATE TABLE IF NOT EXISTS genomes (
      id TEXT PRIMARY KEY,
      data BLOB
    );
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  
  featuresDb.exec(`
    CREATE TABLE IF NOT EXISTS features (
      id TEXT PRIMARY KEY,
      data BLOB
    );
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  
  // Prepare statements
  const insertGenome = genomesDb.prepare('INSERT OR REPLACE INTO genomes (id, data) VALUES (?, ?)');
  const getGenome = genomesDb.prepare('SELECT data FROM genomes WHERE id = ?');
  const setGenomeMetadata = genomesDb.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)');
  
  const insertFeature = featuresDb.prepare('INSERT OR REPLACE INTO features (id, data) VALUES (?, ?)');
  const getFeature = featuresDb.prepare('SELECT data FROM features WHERE id = ?');
  const setFeatureMetadata = featuresDb.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)');
  
  // Update metadata
  setGenomeMetadata.run('creationDate', new Date().toISOString());
  setFeatureMetadata.run('creationDate', new Date().toISOString());
  
  // Create API
  const api = makeRunDbApi({
    genomesDb,
    featuresDb,
    getGenome,
    getFeature,
    insertGenome,
    insertFeature,
    runPath
  });
  
  // Add to pool
  const timeout = setTimeout(() => closeRunDB(runPath), DB_TIMEOUT);
  dbPool.set(runPath, { 
    api, 
    genomesDb, 
    featuresDb, 
    timeout 
  });
  
  return api;
}

/**
 * Close a database connection for a specific run
 * @param {string} runPath - Path to the evolution run directory
 */
function closeRunDB(runPath) {
  if (dbPool.has(runPath)) {
    const entry = dbPool.get(runPath);
    clearTimeout(entry.timeout);
    
    if (entry.genomesDb) entry.genomesDb.close();
    if (entry.featuresDb) entry.featuresDb.close();
    
    dbPool.delete(runPath);
    console.log(`Closed idle database connection for ${runPath}`);
  }
}

// Clean up connections on process exit
process.on('exit', () => {
  for (const [runPath, entry] of dbPool.entries()) {
    clearTimeout(entry.timeout);
    
    if (entry.genomesDb) entry.genomesDb.close();
    if (entry.featuresDb) entry.featuresDb.close();
  }
});
