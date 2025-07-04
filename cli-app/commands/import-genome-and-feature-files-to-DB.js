// import-to-sqlite.js
import Database from 'better-sqlite3';
import path from 'path';
import { promises as fs } from 'fs';
import zlib from 'zlib';
import { promisify } from 'util';
import { execSync } from 'child_process';
const gunzip = promisify(zlib.gunzip);
const gzip = promisify(zlib.gzip);

// Accept EVORUNS_BASE_DIR as a command line argument
const DEFAULT_EVORUNS_BASE_DIR = '/Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/evoruns';
const EVORUNS_BASE_DIR = process.argv[2] || DEFAULT_EVORUNS_BASE_DIR;

// Configuration
const BATCH_SIZE = 1000;
const GENOME_PREFIX = 'genome_';
const FEATURES_PREFIX = 'features_';
const DICTIONARY_PATH = path.join(EVORUNS_BASE_DIR, 'genome-dict.txt');
const TEMP_DIR = path.join(EVORUNS_BASE_DIR, 'dict-temp');
const SAMPLE_COUNT = 20;

// Configuration flags
const CONFIG = {
  createDictionaryIfMissing: false,
  compressionLevel: 9,          // Max compression level
  useSharedDictionary: true     // Enable shared dictionary compression
};

// Main function to process all evolutionary runs
async function processAllRuns() {
  try {
    console.log(`Starting import process from: ${EVORUNS_BASE_DIR}`);
    
    // Check for dictionary and create if needed
    let dictionary = null;
    if (CONFIG.useSharedDictionary) {
      const dictionaryExists = await fs.access(DICTIONARY_PATH).then(() => true).catch(() => false);
      
      if (!dictionaryExists && CONFIG.createDictionaryIfMissing) {
        console.log('Creating compression dictionary...');
        await createDictionary();
      }
      
      if (dictionaryExists || CONFIG.createDictionaryIfMissing) {
        try {
          dictionary = await fs.readFile(DICTIONARY_PATH);
          console.log(`Using dictionary (${dictionary.length} bytes) for enhanced compression`);
        } catch (err) {
          console.log('Error loading dictionary, using standard compression');
        }
      }
    }
    
    // Get all evolutionary run directories, sorted by newest first
    const runDirsWithStats = await Promise.all(
      (await fs.readdir(EVORUNS_BASE_DIR)).map(async dir => {
        const fullPath = path.join(EVORUNS_BASE_DIR, dir);
        try {
          const stats = await fs.stat(fullPath);
          return { dir, mtime: stats.mtime };
        } catch {
          return null;
        }
      })
    );
    const runDirs = runDirsWithStats
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime)
      .map(item => item.dir);

    console.log(`Found ${runDirs.length} evolutionary run directories (newest first)`);
    
    // Process each run directory
    for (const runDir of runDirs) {
      const runPath = path.join(EVORUNS_BASE_DIR, runDir);
      
      // Check if it's a directory
      const stats = await fs.stat(runPath);
      if (!stats.isDirectory()) continue;
      
      console.log(`\n===== Processing evolutionary run: ${runDir} =====`);
      await processEvoRun(runPath, runDir, dictionary);
    }
    
    console.log('\nImport process completed successfully!');
  } catch (err) {
    console.error('Fatal error during import process:', err);
    process.exit(1);
  }
}

// Create a custom dictionary for better compression
async function createDictionary() {
  // Similar dictionary creation logic as before...
  // Implement the dictionary creation like we did in the previous script
}

