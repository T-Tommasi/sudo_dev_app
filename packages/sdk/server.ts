/**
 * Glass-Box Agentic Platform - SDK HTTP Server
 * Phase 1: HTTP server with WebSocket streaming for real-time observability
 */

import {
  AsyncIterableSpanExporter,
  DatabaseSpanExporter,
} from "../core/state/action_trace.ts";
import { getDb } from "../core/state/db.ts";

export interface HealthResponse {
  status: "healthy" | "unhealthy";
  timestamp: string;
  version: string;
}

/**
 * WebSocket connection limits and message size constraints
 */
const MAX_WEBSOCKET_CONNECTIONS = 100;
const MAX_MESSAGE_SIZE_BYTES = 64 * 1024; // 64KB

/**
 * Rate limiting for message posting per session
 */
const messageRateLimits = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10;

/**
 * Session ID format validation regex
 */
const SESSION_ID_REGEX = /^session_[0-9a-f-]{36}$/;

/**
 * Maximum message content length
 */
const MAX_MESSAGE_LENGTH = 4096;

/**
 * Strips ANSI escape sequences and control characters from strings
 * for safe terminal output. Keeps TAB (0x09), LF (0x0a), CR (0x0d).
 *
 * Strip order: OSC/DEC/8-bit-CSI/8-bit-OSC first (full sequences),
 * then lone ESC, then C0 controls.
 */
export function sanitizeForTerminal(input: string): string {
  return input
    // Strip OSC sequences (\x1b]) with all terminators
    // deno-lint-ignore no-control-regex
    .replace(/\x1b\][^\x07\x1b\x9c]*(?:\x07|\x1b\\|\x9c)/g, "")
    // Strip DEC sequences (\x1b[)
    // deno-lint-ignore no-control-regex
    .replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, "")
    // Strip 8-bit CSI (\x9b)
    .replace(/\x9b[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, "")
    // Strip 8-bit OSC (\x9d)
    // deno-lint-ignore no-control-regex
    .replace(/\x9d[^\x07\x1b\x9c]*(?:\x07|\x1b\\|\x9c)/g, "")
    // Remove remaining ESC characters (after full sequences stripped)
    // deno-lint-ignore no-control-regex
    .replace(/\x1b/g, "")
    // Remove C0 control chars except TAB, LF, CR
    // deno-lint-ignore no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

/**
 * Active WebSocket connection counter with atomic operations
 */
let activeWebSocketCount = 0;

/**
 * Client subscription filter for session/trace filtering
 */
interface SubscriptionFilter {
  sessionId?: string;
  traceId?: string;
}

/**
 * Global span exporters for the observability pipeline
 */
const asyncIterableExporter = new AsyncIterableSpanExporter();
const databaseExporter = new DatabaseSpanExporter();

/**
 * Health check handler for GET /health
 */
function handleHealth(): HealthResponse {
  return {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  };
}

/**
 * Session management for creating and retrieving sessions
 */
interface SessionRow {
  id: string;
  goal: string;
  status: string;
  created_at: string;
  updated_at: string;
  metadata: string | null;
}

/**
 * Creates a new session
 */
function createSession(goal: string, metadata?: Record<string, unknown>): string {
  const db = getDb();
  const id = `session_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  
  const stmt = db.prepare(`
    INSERT INTO sessions (id, goal, status, created_at, updated_at, metadata)
    VALUES (?, ?, 'pending', ?, ?, ?)
  `);
  
  try {
    stmt.run(
      id,
      goal,
      now,
      now,
      metadata ? JSON.stringify(metadata) : null,
    );
    return id;
  } finally {
    stmt.finalize();
  }
}

/**
 * Gets a session by ID
 */
function getSession(sessionId: string): SessionRow | null {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM sessions WHERE id = ?");
  
  try {
    const row = stmt.get(sessionId) as SessionRow | undefined;
    return row ?? null;
  } finally {
    stmt.finalize();
  }
}

/**
 * Gets all sessions
 */
function getAllSessions(): SessionRow[] {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM sessions ORDER BY created_at DESC");
  
  try {
    const rows = stmt.all() as unknown as SessionRow[];
    return rows;
  } finally {
    stmt.finalize();
  }
}

/**
 * In-memory message storage for chat functionality
 * Key: sessionId, Value: array of messages
 */
const sessionMessages = new Map<string, Array<{
  id: string;
  content: string;
  type: string;
  timestamp: string;
}>>();
const MAX_SESSION_MESSAGES = 100;
const MAX_TOTAL_MESSAGES = 10_000;

/**
 * Validates session ID format
 */
export function isValidSessionId(sessionId: string): boolean {
  return SESSION_ID_REGEX.test(sessionId);
}

/**
 * Checks rate limit for message posting
 */
export function checkRateLimit(sessionId: string): boolean {
  const now = Date.now();
  const entry = messageRateLimits.get(sessionId);
  
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    // Start new window
    messageRateLimits.set(sessionId, { count: 1, windowStart: now });
    // Clean old entries (older than 2x window)
    for (const [key, val] of messageRateLimits) {
      if (now - val.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
        messageRateLimits.delete(key);
      }
    }
    return true;
  }
  
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  entry.count++;
  return true;
}

/**
 * Strips control characters from message content
 */
function sanitizeMessageContent(content: string): string {
  // Remove C0 control chars except TAB, LF, CR and strip ANSI sequences
  return sanitizeForTerminal(content);
}

/**
 * Updates session status
 */
function _updateSessionStatus(
  sessionId: string,
  status: string,
): boolean {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?
  `);
  
  try {
    // SQLite stmt.run() returns the number of changes directly
    const changes = stmt.run(status, now, sessionId) as number;
    return changes > 0;
  } finally {
    stmt.finalize();
  }
}

