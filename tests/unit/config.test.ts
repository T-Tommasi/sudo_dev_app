/**
 * Unit tests for configuration validation (Phase 0.1 foundation)
 * Tests .agentrc.yml validation with valid and invalid YAML.
 */
import { assertEquals, assertThrows } from "@std/assert";
import { z } from "zod";
import { parse } from "yaml";
import {
  AgentConfigSchema,
  parseAgentConfigFromYaml,
} from "../../packages/core/config/agentrc.ts";

Deno.test({
  name: "parseAgentConfigFromYaml parses valid minimal config",
  fn: () => {
    const yamlContent = `
agent:
  name: test-agent
model:
  provider: openai
  model: gpt-4
limits:
  maxSteps: 100
  maxRetries: 3
  timeoutSeconds: 300
`;
    const config = parseAgentConfigFromYaml(yamlContent);

    assertEquals(config.agent.name, "test-agent");
    assertEquals(config.model.provider, "openai");
    assertEquals(config.model.model, "gpt-4");
    // Check defaults
    assertEquals(config.model.temperature, 0.7);
    assertEquals(config.limits.maxSteps, 100);
  },
});

Deno.test({
  name: "parseAgentConfigFromYaml parses full config with all fields",
  fn: () => {
    const yamlContent = `
agent:
  name: full-agent
  version: "1.0.0"
  description: A test agent
model:
  provider: anthropic
  model: claude-3-opus
  temperature: 0.5
  maxTokens: 4096
limits:
  maxSteps: 50
  maxRetries: 5
  timeoutSeconds: 600
persistence:
  enabled: true
  checkpointInterval: 5
logging:
  level: debug
  output: both
`;
    const config = parseAgentConfigFromYaml(yamlContent);

    assertEquals(config.agent.name, "full-agent");
    assertEquals(config.agent.version, "1.0.0");
    assertEquals(config.agent.description, "A test agent");
    assertEquals(config.model.provider, "anthropic");
    assertEquals(config.model.model, "claude-3-opus");
    assertEquals(config.model.temperature, 0.5);
    assertEquals(config.model.maxTokens, 4096);
    assertEquals(config.limits.maxSteps, 50);
    assertEquals(config.limits.maxRetries, 5);
    assertEquals(config.limits.timeoutSeconds, 600);
    assertEquals(config.persistence!.enabled, true);
    assertEquals(config.persistence!.checkpointInterval, 5);
    assertEquals(config.logging!.level, "debug");
    assertEquals(config.logging!.output, "both");
  },
});

Deno.test({
  name: "parseAgentConfigFromYaml rejects invalid provider",
  fn: () => {
    const yamlContent = `
agent:
  name: test-agent
model:
  provider: invalid-provider
  model: gpt-4
`;
    const parsed = parse(yamlContent);

    assertThrows(
      () => AgentConfigSchema.parse(parsed),
      z.ZodError,
      "Invalid enum value"
    );
  },
});

Deno.test({
  name: "parseAgentConfigFromYaml rejects missing required fields",
  fn: () => {
    const yamlContent = `
agent:
  name: test-agent
`;
    const parsed = parse(yamlContent);

    assertThrows(
      () => AgentConfigSchema.parse(parsed),
      z.ZodError,
      "Required"
    );
  },
});

Deno.test({
  name: "parseAgentConfigFromYaml rejects empty agent name",
  fn: () => {
    const yamlContent = `
agent:
  name: ""
model:
  provider: openai
  model: gpt-4
`;
    const parsed = parse(yamlContent);

    assertThrows(
      () => AgentConfigSchema.parse(parsed),
      z.ZodError,
      "String must contain at least 1 character"
    );
  },
});

Deno.test({
  name: "parseAgentConfigFromYaml rejects negative temperature",
  fn: () => {
    const yamlContent = `
agent:
  name: test-agent
model:
  provider: openai
  model: gpt-4
  temperature: -0.5
`;
    const parsed = parse(yamlContent);

    assertThrows(
      () => AgentConfigSchema.parse(parsed),
      z.ZodError,
      "Number must be greater than or equal to 0"
    );
  },
});

Deno.test({
  name: "parseAgentConfigFromYaml rejects temperature > 2",
  fn: () => {
    const yamlContent = `
agent:
  name: test-agent
model:
  provider: openai
  model: gpt-4
  temperature: 3.0
`;
    const parsed = parse(yamlContent);

    assertThrows(
      () => AgentConfigSchema.parse(parsed),
      z.ZodError,
      "Number must be less than or equal to 2"
    );
  },
});

Deno.test({
  name: "parseAgentConfigFromYaml rejects non-integer maxSteps",
  fn: () => {
    const yamlContent = `
agent:
  name: test-agent
model:
  provider: openai
  model: gpt-4
limits:
  maxSteps: 10.5
  maxRetries: 3
  timeoutSeconds: 300
`;
    const parsed = parse(yamlContent);

    assertThrows(
      () => AgentConfigSchema.parse(parsed),
      z.ZodError,
      "Expected integer"
    );
  },
});

Deno.test({
  name: "parseAgentConfigFromYaml rejects negative maxRetries",
  fn: () => {
    const yamlContent = `
agent:
  name: test-agent
model:
  provider: openai
  model: gpt-4
limits:
  maxRetries: -1
`;
    const parsed = parse(yamlContent);

    assertThrows(
      () => AgentConfigSchema.parse(parsed),
      z.ZodError,
      "Number must be greater than or equal to 0"
    );
  },
});

Deno.test({
  name: "parseAgentConfigFromYaml rejects invalid logging level",
  fn: () => {
    const yamlContent = `
agent:
  name: test-agent
model:
  provider: openai
  model: gpt-4
logging:
  level: invalid
`;
    const parsed = parse(yamlContent);

    assertThrows(
      () => AgentConfigSchema.parse(parsed),
      z.ZodError,
      "Invalid enum value"
    );
  },
});

Deno.test({
  name: "parseAgentConfigFromYaml rejects invalid logging output",
  fn: () => {
    const yamlContent = `
agent:
  name: test-agent
model:
  provider: openai
  model: gpt-4
logging:
  output: invalid
`;
    const parsed = parse(yamlContent);

    assertThrows(
      () => AgentConfigSchema.parse(parsed),
      z.ZodError,
      "Invalid enum value"
    );
  },
});

Deno.test({
  name: "AgentConfigSchema correctly infers TypeScript type",
  fn: () => {
    // This test verifies the type inference works correctly
    const config: z.infer<typeof AgentConfigSchema> = {
      agent: { name: "type-test" },
      model: { provider: "openai", model: "gpt-4", temperature: 0.7 },
      limits: { maxSteps: 100, maxRetries: 3, timeoutSeconds: 300 },
    };

    assertEquals(config.agent.name, "type-test");
    assertEquals(config.model.provider, "openai");
  },
});