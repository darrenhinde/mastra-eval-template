/**
 * Extract metadata from text using hybrid approach (regex + patterns)
 * Basic implementation for MVP - can be enhanced with LLM extraction later
 */
export function extractMetadataHybrid(text: string): {
  author?: string;
  date?: string;
  section?: string;
  keywords?: string[];
  title?: string;
  summary?: string;
  entities?: string[];
} {
  const metadata: ReturnType<typeof extractMetadataHybrid> = {};
  
  // Extract dates
  metadata.date = extractDate(text);
  
  // Extract author information
  metadata.author = extractAuthor(text);
  
  // Extract title
  metadata.title = extractTitle(text);
  
  // Extract section information
  metadata.section = extractSection(text);
  
  // Extract keywords
  metadata.keywords = extractKeywords(text);
  
  // Extract entities (basic implementation)
  metadata.entities = extractEntities(text);
  
  // Generate summary (first meaningful sentence)
  metadata.summary = extractSummary(text);
  
  return metadata;
}

/**
 * Extract dates using various patterns
 */
function extractDate(text: string): string | undefined {
  const datePatterns = [
    // **Date**: format
    /\*\*Date\*\*:\s*([A-Za-z]+ \d{1,2}, \d{4})/i,
    // Date: format
    /(?:^|\n)\s*Date:\s*([A-Za-z]+ \d{1,2}, \d{4})/i,
    // ISO format: 2023-12-25, 2023/12/25
    /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/,
    // US format: 12/25/2023, 12-25-2023
    /\b(\d{1,2}[-/]\d{1,2}[-/]\d{4})\b/,
    // Written format: December 25, 2023
    /\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\b/i,
    // Short written: Dec 25, 2023
    /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4})\b/i,
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return undefined;
}

/**
 * Extract author information
 */
function extractAuthor(text: string): string | undefined {
  const authorPatterns = [
    // "By Author Name" or "Author: Name" - more flexible
    /(?:^|\n)\s*(?:By|Author|Written by):\s*([A-Z][a-zA-Z\s]+?)(?:\n|$)/i,
    // **Author**: Name format
    /\*\*Author\*\*:\s*([A-Z][a-zA-Z\s]+?)(?:\n|$)/i,
    // Email signatures
    /(?:^|\n)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*<[^>]+@[^>]+>/,
    // Copyright notices
    /©\s*\d{4}\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
  ];
  
  for (const pattern of authorPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  return undefined;
}

/**
 * Extract title from text
 */
function extractTitle(text: string): string | undefined {
  const titlePatterns = [
    // Markdown headers
    /^#\s+(.+)$/m,
    // First line if it looks like a title (short, capitalized)
    /^([A-Z][^.!?]*[^.!?\s])$/m,
    // Title: format
    /^Title:\s*(.+)$/mi,
  ];
  
  for (const pattern of titlePatterns) {
    const match = text.match(pattern);
    if (match && match[1].length < 100) { // Reasonable title length
      return match[1].trim();
    }
  }
  
  return undefined;
}

/**
 * Extract section information
 */
function extractSection(text: string): string | undefined {
  // Look for section headers
  const sectionPatterns = [
    // Markdown headers (any level)
    /^(#{1,6})\s+(.+)$/m,
    // Numbered sections
    /^(\d+\.?\s+[A-Z][^.!?]*[^.!?\s])$/m,
    // All caps sections
    /^([A-Z\s]{3,30})$/m,
  ];
  
  for (const pattern of sectionPatterns) {
    const match = text.match(pattern);
    if (match) {
      const section = match[2] || match[1];
      if (section.length < 50) { // Reasonable section name length
        return section.trim();
      }
    }
  }
  
  return undefined;
}

/**
 * Extract keywords using frequency analysis and patterns
 */
function extractKeywords(text: string): string[] {
  // Clean text and split into words
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3);
  
  // Common stop words to exclude
  const stopWords = new Set([
    'this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 'were',
    'said', 'each', 'which', 'their', 'time', 'would', 'there', 'could',
    'other', 'after', 'first', 'well', 'also', 'some', 'what', 'only',
    'when', 'here', 'more', 'very', 'much', 'such', 'most', 'many',
    'these', 'those', 'than', 'them', 'into', 'over', 'just', 'like',
    'through', 'should', 'before', 'where', 'being', 'does', 'about'
  ]);
  
  // Count word frequency
  const wordCount = new Map<string, number>();
  words.forEach(word => {
    if (!stopWords.has(word)) {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    }
  });
  
  // Look for capitalized words (potential proper nouns/important terms)
  const capitalizedWords = text.match(/\b[A-Z][a-z]{2,}\b/g) || [];
  capitalizedWords.forEach(word => {
    const lower = word.toLowerCase();
    if (!stopWords.has(lower)) {
      wordCount.set(lower, (wordCount.get(lower) || 0) + 2); // Boost capitalized words
    }
  });
  
  // Return top keywords
  return Array.from(wordCount.entries())
    .filter(([word, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

/**
 * Extract named entities (basic pattern matching)
 */
function extractEntities(text: string): string[] {
  const entities: string[] = [];
  
  // Extract email addresses
  const emails = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
  if (emails) {
    entities.push(...emails);
  }
  
  // Extract URLs
  const urls = text.match(/https?:\/\/[^\s]+/g);
  if (urls) {
    entities.push(...urls.map(url => url.replace(/[.,;!?]$/, ''))); // Remove trailing punctuation
  }
  
  // Extract phone numbers (basic patterns)
  const phones = text.match(/\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g);
  if (phones) {
    entities.push(...phones);
  }
  
  // Extract potential organization names (capitalized multi-word phrases)
  const orgs = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}(?:\s+(?:Inc|LLC|Corp|Company|Organization|University|College|Institute)\.?)?/g);
  if (orgs) {
    entities.push(...orgs.filter(org => org.length < 50));
  }
  
  // Remove duplicates and return
  return [...new Set(entities)].slice(0, 10);
}

/**
 * Extract summary (first meaningful sentence or paragraph)
 */
function extractSummary(text: string): string | undefined {
  // Clean text
  const cleaned = text.trim();
  
  // Try to find first meaningful sentence
  const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 20);
  
  if (sentences.length > 0) {
    const firstSentence = sentences[0].trim();
    
    // Return first sentence if it's a reasonable length
    if (firstSentence.length >= 20 && firstSentence.length <= 200) {
      return firstSentence + '.';
    }
  }
  
  // Fallback: first paragraph
  const paragraphs = cleaned.split(/\n\s*\n/).filter(p => p.trim().length > 20);
  if (paragraphs.length > 0) {
    const firstParagraph = paragraphs[0].trim();
    if (firstParagraph.length <= 300) {
      return firstParagraph;
    }
    
    // Truncate if too long
    return firstParagraph.substring(0, 297) + '...';
  }
  
  return undefined;
}