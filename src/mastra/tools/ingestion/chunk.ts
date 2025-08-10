import type { ParsedDocument } from "./parse";

export type Chunk = {
  id: string;
  docId: string;
  text: string;
  metadata: {
    source: string;
    author?: string;
    date?: string;
    section?: string;
    keywords?: string[];
    tokens: number;
    seq: number;
  };
};

export type ChunkingOptions = {
  strategy: "paragraph" | "sentence" | "section" | "token";
  overlapRatio?: number;
  maxTokens?: number;
};

/**
 * Split document into chunks using specified strategy
 * Default: paragraph strategy with 10% overlap
 */
export function splitIntoChunks(
  doc: ParsedDocument,
  options: ChunkingOptions = {
    strategy: "paragraph",
    overlapRatio: 0.1,
    maxTokens: 512,
  }
): Chunk[] {
  if (!doc.text || doc.text.trim().length === 0) {
    return [];
  }

  const { strategy, overlapRatio = 0.1, maxTokens = 512 } = options;

  let chunks: string[];

  switch (strategy) {
    case "paragraph":
      chunks = splitByParagraph(doc.text, overlapRatio);
      break;
    case "sentence":
      chunks = splitBySentence(doc.text, overlapRatio);
      break;
    case "section":
      chunks = splitBySection(doc.text, overlapRatio);
      break;
    case "token":
      chunks = splitByTokens(doc.text, maxTokens, overlapRatio);
      break;
    default:
      throw new Error(`Unsupported chunking strategy: ${strategy}`);
  }

  // Apply token cap fallback if chunks are too large
  chunks = chunks.flatMap((chunk) => {
    const tokenCount = estimateTokens(chunk);
    if (tokenCount > maxTokens) {
      return splitByTokens(chunk, maxTokens, 0); // No overlap for fallback splits
    }
    return [chunk];
  });

  // Filter out empty or very short chunks
  chunks = chunks.filter((chunk) => chunk.trim().length >= 10);

  // Convert to Chunk objects
  return chunks.map((text, index) => ({
    id: generateChunkId(doc.docId, index),
    docId: doc.docId,
    text: text.trim(),
    metadata: {
      source: doc.metadata.source as string,
      author: doc.metadata.author as string | undefined,
      date: doc.metadata.date as string | undefined,
      section: extractSection(text),
      keywords: extractKeywords(text),
      tokens: estimateTokens(text),
      seq: index,
    },
  }));
}

/**
 * Split text by paragraphs with overlap
 */
function splitByParagraph(text: string, overlapRatio: number): string[] {
  // Split by markdown sections first, then by paragraphs
  const sections = text.split(/(?=^#{1,6}\s)/m).filter(s => s.trim().length > 0);
  
  if (sections.length > 1) {
    // If we have markdown sections, treat each as a potential chunk
    const chunks: string[] = [];
    
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i].trim();
      
      // If section is too long, split it by paragraphs
      if (estimateTokens(section) > 400) {
        const paragraphs = section.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        
        // Group paragraphs into reasonable chunks
        const paragraphsPerChunk = Math.max(2, Math.floor(paragraphs.length / 3));
        
        for (let j = 0; j < paragraphs.length; j += paragraphsPerChunk) {
          const end = Math.min(paragraphs.length, j + paragraphsPerChunk);
          const chunk = paragraphs.slice(j, end).join('\n\n');
          chunks.push(chunk);
        }
      } else {
        chunks.push(section);
      }
    }
    
    return chunks;
  }
  
  // Fallback to paragraph splitting
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  
  if (paragraphs.length <= 2) {
    return [text]; // Keep small documents as single chunk
  }
  
  const chunks: string[] = [];
  const paragraphsPerChunk = Math.max(2, Math.floor(paragraphs.length / 4)); // More aggressive splitting
  const overlapSize = Math.max(1, Math.floor(paragraphsPerChunk * overlapRatio));
  
  for (let i = 0; i < paragraphs.length; i += paragraphsPerChunk - overlapSize) {
    const end = Math.min(paragraphs.length, i + paragraphsPerChunk);
    const chunk = paragraphs.slice(i, end).join('\n\n');
    chunks.push(chunk);
  }
  
  return chunks;
}

