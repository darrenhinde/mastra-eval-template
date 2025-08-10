#!/usr/bin/env tsx

import { runIngestion } from '../../src/mastra/tools/ingestion/workflow.js';

async function main() {
  console.log('🔍 Inspecting chunk generation and metadata extraction...\n');
  
  try {
    // Test with our sample files
    const result = await runIngestion({
      inputPath: './tests/ingestion/fixtures',
      chunkingOptions: {
        strategy: 'paragraph',
        overlapRatio: 0.1,
        maxTokens: 512,
      },
    });
    
    console.log('\n📊 DETAILED CHUNK INSPECTION:\n');
    
    result.chunks.forEach((chunk, index) => {
      console.log(`\n--- CHUNK ${index + 1} ---`);
      console.log(`ID: ${chunk.id}`);
      console.log(`Doc ID: ${chunk.docId}`);
      console.log(`Source: ${chunk.metadata.source}`);
      console.log(`Tokens: ${chunk.metadata.tokens}`);
      console.log(`Sequence: ${chunk.metadata.seq}`);
      
      // Show metadata extraction results
      console.log('\n📋 EXTRACTED METADATA:');
      console.log(`  Author: ${chunk.metadata.author || 'Not found'}`);
      console.log(`  Date: ${chunk.metadata.date || 'Not found'}`);
      console.log(`  Section: ${chunk.metadata.section || 'Not found'}`);
      console.log(`  Keywords: ${chunk.metadata.keywords?.join(', ') || 'None'}`);
      
      // Show chunk text (truncated)
      console.log('\n📄 CHUNK TEXT:');
      const text = chunk.text.length > 200 ? chunk.text.substring(0, 200) + '...' : chunk.text;
      console.log(`"${text}"`);
      
      console.log('\n' + '='.repeat(60));
    });
    
    // Test different chunking strategies
    console.log('\n\n🧪 TESTING DIFFERENT CHUNKING STRATEGIES:\n');
    
    const strategies = ['paragraph', 'sentence', 'section'] as const;
    
    for (const strategy of strategies) {
      console.log(`\n--- TESTING ${strategy.toUpperCase()} STRATEGY ---`);
      
      const strategyResult = await runIngestion({
        inputPath: './tests/ingestion/fixtures/sample.md',
        chunkingOptions: {
          strategy,
          overlapRatio: 0.1,
          maxTokens: 256, // Smaller for more chunks
        },
      });
      
      console.log(`Generated ${strategyResult.chunks.length} chunks`);
      
      strategyResult.chunks.forEach((chunk, i) => {
        console.log(`  Chunk ${i + 1}: ${chunk.metadata.tokens} tokens - "${chunk.text.substring(0, 50)}..."`);
      });
    }
    
  } catch (error) {
    console.error('❌ Inspection failed:', error);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}