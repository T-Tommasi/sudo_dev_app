import { assertEquals } from "@std/assert";
import { executeTask } from "./loop.ts";
import { AgentConfig } from "../config/agentrc.ts";

const mockConfig: AgentConfig & { maxSecurityRetries?: number } = {
  agent: { name: "orchestrator", version: "0.1.0" },
  model: { provider: "anthropic", model: "claude-3-sonnet", temperature: 0.7 },
  limits: { maxSteps: 10, maxRetries: 1, timeoutSeconds: 60 },
  maxSecurityRetries: 1
};

// Mocks for the sub-agents
const successMockAgent = {
  name: "success_agent",
  role: "tester",
  execute: async (task: string) => ({ status: "success", output: `processed: ${task}` })
};

const failMockAgent = {
  name: "fail_agent",
  role: "reviewer",
  execute: async (_task: string) => ({ status: "failure", output: "I found issues" })
};

Deno.test("Agentic Loop - successful execution path", async () => {
  // We need to mock the agents map
  const result = await executeTask("test goal", mockConfig, {
    "implementation": successMockAgent,
    "reviewer": successMockAgent,
    "security_analyzer": successMockAgent,
    "doc_writer": successMockAgent
  } as any);
  
  assertEquals(result.status, "success");
});

Deno.test("Agentic Loop - reviewer failure triggers retry", async () => {
  let callCount = 0;
  const retrierAgent = {
    name: "retrier_agent",
    role: "general_coder",
    execute: async () => {
      callCount++;
      if (callCount === 1) return { status: "success", output: "initial code" };
      return { status: "success", output: "fixed code" };
    }
  };

  const reviewerFailAgent = {
    name: "fail_reviewer",
    role: "reviewer",
    execute: async () => ({ status: "failure", output: "Linter error" })
  };

  const result = await executeTask("test goal", mockConfig, {
    "implementation": retrierAgent,
    "reviewer": reviewerFailAgent,
    "security_analyzer": successMockAgent,
    "doc_writer": successMockAgent
  } as any);

  assertEquals(result.status, "success");
  assertEquals(callCount, 2); // It retried once
});
