#!/usr/bin/env tsx

import { config } from 'dotenv';
import { strict as assert } from 'assert';
import { rm, mkdir } from 'fs/promises';
import { resolve } from 'path';

config();

// Use test LanceDB path
process.env.LANCEDB_PATH = './data/lancedb/test_integration.lance';
process.env.EMBEDDING_DIM = '768';

import { runIngestion } from '../../src/mastra/tools/ingestion/workflow.js';
import { deterministicEmbed } from './mocks/integration-embed.ts';
import { upsertEmbeddingsInBatches } from '../../src/mastra/tools/vectorstore/upsert.js';
import { retrieve } from '../../src/mastra/tools/retrieval/retrieve.js';

async function cleanTestDb() {
  try {
    await rm(process.env.LANCEDB_PATH!, { recursive: true, force: true });
  } catch (e) {
    // ignore
  }
  await mkdir(process.env.LANCEDB_PATH!, { recursive: true });
}

async function runTest() {
  await cleanTestDb();

  const fixturesPath = resolve('./tests/retrieval/fixtures');

  // Run ingestion without embedding/storage to get chunks
  const result = await runIngestion({ inputPath: fixturesPath, embedAndStore: false, tableName: 'test_chunks' });
  console.log('Ingestion produced chunks:', result.summary.totalChunks);
  assert(result.summary.totalChunks > 0, 'No chunks produced by ingestion');

  // Build EmbeddingRecords from chunks
  const records = result.chunks.map(chunk => {
    const vec = deterministicEmbed(chunk.text, 8);
    return {
      id: chunk.id,
      docId: chunk.docId,
      vector: vec,
      text: chunk.text,
      section: chunk.metadata.section,
      date: chunk.metadata.date,
      source: chunk.metadata.source,
      keywords: chunk.metadata.keywords ? JSON.stringify(chunk.metadata.keywords) : undefined,
      tokens: chunk.metadata.tokens,
      seq: chunk.metadata.seq,
      provider: 'test',
      model: 'deterministic',
      embeddingDim: vec.length,
      create_time: Date.now(),
    };
  });

  // Upsert to LanceDB
  await upsertEmbeddingsInBatches('test_chunks', records, 100);

  // Run retrieval for a query expected to match doc1
  const q = 'deep learning vision';
  const retrieved = await retrieve(q, undefined, { tableName: 'test_chunks', k: 5 });
  console.log('Retrieved ids:', retrieved.map(r => r.id));
  assert(retrieved.length > 0, 'No retrieval results');

  // Expect top result to be from Doc One
  const top = retrieved[0];
  console.log('Top result text snippet:', top.text.slice(0, 80));
  assert(top.text.toLowerCase().includes('deep learning') || top.text.toLowerCase().includes('machine learning'), 'Top result not relevant');

  // Test filter: source equals doc1's source
  const source = result.chunks[0].metadata.source;
  const filtered = await retrieve('machine learning', { source: [source] }, { tableName: 'test_chunks', k: 10 });
  assert(filtered.every(f => f.source === source), 'Filter by source failed');

  console.log('✅ Integration test passed');
}

runTest().catch(err => { console.error(err); process.exit(1); });
