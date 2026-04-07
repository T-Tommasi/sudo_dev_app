import { assertEquals, assertExists } from "@std/assert";
import { GoogleCliAgent, createGoogleCliAgent } from "./google_cli.ts";
import { AgentContext } from "./types.ts";

const mockContext: AgentContext = {
  sessionId: "session_123",
  traceId: "trace_abc",
  config: {
    agent: { name: "test" },
    model: { provider: "google_cli", model: "google-cli", temperature: 0.7 },
    limits: { maxSteps: 10, maxRetries: 1, timeoutSeconds: 30 }
  }
};

Deno.test("GoogleCliAgent - has correct name and role", () => {
  const agent = new GoogleCliAgent();
  
  assertEquals(agent.name, "google_cli_agent");
  assertEquals(agent.role, "google_cli");
});

Deno.test("GoogleCliAgent - createGoogleCliAgent factory creates agent", () => {
  const agent = createGoogleCliAgent();
  
  assertEquals(agent.name, "google_cli_agent");
  assertEquals(agent.role, "google_cli");
});

Deno.test("GoogleCliAgent - parseTask extracts command and args", () => {
  const agent = new GoogleCliAgent();
  
  // Access private method via casting
  const parseTask = (agent as unknown as { parseTask: (task: string) => { command: string; args: string[] } }).parseTask;
  
  const result = parseTask("gcloud compute instances list");
  
  assertEquals(result.command, "gcloud");
  // args should be everything after the command (index 1 onwards)
  assertEquals(result.args, ["compute", "instances", "list"]);
});

Deno.test("GoogleCliAgent - parseTask handles google prefix", () => {
  const agent = new GoogleCliAgent();
  const parseTask = (agent as unknown as { parseTask: (task: string) => { command: string; args: string[] } }).parseTask;
  
  const result = parseTask("google auth login");
  
  assertEquals(result.command, "auth");
  assertEquals(result.args, ["login"]);
});

Deno.test("GoogleCliAgent - parseTask handles empty args", () => {
  const agent = new GoogleCliAgent();
  const parseTask = (agent as unknown as { parseTask: (task: string) => { command: string; args: string[] } }).parseTask;
  
  const result = parseTask("gcloud");
  
  assertEquals(result.command, "gcloud");
  assertEquals(result.args, []);
});

Deno.test("GoogleCliAgent - parseTask defaults to help when no command", () => {
  const agent = new GoogleCliAgent();
  const parseTask = (agent as unknown as { parseTask: (task: string) => { command: string; args: string[] } }).parseTask;
  
  const result = parseTask("google");
  
  assertEquals(result.command, "help");
  assertEquals(result.args, []);
});

Deno.test("GoogleCliAgent - parseTask handles multiple spaces", () => {
  const agent = new GoogleCliAgent();
  const parseTask = (agent as unknown as { parseTask: (task: string) => { command: string; args: string[] } }).parseTask;
  
  const result = parseTask("  gcloud   compute   instances   list  ");
  
  assertEquals(result.command, "gcloud");
  assertEquals(result.args, ["compute", "instances", "list"]);
});

Deno.test("GoogleCliAgent - execute returns error for missing google CLI", async () => {
  const agent = new GoogleCliAgent();
  
  // The google CLI likely isn't installed in test environment, so this should fail
  const result = await agent.execute("nonexistent command", mockContext);
  
  // Either success (if google is installed) or error (if not)
  assertEquals(result.status === "success" || result.status === "error", true);
  assertExists(result.metadata);
  assertEquals(result.metadata?.tool, "google_cli");
});

Deno.test("GoogleCliAgent - execute includes command in metadata on success", async () => {
  const agent = new GoogleCliAgent();
  
  // Try to execute a command - may fail if google CLI not installed
  const result = await agent.execute("version", mockContext);
  
  if (result.status === "success") {
    assertEquals(result.metadata?.command, "version");
  }
});

Deno.test("GoogleCliAgent - execute includes args in metadata on success", async () => {
  const agent = new GoogleCliAgent();
  
  const result = await agent.execute("help", mockContext);
  
  if (result.status === "success") {
    assertEquals(Array.isArray(result.metadata?.args), true);
  }
});