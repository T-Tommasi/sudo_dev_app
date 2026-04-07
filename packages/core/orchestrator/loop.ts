import { AgentConfig, AgentConfigSchema } from "../config/agentrc.ts";
import { AgentContext, AgentResult, BaseAgent } from "../agent/types.ts";
import { createTraceableAgent } from "../telemetry/tracing.ts";

/**
 * Type-safe agent role constants to replace stringly-typed keys.
 * Use these constants when accessing the agents map.
 */
export const AgentRole = {
  IMPLEMENTATION: "implementation",
  REVIEWER: "reviewer",
  SECURITY_ANALYZER: "security_analyzer",
  DOC_WRITER: "doc_writer",
} as const;

export type AgentRoleType = typeof AgentRole[keyof typeof AgentRole];

export type AgentMap = Record<AgentRoleType, BaseAgent>;

export interface LoopConfig extends AgentConfig {
  maxSecurityRetries?: number;
}

const DEFAULT_MAX_SECURITY_RETRIES = 1;
const DEFAULT_MAX_ITERATIONS = 100;

/**
 * Sanitize AgentConfig to prevent injection of malicious values.
 * Creates a safe copy with validated/sanitized values.
 */
function sanitizeAgentConfig(config: LoopConfig): AgentConfig {
  // Validate the config structure first
  const validated = AgentConfigSchema.parse(config);

  // Create sanitized copy with enforced bounds
  return {
    agent: {
      name: validated.agent.name,
      version: validated.agent.version,
      description: validated.agent.description,
    },
    model: {
      provider: validated.model.provider,
      model: validated.model.model,
      temperature: Math.max(0, Math.min(2, validated.model.temperature)),
      maxTokens: validated.model.maxTokens,
    },
    limits: {
      maxSteps: Math.max(1, validated.limits.maxSteps),
      maxRetries: Math.max(0, validated.limits.maxRetries),
      timeoutSeconds: Math.max(1, validated.limits.timeoutSeconds),
    },
    persistence: validated.persistence
      ? {
          enabled: validated.persistence.enabled,
          checkpointInterval: Math.max(1, validated.persistence.checkpointInterval),
        }
      : undefined,
    logging: validated.logging
      ? {
          level: validated.logging.level,
          output: validated.logging.output,
        }
      : undefined,
  };
}

/**
 * Validate and enforce security-related config constraints.
 * Ensures maxSecurityRetries is at least 1.
 */
function validateSecurityConfig(config: LoopConfig): LoopConfig {
  const maxSecurityRetries = config.maxSecurityRetries ?? DEFAULT_MAX_SECURITY_RETRIES;
  return {
    ...config,
    maxSecurityRetries: Math.max(1, maxSecurityRetries),
  };
}

function generateId(): string {
  return crypto.randomUUID();
}

export async function executeTask(
  goal: string,
  config: LoopConfig,
  agents: AgentMap
): Promise<AgentResult> {
  // Validate and enforce security constraints
  const validatedConfig = validateSecurityConfig(config);
  const sanitizedConfig = sanitizeAgentConfig(validatedConfig);

  // TypeScript doesn't know validateSecurityConfig guarantees >= 1, so we assert it
  const maxSecurityRetries = validatedConfig.maxSecurityRetries as number;
  const sessionId = generateId();
  const traceId = generateId();

  const context: AgentContext = {
    sessionId,
    traceId,
    config: sanitizedConfig,
  };

  const maxRetries = sanitizedConfig.limits.maxRetries ?? 3;
  const maxIterations = DEFAULT_MAX_ITERATIONS;
  const currentGoal = goal;
  let securityRetryCount = 0;
  let implementationAttempts = 0;
  let iterationCount = 0;

  // Implementation -> Review -> Security -> Doc Writer pipeline
  while (true) {
    // Global iteration limit to prevent infinite loops
    iterationCount++;
    if (iterationCount > maxIterations) {
      return {
        status: "halt",
        output: `Maximum iteration limit (${maxIterations}) reached. Halting to prevent infinite loop.`,
      };
    }
    // Step 1: Execute Implementation agent (wrapped for observability)
    const implementationAgent = agents[AgentRole.IMPLEMENTATION];
    if (!implementationAgent) {
      return { status: "error", output: "Implementation agent not found" };
    }

    // Wrap with TraceableAgent for Glass-Box observability
    const traceableImplAgent = createTraceableAgent(implementationAgent);
    implementationAttempts++;
    const implResult = await traceableImplAgent.execute(currentGoal, context);

    // Step 2: Execute Reviewer agent (wrapped for observability)
    const reviewerAgent = agents[AgentRole.REVIEWER];
    if (!reviewerAgent) {
      return { status: "error", output: "Reviewer agent not found" };
    }

    // Wrap with TraceableAgent for Glass-Box observability
    const traceableReviewerAgent = createTraceableAgent(reviewerAgent);
    const reviewResult = await traceableReviewerAgent.execute(currentGoal, context);

    if (reviewResult.status === "failure") {
      // Reviewer failed → loop back to Implementation (retry) if under limit
      // Note: Using > maxRetries to allow exactly maxRetries retries after initial attempt
      // Example: maxRetries=1 allows 2 attempts (initial + 1 retry)
      if (implementationAttempts > maxRetries) {
        // After max retries, return implementation result as success (best effort)
        return {
          status: "success",
          output: implResult.output,
          metadata: {
            implementation: implResult.output,
            review: "max retries reached, proceeding with best effort",
          },
        };
      }
      continue;
    }

    if (reviewResult.status === "error") {
      return { status: "error", output: reviewResult.output };
    }

    // Step 3: Execute Security agent (wrapped for observability)
    const securityAgent = agents[AgentRole.SECURITY_ANALYZER];
    if (!securityAgent) {
      return { status: "error", output: "Security analyzer agent not found" };
    }

    // Wrap with TraceableAgent for Glass-Box observability
    const traceableSecurityAgent = createTraceableAgent(securityAgent);
    const securityResult = await traceableSecurityAgent.execute(currentGoal, context);

    if (securityResult.status === "failure") {
      // Security failed → retry up to N times
      // Note: Using > maxSecurityRetries to allow exactly maxSecurityRetries retries
      securityRetryCount++;
      if (securityRetryCount > maxSecurityRetries) {
        // Halting after max retries
        return { status: "halt", output: securityResult.output };
      }
      // Security retry succeeded - restart from Implementation to re-verify
      // Reset implementationAttempts so the full pipeline runs again
      implementationAttempts = 0;
      // This fixes the pipeline state leak where security retry success 
      // doesn't re-verify implementation
      continue;
    }

    if (securityResult.status === "error") {
      return { status: "error", output: securityResult.output };
    }

    // Step 4: Execute Doc Writer agent (non-blocking, wrapped for observability)
    const docWriterAgent = agents[AgentRole.DOC_WRITER];
    if (docWriterAgent) {
      try {
        // Wrap with TraceableAgent for Glass-Box observability
        const traceableDocWriterAgent = createTraceableAgent(docWriterAgent);
        const docResult = await traceableDocWriterAgent.execute(currentGoal, context);
        if (docResult.status === "failure") {
          // Non-blocking: log warning but continue
          console.warn("Doc Writer failed:", docResult.output);
        }
      } catch (e) {
        // Non-blocking: log warning but continue
        console.warn("Doc Writer error:", e);
      }
    }

    // All stages passed successfully
    return {
      status: "success",
      output: implResult.output,
      metadata: {
        implementation: implResult.output,
        review: reviewResult.output,
        security: securityResult.output,
      },
    };
  }
}