#!/usr/bin/env tsx

import { runIngestion } from '../../src/mastra/tools/ingestion/workflow.js';
import { detectMime, parseDocument, cleanText, extractMetadataHybrid } from '../../src/mastra/tools/ingestion/index.js';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

async function runTest(name: string, testFn: () => Promise<boolean | { passed: boolean; message: string; details?: any }>): Promise<TestResult> {
  try {
    console.log(`🧪 Running: ${name}`);
    const result = await testFn();
    
    if (typeof result === 'boolean') {
      return {
        name,
        passed: result,
        message: result ? 'Passed' : 'Failed'
      };
    } else {
      return {
        name,
        passed: result.passed,
        message: result.message,
        details: result.details
      };
    }
  } catch (error) {
    return {
      name,
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

async function main() {
  console.log('🚀 Running Ingestion Pipeline Test Suite\n');
  
  const tests: TestResult[] = [];
  
  // Test 1: Basic ingestion functionality
  tests.push(await runTest('Basic Ingestion - All Fixtures', async () => {
    const result = await runIngestion({
      inputPath: './tests/ingestion/fixtures',
      chunkingOptions: {
        strategy: 'paragraph',
        overlapRatio: 0.1,
        maxTokens: 512,
      },
    });
    
    return {
      passed: result.summary.processedFiles > 0 && result.summary.totalChunks > 0,
      message: `Processed ${result.summary.processedFiles} files, generated ${result.summary.totalChunks} chunks`,
      details: result.summary
    };
  }));
  
  // Test 2: Metadata extraction accuracy
  tests.push(await runTest('Metadata Extraction - Policy Document', async () => {
    const mime = await detectMime('./tests/ingestion/fixtures/policy.md');
    const parsed = await parseDocument('./tests/ingestion/fixtures/policy.md', mime);
    const metadata = extractMetadataHybrid(parsed.text);
    
    const hasAuthor = metadata.author === 'John Smith';
    const hasDate = metadata.date === 'December 15, 2023';
    const hasTitle = metadata.title === 'Company Policy Document';
    
    return {
      passed: hasAuthor && hasDate && hasTitle,
      message: `Author: ${hasAuthor ? '✅' : '❌'}, Date: ${hasDate ? '✅' : '❌'}, Title: ${hasTitle ? '✅' : '❌'}`,
      details: metadata
    };
  }));
  
  // Test 3: Chunking strategies
  tests.push(await runTest('Chunking Strategies Comparison', async () => {
    const strategies = ['paragraph', 'sentence', 'section'] as const;
    const results: Record<string, number> = {};
    
    for (const strategy of strategies) {
      const result = await runIngestion({
        inputPath: './tests/ingestion/fixtures/large-document.md',
        chunkingOptions: {
          strategy,
          overlapRatio: 0.1,
          maxTokens: 256,
        },
      });
      results[strategy] = result.summary.totalChunks;
    }
    
    const allStrategiesWork = Object.values(results).every(count => count > 0);
    const hasVariation = new Set(Object.values(results)).size > 1;
    
    return {
      passed: allStrategiesWork && hasVariation,
      message: `All strategies produce chunks with variation: ${allStrategiesWork && hasVariation ? '✅' : '❌'}`,
      details: results
    };
  }));
  
  // Test 4: Error handling
  tests.push(await runTest('Error Handling - Non-existent Path', async () => {
    try {
      await runIngestion({
        inputPath: './non-existent-path',
      });
      return { passed: false, message: 'Should have thrown an error' };
    } catch (error) {
      return {
        passed: true,
        message: 'Correctly handled non-existent path',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }));
  
  // Test 5: Minimal document handling
  tests.push(await runTest('Minimal Document Processing', async () => {
    const result = await runIngestion({
      inputPath: './tests/ingestion/fixtures/minimal.md',
    });
    
    return {
      passed: result.summary.processedFiles === 1 && result.summary.totalChunks >= 1,
      message: `Processed minimal document: ${result.summary.totalChunks} chunks`,
      details: result.summary
    };
  }));
  
  // Test 6: Large document chunking
  tests.push(await runTest('Large Document Chunking', async () => {
    const result = await runIngestion({
      inputPath: './tests/ingestion/fixtures/large-document.md',
      chunkingOptions: {
        strategy: 'paragraph',
        overlapRatio: 0.1,
        maxTokens: 128, // Smaller chunks to force more splitting
      },
    });
    
    const hasMultipleChunks = result.summary.totalChunks >= 5;
    const allChunksHaveContent = result.chunks.every(chunk => chunk.text.trim().length > 0);
    
    return {
      passed: hasMultipleChunks && allChunksHaveContent,
      message: `Generated ${result.summary.totalChunks} chunks, all with content: ${hasMultipleChunks && allChunksHaveContent ? '✅' : '❌'}`,
      details: {
        totalChunks: result.summary.totalChunks,
        avgTokens: Math.round(result.chunks.reduce((sum, chunk) => sum + chunk.metadata.tokens, 0) / result.chunks.length)
      }
    };
  }));
  
  // Print results
  console.log('\n📊 TEST RESULTS:\n');
  
  let passed = 0;
  let failed = 0;
  
  tests.forEach((test, index) => {
    const status = test.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${index + 1}. ${test.name}: ${status}`);
    console.log(`   ${test.message}`);
    
    if (test.details) {
      console.log(`   Details: ${JSON.stringify(test.details, null, 2).split('\n').join('\n   ')}`);
    }
    
    console.log('');
    
    if (test.passed) {
      passed++;
    } else {
      failed++;
    }
  });
  
  console.log(`📈 SUMMARY: ${passed} passed, ${failed} failed, ${tests.length} total`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}