// Process a single evolutionary run
async function processEvoRun(runPath, runId, dictionary) {
  try {
    // Separate database files for genomes and features
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
    
    // Process genome files
    const genomeFiles = await findFiles(runPath, (file) => 
      file.endsWith('.json.gz') && 
      path.basename(file).startsWith(GENOME_PREFIX) && 
      !path.relative(runPath, path.dirname(file)).includes('cellFeatures')
    );
    
    console.log(`Found ${genomeFiles.length} genome files to import`);
    await importFiles(genomesDb, genomeFiles, 'genome', insertGenome, getGenome, dictionary);
    
    // Process feature files
    const featureDirPath = path.join(runPath, 'cellFeatures');
    try {
      const featureFiles = await findFiles(featureDirPath, (file) => 
        file.endsWith('.json.gz') && 
        path.basename(file).startsWith(FEATURES_PREFIX)
      );
      
      console.log(`Found ${featureFiles.length} feature files to import`);
      await importFiles(featuresDb, featureFiles, 'feature', insertFeature, getFeature, dictionary);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('No cellFeatures directory found, skipping features import');
      } else {
        throw err;
      }
    }
    
    // Store metadata for genomes
    const genomeCount = genomesDb.prepare('SELECT COUNT(*) as count FROM genomes').get().count;
    const genomeSize = genomesDb.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get().size;
    
    setGenomeMetadata.run('importDate', new Date().toISOString());
    setGenomeMetadata.run('count', genomeCount.toString());
    setGenomeMetadata.run('dictionaryUsed', (dictionary !== null).toString());
    
    // Store metadata for features
    const featureCount = featuresDb.prepare('SELECT COUNT(*) as count FROM features').get().count;
    const featureSize = featuresDb.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get().size;
    
    setFeatureMetadata.run('importDate', new Date().toISOString());
    setFeatureMetadata.run('count', featureCount.toString());
    setFeatureMetadata.run('dictionaryUsed', (dictionary !== null).toString());
    
    // Create a metadata file
    await fs.writeFile(
      path.join(runPath, 'sqlite-import-info.json'),
      JSON.stringify({
        importDate: new Date().toISOString(),
        genomes: {
          path: genomesDbPath,
          count: genomeCount,
          sizeBytes: genomeSize
        },
        features: {
          path: featuresDbPath,
          count: featureCount,
          sizeBytes: featureSize
        },
        dictionaryUsed: dictionary !== null
      }, null, 2)
    );
    
    // Close databases
    genomesDb.close();
    featuresDb.close();
    
    console.log(`Import completed for run: ${runId}`);
    console.log(`Database statistics:
 - Genomes: ${genomeCount} (${(genomeSize / 1024 / 1024).toFixed(2)} MB)
 - Features: ${featureCount} (${(featureSize / 1024 / 1024).toFixed(2)} MB)`);
  } catch (err) {
    console.error(`Error processing evolutionary run ${runId}:`, err);
  }
}

// Import files in batches
async function importFiles(db, filePaths, fileType, insertStmt, getStmt, dictionary) {
  let importedCount = 0;
  let errorCount = 0;
  let batch = [];
  
  // Begin transaction for better performance
  const insertMany = db.transaction((items) => {
    for (const { id, compressedData } of items) {
      insertStmt.run(id, compressedData);
    }
  });
  
  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    const fileId = extractIdFromPath(filePath);
    
    try {
      // Skip if already in database
      if (getStmt && getStmt.get(fileId)) {
        console.log(`  Skipping ${path.basename(filePath)} - already in database`);
        importedCount++;
        continue;
      }
      
      // Read and decompress file
      const gzippedData = await fs.readFile(filePath);
      const jsonData = await gunzip(gzippedData);
      const data = JSON.parse(jsonData);
      
      // Recompress with optimal settings for storage
      let compressedData;
      if (dictionary) {
        // Use dictionary-based compression for better ratio
        // Note: This is a simplified example. In practice, you'd use
        // a library that supports dictionary-based compression like zstd
        compressedData = await gzip(jsonData, {
          level: CONFIG.compressionLevel,
          dictionary: dictionary
        });
      } else {
        // Standard compression
        compressedData = await gzip(jsonData, {
          level: CONFIG.compressionLevel
        });
      }
      
      batch.push({ id: fileId, compressedData });
      
      // Process batch if it reaches the limit or is the last one
      if (batch.length >= BATCH_SIZE || i === filePaths.length - 1) {
        insertMany(batch);
        importedCount += batch.length;
        
        // Progress report
        const progress = Math.round((importedCount / filePaths.length) * 100);
        console.log(`  [${progress}%] Imported ${importedCount}/${filePaths.length} ${fileType} files (${errorCount} errors)`);
        
        batch = [];
      }
    } catch (err) {
      console.error(`Error processing file ${filePath}:`, err);
      errorCount++;
    }
  }
  
  console.log(`Import summary for ${fileType}s:`);
  console.log(`  - Total files: ${filePaths.length}`);
  console.log(`  - Successfully imported: ${importedCount}`);
  console.log(`  - Errors: ${errorCount}`);
}

