import { AgentConfig } from "../config/agentrc.ts";
import { BaseAgent, AgentResult, AgentContext, Domain } from "../agent/types.ts";
import { createLLMClient, generateCompletion, GOOGLE_CLI_SENTINEL } from "../agent/llm.ts";
import { LanguageModel } from "ai";
import { GoogleCliAgent } from "../agent/google_cli.ts";

export type { Domain, BaseAgent, AgentResult, AgentContext };

export interface SubTask {
  id: string;
  goal: string;
  domain: Domain;
}

export interface ActionSummary {
  name: string;
  location: string;
  purpose: string;
  inputs?: string;
  outputs?: string;
}

const DOMAIN_KEYWORDS: Record<Domain, string[]> = {
  database: ["database", "table", "schema", "sql", "migration", "rls", "supabase"],
  frontend: ["frontend", "ui", "component", "svelte", "button", "form", "input"],
  deno: ["deno", "edge function", "runtime", "deploy"],
  security: ["security", "auth", "authentication", "rls", "permission"],
  implementation: ["implement", "feature", "build", "create", "add"],
  documentation: ["documentation", "docs", "readme", "api"],
  google_cli: ["google cli", "gcloud", "google cloud", "google auth", "google compute", "google container", "google functions", "google run", "google kube", "google gke"],
};

const DOMAIN_SYSTEM_PROMPTS: Record<Domain, string> = {
  database: `You are a Supabase expert. Your role is to:
- Write SQL queries, migrations, and schema definitions
- Create and manage RLS (Row Level Security) policies
- Work with Supabase tables, functions, and extensions
- Optimize database performance

When asked to create database objects, provide the exact SQL needed.`,
  frontend: `You are a UI/Frontend expert. Your role is to:
- Create Svelte components with Svelte 5 runes
- Build responsive forms, buttons, inputs, and other UI elements
- Implement state management with Svelte stores
- Integrate with Supabase for data fetching

When asked to create UI components, provide the complete component code.`,
  deno: `You are a Deno runtime expert. Your role is to:
- Write Deno Edge Functions for Supabase
- Deploy applications using Deno Deploy
- Work with Deno runtime APIs and TypeScript
- Handle environment variables and configuration

When asked to create Deno functions, provide the complete code with proper imports.`,
  security: `You are a security analyst. Your role is to:
- Audit code for security vulnerabilities
- Review authentication and authorization flows
- Check RLS policies for proper exposure
- Identify potential security risks

When asked to review security, provide a detailed analysis of potential issues.`,
  implementation: `You are a general implementation expert. Your role is to:
- Implement features based on requirements
- Write clean, maintainable code
- Follow best practices for the specific language/framework
- Handle edge cases and error states

When asked to implement something, provide complete working code.`,
  documentation: `You are a documentation writer. Your role is to:
- Write clear, concise documentation
- Create API docs, README files, and guides
- Document code changes and their rationale
- Use appropriate formatting (Markdown, etc.)

When asked to write docs, provide well-structured documentation.`,
  google_cli: `You are a Google Cloud CLI expert. Your role is to:
- Execute gcloud commands for cloud resource management
- Manage authentication and IAM permissions
- Deploy and manage Google Cloud resources
- Work with Compute Engine, GKE, Cloud Run, and Functions

When asked to perform cloud operations, provide the exact gcloud commands needed.`,
};

/**
 * A parameterized LLM agent that accepts domain and systemPrompt in the constructor.
 * This replaces the six duplicate stub agents with a single, reusable implementation.
 */
class LLMAgent extends BaseAgent {
  constructor(
    readonly name: string,
    readonly role: string,
    private readonly domain: Domain,
    private readonly systemPrompt: string
  ) {
    super();
  }

