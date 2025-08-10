import type { EmbeddingAdapter } from './adapter';

export interface OpenAIConfig {
  apiKey: string;
  model: string;
  expectedDim: number;
}

export function createOpenAIAdapter(config: OpenAIConfig): EmbeddingAdapter {
  return {
    name: 'openai',
    model: config.model,
    expectedDim: config.expectedDim,
    
    async embedBatch(texts: string[]): Promise<number[][]> {
      // Process in batches to respect OpenAI rate limits
      const batchSize = 256;
      const results: number[][] = [];
      
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchResults = await embedBatchInternal(batch, config);
        results.push(...batchResults);
      }
      
      return results;
    }
  };
}

async function embedBatchInternal(texts: string[], config: OpenAIConfig): Promise<number[][]> {
  const maxRetries = 5;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          input: texts,
          encoding_format: 'float',
        }),
        signal: AbortSignal.timeout(60000), // 60s timeout for batches
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          // Rate limited - exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
          console.warn(`OpenAI rate limited, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        if (response.status >= 500) {
          // Server error - retry
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${JSON.stringify(errorData)}`);
      }
      
      const data = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid embedding response from OpenAI');
      }
      
      const embeddings = data.data.map((item: any) => {
        if (!item.embedding || !Array.isArray(item.embedding)) {
          throw new Error('Invalid embedding data from OpenAI');
        }
        
        const embedding = item.embedding as number[];
        
        // Validate dimension
        if (embedding.length !== config.expectedDim) {
          throw new Error(
            `Dimension mismatch: expected ${config.expectedDim}, got ${embedding.length}. ` +
            `Please check EMBEDDING_DIM or re-index with correct dimensions.`
          );
        }
        
        return embedding;
      });
      
      return embeddings;
      
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on validation errors
      if (error instanceof Error && (error.message.includes('Dimension mismatch') || error.message.includes('Invalid embedding'))) {
        throw error;
      }
      
      // Retry on network/server errors
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }
  
  throw lastError || new Error('Failed to generate embeddings after retries');
}