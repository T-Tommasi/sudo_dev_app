import { AgentConfig } from "../config/agentrc.ts";

/**
 * Supported domain identifiers for agent routing.
 * Each domain corresponds to a specialized sub-agent.
 */
export type Domain = 
  | "database" 
  | "frontend" 
  | "deno" 
  | "security" 
  | "implementation" 
  | "documentation"
  | "google_cli";

export interface AgentContext {
  sessionId: string;
  checkpointId?: string;
  traceId: string;
  config: AgentConfig;
}

export type AgentStatus = "success" | "failure" | "error" | "halt";

export interface AgentResult {
  status: AgentStatus;
  output: string;
  metadata?: Record<string, unknown>;
}

export abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly role: string;
  abstract execute(task: string, context: AgentContext): Promise<AgentResult>;
}
