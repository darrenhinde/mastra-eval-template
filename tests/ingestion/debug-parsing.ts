#!/usr/bin/env tsx

import { detectMime, parseDocument, cleanText, extractMetadataHybrid } from '../../src/mastra/tools/ingestion/index.js';

async function main() {
  console.log('🔍 Debugging parsing and metadata extraction...\n');
  
  const filePath = './tests/ingestion/fixtures/policy.md';
  
  try {
    // Step 1: Parse document
    const mime = await detectMime(filePath);
    console.log(`MIME: ${mime}\n`);
    
    const parsedDoc = await parseDocument(filePath, mime);
    console.log('--- RAW PARSED TEXT ---');
    console.log(parsedDoc.text);
    console.log('\n--- PARSED METADATA ---');
    console.log(JSON.stringify(parsedDoc.metadata, null, 2));
    
    // Step 2: Clean text
    const cleanedText = cleanText(parsedDoc.text);
    console.log('\n--- CLEANED TEXT ---');
    console.log(cleanedText);
    
    // Step 3: Extract metadata from cleaned text
    const extractedMetadata = extractMetadataHybrid(cleanedText);
    console.log('\n--- EXTRACTED METADATA ---');
    console.log(JSON.stringify(extractedMetadata, null, 2));
    
    // Step 4: Extract metadata from raw text
    const rawMetadata = extractMetadataHybrid(parsedDoc.text);
    console.log('\n--- METADATA FROM RAW TEXT ---');
    console.log(JSON.stringify(rawMetadata, null, 2));
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}