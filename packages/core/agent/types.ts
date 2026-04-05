import { AgentConfig } from "../config/agentrc.ts";

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
