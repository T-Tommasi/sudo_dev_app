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

---

## Phase 2: Agentic Loop & Orchestration

Phase 2 introduces the secure agentic execution loop with the Orchestrator, KnowledgeGate context injection, and TraceableAgent for full observability.

### Agentic Loop Pipeline

The platform implements a secure execution pipeline: **Implementation → Review → Security → Documentation**.

```
┌─────────────┐    ┌─────────┐    ┌──────────┐    ┌───────────┐
│ Implementation│ -> │ Reviewer│ -> │ Security │ -> │ Doc Writer│
│  (general_coder)│    │         │    │ Analyzer │    │           │
└─────────────┘    └─────────┘    └──────────┘    └───────────┘
       │                  │              │               │
       v                  v              v               v
   Execute task      Verify code   Security audit   Generate docs
   implementation    quality       vulnerabilities  (non-blocking)
```

**Pipeline Behavior:**
- **Implementation** executes first with the task goal
- **Reviewer** validates code quality (lint/type errors, SOLID compliance)
- **Security** performs vulnerability analysis (auth flows, RLS exposure)
- **Doc Writer** generates documentation (non-blocking — failures are logged but don't halt the pipeline)

**Retry Logic:**
- Review failures loop back to Implementation (up to `maxRetries`)
- Security failures retry up to `maxSecurityRetries` (default: 1)
- After max retries, Implementation result proceeds as "best effort" success

### Core Components

| File | Purpose |
|------|---------|
| `packages/core/orchestrator/orchestrator.ts` | Task decomposition, domain routing, review report generation |
| `packages/core/orchestrator/loop.ts` | Agentic loop execution with retry logic and config sanitization |
| `packages/core/orchestrator/knowledge_gate.ts` | Context injection for sub-agent briefings |
| `packages/core/telemetry/tracing.ts` | TraceableAgent decorator with OpenTelemetry spans |
| `packages/core/agent/types.ts` | Agent interfaces (AgentContext, AgentResult, BaseAgent) |
| `packages/core/config/agentrc.ts` | Configuration parsing with Zod validation |

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
│   │   ├── agent/         # Base agent interfaces and types
│   │   ├── config/        # Agent configuration parsing
│   │   ├── orchestrator/  # Task decomposition, loop execution, KnowledgeGate
│   │   ├── state/         # SQLite DB, checkpoints, action traces
│   │   └── telemetry/     # OpenTelemetry tracing (TraceableAgent)
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
| 0.2.0 | Phase 2 — Agentic loop, Orchestrator, KnowledgeGate, TraceableAgent |
| 0.1.0 | Phase 1 — Observability layer, SQLite checkpointing, WebSocket streaming |