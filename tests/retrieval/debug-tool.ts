#!/usr/bin/env tsx

import { config } from 'dotenv';
import { vectorRetrievalTool } from '../../src/mastra/tools/retrieval/tool.js';

config();

async function debugTool() {
  console.log('🔧 Debugging Mastra tool API...');
  
  try {
    // Test the tool execution
    const result = await vectorRetrievalTool.execute({
      query: 'test',
      k: 3,
      tokenBudget: 1000,
      enableFallback: true,
    } as any);
    
    console.log('✅ Tool executed successfully:', result);
    
  } catch (error) {
    console.error('❌ Tool execution failed:', error);
    
    // Try to understand the API structure
    console.log('\n🔍 Investigating tool structure...');
    console.log('Tool ID:', vectorRetrievalTool.id);
    console.log('Input schema:', vectorRetrievalTool.inputSchema);
  }
}

debugTool().catch(console.error);