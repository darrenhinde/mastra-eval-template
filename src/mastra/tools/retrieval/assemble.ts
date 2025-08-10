import type { RetrievedChunk, AssembledContext } from "./types.js";

export interface AssemblyOptions {
  tokenBudget?: number;
  reservedTokens?: number;
  includeCitations?: boolean;
  maxChunks?: number;
  minScore?: number;
}

/**
 * Assemble context from retrieved chunks with token budget management
 */
export function assembleContext(
  chunks: RetrievedChunk[],
  options: AssemblyOptions = {}
): AssembledContext {
  const {
    tokenBudget = 4000,
    reservedTokens = 150, // Reserve tokens for answer generation
    includeCitations = true,
    maxChunks = 20,
    minScore = 0.0
  } = options;
  
  const availableTokens = Math.max(100, tokenBudget - reservedTokens);
  
  console.log(`📝 Assembling context with ${availableTokens} token budget...`);
  
  if (chunks.length === 0) {
    console.log('   No chunks provided');
    return {
      context: '',
      chunks: [],
      totalTokens: 0,
      truncated: false,
    };
  }
  
  // Filter and sort chunks by score
  const validChunks = chunks
    .filter(chunk => chunk.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks);
  
  if (validChunks.length === 0) {
    console.log(`   No chunks meet minimum score threshold (${minScore})`);
    return {
      context: '',
      chunks: [],
      totalTokens: 0,
      truncated: false,
    };
  }
  
  console.log(`   Processing ${validChunks.length} chunks (score range: ${validChunks[0].score.toFixed(3)} - ${validChunks[validChunks.length - 1].score.toFixed(3)})`);
  
  // Greedy packing by score until token budget is reached
  const selectedChunks: RetrievedChunk[] = [];
  let totalTokens = 0;
  let truncated = false;
  
  for (const chunk of validChunks) {
    const chunkTokens = chunk.tokens;
    const citationTokens = includeCitations ? estimateCitationTokens(chunk.id) : 0;
    const requiredTokens = chunkTokens + citationTokens;
    
    if (totalTokens + requiredTokens <= availableTokens) {
      selectedChunks.push(chunk);
      totalTokens += requiredTokens;
    } else {
      // Try to fit a truncated version of this chunk
      const remainingTokens = availableTokens - totalTokens - citationTokens;
      if (remainingTokens > 50 && selectedChunks.length === 0) {
        // If this is the first chunk and we have some space, truncate it
        const truncatedChunk = truncateChunk(chunk, remainingTokens);
        selectedChunks.push(truncatedChunk);
        totalTokens += truncatedChunk.tokens + citationTokens;
        truncated = true;
      }
      break;
    }
  }
  
  if (selectedChunks.length === 0) {
    console.log('   No chunks fit within token budget');
    return {
      context: '',
      chunks: [],
      totalTokens: 0,
      truncated: false,
    };
  }
  
  // Build context string
  const contextParts: string[] = [];
  
  for (const chunk of selectedChunks) {
    let chunkText = chunk.text.trim();
    
    if (includeCitations) {
      // Add citation marker at the beginning of each chunk
      chunkText = `§${chunk.id} ${chunkText}`;
    }
    
    // Add metadata context if available
    const metadata: string[] = [];
    if (chunk.section) metadata.push(`Section: ${chunk.section}`);
    if (chunk.date) metadata.push(`Date: ${chunk.date}`);
    if (chunk.source) metadata.push(`Source: ${chunk.source}`);
    
    if (metadata.length > 0) {
      chunkText = `[${metadata.join(', ')}]\n${chunkText}`;
    }
    
    contextParts.push(chunkText);
  }
  
  const context = contextParts.join('\n\n---\n\n');
  
  console.log(`✅ Assembled context: ${selectedChunks.length} chunks, ${totalTokens} tokens${truncated ? ' (truncated)' : ''}`);
  
  return {
    context,
    chunks: selectedChunks,
    totalTokens,
    truncated,
  };
}

/**
 * Truncate a chunk to fit within token budget
 */
function truncateChunk(chunk: RetrievedChunk, maxTokens: number): RetrievedChunk {
  if (chunk.tokens <= maxTokens) {
    return chunk;
  }
  
  // Rough estimation: 1 token ≈ 4 characters
  const maxChars = maxTokens * 4;
  const truncatedText = chunk.text.slice(0, maxChars) + '...';
  
  return {
    ...chunk,
    text: truncatedText,
    tokens: maxTokens,
  };
}

/**
 * Estimate tokens needed for citation markers
 */
function estimateCitationTokens(chunkId: string): number {
  // Citation format: "§chunk_id " - roughly 2-4 tokens
  return Math.ceil(chunkId.length / 4) + 2;
}

/**
 * Get context statistics for debugging
 */
export function getContextStats(context: AssembledContext): {
  chunkCount: number;
  avgScore: number;
  tokenUtilization: number;
  sources: string[];
  sections: string[];
} {
  const chunks = context.chunks;
  
  if (chunks.length === 0) {
    return {
      chunkCount: 0,
      avgScore: 0,
      tokenUtilization: 0,
      sources: [],
      sections: [],
    };
  }
  
  const avgScore = chunks.reduce((sum, chunk) => sum + chunk.score, 0) / chunks.length;
  const tokenUtilization = context.totalTokens / 4000; // Assuming 4k budget
  const sources = [...new Set(chunks.map(chunk => chunk.source))];
  const sections = [...new Set(chunks.map(chunk => chunk.section).filter((section): section is string => Boolean(section)))];
  
  return {
    chunkCount: chunks.length,
    avgScore,
    tokenUtilization,
    sources,
    sections,
  };
}

/**
 * Assemble context with diversity optimization (optional enhancement)
 */
export function assembleContextWithDiversity(
  chunks: RetrievedChunk[],
  options: AssemblyOptions & { diversityWeight?: number } = {}
): AssembledContext {
  const { diversityWeight = 0.1 } = options;
  
  if (diversityWeight === 0) {
    return assembleContext(chunks, options);
  }
  
  // Simple diversity: prefer chunks from different sources/sections
  const diversityScored = chunks.map(chunk => {
    const sourceCount = chunks.filter(c => c.source === chunk.source).length;
    const sectionCount = chunks.filter(c => c.section === chunk.section).length;
    
    // Penalize chunks from over-represented sources/sections
    const diversityPenalty = (sourceCount + sectionCount) * diversityWeight;
    const adjustedScore = Math.max(0, chunk.score - diversityPenalty);
    
    return { ...chunk, score: adjustedScore };
  });
  
  return assembleContext(diversityScored, options);
}