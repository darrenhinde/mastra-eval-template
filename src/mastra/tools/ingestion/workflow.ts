import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import { z } from 'zod';

import { 
  detectMime, 
  parseDocument, 
  cleanText, 
  splitIntoChunks, 
  extractMetadataHybrid,
  type Chunk,
  type ChunkingOptions 
} from './index.js';

// Import embedding and vectorstore functionality
import { embedChunksInBatches } from '../vectorstore/embed.js';
import { upsertEmbeddingsInBatches } from '../vectorstore/upsert.js';

// Input schema
const IngestInputSchema = z.object({
  inputPath: z.string().min(1, "Input path is required"),
  chunkingOptions: z.object({
    strategy: z.enum(['paragraph', 'sentence', 'section', 'token']).default('paragraph'),
    overlapRatio: z.number().min(0).max(1).default(0.1),
    maxTokens: z.number().min(50).max(2048).default(512),
  }).optional(),
  // New options for embedding and storage
  embedAndStore: z.boolean().default(true),
  tableName: z.string().default('chunks'),
});

// Output schema
const IngestOutputSchema = z.object({
  chunks: z.array(z.object({
    id: z.string(),
    docId: z.string(),
    text: z.string(),
    metadata: z.object({
      source: z.string(),
      author: z.string().optional(),
      date: z.string().optional(),
      section: z.string().optional(),
      keywords: z.array(z.string()).optional(),
      tokens: z.number(),
      seq: z.number(),
    }),
  })),
  summary: z.object({
    totalFiles: z.number(),
    processedFiles: z.number(),
    failedFiles: z.number(),
    totalChunks: z.number(),
    embeddedChunks: z.number().optional(),
    storedChunks: z.number().optional(),
    errors: z.array(z.object({
      file: z.string(),
      error: z.string(),
    })),
  }),
});

export type IngestInput = z.infer<typeof IngestInputSchema>;
export type IngestOutput = z.infer<typeof IngestOutputSchema>;

/**
 * Simple ingestion function that processes files into chunks
 */
export async function runIngestion(input: IngestInput): Promise<IngestOutput> {
  console.log('🚀 Starting ingestion workflow...');
  
  // Step 1: Discover files
  const files = await discoverFiles(input.inputPath);
  console.log(`📁 Found ${files.length} files to process`);
  
  if (files.length === 0) {
    throw new Error(`No supported files found in ${input.inputPath}`);
  }
  
  // Step 2: Process files
  const result = await processFiles(files, input.chunkingOptions, input.embedAndStore, input.tableName);
  
  console.log('✅ Ingestion workflow completed');
  return result;
}

/**
 * Discover files in the input path
 */
async function discoverFiles(inputPath: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const stats = await stat(inputPath);
    
    if (stats.isFile()) {
      // Single file
      files.push(inputPath);
    } else if (stats.isDirectory()) {
      // Directory - find all supported files
      const entries = await readdir(inputPath);
      
      for (const entry of entries) {
        const fullPath = join(inputPath, entry);
        const entryStats = await stat(fullPath);
        
        if (entryStats.isFile()) {
          const ext = extname(entry).toLowerCase();
          if (['.pdf', '.md', '.markdown', '.txt'].includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    }
    
    return files;
  } catch (error) {
    throw new Error(`Failed to discover files in ${inputPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Process files into chunks
 */
async function processFiles(
  files: string[], 
  chunkingOptions?: ChunkingOptions,
  embedAndStore: boolean = true,
  tableName: string = 'chunks'
): Promise<IngestOutput> {
  const allChunks: Chunk[] = [];
  const errors: Array<{ file: string; error: string }> = [];
  let processedFiles = 0;
  
  const options: ChunkingOptions = chunkingOptions || {
    strategy: 'paragraph',
    overlapRatio: 0.1,
    maxTokens: 512,
  };
  
  for (const filePath of files) {
    try {
      console.log(`📄 Processing: ${filePath}`);
      
      // Step 1: Detect MIME type
      const mime = await detectMime(filePath);
      console.log(`   MIME: ${mime}`);
      
      // Step 2: Parse document
      const parsedDoc = await parseDocument(filePath, mime);
      console.log(`   Parsed: ${parsedDoc.text.length} characters`);
      
      // Step 3: Clean text
      const cleanedText = cleanText(parsedDoc.text);
      if (!cleanedText || cleanedText.trim().length < 10) {
        console.log(`   ⚠️  Skipped: Document too short after cleaning`);
        continue;
      }
      
      // Update parsed document with cleaned text
      const cleanedDoc = { ...parsedDoc, text: cleanedText };
      
      // Step 4: Extract additional metadata
      try {
        const extractedMetadata = extractMetadataHybrid(cleanedText);
        cleanedDoc.metadata = { ...cleanedDoc.metadata, ...extractedMetadata };
      } catch (error) {
        console.log(`   ⚠️  Metadata extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Continue with partial metadata
      }
      
      // Step 5: Split into chunks
      const chunks = splitIntoChunks(cleanedDoc, options);
      
      if (chunks.length === 0) {
        console.log(`   ⚠️  Skipped: No chunks generated`);
        continue;
      }
      
      console.log(`   ✅ Generated ${chunks.length} chunks`);
      allChunks.push(...chunks);
      processedFiles++;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log(`   ❌ Failed: ${errorMessage}`);
      
      errors.push({
        file: filePath,
        error: errorMessage,
      });
      
      // Continue processing other files
      continue;
    }
  }
  
  // Step 6: Generate embeddings and store in vector database (if enabled)
  let embeddedChunks = 0;
  let storedChunks = 0;
  
  if (embedAndStore && allChunks.length > 0) {
    try {
      console.log(`\n🧠 Generating embeddings for ${allChunks.length} chunks...`);
      
      // Generate embeddings in batches
      const embeddingRecords = await embedChunksInBatches(allChunks, 100);
      embeddedChunks = embeddingRecords.length;
      
      if (embeddingRecords.length > 0) {
        console.log(`💾 Storing ${embeddingRecords.length} embeddings in table '${tableName}'...`);
        
        // Upsert embeddings to LanceDB
        await upsertEmbeddingsInBatches(tableName, embeddingRecords, 500);
        storedChunks = embeddingRecords.length;
        
        console.log(`✅ Successfully stored ${storedChunks} embeddings`);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Embedding/storage failed: ${errorMessage}`);
      
      errors.push({
        file: 'embedding-pipeline',
        error: `Embedding/storage failed: ${errorMessage}`,
      });
      
      // Continue with partial success - chunks are still available
    }
  }

  const summary = {
    totalFiles: files.length,
    processedFiles,
    failedFiles: errors.length,
    totalChunks: allChunks.length,
    embeddedChunks: embedAndStore ? embeddedChunks : undefined,
    storedChunks: embedAndStore ? storedChunks : undefined,
    errors,
  };
  
  console.log(`\n📊 Ingestion Summary:`);
  console.log(`   Total files: ${summary.totalFiles}`);
  console.log(`   Processed: ${summary.processedFiles}`);
  console.log(`   Failed: ${summary.failedFiles}`);
  console.log(`   Total chunks: ${summary.totalChunks}`);
  if (embedAndStore) {
    console.log(`   Embedded chunks: ${summary.embeddedChunks}`);
    console.log(`   Stored chunks: ${summary.storedChunks}`);
  }
  
  if (errors.length > 0) {
    console.log(`\n❌ Errors:`);
    errors.forEach(({ file, error }) => {
      console.log(`   ${file}: ${error}`);
    });
  }
  
  return {
    chunks: allChunks,
    summary,
  };
}