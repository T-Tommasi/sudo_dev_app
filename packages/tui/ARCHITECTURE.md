# TUI Architecture

## Directory Structure

```
packages/tui/
├── main.tsx                      # Entry point
├── mod.ts                        # Package exports (version, state, ws)
├── deno.json                     # Package manifest (@sudo/tui v0.1.0)
├── ws/
│   ├── mod.ts                    # Re-exports client.ts
│   ├── client.ts                 # WebSocket client
│   └── client_test.ts           # Client tests
└── ink/
    ├── mod.ts                    # Re-exports App, Header
    ├── app.tsx                   # Root Ink component
    ├── state/
    │   ├── mod.ts                # Re-exports store.ts
    │   ├── store.ts              # TuiStore, RingBuffer, alert engine
    │   └── store_test.ts         # 37 store test cases
    └── components/
        ├── mod.ts                # Re-exports header.tsx
        └── header.tsx            # Status bar component
```

## Key Modules

### ws/client.ts — WebSocket Client

**Class:** `WebSocketClient`

Manages the WebSocket connection to the platform's stream endpoint.

| Property | Default | Purpose |
|----------|---------|---------|
| `url` | `TUI_WS_URL` env or `ws://localhost:8080/ws/stream` | Stream endpoint |
| `maxReconnectAttempts` | `5` | Retry limit |
| `reconnectDelayMs` | `1000` | Initial backoff delay (ms) |
| `reconnectMaxDelayMs` | `30000` | Backoff cap (30s) |
| `maxQueueSize` | `1000` | Max buffered spans |
| `filter` | `{}` | Subscription filter |

**Async Generator Interface:**

```typescript
async *connect(filter?: SubscriptionFilter): AsyncGenerator<SpanData>
```

- Yields `SpanData` objects as they arrive from the WebSocket
- Automatically reconnects on disconnect (up to 5 attempts)
- Exponential backoff between retries, capped at 30s
- Buffers spans when yield cannot keep up (max 1000, oldest evicted)

**Message Protocol:**

Outbound on connect:
```json
{ "type": "subscribe", "sessionId": "...", "traceId": "..." }
```

Inbound span events:
```json
{ "type": "span", "span": { ...SpanData } }
```

### ink/state/store.ts — State Management

**RingBuffer\<T\>**

Fixed-size circular buffer. When full, pushing evicts the oldest item.

| Method | Purpose |
|--------|---------|
| `push(item)` | Add item, evict oldest if at capacity |
| `getAll()` | Return copy of all items |
| `getLatest(n)` | Return last n items |
| `clear()` | Empty the buffer |

**TuiStore**

Central state container. Not reactive — components poll on interval.

| Field | Type | Initial |
|-------|------|---------|
| `connectionState` | `ConnectionState` | `"disconnected"` |
| `activeSessionId` | `string \| null` | `null` |
| `spans` | `RingBuffer<SpanData>` | capacity 10000 |
| `sessions` | `SessionInfo[]` | `[]` |
| `metrics` | `Metrics` | zeroed |
| `activeFilters` | `string[]` | `[]` |
| `alertRules` | `AlertRule[]` | `[]` |
| `triggeredAlerts` | `Alert[]` | `[]` |

**Metrics:**

```typescript
interface Metrics {
  totalSpans: number;
  successCount: number;    // status.code === 1
  errorCount: number;      // status.code === 2
  toolCounts: Record<string, number>;
  latencyBuckets: number[5]; // [<10ms, 10-50ms, 50-100ms, 100-500ms, ≥500ms]
}
```

**Alert Rule Engine:**

```typescript
interface AlertRule {
  id: string;
  field: string;       // Dot-path into SpanData, e.g. "attributes.tool.name"
  operator: "eq" | "neq" | "contains" | "matches" | "gt" | "lt";
  value: string | number;
  enabled: boolean;
}
```

Evaluation happens synchronously on every `addSpan()` call. Field values are extracted via dot-path traversal. The `matches` operator compiles a regex; patterns exceeding 100 characters are rejected (ReDoS protection).

### ink/components/header.tsx — Header Component

**`sanitizeForTerminal(str)`**

Strips terminal-injection hazards from strings before rendering:

1. Removes all C0/C1 control chars (charCode < 0x20 except printable ASCII) and 8-bit control chars (charCode >= 0x80 && < 0xA0)
2. Removes ANSI escape sequences (`ESC[` ... letter/number sequences)

**Rendered Output:**
```
opencode-glass │ session: {id|—} │ {●|○} {state} │ {HH:MM:SS} UTC
```

### ink/app.tsx — Root App

- Initializes `TuiStore` via `useState` (singleton for app lifetime)
- On mount: creates `WebSocketClient`, calls `connect()`, streams spans into store
- On unmount: disconnects WebSocket, sets state to `disconnected`
- Renders: `Header` + placeholder box ("Phase 1 — panels coming in Phase 2")

## WebSocket Streaming Architecture

```
Platform WebSocket Server
        │
        ▼
WebSocketClient.connect()
  ├── Subscribe message sent on open
  ├── Messages parsed: { type: "span", span: SpanData }
  ├── Span enqueued (max 1000) or delivered to resolveNext promise
  └── AsyncGenerator yields spans to App
        │
        ▼
  App.useEffect → store.addSpan(span)
        │
        ▼
  TuiStore
    ├── spans RingBuffer (cap 10000)
    ├── metrics updated
    └── alert rules evaluated
```

The WebSocket client uses a promise-based trick to bridge the event-based WebSocket API to the async generator pattern. `resolveNext` holds a callback that `onmessage` resolves when it cannot yield immediately.

## Reconnection Flow

```
connect() called
    │
    ▼
WebSocket opened
    │
    ▼
Subscribe message sent
    │
    ▼
while (isRunning && ws)
  ├── Yield from queue or wait for resolveNext
  │
  └── onclose → if isRunning: reconnect with backoff
                    │
                    ▼
                reconnectAttempts++
                    │
                    ▼
                delay = min(1000 * 2^(attempts-1), 30000)
                    │
                    ▼
                await setTimeout(delay) → retry
```

After 5 failed attempts, the generator throws and `isRunning` is set to `false`.

## Security Measures

| Threat | Mitigation | Location |
|--------|------------|----------|
| ReDoS via regex rules | Pattern length check (max 100 chars) | `store.ts:173` |
| Memory exhaustion | Queue size cap (1000 spans) | `client.ts:28,57-59` |
| Reconnection abuse | Exponential backoff capped at 30s | `client.ts:135-138` |
| Terminal injection | Sanitize C0/C1/ANSI in Header | `header.tsx:5-16` |
| Malformed messages | Silently skip unparseable JSON | `client.ts:63-65` |
