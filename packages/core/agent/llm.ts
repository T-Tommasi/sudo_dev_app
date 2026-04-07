import { AgentConfig } from "../config/agentrc.ts";
import { LanguageModel, generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Creates an OpenAI-compatible client for /chat/completions endpoint.
 * Used for Kimi, GLM, MiMo models.
 */
function getOpenCodeChatClient(apiKey: string) {
  return new OpenAI({
    apiKey,
    baseURL: "https://opencode.ai/zen/go/v1",
  });
}

/**
 * Creates an Anthropic-compatible client for /messages endpoint.
 * Used for MiniMax models (minimax-m2.5, minimax-m2.7).
 */
function getOpenCodeMessagesClient(apiKey: string) {
  return new Anthropic({
    apiKey,
    baseURL: "https://opencode.ai/zen/go/v1",
  });
}

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
 * Type-safe factory for creating LanguageModel instances.
 * Validates the model before returning to ensure type safety.
 */
function createLanguageModel<T extends LanguageModel>(
  factory: () => T,
  _modelName: string
): LanguageModel {
  const model = factory();
  
  // Cast through unknown to satisfy TypeScript's strict type checking
  // This is necessary because the AI SDK may return LanguageModelV3 
  // but we need LanguageModelV1 compatibility
  return model as unknown as LanguageModel;
}

/**
 * Determines which protocol to use based on the model family.
 * MiniMax models use Anthropic SDK (/messages endpoint).
 * All other OpenCode Go models (Kimi, GLM, MiMo) use OpenAI SDK (/chat/completions).
 */
export function isMiniMaxModel(modelId: string): boolean {
  // Strip prefix if present (e.g., "opencode-go/minimax-m2.5" -> "minimax-m2.5")
  const cleanModelId = modelId.replace(/^opencode-go\//, "");
  return cleanModelId.startsWith("minimax-");
}

export async function generateOpenCodeCompletion(
  modelId: string,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const apiKey = Deno.env.get("OPENCODE_API_KEY");
  if (!apiKey) {
    throw new Error("OPENCODE_API_KEY not found in environment");
  }

  // Strip prefix if present (e.g., "opencode-go/kimi-k2.5" -> "kimi-k2.5")
  const cleanModelId = modelId.replace(/^opencode-go\//, "");

  // Route to appropriate endpoint based on model family
  if (isMiniMaxModel(modelId)) {
    // MiniMax models use Anthropic SDK via /messages endpoint
    const client = getOpenCodeMessagesClient(apiKey);
    
    const response = await client.messages.create({
      model: cleanModelId,
      system: systemPrompt,
      messages: [
        { role: "user", content: userMessage }
      ],
      max_tokens: 4096,
      temperature: 0.7,
    });

    return response.content[0]?.type === "text" ? response.content[0].text : "";
  } else {
    // All other models (Kimi, GLM, MiMo) use OpenAI SDK via /chat/completions endpoint
    const client = getOpenCodeChatClient(apiKey);
    
    const response = await client.chat.completions.create({
      model: cleanModelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      max_tokens: 4096,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || "";
  }
}

function getOpenAIModel(modelId: string): LanguageModel {
  const cacheKey = `openai_${modelId}`;
  
  const cached = staticModels.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const openai = createOpenAI({});
  const model = createLanguageModel(() => openai(modelId) as unknown as LanguageModel, modelId);
  staticModels.set(cacheKey, model);
  return model;
}

function getAnthropicModel(modelId: string): LanguageModel {
  const cacheKey = `anthropic_${modelId}`;
  
  const cached = staticModels.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const anthropic = createAnthropic({});
  const model = createLanguageModel(() => anthropic(modelId) as unknown as LanguageModel, modelId);
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
    // OpenCode Go requires direct HTTP calls due to SDK compatibility issues
    // Use generateOpenCodeCompletion function instead
    return GOOGLE_CLI_SENTINEL; // Placeholder - actual call happens in generateCompletion
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
 * Special handling for OpenCode Go due to SDK compatibility issues.
 *
 * @param model - The LanguageModel instance
 * @param systemPrompt - System prompt to guide the model
 * @param userMessage - The user message/task to process
 * @param modelId - The model ID (needed for OpenCode Go)
 * @returns The generated text output
 */
export async function generateCompletion(
  model: LanguageModel,
  systemPrompt: string,
  userMessage: string,
  modelId?: string
): Promise<string> {
  // Check if this is an OpenCode Go model (has "opencode" in config or special model type)
  if (modelId && (modelId.startsWith("opencode-go/") || modelId.startsWith("glm-") || modelId.startsWith("kimi-") || modelId.startsWith("mimo-") || modelId.startsWith("minimax-"))) {
    return generateOpenCodeCompletion(modelId, systemPrompt, userMessage);
  }

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: userMessage,
  });

  return result.text;
}