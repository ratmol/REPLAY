// Plain SQL migrations, run in order at collector startup (architecture
// invariant 7 in CLAUDE.md - no migration framework, no ORM). Each migration
// runs once, tracked in _migrations by id, inside its own transaction.

export interface Migration {
  id: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: "0001_init",
    sql: `
      CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        agent_name TEXT,
        model TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT NOT NULL,
        total_tokens_in INTEGER NOT NULL DEFAULT 0,
        total_tokens_out INTEGER NOT NULL DEFAULT 0,
        total_cost_usd REAL NOT NULL DEFAULT 0,
        metadata TEXT
      );

      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        duration_ms INTEGER,
        payload TEXT NOT NULL,
        tokens_in INTEGER,
        tokens_out INTEGER,
        cost_usd REAL
      );

      CREATE UNIQUE INDEX idx_events_run_seq ON events(run_id, seq);
      CREATE INDEX idx_runs_started_at ON runs(started_at DESC);
    `,
  },
];
