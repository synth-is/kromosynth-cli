// import-genome-and-feature-files-to-DB-resilient.js
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
  compressionLevel: 9,
  useSharedDictionary: true,
  enableBackups: true,              // Create backups before import
  enableIntegrityChecks: true,      // Check database integrity
  enableResumeCapability: true,     // Allow resuming interrupted imports
  checkpointFrequency: 100          // Force WAL checkpoint every N batches
};

// Progress tracking
const PROGRESS_FILE = 'import-progress.json';

// Main function to process all evolutionary runs
async function processAllRuns() {
  try {
    console.log(`Starting resilient import process from: ${EVORUNS_BASE_DIR}`);
    
    // Load or create progress tracking
    const progress = await loadProgress();
    
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
      
      // Skip if already completed
      if (progress.completedRuns && progress.completedRuns.includes(runDir)) {
        console.log(`\n===== Skipping completed run: ${runDir} =====`);
        continue;
      }
      
      console.log(`\n===== Processing evolutionary run: ${runDir} =====`);
      
      try {
        await processEvoRunResilient(runPath, runDir, dictionary, progress);
        
        // Mark as completed
        progress.completedRuns = progress.completedRuns || [];
        progress.completedRuns.push(runDir);
        await saveProgress(progress);
        
      } catch (err) {
        console.error(`Failed to process run ${runDir}:`, err);
        console.log('Continuing with next run...');
        
        // Save error info
        progress.errors = progress.errors || [];
        progress.errors.push({
          runDir,
          error: err.message,
          timestamp: new Date().toISOString()
        });
        await saveProgress(progress);
      }
    }
    
    console.log('\nImport process completed successfully!');
    
    // Clean up progress file
    try {
      await fs.unlink(path.join(EVORUNS_BASE_DIR, PROGRESS_FILE));
    } catch (err) {
      // Progress file cleanup failed, but that's ok
    }
    
  } catch (err) {
    console.error('Fatal error during import process:', err);
    process.exit(1);
  }
}

// Load progress from file
async function loadProgress() {
  try {
    const progressPath = path.join(EVORUNS_BASE_DIR, PROGRESS_FILE);
    const progressData = await fs.readFile(progressPath, 'utf8');
    const progress = JSON.parse(progressData);
    console.log('Resuming from previous progress...');
    return progress;
  } catch (err) {
    // No progress file or corrupted, start fresh
    return {
      startTime: new Date().toISOString(),
      completedRuns: [],
      errors: []
    };
  }
}

// Save progress to file
async function saveProgress(progress) {
  try {
    const progressPath = path.join(EVORUNS_BASE_DIR, PROGRESS_FILE);
    await fs.writeFile(progressPath, JSON.stringify(progress, null, 2));
  } catch (err) {
    console.error('Failed to save progress:', err);
  }
}

// Check database integrity
async function checkDatabaseIntegrity(dbPath) {
  if (!CONFIG.enableIntegrityChecks) return true;
  
  try {
    const db = new Database(dbPath, { readonly: true });
    const result = db.prepare('PRAGMA integrity_check').get();
    db.close();
    
    const isOk = result.integrity_check === 'ok';
    if (!isOk) {
      console.error(`Database integrity check failed for ${dbPath}: ${result.integrity_check}`);
    }
    return isOk;
  } catch (err) {
    console.error(`Error checking database integrity for ${dbPath}:`, err);
    return false;
  }
}

// Create backup of database
async function createBackup(dbPath) {
  if (!CONFIG.enableBackups) return null;
  
  try {
    const backupPath = `${dbPath}.backup-${Date.now()}`;
    await fs.copyFile(dbPath, backupPath);
    console.log(`Created backup: ${backupPath}`);
    return backupPath;
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Database doesn't exist yet, no backup needed
      return null;
    }
    console.error(`Failed to create backup for ${dbPath}:`, err);
    return null;
  }
}

// Restore from backup
async function restoreFromBackup(dbPath, backupPath) {
  if (!backupPath) return false;
  
  try {
    await fs.copyFile(backupPath, dbPath);
    console.log(`Restored database from backup: ${backupPath}`);
    return true;
  } catch (err) {
    console.error(`Failed to restore from backup ${backupPath}:`, err);
    return false;
  }
}

