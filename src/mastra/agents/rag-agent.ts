import { generateText } from 'ai';
import { z } from 'zod';

import { getModel } from '../tools/models/registry.js';
import { retrieve } from '../tools/retrieval/retrieve.js';
import { assembleContext } from '../tools/retrieval/assemble.js';
import type { RetrievalFilters } from '../tools/retrieval/types.js';

// Input schema for RAG queries
const RAGQuerySchema = z.object({
  query: z.string().min(1, 'Query cannot be empty'),
  filters: z.object({
    section: z.array(z.string()).optional(),
    source: z.array(z.string()).optional(),
    docId: z.array(z.string()).optional(),
    dateAfter: z.string().optional(),
    dateBefore: z.string().optional(),
  }).optional(),
  options: z.object({
    k: z.number().int().positive().default(10),
    minScore: z.number().min(0).max(1).default(0.1),
    tokenBudget: z.number().int().positive().default(2000),
    maxAnswerTokens: z.number().int().positive().default(300),
    includeCitations: z.boolean().default(true),
    modelAlias: z.string().optional(),
    modelOptions: z.object({
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().positive().optional(),
    }).optional(),
  }).optional(),
});

// Output schema for RAG responses
const RAGResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(z.object({
    chunkId: z.string(),
    source: z.string(),
    score: z.number(),
    text: z.string().optional(),
  })),
  metadata: z.object({
    retrievedChunks: z.number(),
    usedChunks: z.number(),
    contextTokens: z.number(),
    answerTokens: z.number(),
    model: z.string(),
    truncated: z.boolean(),
  }),
});

export type RAGQuery = z.infer<typeof RAGQuerySchema>;
export type RAGResponse = z.infer<typeof RAGResponseSchema>;

/**
 * System prompt template for RAG responses
 */
const SYSTEM_PROMPT = `You are a helpful AI assistant that answers questions based on provided context.

INSTRUCTIONS:
1. Answer the user's question using ONLY the information provided in the context
2. Be concise and direct - aim for 2-3 sentences maximum
3. If the context doesn't contain enough information, say "I don't have enough information to answer that question"
4. Include citations using the format (§chunk-id) after relevant statements
5. Do not make up information or use knowledge outside the provided context
6. If multiple sources support your answer, cite all relevant chunks

CITATION FORMAT:
- Use (§chunk-id) immediately after statements supported by that chunk
- Example: "The refund policy allows returns within 30 days (§chunk-abc123)"
- Multiple citations: "This is supported by multiple sources (§chunk-abc123, §chunk-def456)"

Remember: Be accurate, concise, and always cite your sources.`;

/**
 * Create RAG prompt with context and user query
 */
function createRAGPrompt(query: string, context: string): string {
  return `CONTEXT:
${context}

USER QUESTION:
${query}

Please provide a concise answer with proper citations.`;
}

/**
 * Extract citations from answer text
 */
function extractCitations(answer: string): string[] {
  const citationRegex = /§([a-zA-Z0-9-_]+)/g;
  const citations: string[] = [];
  let match;
  
  while ((match = citationRegex.exec(answer)) !== null) {
    citations.push(match[1]);
  }
  
  return [...new Set(citations)]; // Remove duplicates
}

/**
 * Basic content safety check
 */
function checkContentSafety(text: string): { safe: boolean; reason?: string } {
  const unsafePatterns = [
    /\b(kill|murder|suicide|bomb|terrorist|hack|steal)\b/i,
    /\b(credit card|ssn|social security|password|api key)\b/i,
  ];
  
  for (const pattern of unsafePatterns) {
    if (pattern.test(text)) {
      return { 
        safe: false, 
        reason: 'Content may contain unsafe or sensitive information' 
      };
    }
  }
  
  return { safe: true };
}

/**
 * RAG Agent implementation
 */
export class RAGAgent {
  private defaultTableName: string;
  
  constructor(tableName: string = 'chunks') {
    this.defaultTableName = tableName;
  }
  
