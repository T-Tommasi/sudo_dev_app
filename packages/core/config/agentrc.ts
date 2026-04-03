import { z } from "zod";
import { parse } from "yaml";

/**
 * Zod schema for .agentrc.yml configuration file.
 * Defines the structure for agentic platform configuration.
 */
export const AgentConfigSchema = z.object({
  /** Agent identifier and metadata */
  agent: z.object({
    name: z.string().min(1),
    version: z.string().optional(),
    description: z.string().optional(),
  }),
  /** LLM provider configuration */
  model: z.object({
    provider: z.enum(["openai", "anthropic"]),
    model: z.string().min(1),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().int().positive().optional(),
  }),
  /** Execution limits and constraints */
  limits: z.object({
    maxSteps: z.number().int().positive().default(100),
    maxRetries: z.number().int().nonnegative().default(3),
    timeoutSeconds: z.number().int().positive().default(300),
  }),
  /** Optional session persistence settings */
  persistence: z.object({
    enabled: z.boolean().default(true),
    checkpointInterval: z.number().int().positive().default(10),
  }).optional(),
  /** Optional logging configuration */
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]).default("info"),
    output: z.enum(["console", "file", "both"]).default("console"),
  }).optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * Parse and validate an .agentrc.yml configuration file.
 * @param configPath - Path to the .agentrc.yml file
 * @returns Parsed and validated configuration object
 * @throws ZodError if validation fails
 * @throws Error if file cannot be read
 */
export function parseAgentConfig(configPath: string): AgentConfig {
  let content: string;
  try {
    content = Deno.readTextFileSync(configPath);
  } catch (e) {
    throw new Error(`Failed to read configuration file: ${configPath}`, { cause: e });
  }
  const parsed = parse(content);
  return AgentConfigSchema.parse(parsed);
}

/**
 * Parse and validate configuration from a YAML string.
 * @param yamlContent - Raw YAML content string
 * @returns Parsed and validated configuration object
 * @throws ZodError if validation fails
 */
export function parseAgentConfigFromYaml(yamlContent: string): AgentConfig {
  const parsed = parse(yamlContent);
  return AgentConfigSchema.parse(parsed);
}