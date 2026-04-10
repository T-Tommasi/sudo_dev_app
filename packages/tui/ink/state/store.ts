import type { SpanData } from "../../ws/client.ts";

export class RingBuffer<T> {
  private buffer: T[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  push(item: T): void {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift();
    }
    this.buffer.push(item);
  }

  getAll(): T[] {
    return [...this.buffer];
  }

  getLatest(n: number): T[] {
    if (n >= this.buffer.length) {
      return [...this.buffer];
    }
    return this.buffer.slice(-n);
  }

  get size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
  }
}

export type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

export interface AlertRule {
  id: string;
  field: string;
  operator: "eq" | "neq" | "contains" | "matches" | "gt" | "lt";
  value: string | number;
  enabled: boolean;
}

export interface Alert {
  id: string;
  ruleId: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

export interface SessionInfo {
  id: string;
  goal: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Metrics {
  totalSpans: number;
  successCount: number;
  errorCount: number;
  toolCounts: Record<string, number>;
  latencyBuckets: number[];
}

export interface TuiState {
  connectionState: ConnectionState;
  activeSessionId: string | null;
  spans: RingBuffer<SpanData>;
  sessions: SessionInfo[];
  metrics: Metrics;
  activeFilters: string[];
  alertRules: AlertRule[];
  triggeredAlerts: Alert[];
}

function createInitialMetrics(): Metrics {
  return {
    totalSpans: 0,
    successCount: 0,
    errorCount: 0,
    toolCounts: {},
    latencyBuckets: [0, 0, 0, 0, 0],
  };
}

export class TuiStore {
  private state: TuiState;

  constructor() {
    this.state = {
      connectionState: "disconnected",
      activeSessionId: null,
      spans: new RingBuffer<SpanData>(10000),
      sessions: [],
      metrics: createInitialMetrics(),
      activeFilters: [],
      alertRules: [],
      triggeredAlerts: [],
    };
  }

  setConnectionState(state: ConnectionState): void {
    this.state.connectionState = state;
  }

  addSpan(span: SpanData): void {
    this.state.spans.push(span);
    this.state.metrics.totalSpans++;

    // Update status counts
    if (span.status.code === 2) {
      this.state.metrics.errorCount++;
    } else if (span.status.code === 1) {
      this.state.metrics.successCount++;
    }

    // Track tool counts
    const toolName = span.attributes["tool.name"] as string | undefined;
    if (toolName) {
      this.state.metrics.toolCounts[toolName] =
        (this.state.metrics.toolCounts[toolName] ?? 0) + 1;
    }

    // Calculate latency and update bucket
    const start = new Date(span.startTime).getTime();
    const end = new Date(span.endTime).getTime();
    const latencyMs = end - start;

    if (latencyMs < 10) {
      this.state.metrics.latencyBuckets[0]++;
    } else if (latencyMs < 50) {
      this.state.metrics.latencyBuckets[1]++;
    } else if (latencyMs < 100) {
      this.state.metrics.latencyBuckets[2]++;
    } else if (latencyMs < 500) {
      this.state.metrics.latencyBuckets[3]++;
    } else {
      this.state.metrics.latencyBuckets[4]++;
    }

    // Evaluate alert rules
    this.evaluateAlertRules(span);
  }

  private evaluateAlertRules(span: SpanData): void {
    for (const rule of this.state.alertRules) {
      if (!rule.enabled) continue;

      const fieldValue = this.getFieldValue(span, rule.field);
      if (fieldValue === undefined) continue;

      let matched = false;
      switch (rule.operator) {
        case "eq":
          matched = String(fieldValue) === String(rule.value);
          break;
        case "neq":
          matched = String(fieldValue) !== String(rule.value);
          break;
        case "contains":
          matched = String(fieldValue).includes(String(rule.value));
          break;
        case "matches":
          try {
            const pattern = String(rule.value);
            if (pattern.length > 100) {
              matched = false;
              break;
            }
            matched = new RegExp(pattern).test(String(fieldValue));
          } catch {
            matched = false;
          }
          break;
        case "gt":
          matched = Number(fieldValue) > Number(rule.value);
          break;
        case "lt":
          matched = Number(fieldValue) < Number(rule.value);
          break;
      }

      if (matched) {
        this.addAlert({
          id: crypto.randomUUID(),
          ruleId: rule.id,
          message: `Alert triggered: ${rule.field} ${rule.operator} ${rule.value} (got: ${fieldValue})`,
          timestamp: new Date().toISOString(),
          acknowledged: false,
        });
      }
    }
  }

  private getFieldValue(span: SpanData, field: string): unknown {
    const parts = field.split(".");
    let value: unknown = span;
    for (const part of parts) {
      if (value && typeof value === "object" && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return value;
  }

  setSessions(sessions: SessionInfo[]): void {
    this.state.sessions = sessions;
  }

  setActiveSession(sessionId: string | null): void {
    this.state.activeSessionId = sessionId;
  }

  addFilter(filter: string): void {
    if (!this.state.activeFilters.includes(filter)) {
      this.state.activeFilters.push(filter);
    }
  }

  removeFilter(filter: string): void {
    this.state.activeFilters = this.state.activeFilters.filter((f) => f !== filter);
  }

  addAlert(alert: Alert): void {
    this.state.triggeredAlerts.push(alert);
  }

  acknowledgeAlert(alertId: string): void {
    const alert = this.state.triggeredAlerts.find((a) => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  toggleAlertRule(ruleId: string): void {
    const idx = this.state.alertRules.findIndex((r) => r.id === ruleId);
    if (idx === -1) return;
    const updated = [...this.state.alertRules];
    updated[idx] = { ...updated[idx], enabled: !updated[idx].enabled };
    this.state.alertRules = updated;
  }

  getState(): TuiState {
    return this.state;
  }

  getSpansForSession(sessionId: string): SpanData[] {
    return this.state.spans.getAll().filter((s) => s.attributes["session.id"] === sessionId);
  }

  getActiveAlerts(): Alert[] {
    return this.state.triggeredAlerts.filter((a) => !a.acknowledged);
  }
}