/**
 * Session handler for POST /sessions
 */
async function handleCreateSession(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const goal = body.goal as string;
    
    if (!goal) {
      return Response.json(
        { error: "Missing required field: goal" },
        { status: 400 },
      );
    }
    
    const metadata = body.metadata as Record<string, unknown> | undefined;
    const sessionId = createSession(goal, metadata);
    
    return Response.json(
      { sessionId, goal, status: "pending" },
      { status: 201 },
    );
  } catch (_e) {
    // Sanitize error message - do not expose internal details
    return Response.json(
      { error: "Invalid request" },
      { status: 400 },
    );
  }
}

/**
 * Session handler for GET /sessions/:id
 */
function handleGetSession(_req: Request, sessionId: string): Response {
  // Validate session ID format
  if (!isValidSessionId(sessionId)) {
    return Response.json(
      { error: "Invalid session ID format" },
      { status: 400 },
    );
  }

  const session = getSession(sessionId);
  
  if (!session) {
    return Response.json(
      { error: "Session not found" },
      { status: 404 },
    );
  }
  
  return Response.json({
    id: session.id,
    goal: session.goal,
    status: session.status,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    metadata: session.metadata ? JSON.parse(session.metadata) : null,
  });
}

/**
 * Sessions handler for GET /sessions - List all sessions
 */
export function handleListSessions(): Response {
  const sessions = getAllSessions();
  
  return Response.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      goal: session.goal,
      status: session.status,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    })),
  });
}

/**
 * Message handler for POST /sessions/:id/messages - Send a message to a session
 */
