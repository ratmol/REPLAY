// Opens the SQLite database and runs pending migrations at startup.
// WAL mode + foreign_keys are set here (architecture invariant 7) before any
// migration runs, since they're connection-level pragmas.

import Database from "better-sqlite3";
import { migrations } from "./migrations.js";

const dbPath = process.env.DB_PATH ?? "./replay.sqlite";

export const db: Database.Database = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const appliedRows = db.prepare("SELECT id FROM _migrations").all() as { id: string }[];
  const applied = new Set(appliedRows.map((row) => row.id));

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue;
    }
    const apply = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)").run(
        migration.id,
        new Date().toISOString(),
      );
    });
    apply();
  }
}

runMigrations();
