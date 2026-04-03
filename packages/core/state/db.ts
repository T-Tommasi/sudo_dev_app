import { Database } from "sqlite";
import { resolve, normalize, isAbsolute } from "jsr:@std/path@0.217.0";

let dbInstance: Database | null = null;

/**
 * Validate that the path is within the allowed data directory.
 * Prevents path traversal attacks.
 * 
 * @param path - The database path to validate
 * @returns The validated and resolved path
 * @throws Error if path traversal is detected or path is absolute
 */
function validateDbPath(path: string): string {
  // Reject absolute paths for security
  if (isAbsolute(path)) {
    throw new Error("Invalid database path: absolute paths are not allowed");
  }
  
  const normalized = normalize(path);
  const resolved = resolve(normalized);
  const dataDir = resolve("./data");
  
  if (!resolved.startsWith(dataDir + "/") && resolved !== dataDir) {
    throw new Error("Invalid database path: path traversal detected");
  }
  return resolved;
}

/**
 * Get or initialize the SQLite database connection.
 * Uses schema.sql to create tables if they don't exist.
 * 
 * NOTE: This function is NOT thread-safe. In concurrent environments,
 * ensure proper synchronization (e.g., mutex) before calling getDb()
 * from multiple threads/coroutines. The returned Database instance
 * is a singleton and shared across all callers.
 * 
 * @param path - Optional relative path to database file (default: "./data/agentic.db")
 * @returns The SQLite Database instance
 */
export function getDb(path?: string): Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = path 
    ? validateDbPath(path) 
    : resolve("./data/agentic.db");
  dbInstance = new Database(dbPath);

  // Load and execute schema with fallback for import.meta.dirname
  const baseDir = import.meta.dirname ?? Deno.cwd();
  const schemaPath = resolve(baseDir, "./schema.sql");
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