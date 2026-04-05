# opencode-glass Platform Architecture

## Overview

**code-glass** is an observability-focused AI agent platform built on Deno. The platform implements a "Glass-Box" philosophy — every agent action, decision, tool execution, and state transition is visible, traceable, and debuggable. There are no black-box AI behaviors.

The platform is designed for teams who need:
- Full audit trails of agentic workflows
- Real-time visibility into agent decision-making
- Deterministic replay capability through checkpoints
- Human-in-the-loop safety gates for critical operations

---

## Glass-Box Philosophy

The Glass-Box philosophy is the foundational design principle of the opencode-glass platform. Unlike traditional AI agent systems that treat the LLM as a black box with unpredictable behavior, opencode-glass treats every LLM call, tool invocation, and state transition as a first-class observable event.

### Core Principles

1. **Complete Traceability** — Every token of every prompt and response is logged. No LLM interaction happens in silence.

2. **Deterministic State Capture** — At every decision point, the platform captures a checkpoint of the complete agent state. This enables replay, debugging, and recovery from failures.

3. **Real-Time Visibility** — The ActionTrace system provides live streaming of agent activities, enabling operators to observe behavior as it happens.

4. **Auditability by Default** — All action outcomes (success, failure, error) are recorded with full context. Post-mortem analysis can reconstruct the exact sequence of events leading to any outcome.

5. **Debuggability to the Token Level** — When something goes wrong, operators can trace failures back to the exact LLM call, tool invocation, or state transition that caused the issue.

---

## Multi-Agent Orchestration

The platform uses a hierarchical multi-agent architecture where responsibilities are divided among specialized roles. This separation ensures that each agent has a clear, single responsibility, and enables precise observability at each stage.

### Agent Roles

#### Orchestrator

The Orchestrator is the top-level coordinator that owns the task lifecycle. It decomposes incoming requests into atomic subtasks, routes them to appropriate sub-agents, and gates progress between stages.

**Responsibilities:**
- Task decomposition into domain-specific subtasks
- Agent routing based on domain boundaries
- Approval gate management (schema changes, auth changes, human review triggers)
- Commit management after discrete completed tasks

**Observability:**
- Emits spans for every task decomposition and routing decision
- Logs all approval gates with their outcomes
- Tracks commit boundaries explicitly

#### Knowledge Gate

The Knowledge Gate acts as a contextual filter and enrichment layer. Before any sub-agent receives a task briefing, the Knowledge Gate ensures the briefing is self-contained — including all relevant schema, types, patterns, and prior decisions.

**Responsibilities:**
- Context injection into sub-agent briefings
- Schema and type verification before task handoff
- Cross-domain dependency detection
- Documentation of domain boundaries

**Observability:**
- Logs all context injections with their sources
- Tracks schema verification outcomes
- Records cross-domain dependency warnings

#### Sub-Agents

Sub-agents are domain-specialized execution units. Each sub-agent operates within a strict domain boundary and halts with a spec when a task exceeds that boundary.

**Domain Assignments:**

| Domain | Agent |
|--------|-------|
| Database schema, RLS, SQL, migrations | supabase_expert |
| Frontend components, UI/UX, Svelte stores | ui_expert |
| Deno runtime, Edge Functions, LangGraph | deno_expert |
| Security audits, auth flows, RLS exposure | security_analyzer |
| Implementation, refactoring, debugging | general_coder |
| Code review (post-implementation) | reviewer |
| Documentation, PLAN.md, API docs | doc_writer |

**Responsibilities:**
- Execute tasks within their domain boundary
- Halt and return a spec when crossing domain boundaries
- Emit complete observability data for every action

**Observability:**
- Every tool invocation is traced with input/output schemas
- All LLM calls include full prompt/response context
- State transitions are recorded as discrete events

#### Reviewer

The Reviewer is a specialized sub-agent focused on post-implementation quality assurance. It operates after the primary implementation is complete and performs a final review pass.

**Responsibilities:**
- Code quality verification (lint/type errors)
- SOLID principle compliance checking
- Security vulnerability detection
- Actionable improvement proposals

**Observability:**
- Records all review findings with severity levels
- Tracks remediation actions and outcomes

---

## Agentic Loop Pipeline

The platform implements a secure execution pipeline for task fulfillment. The loop ensures every implementation passes through quality gates before completion.

### Pipeline Stages

```
Implementation → Review → Security → Doc Writer
```

