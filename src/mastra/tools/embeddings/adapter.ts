import { z } from "zod";

export type EmbeddingAdapter = {
  name: string;
  model: string;
  expectedDim?: number;
  embedBatch(texts: string[]): Promise<number[][]>;
};

const envSchema = z.object({
  EMBEDDING_PROVIDER: z.enum(['ollama', 'openai']).default('ollama'),
  EMBEDDING_MODEL: z.string().optional(),
  EMBEDDING_DIM: z.coerce.number().int().positive().optional(),
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  OPENAI_API_KEY: z.string().optional(),
});

export async function getEmbeddingAdapterFromEnv(): Promise<EmbeddingAdapter> {
  const env = envSchema.parse(process.env);
  
  switch (env.EMBEDDING_PROVIDER) {
    case 'ollama': {
      const { createOllamaAdapter } = await import('./ollama');
      return createOllamaAdapter({
        baseUrl: env.OLLAMA_BASE_URL,
        model: env.EMBEDDING_MODEL || 'nomic-embed-text',
        expectedDim: env.EMBEDDING_DIM || 768,
      });
    }
    case 'openai': {
      if (!env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai');
      }
      const { createOpenAIAdapter } = await import('./openai');
      return createOpenAIAdapter({
        apiKey: env.OPENAI_API_KEY,
        model: env.EMBEDDING_MODEL || 'text-embedding-3-small',
        expectedDim: env.EMBEDDING_DIM || 1536,
      });
    }
    default:
      throw new Error(`Unsupported embedding provider: ${env.EMBEDDING_PROVIDER}`);
  }
}