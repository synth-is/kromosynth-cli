// import-and-cleanup-genome-and-feature-files.js
import Database from 'better-sqlite3';
import path from 'path';
import { promises as fs } from 'fs';
import zlib from 'zlib';
import { promisify } from 'util';
import readline from 'readline';
const gunzip = promisify(zlib.gunzip);
const gzip = promisify(zlib.gzip);

// Accept EVORUNS_BASE_DIR as a command line argument
const DEFAULT_EVORUNS_BASE_DIR = '/Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/evoruns';
let EVORUNS_BASE_DIR = DEFAULT_EVORUNS_BASE_DIR;

// Configuration
const BATCH_SIZE = 1000;
const GENOME_PREFIX = 'genome_';
const FEATURES_PREFIX = 'features_';
const DICTIONARY_PATH = path.join(EVORUNS_BASE_DIR, 'genome-dict.txt');

// Configuration flags
const CONFIG = {
  createDictionaryIfMissing: false,
  compressionLevel: 9,
  useSharedDictionary: true,
  enableBackups: true,
  enableIntegrityChecks: true,
  enableResumeCapability: true,
  checkpointFrequency: 100,
  // New cleanup-specific options
  enableDryRun: false,              // Set to true to simulate without deleting
  verifyBeforeDelete: true,         // Verify data matches before deletion
  requireUserConfirmation: true,    // Ask for confirmation before starting
  createCleanupLog: true,           // Create detailed log of cleanup process
  deleteOriginalFiles: true        // Actually delete files (can be disabled for testing)
};

// Progress tracking
const PROGRESS_FILE = 'import-cleanup-progress.json';

// Create readline interface for user prompts
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Prompt utility function
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.toLowerCase()));
  });
}

// Main function to process all evolutionary runs
async function processAllRuns() {
  try {
    console.log(`Starting import and cleanup process from: ${EVORUNS_BASE_DIR}`);
    console.log(`Mode: ${CONFIG.enableDryRun ? 'DRY RUN (no files will be deleted)' : 'LIVE IMPORT AND DELETION'}`);
    
    if (!CONFIG.enableDryRun && CONFIG.requireUserConfirmation && CONFIG.deleteOriginalFiles) {
      const confirm = await prompt('This will DELETE original .json.gz files after importing to database. Continue? (y/n): ');
      if (confirm !== 'y') {
        console.log('Operation canceled.');
        rl.close();
        return;
      }
    }
    
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
    
    let totalStats = {
      runsProcessed: 0,
      filesImported: 0,
      filesDeleted: 0,
      errors: 0,
      spaceFreed: 0
    };
    
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
        const runStats = await processEvoRunWithCleanup(runPath, runDir, dictionary, progress);
        
        // Aggregate statistics
        totalStats.runsProcessed++;
        totalStats.filesImported += runStats.filesImported;
        totalStats.filesDeleted += runStats.filesDeleted;
        totalStats.errors += runStats.errors;
        totalStats.spaceFreed += runStats.spaceFreed;
        
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
        totalStats.errors++;
      }
    }
    
    // Final summary
    console.log('\n=== IMPORT AND CLEANUP SUMMARY ===');
    console.log(`Runs processed: ${totalStats.runsProcessed}`);
    console.log(`Files imported: ${totalStats.filesImported}`);
    console.log(`Files deleted: ${totalStats.filesDeleted}`);
    console.log(`Total errors: ${totalStats.errors}`);
    console.log(`Estimated space freed: ${(totalStats.spaceFreed / 1024 / 1024).toFixed(2)} MB`);
    
    if (CONFIG.enableDryRun) {
      console.log('\nNOTE: This was a dry run - no files were actually deleted.');
    }
    
    // Clean up progress file
    try {
      await fs.unlink(path.join(EVORUNS_BASE_DIR, PROGRESS_FILE));
    } catch (err) {
      // Progress file cleanup failed, but that's ok
    }
    
    rl.close();
    
  } catch (err) {
    console.error('Fatal error during import and cleanup process:', err);
    rl.close();
    process.exit(1);
  }
}