// Helper functions
function extractIdFromPath(filePath) {
  const fileName = path.basename(filePath, '.json.gz');
  const parts = fileName.split('_');
  return parts[parts.length - 1];
}

// Find all files matching the filter function
async function findFiles(dir, filterFn) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip the database files we've created
        if (entry.name === 'genomes.mdb' || entry.name === 'features.mdb') {
          return [];
        }
        return findFiles(fullPath, filterFn);
      } else if (filterFn(fullPath)) {
        return [fullPath];
      }
      return [];
    }));
    
    return files.flat();
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
    return [];
  }
}

// Create a simple example of a database access module
function createAccessModule() {
  return `
// genomeDB.js - Database access module
import Database from 'better-sqlite3';
import zlib from 'zlib';
import { promisify } from 'util';
const gunzip = promisify(zlib.gunzip);

// Connection pool for databases
const dbPool = new Map();
const DB_TIMEOUT = 30 * 60 * 1000; // 30 minutes

// Get a database connection for a specific run
export function getRunDB(runPath) {
  if (dbPool.has(runPath)) {
    const entry = dbPool.get(runPath);
    clearTimeout(entry.timeout);
    entry.timeout = setTimeout(() => closeRunDB(runPath), DB_TIMEOUT);
    return entry.api;
  }
  
  // Open the database
  const dbPath = path.join(runPath, 'evolution.sqlite');
  const db = new Database(dbPath, { readonly: true });
  
  // Optimize for read performance
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = 10000');
  
  // Prepare statements
  const getGenome = db.prepare('SELECT data FROM genomes WHERE id = ?');
  const getFeature = db.prepare('SELECT data FROM features WHERE id = ?');
  
  // Create API
  const api = {
    async getGenome(id) {
      const row = getGenome.get(id);
      if (!row) return null;
      
      try {
        const jsonData = await gunzip(row.data);
        return JSON.parse(jsonData);
      } catch (err) {
        console.error(\`Error decompressing genome \${id}\`, err);
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
        console.error(\`Error decompressing feature \${id}\`, err);
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
        console.error(\`Error decompressing genome \${id}\`, err);
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
        console.error(\`Error decompressing feature \${id}\`, err);
        return null;
      }
    },
    
    close() {
      db.close();
    }
  };
  
  // Add to pool
  const timeout = setTimeout(() => closeRunDB(runPath), DB_TIMEOUT);
  dbPool.set(runPath, { api, db, timeout });
  
  console.log(\`Opened database connection for \${runPath}\`);
  return api;
}

function closeRunDB(runPath) {
  if (dbPool.has(runPath)) {
    const entry = dbPool.get(runPath);
    clearTimeout(entry.timeout);
    entry.db.close();
    dbPool.delete(runPath);
    console.log(\`Closed idle database connection for \${runPath}\`);
  }
}

// Clean up connections on process exit
process.on('exit', () => {
  for (const [runPath, entry] of dbPool.entries()) {
    clearTimeout(entry.timeout);
    entry.db.close();
  }
});
  `;
}

// Run the import process
processAllRuns().catch(err => {
  console.error('Unhandled error in import process:', err);
  process.exit(1);
});