// Process a single evolutionary run with resilience features
async function processEvoRunResilient(runPath, runId, dictionary, progress) {
  const genomesDbPath = path.join(runPath, 'genomes.sqlite');
  const featuresDbPath = path.join(runPath, 'features.sqlite');
  
  // Create backups before processing
  const genomesBackup = await createBackup(genomesDbPath);
  const featuresBackup = await createBackup(featuresDbPath);
  
  let genomesDb = null;
  let featuresDb = null;
  
  try {
    // Check existing databases for corruption
    const genomesIntact = await checkDatabaseIntegrity(genomesDbPath);
    const featuresIntact = await checkDatabaseIntegrity(featuresDbPath);
    
    if (!genomesIntact) {
      console.warn(`Genomes database appears corrupted, attempting restore...`);
      if (genomesBackup && await restoreFromBackup(genomesDbPath, genomesBackup)) {
        console.log('Successfully restored genomes database from backup');
      } else {
        console.warn('No backup available, will recreate genomes database');
        try {
          await fs.unlink(genomesDbPath);
        } catch (err) {
          // File might not exist
        }
      }
    }
    
    if (!featuresIntact) {
      console.warn(`Features database appears corrupted, attempting restore...`);
      if (featuresBackup && await restoreFromBackup(featuresDbPath, featuresBackup)) {
        console.log('Successfully restored features database from backup');
      } else {
        console.warn('No backup available, will recreate features database');
        try {
          await fs.unlink(featuresDbPath);
        } catch (err) {
          // File might not exist
        }
      }
    }
    
    // Open databases
    genomesDb = new Database(genomesDbPath);
    featuresDb = new Database(featuresDbPath);
    
    console.log(`Opened databases at:\n - ${genomesDbPath}\n - ${featuresDbPath}`);
    
    // Configure both databases for maximum reliability
    for (const db of [genomesDb, featuresDb]) {
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = FULL');        // Maximum durability
      db.pragma('cache_size = 10000');
      db.pragma('temp_store = MEMORY');
      db.pragma('mmap_size = 0');             // Disable memory mapping for safety
    }
    
    // Create tables with better error handling
    await createTablesResilient(genomesDb, featuresDb);
    
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
    await importFilesResilient(genomesDb, genomeFiles, 'genome', insertGenome, getGenome, dictionary);
    
    // Process feature files
    const featureDirPath = path.join(runPath, 'cellFeatures');
    try {
      const featureFiles = await findFiles(featureDirPath, (file) => 
        file.endsWith('.json.gz') && 
        path.basename(file).startsWith(FEATURES_PREFIX)
      );
      
      console.log(`Found ${featureFiles.length} feature files to import`);
      await importFilesResilient(featuresDb, featureFiles, 'feature', insertFeature, getFeature, dictionary);
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('No cellFeatures directory found, skipping features import');
      } else {
        throw err;
      }
    }
    
    // Store metadata and finalize
    await finalizeDatabase(genomesDb, setGenomeMetadata, dictionary);
    await finalizeDatabase(featuresDb, setFeatureMetadata, dictionary);
    
    // Force WAL checkpoint to ensure data is written to main database
    genomesDb.pragma('wal_checkpoint(TRUNCATE)');
    featuresDb.pragma('wal_checkpoint(TRUNCATE)');
    
    // Final integrity check
    genomesDb.close();
    featuresDb.close();
    genomesDb = null;
    featuresDb = null;
    
    const finalGenomesIntact = await checkDatabaseIntegrity(genomesDbPath);
    const finalFeaturesIntact = await checkDatabaseIntegrity(featuresDbPath);
    
    if (!finalGenomesIntact || !finalFeaturesIntact) {
      throw new Error('Database corruption detected after import');
    }
    
    // Create final metadata file
    await createMetadataFile(runPath, genomesDbPath, featuresDbPath, dictionary);
    
    console.log(`Import completed successfully for run: ${runId}`);
    
    // Clean up backups on success (optional)
    if (CONFIG.enableBackups) {
      try {
        if (genomesBackup) await fs.unlink(genomesBackup);
        if (featuresBackup) await fs.unlink(featuresBackup);
      } catch (err) {
        // Backup cleanup failed, but that's ok
      }
    }
    
  } catch (err) {
    console.error(`Error during resilient processing of ${runId}:`, err);
    
    // Close databases if still open
    if (genomesDb) {
      try { genomesDb.close(); } catch (e) {}
    }
    if (featuresDb) {
      try { featuresDb.close(); } catch (e) {}
    }
    
    // Attempt recovery from backups
    if (genomesBackup) {
      console.log('Attempting to restore genomes database from backup...');
      await restoreFromBackup(genomesDbPath, genomesBackup);
    }
    if (featuresBackup) {
      console.log('Attempting to restore features database from backup...');
      await restoreFromBackup(featuresDbPath, featuresBackup);
    }
    
    throw err;
  }
}

// Create tables with better error handling
async function createTablesResilient(genomesDb, featuresDb) {
  try {
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
  } catch (err) {
    console.error('Error creating tables:', err);
    throw err;
  }
}

