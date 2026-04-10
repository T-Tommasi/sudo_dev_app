# @sudo/tui

Terminal UI package for the opencode-glass AI agent platform. Provides a fullscreen operator command center for real-time observability of agent activities.

## Overview

The TUI connects to the platform's WebSocket stream and displays live agent activity including spans, sessions, metrics, and triggered alerts. It is built with [Ink](https://github.com/vadimdemedes/ink) (React for terminals) running on Deno with Node.js compatibility via npm specifiers.

## Running

```bash
deno run --allow-net --allow-env packages/tui/main.tsx
```

**Environment variable:** `TUI_WS_URL` — WebSocket endpoint (default: `ws://localhost:8080/ws/stream`)

## Dependencies

| Package | Purpose |
|---------|---------|
| `ink@^4.4.0` | Terminal UI framework (React for CLIs) |
| `react@^18.2.0` | UI rendering |
| `@inkjs/ui@^2.0.0` | Ink UI components (select input) |
| `ink-table@^3.0.0` | Table component for spans/sessions |
| `ink-select-input@^6.0.0` | Interactive selection |
| `ink-text-input@^6.0.0` | Text input for filters |
| `@pppp606/ink-chart@^0.2.0` | Chart rendering |

## Architecture

```
packages/tui/
├── main.tsx                # Entry point — renders <App />
├── mod.ts                  # Package exports
├── deno.json               # Package config (@sudo/tui, v0.1.0)
├── ws/
│   ├── mod.ts              # WebSocket module exports
│   ├── client.ts           # WebSocket client with reconnect, queue
│   └── client_test.ts      # Client tests
└── ink/
    ├── mod.ts              # Ink module exports
    ├── app.tsx             # Root Ink component, WebSocket integration
    ├── state/
    │   ├── mod.ts          # State module exports
    │   ├── store.ts        # TuiStore, RingBuffer, alert evaluation
    │   └── store_test.ts   # Store tests (37 test cases)
    └── components/
        ├── mod.ts          # Component exports
        └── header.tsx      # Status bar with session/connection/time
```

## Key Modules

### WebSocket Client (`ws/client.ts`)

- Connects to platform WebSocket stream
- Async generator interface for spans
- Exponential backoff reconnection (1s → 30s cap, max 5 attempts)
- Bounded message queue (max 1000 spans)
- Subscription filtering by `sessionId` / `traceId`

### TuiStore (`ink/state/store.ts`)

- In-memory state for connection, spans, sessions, metrics, alerts
- `RingBuffer<SpanData>` with configurable max size (default 10000)
- Metrics aggregation: span counts, tool counts, latency histograms
- Alert rule engine with field path matching and operators: `eq`, `neq`, `contains`, `matches`, `gt`, `lt`
- ReDoS protection: regex patterns > 100 chars are rejected in `matches` operator

### Header (`ink/components/header.tsx`)

- Status bar: platform name, session ID, connection state indicator, UTC time
- Terminal injection sanitization: strips C0/C1 control chars and ANSI escape sequences

### App (`ink/app.tsx`)

- Root Ink component
- Initializes WebSocket connection on mount, tears down on unmount
- Phase 1: renders Header + placeholder text ("Phase 1 — panels coming in Phase 2")

## Security Measures

| Measure | Location | Details |
|---------|----------|---------|
| ReDoS protection | `store.ts:173` | Regex patterns > 100 chars rejected |
| Queue limit | `client.ts:28,57-59` | Max 1000 spans; oldest evicted on overflow |
| Backoff cap | `client.ts:24,135-138` | Reconnect delay capped at 30s |
| Terminal sanitization | `header.tsx:5-16` | C0/C1 chars filtered; ANSI escapes stripped |
| Error swallowing | `client.ts:63-65` | Malformed JSON skipped silently |

## Exports

```typescript
// Package root (mod.ts)
export const version = "0.1.0";
export * from "./ink/state/mod.ts";
export * from "./ws/mod.ts";

// ink/mod.ts
export { App } from "./app.tsx";
export { Header } from "./components/mod.ts";

// ws/mod.ts
export * from "./client.ts";
```
