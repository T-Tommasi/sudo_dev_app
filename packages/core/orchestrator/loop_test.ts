import { assertEquals } from "@std/assert";
import { executeTask, type AgentMap } from "./loop.ts";
import { AgentConfig } from "../config/agentrc.ts";
import { AgentResult, AgentStatus } from "../agent/types.ts";

const mockConfig: AgentConfig & { maxSecurityRetries?: number } = {
  agent: { name: "orchestrator", version: "0.1.0" },
  model: { provider: "anthropic", model: "claude-3-sonnet", temperature: 0.7 },
  limits: { maxSteps: 10, maxRetries: 2, timeoutSeconds: 60 },
  maxSecurityRetries: 1
};

// Mock agent factory for creating properly typed mock agents
function createMockAgent(
  name: string,
  role: string,
  executeFn: (task: string) => Promise<AgentResult>
) {
  return {
    name,
    role,
    execute: executeFn
  };
}

// Mocks for the sub-agents
const successMockAgent = createMockAgent(
  "success_agent",
  "tester",
  (task: string) => Promise.resolve({ status: "success" as AgentStatus, output: `processed: ${task}` })
);

const _failMockAgent = createMockAgent(
  "fail_agent",
  "reviewer",
  (_task: string) => Promise.resolve({ status: "failure" as AgentStatus, output: "I found issues" })
);

Deno.test("Agentic Loop - successful execution path", async () => {
  const agents: AgentMap = {
    "implementation": successMockAgent,
    "reviewer": successMockAgent,
    "security_analyzer": successMockAgent,
    "doc_writer": successMockAgent
  };
  
  const result = await executeTask("test goal", mockConfig, agents);
  
  assertEquals(result.status, "success");
});

Deno.test("Agentic Loop - reviewer failure triggers retry", async () => {
  let callCount = 0;
  const retrierAgent = createMockAgent(
    "retrier_agent",
    "general_coder",
    () => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ status: "success" as AgentStatus, output: "initial code" });
      }
      return Promise.resolve({ status: "success" as AgentStatus, output: "fixed code" });
    }
  );

  const reviewerFailAgent = createMockAgent(
    "fail_reviewer",
    "reviewer",
    () => Promise.resolve({ status: "failure" as AgentStatus, output: "Linter error" })
  );

  const agents: AgentMap = {
    "implementation": retrierAgent,
    "reviewer": reviewerFailAgent,
    "security_analyzer": successMockAgent,
    "doc_writer": successMockAgent
  };

  const result = await executeTask("test goal", mockConfig, agents);

  assertEquals(result.status, "success");
  // With maxRetries=2, the implementation agent is called up to 3 times:
  // 1st attempt + 2 retries = 3 total calls before hitting the limit
  assertEquals(callCount, 3);
});