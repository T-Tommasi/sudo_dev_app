# sudo_dev_app

A self-made custom application for agentic development workflows focused on monitorable results and procedures. Mostly just made it for fun.

---

## Project Vision

**Glass-Box Transparency** — Every agent action, decision, and tool execution is visible, traceable, and debuggable. No black-box AI behavior.

**Observability-First Design** — Built from the ground up with telemetry as a first-class concern. Logs, metrics, and traces are not afterthoughts — they are the backbone of the platform.

The platform aims to create an AI agent system where:
- Every LLM call is logged with full prompt/response context
- Tool invocations are traced with input/output schemas
- Agent state transitions are observable in real-time
- Failures are debuggable down to the exact token or function call

---

## Phase 0.1 Foundation

Phase 0.1 establishes the core runtime configuration and SDK infrastructure.

### Core Configuration

| File | Purpose |
|------|---------|
| `deno.json` | Deno runtime configuration, permissions, import resolution |
| `import_map.json` | Centralized dependency management for all SDK packages |

### SDK Server

The basic SDK server provides:
- HTTP endpoint for agent tool invocations
- Request/response logging middleware
- Structured error handling
- Health check endpoint

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
- Tool input/output schema capture
- LLM call context propagation

### Dashboard
- Real-time log streaming
- Metric visualization
- Trace exploration

---

## Getting Started

```bash
# Run the SDK server
deno run --allow-net --allow-env src/server.ts

# Run with observability enabled
deno run --allow-net --allow-env --allow-read src/server.ts
```

---

## Project Structure

```
├── deno.json           # Runtime config
├── import_map.json     # Dependency map
├── src/
│   ├── server.ts       # SDK server entry
│   ├── observability/  # Logging, metrics, tracing
│   └── agents/         # Agent implementations
└── README.md
```