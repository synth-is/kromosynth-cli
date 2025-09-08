#!/usr/bin/env node

/**
 * Simple unit test for KuzuDB integration functions
 */

import { initializeKuzuDB, populateKuzuDBWithLineage } from './kuzu-db-integration.js';
import fs from 'fs';

console.log('🧪 Testing KuzuDB integration functions directly...\n');

async function testBasicFunctions() {
  const testDbPath = './test-kuzu-basic.kuzu';
  
  try {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    }

    console.log('1️⃣  Testing initializeKuzuDB...');
    const initResult = await initializeKuzuDB(testDbPath);
    console.log('✅ Database initialized:', initResult);

    console.log('\n2️⃣  Testing with mock lineage data...');
    const mockLineageData = [
      {
        id: 'genome_001',
        eliteClass: 'test_class_1',
        gN: 1,
        s: 0.75,
        parents: []
      },
      {
        id: 'genome_002', 
        eliteClass: 'test_class_2',
        gN: 2,
        s: 0.85,
        parents: [{ genomeId: 'genome_001', breedingMethod: 'mutation' }]
      }
    ];

    const mockConfig = {
      evoRunsDirPath: './'
    };

    const populateResult = await populateKuzuDBWithLineage(
      mockConfig, 
      'test-run', 
      mockLineageData,
      { dbPath: testDbPath }
    );

    console.log('✅ Population successful:', populateResult);

    // Check file size
    if (fs.existsSync(testDbPath)) {
      const stats = fs.statSync(testDbPath);
      console.log(`📊 Database size: ${stats.size} bytes`);
      console.log('✅ Database file created successfully');
    }

    // Clean up
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
      console.log('🧹 Cleaned up test database');
    }

    console.log('\n🎉 All basic function tests passed!');

  } catch (error) {
    console.error('❌ Basic function test failed:', error);
    
    // Clean up on error
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    }
  }
}

testBasicFunctions();