  /**
   * Process a RAG query and generate response
   */
  async query(input: RAGQuery): Promise<RAGResponse> {
    // Validate input
    const validated = RAGQuerySchema.parse(input);
    const { query, filters, options } = validated;
    
    console.log(`🤖 Processing RAG query: "${query.slice(0, 100)}${query.length > 100 ? '...' : ''}"`);
    
    try {
      // Step 1: Retrieve relevant chunks
      console.log('🔍 Retrieving relevant chunks...');
      const chunks = await retrieve(query, filters as RetrievalFilters, {
        tableName: this.defaultTableName,
        k: options?.k || 10,
        minScore: options?.minScore || 0.1,
      });
      
      if (chunks.length === 0) {
        return {
          answer: "I don't have enough information to answer that question based on the available documents.",
          citations: [],
          metadata: {
            retrievedChunks: 0,
            usedChunks: 0,
            contextTokens: 0,
            answerTokens: 0,
            model: options?.modelAlias || 'default',
            truncated: false,
          },
        };
      }
      
      console.log(`   Retrieved ${chunks.length} chunks`);
      
      // Step 2: Assemble context
      console.log('📝 Assembling context...');
      const contextResult = assembleContext(chunks, {
        tokenBudget: options?.tokenBudget || 2000,
        includeCitations: options?.includeCitations !== false,
        maxChunks: options?.k || 10,
      });
      
      console.log(`   Context: ${contextResult.totalTokens} tokens, ${contextResult.chunks.length} chunks`);
      
      if (!contextResult.context || contextResult.context.trim().length === 0) {
        return {
          answer: "I don't have enough information to answer that question.",
          citations: [],
          metadata: {
            retrievedChunks: chunks.length,
            usedChunks: 0,
            contextTokens: 0,
            answerTokens: 0,
            model: options?.modelAlias || 'default',
            truncated: false,
          },
        };
      }
      
      // Step 3: Safety check on query
      const querySafety = checkContentSafety(query);
      if (!querySafety.safe) {
        return {
          answer: `I cannot process this query: ${querySafety.reason}`,
          citations: [],
          metadata: {
            retrievedChunks: chunks.length,
            usedChunks: contextResult.chunks.length,
            contextTokens: contextResult.totalTokens,
            answerTokens: 0,
            model: options?.modelAlias || 'default',
            truncated: contextResult.truncated,
          },
        };
      }
      
      // Step 4: Generate response using LLM
      console.log('🧠 Generating response...');
      const model = getModel(options?.modelAlias, {
        temperature: options?.modelOptions?.temperature || 0.1,
        maxTokens: options?.modelOptions?.maxTokens || options?.maxAnswerTokens || 300,
      });
      
      const prompt = createRAGPrompt(query, contextResult.context);
      
      const result = await generateText({
        model,
        system: SYSTEM_PROMPT,
        prompt,
        maxTokens: options?.maxAnswerTokens || 300,
        temperature: options?.modelOptions?.temperature || 0.1,
      });
      
      const answer = result.text.trim();
      console.log(`   Generated ${result.usage?.totalTokens || 0} tokens`);
      
      // Step 5: Safety check on answer
      const answerSafety = checkContentSafety(answer);
      if (!answerSafety.safe) {
        return {
          answer: `I cannot provide this response: ${answerSafety.reason}`,
          citations: [],
          metadata: {
            retrievedChunks: chunks.length,
            usedChunks: contextResult.chunks.length,
            contextTokens: contextResult.totalTokens,
            answerTokens: result.usage?.totalTokens || 0,
            model: options?.modelAlias || 'default',
            truncated: contextResult.truncated,
          },
        };
      }
      
      // Step 6: Extract and validate citations
      const citedChunkIds = extractCitations(answer);
      const validCitations = contextResult.chunks
        .filter(chunk => citedChunkIds.includes(chunk.id))
        .map(chunk => ({
          chunkId: chunk.id,
          source: chunk.source,
          score: chunk.score,
          text: chunk.text.slice(0, 200) + (chunk.text.length > 200 ? '...' : ''),
        }));
      
      console.log(`✅ Generated response with ${validCitations.length} citations`);
      
      return {
        answer,
        citations: validCitations,
        metadata: {
          retrievedChunks: chunks.length,
          usedChunks: contextResult.chunks.length,
          contextTokens: contextResult.totalTokens,
          answerTokens: result.usage?.totalTokens || 0,
          model: options?.modelAlias || 'default',
          truncated: contextResult.truncated,
        },
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ RAG query failed:', errorMessage);
      
      return {
        answer: `I encountered an error while processing your question: ${errorMessage}`,
        citations: [],
        metadata: {
          retrievedChunks: 0,
          usedChunks: 0,
          contextTokens: 0,
          answerTokens: 0,
          model: options?.modelAlias || 'default',
          truncated: false,
        },
      };
    }
  }
}

/**
 * Create a default RAG agent instance
 */
export function createRAGAgent(tableName?: string): RAGAgent {
  return new RAGAgent(tableName);
}

/**
 * Convenience function for simple queries
 */
export async function askRAG(
  query: string, 
  options?: RAGQuery['options']
): Promise<RAGResponse> {
  const agent = createRAGAgent();
  return agent.query({ query, options });
}