// Process a single evolutionary run with import and cleanup
async function processEvoRunWithCleanup(runPath, runId, dictionary, progress) {
  const genomesDbPath = path.join(runPath, 'genomes.sqlite');
  const featuresDbPath = path.join(runPath, 'features.sqlite');
  
  const stats = {
    filesImported: 0,
    filesDeleted: 0,
    errors: 0,
    spaceFreed: 0
  };
  
  const cleanupLog = [];
  
  // Create backups before processing
  const genomesBackup = await createBackup(genomesDbPath);
  const featuresBackup = await createBackup(featuresDbPath);
  
  let genomesDb = null;
  let featuresDb = null;
  
  try {
    // Check existing databases for corruption
    const genomesIntact = await checkDatabaseIntegrity(genomesDbPath);
    const featuresIntact = await checkDatabaseIntegrity(featuresDbPath);
    
    if (!genomesIntact && genomesBackup) {
      await restoreFromBackup(genomesDbPath, genomesBackup);
    }
    if (!featuresIntact && featuresBackup) {
      await restoreFromBackup(featuresDbPath, featuresBackup);
    }
    
    // Open databases
    genomesDb = new Database(genomesDbPath);
    featuresDb = new Database(featuresDbPath);
    
    console.log(`Opened databases at:\n - ${genomesDbPath}\n - ${featuresDbPath}`);
    
    // Configure databases
    for (const db of [genomesDb, featuresDb]) {
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = FULL');
      db.pragma('cache_size = 10000');
      db.pragma('temp_store = MEMORY');
      db.pragma('mmap_size = 0');
    }
    
    // Create tables
    await createTablesResilient(genomesDb, featuresDb);
    
    // Prepare statements
    const insertGenome = genomesDb.prepare('INSERT OR REPLACE INTO genomes (id, data) VALUES (?, ?)');
    const getGenome = genomesDb.prepare('SELECT data FROM genomes WHERE id = ?');
    const setGenomeMetadata = genomesDb.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)');
    
    const insertFeature = featuresDb.prepare('INSERT OR REPLACE INTO features (id, data) VALUES (?, ?)');
    const getFeature = featuresDb.prepare('SELECT data FROM features WHERE id = ?');
    const setFeatureMetadata = featuresDb.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)');
    
    // Process genome files with immediate cleanup
    const genomeFiles = await findFiles(runPath, (file) => 
      file.endsWith('.json.gz') && 
      path.basename(file).startsWith(GENOME_PREFIX) && 
      !path.relative(runPath, path.dirname(file)).includes('cellFeatures')
    );
    
    console.log(`Found ${genomeFiles.length} genome files to import and clean up`);
    const genomeResults = await importAndCleanupFiles(
      genomesDb, genomeFiles, 'genome', insertGenome, getGenome, dictionary, cleanupLog
    );
    stats.filesImported += genomeResults.imported;
    stats.filesDeleted += genomeResults.deleted;
    stats.errors += genomeResults.errors;
    stats.spaceFreed += genomeResults.spaceFreed;
    
    // Process feature files with immediate cleanup
    const featureDirPath = path.join(runPath, 'cellFeatures');
    try {
      const featureFiles = await findFiles(featureDirPath, (file) => 
        file.endsWith('.json.gz') && 
        path.basename(file).startsWith(FEATURES_PREFIX)
      );
      
      console.log(`Found ${featureFiles.length} feature files to import and clean up`);
      const featureResults = await importAndCleanupFiles(
        featuresDb, featureFiles, 'feature', insertFeature, getFeature, dictionary, cleanupLog
      );
      stats.filesImported += featureResults.imported;
      stats.filesDeleted += featureResults.deleted;
      stats.errors += featureResults.errors;
      stats.spaceFreed += featureResults.spaceFreed;
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
    
    // Force WAL checkpoint
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
    
    // Create cleanup log
    if (CONFIG.createCleanupLog && cleanupLog.length > 0) {
      await createCleanupLog(runPath, runId, cleanupLog, stats);
    }
    
    // Create metadata file
    await createMetadataFile(runPath, genomesDbPath, featuresDbPath, dictionary, stats);
    
    console.log(`Import and cleanup completed for run: ${runId}`);
    console.log(`Statistics:\n - Files imported: ${stats.filesImported}\n - Files deleted: ${stats.filesDeleted}\n - Errors: ${stats.errors}\n - Space freed: ${(stats.spaceFreed / 1024 / 1024).toFixed(2)} MB`);
    
    // Clean up backups on success
    if (CONFIG.enableBackups) {
      try {
        if (genomesBackup) await fs.unlink(genomesBackup);
        if (featuresBackup) await fs.unlink(featuresBackup);
      } catch (err) {
        // Backup cleanup failed, but that's ok
      }
    }
    
  } catch (err) {
    console.error(`Error during processing of ${runId}:`, err);
    
    // Close databases if still open
    if (genomesDb) {
      try { genomesDb.close(); } catch (e) {}
    }
    if (featuresDb) {
      try { featuresDb.close(); } catch (e) {}
    }
    
    // Attempt recovery from backups
    if (genomesBackup) {
      await restoreFromBackup(genomesDbPath, genomesBackup);
    }
    if (featuresBackup) {
      await restoreFromBackup(featuresDbPath, featuresBackup);
    }
    
    throw err;
  }
  
  return stats;
}

