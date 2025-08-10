#!/usr/bin/env tsx

import { config } from 'dotenv';
import { strict as assert } from 'assert';
import { rm, mkdir } from 'fs/promises';
import { resolve } from 'path';

config();

// Use test LanceDB path and Ollama settings
process.env.LANCEDB_PATH = './data/lancedb/test_ollama';
process.env.EMBEDDING_PROVIDER = 'ollama';
process.env.EMBEDDING_MODEL = 'nomic-embed-text';
process.env.EMBEDDING_DIM = '768';
process.env.OLLAMA_BASE_URL = 'http://localhost:11434';

import { runIngestion } from '../../src/mastra/tools/ingestion/workflow.js';
import { retrieve } from '../../src/mastra/tools/retrieval/retrieve.js';
import { assembleContext } from '../../src/mastra/tools/retrieval/assemble.js';

async function cleanTestDb() {
  try {
    await rm(process.env.LANCEDB_PATH!, { recursive: true, force: true });
  } catch (e) {
    // ignore if doesn't exist
  }
  await mkdir(process.env.LANCEDB_PATH!, { recursive: true });
}

async function testOllamaRetrieval() {
  console.log('🧪 Testing Ollama-based retrieval system...\n');
  
  // Step 1: Clean and setup test database
  console.log('🧹 Cleaning test database...');
  await cleanTestDb();
  
  // Step 2: Ingest test documents
  console.log('📚 Ingesting test documents...');
  const fixturesPath = resolve('./tests/retrieval/fixtures');
  
  const result = await runIngestion({
    inputPath: fixturesPath,
    chunkingOptions: {
      strategy: 'paragraph',
      overlapRatio: 0.1,
      maxTokens: 256,
    },
    embedAndStore: true,
    tableName: 'test_ollama_chunks',
  });
  
  console.log(`✅ Ingested ${result.summary.totalChunks} chunks from ${result.summary.processedFiles} files\n`);
  assert(result.summary.totalChunks > 0, 'No chunks were created during ingestion');
  assert(result.summary.storedChunks! > 0, 'No chunks were stored in the database');
  
  // Step 3: Test AI/ML query - should return AI document chunks
  console.log('🔍 Testing AI/ML query...');
  const aiQuery = 'deep learning neural networks artificial intelligence';
  const aiResults = await retrieve(aiQuery, undefined, {
    tableName: 'test_ollama_chunks',
    k: 5,
    minScore: 0.1
  });
  
  console.log(`   Retrieved ${aiResults.length} chunks`);
  console.log(`   Top result score: ${aiResults[0]?.score.toFixed(3)}`);
  console.log(`   Top result source: ${aiResults[0]?.source}`);
  
  // Verify AI document is top result
  assert(aiResults.length > 0, 'No results for AI query');
  const topResult = aiResults[0];
  assert(topResult.source.includes('ai-document'), 
    `Expected AI document as top result, got: ${topResult.source}`);
  assert(topResult.score > 0.3, 
    `Expected higher relevance score, got: ${topResult.score}`);
  
  // Step 4: Test cooking query - should return cooking document chunks
  console.log('🍳 Testing cooking query...');
  const cookingQuery = 'recipes cooking techniques kitchen ingredients';
  const cookingResults = await retrieve(cookingQuery, undefined, {
    tableName: 'test_ollama_chunks',
    k: 5,
    minScore: 0.1
  });
  
  console.log(`   Retrieved ${cookingResults.length} chunks`);
  console.log(`   Top result score: ${cookingResults[0]?.score.toFixed(3)}`);
  console.log(`   Top result source: ${cookingResults[0]?.source}`);
  
  // Verify cooking document is top result
  assert(cookingResults.length > 0, 'No results for cooking query');
  const topCookingResult = cookingResults[0];
  assert(topCookingResult.source.includes('cooking-document'), 
    `Expected cooking document as top result, got: ${topCookingResult.source}`);
  assert(topCookingResult.score > 0.3, 
    `Expected higher relevance score, got: ${topCookingResult.score}`);
  
  // Step 5: Test finance query - should return finance document chunks
  console.log('💰 Testing finance query...');
  const financeQuery = 'investment portfolio budgeting retirement planning';
  const financeResults = await retrieve(financeQuery, undefined, {
    tableName: 'test_ollama_chunks',
    k: 5,
    minScore: 0.1
  });
  
  console.log(`   Retrieved ${financeResults.length} chunks`);
  console.log(`   Top result score: ${financeResults[0]?.score.toFixed(3)}`);
  console.log(`   Top result source: ${financeResults[0]?.source}`);
  
  // Verify finance document is top result
  assert(financeResults.length > 0, 'No results for finance query');
  const topFinanceResult = financeResults[0];
  assert(topFinanceResult.source.includes('finance-document'), 
    `Expected finance document as top result, got: ${topFinanceResult.source}`);
  assert(topFinanceResult.score > 0.3, 
    `Expected higher relevance score, got: ${topFinanceResult.score}`);
  
  // Step 6: Test cross-topic query - verify AI content is retrieved
  console.log('🔀 Testing cross-topic discrimination...');
  const specificQuery = 'neural networks computer vision';
  const specificResults = await retrieve(specificQuery, undefined, {
    tableName: 'test_ollama_chunks',
    k: 3,
    minScore: 0.2
  });
  
  // Check that AI-related content is in top results
  const topSpecificResult = specificResults[0];
  const aiSources = specificResults.filter(r => r.source.includes('ai-document') || r.source.includes('doc1'));
  
  console.log(`   Top result source: ${topSpecificResult.source}`);
  console.log(`   Top result score: ${topSpecificResult.score.toFixed(3)}`);
  console.log(`   AI-related chunks in top 3: ${aiSources.length}`);
  
  // Verify AI-related content is retrieved (either ai-document.md or doc1.md which contains AI content)
  assert(aiSources.length > 0, 
    'Expected AI-related content in results for AI-specific query');
  
  // Step 7: Test context assembly
  console.log('📝 Testing context assembly...');
  const assembledContext = assembleContext(aiResults.slice(0, 3), {
    tokenBudget: 500,
    includeCitations: true,
    maxChunks: 3
  });
  
  console.log(`   Assembled context: ${assembledContext.totalTokens} tokens`);
  console.log(`   Used chunks: ${assembledContext.chunks.length}`);
  console.log(`   Truncated: ${assembledContext.truncated}`);
  
  assert(assembledContext.context.length > 0, 'Context assembly failed');
  assert(assembledContext.totalTokens <= 500, 'Context exceeded token budget');
  assert(assembledContext.context.includes('§'), 'Citations not included in context');
  
  // Step 8: Test filtering by source
  console.log('🔍 Testing source filtering...');
  const filteredResults = await retrieve('techniques', 
    { source: ['cooking-document.md'] }, 
    {
      tableName: 'test_ollama_chunks',
      k: 10
    }
  );
  
  console.log(`   Filtered results: ${filteredResults.length}`);
  
  // All results should be from cooking document
  const allFromCooking = filteredResults.every(r => r.source.includes('cooking-document'));
  assert(allFromCooking, 'Source filtering failed - found results from other documents');
  
  console.log('\n🎉 All Ollama retrieval tests passed!');
  console.log('\n📊 Test Summary:');
  console.log(`   ✅ Document ingestion: ${result.summary.totalChunks} chunks`);
  console.log(`   ✅ AI query accuracy: Top result from correct document`);
  console.log(`   ✅ Cooking query accuracy: Top result from correct document`);
  console.log(`   ✅ Finance query accuracy: Top result from correct document`);
  console.log(`   ✅ Topic discrimination: AI-related content retrieved for AI queries`);
  console.log(`   ✅ Context assembly: Proper token budgeting and citations`);
  console.log(`   ✅ Source filtering: Correctly filters by document source`);
}

async function checkOllamaConnection() {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) {
      throw new Error(`Ollama API returned ${response.status}`);
    }
    const data = await response.json();
    const hasNomicEmbed = data.models?.some((m: any) => m.name.includes('nomic-embed-text'));
    
    if (!hasNomicEmbed) {
      console.log('⚠️  nomic-embed-text model not found. Installing...');
      console.log('   Run: ollama pull nomic-embed-text');
      throw new Error('nomic-embed-text model not available');
    }
    
    console.log('✅ Ollama connection verified with nomic-embed-text model');
  } catch (error) {
    console.error('❌ Ollama connection failed:', error instanceof Error ? error.message : error);
    console.error('   Make sure Ollama is running: ollama serve');
    console.error('   And the model is installed: ollama pull nomic-embed-text');
    throw error;
  }
}

async function runTest() {
  try {
    await checkOllamaConnection();
    await testOllamaRetrieval();
  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

runTest();