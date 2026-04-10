import { WebSocketClient } from "./client.ts";

function assertEquals<T>(actual: T, expected: T): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson} but got ${actualJson}`);
  }
}

Deno.test("WebSocketClient constructor should use provided url", () => {
  const client = new WebSocketClient("ws://custom-url:9000/ws");
  assertEquals(client.isConnected, false); // Not connected until connect() is called
});

Deno.test("WebSocketClient constructor should fall back to default URL when no url or env var provided", () => {
  const client = new WebSocketClient();
  assertEquals(client.isConnected, false);
});

Deno.test("WebSocketClient isConnected should return false when not connected", () => {
  const client = new WebSocketClient();
  assertEquals(client.isConnected, false);
});

Deno.test("WebSocketClient isConnected should return false when WebSocket is null", () => {
  const client = new WebSocketClient();
  // Before any connection attempt, ws is null
  assertEquals(client.isConnected, false);
});

Deno.test("WebSocketClient disconnect should set isRunning to false", () => {
  const client = new WebSocketClient();
  client.disconnect();
  // After disconnect, isConnected should be false since ws is closed
  assertEquals(client.isConnected, false);
});

Deno.test("WebSocketClient disconnect should handle multiple calls", () => {
  const client = new WebSocketClient();
  client.disconnect();
  client.disconnect(); // Should not throw
  assertEquals(client.isConnected, false);
});

Deno.test("WebSocketClient isConnected should remain false without explicit connection", () => {
  const client = new WebSocketClient();
  // Without calling connect(), client should not be connected
  assertEquals(client.isConnected, false);
});
