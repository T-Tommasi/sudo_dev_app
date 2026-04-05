import { AgentConfig } from "../config/agentrc.ts";
import { BaseAgent, AgentResult } from "../agent/types.ts";

export type Domain = "database" | "frontend" | "deno" | "security" | "implementation" | "documentation";

export interface SubTask {
  id: string;
  goal: string;
  domain: Domain;
}

export interface ActionSummary {
  name: string;
  location: string;
  purpose: string;
}

const DOMAIN_KEYWORDS: Record<Domain, string[]> = {
  database: ["database", "table", "schema", "sql", "migration", "rls", "supabase"],
  frontend: ["frontend", "ui", "component", "svelte", "button", "form", "input"],
  deno: ["deno", "edge function", "runtime", "deploy"],
  security: ["security", "auth", "authentication", "rls", "permission"],
  implementation: ["implement", "feature", "build", "create", "add"],
  documentation: ["documentation", "docs", "readme", "api"],
};

class DatabaseAgent extends BaseAgent {
  readonly name = "supabase_expert";
  readonly role = "supabase_expert";
  async execute(task: string): Promise<AgentResult> {
    return { status: "success", output: task };
  }
}

class FrontendAgent extends BaseAgent {
  readonly name = "ui_expert";
  readonly role = "ui_expert";
  async execute(task: string): Promise<AgentResult> {
    return { status: "success", output: task };
  }
}

class DenoAgent extends BaseAgent {
  readonly name = "deno_expert";
  readonly role = "deno_expert";
  async execute(task: string): Promise<AgentResult> {
    return { status: "success", output: task };
  }
}

class SecurityAgent extends BaseAgent {
  readonly name = "security_analyzer";
  readonly role = "security_analyzer";
  async execute(task: string): Promise<AgentResult> {
    return { status: "success", output: task };
  }
}

class ImplementationAgent extends BaseAgent {
  readonly name = "general_coder";
  readonly role = "general_coder";
  async execute(task: string): Promise<AgentResult> {
    return { status: "success", output: task };
  }
}

class DocumentationAgent extends BaseAgent {
  readonly name = "doc_writer";
  readonly role = "doc_writer";
  async execute(task: string): Promise<AgentResult> {
    return { status: "success", output: task };
  }
}

export class Orchestrator {
  constructor(private config: AgentConfig) {}

  async decompose(goal: string): Promise<SubTask[]> {
    const lowerGoal = goal.toLowerCase();
    const subtasks: SubTask[] = [];
    let taskId = 1;

    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      const matched = keywords.some((keyword) => lowerGoal.includes(keyword));
      if (matched) {
        subtasks.push({
          id: String(taskId++),
          goal: goal,
          domain: domain as Domain,
        });
      }
    }

    if (subtasks.length === 0) {
      subtasks.push({
        id: "1",
        goal: goal,
        domain: "implementation",
      });
    }

    return subtasks;
  }

  getAgentForTask(task: SubTask): BaseAgent {
    switch (task.domain) {
      case "database":
        return new DatabaseAgent();
      case "frontend":
        return new FrontendAgent();
      case "deno":
        return new DenoAgent();
      case "security":
        return new SecurityAgent();
      case "implementation":
        return new ImplementationAgent();
      case "documentation":
        return new DocumentationAgent();
      default:
        return new ImplementationAgent();
    }
  }

  generateReviewReport(title: string, actions: ActionSummary[]): string {
    const whatWasDone = actions
      .map((a) => `- Created ${a.name} at ${a.location}: ${a.purpose}`)
      .join("\n");

    const functionsAndModules = actions
      .map(
        (a) => `- **Name:** ${a.name}\n  - **Location:** ${a.location}\n  - **Purpose:** ${a.purpose}\n  - **Inputs / Outputs:** N/A\n  - **Why it exists:** ${a.purpose}`
      )
      .join("\n\n");

    return `## Review Gate — ${title}

### What was done
${whatWasDone}

### Functions and modules introduced
${functionsAndModules}

### How it integrates
The new code integrates with existing modules through the standard import patterns defined in the workspace.

### Open decisions and ambiguities
None.`;
  }
}
