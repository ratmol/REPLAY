// SQLite-backed storage layer (roadmap 1.2), replacing the in-memory
// placeholder from 1.1. Function signatures are unchanged so index.ts's
// routes didn't need to change.
//
// Idempotent retries rely on the unique index on events(run_id, seq)
// (migrations.ts): INSERT OR IGNORE makes a re-sent batch a no-op instead of
// a duplicate. Derived totals on `runs` are recomputed by summing `events`
// inside the same transaction as the insert - never incremented from the
// batch directly, which would double-count on a retry (architecture
// invariant 3 in CLAUDE.md).

import type { CreateRunRequest, Event } from "replay-shared";
import { db } from "./db.js";

export interface RunRow {
  id: string;
  name: string;
  agent_name: string | null;
  model: string | null;
  started_at: string;
  ended_at: string | null;
  status: string;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
  metadata: string | null;
}

// Prepared statements are hoisted to module scope so the batch insert loop in
// appendEvents doesn't re-prepare a statement per event.

const insertRunStmt = db.prepare(`
  INSERT INTO runs (id, name, agent_name, model, started_at, ended_at, status, metadata)
  VALUES (@id, @name, @agentName, @model, @startedAt, NULL, 'running', @metadata)
`);

export function createRun(request: CreateRunRequest): void {
  insertRunStmt.run({
    id: request.id,
    name: request.name,
    agentName: request.agentName ?? null,
    model: request.model ?? null,
    startedAt: request.startedAt,
    metadata: request.metadata ? JSON.stringify(request.metadata) : null,
  });
}

const getRunStmt = db.prepare("SELECT * FROM runs WHERE id = ?");

export function getRun(runId: string): RunRow | undefined {
  return getRunStmt.get(runId) as RunRow | undefined;
}

const insertEventStmt = db.prepare(`
  INSERT OR IGNORE INTO events
    (run_id, seq, timestamp, type, duration_ms, payload, tokens_in, tokens_out, cost_usd)
  VALUES
    (@runId, @seq, @timestamp, @type, @durationMs, @payload, @tokensIn, @tokensOut, @costUsd)
`);

const recomputeTotalsStmt = db.prepare(`
  UPDATE runs
  SET total_tokens_in = (SELECT COALESCE(SUM(tokens_in), 0) FROM events WHERE run_id = @runId),
      total_tokens_out = (SELECT COALESCE(SUM(tokens_out), 0) FROM events WHERE run_id = @runId),
      total_cost_usd = (SELECT COALESCE(SUM(cost_usd), 0) FROM events WHERE run_id = @runId)
  WHERE id = @runId
`);

const appendEventsTxn = db.transaction(
  (runId: string, events: Event[]): { accepted: number; skipped: number } => {
    if (!getRunStmt.get(runId)) {
      throw new Error(`unknown run: ${runId}`);
    }

    let accepted = 0;
    let skipped = 0;
    for (const event of events) {
      const result = insertEventStmt.run({
        runId,
        seq: event.seq,
        timestamp: event.timestamp,
        type: event.type,
        durationMs: event.durationMs ?? null,
        payload: JSON.stringify(event.payload),
        tokensIn: event.tokensIn ?? null,
        tokensOut: event.tokensOut ?? null,
        costUsd: event.costUsd ?? null,
      });
      if (result.changes > 0) {
        accepted += 1;
      } else {
        skipped += 1;
      }
    }

    if (accepted > 0) {
      recomputeTotalsStmt.run({ runId });
    }

    return { accepted, skipped };
  },
);

export function appendEvents(
  runId: string,
  events: Event[],
): { accepted: number; skipped: number } {
  return appendEventsTxn(runId, events);
}

export interface EventRow {
  id: number;
  run_id: string;
  seq: number;
  timestamp: string;
  type: string;
  duration_ms: number | null;
  payload: string;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
}

// idx_runs_started_at (migrations.ts) makes this ORDER BY + LIMIT/OFFSET an
// index scan rather than a full table sort.
const listRunsStmt = db.prepare("SELECT * FROM runs ORDER BY started_at DESC LIMIT ? OFFSET ?");

export function listRuns(limit: number, offset: number): RunRow[] {
  return listRunsStmt.all(limit, offset) as RunRow[];
}

// idx_events_run_seq covers (run_id, seq), so "seq > ? ORDER BY seq" is also
// an index scan, not a sort.
const listEventsStmt = db.prepare(
  "SELECT * FROM events WHERE run_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?",
);

export function listEvents(runId: string, after: number, limit: number): EventRow[] {
  return listEventsStmt.all(runId, after, limit) as EventRow[];
}
