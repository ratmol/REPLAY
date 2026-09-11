// Opens the SQLite database and runs pending migrations at startup.
// WAL mode + foreign_keys are set here (architecture invariant 7) before any
// migration runs, since they're connection-level pragmas.

import Database from "better-sqlite3";
import { migrations } from "./migrations.js";

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const appliedRows = database.prepare("SELECT id FROM _migrations").all() as { id: string }[];
  const applied = new Set(appliedRows.map((row) => row.id));

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }
    const apply = database.transaction(() => {
      database.exec(migration.sql);
      database.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)").run(
        migration.id,
        new Date().toISOString(),
      );
    });
    apply();
  }
}

// Open a connection, set the connection-level pragmas (architecture invariant
// 7), and bring it up to schema. Factored out of the module body so a test can
// open an isolated database (":memory:" or a temp file) with the same open +
// migrate path production uses, instead of reaching into migration internals.
export function openDb(path: string): Database.Database {
  const database = new Database(path);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  runMigrations(database);
  return database;
}

// The single production connection. DB_PATH is read once at module load, so a
// test process that sets it (or ":memory:") before importing this module gets a
// fully isolated database; the node test runner isolates each test file in its
// own process, so this stays a singleton in production and per-file in tests.
export const db: Database.Database = openDb(process.env.DB_PATH ?? "./replay.sqlite");
