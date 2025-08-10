import { readFile } from 'fs/promises';
import { extname } from 'path';

/**
 * Detect MIME type from file path or content
 * Supports PDF and Markdown files for MVP
 */
export async function detectMime(inputPathOrUrl: string): Promise<string> {
  try {
    // First try extension-based detection
    const ext = extname(inputPathOrUrl).toLowerCase();
    
    switch (ext) {
      case '.pdf':
        return 'application/pdf';
      case '.md':
      case '.markdown':
        return 'text/markdown';
      case '.txt':
        return 'text/plain';
      default:
        // Fall back to content-based detection for files without clear extensions
        return await detectMimeFromContent(inputPathOrUrl);
    }
  } catch (error) {
    throw new Error(`Failed to detect MIME type for ${inputPathOrUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Detect MIME type by reading file content
 */
async function detectMimeFromContent(filePath: string): Promise<string> {
  try {
    const buffer = await readFile(filePath);
    
    // Check for PDF magic bytes
    if (buffer.length >= 4 && buffer.toString('ascii', 0, 4) === '%PDF') {
      return 'application/pdf';
    }
    
    // Check if it's text-based (likely Markdown)
    const sample = buffer.toString('utf8', 0, Math.min(1024, buffer.length));
    
    // Look for common Markdown patterns
    if (sample.includes('# ') || sample.includes('## ') || sample.includes('```') || sample.includes('[') && sample.includes('](')) {
      return 'text/markdown';
    }
    
    // Default to plain text if it appears to be text
    if (isTextContent(sample)) {
      return 'text/plain';
    }
    
    throw new Error(`Unsupported file type - unable to determine MIME type`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unsupported file type')) {
      throw error;
    }
    throw new Error(`Failed to read file for MIME detection: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if content appears to be text-based
 */
function isTextContent(sample: string): boolean {
  // Check for non-printable characters (excluding common whitespace)
  const nonPrintableRegex = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/;
  return !nonPrintableRegex.test(sample);
}