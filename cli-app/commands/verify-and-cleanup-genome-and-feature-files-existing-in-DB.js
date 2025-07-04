// verify-and-cleanup-sqlite.js
import Database from 'better-sqlite3';
import path from 'path';
import { promises as fs } from 'fs';
import zlib from 'zlib';
import { promisify } from 'util';
import readline from 'readline';
const gunzip = promisify(zlib.gunzip);

// Parse command line arguments for base directory and configuration
const DEFAULT_EVORUNS_BASE_DIR = '/Users/bjornpjo/Developer/apps/kromosynth-cli/cli-app/evoruns';
let EVORUNS_BASE_DIR = DEFAULT_EVORUNS_BASE_DIR;

// Configuration
const GENOME_PREFIX = 'genome_';
const FEATURES_PREFIX = 'features_';

// Configuration flags
const CONFIG = {
  verifyDataIntegrity: true,        // Actually decompress and verify data matches
  enableDryRun: false,              // Set to true to simulate without deleting
  batchSize: 100,                   // Process files in batches for progress reporting
  createVerificationLog: true,      // Create detailed log of verification process
  requireUserConfirmation: true     // Ask for confirmation before deletion
};

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

// Main function to verify and cleanup
async function verifyAndCleanup() {
  try {
    console.log(`Starting verification and cleanup process from: ${EVORUNS_BASE_DIR}`);
    console.log(`Mode: ${CONFIG.enableDryRun ? 'DRY RUN (no files will be deleted)' : 'LIVE DELETION'}`);
    
    if (!CONFIG.enableDryRun && CONFIG.requireUserConfirmation) {
      const confirm = await prompt('This will DELETE original .json.gz files after verification. Continue? (y/n): ');
      if (confirm !== 'y') {
        console.log('Operation canceled.');
        rl.close();
        return;
      }
    }
    
    // Get all evolutionary run directories
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

    console.log(`Found ${runDirs.length} evolutionary run directories`);
    
    let totalStats = {
      runsProcessed: 0,
      genomesVerified: 0,
      genomesDeleted: 0,
      featuresVerified: 0,
      featuresDeleted: 0,
      errors: 0,
      spaceFreed: 0
    };
    
    // Process each run directory
    for (const runDir of runDirs) {
      const runPath = path.join(EVORUNS_BASE_DIR, runDir);
      
      // Check if it's a directory
      const stats = await fs.stat(runPath);
      if (!stats.isDirectory()) continue;
      
      console.log(`\n===== Verifying evolutionary run: ${runDir} =====`);
      const runStats = await verifyEvoRun(runPath, runDir);
      
      // Aggregate statistics
      totalStats.runsProcessed++;
      totalStats.genomesVerified += runStats.genomesVerified;
      totalStats.genomesDeleted += runStats.genomesDeleted;
      totalStats.featuresVerified += runStats.featuresVerified;
      totalStats.featuresDeleted += runStats.featuresDeleted;
      totalStats.errors += runStats.errors;
      totalStats.spaceFreed += runStats.spaceFreed;
    }
    
    // Final summary
    console.log('\n=== VERIFICATION AND CLEANUP SUMMARY ===');
    console.log(`Runs processed: ${totalStats.runsProcessed}`);
    console.log(`Genomes verified: ${totalStats.genomesVerified}, deleted: ${totalStats.genomesDeleted}`);
    console.log(`Features verified: ${totalStats.featuresVerified}, deleted: ${totalStats.featuresDeleted}`);
    console.log(`Total errors: ${totalStats.errors}`);
    console.log(`Estimated space freed: ${(totalStats.spaceFreed / 1024 / 1024).toFixed(2)} MB`);
    
    if (CONFIG.enableDryRun) {
      console.log('\nNOTE: This was a dry run - no files were actually deleted.');
    }
    
    rl.close();
  } catch (err) {
    console.error('Fatal error during verification process:', err);
    rl.close();
    process.exit(1);
  }
}

