import type { EmbeddingRecord } from "./embed";
import { getOrCreateTable, ensureIndexes, getEmbeddingDimension } from "./lancedb";

export async function upsertEmbeddings(
  tableName: string,
  records: EmbeddingRecord[]
): Promise<void> {
  if (records.length === 0) {
    console.log("No records to upsert");
    return;
  }
  
  console.log(`Upserting ${records.length} embedding records to table '${tableName}'...`);
  const startTime = Date.now();
  
  try {
    // Validate all records have the same embedding dimension
    const dimensions = [...new Set(records.map(r => r.embeddingDim))];
    if (dimensions.length > 1) {
      throw new Error(
        `Mixed embedding dimensions in batch: ${dimensions.join(', ')}. ` +
        `All records must have the same dimension.`
      );
    }
    
    const embeddingDim = dimensions[0];
    
    // Get or create table with proper schema
    const table = await getOrCreateTable(tableName, embeddingDim);
    
    // Ensure indexes exist
    await ensureIndexes(table);
    
    // Check for existing records to handle upserts
    const existingIds = new Set<string>();
    try {
      const recordIds = records.map(r => r.id);
      const existing = await table
        .query()
        .where(`id IN (${recordIds.map(id => `'${id}'`).join(', ')})`)
        .select(['id'])
        .toArray();
      
      existing.forEach((row: any) => existingIds.add(row.id));
    } catch (error) {
      // If query fails, assume no existing records (table might be empty)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Could not check for existing records: ${errorMessage}`);
    }
    
    // Separate new records from updates
    const newRecords = records.filter(r => !existingIds.has(r.id));
    const updateRecords = records.filter(r => existingIds.has(r.id));
    
    // Handle updates by deleting existing records first
    if (updateRecords.length > 0) {
      console.log(`Updating ${updateRecords.length} existing records...`);
      const updateIds = updateRecords.map(r => r.id);
      const predicate = `id IN (${updateIds.map(id => `'${id}'`).join(', ')})`;
      await table.delete(predicate);
    }
    
    // Insert all records (new + updated)
    console.log(`Inserting ${records.length} records...`);
    await table.add(records);
    
    // Optimize table after large upserts
    if (records.length > 100) {
      console.log("Optimizing table after large upsert...");
      await table.optimize();
    }
    
    const duration = Date.now() - startTime;
    console.log(
      `Successfully upserted ${records.length} records ` +
      `(${newRecords.length} new, ${updateRecords.length} updated) ` +
      `to table '${tableName}' in ${duration}ms`
    );
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Upsert failed after ${duration}ms:`, errorMessage);
    throw new Error(`Failed to upsert embeddings to table '${tableName}': ${errorMessage}`);
  }
}

export async function upsertSingleEmbedding(
  tableName: string,
  record: EmbeddingRecord
): Promise<void> {
  await upsertEmbeddings(tableName, [record]);
}

// Utility function to batch upsert large arrays
export async function upsertEmbeddingsInBatches(
  tableName: string,
  records: EmbeddingRecord[],
  batchSize: number = 500
): Promise<void> {
  if (records.length <= batchSize) {
    await upsertEmbeddings(tableName, records);
    return;
  }
  
  console.log(`Upserting ${records.length} records in batches of ${batchSize}...`);
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(records.length / batchSize);
    
    console.log(`Processing upsert batch ${batchNum}/${totalBatches}...`);
    
    try {
      await upsertEmbeddings(tableName, batch);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Batch ${batchNum} failed:`, errorMessage);
      throw error; // Fail fast on upsert errors
    }
  }
  
  console.log(`Successfully completed batched upsert of ${records.length} records`);
}

// Utility function to delete embeddings by document ID
export async function deleteEmbeddingsByDocId(
  tableName: string,
  docId: string
): Promise<void> {
  try {
    const table = await getOrCreateTable(tableName);
    const predicate = `docId == '${docId}'`;
    await table.delete(predicate);
    console.log(`Deleted embeddings for document '${docId}' from table '${tableName}'`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to delete embeddings for document '${docId}':`, errorMessage);
    throw error;
  }
}

// Utility function to get table statistics
export async function getTableStats(tableName: string): Promise<{
  rowCount: number;
  embeddingDim?: number;
  providers: string[];
  models: string[];
}> {
  try {
    const table = await getOrCreateTable(tableName);
    const rowCount = await table.countRows();
    
    if (rowCount === 0) {
      return { rowCount: 0, providers: [], models: [] };
    }
    
    // Sample a few records to get metadata
    const sample = await table
      .query()
      .select(['embeddingDim', 'provider', 'model'])
      .limit(100)
      .toArray();
    
    const embeddingDims = [...new Set(sample.map((r: any) => r.embeddingDim))];
    const providers = [...new Set(sample.map((r: any) => r.provider))];
    const models = [...new Set(sample.map((r: any) => r.model))];
    
    return {
      rowCount,
      embeddingDim: embeddingDims.length === 1 ? embeddingDims[0] : undefined,
      providers,
      models,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to get table stats for '${tableName}':`, errorMessage);
    throw error;
  }
}