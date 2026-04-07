import { AgentConfig } from "../config/agentrc.ts";
import { LanguageModel, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { openai as stdOpenAI } from "@ai-sdk/openai";
import { anthropic as stdAnthropic } from "@ai-sdk/anthropic";

/**
 * LRU Cache implementation for model instances.
 * Limits memory usage by evicting least recently used entries when maxSize is reached.
 */
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }
    // Move to end (most recently used)
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    // If key exists, delete and re-add (will be moved to end)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // If at capacity, remove oldest (first) entry
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Sentinel value to indicate google_cli provider (no LLM needed).
 * Using a sentinel object instead of null to avoid null checks everywhere.
 */
export const GOOGLE_CLI_SENTINEL = Object.freeze({ isGoogleCli: true });

type LLMClient = LanguageModel | typeof GOOGLE_CLI_SENTINEL;

// Maximum number of model instances to keep in cache
const MAX_CACHE_SIZE = 10;

// Static model cache for synchronous access
// Uses LRU cache to prevent memory leaks from unbounded growth
const staticModels = new LRUCache<string, LanguageModel>(MAX_CACHE_SIZE);

/**
 * Type guard to validate a value is a valid LanguageModel.
 * Provides safer type checking than unsafe type assertions.
 */
function isValidLanguageModel(value: unknown): value is LanguageModel {
  if (value === null || value === undefined) {
    return false;
  }
  // Check for required properties that indicate a valid LanguageModel
  const obj = value as Record<string, unknown>;
  return typeof obj.generateText === "function";
}

/**
 * Type-safe factory for creating LanguageModel instances.
 * Validates the model before returning to ensure type safety.
 */
function createLanguageModel<T extends LanguageModel>(
  factory: () => T,
  modelName: string
): LanguageModel {
  const model = factory();
  
  // Validate the created model has the expected interface
  if (!isValidLanguageModel(model)) {
    throw new Error(`Failed to create valid LanguageModel for ${modelName}`);
  }
  
  // Cast through unknown to satisfy TypeScript's strict type checking
  // This is necessary because the AI SDK may return LanguageModelV3 
  // but we need LanguageModelV1 compatibility
  return model as unknown as LanguageModel;
}

function getOpenCodeModel(provider: string, modelId: string): LanguageModel {
  const cacheKey = `opencode_${provider}_${modelId}`;
  
  const cached = staticModels.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const apiKey = Deno.env.get("OPENCODE_API_KEY");
  if (!apiKey) {
    throw new Error("OPENCODE_API_KEY not found in environment");
  }

  let model: LanguageModel;
  
  if (modelId.startsWith("minimax-m2.7") || modelId.startsWith("minimax-m2.5")) {
    // Anthropic-Compatible API for minimax models
    const anthropic = createAnthropic({
      apiKey,
      baseURL: "https://opencode.ai/zen/go/v1",
    });
    model = createLanguageModel(() => anthropic(modelId) as unknown as LanguageModel, modelId);
  } else {
    // OpenAI-Compatible API for kimi, glm, mimo models
    const openai = createOpenAI({
      apiKey,
      baseURL: "https://opencode.ai/zen/go/v1",
    });
    model = createLanguageModel(() => openai(modelId) as unknown as LanguageModel, modelId);
  }

  staticModels.set(cacheKey, model);
  return model;
}

function getOpenAIModel(modelId: string): LanguageModel {
  const cacheKey = `openai_${modelId}`;
  
  const cached = staticModels.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const model = createLanguageModel(() => stdOpenAI(modelId) as unknown as LanguageModel, modelId);
  staticModels.set(cacheKey, model);
  return model;
}

function getAnthropicModel(modelId: string): LanguageModel {
  const cacheKey = `anthropic_${modelId}`;
  
  const cached = staticModels.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const model = createLanguageModel(() => stdAnthropic(modelId) as unknown as LanguageModel, modelId);
  staticModels.set(cacheKey, model);
  return model;
}

/**
 * Creates a provider-agnostic LLM client based on the agent configuration.
 * Specifically handles the split-protocol for OpenCode Go models.
 * Uses static model instances for synchronous access.
 *
 * @param config - The agent configuration containing model/provider info
 * @returns A LanguageModel instance for the configured provider
 */
export function createLLMClient(config: AgentConfig): LLMClient {
  const provider = config.model.provider;
  const modelId = config.model.model;

  if (provider === "opencode") {
    return getOpenCodeModel(provider, modelId);
  }

  if (provider === "openai") {
    return getOpenAIModel(modelId);
  }

  if (provider === "anthropic") {
    return getAnthropicModel(modelId);
  }

  if (provider === "google_cli") {
    // google_cli is a special case - it uses the local 'google' CLI tool
    // instead of an API-based LLM. Return sentinel to indicate that the
    // standard LLM client is not used for this provider.
    return GOOGLE_CLI_SENTINEL;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

/**
 * Generate a chat completion using the provided LLM client.
 * This is a convenience function that wraps the Vercel AI SDK's generateText.
 *
 * @param model - The LanguageModel instance
 * @param systemPrompt - System prompt to guide the model
 * @param userMessage - The user message/task to process
 * @returns The generated text output
 */
export async function generateCompletion(
  model: LanguageModel,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: userMessage,
  });

  return result.text;
}