#!/usr/bin/env node

/**
 * Minimal test to find the exact pattern for Node.js->CLI persistence
 */

async function minimalPersistenceTest() {
  console.log('Testing minimal persistence patterns...\n');
  
  try {
    const fs = await import('fs');
    const kuzu = await import('kuzu');
    
    // Test 1: Exact documentation example
    console.log('=== Test 1: Exact documentation example ===');
    const dbPath1 = './persist-test-1.kuzu';
    if (fs.existsSync(dbPath1)) fs.rmSync(dbPath1, { recursive: true, force: true });
    
    const db1 = new kuzu.Database(dbPath1);
    const conn1 = new kuzu.Connection(db1);
    
    // Create schema exactly like docs
    await conn1.query("CREATE NODE TABLE User(name STRING PRIMARY KEY, age INT64)");
    
    // Insert exactly like docs example
    await conn1.query("CREATE (u:User {name: 'Alice', age: 35})");
    
    console.log('Documentation example completed');
    console.log('Test CLI: kuzu', dbPath1);
    console.log('Query: MATCH (u:User) RETURN u.name, u.age;');
    console.log();
    
    // Test 2: Documentation example + explicit connection close
    console.log('=== Test 2: Documentation example + connection management ===');
    const dbPath2 = './persist-test-2.kuzu';
    if (fs.existsSync(dbPath2)) fs.rmSync(dbPath2, { recursive: true, force: true });
    
    const db2 = new kuzu.Database(dbPath2);
    const conn2 = new kuzu.Connection(db2);
    
    await conn2.query("CREATE NODE TABLE User(name STRING PRIMARY KEY, age INT64)");
    await conn2.query("CREATE (u:User {name: 'Bob', age: 42})");
    
    // Verify within same connection
    const result = await conn2.query("MATCH (u:User) RETURN u.name");
    const rows = await result.getAll();
    console.log('Node.js verification:', rows);
    
    // Try explicit close (if available)
    try {
      if (typeof conn2.close === 'function') {
        conn2.close();
        console.log('Connection explicitly closed');
      }
      if (typeof db2.close === 'function') {
        db2.close();
        console.log('Database explicitly closed');
      }
    } catch (e) {
      console.log('No explicit close methods available');
    }
    
    console.log('Test CLI: kuzu', dbPath2);
    console.log('Query: MATCH (u:User) RETURN u.name, u.age;');
    console.log();
    
    // Test 3: Documentation example + force garbage collection
    console.log('=== Test 3: Documentation example + garbage collection ===');
    const dbPath3 = './persist-test-3.kuzu';
    if (fs.existsSync(dbPath3)) fs.rmSync(dbPath3, { recursive: true, force: true });
    
    // Scope the connection to force cleanup
    {
      const db3 = new kuzu.Database(dbPath3);
      const conn3 = new kuzu.Connection(db3);
      
      await conn3.query("CREATE NODE TABLE User(name STRING PRIMARY KEY, age INT64)");
      await conn3.query("CREATE (u:User {name: 'Charlie', age: 28})");
      
      console.log('Data inserted, forcing cleanup...');
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('Garbage collection forced');
    }
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('Test CLI: kuzu', dbPath3);
    console.log('Query: MATCH (u:User) RETURN u.name, u.age;');
    console.log();
    
    console.log('Test all three databases in CLI to see which pattern works');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

minimalPersistenceTest();
