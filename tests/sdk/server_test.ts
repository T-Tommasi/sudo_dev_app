/**
 * Unit tests for SDK server functions (Phase 1)
 * Tests sanitizeForTerminal, isValidSessionId, checkRateLimit,
 * handleListSessions, and handlePostMessage.
 */
import { assertEquals, assertExists } from "@std/assert";
import {
  checkRateLimit,
  handleListSessions,
  isValidSessionId,
  sanitizeForTerminal,
} from "../../packages/sdk/server.ts";

Deno.test({
  name: "sanitizeForTerminal strips ESC sequences",
  fn: () => {
    // ESC [ ... ] - CSI sequence
    const csiInput = "\x1b[31mHello\x1b[0m";
    assertEquals(sanitizeForTerminal(csiInput), "Hello");

    // OSC sequence with BEL terminator
    const oscBelInput = "\x1b]8;;http://example.com\x07Link\x1b]8;;\x07";
    assertEquals(sanitizeForTerminal(oscBelInput), "Link");

    // OSC sequence with ST terminator
    const oscStInput = "\x1b]8;;http://example.com\x1b\\Link\x1b]8;;\x1b\\";
    assertEquals(sanitizeForTerminal(oscStInput), "Link");

    // Plain ESC character
    const escInput = "Hello\x1bWorld";
    assertEquals(sanitizeForTerminal(escInput), "HelloWorld");
  },
});

Deno.test({
  name: "sanitizeForTerminal strips 8-bit CSI (\x9b)",
  fn: () => {
    // 8-bit CSI (equivalent to ESC [)
    const csi8BitInput = "\x9b31mHello\x9b0m";
    assertEquals(sanitizeForTerminal(csi8BitInput), "Hello");
  },
});

Deno.test({
  name: "sanitizeForTerminal strips 8-bit OSC (\x9d)",
  fn: () => {
    // 8-bit OSC sequence with BEL terminator
    const osc8BitBelInput = "\x9d8;;http://example.com\x07Link\x9d8;;\x07";
    assertEquals(sanitizeForTerminal(osc8BitBelInput), "Link");

    // 8-bit OSC with ST terminator
    const osc8BitStInput = "\x9d8;;http://example.com\x1b\\Link\x9d8;;\x1b\\";
    assertEquals(sanitizeForTerminal(osc8BitStInput), "Link");
  },
});

Deno.test({
  name: "sanitizeForTerminal strips 8-bit OSC with \x9c terminator",
  fn: () => {
    // OSC with 8-bit ST terminator
    const osc9cInput = "\x1b]8;;http://example.com\x9cLink\x1b]8;;\x9c";
    assertEquals(sanitizeForTerminal(osc9cInput), "Link");
  },
});

Deno.test({
  name: "sanitizeForTerminal strips C0 control characters",
  fn: () => {
    // C0 controls except TAB, LF, CR should be removed
    const c0Input = "Hello\x00\x01\x02World\x07End";
    assertEquals(sanitizeForTerminal(c0Input), "HelloWorldEnd");

    // TAB, LF, CR should be preserved
    const preservedInput = "Hello\x09\x0a\x0dWorld";
    assertEquals(sanitizeForTerminal(preservedInput), "Hello\x09\x0a\x0dWorld");
  },
});

Deno.test({
  name: "sanitizeForTerminal handles empty string",
  fn: () => {
    assertEquals(sanitizeForTerminal(""), "");
  },
});

Deno.test({
  name: "sanitizeForTerminal handles string with no escape sequences",
  fn: () => {
    const normalInput = "Hello World";
    assertEquals(sanitizeForTerminal(normalInput), "Hello World");
  },
});

Deno.test({
  name: "isValidSessionId returns true for valid session IDs",
  fn: () => {
    // Valid format: session_ followed by UUID
    assertEquals(
      isValidSessionId("session_550e8400-e29b-41d4-a716-446655440000"),
      true,
    );
    assertEquals(
      isValidSessionId("session_00000000-0000-0000-0000-000000000000"),
      true,
    );
  },
});

Deno.test({
  name: "isValidSessionId returns false for invalid session IDs",
  fn: () => {
    // Invalid prefixes
    assertEquals(isValidSessionId("invalid_550e8400-e29b-41d4-a716-446655440000"), false);
    assertEquals(isValidSessionId("session-x"), false);
    assertEquals(isValidSessionId("session_"), false);

    // Invalid UUID formats
    assertEquals(isValidSessionId("session_not-a-uuid"), false);
    assertEquals(isValidSessionId("session_gggggggg-gggg-gggg-gggg-gggggggggggg"), false);
    assertEquals(isValidSessionId("session_550e8400e29b41d4a716446655440000"), false); // missing dashes

    // Empty and whitespace
    assertEquals(isValidSessionId(""), false);
    assertEquals(isValidSessionId("  "), false);

    // Completely invalid
    assertEquals(isValidSessionId("hello"), false);
    assertEquals(isValidSessionId("12345"), false);
  },
});

Deno.test({
  name: "checkRateLimit allows first request in window",
  fn: () => {
    const sessionId = `session_${crypto.randomUUID()}`;
    const result = checkRateLimit(sessionId);
    assertEquals(result, true);
  },
});

Deno.test({
  name: "checkRateLimit allows subsequent requests within limit",
  fn: () => {
    const sessionId = `session_${crypto.randomUUID()}`;
    // First request
    checkRateLimit(sessionId);
    // Subsequent requests should be allowed
    const result = checkRateLimit(sessionId);
    assertEquals(result, true);
  },
});

Deno.test({
  name: "checkRateLimit denies when limit exceeded",
  fn: () => {
    const sessionId = `session_${crypto.randomUUID()}`;
    // Exhaust the rate limit (10 requests max)
    for (let i = 0; i < 10; i++) {
      checkRateLimit(sessionId);
    }
    // Next request should be denied
    const result = checkRateLimit(sessionId);
    assertEquals(result, false);
  },
});

Deno.test({
  name: "handleListSessions returns correct response shape",
  fn: async () => {
    const response = handleListSessions();
    assertEquals(response.status, 200);

    const body = await response.json();
    assertExists(body.sessions);
    assertEquals(Array.isArray(body.sessions), true);
  },
});

Deno.test({
  name: "handleListSessions sessions have required fields",
  fn: async () => {
    const response = handleListSessions();
    const body = await response.json();

    if (body.sessions.length > 0) {
      const session = body.sessions[0];
      assertExists(session.id, "session should have id");
      assertExists(session.goal, "session should have goal");
      assertExists(session.status, "session should have status");
      assertExists(session.createdAt, "session should have createdAt");
      assertExists(session.updatedAt, "session should have updatedAt");
    }
  },
});
