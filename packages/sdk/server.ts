/**
 * Glass-Box Agentic Platform - SDK HTTP Server
 * Phase 0.1: Basic HTTP server with health check endpoint
 */

export interface HealthResponse {
  status: "healthy" | "unhealthy";
  timestamp: string;
  version: string;
}

/**
 * Health check handler for GET /health
 */
function handleHealth(): HealthResponse {
  return {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  };
}

/**
 * Main request handler for the HTTP server.
 * Routes incoming requests to appropriate handlers.
 */
function handler(req: Request): Response {
  const url = new URL(req.url);

  // GET /health - Health check endpoint
  if (req.method === "GET" && url.pathname === "/health") {
    const health = handleHealth();
    return Response.json(health, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
    });
  }

  // 404 Not Found for unmatched routes
  return Response.json(
    { error: "Not Found" },
    { status: 404 }
  );
}

/**
 * Start the HTTP server.
 * @param port - Port number to listen on (default: 8080)
 */
export function startServer(port: number = 8080): void {
  Deno.serve({ port, hostname: "127.0.0.1" }, handler);
}

// Start server if run directly
if (import.meta.main) {
  startServer();
}