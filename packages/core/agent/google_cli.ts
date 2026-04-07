import { BaseAgent, AgentResult, AgentContext } from "./types.ts";

/**
 * Allowlist of permitted 'google' subcommands.
 * Only these commands can be executed via the GoogleCliAgent.
 */
const ALLOWED_GOOGLE_COMMANDS = new Set([
  "gcloud",
  "compute",
  "container",
  "functions",
  "run",
  "kube",
  "gke",
  "auth",
  "help",
]);

/**
 * Shell metacharacters that must be rejected to prevent command injection.
 */
const SHELL_METACHARACTERS = /[$;`|&><\\]/;

/**
 * Validates that a string does not contain shell metacharacters.
 * @param value - The string to validate
 * @throws Error if shell metacharacters are detected
 */
function validateNoShellMetacharacters(value: string): void {
  if (SHELL_METACHARACTERS.test(value)) {
    throw new Error(
      `Invalid argument: contains shell metacharacters. Rejected: ${value}`
    );
  }
}

/**
 * GoogleCliAgent executes tasks using the local 'google' CLI tool.
 * This agent delegates to the google CLI for Google Cloud operations,
 * local development tools, and other google CLI commands.
 * Security: Only permits allowlisted subcommands and validates arguments.
 */
export class GoogleCliAgent extends BaseAgent {
  readonly name = "google_cli_agent";
  readonly role = "google_cli";

  /**
   * Execute a task by invoking the local 'google' CLI.
   * @param task - The task description to pass to the google CLI
   * @param context - Agent context (unused for CLI execution)
   * @returns AgentResult with the CLI output or error
   */
  async execute(task: string, _context: AgentContext): Promise<AgentResult> {
    try {
      // Parse the task to extract the CLI command and arguments
      const { command, args } = this.parseTask(task);

      // Validate command against allowlist
      this.validateCommand(command);

      // Validate command and all arguments against shell metacharacters
      validateNoShellMetacharacters(command);
      for (const arg of args) {
        validateNoShellMetacharacters(arg);
      }

      // Execute the google CLI command
      const result = await this.executeGoogleCli(command, args);

      return {
        status: "success",
        output: result,
        metadata: {
          tool: "google_cli",
          command: command,
          args: args,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        status: "error",
        output: `Google CLI execution failed: ${errorMessage}`,
        metadata: {
          tool: "google_cli",
          error: errorMessage,
        },
      };
    }
  }

  /**
   * Validates that the command is in the allowlist.
   * @param command - The command to validate
   * @throws Error if command is not permitted
   */
  private validateCommand(command: string): void {
    const normalizedCommand = command.toLowerCase();
    if (!ALLOWED_GOOGLE_COMMANDS.has(normalizedCommand)) {
      throw new Error(
        `Command not permitted: '${command}'. Allowed commands: ${[...ALLOWED_GOOGLE_COMMANDS].join(", ")}`
      );
    }
  }

  /**
   * Parse the task string to extract the command and arguments.
   * Expected format: "gcloud compute instances list" or "google auth login"
   */
  private parseTask(task: string): { command: string; args: string[] } {
    const parts = task.trim().split(/\s+/);
    
    let command: string;
    let args: string[];
    
    if (parts[0] === "google") {
      // For "google auth login", command is "auth" and args are ["login"]
      command = parts[1] || "help";
      args = parts.slice(2).filter(Boolean);
    } else {
      // For "gcloud compute instances list", command is "gcloud" and args are ["compute", "instances", "list"]
      command = parts[0];
      args = parts.slice(1).filter(Boolean);
    }

    return { command, args };
  }

  /**
   * Execute the google CLI with the given command and arguments.
   * Uses Deno.Command to invoke the local 'google' CLI.
   */
  private async executeGoogleCli(
    command: string,
    args: string[]
  ): Promise<string> {
    const process = new Deno.Command("google", {
      args: [command, ...args],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await process.output();

    const stdoutText = new TextDecoder().decode(stdout);
    const stderrText = new TextDecoder().decode(stderr);

    if (code !== 0) {
      throw new Error(`Command failed with code ${code}: ${stderrText || stdoutText}`);
    }

    return stdoutText || stderrText || "Command executed successfully";
  }
}

/**
 * Factory function to create a GoogleCliAgent instance.
 */
export function createGoogleCliAgent(): GoogleCliAgent {
  return new GoogleCliAgent();
}