| Stage | Agent | Purpose | Blocking? |
|-------|-------|---------|-----------|
| 1 | `general_coder` | Execute the implementation task | Yes |
| 2 | `reviewer` | Verify code quality, SOLID compliance | Yes |
| 3 | `security_analyzer` | Audit vulnerabilities, auth flows, RLS | Yes |
| 4 | `doc_writer` | Generate documentation | No |

### Retry Behavior

- **Review failures** — Loop back to Implementation (up to `maxRetries`)
- **Security failures** — Retry up to `maxSecurityRetries` (default: 1)
- **Doc Writer failures** — Non-blocking; logged as warnings

After max retries, the Implementation result proceeds as "best effort" success.

### Configuration

The loop enforces security constraints through config sanitization:

```typescript
const config = {
  limits: {
    maxSteps: 100,      // Maximum execution steps
    maxRetries: 3,      // Implementation retry limit
    timeoutSeconds: 300 // Execution timeout
  }
};
```

### Execution Flow

1. **Decompose** — Orchestrator breaks goal into domain-specific subtasks
2. **Route** — Subtasks assigned to domain-specialized agents
3. **Execute** — Pipeline runs through each stage sequentially
4. **Checkpoint** — State saved at configurable intervals
5. **Gate** — Human Review triggered for schema/auth/security changes

---

## KnowledgeGate Context Injection

The KnowledgeGate acts as a contextual filter and enrichment layer. Before any sub-agent receives a task briefing, the KnowledgeGate ensures the briefing is self-contained — including all relevant schema, types, patterns, and prior decisions.

### Supported Domains

| Domain | Context Provided |
|--------|-----------------|
| `database` | Schema definitions, table structures, RLS policies, query patterns |
| `frontend` | Svelte 5 runes, component patterns, state management, API integration |
| `deno` | Deno runtime, import paths, deployment patterns, testing conventions |

### Interface

```typescript
interface KnowledgeGate {
  inject(briefing: string, domain: Domain): Promise<string>;
  getSupportedDomains(): Domain[];
  registerDomain(domain: Domain, context: string): void;
}
```

### Usage

```typescript
import { createKnowledgeGate } from "@opencode-glass/core/orchestrator/knowledge_gate.ts";

const knowledgeGate = createKnowledgeGate();

// Inject context into a briefing
const enrichedBriefing = await knowledgeGate.inject(
  "Create a new user table",
  "database"
);
```

The KnowledgeGate supports runtime domain registration for extensibility beyond the built-in domains.

---

## Directory Structure

```
sudo_dev_app/
├── deno.json              # Workspace root config
├── import_map.json        # Centralized dependency resolution
├── AGENTS.md              # This file
├── packages/
│   ├── core/              # Core runtime and configuration
│   ├── sdk/               # HTTP API and client SDK
│   └── tui/               # Terminal UI components
└── data/                  # SQLite checkpoint database
```

### packages/core

The core package contains the foundational runtime infrastructure:

| Path | Purpose |
|------|---------|
| `agent/types.ts` | BaseAgent, AgentContext, AgentResult interfaces |
| `config/agentrc.ts` | `.agentrc.yml` parsing and validation |
| `orchestrator/orchestrator.ts` | Task decomposition, domain routing, review reports |
| `orchestrator/loop.ts` | Agentic loop execution with retry logic |
| `orchestrator/knowledge_gate.ts` | Context injection for sub-agent briefings |
| `telemetry/tracing.ts` | TraceableAgent decorator with OpenTelemetry spans |
| `state/db.ts` | SQLite connection management |
| `state/schema.sql` | Session, checkpoint, and action trace tables |

> **Note:** The agent implementations in `orchestrator/orchestrator.ts` are stubs that return the input task as output. These are placeholder implementations for testing the orchestration logic. Real agent implementations should be provided by the caller of the Orchestrator.

**Key Exports:**
- `BaseAgent` — Abstract base class for all agents
- `AgentContext` — Session and trace context passed to agents
- `AgentResult` — Execution result with status and metadata
- `AgentConfigSchema` — Zod schema for configuration validation
- `parseAgentConfig()` — Parse and validate `.agentrc.yml` files
- `Orchestrator` — Task decomposition and agent routing
- `executeTask()` — Agentic loop execution with retry logic
- `KnowledgeGate` — Context injection interface
- `TraceableAgent` — OpenTelemetry-decorated agent wrapper
- `createTraceableAgent()` — Factory for TraceableAgent instances

### packages/sdk

