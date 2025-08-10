import { createTool } from "@mastra/core";
import { z } from "zod";
import { retrieve } from "./retrieve.js";
import { assembleContext } from "./assemble.js";
import { retrieveWithFallback, validateFilters, formatRetrievalError } from "./fallback.js";
import { RetrievalError, RetrievalFiltersSchema } from "./types.js";

// Input schema for the retrieval tool
const RetrievalInputSchema = z.object({
  query: z.string().min(1, "Query cannot be empty"),
  filters: RetrievalFiltersSchema,
  k: z.number().int().min(1).max(50).default(20),
  tableName: z.string().default("chunks"),
  tokenBudget: z.number().int().min(100).max(8000).default(4000),
  minScore: z.number().min(0).max(1).default(0.0),
  enableFallback: z.boolean().default(true),
});

// Output schema for the retrieval tool
const RetrievalOutputSchema = z.object({
  context: z.string(),
  chunks: z.array(z.object({
    id: z.string(),
    text: z.string(),
    score: z.number(),
    source: z.string(),
    section: z.string().optional(),
    date: z.string().optional(),
  })),
  metadata: z.object({
    totalChunks: z.number(),
    totalTokens: z.number(),
    avgScore: z.number(),
    truncated: z.boolean(),
    fallbackUsed: z.boolean(),
    fallbackStrategy: z.string().optional(),
  }),
});

/**
 * Mastra tool for vector-based retrieval and context assembly
 */
export const vectorRetrievalTool = createTool({
  id: "vector_retrieval",
  description: "Search the knowledge base using vector similarity and assemble relevant context for answering questions.",
  inputSchema: RetrievalInputSchema,
  outputSchema: RetrievalOutputSchema,
  
  execute: async ({ context }) => {
    const query = context.query;
    const filters = context.filters;
    const k = context.k;
    const tableName = context.tableName;
    const tokenBudget = context.tokenBudget;
    const minScore = context.minScore;
    const enableFallback = context.enableFallback;
    
    try {
      console.log(`🔍 Vector retrieval tool: "${query}"`);
      
      // Validate filters if provided
      if (filters) {
        const validation = await validateFilters(filters, tableName);
        if (!validation.valid) {
          throw new RetrievalError(
            'FilterMismatch' as any,
            `Invalid filters: ${validation.errors.join(', ')}`,
            validation.suggestions
          );
        }
      }
      
      // Retrieve chunks with optional fallback
      let chunks;
      let fallbackUsed = false;
      let fallbackStrategy: string | undefined;
      
      if (enableFallback) {
        const result = await retrieveWithFallback(query, filters, {
          enableFilterRelaxation: true,
          enableQueryExpansion: false, // Keep simple for MVP
        });
        
        chunks = result.chunks;
        fallbackUsed = result.fallbackUsed;
        fallbackStrategy = result.fallbackStrategy;
      } else {
        chunks = await retrieve(query, filters, { tableName, k, minScore });
      }
      
      // Assemble context
      const assembledContext = assembleContext(chunks, {
        tokenBudget,
        includeCitations: true,
        minScore,
      });
      
      // Calculate metadata
      const avgScore = assembledContext.chunks.length > 0
        ? assembledContext.chunks.reduce((sum, chunk) => sum + chunk.score, 0) / assembledContext.chunks.length
        : 0;
      
      // Format output
      const result = {
        context: assembledContext.context,
        chunks: assembledContext.chunks.map(chunk => ({
          id: chunk.id,
          text: chunk.text,
          score: chunk.score,
          source: chunk.source,
          section: chunk.section,
          date: chunk.date,
        })),
        metadata: {
          totalChunks: assembledContext.chunks.length,
          totalTokens: assembledContext.totalTokens,
          avgScore,
          truncated: assembledContext.truncated,
          fallbackUsed,
          fallbackStrategy,
        },
      };
      
      console.log(`✅ Retrieved ${result.chunks.length} chunks, ${result.metadata.totalTokens} tokens`);
      
      return result;
      
    } catch (error) {
      if (error instanceof RetrievalError) {
        const formattedError = formatRetrievalError(error);
        console.error(formattedError);
        throw new Error(formattedError);
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown retrieval error';
      console.error(`❌ Retrieval tool failed: ${errorMessage}`);
      throw new Error(`Retrieval failed: ${errorMessage}`);
    }
  },
});

/**
 * Simple retrieval tool without context assembly (for debugging)
 */
export const simpleRetrievalTool = createTool({
  id: "simple_retrieval",
  description: "Simple vector search without context assembly, useful for debugging and inspection.",
  inputSchema: z.object({
    query: z.string().min(1),
    k: z.number().int().min(1).max(50).default(10),
    tableName: z.string().default("chunks"),
    minScore: z.number().min(0).max(1).default(0.0),
  }),
  outputSchema: z.object({
    chunks: z.array(z.object({
      id: z.string(),
      text: z.string().max(200), // Truncate for readability
      score: z.number(),
      source: z.string(),
      section: z.string().optional(),
      tokens: z.number(),
    })),
    count: z.number(),
  }),
  
  execute: async ({ context }) => {
    const query = context.query;
    const k = context.k;
    const tableName = context.tableName;
    const minScore = context.minScore;
    
    try {
      const chunks = await retrieve(query, undefined, { tableName, k, minScore });
      
      return {
        chunks: chunks.map(chunk => ({
          id: chunk.id,
          text: chunk.text.slice(0, 200) + (chunk.text.length > 200 ? '...' : ''),
          score: chunk.score,
          source: chunk.source,
          section: chunk.section,
          tokens: chunk.tokens,
        })),
        count: chunks.length,
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Simple retrieval failed: ${errorMessage}`);
    }
  },
});