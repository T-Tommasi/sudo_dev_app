/**
 * Unit tests for database layer (Phase 0.1 foundation)
 * Tests table creation and basic session persistence.
 */
import { Database } from "sqlite";
import { assertEquals, assertExists } from "@std/assert";
import { resolve } from "@std/path";

Deno.test({
  name: "getDb initializes database with schema",
  fn: () => {
    // Use a temporary in-memory database for testing
    const db = new Database(":memory:");

    // Load and execute schema
    const schemaPath = resolve("./packages/core/state/schema.sql");
    const schema = Deno.readTextFileSync(schemaPath);
    db.exec(schema);

    // Verify sessions table exists with correct columns
    const sessionsTable = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
    );
    try {
      const sessions = sessionsTable.get() as { name: string } | undefined;
      assertExists(sessions, "sessions table should exist");
    } finally {
      sessionsTable.finalize();
    }

    // Verify checkpoints table exists
    const checkpointsTable = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='checkpoints'"
    );
    try {
      const checkpoints = checkpointsTable.get() as { name: string } | undefined;
      assertExists(checkpoints, "checkpoints table should exist");
    } finally {
      checkpointsTable.finalize();
    }

    // Verify action_traces table exists
    const actionTracesTable = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='action_traces'"
    );
    try {
      const actionTraces = actionTracesTable.get() as { name: string } | undefined;
      assertExists(actionTraces, "action_traces table should exist");
    } finally {
      actionTracesTable.finalize();
    }

    db.close();
  },
});

Deno.test({
  name: "getDb creates correct column structure for sessions",
  fn: () => {
    const db = new Database(":memory:");

    const schemaPath = resolve("./packages/core/state/schema.sql");
    const schema = Deno.readTextFileSync(schemaPath);
    db.exec(schema);

    // Get column info for sessions table
    const columnsStmt = db.prepare("PRAGMA table_info(sessions)");
    try {
      const columns = columnsStmt.all() as {
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
        pk: number;
      }[];

      const columnNames = columns.map((c) => c.name);
      assertEquals(columnNames.includes("id"), true, "id column should exist");
      assertEquals(columnNames.includes("goal"), true, "goal column should exist");
      assertEquals(columnNames.includes("status"), true, "status column should exist");
      assertEquals(columnNames.includes("created_at"), true, "created_at column should exist");
      assertEquals(columnNames.includes("updated_at"), true, "updated_at column should exist");
      assertEquals(columnNames.includes("metadata"), true, "metadata column should exist");
    } finally {
      columnsStmt.finalize();
    }

    db.close();
  },
});

Deno.test({
  name: "Session persistence - insert and retrieve session",
  fn: () => {
    const db = new Database(":memory:");

    const schemaPath = resolve("./packages/core/state/schema.sql");
    const schema = Deno.readTextFileSync(schemaPath);
    db.exec(schema);

    // Insert a session
    const sessionId = "test-session-001";
    const goal = "Test goal for session persistence";
    const status = "pending";
    const metadata = JSON.stringify({ key: "value" });

    const insertStmt = db.prepare(
      "INSERT INTO sessions (id, goal, status, metadata) VALUES (?, ?, ?, ?)"
    );
    try {
      insertStmt.run(sessionId, goal, status, metadata);
    } finally {
      insertStmt.finalize();
    }

    // Retrieve the session
    const selectStmt = db.prepare(
      "SELECT id, goal, status, metadata FROM sessions WHERE id = ?"
    );
    try {
      const session = selectStmt.get(sessionId) as {
        id: string;
        goal: string;
        status: string;
        metadata: string | null;
      } | undefined;

      assertExists(session, "session should be retrievable");
      assertEquals(session!.id, sessionId);
      assertEquals(session!.goal, goal);
      assertEquals(session!.status, status);
      assertEquals(session!.metadata, metadata);
    } finally {
      selectStmt.finalize();
    }

    db.close();
  },
});

