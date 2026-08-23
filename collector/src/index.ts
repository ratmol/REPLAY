// replay-collector entry point.
//
// POST /runs, POST /runs/:id/events, PATCH /runs/:id, GET /runs,
// GET /runs/:id, GET /runs/:id/events. Zod validation at the edge, the
// documented error contract (docs/EVENT_SCHEMA.md section 6). Storage is
// SQLite via store.ts/db.ts.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { z } from "zod";
import {
  CreateRunRequestSchema,
  EventBatchSchema,
  PatchRunRequestSchema,
  type EventRecord,
  type RunSummary,
} from "replay-shared";
import {
  appendEvents,
  createRun,
  getRun,
  listEvents,
  listRuns,
  updateRunStatus,
  type EventRow,
  type RunRow,
} from "./store.js";

const MAX_BATCH_SIZE = 500;

// The SDK talks to this API from Node, where CORS doesn't apply - it's a
// browser-only enforcement. This is entirely for the dashboard, a different
// origin (:5173 dev, some deployed origin later in 4.2) fetching from here.
const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN ?? "http://localhost:5173";

// Query-string validation for the GET endpoints below. These aren't part of
// the SDK<->collector wire contract (the SDK never constructs them), so they
// stay local to the collector rather than living in replay-shared.
const ListRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// after defaults to -1 so "seq > after" includes seq 0 (the first event,
// always run_start) when the caller hasn't paginated yet.
const EventsQuerySchema = z.object({
  after: z.coerce.number().int().min(-1).default(-1),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
});

function serializeRun(row: RunRow): RunSummary {
  return {
    id: row.id,
    name: row.name,
    agentName: row.agent_name ?? undefined,
    model: row.model ?? undefined,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    // SQLite has no enum type, but this column is only ever written by
    // createRun ('running') and updateRunStatus (Zod-validated to
    // "completed" | "failed"), so the cast is safe.
    status: row.status as RunSummary["status"],
    totalTokensIn: row.total_tokens_in,
    totalTokensOut: row.total_tokens_out,
    totalCostUsd: row.total_cost_usd,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

function serializeEvent(row: EventRow): EventRecord {
  return {
    seq: row.seq,
    // Same reasoning as serializeRun's status cast: this column only ever
    // holds one of the nine values EventBatchSchema already validated on
    // the way in.
    type: row.type as EventRecord["type"],
    timestamp: row.timestamp,
    durationMs: row.duration_ms ?? undefined,
    payload: JSON.parse(row.payload),
    tokensIn: row.tokens_in ?? undefined,
    tokensOut: row.tokens_out ?? undefined,
    costUsd: row.cost_usd ?? undefined,
  };
}

const app = new Hono();

app.use("/*", cors({ origin: DASHBOARD_ORIGIN }));

app.get("/health", (c) => c.json({ status: "ok" }));

app.post("/runs", async (c) => {
  const body = await readJsonBody(c.req.raw);
  if (body === undefined) {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const parsed = CreateRunRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid run", issues: parsed.error.issues }, 400);
  }

  createRun(parsed.data);
  return c.json({ id: parsed.data.id }, 201);
});

app.post("/runs/:id/events", async (c) => {
  const runId = c.req.param("id");
  const body = await readJsonBody(c.req.raw);
  if (body === undefined) {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  // Cheapest checks first: reject an oversized batch and an unknown run
  // before paying for a full Zod parse of every event in the body.
  const rawEvents = isRecord(body) ? body["events"] : undefined;
  if (Array.isArray(rawEvents) && rawEvents.length > MAX_BATCH_SIZE) {
    return c.json({ error: `batch exceeds ${MAX_BATCH_SIZE} events` }, 413);
  }

  if (!getRun(runId)) {
    return c.json({ error: `unknown run: ${runId}` }, 404);
  }

  const parsed = EventBatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid event batch", issues: parsed.error.issues }, 400);
  }

  const result = appendEvents(runId, parsed.data.events);
  return c.json(result, 200);
});

app.patch("/runs/:id", async (c) => {
  const runId = c.req.param("id");
  const body = await readJsonBody(c.req.raw);
  if (body === undefined) {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  if (!getRun(runId)) {
    return c.json({ error: `unknown run: ${runId}` }, 404);
  }

  const parsed = PatchRunRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid patch", issues: parsed.error.issues }, 400);
  }

  updateRunStatus(runId, parsed.data);
  return c.json({ ok: true }, 200);
});

app.get("/runs", (c) => {
  const parsed = ListRunsQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) {
    return c.json({ error: "invalid query", issues: parsed.error.issues }, 400);
  }
  const { limit, offset } = parsed.data;
  const runs = listRuns(limit, offset).map(serializeRun);
  return c.json({ runs, limit, offset }, 200);
});

app.get("/runs/:id", (c) => {
  const run = getRun(c.req.param("id"));
  if (!run) {
    return c.json({ error: `unknown run: ${c.req.param("id")}` }, 404);
  }
  return c.json(serializeRun(run), 200);
});

app.get("/runs/:id/events", (c) => {
  const runId = c.req.param("id");
  if (!getRun(runId)) {
    return c.json({ error: `unknown run: ${runId}` }, 404);
  }
  const parsed = EventsQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) {
    return c.json({ error: "invalid query", issues: parsed.error.issues }, 400);
  }
  const { after, limit } = parsed.data;
  // Ask the store for one extra row. If it comes back, there was more beyond
  // this page and the caller can say so - without this, a run with exactly
  // `limit` events and a run with thousands look identical on the wire.
  const rows = listEvents(runId, after, limit + 1);
  const hasMore = rows.length > limit;
  const events = rows.slice(0, limit).map(serializeEvent);
  return c.json({ events, after, limit, hasMore }, 200);
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

const port = Number(process.env.PORT ?? 4747);
serve({ fetch: app.fetch, port });
console.log(`replay-collector listening on :${port}`);
