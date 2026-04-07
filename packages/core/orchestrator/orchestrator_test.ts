import { assertEquals, assertStringIncludes } from "@std/assert";
import { Orchestrator, SubTask } from "./orchestrator.ts";
import { AgentConfig } from "../config/agentrc.ts";

const mockConfig: AgentConfig = {
  agent: { name: "orchestrator", version: "0.1.0" },
  model: { provider: "anthropic", model: "claude-3-sonnet", temperature: 0.7 },
  limits: { maxSteps: 10, maxRetries: 1, timeoutSeconds: 60 }
};

Deno.test("Orchestrator - decomposes a goal into subtasks", async () => {
  const orchestrator = new Orchestrator(mockConfig);
  const goal = "Build a user login feature with database storage";
  
  // In a real scenario, this would call an LLM. 
  // For the unit test of the Orchestrator class logic, we will mock the LLM call 
  // or test the processing of the returned subtasks.
  const subtasks = await orchestrator.decompose(goal);
  
  assertEquals(Array.isArray(subtasks), true);
  assertEquals(subtasks.length > 0, true);
  assertEquals(subtasks[0].goal !== "", true);
});

Deno.test("Orchestrator - routes subtasks to correct domains", () => {
  const orchestrator = new Orchestrator(mockConfig);
  
  const dbTask: SubTask = { id: "1", goal: "Create users table", domain: "database" };
  const uiTask: SubTask = { id: "2", goal: "Create login form", domain: "frontend" };
  
  const dbAgent = orchestrator.getAgentForTask(dbTask);
  const uiAgent = orchestrator.getAgentForTask(uiTask);
  
  assertEquals(dbAgent.role, "supabase_expert");
  assertEquals(uiAgent.role, "ui_expert");
});

Deno.test("Orchestrator - generates Human Review Gate report", () => {
  const orchestrator = new Orchestrator(mockConfig);
  const actions = [
    { name: "createTable", location: "schema.sql", purpose: "Store users" }
  ];
  
  const report = orchestrator.generateReviewReport("Database Schema Change", actions);
  
  assertStringIncludes(report, "## Review Gate — Database Schema Change");
  assertStringIncludes(report, "### What was done");
  assertStringIncludes(report, "createTable");
  assertStringIncludes(report, "schema.sql");
});
