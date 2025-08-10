import { z } from 'zod';

// Model alias configuration schema
const ModelAliasSchema = z.object({
  provider: z.string(),
  model: z.string(),
  options: z.record(z.any()).optional(),
});

const ModelAliasesSchema = z.record(z.array(ModelAliasSchema));

export type ModelAlias = z.infer<typeof ModelAliasSchema>;
export type ModelAliases = z.infer<typeof ModelAliasesSchema>;

// Default model aliases with fallback chains
export const MODEL_ALIASES: ModelAliases = {
  // Default chain: OpenAI GPT-4o-mini as primary
  default: [
    {
      provider: 'openai',
      model: 'gpt-4o-mini',
      options: {
        temperature: 0.1,
        maxTokens: 300,
      },
    },
  ],
  
  // Fast response chain
  fast: [
    {
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      options: {
        temperature: 0.0,
        maxTokens: 200,
      },
    },
  ],
  
  // High quality chain with fallback
  quality: [
    {
      provider: 'openai',
      model: 'gpt-4o',
      options: {
        temperature: 0.1,
        maxTokens: 400,
      },
    },
    {
      provider: 'openai',
      model: 'gpt-4o-mini',
      options: {
        temperature: 0.1,
        maxTokens: 300,
      },
    },
  ],
};

// Environment-based model configuration
const envSchema = z.object({
  LLM_ALIAS_DEFAULT: z.string().default('default'),
  LLM_DEFAULT_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

export function getDefaultModelAlias(): string {
  const env = envSchema.parse(process.env);
  return env.LLM_ALIAS_DEFAULT;
}

export function parseModelString(modelString: string): { provider: string; model: string } {
  if (modelString.includes(':')) {
    const [provider, model] = modelString.split(':', 2);
    return { provider, model };
  }
  
  // Default to OpenAI if no provider specified
  return { provider: 'openai', model: modelString };
}

export function validateModelAliases(aliases: unknown): ModelAliases {
  return ModelAliasesSchema.parse(aliases);
}