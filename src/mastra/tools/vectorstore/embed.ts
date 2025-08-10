import { z } from "zod";
import type { Chunk } from "../ingestion";
import { getEmbeddingAdapterFromEnv } from "../embeddings/adapter";

export const EmbeddingRecordSchema = z.object({
  id: z.string().min(1),
  docId: z.string().min(1),
  vector: z.array(z.number()).min(1),
  text: z.string().min(1),
  section: z.string().optional(),
  date: z.string().optional(),
  source: z.string().min(1),
  keywords: z.string().optional(), // JSON string of array
  tokens: z.number().int().nonnegative(),
  seq: z.number().int().nonnegative(),
  provider: z.string().min(1),
  model: z.string().min(1),
  embeddingDim: z.number().int().positive(),
  create_time: z.number(),
});

export type EmbeddingRecord = z.infer<typeof EmbeddingRecordSchema>;

export async function embedChunks(chunks: Chunk[]): Promise<EmbeddingRecord[]> {
  if (chunks.length === 0) {
    return [];
  }
  
  console.log(`Generating embeddings for ${chunks.length} chunks...`);
  const startTime = Date.now();
  
  try {
    const adapter = await getEmbeddingAdapterFromEnv();
    
    // Extract texts for embedding
    const texts = chunks.map(chunk => chunk.text);
    
    // Generate embeddings in batches with retry logic
    const embeddings = await adapter.embedBatch(texts);
    
    if (embeddings.length !== chunks.length) {
      throw new Error(
        `Embedding count mismatch: expected ${chunks.length}, got ${embeddings.length}`
      );
    }
    
    // Validate dimensions
    const expectedDim = adapter.expectedDim;
    if (expectedDim) {
      for (let i = 0; i < embeddings.length; i++) {
        if (embeddings[i].length !== expectedDim) {
          throw new Error(
            `Dimension mismatch for chunk ${chunks[i].id}: expected ${expectedDim}, got ${embeddings[i].length}`
          );
        }
      }
    }
    
    // Create embedding records with provenance
    const records: EmbeddingRecord[] = chunks.map((chunk, index) => {
      const embedding = embeddings[index];
      
      return {
        id: chunk.id,
        docId: chunk.docId,
        vector: embedding,
        text: chunk.text,
        section: chunk.metadata.section,
        date: chunk.metadata.date,
        source: chunk.metadata.source,
        keywords: chunk.metadata.keywords ? JSON.stringify(chunk.metadata.keywords) : undefined,
        tokens: chunk.metadata.tokens,
        seq: chunk.metadata.seq,
        provider: adapter.name,
        model: adapter.model,
        embeddingDim: embedding.length,
        create_time: Date.now(),
      };
    });
    
    // Validate all records
    const validatedRecords = records.map((record, index) => {
      try {
        return EmbeddingRecordSchema.parse(record);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
        throw new Error(`Validation failed for chunk ${chunks[index].id}: ${errorMessage}`);
      }
    });
    
    const duration = Date.now() - startTime;
    console.log(`Generated ${validatedRecords.length} embeddings in ${duration}ms`);
    
    return validatedRecords;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Embedding generation failed after ${duration}ms:`, errorMessage);
    throw error;
  }
}

export async function embedSingleChunk(chunk: Chunk): Promise<EmbeddingRecord> {
  const records = await embedChunks([chunk]);
  return records[0];
}

// Utility function to batch process large chunk arrays
export async function embedChunksInBatches(
  chunks: Chunk[],
  batchSize: number = 100
): Promise<EmbeddingRecord[]> {
  const results: EmbeddingRecord[] = [];
  
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    console.log(`Processing embedding batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`);
    
    try {
      const batchResults = await embedChunks(batch);
      results.push(...batchResults);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Batch ${Math.floor(i / batchSize) + 1} failed:`, errorMessage);
      
      // For partial success reporting, continue with next batch
      // but log the failure for manual review
      console.warn(`Skipping ${batch.length} chunks due to embedding failure`);
    }
  }
  
  return results;
}