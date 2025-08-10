import { z } from "zod";
import type { EmbeddingRecord } from "../vectorstore/embed.js";

// Retrieval filter types
export const RetrievalFiltersSchema = z.object({
  section: z.array(z.string()).optional(),
  dateAfter: z.string().optional(), // ISO date string
  dateBefore: z.string().optional(), // ISO date string
  docId: z.array(z.string()).optional(),
  source: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
}).optional();

export type RetrievalFilters = z.infer<typeof RetrievalFiltersSchema>;

// Retrieved chunk with similarity score
export const RetrievedChunkSchema = z.object({
  id: z.string(),
  docId: z.string(),
  text: z.string(),
  section: z.string().optional(),
  date: z.string().optional(),
  source: z.string(),
  keywords: z.string().optional(), // JSON string
  tokens: z.number(),
  seq: z.number(),
  provider: z.string(),
  model: z.string(),
  embeddingDim: z.number(),
  create_time: z.number(),
  score: z.number(), // Similarity score (0-1, higher is better)
});

export type RetrievedChunk = z.infer<typeof RetrievedChunkSchema>;

// Context assembly result
export const AssembledContextSchema = z.object({
  context: z.string(),
  chunks: z.array(RetrievedChunkSchema),
  totalTokens: z.number(),
  truncated: z.boolean(),
});

export type AssembledContext = z.infer<typeof AssembledContextSchema>;

// Error types for retrieval operations
export enum RetrievalErrorCode {
  EmptyResults = 'EmptyResults',
  FilterMismatch = 'FilterMismatch',
  InvalidQuery = 'InvalidQuery',
  EmbeddingError = 'EmbeddingError',
  DatabaseError = 'DatabaseError',
}

export class RetrievalError extends Error {
  constructor(
    public code: RetrievalErrorCode,
    message: string,
    public suggestions?: string[]
  ) {
    super(message);
    this.name = 'RetrievalError';
  }
}

// Utility function to convert EmbeddingRecord to RetrievedChunk
export function toRetrievedChunk(record: EmbeddingRecord, score: number): RetrievedChunk {
  return {
    id: record.id,
    docId: record.docId,
    text: record.text,
    section: record.section,
    date: record.date,
    source: record.source,
    keywords: record.keywords,
    tokens: record.tokens,
    seq: record.seq,
    provider: record.provider,
    model: record.model,
    embeddingDim: record.embeddingDim,
    create_time: record.create_time,
    score,
  };
}