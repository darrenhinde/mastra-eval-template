#!/usr/bin/env tsx

/**
 * Test script for OpenAI embedding functionality
 * Only runs if OPENAI_API_KEY is available
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
    id: 'test-chunk-openai-1',
    docId: 'test-doc-openai-1',
    text: 'This is a test chunk about artificial intelligence and machine learning using OpenAI embeddings.',
    metadata: {
      source: 'test-document.md',
      section: 'introduction',
      tokens: 15,
      seq: 0,
      keywords: ['AI', 'machine learning', 'OpenAI'],
    },
  },
];

async function testOpenAIEmbeddings() {
  console.log('🧪 Testing OpenAI embedding functionality...\n');
  
  // Check if OpenAI API key is available
  if (!process.env.OPENAI_API_KEY) {
    console.log('⚠️  OPENAI_API_KEY not found, skipping OpenAI embedding test');
    console.log('   Set OPENAI_API_KEY in your .env file to test OpenAI embeddings');
    return;
  }
  
  // Set environment to use OpenAI
  process.env.EMBEDDING_PROVIDER = 'openai';
  process.env.EMBEDDING_MODEL = 'text-embedding-3-small';
  process.env.EMBEDDING_DIM = '1536';
  
  try {
    // Test 1: Generate embeddings
    console.log('📊 Test 1: Generating OpenAI embeddings...');
    const embeddingRecords = await embedChunks(testChunks);
    
    console.log(`✅ Generated ${embeddingRecords.length} embeddings`);
    console.log(`   Provider: ${embeddingRecords[0].provider}`);
    console.log(`   Model: ${embeddingRecords[0].model}`);
    console.log(`   Dimension: ${embeddingRecords[0].embeddingDim}`);
    console.log(`   Vector sample: [${embeddingRecords[0].vector.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    
    // Validate dimension
    if (embeddingRecords[0].embeddingDim !== 1536) {
      throw new Error(`Expected 1536 dimensions, got ${embeddingRecords[0].embeddingDim}`);
    }
    
    // Test 2: Upsert to LanceDB
    console.log('\n💾 Test 2: Upserting to LanceDB...');
    const tableName = 'test_openai_embeddings';
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
    
    console.log('\n🎉 OpenAI embedding tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run tests
testOpenAIEmbeddings().catch(console.error);