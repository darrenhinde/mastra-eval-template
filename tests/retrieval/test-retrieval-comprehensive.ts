#!/usr/bin/env tsx

import { strict as assert } from 'assert';
import { clearStore, addDocument, queryVector } from './mocks/mock-vectorstore.ts';

async function testVectorRanking() {
  clearStore();
  addDocument('1', 'Artificial intelligence and machine learning overview');
  addDocument('2', 'Cooking recipes and ingredients');
  addDocument('3', 'Advances in deep learning for vision');

  const results = await queryVector('deep learning vision', 3);
  console.log('Results order ids:', results.map(r => r.id).join(','));
  // Expect id 3 to be top, id1 next, id2 last
  assert.equal(results[0].id, '3');
  assert.equal(results[2].id, '2');
  console.log('✅ testVectorRanking passed');
}

async function testAssemblyBehavior() {
  clearStore();
  addDocument('a', 'Intro: overview of project');
  addDocument('b', 'Details: implementation specifics');
  addDocument('c', 'Appendix: additional notes');

  const results = await queryVector('project implementation', 2);
  // Simple assembly: join texts in order
  const assembled = results.map(r => r.text).join('\n---\n');
  assert(assembled.includes('implementation') || assembled.includes('Details'));
  console.log('✅ testAssemblyBehavior passed');
}

async function testFallback() {
  clearStore();
  // No docs added; query should return empty
  const results = await queryVector('some query', 5);
  assert.equal(results.length, 0);
  console.log('✅ testFallback passed');
}

async function runAll() {
  console.log('Running comprehensive retrieval tests...');
  await testVectorRanking();
  await testAssemblyBehavior();
  await testFallback();
  console.log('All comprehensive retrieval tests passed');
}

runAll().catch(err => { console.error(err); process.exit(1); });
