/**
 * Glass-Box Agentic Platform - Checkpoint Management
 * Phase 1: State checkpointing with session linking via TraceID
 */

import { getDb } from "./db.ts";
import { z } from "zod";

/**
 * Zod schema for validating metadata
 */
const MetadataSchema: z.ZodType<Record<string, unknown>> = z.record(
  z.string(),
  z.unknown(),
);

/**
 * Zod schema for validating AgentState
 */
const AgentStateSchema = z.object({
  goal: z.string(),
  currentStep: z.number().int().min(0),
  maxSteps: z.number().int().min(1),
  traceId: z.string(),
  sessionId: z.string(),
  metadata: MetadataSchema,
});

export type AgentState = z.infer<typeof AgentStateSchema>;

/**
 * Checkpoint data structure representing a snapshot of agent state
 */
export interface CheckpointData {
  id: string;
  sessionId: string;
  stepNumber: number;
  stateJson: string;
  createdAt: string;
}

/**
 * Generates a unique checkpoint ID
 */
function generateCheckpointId(): string {
  return `cp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates a new checkpoint for a session.
 * Links the checkpoint to the session via session_id and TraceID.
 * 
 * @param sessionId - The session ID to associate the checkpoint with
 * @param stepNumber - The step number in the agent execution
 * @param state - The agent state to persist
 * @returns The created checkpoint data
 * @throws Error if the session doesn't exist or checkpoint creation fails
 */
export function createCheckpoint(
  sessionId: string,
  stepNumber: number,
  state: AgentState,
): CheckpointData {
  const db = getDb();
  const id = generateCheckpointId();
  const stateJson = JSON.stringify(state);
  const createdAt = new Date().toISOString();

  // Verify session exists before creating checkpoint
  const sessionCheck = db.prepare(
    "SELECT id FROM sessions WHERE id = ?",
  ).get(sessionId);

  if (!sessionCheck) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const stmt = db.prepare(`
    INSERT INTO checkpoints (id, session_id, step_number, state_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  try {
    stmt.run(id, sessionId, stepNumber, stateJson, createdAt);
    
    return {
      id,
      sessionId,
      stepNumber,
      stateJson,
      createdAt,
    };
  } catch (error) {
    throw new Error(`Failed to create checkpoint: ${error}`);
  } finally {
    stmt.finalize();
  }
}

/**
 * Retrieves a checkpoint by its ID.
 * 
 * @param checkpointId - The checkpoint ID to retrieve
 * @returns The checkpoint data or null if not found
 */
export function getCheckpoint(checkpointId: string): CheckpointData | null {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, session_id, step_number, state_json, created_at
    FROM checkpoints
    WHERE id = ?
  `);

  try {
    const row = stmt.get(checkpointId) as {
      id: string;
      session_id: string;
      step_number: number;
      state_json: string;
      created_at: string;
    } | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      stepNumber: row.step_number,
      stateJson: row.state_json,
      createdAt: row.created_at,
    };
  } finally {
    stmt.finalize();
  }
}

/**
 * Retrieves all checkpoints for a session, ordered by step number.
 * 
 * @param sessionId - The session ID to get checkpoints for
 * @returns Array of checkpoint data
 */
export function getCheckpointsBySession(sessionId: string): CheckpointData[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, session_id, step_number, state_json, created_at
    FROM checkpoints
    WHERE session_id = ?
    ORDER BY step_number ASC
  `);

  try {
    const rows = stmt.all(sessionId) as Array<{
      id: string;
      session_id: string;
      step_number: number;
      state_json: string;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      stepNumber: row.step_number,
      stateJson: row.state_json,
      createdAt: row.created_at,
    }));
  } finally {
    stmt.finalize();
  }
}

/**
 * Retrieves the latest checkpoint for a session.
 * 
 * @param sessionId - The session ID to get the latest checkpoint for
 * @returns The latest checkpoint data or null if none exist
 */
export function getLatestCheckpoint(sessionId: string): CheckpointData | null {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT id, session_id, step_number, state_json, created_at
    FROM checkpoints
    WHERE session_id = ?
    ORDER BY step_number DESC
    LIMIT 1
  `);

  try {
    const row = stmt.get(sessionId) as {
      id: string;
      session_id: string;
      step_number: number;
      state_json: string;
      created_at: string;
    } | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      stepNumber: row.step_number,
      stateJson: row.state_json,
      createdAt: row.created_at,
    };
  } finally {
    stmt.finalize();
  }
}

/**
 * Deletes a checkpoint by its ID.
 * 
 * @param checkpointId - The checkpoint ID to delete
 * @returns True if the checkpoint was deleted, false if not found
 */
export function deleteCheckpoint(checkpointId: string): boolean {
  const db = getDb();
  const stmt = db.prepare("DELETE FROM checkpoints WHERE id = ?");

  try {
    const result = stmt.run(checkpointId);
    // SQLite driver returns { changes: number } for run operations
    const changes = (result as unknown as { changes: () => number }).changes();
    return changes > 0;
  } finally {
    stmt.finalize();
  }
}

/**
 * Deletes all checkpoints for a session.
 * 
 * @param sessionId - The session ID to delete checkpoints for
 * @returns The number of checkpoints deleted
 */
export function deleteCheckpointsBySession(sessionId: string): number {
  const db = getDb();
  const stmt = db.prepare("DELETE FROM checkpoints WHERE session_id = ?");

  try {
    const result = stmt.run(sessionId);
    // SQLite driver returns { changes: number } for run operations
    const changes = (result as unknown as { changes: () => number }).changes();
    return changes;
  } finally {
    stmt.finalize();
  }
}

/**
 * Parses the state JSON from a checkpoint into an AgentState object.
 * Validates the parsed state against the AgentState schema.
 * 
 * @param checkpoint - The checkpoint to parse
 * @returns The validated AgentState
 * @throws Error if the state JSON is invalid
 */
export function parseCheckpointState(checkpoint: CheckpointData): AgentState {
  const parsed = JSON.parse(checkpoint.stateJson);
  
  // Validate with Zod
  const result = AgentStateSchema.safeParse(parsed);
  
  if (!result.success) {
    const errorMessages = result.error.issues.map((issue: z.ZodIssue) => issue.message);
    throw new Error(`Invalid AgentState: ${errorMessages.join(", ")}`);
  }
  
  return result.data;
}