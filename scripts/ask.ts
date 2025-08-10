#!/usr/bin/env tsx

import { config } from 'dotenv';
import { z } from 'zod';

// Load environment variables
config();

// Environment validation schema
const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  LANCEDB_PATH: z.string().min(1, "LANCEDB_PATH is required"),
  LLM_ALIAS_DEFAULT: z.string().optional().default("default"),
  LLM_DEFAULT_MODEL: z.string().optional().default("openai:gpt-4o-mini"),
});

async function main() {
  try {
    // Validate environment variables
    const env = envSchema.parse(process.env);
    
    // Get query from command line arguments
    const query = process.argv.slice(2).join(' ');
    
    if (!query.trim()) {
      console.log("❓ Usage: npm run ask \"Your question here\"");
      console.log("📝 Example: npm run ask \"What is the refund policy?\"");
      process.exit(1);
    }
    
    console.log("🤖 Processing query...");
    console.log(`❓ Query: "${query}"`);
    console.log(`🧠 Model: ${env.LLM_DEFAULT_MODEL}`);
    console.log(`📁 LanceDB path: ${env.LANCEDB_PATH}`);
    
    // TODO: Implement RAG agent query
    console.log("⚠️  RAG agent not yet implemented");
    console.log("📋 This will be implemented in Task 05");
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Environment configuration error:");
      error.errors.forEach(err => {
        console.error(`   - ${err.path.join('.')}: ${err.message}`);
      });
      console.error("\n💡 Please check your .env file against .env.example");
      process.exit(1);
    }
    
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}