  async execute(task: string, context: AgentContext): Promise<AgentResult> {
    try {
      const model = createLLMClient(context.config);
      
      // Check for google_cli sentinel or invalid model
      if (model === GOOGLE_CLI_SENTINEL || !model) {
        return {
          status: "error",
          output: `No LLM client available for provider: ${context.config.model.provider}`,
        };
      }

      const result = await generateCompletion(model as LanguageModel, this.systemPrompt, task, context.config.model.model);

      return {
        status: "success",
        output: result,
        metadata: {
          domain: this.domain,
          model: context.config.model.model,
          provider: context.config.model.provider,
        },
      };
    } catch (error) {
      return {
        status: "error",
        output: `${this.name} execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

class GoogleCliAgentWrapper extends BaseAgent {
  readonly name = "google_cli_agent";
  readonly role = "google_cli";

  async execute(task: string, context: AgentContext): Promise<AgentResult> {
    try {
      const agent = new GoogleCliAgent();
      // Pass context with sessionId and traceId for observability
      const result = await agent.execute(task, context);
      // Enrich result with context metadata for Glass-Box tracing
      return {
        ...result,
        metadata: {
          ...result.metadata,
          sessionId: context.sessionId,
          traceId: context.traceId,
        },
      };
    } catch (error) {
      return {
        status: "error",
        output: `Google CLI agent execution failed: ${error instanceof Error ? error.message : String(error)}`,
        metadata: {
          sessionId: context.sessionId,
          traceId: context.traceId,
        },
      };
    }
  }
}

export class Orchestrator {
  constructor(private config: AgentConfig) {}

  decompose(goal: string): SubTask[] {
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
        return new LLMAgent("supabase_expert", "supabase_expert", "database", DOMAIN_SYSTEM_PROMPTS.database);
      case "frontend":
        return new LLMAgent("ui_expert", "ui_expert", "frontend", DOMAIN_SYSTEM_PROMPTS.frontend);
      case "deno":
        return new LLMAgent("deno_expert", "deno_expert", "deno", DOMAIN_SYSTEM_PROMPTS.deno);
      case "security":
        return new LLMAgent("security_analyzer", "security_analyzer", "security", DOMAIN_SYSTEM_PROMPTS.security);
      case "implementation":
        return new LLMAgent("general_coder", "general_coder", "implementation", DOMAIN_SYSTEM_PROMPTS.implementation);
      case "documentation":
        return new LLMAgent("doc_writer", "doc_writer", "documentation", DOMAIN_SYSTEM_PROMPTS.documentation);
      case "google_cli":
        return new GoogleCliAgentWrapper();
      default:
        return new LLMAgent("general_coder", "general_coder", "implementation", DOMAIN_SYSTEM_PROMPTS.implementation);
    }
  }

  generateReviewReport(title: string, actions: ActionSummary[]): string {
    if (!actions || actions.length === 0) {
      return `## Review Gate — ${title}

### What was done
No actions recorded.

### Functions and modules introduced
None.

### How it integrates
N/A

### Open decisions and ambiguities
None.`;
    }

    const whatWasDone = actions
      .map((a) => `- ${a.name} at ${a.location}: ${a.purpose}`)
      .join("\n");

    const functionsAndModules = actions
      .map(
        (a) => `- **Name:** ${a.name}\n  - **Location:** ${a.location}\n  - **Purpose:** ${a.purpose}\n  - **Inputs / Outputs:** ${a.inputs && a.outputs ? `Inputs: ${a.inputs}, Outputs: ${a.outputs}` : (a.inputs || a.outputs || "N/A")}\n  - **Why it exists:** ${a.purpose}`
      )
      .join("\n\n");

    const openDecisions = actions.some(a => a.purpose.includes("?") || a.purpose.includes("unknown"))
      ? "Some actions have ambiguous purposes that may require clarification."
      : "None.";

    return `## Review Gate — ${title}

### What was done
${whatWasDone}

### Functions and modules introduced
${functionsAndModules}

### How it integrates
The new code integrates with existing modules through the standard import patterns defined in the workspace.

### Open decisions and ambiguities
${openDecisions}`;
  }
}