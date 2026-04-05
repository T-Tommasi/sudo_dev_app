/**
 * KnowledgeGate - Context injection layer for sub-agent briefings.
 * 
 * This module provides the KnowledgeGate interface and a default implementation
 * that enriches task briefings with domain-specific context before handing off
 * to sub-agents.
 * 
 * Supports the Open/Closed principle by allowing runtime registration of new domains.
 */

/**
 * Supported domain identifiers for context injection.
 */
export type Domain = "database" | "frontend" | "deno";

/**
 * KnowledgeGate interface for context injection.
 * Implementations should provide context enrichment for specific domains.
 */
export interface KnowledgeGate {
  /**
   * Injects domain-specific context into a briefing.
   * @param briefing The original task briefing
   * @param domain The target domain identifier
   * @returns Enriched briefing with context
   * @throws Error if domain is not supported
   */
  inject(briefing: string, domain: Domain): Promise<string>;

  /**
   * Returns list of supported domains.
   */
  getSupportedDomains(): Domain[];

  /**
   * Registers a new domain at runtime.
   * @param domain The domain identifier to register
   * @param context The context to associate with the domain
   */
  registerDomain(domain: Domain, context: string): void;
}

/**
 * Hardcoded context map for supported domains.
 * Each context includes relevant schema, types, patterns, and prior decisions.
 */
const DOMAIN_CONTEXTS: Record<Domain, string> = {
  database: `
=== DATABASE CONTEXT ===
SCHEMA_CONTEXT:
- Tables: users, sessions, checkpoints, action_traces
- Primary keys use UUID strings
- All tables have created_at and updated_at timestamps

TABLE: users
- id: uuid primary key
- email: text unique not null
- created_at: timestamptz

TABLE: sessions
- id: text primary key
- goal: text not null
- status: text default 'pending'
- created_at: timestamptz
- updated_at: timestamptz
- metadata: jsonb

TABLE: checkpoints
- id: text primary key
- session_id: text foreign key -> sessions(id)
- step_number: integer
- state_json: text
- created_at: timestamptz

TABLE: action_traces
- id: text primary key
- session_id: text foreign key -> sessions(id)
- checkpoint_id: text foreign key -> checkpoints(id)
- action_type: text
- action_input: text
- action_output: text
- status: text default 'pending'
- created_at: timestamptz
- completed_at: timestamptz
- error_message: text

RLS_POLICIES:
- All tables have RLS enabled
- Users can only read their own sessions
- Action traces are append-only

QUERY_PATTERNS:
- Use parameterized queries to prevent SQL injection
- Always include session_id for filtering
- Timestamps use timestamptz for timezone awareness
`,
  frontend: `
=== FRONTEND CONTEXT ===
FRAMEWORK: Svelte 5 with SvelteKit
STATE_MANAGEMENT:
- Use $state rune for reactive local state
- Use $derived for computed values
- Use $effect for side effects

COMPONENT_PATTERNS:
- Export components as default
- Use TypeScript in <script lang="ts">
- Follow single responsibility principle

STORES:
- Svelte stores for cross-component state
- Use writable for mutable state
- Use derived for computed state

API_INTEGRATION:
- Use fetch or SDK clients in load functions
- Handle errors with try/catch
- Return proper error responses

STYLING:
- Use Tailwind CSS classes when available
- Follow BEM naming for custom CSS
- Keep styles scoped to components
`,
  deno: `
=== DENO CONTEXT ===
RUNTIME: Deno with TypeScript
IMPORT_PATHS:
- Use jsr: for JSR packages
- Use npm: for npm packages
- Use std/ for standard library

DENO_JSON:
- Import map in import_map.json
- Workspace configuration in deno.json
- Use "tasks" for scripts

API_PATTERNS:
- Deno.serve for HTTP servers
- Use Request/Response types
- Implement proper CORS headers

TESTING:
- Use Deno.test for unit tests
- Use @std/assert for assertions
- Follow arrange-act-assert pattern

DEPLOYMENT:
- Use deno deploy for edge functions
- Environment variables via Deno.env
- Secrets via secret store
`,
};

/**
 * Default implementation of KnowledgeGate with hardcoded context maps.
 * This implementation supports database, frontend, and deno domains.
 */
export class DefaultKnowledgeGate implements KnowledgeGate {
  private readonly contexts: Map<Domain, string>;

  constructor(contexts?: Partial<Record<Domain, string>>) {
    // Merge provided contexts with defaults, preferring provided ones
    this.contexts = new Map([
      ["database", DOMAIN_CONTEXTS.database],
      ["frontend", DOMAIN_CONTEXTS.frontend],
      ["deno", DOMAIN_CONTEXTS.deno],
    ]);
    if (contexts) {
      for (const [domain, context] of Object.entries(contexts)) {
        if (domain === "database" || domain === "frontend" || domain === "deno") {
          this.contexts.set(domain, context);
        }
      }
    }
  }

  inject(briefing: string, domain: Domain): Promise<string> {
    const context = this.contexts.get(domain);
    
    if (!context) {
      return Promise.reject(new Error(
        `Unsupported domain: ${domain}. Supported domains: ${Array.from(this.contexts.keys()).join(", ")}`
      ));
    }

    return Promise.resolve(`${briefing}\n\n${context}`);
  }

  /**
   * Returns list of supported domains.
   */
  getSupportedDomains(): Domain[] {
    return Array.from(this.contexts.keys());
  }

  /**
   * Registers a new domain at runtime.
   * Allows extension beyond the built-in domains.
   */
  registerDomain(domain: Domain, context: string): void {
    this.contexts.set(domain, context);
  }
}

/**
 * Creates a KnowledgeGate instance with optional custom contexts.
 * @param customContexts Optional custom context map to merge with defaults
 * @returns A new DefaultKnowledgeGate instance
 */
export function createKnowledgeGate(
  customContexts?: Record<Domain, string>
): KnowledgeGate {
  return new DefaultKnowledgeGate(customContexts);
}