// Resilient file import with checkpointing
async function importFilesResilient(db, filePaths, fileType, insertStmt, getStmt, dictionary) {
  let importedCount = 0;
  let errorCount = 0;
  let batch = [];
  let batchNumber = 0;
  
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
      
      // Recompress with optimal settings
      let compressedData;
      if (dictionary) {
        compressedData = await gzip(jsonData, {
          level: CONFIG.compressionLevel,
          dictionary: dictionary
        });
      } else {
        compressedData = await gzip(jsonData, {
          level: CONFIG.compressionLevel
        });
      }
      
      batch.push({ id: fileId, compressedData });
      
      // Process batch if it reaches the limit or is the last one
      if (batch.length >= BATCH_SIZE || i === filePaths.length - 1) {
        try {
          insertMany(batch);
          importedCount += batch.length;
          batchNumber++;
          
          // Force WAL checkpoint periodically
          if (batchNumber % CONFIG.checkpointFrequency === 0) {
            console.log(`  Checkpointing database...`);
            db.pragma('wal_checkpoint(PASSIVE)');
          }
          
          // Progress report
          const progress = Math.round((importedCount / filePaths.length) * 100);
          console.log(`  [${progress}%] Imported ${importedCount}/${filePaths.length} ${fileType} files (${errorCount} errors)`);
          
          batch = [];
        } catch (batchErr) {
          console.error(`Error processing batch:`, batchErr);
          errorCount += batch.length;
          batch = [];
        }
      }
    } catch (err) {
      console.error(`Error processing file ${filePath}:`, err);
      errorCount++;
    }
  }
  
  // Final checkpoint
  db.pragma('wal_checkpoint(TRUNCATE)');
  
  console.log(`Import summary for ${fileType}s:`);
  console.log(`  - Total files: ${filePaths.length}`);
  console.log(`  - Successfully imported: ${importedCount}`);
  console.log(`  - Errors: ${errorCount}`);
}

// Finalize database with metadata
async function finalizeDatabase(db, setMetadataStmt, dictionary) {
  const count = db.prepare('SELECT COUNT(*) as count FROM genomes UNION ALL SELECT COUNT(*) as count FROM features').get()?.count || 0;
  
  setMetadataStmt.run('importDate', new Date().toISOString());
  setMetadataStmt.run('count', count.toString());
  setMetadataStmt.run('dictionaryUsed', (dictionary !== null).toString());
  setMetadataStmt.run('importVersion', '2.0');
}

// Create comprehensive metadata file
async function createMetadataFile(runPath, genomesDbPath, featuresDbPath, dictionary) {
  try {
    // Get database statistics
    const genomesDb = new Database(genomesDbPath, { readonly: true });
    const featuresDb = new Database(featuresDbPath, { readonly: true });
    
    const genomeCount = genomesDb.prepare('SELECT COUNT(*) as count FROM genomes').get().count;
    const genomeSize = genomesDb.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get().size;
    
    const featureCount = featuresDb.prepare('SELECT COUNT(*) as count FROM features').get().count;
    const featureSize = featuresDb.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get().size;
    
    genomesDb.close();
    featuresDb.close();
    
    const metadata = {
      importDate: new Date().toISOString(),
      importVersion: '2.0-resilient',
      genomes: {
        path: genomesDbPath,
        count: genomeCount,
        sizeBytes: genomeSize,
        sizeMB: (genomeSize / 1024 / 1024).toFixed(2)
      },
      features: {
        path: featuresDbPath,
        count: featureCount,
        sizeBytes: featureSize,
        sizeMB: (featureSize / 1024 / 1024).toFixed(2)
      },
      dictionaryUsed: dictionary !== null,
      resilienceFeatures: {
        backupsEnabled: CONFIG.enableBackups,
        integrityChecksEnabled: CONFIG.enableIntegrityChecks,
        checkpointFrequency: CONFIG.checkpointFrequency
      }
    };
    
    await fs.writeFile(
      path.join(runPath, 'sqlite-import-info.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    console.log(`Database statistics:
 - Genomes: ${genomeCount} (${metadata.genomes.sizeMB} MB)
 - Features: ${featureCount} (${metadata.features.sizeMB} MB)`);
    
  } catch (err) {
    console.error('Error creating metadata file:', err);
  }
}

// Helper functions
function extractIdFromPath(filePath) {
  const fileName = path.basename(filePath, '.json.gz');
  const parts = fileName.split('_');
  return parts[parts.length - 1];
}

async function findFiles(dir, filterFn) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'genomes.sqlite' || entry.name === 'features.sqlite') {
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

// Placeholder for dictionary creation
async function createDictionary() {
  console.log('Dictionary creation not implemented in this version');
}

// Run the import process
processAllRuns().catch(err => {
  console.error('Unhandled error in import process:', err);
  process.exit(1);
});