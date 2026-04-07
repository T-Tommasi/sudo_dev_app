import { assertEquals } from "@std/assert";
import { Orchestrator, type SubTask } from "./orchestrator.ts";
import { AgentConfig } from "../config/agentrc.ts";

const mockConfig: AgentConfig = {
  agent: { name: "orchestrator", version: "0.1.0" },
  model: { provider: "anthropic", model: "claude-3-sonnet", temperature: 0.7 },
  limits: { maxSteps: 10, maxRetries: 1, timeoutSeconds: 60 }
};

Deno.test("LLMAgent - getAgentForTask returns correct agent for database domain", () => {
  const orchestrator = new Orchestrator(mockConfig);
  const task: SubTask = { id: "1", goal: "Create users table", domain: "database" };
  
  const agent = orchestrator.getAgentForTask(task);
  
  assertEquals(agent.role, "supabase_expert");
  assertEquals(agent.name, "supabase_expert");
});

Deno.test("LLMAgent - getAgentForTask returns correct agent for frontend domain", () => {
  const orchestrator = new Orchestrator(mockConfig);
  const task: SubTask = { id: "1", goal: "Create login form", domain: "frontend" };
  
  const agent = orchestrator.getAgentForTask(task);
  
  assertEquals(agent.role, "ui_expert");
  assertEquals(agent.name, "ui_expert");
});

Deno.test("LLMAgent - getAgentForTask returns correct agent for deno domain", () => {
  const orchestrator = new Orchestrator(mockConfig);
  const task: SubTask = { id: "1", goal: "Create edge function", domain: "deno" };
  
  const agent = orchestrator.getAgentForTask(task);
  
  assertEquals(agent.role, "deno_expert");
  assertEquals(agent.name, "deno_expert");
});

Deno.test("LLMAgent - getAgentForTask returns correct agent for security domain", () => {
  const orchestrator = new Orchestrator(mockConfig);
  const task: SubTask = { id: "1", goal: "Audit authentication", domain: "security" };
  
  const agent = orchestrator.getAgentForTask(task);
  
  assertEquals(agent.role, "security_analyzer");
  assertEquals(agent.name, "security_analyzer");
});

Deno.test("LLMAgent - getAgentForTask returns correct agent for implementation domain", () => {
  const orchestrator = new Orchestrator(mockConfig);
  const task: SubTask = { id: "1", goal: "Implement feature", domain: "implementation" };
  
  const agent = orchestrator.getAgentForTask(task);
  
  assertEquals(agent.role, "general_coder");
  assertEquals(agent.name, "general_coder");
});

Deno.test("LLMAgent - getAgentForTask returns correct agent for documentation domain", () => {
  const orchestrator = new Orchestrator(mockConfig);
  const task: SubTask = { id: "1", goal: "Write API docs", domain: "documentation" };
  
  const agent = orchestrator.getAgentForTask(task);
  
  assertEquals(agent.role, "doc_writer");
  assertEquals(agent.name, "doc_writer");
});

Deno.test("LLMAgent - getAgentForTask returns correct agent for google_cli domain", () => {
  const orchestrator = new Orchestrator(mockConfig);
  const task: SubTask = { id: "1", goal: "Deploy to gcloud", domain: "google_cli" };
  
  const agent = orchestrator.getAgentForTask(task);
  
  assertEquals(agent.role, "google_cli");
  assertEquals(agent.name, "google_cli_agent");
});

Deno.test("LLMAgent - getAgentForTask returns default agent for unknown domain", () => {
  const orchestrator = new Orchestrator(mockConfig);
  const task: SubTask = { id: "1", goal: "Do something", domain: "implementation" };
  
  const agent = orchestrator.getAgentForTask(task);
  
  // Default case returns ImplementationAgent
  assertEquals(agent.role, "general_coder");
});

Deno.test("LLMAgent - decompose returns subtasks with matching domains", () => {
  const orchestrator = new Orchestrator(mockConfig);
  const goal = "Create a database table and a frontend form";
  
  const subtasks = orchestrator.decompose(goal);
  
  assertEquals(subtasks.length >= 2, true);
  const domains = subtasks.map(t => t.domain);
  assertEquals(domains.includes("database"), true);
  assertEquals(domains.includes("frontend"), true);
});

Deno.test("LLMAgent - decompose returns implementation domain when no keywords match", () => {
  const orchestrator = new Orchestrator(mockConfig);
  const goal = "Do something generic";
  
  const subtasks = orchestrator.decompose(goal);
  
  assertEquals(subtasks.length, 1);
  assertEquals(subtasks[0].domain, "implementation");
});

Deno.test("LLMAgent - decompose handles google_cli keywords", () => {
  const orchestrator = new Orchestrator(mockConfig);
  const goal = "Deploy to Google Cloud using gcloud";
  
  const subtasks = orchestrator.decompose(goal);
  
  const domains = subtasks.map(t => t.domain);
  assertEquals(domains.includes("google_cli"), true);
});

Deno.test("LLMAgent - generateReviewReport handles empty actions", () => {
  const orchestrator = new Orchestrator(mockConfig);
  
  const report = orchestrator.generateReviewReport("Test", []);
  
  assertEquals(report.includes("No actions recorded"), true);
});

Deno.test("LLMAgent - generateReviewReport formats actions correctly", () => {
  const orchestrator = new Orchestrator(mockConfig);
  const actions = [
    { name: "createTable", location: "schema.sql", purpose: "Store users" }
  ];
  
  const report = orchestrator.generateReviewReport("Database Change", actions);
  
  assertEquals(report.includes("createTable"), true);
  assertEquals(report.includes("schema.sql"), true);
  assertEquals(report.includes("Store users"), true);
});

Deno.test("LLMAgent - generateReviewReport detects ambiguous purposes", () => {
  const orchestrator = new Orchestrator(mockConfig);
  const actions = [
    { name: "unknownFunction", location: "unknown.ts", purpose: "?" }
  ];
  
  const report = orchestrator.generateReviewReport("Test", actions);
  
  assertEquals(report.includes("ambiguous purposes"), true);
});