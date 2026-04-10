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
    ├── app.tsx                   # Root Ink component, 5-tab layout
    ├── state/
    │   ├── mod.ts                # Re-exports store.ts
    │   ├── store.ts              # TuiStore, RingBuffer, alert engine
    │   └── store_test.ts         # 37 store test cases
    └── components/
        ├── mod.ts                # Re-exports all components
        ├── header.tsx            # Status bar component
        ├── sidebar.tsx           # Sessions sidebar (Phase 2)
        ├── stream.tsx            # Real-time span stream (Phase 2)
        ├── metrics.tsx           # Metrics histogram panel (Phase 2)
        ├── alerts.tsx            # Alerts panel (Phase 2)
        └── filter.tsx            # Filter bar (Phase 2)
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

### ink/components/sidebar.tsx — Sessions Sidebar (Phase 2)

**`Sidebar` component**

Displays a list of sessions fetched from `GET /sessions` with selection and span count.

| Feature | Details |
|---------|---------|
| Fetch | `fetch("http://localhost:8080/sessions")` with Zod validation |
| Keyboard | Up/Down arrows navigate, Enter activates session |
| Display | Session ID (8 chars), status badge (10 chars, color-coded), goal (30 chars, truncated) |
| Status colors | pending=yellow, active=green, completed=blue, failed=red |
| Active indicator | Cyan highlight on currently active session |
| Span count | Live count of spans belonging to each session |

### ink/components/stream.tsx — Stream Panel (Phase 2)

**`StreamPanel` component**

Real-time scrolling span display with keyboard navigation and filtering.

| Feature | Details |
|---------|---------|
| Display | Timestamp (HH:MM:SS), span name, 2-char tool abbrev, duration (ms), status |
| Status codes | 1=OK (green), 2=ERROR (red), default=PENDING (yellow) |
| Auto-scroll | Enabled by default; disabled on manual scroll, re-enabled at bottom |
| Scroll keys | Up/Down (+1 line), PageUp/PageDown (+10 lines), Delete toggles |
| Filtering | Filters by `activeFilters` (matches span name or tool name) |
| Display limit | Last 100 spans |
| Sanitization | All span fields sanitized for terminal (C0/C1, ANSI escapes) |

### ink/components/metrics.tsx — Metrics Panel (Phase 2)

**`Metrics` component**

ASCII histograms for latency distribution and tool invocation counts.

| Feature | Details |
|---------|---------|
| Latency buckets | <10ms, <50ms, <100ms, <100ms, <500ms, >=500ms |
| Tool counts | Top 5 tools by invocation count |
| Bar width | 30 characters (█ for filled, ░ for empty) |
| Summary | Total spans, success (✓), error (✗) |
| Toggle | Click header or Ctrl+M to collapse/expand |
| Polling | 2 second interval |

### ink/components/alerts.tsx — Alerts Panel (Phase 2)

**`Alerts` component**

Displays triggered alerts with flash animation and rule management.

| Feature | Details |
|---------|---------|
| Alert display | Last 20 alerts, timestamp, formatted rule |
| Flash animation | 500ms interval, unacknowledged alerts flash red |
| Acknowledgment | `A` key acknowledges selected alert |
| Rule toggle | `T` key toggles enabled state of selected rule |
| Navigation | Up/Down arrows navigate alerts, Left/Right navigate rules |
| Rule format | `field operator value` with terminal sanitization |
| Indicators | ◉ = enabled, ✗ = disabled |

### ink/components/filter.tsx — Filter Bar (Phase 2)

**`FilterBar` component**

Interactive filter chips with quick filters and add dialog.

| Feature | Details |
|---------|---------|
| Filter chips | Removable via × button, keyboard selectable |
| Quick filters | All, Errors (`status.code=2`), Tools (`has:tool.name`), LLM (`agent.type=llm`) |
| Add filter | `+` or `A` key opens input dialog |
| Dialog keys | Enter to add, Escape to cancel, Backspace/Delete to edit |
| Remove | Delete/Backspace removes selected filter |
| Navigation | Left/Right arrows move between filter chips |
| Display | Cyan highlight on selected filter chip |

### ink/app.tsx — Root App

- Initializes `TuiStore` via `useState` (singleton for app lifetime)
- On mount: creates `WebSocketClient`, calls `connect()`, streams spans into store
- On unmount: disconnects WebSocket, sets state to `disconnected`
- **Phase 2 layout:** Header + Sidebar + FilterBar + 5-tab panel area + collapsible bottom Metrics/Alerts strip
- Tabs: Stream (1), Traces (2, Phase 3), Agent (3, Phase 4), Metrics (4), Alerts (5)
- Keyboard: `1`-`5` switch tabs, `Ctrl+M` toggles metrics/alerts strip

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
