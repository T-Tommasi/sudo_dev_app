import { assertEquals, assertStringIncludes, assertRejects } from "@std/assert";
import { DefaultKnowledgeGate, KnowledgeGate } from "./knowledge_gate.ts";
import { Domain } from "../agent/types.ts";

Deno.test("KnowledgeGate - injects context into briefing", async () => {
  const gate: KnowledgeGate = new DefaultKnowledgeGate();
  const enriched = await gate.inject("Add a users table", "database");
  assertStringIncludes(enriched, "DATABASE CONTEXT");
  assertStringIncludes(enriched, "SCHEMA_CONTEXT");
  assertStringIncludes(enriched, "TABLE: users");
});

Deno.test("KnowledgeGate - injects frontend context", async () => {
  const gate: KnowledgeGate = new DefaultKnowledgeGate();
  const enriched = await gate.inject("Create a button component", "frontend");
  assertStringIncludes(enriched, "FRONTEND CONTEXT");
  assertStringIncludes(enriched, "FRAMEWORK: Svelte 5");
  assertStringIncludes(enriched, "STATE_MANAGEMENT");
});

Deno.test("KnowledgeGate - injects deno context", async () => {
  const gate: KnowledgeGate = new DefaultKnowledgeGate();
  const enriched = await gate.inject("Create an HTTP handler", "deno");
  assertStringIncludes(enriched, "DENO CONTEXT");
  assertStringIncludes(enriched, "RUNTIME: Deno");
  assertStringIncludes(enriched, "Deno.serve");
});

Deno.test("KnowledgeGate - rejects unknown domains", async () => {
  const gate: KnowledgeGate = new DefaultKnowledgeGate();
  await assertRejects(
    async () => {
      await gate.inject("task", "unknown_domain" as Domain);
    },
    Error,
    "Unsupported domain"
  );
});

Deno.test("KnowledgeGate - returns supported domains", () => {
  const gate = new DefaultKnowledgeGate();
  const domains = gate.getSupportedDomains();
  assertEquals(domains.length, 3);
  assertEquals(domains.includes("database"), true);
  assertEquals(domains.includes("frontend"), true);
  assertEquals(domains.includes("deno"), true);
});

Deno.test("KnowledgeGate - custom contexts override defaults", async () => {
  const customGate = new DefaultKnowledgeGate({
    database: "CUSTOM DATABASE CONTEXT",
  });
  const enriched = await customGate.inject("task", "database");
  assertStringIncludes(enriched, "CUSTOM DATABASE CONTEXT");
});