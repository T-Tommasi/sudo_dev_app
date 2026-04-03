-- Glass-Box Agentic Platform - Core Schema
-- Phase 0.1: Sessions, Checkpoints, and Action Traces

-- Sessions table: Tracks agentic planning sessions
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    goal TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    metadata TEXT
);

-- Checkpoints table: Snapshots of planning state at decision points
CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    step_number INTEGER NOT NULL,
    state_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Action traces table: Records of executed actions with their outcomes
CREATE TABLE IF NOT EXISTS action_traces (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    checkpoint_id TEXT,
    action_type TEXT NOT NULL,
    action_input TEXT NOT NULL,
    action_output TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    error_message TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id) ON DELETE SET NULL
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id);
CREATE INDEX IF NOT EXISTS idx_action_traces_session ON action_traces(session_id);
CREATE INDEX IF NOT EXISTS idx_action_traces_checkpoint ON action_traces(checkpoint_id);