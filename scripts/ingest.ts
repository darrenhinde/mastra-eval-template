#!/usr/bin/env tsx

import { config } from 'dotenv';
import { z } from 'zod';
import { existsSync } from 'fs';
import { resolve } from 'path';

import { runIngestion } from '../src/mastra/tools/ingestion/workflow.js';

// Load environment variables
config();

// Environment validation schema
const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  LANCEDB_PATH: z.string().min(1, "LANCEDB_PATH is required"),
  EMBEDDING_PROVIDER: z.string().optional().default("ollama"),
  EMBEDDING_MODEL: z.string().optional().default("nomic-embed-text"),
  EMBEDDING_DIM: z.string().optional().default("768"),
  OLLAMA_BASE_URL: z.string().optional().default("http://localhost:11434"),
});

// CLI arguments schema
const argsSchema = z.object({
  inputPath: z.string().min(1, "Input path is required"),
  strategy: z.enum(['paragraph', 'sentence', 'section', 'token']).optional().default('paragraph'),
  overlap: z.number().min(0).max(1).optional().default(0.1),
  maxTokens: z.number().min(50).max(2048).optional().default(512),
  embedAndStore: z.boolean().optional().default(true),
  tableName: z.string().optional().default('chunks'),
});

function parseArgs(): z.infer<typeof argsSchema> {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log("📋 Usage: npm run ingest <input-path> [options]");
    console.log("");
    console.log("Arguments:");
    console.log("  <input-path>     Path to file or directory to ingest");
    console.log("");
    console.log("Options:");
    console.log("  --strategy       Chunking strategy: paragraph|sentence|section|token (default: paragraph)");
    console.log("  --overlap        Overlap ratio between chunks: 0-1 (default: 0.1)");
    console.log("  --max-tokens     Maximum tokens per chunk (default: 512)");
    console.log("  --no-embed       Skip embedding generation and storage (default: false)");
    console.log("  --table          LanceDB table name (default: chunks)");
    console.log("");
    console.log("Examples:");
    console.log("  npm run ingest ./data");
    console.log("  npm run ingest ./document.pdf --strategy sentence --overlap 0.2");
    console.log("  npm run ingest ./docs --max-tokens 256");
    process.exit(1);
  }
  
  const inputPath = args[0];
  const options: Record<string, any> = { inputPath };
  
  // Parse options
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    
    switch (flag) {
      case '--strategy':
        options.strategy = value;
        break;
      case '--overlap':
        options.overlap = parseFloat(value);
        break;
      case '--max-tokens':
        options.maxTokens = parseInt(value, 10);
        break;
      case '--no-embed':
        options.embedAndStore = false;
        i--; // No value for this flag
        break;
      case '--table':
        options.tableName = value;
        break;
      default:
        console.error(`❌ Unknown option: ${flag}`);
        process.exit(1);
    }
  }
  
  return argsSchema.parse(options);
}

async function main() {
  try {
    // Validate environment variables
    const env = envSchema.parse(process.env);
    
    // Parse command line arguments
    const args = parseArgs();
    
    // Validate input path exists
    const inputPath = resolve(args.inputPath);
    if (!existsSync(inputPath)) {
      console.error(`❌ Input path does not exist: ${inputPath}`);
      process.exit(1);
    }
    
    console.log("🚀 Starting ingestion pipeline...");
    console.log(`📁 Input path: ${inputPath}`);
    console.log(`📊 Chunking strategy: ${args.strategy}`);
    console.log(`🔄 Overlap ratio: ${args.overlap}`);
    console.log(`📏 Max tokens per chunk: ${args.maxTokens}`);
    console.log(`🗄️  LanceDB path: ${env.LANCEDB_PATH}`);
    console.log(`🔗 Embedding provider: ${env.EMBEDDING_PROVIDER}`);
    console.log(`📊 Embedding model: ${env.EMBEDDING_MODEL} (${env.EMBEDDING_DIM}d)`);
    console.log("");
    
    // Run the ingestion workflow
    const result = await runIngestion({
      inputPath,
      chunkingOptions: {
        strategy: args.strategy,
        overlapRatio: args.overlap,
        maxTokens: args.maxTokens,
      },
      embedAndStore: args.embedAndStore,
      tableName: args.tableName,
    });
    
    console.log("");
    console.log("✅ Ingestion completed successfully!");
    console.log(`📊 Final summary:`);
    console.log(`   📁 Files processed: ${result.summary.processedFiles}/${result.summary.totalFiles}`);
    console.log(`   📄 Total chunks: ${result.summary.totalChunks}`);
    
    if (args.embedAndStore) {
      console.log(`   🧠 Embedded chunks: ${result.summary.embeddedChunks || 0}`);
      console.log(`   💾 Stored chunks: ${result.summary.storedChunks || 0}`);
      console.log(`   🗄️  Table: ${args.tableName}`);
    }
    
    if (result.summary.failedFiles > 0) {
      console.log(`   ❌ Failed files: ${result.summary.failedFiles}`);
    }
    
    console.log("");
    if (args.embedAndStore) {
      console.log("📋 Next steps:");
      console.log("   1. Use 'npm run ask' to query the ingested content");
      console.log("   2. Run 'npm run eval' to evaluate retrieval quality");
    } else {
      console.log("📋 Next steps:");
      console.log("   1. Run with embedding enabled to store in vector database");
      console.log("   2. Use 'npm run ask' to query the content");
    }
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("❌ Configuration error:");
      error.errors.forEach(err => {
        console.error(`   - ${err.path.join('.')}: ${err.message}`);
      });
      console.error("\n💡 Please check your arguments and .env file");
      process.exit(1);
    }
    
    console.error("❌ Ingestion failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}