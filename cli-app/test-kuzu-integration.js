#!/usr/bin/env node

/**
 * Test script for KuzuDB integration
 * Run with: node test-kuzu-integration.js
 */

import { initializeKuzuDB, populateKuzuDBWithLineage, findDescendants } from './kuzu-db-integration.js';
import fs from 'fs';
import path from 'path';

async function testKuzuIntegration() {
  console.log('🧬 Testing KuzuDB Integration...\n');
  
  try {
    // Clean up any existing test database and metadata
    const testDbPath = './test-kuzu-db.kuzu';
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    }
    const metadataPath = `${testDbPath}_metadata.json`;
    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
    }
    const logPath = `${testDbPath}_population_log.json`;
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }
    
    // Test 1: Initialize database using the integration function
    console.log('📊 Test 1: Initialize KuzuDB using integration function');
    const dbContext = await initializeKuzuDB(testDbPath);
    console.log('✅ Database initialized successfully');
    console.log(`   Database path: ${dbContext.dbPath}`);
    console.log(`   Schema version: ${dbContext.metadata.schema_version}`);
    console.log();
    
    // Test 2: Create mock lineage data
    console.log('📊 Test 2: Create mock lineage data');
    const mockLineageData = createMockLineageData();
    console.log(`✅ Created ${mockLineageData.length} mock genomes`);
    console.log();
    
    // Test 3: Populate database using the integration function
    console.log('📊 Test 3: Populate database using integration function');
    const populateResult = await populateKuzuDBWithLineage(
      { label: 'Test Evolution Run' },
      'test-evo-run-001',
      mockLineageData,
      { dbPath: testDbPath }
    );
    
    // Add a small delay to ensure data is flushed
    console.log('Ensuring data persistence...');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('✅ Database populated successfully');
    console.log(`   Total sounds: ${populateResult.stats.total_sounds}`);
    console.log(`   Total generations: ${populateResult.stats.total_generations}`);
    console.log(`   Total relationships: ${populateResult.stats.total_parent_relationships}`);
    console.log();
    
    // Test 4: Query descendants using the integration function
    console.log('📊 Test 4: Query descendants using integration function');
    const rootGenome = mockLineageData.find(g => g.gN === 0);
    if (rootGenome) {
      const descendants = await findDescendants(testDbPath, rootGenome.id, 5);
      console.log(`✅ Found ${descendants.length} descendants of root genome`);
    }
    console.log();
    
    // Test 5: Basic Cypher query test to verify CLI compatibility
    console.log('📊 Test 5: Test CLI compatibility with direct query');
    const kuzu = await import('kuzu');
    const db = new kuzu.Database(testDbPath);
    const conn = new kuzu.Connection(db);
    
    const countResult = await conn.query('MATCH (s:Sound) RETURN count(s) as sound_count');
    const soundCount = await countResult.getAll();
    console.log(`✅ Direct query successful: ${soundCount[0].sound_count} sounds in database`);
    
    const relResult = await conn.query('MATCH ()-[r]->() RETURN count(r) as relationship_count');
    const relCount = await relResult.getAll();
    console.log(`✅ Relationship query successful: ${relCount[0].relationship_count} relationships in database`);
    console.log();
    
    console.log('🎉 All integration tests passed! KuzuDB integration is working correctly.');
    console.log('\n📋 Next steps:');
    console.log('   1. Test CLI compatibility with: kuzu ' + testDbPath);
    console.log('   2. Try queries: MATCH (s:Sound) RETURN count(s);');
    console.log('   3. Try queries: MATCH (s:Sound) RETURN s.id, s.elite_class;');
    console.log('   4. Try queries: MATCH (a:Sound)-[r:PARENT_OF]->(b:Sound) RETURN a.id, b.id;');
    console.log('   5. Use integration functions in your main workflow');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    console.error('\n🔍 Troubleshooting tips:');
    console.error('   1. Make sure `npm install kuzu` was successful');
    console.error('   2. Check that you have write permissions in the current directory');
    console.error('   3. Verify Node.js version compatibility');
    console.error('   4. Check kuzu-db-integration.js for any syntax errors');
  }
}

/**
 * Create mock lineage data for testing
 */
function createMockLineageData() {
  const mockData = [];
  
  // Create root genome (generation 0)
  const rootGenome = {
    id: 'root-genome-001',
    gN: 0,
    s: 0.85,
    eliteClass: 'pioneer',
    terrain: 'exploration',
    duration: 1.0,
    noteDelta: 0,
    velocity: 1.0,
    uBC: 0,
    parents: []
  };
  mockData.push(rootGenome);
  
  // Create children (generation 1)
  for (let i = 0; i < 3; i++) {
    const childGenome = {
      id: `child-genome-00${i + 1}`,
      gN: 1,
      s: 0.75 + Math.random() * 0.2,
      eliteClass: 'explorer',
      terrain: 'diversification',
      duration: 0.8 + Math.random() * 0.4,
      noteDelta: Math.floor(Math.random() * 12) - 6,
      velocity: 0.5 + Math.random() * 1.0,
      uBC: Math.floor(Math.random() * 5),
      parents: [{
        genomeId: rootGenome.id,
        breedingMethod: 'mutation',
        mutationRate: 0.1
      }]
    };
    mockData.push(childGenome);
  }
  
  // Create grandchildren (generation 2)
  const parentIds = mockData.filter(g => g.gN === 1).map(g => g.id);
  for (let i = 0; i < 5; i++) {
    const parentId = parentIds[Math.floor(Math.random() * parentIds.length)];
    const grandchildGenome = {
      id: `grandchild-genome-00${i + 1}`,
      gN: 2,
      s: 0.6 + Math.random() * 0.3,
      eliteClass: 'specialist',
      terrain: 'optimization',
      duration: 0.5 + Math.random() * 1.0,
      noteDelta: Math.floor(Math.random() * 24) - 12,
      velocity: 0.3 + Math.random() * 1.4,
      uBC: Math.floor(Math.random() * 10),
      parents: [{
        genomeId: parentId,
        breedingMethod: 'crossover',
        mutationRate: 0.05
      }]
    };
    mockData.push(grandchildGenome);
  }
  
  return mockData;
}

// Handle command line arguments for real data testing
if (process.argv.includes('--real-data')) {
  console.log('🔬 Real data testing not implemented yet');
  console.log('   This would load actual evolution run data from your evoruns directory');
} else {
  testKuzuIntegration();
}