// Import files and clean up immediately after successful import
async function importAndCleanupFiles(db, filePaths, fileType, insertStmt, getStmt, dictionary, cleanupLog) {
  let imported = 0;
  let deleted = 0;
  let errors = 0;
  let spaceFreed = 0;
  let batchNumber = 0;
  let skippedExisting = 0;
  
  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    const fileId = extractIdFromPath(filePath);
    
    try {
      // Get file size before processing
      const fileStats = await fs.stat(filePath);
      const fileSize = fileStats.size;
      
      // Check if already in database
      const existingRow = getStmt ? getStmt.get(fileId) : null;
      
      if (existingRow) {
        console.log(`  Already in database: ${path.basename(filePath)} - will clean up`);
        skippedExisting++;
        
        // Verify data integrity before deletion (if enabled and file already in DB)
        if (CONFIG.verifyBeforeDelete) {
          try {
            // Read and decompress original file
            const originalCompressed = await fs.readFile(filePath);
            const originalDecompressed = await gunzip(originalCompressed);
            
            // Decompress database data
            const dbDecompressed = await gunzip(existingRow.data);
            
            // Compare data
            if (!dbDecompressed.equals(originalDecompressed)) {
              console.warn(`  Data mismatch for existing file ${path.basename(filePath)} - keeping original file`);
              errors++;
              cleanupLog.push({
                file: filePath,
                id: fileId,
                status: 'existing_data_mismatch',
                timestamp: new Date().toISOString()
              });
              continue;
            }
          } catch (verifyErr) {
            console.error(`  Verification failed for existing file ${path.basename(filePath)}:`, verifyErr.message);
            errors++;
            cleanupLog.push({
              file: filePath,
              id: fileId,
              status: 'existing_verification_failed',
              error: verifyErr.message,
              timestamp: new Date().toISOString()
            });
            continue;
          }
        }
        
        // Delete the file since it's already safely in the database
        if (CONFIG.deleteOriginalFiles) {
          if (!CONFIG.enableDryRun) {
            try {
              await fs.unlink(filePath);
              deleted++;
              spaceFreed += fileSize;
              
              cleanupLog.push({
                file: filePath,
                id: fileId,
                status: 'deleted_existing_in_db',
                sizeBytes: fileSize,
                timestamp: new Date().toISOString()
              });
            } catch (deleteErr) {
              console.error(`  Error deleting existing file ${filePath}:`, deleteErr.message);
              errors++;
              cleanupLog.push({
                file: filePath,
                id: fileId,
                status: 'delete_existing_failed',
                error: deleteErr.message,
                timestamp: new Date().toISOString()
              });
            }
          } else {
            // Dry run - would delete
            deleted++;
            spaceFreed += fileSize;
            cleanupLog.push({
              file: filePath,
              id: fileId,
              status: 'would_delete_existing_in_db',
              sizeBytes: fileSize,
              timestamp: new Date().toISOString()
            });
          }
        }
        continue;
      }
      
      // File not in database - proceed with import
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
      
      // Insert into database
      insertStmt.run(fileId, compressedData);
      imported++;
      
      // Verify data integrity before deletion (if enabled)
      if (CONFIG.verifyBeforeDelete) {
        try {
          const dbRow = getStmt.get(fileId);
          if (!dbRow) {
            throw new Error('Failed to retrieve data from database after insert');
          }
          
          const dbDecompressed = await gunzip(dbRow.data);
          if (!dbDecompressed.equals(jsonData)) {
            throw new Error('Data mismatch between original and database');
          }
        } catch (verifyErr) {
          console.error(`  Verification failed for ${path.basename(filePath)}:`, verifyErr.message);
          errors++;
          cleanupLog.push({
            file: filePath,
            id: fileId,
            status: 'verification_failed',
            error: verifyErr.message,
            timestamp: new Date().toISOString()
          });
          continue;
        }
      }
      
      // Delete original file after successful import and verification
      if (CONFIG.deleteOriginalFiles) {
        if (!CONFIG.enableDryRun) {
          try {
            await fs.unlink(filePath);
            deleted++;
            spaceFreed += fileSize;
            
            cleanupLog.push({
              file: filePath,
              id: fileId,
              status: 'imported_and_deleted',
              sizeBytes: fileSize,
              timestamp: new Date().toISOString()
            });
          } catch (deleteErr) {
            console.error(`  Error deleting file ${filePath} after import:`, deleteErr.message);
            errors++;
            cleanupLog.push({
              file: filePath,
              id: fileId,
              status: 'delete_failed',
              error: deleteErr.message,
              timestamp: new Date().toISOString()
            });
          }
        } else {
          // Dry run - would delete
          deleted++;
          spaceFreed += fileSize;
          cleanupLog.push({
            file: filePath,
            id: fileId,
            status: 'would_import_and_delete',
            sizeBytes: fileSize,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      // Checkpoint periodically
      batchNumber++;
      if (batchNumber % CONFIG.checkpointFrequency === 0) {
        db.pragma('wal_checkpoint(PASSIVE)');
      }
      
      // Progress report
      if ((imported + skippedExisting + errors) % BATCH_SIZE === 0 || i === filePaths.length - 1) {
        const progress = Math.round(((i + 1) / filePaths.length) * 100);
        console.log(`  [${progress}%] Processed ${i + 1}/${filePaths.length} ${fileType} files (${imported} imported, ${skippedExisting} already in DB, ${deleted} deleted, ${errors} errors)`);
      }
      
    } catch (err) {
      console.error(`Error processing file ${filePath}:`, err);
      errors++;
      cleanupLog.push({
        file: filePath,
        id: fileId,
        status: 'processing_error',
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  console.log(`Import and cleanup summary for ${fileType}s:`);
  console.log(`  - Total files processed: ${filePaths.length}`);
  console.log(`  - New files imported: ${imported}`);
  console.log(`  - Files already in database: ${skippedExisting}`);
  console.log(`  - ${CONFIG.enableDryRun ? 'Would delete' : 'Deleted'}: ${deleted}`);
  console.log(`  - Errors: ${errors}`);
  if (spaceFreed > 0) {
    console.log(`  - Space ${CONFIG.enableDryRun ? 'would be' : ''} freed: ${(spaceFreed / 1024 / 1024).toFixed(2)} MB`);
  }
  
  return { imported, deleted, errors, spaceFreed };
}

// Create detailed cleanup log
async function createCleanupLog(runPath, runId, logEntries, stats) {
  try {
    const logData = {
      runId,
      processDate: new Date().toISOString(),
      configuration: CONFIG,
      summary: stats,
      entries: logEntries
    };
    
    const logPath = path.join(runPath, `import-cleanup-log-${Date.now()}.json`);
    await fs.writeFile(logPath, JSON.stringify(logData, null, 2));
    console.log(`Created import and cleanup log: ${logPath}`);
  } catch (err) {
    console.error('Error creating cleanup log:', err);
  }
}

// ...existing code from import script...
async function loadProgress() {
  try {
    const progressPath = path.join(EVORUNS_BASE_DIR, PROGRESS_FILE);
    const progressData = await fs.readFile(progressPath, 'utf8');
    const progress = JSON.parse(progressData);
    console.log('Resuming from previous progress...');
    return progress;
  } catch (err) {
    return {
      startTime: new Date().toISOString(),
      completedRuns: [],
      errors: []
    };
  }
}

async function saveProgress(progress) {
  try {
    const progressPath = path.join(EVORUNS_BASE_DIR, PROGRESS_FILE);
    await fs.writeFile(progressPath, JSON.stringify(progress, null, 2));
  } catch (err) {
    console.error('Failed to save progress:', err);
  }
}

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

async function createBackup(dbPath) {
  if (!CONFIG.enableBackups) return null;
  
  try {
    const backupPath = `${dbPath}.backup-${Date.now()}`;
    await fs.copyFile(dbPath, backupPath);
    console.log(`Created backup: ${backupPath}`);
    return backupPath;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    console.error(`Failed to create backup for ${dbPath}:`, err);
    return null;
  }
}

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

async function finalizeDatabase(db, setMetadataStmt, dictionary) {
  const count = db.prepare('SELECT COUNT(*) as count FROM genomes UNION ALL SELECT COUNT(*) as count FROM features').get()?.count || 0;
  
  setMetadataStmt.run('importDate', new Date().toISOString());
  setMetadataStmt.run('count', count.toString());
  setMetadataStmt.run('dictionaryUsed', (dictionary !== null).toString());
  setMetadataStmt.run('importVersion', '3.0-import-cleanup');
}

async function createMetadataFile(runPath, genomesDbPath, featuresDbPath, dictionary, cleanupStats) {
  try {
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
      importVersion: '3.0-import-cleanup',
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
      cleanupStats: cleanupStats,
      cleanupEnabled: CONFIG.deleteOriginalFiles,
      verificationEnabled: CONFIG.verifyBeforeDelete
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

async function createDictionary() {
  console.log('Dictionary creation not implemented in this version');
}

// Parse command line arguments for configuration
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      switch (arg) {
        case '--dry-run':
          CONFIG.enableDryRun = true;
          console.log('Dry run mode enabled - no files will be deleted');
          break;
        case '--no-verification':
          CONFIG.verifyBeforeDelete = false;
          console.log('Data verification before deletion disabled');
          break;
        case '--no-confirmation':
          CONFIG.requireUserConfirmation = false;
          console.log('User confirmation disabled');
          break;
        case '--no-cleanup':
          CONFIG.deleteOriginalFiles = false;
          console.log('File deletion disabled - import only mode');
          break;
        case '--no-log':
          CONFIG.createCleanupLog = false;
          console.log('Cleanup logging disabled');
          break;
        default:
          if (arg.startsWith('--batch-size=')) {
            BATCH_SIZE = parseInt(arg.split('=')[1]);
            console.log(`Batch size set to ${BATCH_SIZE}`);
          } else {
            console.log(`Unknown flag: ${arg}`);
          }
      }
    } else {
      if (EVORUNS_BASE_DIR === DEFAULT_EVORUNS_BASE_DIR) {
        EVORUNS_BASE_DIR = arg;
        console.log(`Base directory set to: ${EVORUNS_BASE_DIR}`);
      }
    }
  }
}

// Parse command line arguments
parseCommandLineArgs();

// Display configuration
console.log('\n=== IMPORT AND CLEANUP CONFIGURATION ===');
console.log(`Base directory: ${EVORUNS_BASE_DIR}`);
console.log(`Dry run: ${CONFIG.enableDryRun}`);
console.log(`Delete original files: ${CONFIG.deleteOriginalFiles}`);
console.log(`Verify before delete: ${CONFIG.verifyBeforeDelete}`);
console.log(`User confirmation required: ${CONFIG.requireUserConfirmation}`);
console.log(`Create cleanup log: ${CONFIG.createCleanupLog}`);
console.log(`Batch size: ${BATCH_SIZE}`);
console.log('==========================================\n');

// Run the import and cleanup process
processAllRuns().catch(err => {
  console.error('Unhandled error in import and cleanup process:', err);
  rl.close();
  process.exit(1);
});
