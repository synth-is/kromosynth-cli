#!/usr/bin/env node

/**
 * Test KuzuDB population with the real evolutionary simulation
 */

import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

console.log('🧬 Testing KuzuDB Population with Real Evolution Simulation\n');

const testEvolutionRunId = '01JRGMDENVYG8E1Q9WQF446FT1_evoConf_singleMap_refSingleEmbeddings_x100_mfcc-sans0-statistics_pca_retrainIncr50_zscoreNSynthTrain_AURORA-XCon_hnsw_gridSearch_m0.5_lr0.005_e200_random';
const evoRunPath = `evoruns_2/${testEvolutionRunId}`;
const configFile = 'conf/evolution-run-config-evoruns2.jsonc';

async function main() {
  console.log(`🎯 Testing with evolution run:`);
  console.log(`   ID: ${testEvolutionRunId}`);
  console.log(`   Path: ${evoRunPath}`);
  console.log(`   Config: ${configFile}\n`);

  // Check if the evolution run exists
  if (!fs.existsSync(evoRunPath)) {
    console.log(`❌ Evolution run not found: ${evoRunPath}`);
    return;
  }
  console.log(`✅ Evolution run found`);

  // Check for elite map file
  const eliteMapFile = `${evoRunPath}/elites_${testEvolutionRunId}_customRef1.json`;
  if (!fs.existsSync(eliteMapFile)) {
    console.log(`❌ Elite map file not found: ${eliteMapFile}`);
    return;
  }
  console.log(`✅ Elite map file found`);

  // Test 1: First try lineage extraction to make sure that works
  console.log('\n📊 Step 1: Testing lineage extraction...');
  try {
    const { stdout: lineageStdout, stderr: lineageStderr } = await execAsync(
      `node kromosynth.js evo-run-lineage --evolution-run-config-json-file ${configFile} --evolution-run-id ${testEvolutionRunId} --step-size 100`,
      { maxBuffer: 1024 * 1024 * 10 } // 10MB buffer for large lineage data
    );
    
    console.log(`✅ Lineage extraction successful! (${lineageStdout.length} chars output)`);
    
    if (lineageStderr) {
      console.log(`⚠️  Lineage stderr: ${lineageStderr.substring(0, 200)}...`);
    }
    
  } catch (error) {
    console.error('❌ Lineage extraction failed:', error.message);
    console.log('stdout:', error.stdout?.substring(0, 500));
    console.log('stderr:', error.stderr?.substring(0, 500));
    return;
  }

  // Test 2: Now test KuzuDB population
  console.log('\n🗄️  Step 2: Testing KuzuDB population...');
  try {
    const startTime = Date.now();
    
    const { stdout, stderr } = await execAsync(
      `node kromosynth.js evo-run-populate-kuzudb --evolution-run-config-json-file ${configFile} --evolution-run-id ${testEvolutionRunId} --step-size 100`,
      { maxBuffer: 1024 * 1024 * 10 } // 10MB buffer
    );
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`✅ KuzuDB population completed in ${duration}s`);
    console.log('\n📤 CLI Output:');
    console.log(stdout);
    
    if (stderr) {
      console.log('\n⚠️  Stderr:');
      console.log(stderr);
    }
    
    // Check if database was created
    const dbPath = `${evoRunPath}/${testEvolutionRunId}.kuzu`;
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      console.log(`\n🎉 SUCCESS! Database created:`);
      console.log(`   Path: ${dbPath}`);
      console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   Created: ${stats.birthtime}`);
      
      // Try to get some basic stats from the database
      console.log('\n🔍 Testing database queries...');
      try {
        // We'll just verify the file exists and has reasonable size
        if (stats.size > 1024) { // At least 1KB
          console.log('✅ Database appears to contain data');
        } else {
          console.log('⚠️  Database is quite small, may be empty');
        }
      } catch (queryError) {
        console.log('⚠️  Could not query database:', queryError.message);
      }
      
    } else {
      console.log(`❌ Database file not found at: ${dbPath}`);
    }
    
  } catch (error) {
    console.error('❌ KuzuDB population failed:', error.message);
    if (error.stdout) {
      console.log('\n📤 stdout:');
      console.log(error.stdout.substring(0, 1000));
    }
    if (error.stderr) {
      console.log('\n📤 stderr:');
      console.log(error.stderr.substring(0, 1000));
    }
  }

  console.log('\n✨ Test completed!');
}

main().catch(console.error);
