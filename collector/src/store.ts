// SQLite-backed storage layer, replacing an earlier in-memory placeholder.
// Function signatures are unchanged from that placeholder so index.ts's
// routes didn't need to change.
//
// Idempotent retries rely on the unique index on events(run_id, seq)
// (migrations.ts): INSERT OR IGNORE makes a re-sent batch a no-op instead of
// a duplicate. Derived totals on `runs` are recomputed by summing `events`
// inside the same transaction as the insert - never incremented from the
// batch directly, which would double-count on a retry (architecture
// invariant 3 in CLAUDE.md).

import type { CreateRunRequest, Event, PatchRunRequest } from "replay-shared";
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

// INSERT OR IGNORE, not a plain INSERT: the SDK is allowed to retry a POST
// /runs after a timeout (same contract as the events path), so a second insert
// with the same primary key must be a no-op, not a SQLITE_CONSTRAINT throw that
// the route would surface as a 500.
const insertRunStmt = db.prepare(`
  INSERT OR IGNORE INTO runs (id, name, agent_name, model, started_at, ended_at, status, metadata)
  VALUES (@id, @name, @agentName, @model, @startedAt, NULL, 'running', @metadata)
`);

// Returns true if this call created the row, false if it already existed. The
// route treats both as success (idempotent create); the flag only chooses
// 201 vs 200.
export function createRun(request: CreateRunRequest): boolean {
  const result = insertRunStmt.run({
    id: request.id,
    name: request.name,
    agentName: request.agentName ?? null,
    model: request.model ?? null,
    startedAt: request.startedAt,
    metadata: request.metadata ? JSON.stringify(request.metadata) : null,
  });
  return result.changes > 0;
}

const getRunStmt = db.prepare("SELECT * FROM runs WHERE id = ?");

export function getRun(runId: string): RunRow | undefined {
  return getRunStmt.get(runId) as RunRow | undefined;
}

// WHERE status = 'running' guards the one legal transition: a run finishes
// exactly once. A completed/failed run cannot be re-patched or have its
// ended_at rewritten, so a late or duplicate PATCH changes zero rows and the
// route answers 409 rather than silently overwriting the terminal state.
const updateRunStatusStmt = db.prepare(
  "UPDATE runs SET status = @status, ended_at = @endedAt WHERE id = @id AND status = 'running'",
);

// Not a violation of "events are append-only, no UPDATE": that invariant is
// scoped to the events table specifically. runs.status/ended_at are
// documented state (docs/EVENT_SCHEMA.md section 5: "ended_at NULL while
// running") that's expected to transition exactly once, same category as the
// derived-totals UPDATE in appendEventsTxn below. Returns true if the run was
// running and is now terminal, false if it was already terminal (no-op).
export function updateRunStatus(runId: string, patch: PatchRunRequest): boolean {
  const result = updateRunStatusStmt.run({
    id: runId,
    status: patch.status,
    endedAt: patch.endedAt,
  });
  return result.changes > 0;
}

const insertEventStmt = db.prepare(`
  INSERT OR IGNORE INTO events
    (run_id, seq, timestamp, type, duration_ms, payload, tokens_in, tokens_out, cost_usd)
  VALUES
    (@runId, @seq, @timestamp, @type, @durationMs, @payload, @tokensIn, @tokensOut, @costUsd)
`);

// total_cost_usd is ROUNDed to 8 decimals because summing floats
// (e.g. 0.0033 + 0.0034) yields binary-fraction noise like
// 0.006699999999999999 that would otherwise reach the API verbatim. The event
// rows stay untouched (append-only); only this derived total is cleaned. Eight
// places is well beyond any real per-run cost precision and keeps the value a
// clean JSON number.
const recomputeTotalsStmt = db.prepare(`
  UPDATE runs
  SET total_tokens_in = (SELECT COALESCE(SUM(tokens_in), 0) FROM events WHERE run_id = @runId),
      total_tokens_out = (SELECT COALESCE(SUM(tokens_out), 0) FROM events WHERE run_id = @runId),
      total_cost_usd = (SELECT ROUND(COALESCE(SUM(cost_usd), 0), 8) FROM events WHERE run_id = @runId)
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
