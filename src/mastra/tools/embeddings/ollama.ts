import type { EmbeddingAdapter } from './adapter';

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  expectedDim: number;
}

export function createOllamaAdapter(config: OllamaConfig): EmbeddingAdapter {
  return {
    name: 'ollama',
    model: config.model,
    expectedDim: config.expectedDim,
    
    async embedBatch(texts: string[]): Promise<number[][]> {
      const results: number[][] = [];
      
      // Process in batches to avoid overwhelming Ollama
      const batchSize = 32;
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(text => embedSingle(text, config))
        );
        results.push(...batchResults);
      }
      
      return results;
    }
  };
}

async function embedSingle(text: string, config: OllamaConfig): Promise<number[]> {
  const maxRetries = 5;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${config.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          prompt: text,
        }),
        signal: AbortSignal.timeout(30000), // 30s timeout
      });
      
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          // Retry on rate limits and server errors
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Invalid embedding response from Ollama');
      }
      
      const embedding = data.embedding as number[];
      
      // Validate dimension
      if (embedding.length !== config.expectedDim) {
        throw new Error(
          `Dimension mismatch: expected ${config.expectedDim}, got ${embedding.length}. ` +
          `Please check EMBEDDING_DIM or re-index with correct dimensions.`
        );
      }
      
      return embedding;
      
    } catch (error) {
      lastError = error as Error;
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        // Connection error - likely Ollama not running
        if (attempt === maxRetries) {
          throw new Error(
            `Ollama unavailable at ${config.baseUrl}. ` +
            `Please ensure Ollama is running and the model '${config.model}' is available. ` +
            `Try: ollama pull ${config.model}`
          );
        }
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Don't retry on validation errors
      if (error instanceof Error && error.message.includes('Dimension mismatch')) {
        throw error;
      }
      
      // Retry on other errors
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }
  
  throw lastError || new Error('Failed to generate embedding after retries');
}