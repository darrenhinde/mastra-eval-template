import * as lancedb from "@lancedb/lancedb";
import {
  Schema,
  Field,
  Float32,
  FixedSizeList,
  Utf8,
  Int32,
  Float64,
} from "apache-arrow";
import { z } from "zod";

const envSchema = z.object({
  LANCEDB_PATH: z.string().min(1).default('./data/lancedb'),
  EMBEDDING_DIM: z.coerce.number().int().positive().optional(),
});

let connectionCache: lancedb.Connection | null = null;

export async function getLanceDb(): Promise<lancedb.Connection> {
  if (connectionCache) {
    return connectionCache;
  }
  
  const env = envSchema.parse(process.env);
  
  try {
    // Use local directory connection (adapting from your existing code)
    connectionCache = await lancedb.connect(env.LANCEDB_PATH);
    return connectionCache;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to connect to LanceDB at ${env.LANCEDB_PATH}: ${errorMessage}`);
  }
}

export function createChunksSchema(embeddingDim: number): Schema {
  return new Schema([
    new Field("id", new Utf8(), false), // Primary key - chunk ID
    new Field("docId", new Utf8(), false), // Document ID for grouping
    new Field(
      "vector",
      new FixedSizeList(embeddingDim, new Field("item", new Float32())),
      false
    ), // Embedding vector
    new Field("text", new Utf8(), false), // Chunk text content
    new Field("section", new Utf8(), true), // Document section (nullable)
    new Field("date", new Utf8(), true), // ISO date string (nullable)
    new Field("source", new Utf8(), false), // Source file/URL
    new Field("keywords", new Utf8(), true), // JSON array of keywords (nullable)
    new Field("tokens", new Int32(), false), // Token count
    new Field("seq", new Int32(), false), // Sequence number within document
    new Field("provider", new Utf8(), false), // Embedding provider (ollama/openai)
    new Field("model", new Utf8(), false), // Embedding model name
    new Field("embeddingDim", new Int32(), false), // Vector dimension for validation
    new Field("create_time", new Float64(), false), // Creation timestamp
  ]);
}

export async function getOrCreateTable(
  tableName: string,
  embeddingDim?: number
): Promise<lancedb.Table> {
  const db = await getLanceDb();
  const tableNames = await db.tableNames();
  
  if (tableNames.includes(tableName)) {
    // Table exists - open it
    const table = await db.openTable(tableName);
    
    // Validate schema compatibility if embeddingDim provided
    if (embeddingDim) {
      try {
        const schema = await table.schema;
        const schemaFields = (schema as any).fields || [];
        const vectorField = schemaFields.find((f: any) => f.name === 'vector');
        if (vectorField && vectorField.type instanceof FixedSizeList) {
          const existingDim = vectorField.type.listSize;
          if (existingDim !== embeddingDim) {
            throw new Error(
              `Dimension mismatch: table '${tableName}' has ${existingDim}-dim vectors, ` +
              `but current embedding model produces ${embeddingDim}-dim vectors. ` +
              `Please set EMBEDDING_DIM=${existingDim} or re-index with new dimensions.`
            );
          }
        }
      } catch (schemaError) {
        console.warn(`Could not validate schema compatibility: ${schemaError instanceof Error ? schemaError.message : 'Unknown error'}`);
      }
    }
    
    return table;
  } else {
    // Table doesn't exist - create it
    if (!embeddingDim) {
      throw new Error(
        `Cannot create table '${tableName}' without knowing embedding dimension. ` +
        `Please set EMBEDDING_DIM or provide embeddingDim parameter.`
      );
    }
    
    const schema = createChunksSchema(embeddingDim);
    const table = await db.createEmptyTable(tableName, schema);
    
    // Create indexes for better performance
    await createIndexes(table);
    
    return table;
  }
}

async function createIndexes(table: lancedb.Table): Promise<void> {
  try {
    // Create ANN index on vector field with IVF_PQ algorithm
    await table.createIndex("vector", {
      metric: "cosine",
      replace: true,
    } as any);
    
    console.log(`Created ANN index on vector field for table ${table.name}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`Failed to create ANN index: ${errorMessage}`);
    // Don't fail the entire operation if index creation fails
  }
}

export async function ensureIndexes(table: lancedb.Table): Promise<void> {
  try {
    // Check if vector index exists, create if not
    const indexes = await table.listIndices();
    const hasVectorIndex = indexes.some((idx: any) => idx.fields && idx.fields.includes('vector'));
    
    if (!hasVectorIndex) {
      await createIndexes(table);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`Failed to ensure indexes: ${errorMessage}`);
  }
}

// Utility function to get embedding dimension from environment or detect from first embedding
export function getEmbeddingDimension(): number | undefined {
  const env = envSchema.parse(process.env);
  return env.EMBEDDING_DIM;
}