/**
 * Split text by sentences with overlap
 */
function splitBySentence(text: string, overlapRatio: number): string[] {
  // Simple sentence splitting (can be improved with NLP library)
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  if (sentences.length <= 1) {
    return sentences;
  }

  const chunks: string[] = [];
  const sentencesPerChunk = Math.max(3, Math.floor(sentences.length / 10)); // Adaptive chunk size
  const overlapSize = Math.max(1, Math.floor(sentencesPerChunk * overlapRatio));

  for (let i = 0; i < sentences.length; i += sentencesPerChunk - overlapSize) {
    const end = Math.min(sentences.length, i + sentencesPerChunk);
    const chunk = sentences.slice(i, end).join(". ").trim() + ".";
    chunks.push(chunk);
  }

  return chunks;
}

/**
 * Split text by sections (headers) with overlap
 */
function splitBySection(text: string, overlapRatio: number): string[] {
  // Split by markdown headers or other section indicators
  const sections = text
    .split(/(?=^#{1,6}\s)/m)
    .filter((s) => s.trim().length > 0);

  if (sections.length <= 1) {
    return splitByParagraph(text, overlapRatio); // Fallback to paragraph
  }

  const chunks: string[] = [];
  const overlapSize = Math.max(1, Math.floor(sections.length * overlapRatio));

  for (let i = 0; i < sections.length; i++) {
    const start = Math.max(0, i - overlapSize);
    const end = Math.min(sections.length, i + 2); // Include current and next section

    const chunk = sections.slice(start, end).join("\n");
    chunks.push(chunk);
  }

  return chunks;
}

/**
 * Split text by token count with overlap
 */
function splitByTokens(
  text: string,
  maxTokens: number,
  overlapRatio: number
): string[] {
  const words = text.split(/\s+/);
  const tokensPerWord = 1.3; // Rough estimate
  const wordsPerChunk = Math.floor(maxTokens / tokensPerWord);
  const overlapWords = Math.floor(wordsPerChunk * overlapRatio);

  if (words.length <= wordsPerChunk) {
    return [text];
  }

  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += wordsPerChunk - overlapWords) {
    const end = Math.min(words.length, i + wordsPerChunk);
    const chunk = words.slice(i, end).join(" ");
    chunks.push(chunk);
  }

  return chunks;
}

/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(text: string): number {
  // Rough estimation: ~1.3 tokens per word for English
  const words = text.split(/\s+/).length;
  return Math.ceil(words * 1.3);
}

/**
 * Extract section name from chunk text
 */
function extractSection(text: string): string | undefined {
  // Look for markdown headers at the beginning
  const headerMatch = text.match(/^(#{1,6})\s+(.+)$/m);
  if (headerMatch) {
    return headerMatch[2].trim();
  }

  // Look for other section indicators
  const sectionMatch = text.match(/^([A-Z][A-Za-z\s]{2,30}):?\s*$/m);
  if (sectionMatch) {
    return sectionMatch[1].trim();
  }

  return undefined;
}

/**
 * Extract keywords from chunk text (simple approach)
 */
function extractKeywords(text: string): string[] {
  // Simple keyword extraction - can be improved with NLP
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3);

  // Count word frequency
  const wordCount = new Map<string, number>();
  words.forEach((word) => {
    wordCount.set(word, (wordCount.get(word) || 0) + 1);
  });

  // Get top frequent words (excluding common stop words)
  const stopWords = new Set([
    "this",
    "that",
    "with",
    "have",
    "will",
    "from",
    "they",
    "been",
    "were",
    "said",
    "each",
    "which",
    "their",
    "time",
    "would",
    "there",
    "could",
    "other",
  ]);

  return Array.from(wordCount.entries())
    .filter(([word, count]) => count > 1 && !stopWords.has(word))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

/**
 * Generate unique chunk ID
 */
function generateChunkId(docId: string, seq: number): string {
  return `${docId}_chunk_${seq.toString().padStart(4, "0")}`;
}