// Process a single evolutionary run
async function verifyEvoRun(runPath, runId) {
  const stats = {
    genomesVerified: 0,
    genomesDeleted: 0,
    featuresVerified: 0,
    featuresDeleted: 0,
    errors: 0,
    spaceFreed: 0
  };
  
  const logEntries = [];
  
  try {
    // Check if databases exist
    const genomesDbPath = path.join(runPath, 'genomes.sqlite');
    const featuresDbPath = path.join(runPath, 'features.sqlite');
    
    try {
      await fs.access(genomesDbPath);
      await fs.access(featuresDbPath);
    } catch (err) {
      console.error(`Databases not found for run ${runId}. Skipping...`);
      return stats;
    }
    
    // Check if metadata indicates successful import
    const metadataPath = path.join(runPath, 'sqlite-import-info.json');
    let metadata = null;
    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      metadata = JSON.parse(metadataContent);
    } catch (err) {
      console.warn(`No metadata file found for run ${runId}. Proceeding with caution...`);
    }
    
    // Open databases for verification
    const genomesDb = new Database(genomesDbPath, { readonly: true });
    const featuresDb = new Database(featuresDbPath, { readonly: true });
    
    // Optimize for read performance
    genomesDb.pragma('cache_size = 5000');
    featuresDb.pragma('cache_size = 5000');
    
    // Prepare statements
    const getGenome = genomesDb.prepare('SELECT data FROM genomes WHERE id = ?');
    const getFeature = featuresDb.prepare('SELECT data FROM features WHERE id = ?');
    
    console.log(`Opened databases:\n - ${genomesDbPath}\n - ${featuresDbPath}`);
    
    // Verify genome files
    const genomeFiles = await findFiles(runPath, (file) => 
      file.endsWith('.json.gz') && 
      path.basename(file).startsWith(GENOME_PREFIX) && 
      !path.relative(runPath, path.dirname(file)).includes('cellFeatures')
    );
    
    console.log(`Found ${genomeFiles.length} genome files to verify`);
    const genomeResults = await verifyAndRemoveFiles(
      genomeFiles, 'genome', getGenome, logEntries
    );
    stats.genomesVerified += genomeResults.verified;
    stats.genomesDeleted += genomeResults.deleted;
    stats.errors += genomeResults.errors;
    stats.spaceFreed += genomeResults.spaceFreed;
    
    // Verify feature files
    const featureDirPath = path.join(runPath, 'cellFeatures');
    try {
      const featureFiles = await findFiles(featureDirPath, (file) => 
        file.endsWith('.json.gz') && 
        path.basename(file).startsWith(FEATURES_PREFIX)
      );
      
      console.log(`Found ${featureFiles.length} feature files to verify`);
      const featureResults = await verifyAndRemoveFiles(
        featureFiles, 'feature', getFeature, logEntries
      );
      stats.featuresVerified += featureResults.verified;
      stats.featuresDeleted += featureResults.deleted;
      stats.errors += featureResults.errors;
      stats.spaceFreed += featureResults.spaceFreed;
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log('No cellFeatures directory found, skipping features verification');
      } else {
        throw err;
      }
    }
    
    // Close databases
    genomesDb.close();
    featuresDb.close();
    
    // Create verification log if enabled
    if (CONFIG.createVerificationLog && logEntries.length > 0) {
      await createVerificationLog(runPath, runId, logEntries, stats);
    }
    
    // Update metadata with verification info
    if (metadata) {
      metadata.verificationDate = new Date().toISOString();
      metadata.filesVerified = {
        genomes: stats.genomesVerified,
        features: stats.featuresVerified
      };
      metadata.filesDeleted = {
        genomes: stats.genomesDeleted,
        features: stats.featuresDeleted
      };
      metadata.verified = true;
      
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    }
    
    console.log(`Verification completed for run: ${runId}`);
    console.log(`Statistics:\n - Genomes: ${stats.genomesVerified} verified, ${stats.genomesDeleted} deleted\n - Features: ${stats.featuresVerified} verified, ${stats.featuresDeleted} deleted\n - Errors: ${stats.errors}`);
    
  } catch (err) {
    console.error(`Error verifying evolutionary run ${runId}:`, err);
    stats.errors++;
  }
  
  return stats;
}

