// @ts-nocheck
// TODO: Fix this workflow to match current Mastra API - currently using direct function approach
import { createWorkflow, createStep } from '@mastra/core';
import { z } from 'zod';
import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';

import { 
  detectMime, 
  parseDocument, 
  cleanText, 
  splitIntoChunks, 
  extractMetadataHybrid,
  type Chunk,
  type ChunkingOptions 
} from '../tools/ingestion/index.js';

// Input schema for the workflow
const IngestInputSchema = z.object({
  inputPath: z.string().min(1, "Input path is required"),
  chunkingOptions: z.object({
    strategy: z.enum(['paragraph', 'sentence', 'section', 'token']).default('paragraph'),
    overlapRatio: z.number().min(0).max(1).default(0.1),
    maxTokens: z.number().min(50).max(2048).default(512),
  }).optional(),
});

// Output schema for the workflow
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
    errors: z.array(z.object({
      file: z.string(),
      error: z.string(),
    })),
  }),
});

// Error types for better error handling
export class ParserError extends Error {
  constructor(message: string, public filePath: string) {
    super(message);
    this.name = 'ParserError';
  }
}

export class ChunkingError extends Error {
  constructor(message: string, public docId: string) {
    super(message);
    this.name = 'ChunkingError';
  }
}

export class MetadataError extends Error {
  constructor(message: string, public docId: string) {
    super(message);
    this.name = 'MetadataError';
  }
}

// Step 1: Discover files
const discoverFilesStep = createStep({
  id: 'discover-files',
  inputSchema: z.object({ inputPath: z.string() }),
  outputSchema: z.object({ files: z.array(z.string()) }),
  execute: async ({ inputData }) => {
    const { inputPath } = inputData;
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
      
      return { files };
    } catch (error) {
      throw new Error(`Failed to discover files in ${inputPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
});

// Step 2: Process files into chunks
const processFilesStep = createStep({
  id: 'process-files',
  inputSchema: z.object({ 
    files: z.array(z.string()),
    chunkingOptions: z.object({
      strategy: z.enum(['paragraph', 'sentence', 'section', 'token']),
      overlapRatio: z.number(),
      maxTokens: z.number(),
    }).optional(),
  }),
  outputSchema: IngestOutputSchema,
  execute: async ({ inputData }) => {
    const { files, chunkingOptions } = inputData;
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
    
    const summary = {
      totalFiles: files.length,
      processedFiles,
      failedFiles: errors.length,
      totalChunks: allChunks.length,
      errors,
    };
    
    console.log(`\n📊 Ingestion Summary:`);
    console.log(`   Total files: ${summary.totalFiles}`);
    console.log(`   Processed: ${summary.processedFiles}`);
    console.log(`   Failed: ${summary.failedFiles}`);
    console.log(`   Total chunks: ${summary.totalChunks}`);
    
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
  },
});

// Create the ingestion workflow
export const ingestWorkflow = createWorkflow({
  name: 'ingest-workflow',
  triggerSchema: IngestInputSchema,
})
  .then(discoverFilesStep, {
    inputData: ({ triggerData }) => ({ inputPath: triggerData.inputPath }),
  })
  .then(processFilesStep, {
    inputData: ({ triggerData, stepResults }) => ({
      files: stepResults['discover-files'].files,
      chunkingOptions: triggerData.chunkingOptions,
    }),
  })
  .commit();

// Export types for use in other modules
export type IngestInput = z.infer<typeof IngestInputSchema>;
export type IngestOutput = z.infer<typeof IngestOutputSchema>;