Deno.test({
  name: "Session persistence - update session status",
  fn: () => {
    const db = new Database(":memory:");

    const schemaPath = resolve("./packages/core/state/schema.sql");
    const schema = Deno.readTextFileSync(schemaPath);
    db.exec(schema);

    // Insert a session
    const sessionId = "test-session-002";
    const insertStmt = db.prepare(
      "INSERT INTO sessions (id, goal, status) VALUES (?, ?, ?)"
    );
    try {
      insertStmt.run(sessionId, "Test goal", "pending");
    } finally {
      insertStmt.finalize();
    }

    // Update status to running
    const updateStmt = db.prepare(
      "UPDATE sessions SET status = ?, updated_at = datetime('now') WHERE id = ?"
    );
    try {
      updateStmt.run("running", sessionId);
    } finally {
      updateStmt.finalize();
    }

    // Verify status was updated
    const selectStmt = db.prepare(
      "SELECT status FROM sessions WHERE id = ?"
    );
    try {
      const session = selectStmt.get(sessionId) as { status: string } | undefined;

      assertExists(session, "session should exist after update");
      assertEquals(session!.status, "running");
    } finally {
      selectStmt.finalize();
    }

    db.close();
  },
});

Deno.test({
  name: "Session persistence - delete session cascades to checkpoints",
  fn: () => {
    const db = new Database(":memory:");

    const schemaPath = resolve("./packages/core/state/schema.sql");
    const schema = Deno.readTextFileSync(schemaPath);
    db.exec(schema);

    // Insert session and checkpoint
    const sessionId = "test-session-003";
    const checkpointId = "test-checkpoint-001";

    const insertSessionStmt = db.prepare(
      "INSERT INTO sessions (id, goal, status) VALUES (?, ?, ?)"
    );
    try {
      insertSessionStmt.run(sessionId, "Test goal", "pending");
    } finally {
      insertSessionStmt.finalize();
    }

    const insertCheckpointStmt = db.prepare(
      "INSERT INTO checkpoints (id, session_id, step_number, state_json) VALUES (?, ?, ?, ?)"
    );
    try {
      insertCheckpointStmt.run(checkpointId, sessionId, 1, '{"state": "test"}');
    } finally {
      insertCheckpointStmt.finalize();
    }

    // Delete session
    const deleteStmt = db.prepare("DELETE FROM sessions WHERE id = ?");
    try {
      deleteStmt.run(sessionId);
    } finally {
      deleteStmt.finalize();
    }

    // Verify checkpoint was cascade deleted
    const selectStmt = db.prepare(
      "SELECT id FROM checkpoints WHERE id = ?"
    );
    try {
      const checkpoint = selectStmt.get(checkpointId);

      assertEquals(checkpoint, undefined, "checkpoint should be cascade deleted");
    } finally {
      selectStmt.finalize();
    }

    db.close();
  },
});

Deno.test({
  name: "Indexes are created for query optimization",
  fn: () => {
    const db = new Database(":memory:");

    const schemaPath = resolve("./packages/core/state/schema.sql");
    const schema = Deno.readTextFileSync(schemaPath);
    db.exec(schema);

    // Get all indexes
    const indexesStmt = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
    );
    try {
      const indexes = indexesStmt.all() as { name: string }[];

      const indexNames = indexes.map((i) => i.name);
      assertEquals(indexNames.includes("idx_sessions_status"), true, "sessions status index should exist");
      assertEquals(indexNames.includes("idx_checkpoints_session"), true, "checkpoints session index should exist");
      assertEquals(indexNames.includes("idx_action_traces_session"), true, "action_traces session index should exist");
      assertEquals(indexNames.includes("idx_action_traces_checkpoint"), true, "action_traces checkpoint index should exist");
      assertEquals(indexNames.includes("idx_action_traces_trace_id"), true, "action_traces trace_id index should exist");
    } finally {
      indexesStmt.finalize();
    }

    db.close();
  },
});

Deno.test({
  name: "action_traces table has trace_id column",
  fn: () => {
    const db = new Database(":memory:");

    const schemaPath = resolve("./packages/core/state/schema.sql");
    const schema = Deno.readTextFileSync(schemaPath);
    db.exec(schema);

    // Get column info for action_traces table
    const columnsStmt = db.prepare("PRAGMA table_info(action_traces)");
    try {
      const columns = columnsStmt.all() as {
        name: string;
      }[];

      const columnNames = columns.map((c) => c.name);
      assertEquals(columnNames.includes("trace_id"), true, "trace_id column should exist in action_traces");
    } finally {
      columnsStmt.finalize();
    }

    db.close();
  },
});