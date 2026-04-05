import {
  trace,
  SpanStatusCode,
  SpanKind,
  type Tracer,
} from "@opentelemetry/api";
import { AgentContext, AgentResult, BaseAgent } from "../agent/types.ts";

/**
 * Safely serializes a value to a string for use in span attributes.
 * Uses JSON.stringify for objects to ensure proper serialization.
 */
function serializeAttribute(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  // For objects, arrays, and other complex types, use JSON.stringify
  return JSON.stringify(value);
}

/**
 * TraceableAgent is a decorator that wraps a BaseAgent to emit OpenTelemetry spans
 * for every execution. This ensures complete observability of agent actions.
 * Uses startActiveSpan for implicit context propagation.
 */
export class TraceableAgent implements BaseAgent {
  private readonly tracer: Tracer;

  constructor(
    private readonly agent: BaseAgent,
    tracerName: string = "opencode-glass"
  ) {
    this.tracer = trace.getTracer(tracerName);
  }

  get name(): string {
    return this.agent.name;
  }

  get role(): string {
    return this.agent.role;
  }

  async execute(task: string, ctx: AgentContext): Promise<AgentResult> {
    return await this.tracer.startActiveSpan(
      `agent.${this.name}.execute`,
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          "agent.name": this.name,
          "agent.role": this.role,
          "session.id": ctx.sessionId,
          "trace.id": ctx.traceId,
          "task": task,
        },
      },
      async (span): Promise<AgentResult> => {
        try {
          const result = await this.agent.execute(task, ctx);

          span.setAttributes({
            "agent.result.status": result.status,
            "agent.result.output": serializeAttribute(result.output),
          });

          if (result.metadata) {
            span.setAttributes(
              Object.fromEntries(
                Object.entries(result.metadata).map(([k, v]) => [
                  `agent.result.metadata.${k}`,
                  serializeAttribute(v),
                ])
              )
            );
          }

          span.setStatus({
            code: SpanStatusCode.OK,
            message: result.status,
          });

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: errorMessage,
          });
          span.recordException(error instanceof Error ? error : new Error(errorMessage));

          const result: AgentResult = {
            status: "error",
            output: errorMessage,
            metadata: { error: errorMessage },
          };
          return result;
        }
      }
    );
  }
}

/**
 * Creates a TraceableAgent wrapper around any BaseAgent implementation.
 * @param agent The agent to wrap with tracing capabilities
 * @param tracerName Optional tracer name (defaults to "opencode-glass")
 * @returns A new TraceableAgent instance
 */
export function createTraceableAgent(
  agent: BaseAgent,
  tracerName?: string
): TraceableAgent {
  return new TraceableAgent(agent, tracerName);
}