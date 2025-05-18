// test-sqlite-persistence.js
import { NodePersistenceProvider } from '../providers/node/persistence.js';
import { getRunDB, createRunDB } from '../util/genome-db.js';
import fs from 'fs-extra';
import path from 'path';
import { ulid } from 'ulid';

/**
 * Tests the functionality of the SQLite persistence provider
 */
async function testSQLitePersistenceProvider() {
  console.log("=== Testing SQLite Persistence Provider ===");
  
  // Create a test run directory
  const testRunId = ulid();
  const testRunPath = path.join(process.cwd(), 'test-run-' + testRunId);
  
  try {
    // Create directory
    fs.mkdirSync(testRunPath, { recursive: true });
    console.log(`Created test directory: ${testRunPath}`);
    
    // Initialize persistence provider
    const persistence = new NodePersistenceProvider();
    
    // Test without SQLite first (file fallback)
    console.log("\n1. Testing file-based storage (no SQLite):");
    
    // Create test genome
    const testGenome = {
      id: "test1",
      data: { test: "This is test genome data" }
    };
    
    // Save test genome to disk
    console.log("  Saving test genome to disk...");
    await persistence.saveGenomeToDisk(testGenome, testRunId, "test1", testRunPath, false);
    
    // Read test genome from disk
    console.log("  Reading test genome from disk...");
    const genomeString = await persistence.readGenomeAndMetaFromDisk(testRunId, "test1", testRunPath);
    const genome = JSON.parse(genomeString);
    
    console.log("  Genome found:", genome._id === `genome_${testRunId}_test1` ? "✅" : "❌");
    
    // Now test SQLite
    console.log("\n2. Testing SQLite storage:");
    
    // Create SQLite database
    console.log("  Creating SQLite databases...");
    const db = createRunDB(testRunPath);
    
    // Test genome
    const testGenome2 = {
      id: "test2",
      data: { test: "This is SQLite test genome data" }
    };
    
    // Save genome to SQLite
    console.log("  Saving genome to SQLite...");
    await persistence.saveGenomeToDisk(testGenome2, testRunId, "test2", testRunPath, false);
    
    // Read from SQLite
    console.log("  Reading genome from SQLite...");
    const genomeString2 = await persistence.readGenomeAndMetaFromDisk(testRunId, "test2", testRunPath);
    const genome2 = JSON.parse(genomeString2);
    
    console.log("  SQLite genome found:", genome2._id === `genome_${testRunId}_test2` ? "✅" : "❌");
    
    // Test fallback to file if not in SQLite
    console.log("\n3. Testing fallback to file if not in SQLite:");
    
    // Save genome to file but not SQLite
    const testGenome3 = {
      id: "test3",
      data: { test: "This is fallback test data" }
    };
    
    // Bypass the SQLite storage and save directly to file
    fs.mkdirSync(path.join(testRunPath, 'cellFeatures'), { recursive: true });
    fs.writeFileSync(
      path.join(testRunPath, `genome_${testRunId}_test3.json`),
      JSON.stringify({
        _id: `genome_${testRunId}_test3`,
        genome: testGenome3
      })
    );
    
    // Now try to read it with persistence provider
    console.log("  Reading genome with fallback...");
    const genomeString3 = await persistence.readGenomeAndMetaFromDisk(testRunId, "test3", testRunPath);
    
    if (genomeString3) {
      const genome3 = JSON.parse(genomeString3);
      console.log("  Fallback genome found:", genome3._id === `genome_${testRunId}_test3` ? "✅" : "❌");
    } else {
      console.log("  Fallback genome not found: ❌");
    }
    
    console.log("\nTests completed!");
    
  } catch (error) {
    console.error("Error in tests:", error);
  } finally {
    // Clean up test directory
    fs.removeSync(testRunPath);
    console.log(`\nCleaned up test directory: ${testRunPath}`);
  }
}

testSQLitePersistenceProvider().catch(err => {
  console.error("Unhandled error in tests:", err);
});
