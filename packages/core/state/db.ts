import { Database } from "sqlite";
import { resolve, normalize } from "jsr:@std/path@0.217.0";

let dbInstance: Database | null = null;

/**
 * Validate that the path is within the allowed data directory.
 * Prevents path traversal attacks.
 */
function validateDbPath(path: string): string {
  const normalized = normalize(path);
  const resolved = resolve(normalized);
  const dataDir = resolve("./data");
  
  if (!resolved.startsWith(dataDir)) {
    throw new Error("Invalid database path: path traversal detected");
  }
  return resolved;
}

/**
 * Get or initialize the SQLite database connection.
 * Uses schema.sql to create tables if they don't exist.
 */
export function getDb(path?: string): Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = path 
    ? validateDbPath(path) 
    : resolve("./data/agentic.db");
  dbInstance = new Database(dbPath);

  // Load and execute schema using import.meta.dirname for reliable path resolution
  const schemaPath = resolve(import.meta.dirname!, "./schema.sql");
  const schema = Deno.readTextFileSync(schemaPath);
  dbInstance.exec(schema);

  return dbInstance;
}

/**
 * Close the database connection.
 */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Reset the database instance (useful for testing).
 */
export function resetDb(): void {
  closeDb();
}