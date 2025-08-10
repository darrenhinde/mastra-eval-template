import { readFile } from 'fs/promises';
import { basename } from 'path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { toString } from 'mdast-util-to-string';

export type ParsedDocument = {
  docId: string;
  text: string;
  metadata: Record<string, unknown>;
};

/**
 * Parse document based on MIME type
 * Supports PDF and Markdown for MVP
 */
export async function parseDocument(inputPathOrUrl: string, mime: string): Promise<ParsedDocument> {
  const docId = generateDocId(inputPathOrUrl);
  
  try {
    switch (mime) {
      case 'application/pdf':
        return await parsePdf(inputPathOrUrl, docId);
      case 'text/markdown':
        return await parseMarkdown(inputPathOrUrl, docId);
      case 'text/plain':
        return await parseText(inputPathOrUrl, docId);
      default:
        throw new Error(`Unsupported MIME type: ${mime}`);
    }
  } catch (error) {
    throw new Error(`Failed to parse document ${inputPathOrUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse PDF document using pdf-parse
 */
async function parsePdf(filePath: string, docId: string): Promise<ParsedDocument> {
  try {
    // Dynamic import to avoid issues with pdf-parse loading test files
    const pdfParse = (await import('pdf-parse')).default;
    
    const buffer = await readFile(filePath);
    const data = await pdfParse(buffer);
    
    return {
      docId,
      text: data.text,
      metadata: {
        source: filePath,
        type: 'pdf',
        pages: data.numpages,
        info: data.info || {},
        parsedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    throw new Error(`PDF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse Markdown document using remark
 */
async function parseMarkdown(filePath: string, docId: string): Promise<ParsedDocument> {
  try {
    const content = await readFile(filePath, 'utf-8');
    
    // For now, use the raw content to preserve formatting
    // This allows metadata extraction to work properly
    const text = content;
    
    // Extract basic metadata from markdown
    const metadata = extractMarkdownMetadata(content);
    
    return {
      docId,
      text,
      metadata: {
        source: filePath,
        type: 'markdown',
        ...metadata,
        parsedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    throw new Error(`Markdown parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse plain text document
 */
async function parseText(filePath: string, docId: string): Promise<ParsedDocument> {
  try {
    const text = await readFile(filePath, 'utf-8');
    
    return {
      docId,
      text,
      metadata: {
        source: filePath,
        type: 'text',
        parsedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    throw new Error(`Text parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract metadata from markdown frontmatter and content
 */
function extractMarkdownMetadata(content: string): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  
  // Check for YAML frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    try {
      // Simple key-value extraction (avoiding yaml dependency for MVP)
      const frontmatter = frontmatterMatch[1];
      const lines = frontmatter.split('\n');
      
      for (const line of lines) {
        const match = line.match(/^(\w+):\s*(.+)$/);
        if (match) {
          const [, key, value] = match;
          metadata[key] = value.replace(/^["']|["']$/g, ''); // Remove quotes
        }
      }
    } catch (error) {
      // Ignore frontmatter parsing errors
    }
  }
  
  // Extract first heading as title if not in frontmatter
  if (!metadata.title) {
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      metadata.title = titleMatch[1].trim();
    }
  }
  
  return metadata;
}

/**
 * Generate consistent document ID from file path
 */
function generateDocId(filePath: string): string {
  const filename = basename(filePath);
  const timestamp = Date.now();
  
  // Create a simple hash-like ID from filename
  const hash = filename
    .split('')
    .reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) & 0xffffffff, 0)
    .toString(16);
  
  return `doc_${hash}_${timestamp}`;
}