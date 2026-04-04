/**
 * Glass-Box Agentic Platform - Action Trace System
 * Phase 1: OpenTelemetry-based span exporters with session linking via TraceID
 */

import { ExportResult, ExportResultCode } from "@opentelemetry/core";
import { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { getDb } from "./db.ts";
import { z } from "zod";

// Zod schema for validating action trace input
const ActionTraceInputSchema = z.object({
  sessionId: z.string(),
  checkpointId: z.string().nullable(),
  traceId: z.string(),
  actionType: z.string(),
  actionInput: z.record(z.unknown()),
  actionOutput: z.record(z.unknown()).nullable(),
  status: z.string(),
  errorMessage: z.string().nullable(),
});

// Zod schema for action trace record from database
const ActionTraceRecordSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  checkpointId: z.string().nullable(),
  traceId: z.string(),
  actionType: z.string(),
  actionInput: z.string(),
  actionOutput: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
});

export type ActionTraceInput = z.infer<typeof ActionTraceInputSchema>;
export type ValidatedActionTraceRecord = z.infer<typeof ActionTraceRecordSchema>;

/**
 * Span attributes for agentic actions
 */
export interface SpanAttributes {
  "agent.name": string;
  "agent.role": string;
  "action.type": string;
  "session.id": string;
  "trace.id": string;
  "checkpoint.id"?: string;
  "action.input": Record<string, unknown>;
  "action.output": Record<string, unknown>;
  "status": string;
  "error.message"?: string;
}

/**
 * Action trace record stored in the database
 */
export interface ActionTraceRecord {
  id: string;
  sessionId: string;
  checkpointId: string | null;
  traceId: string;
  actionType: string;
  actionInput: string;
  actionOutput: string | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

/**
 * AsyncIterableSpanExporter streams spans in real-time via an async iterator.
 * This is ideal for WebSocket-based streaming to the TUI.
 * 
 * Implements backpressure using highWaterMark to prevent memory exhaustion.
 * Spans are linked to sessions via the TraceID in span.attributes["trace.id"]
 */
export class AsyncIterableSpanExporter implements SpanExporter {
  private _controller?: ReadableStreamDefaultController<ReadableSpan>;
  private _stream: ReadableStream<ReadableSpan>;
  private _isShutdown = false;
  private readonly _highWaterMark: number;

