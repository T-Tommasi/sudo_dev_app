# opencode-glass

An observability-focused AI agent platform built on Deno. Every agent action, decision, tool execution, and state transition is visible, traceable, and debuggable.

---

## Project Vision

**Glass-Box Transparency** — Every LLM call, tool invocation, and state transition is logged with full context. Failures are debuggable down to the exact token or function call.

**Observability-First Design** — Built from the ground up with telemetry as a first-class concern. Logs, metrics, traces, and real-time streaming are not afterthoughts.

---

## Phase 1: Observability & Checkpointing

Phase 1 establishes the observability layer with SQLite checkpointing and WebSocket-based real-time span streaming.

### Core Components

| File | Purpose |
|------|---------|
| `packages/core/state/db.ts` | SQLite connection management with path traversal protection |
| `packages/core/state/schema.sql` | Sessions, checkpoints, and action traces tables |
| `packages/core/state/checkpoint.ts` | State checkpointing with session linking via TraceID |
| `packages/core/state/action_trace.ts` | OpenTelemetry span exporters for real-time streaming |
| `packages/sdk/server.ts` | HTTP server with WebSocket span streaming |

### SDK Server Features

- **HTTP Endpoints:**
  - `GET /health` — Health check
  - `POST /sessions` — Create a new session
  - `GET /sessions/:id` — Get session by ID
  - `GET /ws/stream` — WebSocket for real-time span streaming

- **WebSocket Observability:**
  - Real-time span streaming to connected clients
  - Session/trace subscription filtering
  - Connection limits (100 concurrent)
  - Message size validation (64KB max)

---

## Directory Structure

```
sudo_dev_app/
├── deno.json              # Workspace root config
├── import_map.json        # Centralized dependency resolution
├── AGENTS.md              # Platform architecture documentation
├── packages/
│   ├── core/              # Core runtime and state management
│   │   ├── config/        # Agent configuration parsing
│   │   └── state/         # SQLite DB, checkpoints, action traces
│   ├── sdk/               # HTTP server with WebSocket streaming
│   └── tui/               # Terminal UI components
└── data/                  # SQLite checkpoint database
```

---

## Getting Started

```bash
# Run the SDK server (default port 8080)
deno run --allow-net --allow-env packages/sdk/server.ts

# Run with custom host/port
HOST=0.0.0.0 deno run --allow-net --allow-env packages/sdk/server.ts
```

### WebSocket Client Example

```typescript
const ws = new WebSocket("ws://localhost:8080/ws/stream");

// Subscribe to specific session
ws.send(JSON.stringify({ type: "subscribe", sessionId: "session_123" }));

// Receive real-time spans
ws.onmessage = (event) => {
  const span = JSON.parse(event.data);
  console.log(span.name, span.status);
};
```

---

## Observability Stack

### Logging
- Structured JSON logging for all HTTP requests
- Agent-specific log contexts (correlation IDs, tool names)
- Log levels: DEBUG, INFO, WARN, ERROR

### Metrics
- Request latency histograms
- Tool execution counters
- Agent cycle completion rates

### Tracing
- OpenTelemetry-compatible span generation
- Session linking via TraceID in span attributes
- Real-time WebSocket streaming

### SQLite Checkpointing
- Sessions, checkpoints, and action traces tables
- Full state snapshots for deterministic replay
- Indexes for common query patterns

---

## Security

### Path Traversal Protection
The database module validates all paths to prevent traversal attacks:
- Absolute paths are rejected
- Relative paths are resolved and validated against the data directory
- Path traversal attempts throw descriptive errors

### Error Sanitization
Internal error details are never exposed to clients. All errors are logged server-side with full context while clients receive sanitized messages.

---

## Version History

| Version | Description |
|---------|-------------|
| 0.1.0 | Phase 1 — Observability layer, SQLite checkpointing, WebSocket streaming |