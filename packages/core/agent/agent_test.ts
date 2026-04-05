import { assertEquals, assertExists } from "@std/assert";
import { BaseAgent, AgentContext, AgentResult } from "./types.ts";
import { AgentConfig } from "../config/agentrc.ts";
import { TraceableAgent } from "../telemetry/tracing.ts";

// Mock implementation of BaseAgent for testing
class MockAgent extends BaseAgent {
  readonly name = "mock_agent";
  readonly role = "tester";

  async execute(task: string, _context: AgentContext): Promise<AgentResult> {
    await Promise.resolve();
    if (task === "fail") {
      return { status: "failure", output: "failed" };
    }
    return { status: "success", output: `executed: ${task}` };
  }
}

Deno.test("BaseAgent - defines core interface", async () => {
  const agent = new MockAgent();
  const context: AgentContext = {
    sessionId: "session_123",
    traceId: "trace_abc",
    config: {
      agent: { name: "test" },
      model: { provider: "anthropic", model: "claude-3" },
      limits: { maxSteps: 10, maxRetries: 1, timeoutSeconds: 30 }
    } as AgentConfig
  };

  const result = await agent.execute("hello", context);
  assertEquals(agent.name, "mock_agent");
  assertEquals(agent.role, "tester");
  assertEquals(result.status, "success");
  assertEquals(result.output, "executed: hello");
});

Deno.test("TraceableAgent - wraps and executes agent", async () => {
  const mockAgent = new MockAgent();
  const traceable = new TraceableAgent(mockAgent);
  const context: AgentContext = {
    sessionId: "session_123",
    traceId: "trace_abc",
    config: {
      agent: { name: "test" },
      model: { provider: "anthropic", model: "claude-3" },
      limits: { maxSteps: 10, maxRetries: 1, timeoutSeconds: 30 }
    } as AgentConfig
  };

  const result = await traceable.execute("hello", context);
  assertEquals(result.output, "executed: hello");
  assertEquals(traceable.name, "mock_agent");
  assertEquals(traceable.role, "tester");
});

Deno.test("TraceableAgent - propagates failure status", async () => {
  const mockAgent = new MockAgent();
  const traceable = new TraceableAgent(mockAgent);
  const context: AgentContext = {
    sessionId: "session_456",
    traceId: "trace_def",
    config: {
      agent: { name: "test" },
      model: { provider: "anthropic", model: "claude-3" },
      limits: { maxSteps: 10, maxRetries: 1, timeoutSeconds: 30 }
    } as AgentConfig
  };

  const result = await traceable.execute("fail", context);
  assertEquals(result.status, "failure");
  assertEquals(result.output, "failed");
});

Deno.test("TraceableAgent - handles errors gracefully", async () => {
  const errorAgent = new (class extends BaseAgent {
    readonly name = "error_agent";
    readonly role = "tester";

    async execute(_task: string, _context: AgentContext): Promise<AgentResult> {
      await Promise.resolve();
      throw new Error("Intentional error");
    }
  })();

  const traceable = new TraceableAgent(errorAgent);
  const context: AgentContext = {
    sessionId: "session_789",
    traceId: "trace_ghi",
    config: {
      agent: { name: "test" },
      model: { provider: "anthropic", model: "claude-3" },
      limits: { maxSteps: 10, maxRetries: 1, timeoutSeconds: 30 }
    } as AgentConfig
  };

  const result = await traceable.execute("test", context);
  assertEquals(result.status, "error");
  assertEquals(result.output, "Intentional error");
  assertExists(result.metadata?.error);
});