  /**
   * @param highWaterMark - Maximum number of spans to buffer (default: 100)
   */
  constructor(highWaterMark = 100) {
    this._highWaterMark = highWaterMark;
    
    this._stream = new ReadableStream({
      start: (controller) => {
        this._controller = controller;
      },
      cancel: () => {
        this._isShutdown = true;
      },
    }, { highWaterMark: this._highWaterMark });
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    if (this._isShutdown) {
      resultCallback({ code: ExportResultCode.FAILED });
      return;
    }

    for (const span of spans) {
      try {
        this._controller?.enqueue(span);
      } catch {
        // Stream may be closed
        resultCallback({ code: ExportResultCode.FAILED });
        return;
      }
    }
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    this._isShutdown = true;
    this._controller?.close();
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Returns an async iterator that yields spans as they are exported.
   * This enables real-time streaming to WebSocket clients.
   */
  async *[
    Symbol.asyncIterator
  ](): AsyncIterableIterator<ReadableSpan> {
    if (this._isShutdown) {
      return;
    }
    yield* this._stream;
  }

  /**
   * Checks if the exporter has been shut down
   */
  isShutdown(): boolean {
    return this._isShutdown;
  }

  /**
   * Returns the high water mark configuration
   */
  getHighWaterMark(): number {
    return this._highWaterMark;
  }
}

/**
 * OpenTelemetry HrTime type - [seconds, nanoseconds]
 * Both values are numbers
 */
type HrTime = readonly [number, number];

/**
 * Converts OpenTelemetry timestamp (HrTime) to ISO date string
 * HrTime is [seconds, nanoseconds] since Unix epoch
 */
function otelTimestampToISO(timestamp: HrTime): string {
  // Handle invalid or missing timestamp
  if (!timestamp || timestamp.length !== 2) {
    return new Date().toISOString();
  }

  const [seconds, nanoseconds] = timestamp;

  // Handle NaN or invalid numbers
  if (!Number.isFinite(seconds) || !Number.isFinite(nanoseconds)) {
    return new Date().toISOString();
  }

  // Convert seconds + nanoseconds to milliseconds
  const ms = seconds * 1_000 + nanoseconds / 1_000_000;

  // Validate the resulting timestamp
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

/**
 * DatabaseSpanExporter persists spans to the SQLite action_traces table.
 * Links spans to sessions via TraceID stored in span.attributes["trace.id"].
 */
export class DatabaseSpanExporter implements SpanExporter {
  private _isShutdown = false;

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    if (this._isShutdown) {
      resultCallback({ code: ExportResultCode.FAILED });
      return;
    }

    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO action_traces (
        id, session_id, checkpoint_id, trace_id, action_type, action_input, action_output, status, created_at, completed_at, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      for (const span of spans) {
        const spanContext = span.spanContext();
        const attributes = span.attributes as Record<string, unknown>;
        
        // Extract TraceID for session linking (used for debugging/correlation)
        const traceId = (attributes["trace.id"] as string) ?? spanContext.traceId;
        const sessionId = (attributes["session.id"] as string) ?? "unknown";
        const checkpointId = (attributes["checkpoint.id"] as string) ?? null;
        const actionType = (attributes["action.type"] as string) ?? "unknown";
        const status = (attributes["status"] as string) ?? "success";
        const errorMessage = (attributes["error.message"] as string) ?? null;

        // Parse action input/output from attributes
        const actionInput = attributes["action.input"];
        const actionOutput = attributes["action.output"];

        stmt.run(
          spanContext.spanId,
          sessionId,
          checkpointId,
          traceId,
          actionType,
          JSON.stringify(actionInput ?? {}),
          JSON.stringify(actionOutput ?? {}),
          status,
          otelTimestampToISO(span.startTime),
          otelTimestampToISO(span.endTime),
          errorMessage,
        );
      }
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      console.error("Failed to export spans to database:", error);
      resultCallback({ code: ExportResultCode.FAILED });
    } finally {
      stmt.finalize();
    }
  }

  shutdown(): Promise<void> {
    this._isShutdown = true;
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Checks if the exporter has been shut down
   */
  isShutdown(): boolean {
    return this._isShutdown;
  }
}

/**
 * Retrieves action traces for a session, ordered by creation time.
 * 
 * @param sessionId - The session ID to get traces for
 * @returns Array of action trace records
 */
export function getActionTracesBySession(
  sessionId: string,
): ActionTraceRecord[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, session_id, checkpoint_id, trace_id, action_type, action_input, action_output, status, created_at, completed_at, error_message
    FROM action_traces
    WHERE session_id = ?
    ORDER BY created_at ASC
  `);

  try {
    const rows = stmt.all(sessionId) as Array<{
      id: string;
      session_id: string;
      checkpoint_id: string | null;
      trace_id: string;
      action_type: string;
      action_input: string;
      action_output: string | null;
      status: string;
      created_at: string;
      completed_at: string | null;
      error_message: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      checkpointId: row.checkpoint_id,
      traceId: row.trace_id,
      actionType: row.action_type,
      actionInput: row.action_input,
      actionOutput: row.action_output,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      errorMessage: row.error_message,
    }));
  } finally {
    stmt.finalize();
  }
}

/**
 * Retrieves action traces for a checkpoint.
 * 
 * @param checkpointId - The checkpoint ID to get traces for
 * @returns Array of action trace records
 */
export function getActionTracesByCheckpoint(
  checkpointId: string,
): ActionTraceRecord[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, session_id, checkpoint_id, trace_id, action_type, action_input, action_output, status, created_at, completed_at, error_message
    FROM action_traces
    WHERE checkpoint_id = ?
    ORDER BY created_at ASC
  `);

  try {
    const rows = stmt.all(checkpointId) as Array<{
      id: string;
      session_id: string;
      checkpoint_id: string | null;
      trace_id: string;
      action_type: string;
      action_input: string;
      action_output: string | null;
      status: string;
      created_at: string;
      completed_at: string | null;
      error_message: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      checkpointId: row.checkpoint_id,
      traceId: row.trace_id,
      actionType: row.action_type,
      actionInput: row.action_input,
      actionOutput: row.action_output,
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at,
      errorMessage: row.error_message,
    }));
  } finally {
    stmt.finalize();
  }
}

/**
 * Deletes action traces for a session.
 * 
 * @param sessionId - The session ID to delete traces for
 * @returns The number of traces deleted
 */
export function deleteActionTracesBySession(sessionId: string): number {
  const db = getDb();
  const stmt = db.prepare("DELETE FROM action_traces WHERE session_id = ?");

  try {
    const result = stmt.run(sessionId);
    // SQLite driver returns the number of changes directly for run operations
    const changes = typeof result === "number" ? result : 0;
    return changes;
  } finally {
    stmt.finalize();
  }
}