The SDK package provides HTTP server infrastructure and client utilities:

| Path | Purpose |
|------|---------|
| `server.ts` | HTTP server with health check and routing |

**Key Exports:**
- `startServer(port)` — Start the HTTP server
- `HealthResponse` — Health check response interface

### packages/tui

The TUI package provides terminal-based interfaces for interacting with the platform. This package is designed for local development workflows and operator consoles.

---

## Lifecycle Hooks: .agentrc.yml

The platform uses `.agentrc.yml` as the configuration file for agentic runtime behavior. This file defines execution limits, LLM provider settings, persistence behavior, and lifecycle hooks.

### Configuration Schema

```yaml
agent:
  name: "orchestrator"
  version: "0.1.0"
  description: "Main orchestrator agent"

model:
  provider: "anthropic"  # or "openai"
  model: "claude-sonnet-4-20250514"
  temperature: 0.7
  maxTokens: 4096

limits:
  maxSteps: 100
  maxRetries: 3
  timeoutSeconds: 300

persistence:
  enabled: true
  checkpointInterval: 10  # Save checkpoint every N steps

logging:
  level: "info"  # debug, info, warn, error
  output: "console"  # console, file, both
```

### Lifecycle Hooks

The platform supports lifecycle hooks through the persistence and logging configuration. While the current implementation uses checkpoint intervals, the architecture is designed to support explicit hooks:

| Hook | Trigger | Purpose |
|------|---------|---------|
| `on_launch` | Agent session initialization | Initialize logging context, establish database connection |
| `on_step` | Every execution step | Record action trace, update checkpoint |
| `on_checkpoint` | At checkpoint intervals | Persist complete state to SQLite |
| `on_success` | Task completion | Finalize session, record success metrics |
| `on_failure` | Task or step failure | Record error context, trigger recovery |
| `on_timeout` | Execution timeout | Capture final state, log timeout metrics |

### Configuration Parsing

```typescript
import { parseAgentConfig } from "@opencode-glass/core/config/agentrc.ts";

// Parse from file path
const config = parseAgentConfig("./.agentrc.yml");

// Or parse from YAML string
const yamlContent = Deno.readTextFileSync("./.agentrc.yml");
const config = parseAgentConfigFromYaml(yamlContent);
```

The `parseAgentConfig()` function validates the configuration against the Zod schema and throws descriptive errors if validation fails.

---

## Security & Safety

### Shadow Workspaces

The platform implements Shadow Workspaces as an isolation mechanism for executing untrusted or experimental agent code. Shadow workspaces operate in complete isolation from the primary workspace, ensuring that:

- File system access is restricted to designated directories
- Network access can be explicitly denied or limited
- Environment variables are scoped and sanitized
- No side effects leak into the primary development environment

When an agent receives untrusted input (AI-generated code, user-submitted scripts, experimental tooling), the Orchestrator routes execution through a Shadow Workspace. The results are validated before being applied to the primary workspace.

### Human Review Gates

Human Review Gates are mandatory pause points in the task lifecycle. The platform halts all further actions, produces a structured report, and requires explicit human confirmation before proceeding.

#### When Human Review Gates Trigger

- **Schema migrations or RLS changes** — Any database schema modification
- **Authentication or security-critical paths** — Changes to auth flows, permission boundaries
- **New library or major dependency additions** — Any external dependency introduction
- **Non-trivial refactoring** — Significant structural changes not explicitly requested

#### Gate Report Format

When a Human Review Gate triggers, the platform produces a structured report:

```markdown
## Review Gate — [short task title]

### What was done
[Precise description of every action taken]

### Functions and modules introduced
For each new function or module:
- **Name:** [function name]
- **Location:** [file path]
- **Purpose:** [one sentence]
- **Inputs / Outputs:** [types and shapes]
- **Why it exists:** [problem solved]

### How it integrates
[How new code connects to existing modules, data flows, API surfaces]

### Open decisions and ambiguities
[Unresolved assumptions, alternative approaches considered]
```

#### Question Tool Usage

After the report, the platform uses the Question Tool to cover all four required aspects:

1. **Correctness confirmation** — Verify built output matches intent
2. **Next action selection** — Present concrete options for proceeding
3. **Ambiguity flagging** — Explicitly surface unresolved decisions
4. **Pre-commit approval** — Require explicit approval before committing

The platform does not proceed until the human has responded to every question.

---

## Observability Layer

