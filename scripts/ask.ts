#!/usr/bin/env tsx

import { config } from 'dotenv';
import { z } from 'zod';
import { createRAGAgent } from '../src/mastra/agents/rag-agent.js';
import { getAvailableAliases } from '../src/mastra/tools/models/registry.js';

// Load environment variables
config();

// Environment validation schema
const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  LANCEDB_PATH: z.string().min(1, "LANCEDB_PATH is required"),
  LLM_ALIAS_DEFAULT: z.string().optional().default("default"),
  LLM_DEFAULT_MODEL: z.string().optional().default("openai:gpt-4o-mini"),
});

// CLI arguments schema
const argsSchema = z.object({
  query: z.string().min(1, "Query is required"),
  model: z.string().optional(),
  k: z.number().int().positive().optional().default(10),
  minScore: z.number().min(0).max(1).optional().default(0.1),
  temperature: z.number().min(0).max(2).optional().default(0.1),
  maxTokens: z.number().int().positive().optional().default(300),
  table: z.string().optional().default('chunks'),
  verbose: z.boolean().optional().default(false),
});

function parseArgs(): z.infer<typeof argsSchema> {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log("❓ Usage: npm run ask \"Your question here\" [options]");
    console.log("");
    console.log("Options:");
    console.log("  --model <alias>      Model alias or provider:model (default: from env)");
    console.log("  --k <number>         Number of chunks to retrieve (default: 10)");
    console.log("  --min-score <float>  Minimum similarity score (default: 0.1)");
    console.log("  --temperature <float> Model temperature (default: 0.1)");
    console.log("  --max-tokens <int>   Maximum answer tokens (default: 300)");
    console.log("  --table <name>       LanceDB table name (default: chunks)");
    console.log("  --verbose            Show detailed processing info");
    console.log("");
    console.log("Examples:");
    console.log("  npm run ask \"What is the refund policy?\"");
    console.log("  npm run ask \"How do I install the software?\" --model fast --k 5");
    console.log("  npm run ask \"Explain the pricing\" --temperature 0.0 --verbose");
    console.log("");
    console.log(`Available model aliases: ${getAvailableAliases().join(', ')}`);
    process.exit(1);
  }
  
  // First argument is the query
  const query = args[0];
  const options: Record<string, any> = { query };
  
  // Parse options
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    
    switch (flag) {
      case '--model':
        options.model = value;
        break;
      case '--k':
        options.k = parseInt(value, 10);
        break;
      case '--min-score':
        options.minScore = parseFloat(value);
        break;
      case '--temperature':
        options.temperature = parseFloat(value);
        break;
      case '--max-tokens':
        options.maxTokens = parseInt(value, 10);
        break;
      case '--table':
        options.table = value;
        break;
      case '--verbose':
        options.verbose = true;
        i--; // No value for this flag
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
    
    console.log("🤖 Processing RAG query...");
    console.log(`❓ Query: "${args.query}"`);
    console.log(`🧠 Model: ${args.model || env.LLM_ALIAS_DEFAULT}`);
    console.log(`📁 LanceDB path: ${env.LANCEDB_PATH}`);
    console.log(`🗄️  Table: ${args.table}`);
    
    if (args.verbose) {
      console.log(`🔧 Options: k=${args.k}, minScore=${args.minScore}, temp=${args.temperature}, maxTokens=${args.maxTokens}`);
    }
    
    console.log("");
    
    // Create RAG agent and process query
    const agent = createRAGAgent(args.table);
    
    const startTime = Date.now();
    const response = await agent.query({
      query: args.query,
      options: {
        k: args.k,
        minScore: args.minScore,
        tokenBudget: 2000,
        maxAnswerTokens: args.maxTokens,
        includeCitations: true,
        modelAlias: args.model || env.LLM_ALIAS_DEFAULT,
        modelOptions: {
          temperature: args.temperature,
          maxTokens: args.maxTokens,
        },
      },
    });
    
    const duration = Date.now() - startTime;
    
    // Display results
    console.log("📝 Answer:");
    console.log(`${response.answer}\n`);
    
    if (response.citations.length > 0) {
      console.log("📚 Sources:");
      response.citations.forEach((citation, index) => {
        console.log(`   ${index + 1}. ${citation.source} (score: ${citation.score.toFixed(3)})`);
        if (args.verbose && citation.text) {
          console.log(`      "${citation.text}"`);
        }
      });
      console.log("");
    }
    
    if (args.verbose) {
      console.log("📊 Metadata:");
      console.log(`   Retrieved chunks: ${response.metadata.retrievedChunks}`);
      console.log(`   Used chunks: ${response.metadata.usedChunks}`);
      console.log(`   Context tokens: ${response.metadata.contextTokens}`);
      console.log(`   Answer tokens: ${response.metadata.answerTokens}`);
      console.log(`   Model: ${response.metadata.model}`);
      console.log(`   Truncated: ${response.metadata.truncated}`);
      console.log(`   Duration: ${duration}ms`);
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
    
    console.error("❌ Query failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}