// Verify and remove files
async function verifyAndRemoveFiles(filePaths, fileType, getStmt, logEntries) {
  let verified = 0;
  let deleted = 0;
  let errors = 0;
  let missing = 0;
  let dataCorrupted = 0;
  let spaceFreed = 0;
  
  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    const fileId = extractIdFromPath(filePath);
    
    try {
      // Get file size before potential deletion
      const fileStats = await fs.stat(filePath);
      const fileSize = fileStats.size;
      
      // Check if file exists in database
      const row = getStmt.get(fileId);
      
      if (!row) {
        console.log(`  Missing from database: ${path.basename(filePath)}`);
        missing++;
        logEntries.push({
          file: filePath,
          id: fileId,
          status: 'missing_from_db',
          timestamp: new Date().toISOString()
        });
        continue;
      }
      
      verified++;
      
      // Optionally verify data integrity
      if (CONFIG.verifyDataIntegrity) {
        try {
          // Decompress database data
          const dbDecompressed = await gunzip(row.data);
          
          // Read and decompress original file
          const originalCompressed = await fs.readFile(filePath);
          const originalDecompressed = await gunzip(originalCompressed);
          
          // Compare data
          if (!dbDecompressed.equals(originalDecompressed)) {
            console.warn(`  Data mismatch for ${path.basename(filePath)}`);
            dataCorrupted++;
            logEntries.push({
              file: filePath,
              id: fileId,
              status: 'data_mismatch',
              timestamp: new Date().toISOString()
            });
            continue;
          }
        } catch (dataErr) {
          console.error(`  Data verification failed for ${path.basename(filePath)}:`, dataErr.message);
          dataCorrupted++;
          logEntries.push({
            file: filePath,
            id: fileId,
            status: 'verification_failed',
            error: dataErr.message,
            timestamp: new Date().toISOString()
          });
          continue;
        }
      }
      
      // Delete file after successful verification
      if (!CONFIG.enableDryRun) {
        try {
          await fs.unlink(filePath);
          deleted++;
          spaceFreed += fileSize;
          
          logEntries.push({
            file: filePath,
            id: fileId,
            status: 'deleted',
            sizeBytes: fileSize,
            timestamp: new Date().toISOString()
          });
        } catch (deleteErr) {
          console.error(`  Error deleting file ${filePath}:`, deleteErr.message);
          errors++;
          logEntries.push({
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
        logEntries.push({
          file: filePath,
          id: fileId,
          status: 'would_delete',
          sizeBytes: fileSize,
          timestamp: new Date().toISOString()
        });
      }
      
      // Progress report every batch
      if ((verified + missing + dataCorrupted) % CONFIG.batchSize === 0 || i === filePaths.length - 1) {
        const progress = Math.round(((i + 1) / filePaths.length) * 100);
        console.log(`  [${progress}%] Processed ${i + 1}/${filePaths.length} ${fileType} files`);
      }
      
    } catch (err) {
      console.error(`  Error processing file ${filePath}:`, err.message);
      errors++;
      logEntries.push({
        file: filePath,
        id: fileId,
        status: 'processing_error',
        error: err.message,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  console.log(`Verification summary for ${fileType}s:`);
  console.log(`  - Total files checked: ${filePaths.length}`);
  console.log(`  - Successfully verified: ${verified}`);
  console.log(`  - ${CONFIG.enableDryRun ? 'Would delete' : 'Deleted'}: ${deleted}`);
  console.log(`  - Missing from database: ${missing}`);
  console.log(`  - Data verification failures: ${dataCorrupted}`);
  console.log(`  - Processing errors: ${errors}`);
  if (spaceFreed > 0) {
    console.log(`  - Space ${CONFIG.enableDryRun ? 'would be' : ''} freed: ${(spaceFreed / 1024 / 1024).toFixed(2)} MB`);
  }
  
  return { verified, deleted, errors, missing, dataCorrupted, spaceFreed };
}

// Create detailed verification log
async function createVerificationLog(runPath, runId, logEntries, stats) {
  try {
    const logData = {
      runId,
      verificationDate: new Date().toISOString(),
      configuration: CONFIG,
      summary: stats,
      entries: logEntries
    };
    
    const logPath = path.join(runPath, `verification-log-${Date.now()}.json`);
    await fs.writeFile(logPath, JSON.stringify(logData, null, 2));
    console.log(`Created verification log: ${logPath}`);
  } catch (err) {
    console.error('Error creating verification log:', err);
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
        // Skip database files and log files
        if (entry.name.endsWith('.sqlite') || entry.name.includes('log')) {
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

// Parse command line arguments for configuration
function parseCommandLineArgs() {
  const args = process.argv.slice(2); // Skip node and script name
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    // Check if it's a flag
    if (arg.startsWith('--')) {
      switch (arg) {
        case '--dry-run':
          CONFIG.enableDryRun = true;
          console.log('Dry run mode enabled - no files will be deleted');
          break;
        case '--no-integrity-check':
          CONFIG.verifyDataIntegrity = false;
          console.log('Data integrity verification disabled');
          break;
        case '--no-confirmation':
          CONFIG.requireUserConfirmation = false;
          console.log('User confirmation disabled');
          break;
        case '--no-log':
          CONFIG.createVerificationLog = false;
          console.log('Verification logging disabled');
          break;
        default:
          if (arg.startsWith('--batch-size=')) {
            CONFIG.batchSize = parseInt(arg.split('=')[1]);
            console.log(`Batch size set to ${CONFIG.batchSize}`);
          } else {
            console.log(`Unknown flag: ${arg}`);
          }
      }
    } else {
      // It's not a flag, so treat it as the base directory
      // Only use the first non-flag argument as base directory
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
console.log('\n=== CONFIGURATION ===');
console.log(`Base directory: ${EVORUNS_BASE_DIR}`);
console.log(`Dry run: ${CONFIG.enableDryRun}`);
console.log(`Data integrity verification: ${CONFIG.verifyDataIntegrity}`);
console.log(`User confirmation required: ${CONFIG.requireUserConfirmation}`);
console.log(`Create verification log: ${CONFIG.createVerificationLog}`);
console.log(`Batch size: ${CONFIG.batchSize}`);
console.log('========================\n');

// Run the verification and cleanup process
verifyAndCleanup().catch(err => {
  console.error('Unhandled error in verification process:', err);
  rl.close();
  process.exit(1);
});