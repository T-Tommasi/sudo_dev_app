import { Database } from "sqlite";
import { resolve, normalize, isAbsolute, relative } from "@std/path";

let dbInstance: Database | null = null;

/**
 * Get the project root directory.
 */
function getProjectRoot(): string {
  if (import.meta.dirname) {
    return resolve(import.meta.dirname, "../../../");
  }
  return Deno.cwd();
}

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
  
  const projectRoot = getProjectRoot();
  const dataDir = resolve(projectRoot, "data");
  const normalized = normalize(path);
  const resolved = resolve(dataDir, normalized);
  
  // Use relative() to detect path traversal - this is the secure approach
  // relative() returns ".." when the path escapes the base directory
  const relativePath = relative(dataDir, resolved);
  
  // Check if path traversal is detected (relative returns ".." or escapes)
  if (relativePath.startsWith("..") || resolved === dataDir) {
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
 * @param path - Optional relative path to database file (default: "agentic.db")
 * @returns The SQLite Database instance
 */
export function getDb(path?: string): Database {
  if (dbInstance) {
    return dbInstance;
  }

  const projectRoot = getProjectRoot();
  const dataDir = resolve(projectRoot, "data");
  
  const dbPath = path 
    ? validateDbPath(path) 
    : resolve(dataDir, "agentic.db");

  // Ensure the data directory exists recursively
  Deno.mkdirSync(dataDir, { recursive: true });

  dbInstance = new Database(dbPath);

  // Load and execute schema with platform-independent path resolution
  const baseDir = import.meta.dirname 
    ? resolve(import.meta.dirname) 
    : resolve(projectRoot, "packages/core/state");
  const schemaPath = resolve(baseDir, "schema.sql");
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