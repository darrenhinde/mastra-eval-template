import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { z } from 'zod';
import { MODEL_ALIASES, type ModelAlias, parseModelString, getDefaultModelAlias } from '../../config/models.js';

// Model options schema
const ModelOptionsSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
}).optional();

export type ModelOptions = z.infer<typeof ModelOptionsSchema>;

// Registry for storing model configurations
const modelRegistry = new Map<string, ModelAlias[]>();

// Initialize with default aliases
Object.entries(MODEL_ALIASES).forEach(([alias, chain]) => {
  modelRegistry.set(alias, chain);
});

/**
 * Register a new model alias with fallback chain
 */
export function registerModel(alias: string, chain: ModelAlias[]): void {
  modelRegistry.set(alias, chain);
}

/**
 * Get available model aliases
 */
export function getAvailableAliases(): string[] {
  return Array.from(modelRegistry.keys());
}

/**
 * Resolve model configuration from alias or direct model string
 */
export function resolveModel(
  aliasOrModel?: string,
  options?: ModelOptions
): { provider: string; model: string; options: ModelOptions } {
  const target = aliasOrModel || getDefaultModelAlias();
  
  // Check if it's a registered alias
  if (modelRegistry.has(target)) {
    const chain = modelRegistry.get(target)!;
    const primary = chain[0]; // Use first in chain as primary
    
    return {
      provider: primary.provider,
      model: primary.model,
      options: { ...primary.options, ...options },
    };
  }
  
  // Parse as direct model string (e.g., "openai:gpt-4o-mini")
  const { provider, model } = parseModelString(target);
  
  return {
    provider,
    model,
    options: options || {},
  };
}

/**
 * Get model instance for use with AI SDK
 */
export function getModel(aliasOrModel?: string, options?: ModelOptions) {
  const resolved = resolveModel(aliasOrModel, options);
  
  switch (resolved.provider) {
    case 'openai': {
      // Validate OpenAI API key
      if (!process.env.OPENAI_API_KEY) {
        throw new Error(
          'OPENAI_API_KEY is required for OpenAI models. ' +
          'Please set it in your .env file.'
        );
      }
      
      return openai(resolved.model);
    }
    
    default:
      throw new Error(
        `Unsupported model provider: ${resolved.provider}. ` +
        `Supported providers: openai`
      );
  }
}

/**
 * Get fallback chain for an alias
 */
export function getFallbackChain(alias: string): ModelAlias[] {
  const chain = modelRegistry.get(alias);
  if (!chain) {
    throw new Error(
      `Unknown model alias: ${alias}. ` +
      `Available aliases: ${getAvailableAliases().join(', ')}`
    );
  }
  return chain;
}

/**
 * Test model availability
 */
export async function testModelAvailability(aliasOrModel: string): Promise<boolean> {
  try {
    const model = getModel(aliasOrModel);
    // Simple test generation to verify model is accessible
    await generateText({
      model,
      prompt: 'Test',
      maxTokens: 1,
    });
    return true;
  } catch (error) {
    console.warn(`Model ${aliasOrModel} not available:`, error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Get model with automatic fallback
 */
export async function getModelWithFallback(
  alias: string,
  options?: ModelOptions
): Promise<{ model: any; usedAlias: string; provider: string; modelName: string }> {
  const chain = getFallbackChain(alias);
  
  for (const [index, config] of chain.entries()) {
    try {
      const model = getModel(`${config.provider}:${config.model}`, {
        ...config.options,
        ...options,
      });
      
      // Test if model is available
      const isAvailable = await testModelAvailability(`${config.provider}:${config.model}`);
      
      if (isAvailable) {
        return {
          model,
          usedAlias: index === 0 ? alias : `${alias}-fallback-${index}`,
          provider: config.provider,
          modelName: config.model,
        };
      }
    } catch (error) {
      console.warn(`Fallback ${index + 1}/${chain.length} failed for ${alias}:`, 
        error instanceof Error ? error.message : error);
      
      // If this is the last option, throw the error
      if (index === chain.length - 1) {
        throw new Error(
          `All fallback options exhausted for alias '${alias}'. ` +
          `Last error: ${error instanceof Error ? error.message : error}`
        );
      }
    }
  }
  
  throw new Error(`No available models in fallback chain for alias: ${alias}`);
}