The observability layer is a first-class concern in the opencode-glass platform. Every component is designed to emit structured telemetry data that can be queried, visualized, and analyzed.

### OpenTelemetry Integration

The platform generates OpenTelemetry-compatible spans for:

- **LLM calls** — Prompt/response context, token counts, latency
- **Tool invocations** — Input/output schemas, execution time, outcomes
- **Agent state transitions** — Before/after states, decision rationale
- **HTTP requests** — Request/response logging with correlation IDs

Span attributes include:
- `agent.name` — Name of the agent performing the action
- `agent.role` — Role (orchestrator, sub-agent, reviewer)
- `action.type` — Type of action (llm_call, tool_invocation, state_transition)
- `session.id` — Session correlation ID
- `trace.id` — Distributed trace identifier

### SQLite Checkpointing

The platform uses SQLite for persistent checkpoint storage. The schema defines three core tables:

#### sessions

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    goal TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    metadata TEXT
);
```

Tracks the lifecycle of each agentic planning session.

#### checkpoints

```sql
CREATE TABLE checkpoints (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    step_number INTEGER NOT NULL,
    state_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

Captures snapshots of planning state at decision points. Each checkpoint contains the complete agent state serialized as JSON, enabling deterministic replay.

#### action_traces

```sql
CREATE TABLE action_traces (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    checkpoint_id TEXT,
    action_type TEXT NOT NULL,
    action_input TEXT NOT NULL,
    action_output TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    completed_at TEXT,
    error_message TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id)
);
```

Records every executed action with its complete context. The `action_type` field distinguishes between LLM calls, tool invocations, and state transitions.

### Real-Time ActionTrace

The ActionTrace system provides live streaming of agent activities. This enables:

- **Live monitoring** — Operators can observe agent behavior in real-time
- **Interactive debugging** — Pause and inspect agent state at any point
- **Progressive disclosure** — Start with high-level summaries, drill into details
- **Alerting** — Trigger notifications on specific action patterns

ActionTrace events are emitted as JSON objects:

```json
{
  "trace_id": "abc123",
  "session_id": "session_456",
  "timestamp": "2025-04-03T10:30:00Z",
  "action": {
    "type": "tool_invocation",
    "tool": "supabase_execute_sql",
    "input": { "query": "SELECT * FROM users" },
    "output": { "rows": 150 },
    "status": "success",
    "latency_ms": 45
  }
}
```

### Logging

Structured JSON logging is used for all HTTP requests and agent activities:

- **Log contexts** — Correlation IDs, tool names, session IDs
- **Log levels** — DEBUG, INFO, WARN, ERROR
- **Agent-specific contexts** — Each log entry includes agent metadata

### Metrics

The platform collects and exposes metrics for:

- **Request latency histograms** — HTTP request duration distributions
- **Tool execution counters** — Count of invocations per tool
- **Agent cycle completion rates** — Success/failure ratios
- **Checkpoint frequency** — Steps between checkpoints

### Dashboard

The platform provides a web-based dashboard for:

- Real-time log streaming with filtering
- Metric visualization (latency histograms, success rates)
- Trace exploration with span detail drill-down
- Session replay from checkpoints

---

## Getting Started

### Running the SDK Server

```bash
deno run --allow-net --allow-env packages/sdk/server.ts
```

### Running with Observability

```bash
deno run --allow-net --allow-env --allow-read packages/sdk/server.ts
```

### Configuration

Place a `.agentrc.yml` file in the project root:

```yaml
agent:
  name: "my-agent"
  version: "0.1.0"

model:
  provider: "anthropic"
  model: "claude-sonnet-4-20250514"
  temperature: 0.7

limits:
  maxSteps: 100
  maxRetries: 3
  timeoutSeconds: 300
```

---

## Version History

| Version | Description |
|---------|-------------|
| 0.2.0 | Phase 2 — Agentic loop, Orchestrator, KnowledgeGate, TraceableAgent |
| 0.1.0 | Phase 1 — Observability layer, SQLite checkpointing, WebSocket streaming |
| 0.0.1 | Phase 0.1 — Core runtime configuration, SDK infrastructure |

---

## Contributing

When extending the platform:

1. **Maintain Glass-Box principles** — Every new feature must emit observability data
2. **Respect domain boundaries** — Sub-agents must halt at domain boundaries
3. **Use Human Review Gates** — Trigger gates for schema, auth, and security-critical changes
4. **Checkpoint frequently** — Save state at every decision point
5. **Document domain assignments** — Update the agent routing table when adding domains