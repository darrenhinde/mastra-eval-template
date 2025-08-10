/**
 * Clean and normalize text content
 * Preserves markdown structure and tables
 */
export function cleanText(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') {
    return '';
  }
  
  let cleaned = rawText;
  
  // Normalize Unicode characters
  cleaned = cleaned.normalize('NFKC');
  
  // Remove common PDF artifacts and boilerplate (but preserve markdown)
  cleaned = removePdfArtifacts(cleaned);
  
  // Normalize whitespace while preserving markdown structure
  cleaned = normalizeWhitespace(cleaned);
  
  // Remove excessive blank lines (keep max 2 consecutive)
  cleaned = cleaned.replace(/\n\s*\n\s*\n+/g, '\n\n');
  
  // Preserve markdown formatting by ensuring proper spacing around headers
  cleaned = cleaned.replace(/^(#{1,6})\s*(.+)$/gm, '$1 $2');
  
  // Trim leading/trailing whitespace
  cleaned = cleaned.trim();
  
  return cleaned;
}

/**
 * Remove common PDF parsing artifacts
 */
function removePdfArtifacts(text: string): string {
  let cleaned = text;
  
  // Remove page numbers (standalone numbers on their own lines)
  cleaned = cleaned.replace(/^\s*\d+\s*$/gm, '');
  
  // Remove common headers/footers patterns
  cleaned = cleaned.replace(/^(Page \d+ of \d+|Copyright .+|All rights reserved.*)$/gmi, '');
  
  // Remove excessive dots/dashes (table of contents artifacts)
  cleaned = cleaned.replace(/\.{4,}/g, ' ');
  cleaned = cleaned.replace(/-{4,}/g, '---'); // Keep as markdown separator
  
  // Remove form feed characters
  cleaned = cleaned.replace(/\f/g, '\n');
  
  // Remove zero-width characters
  cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');
  
  return cleaned;
}

/**
 * Normalize whitespace while preserving document structure
 */
function normalizeWhitespace(text: string): string {
  let cleaned = text;
  
  // Convert various whitespace characters to standard spaces
  cleaned = cleaned.replace(/[\t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
  
  // Normalize line endings
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Remove trailing spaces from lines
  cleaned = cleaned.replace(/ +$/gm, '');
  
  // Collapse multiple spaces within lines (but preserve intentional spacing)
  cleaned = cleaned.replace(/  +/g, ' ');
  
  // Preserve table-like structures by detecting aligned content
  cleaned = preserveTableStructure(cleaned);
  
  return cleaned;
}

/**
 * Attempt to preserve table structures as Markdown
 */
function preserveTableStructure(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect potential table rows (multiple words separated by significant whitespace)
    if (isTableRow(line)) {
      const nextLine = lines[i + 1];
      
      // Convert to markdown table format
      const columns = line.split(/\s{2,}/).filter(col => col.trim());
      
      if (columns.length >= 2) {
        // Check if this looks like a header row
        if (nextLine && isTableSeparator(nextLine)) {
          // This is a table header
          result.push('| ' + columns.join(' | ') + ' |');
          result.push('| ' + columns.map(() => '---').join(' | ') + ' |');
          i++; // Skip the separator line
        } else {
          // Regular table row
          result.push('| ' + columns.join(' | ') + ' |');
        }
        continue;
      }
    }
    
    result.push(line);
  }
  
  return result.join('\n');
}

/**
 * Check if a line looks like a table row
 */
function isTableRow(line: string): boolean {
  if (!line.trim()) return false;
  
  // Look for multiple words separated by 2+ spaces
  const parts = line.split(/\s{2,}/);
  return parts.length >= 2 && parts.every(part => part.trim().length > 0);
}

/**
 * Check if a line looks like a table separator (dashes, equals, etc.)
 */
function isTableSeparator(line: string): boolean {
  if (!line.trim()) return false;
  
  // Check for lines with mostly separator characters
  const separatorChars = /^[\s\-=_|+]+$/;
  return separatorChars.test(line) && line.trim().length > 3;
}