import { getEmbeddingAdapterFromEnv } from "../embeddings/adapter.js";
import { getOrCreateTable } from "../vectorstore/lancedb.js";
import { RetrievalError, RetrievalErrorCode, toRetrievedChunk } from "./types.js";
import type { RetrievalFilters, RetrievedChunk } from "./types.js";

export interface RetrieveOptions {
  tableName?: string;
  k?: number;
  minScore?: number;
}

/**
 * Retrieve relevant chunks for a query using vector similarity search
 */
export async function retrieve(
  query: string,
  filters?: RetrievalFilters,
  options: RetrieveOptions = {}
): Promise<RetrievedChunk[]> {
  const { tableName = 'chunks', k = 20, minScore = 0.0 } = options;
  
  if (!query || query.trim().length === 0) {
    throw new RetrievalError(
      RetrievalErrorCode.InvalidQuery,
      'Query cannot be empty',
      ['Provide a non-empty query string']
    );
  }
  
  console.log(`🔍 Retrieving chunks for query: "${query.slice(0, 100)}${query.length > 100 ? '...' : ''}"`);
  const startTime = Date.now();
  
  try {
    // Step 1: Embed the query using the same model as stored chunks
    console.log('🧠 Generating query embedding...');
    const adapter = await getEmbeddingAdapterFromEnv();
    const queryEmbeddings = await adapter.embedBatch([query]);
    const queryVector = queryEmbeddings[0];
    
    if (!queryVector || queryVector.length === 0) {
      throw new RetrievalError(
        RetrievalErrorCode.EmbeddingError,
        'Failed to generate query embedding',
        ['Check embedding provider configuration', 'Verify query is not empty']
      );
    }
    
    console.log(`   Generated ${queryVector.length}-dim embedding`);
    
    // Step 2: Get the table and perform vector search
    console.log(`🗄️  Searching table '${tableName}'...`);
    const table = await getOrCreateTable(tableName, queryVector.length);
    
    // Build the search query
    let searchQuery = table
      .vectorSearch(queryVector)
      .distanceType('cosine')
      .limit(k);
    
    // Step 3: Apply filters if provided
    if (filters) {
      const whereClause = buildWhereClause(filters);
      if (whereClause) {
        console.log(`   Applying filters: ${whereClause}`);
        searchQuery = searchQuery.where(whereClause);
      }
    }
    
    // Step 4: Execute search
    const results = await searchQuery.toArray();
    
    if (results.length === 0) {
      const suggestions = [];
      if (filters) {
        suggestions.push('Try removing or relaxing filters');
        suggestions.push('Check filter values match your data');
      }
      suggestions.push('Try a different query or broader terms');
      
      throw new RetrievalError(
        RetrievalErrorCode.EmptyResults,
        `No results found for query "${query}"`,
        suggestions
      );
    }
    
    // Step 5: Convert results and apply score filtering
    const retrievedChunks = results
      .map((result: any) => {
        // LanceDB returns distance, convert to similarity score
        const distance = result._distance || 0;
        const score = Math.max(0, 1 - distance); // Convert distance to similarity
        
        return toRetrievedChunk(result, score);
      })
      .filter(chunk => chunk.score >= minScore)
      .sort((a, b) => b.score - a.score); // Sort by score descending
    
    const duration = Date.now() - startTime;
    console.log(`✅ Retrieved ${retrievedChunks.length} chunks in ${duration}ms`);
    console.log(`   Score range: ${retrievedChunks[0]?.score.toFixed(3)} - ${retrievedChunks[retrievedChunks.length - 1]?.score.toFixed(3)}`);
    
    return retrievedChunks;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error instanceof RetrievalError) {
      throw error;
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Retrieval failed after ${duration}ms:`, errorMessage);
    
    // Handle specific database errors
    if (errorMessage.includes('no such table') || errorMessage.includes('table not found')) {
      throw new RetrievalError(
        RetrievalErrorCode.DatabaseError,
        `Table '${tableName}' not found`,
        ['Run ingestion first to create the table', 'Check table name is correct']
      );
    }
    
    if (errorMessage.includes('no such column') || errorMessage.includes('unknown field')) {
      throw new RetrievalError(
        RetrievalErrorCode.FilterMismatch,
        'Invalid filter field in query',
        ['Check available fields: section, date, docId, source', 'Remove invalid filters']
      );
    }
    
    throw new RetrievalError(
      RetrievalErrorCode.DatabaseError,
      `Database error: ${errorMessage}`,
      ['Check LanceDB connection', 'Verify table exists and is accessible']
    );
  }
}

/**
 * Build SQL WHERE clause from retrieval filters
 */
function buildWhereClause(filters: RetrievalFilters): string | null {
  if (!filters) return null;
  
  const conditions: string[] = [];
  
  if (filters.section && filters.section.length > 0) {
    const sectionList = filters.section.map(s => `'${s.replace(/'/g, "''")}'`).join(', ');
    conditions.push(`section IN (${sectionList})`);
  }
  
  if (filters.docId && filters.docId.length > 0) {
    const docIdList = filters.docId.map(id => `'${id.replace(/'/g, "''")}'`).join(', ');
    conditions.push(`docId IN (${docIdList})`);
  }
  
  if (filters.source && filters.source.length > 0) {
    const sourceList = filters.source.map(s => `'${s.replace(/'/g, "''")}'`).join(', ');
    conditions.push(`source IN (${sourceList})`);
  }
  
  if (filters.dateAfter) {
    conditions.push(`date >= '${filters.dateAfter.replace(/'/g, "''")}'`);
  }
  
  if (filters.dateBefore) {
    conditions.push(`date <= '${filters.dateBefore.replace(/'/g, "''")}'`);
  }
  
  // Note: keywords filter would require JSON parsing, skip for MVP
  
  return conditions.length > 0 ? conditions.join(' AND ') : null;
}

/**
 * Get available filter fields from a table (for error suggestions)
 */
export async function getAvailableFields(tableName: string = 'chunks'): Promise<string[]> {
  try {
    const table = await getOrCreateTable(tableName);
    const schema = await table.schema;
    const schemaFields = (schema as any).fields || [];
    return schemaFields.map((f: any) => f.name).filter((name: string) => 
      !['vector', 'create_time', 'embeddingDim'].includes(name)
    );
  } catch (error) {
    return ['section', 'date', 'docId', 'source']; // Default fields
  }
}