async function handlePostMessage(req: Request, sessionId: string): Promise<Response> {
  // Validate session ID format
  if (!isValidSessionId(sessionId)) {
    return Response.json(
      { error: "Invalid session ID format" },
      { status: 400 },
    );
  }
  
  // Check rate limit
  if (!checkRateLimit(sessionId)) {
    return Response.json(
      { error: "Rate limit exceeded", max: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS },
      { status: 429 },
    );
  }
  
  // Check session exists
  const session = getSession(sessionId);
  if (!session) {
    return Response.json(
      { error: "Session not found" },
      { status: 404 },
    );
  }
  
  try {
    const body = await req.json();
    const content = body.content as string;
    const type = (body.type as string) || "user_message";
    
    // Validate content
    if (!content || typeof content !== "string") {
      return Response.json(
        { error: "Missing required field: content" },
        { status: 400 },
      );
    }
    
    // Validate message type
    if (type !== "user_message" && type !== "direction") {
      return Response.json(
        { error: "Invalid message type. Must be 'user_message' or 'direction'" },
        { status: 400 },
      );
    }
    
    // Truncate and sanitize content
    const sanitizedContent = sanitizeMessageContent(content.slice(0, MAX_MESSAGE_LENGTH));
    
    // Generate message ID
    const messageId = `msg_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    
    // Store message in memory
    const messages = sessionMessages.get(sessionId) || [];
    messages.push({
      id: messageId,
      content: sanitizedContent,
      type,
      timestamp,
    });
    // Enforce message cap
    if (messages.length > MAX_SESSION_MESSAGES) {
      messages.shift();
    }
    sessionMessages.set(sessionId, messages);

    // Enforce global message cap — evict oldest messages across all sessions
    let totalMessages = 0;
    for (const msgs of sessionMessages.values()) {
      totalMessages += msgs.length;
    }
    if (totalMessages > MAX_TOTAL_MESSAGES) {
      let excess = totalMessages - MAX_TOTAL_MESSAGES;
      // Remove oldest messages from all sessions, oldest first
      for (const [sid, msgs] of sessionMessages) {
        while (msgs.length > 0 && excess > 0) {
          msgs.shift();
          excess--;
        }
        if (msgs.length === 0) {
          sessionMessages.delete(sid);
        }
        if (excess <= 0) break;
      }
    }
    
    // Log the message
    console.log(`Message received for session ${sessionId}:`, {
      messageId,
      type,
      contentLength: sanitizedContent.length,
    });
    
    return Response.json(
      { messageId, sessionId, status: "received" },
      { status: 202 },
    );
  } catch (_e) {
    return Response.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
}

/**
 * WebSocket handler for real-time span streaming
 * GET /ws/stream - Streams spans via WebSocket
 * 
 * Implements:
 * - Connection limit (100 concurrent connections)
 * - Message size validation (64KB max)
 * - Session/trace subscription filtering
 * - Proper resource cleanup with AbortController
 */
function handleWebSocketStream(req: Request): Response {
  if (req.headers.get("upgrade") !== "websocket") {
    return Response.json(
      { error: "Expected WebSocket connection" },
      { status: 400 },
    );
  }

  // Check connection limit
  if (activeWebSocketCount >= MAX_WEBSOCKET_CONNECTIONS) {
    return Response.json(
      { error: "Too many connections", max: MAX_WEBSOCKET_CONNECTIONS },
      { status: 503 },
    );
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  
  // Increment connection counter
  activeWebSocketCount++;
  
  // AbortController for proper resource cleanup
  const abortController = new AbortController();
  let subscriptionFilter: SubscriptionFilter = {};
  let isClosed = false;
  
  socket.onopen = () => {
    console.log("WebSocket client connected for span streaming");
  };
  
  socket.onmessage = (event) => {
    // Validate message size
    const messageSize = event.data instanceof Blob 
      ? event.data.size 
      : new TextEncoder().encode(event.data as string).length;
    
    if (messageSize > MAX_MESSAGE_SIZE_BYTES) {
      socket.send(JSON.stringify({
        error: "Message too large",
        maxSize: MAX_MESSAGE_SIZE_BYTES,
      }));
      return;
    }
    
    try {
      const data = JSON.parse(event.data as string);
      
      // Handle subscription messages
      if (data.type === "subscribe") {
        // Validate and store subscription filter
        subscriptionFilter = {
          sessionId: data.sessionId as string | undefined,
          traceId: data.traceId as string | undefined,
        };
        console.log("Client subscribed to:", subscriptionFilter);
      }
    } catch {
      // Ignore non-JSON messages
    }
  };
  
  socket.onerror = () => {
    console.error("WebSocket error");
    isClosed = true;
  };
  
  socket.onclose = () => {
    console.log("WebSocket client disconnected");
    isClosed = true;
    // Decrement connection counter on close
    activeWebSocketCount--;
    // Abort the stream task
    abortController.abort();
  };
  
  // Stream spans to the WebSocket client with filtering
  const streamTask = (async () => {
    try {
      for await (const span of asyncIterableExporter) {
        // Check if aborted or socket closed
        if (abortController.signal.aborted || isClosed || socket.readyState !== WebSocket.OPEN) {
          break;
        }
        
        const spanContext = span.spanContext();
        const attributes = span.attributes as Record<string, unknown>;
        const spanSessionId = attributes["session.id"] as string | undefined;
        const spanTraceId = attributes["trace.id"] as string | undefined;
        
        // Apply subscription filter - only send matching spans
        if (subscriptionFilter.sessionId && spanSessionId !== subscriptionFilter.sessionId) {
          continue;
        }
        if (subscriptionFilter.traceId && spanTraceId !== subscriptionFilter.traceId) {
          continue;
        }
        
        // Sanitize all string attribute values before sending
        const sanitizedAttributes: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(span.attributes)) {
          if (typeof value === "string") {
            sanitizedAttributes[key] = sanitizeForTerminal(value);
          } else {
            sanitizedAttributes[key] = value;
          }
        }
        
        const spanData = {
          traceId: spanContext.traceId,
          spanId: spanContext.spanId,
          parentSpanId: span.parentSpanId,
          name: span.name,
          kind: span.kind,
          startTime: span.startTime,
          endTime: span.endTime,
          attributes: sanitizedAttributes,
          status: span.status,
        };
        
        socket.send(JSON.stringify(spanData));
      }
    } catch (e) {
      // Ignore abort errors
      if (e instanceof Error && e.name === "AbortError") {
        return;
      }
      console.error("Error streaming spans:", e);
    }
  })();
  
  // Don't await here - let the stream run independently
  streamTask.catch((e) => {
    // Ignore abort errors
    if (e instanceof Error && e.name === "AbortError") {
      return;
    }
    console.error("Span stream error:", e);
  });
  
  return response;
}

/**
 * Main request handler for the HTTP server.
 * Routes incoming requests to appropriate handlers.
 */
function handler(req: Request): Response | Promise<Response> {
  try {
    const url = new URL(req.url);

    // GET /health - Health check endpoint
    if (req.method === "GET" && url.pathname === "/health") {
      const health = handleHealth();
      return Response.json(health, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
      });
    }

    // POST /sessions - Create a new session
    if (req.method === "POST" && url.pathname === "/sessions") {
      return handleCreateSession(req);
    }

    // GET /sessions - List all sessions
    if (req.method === "GET" && url.pathname === "/sessions") {
      return handleListSessions();
    }

    // POST /sessions/:id/messages - Send a message to a session
    if (req.method === "POST" && url.pathname.match(/^\/sessions\/[^/]+\/messages$/)) {
      const sessionId = url.pathname.split("/sessions/")[1].split("/messages")[0];
      return handlePostMessage(req, sessionId);
    }

    // GET /sessions/:id - Get session by ID
    if (req.method === "GET" && url.pathname.startsWith("/sessions/")) {
      const sessionId = url.pathname.split("/sessions/")[1];
      return handleGetSession(req, sessionId);
    }

    // GET /ws/stream - WebSocket for real-time span streaming
    if (req.method === "GET" && url.pathname === "/ws/stream") {
      return handleWebSocketStream(req);
    }

    // 404 Not Found for unmatched routes
    return Response.json(
      { error: "Not Found" },
      { status: 404 },
    );
  } catch (e) {
    // Log the actual error internally but do not expose details to client
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    console.error("Internal server error:", errorMessage);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

/**
 * Start the HTTP server.
 * Bind address is configurable via HOST environment variable (default: 127.0.0.1).
 * @param port - Port number to listen on (default: 8080)
 */
export function startServer(port: number = 8080): void {
  const hostname = Deno.env.get("HOST") || "127.0.0.1";
  Deno.serve({ port, hostname }, handler);
}

// Export span exporters for external use
export { asyncIterableExporter, databaseExporter };

// Start server if run directly
if (import.meta.main) {
  startServer();
}