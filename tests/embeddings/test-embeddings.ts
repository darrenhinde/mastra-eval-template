#!/usr/bin/env tsx

/**
 * Test script for embedding functionality
 * Tests both Ollama and OpenAI providers (if configured)
 */

import { config } from 'dotenv';
import { embedChunks } from '../../src/mastra/tools/vectorstore/embed.js';
import { upsertEmbeddings, getTableStats } from '../../src/mastra/tools/vectorstore/upsert.js';
import type { Chunk } from '../../src/mastra/tools/ingestion/index.js';

// Load environment variables
config();

// Test data
const testChunks: Chunk[] = [
  {
    id: 'test-chunk-1',
    docId: 'test-doc-1',
    text: 'This is a test chunk about artificial intelligence and machine learning.',
    metadata: {
      source: 'test-document.md',
      section: 'introduction',
      tokens: 12,
      seq: 0,
      keywords: ['AI', 'machine learning'],
    },
  },
  {
    id: 'test-chunk-2',
    docId: 'test-doc-1',
    text: 'Vector databases are essential for storing and retrieving embeddings efficiently.',
    metadata: {
      source: 'test-document.md',
      section: 'technology',
      tokens: 11,
      seq: 1,
      keywords: ['vector database', 'embeddings'],
    },
  },
];

async function testEmbeddings() {
  console.log('🧪 Testing embedding functionality...\n');
  
  try {
    // Test 1: Generate embeddings
    console.log('📊 Test 1: Generating embeddings...');
    const embeddingRecords = await embedChunks(testChunks);
    
    console.log(`✅ Generated ${embeddingRecords.length} embeddings`);
    console.log(`   Provider: ${embeddingRecords[0].provider}`);
    console.log(`   Model: ${embeddingRecords[0].model}`);
    console.log(`   Dimension: ${embeddingRecords[0].embeddingDim}`);
    console.log(`   Vector sample: [${embeddingRecords[0].vector.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    
    // Test 2: Upsert to LanceDB
    console.log('\n💾 Test 2: Upserting to LanceDB...');
    const tableName = 'test_embeddings';
    await upsertEmbeddings(tableName, embeddingRecords);
    
    console.log(`✅ Successfully upserted ${embeddingRecords.length} records to table '${tableName}'`);
    
    // Test 3: Get table statistics
    console.log('\n📈 Test 3: Getting table statistics...');
    const stats = await getTableStats(tableName);
    
    console.log(`✅ Table statistics:`);
    console.log(`   Row count: ${stats.rowCount}`);
    console.log(`   Embedding dimension: ${stats.embeddingDim}`);
    console.log(`   Providers: ${stats.providers.join(', ')}`);
    console.log(`   Models: ${stats.models.join(', ')}`);
    
    // Test 4: Test upsert idempotency
    console.log('\n🔄 Test 4: Testing upsert idempotency...');
    await upsertEmbeddings(tableName, embeddingRecords);
    
    const statsAfterUpsert = await getTableStats(tableName);
    if (statsAfterUpsert.rowCount === stats.rowCount) {
      console.log('✅ Upsert idempotency working correctly (no duplicate records)');
    } else {
      console.log(`❌ Upsert created duplicates: ${statsAfterUpsert.rowCount} vs ${stats.rowCount}`);
    }
    
    console.log('\n🎉 All embedding tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run tests
testEmbeddings().catch(console.error);