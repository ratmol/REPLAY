// replay-collector entry point.
//
// POST /runs, POST /runs/:id/events, PATCH /runs/:id, GET /runs,
// GET /runs/:id, GET /runs/:id/events. Zod validation at the edge, the
// documented error contract (docs/EVENT_SCHEMA.md section 6). Storage is
// SQLite via store.ts/db.ts (roadmap 1.2).

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { CreateRunRequestSchema, EventBatchSchema, PatchRunRequestSchema } from "replay-shared";
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

function serializeRun(row: RunRow): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    agentName: row.agent_name ?? undefined,
    model: row.model ?? undefined,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    status: row.status,
    totalTokensIn: row.total_tokens_in,
    totalTokensOut: row.total_tokens_out,
    totalCostUsd: row.total_cost_usd,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

function serializeEvent(row: EventRow): Record<string, unknown> {
  return {
    seq: row.seq,
    type: row.type,
    timestamp: row.timestamp,
    durationMs: row.duration_ms ?? undefined,
    payload: JSON.parse(row.payload),
    tokensIn: row.tokens_in ?? undefined,
    tokensOut: row.tokens_out ?? undefined,
    costUsd: row.cost_usd ?? undefined,
  };
}

const app = new Hono();

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
  const events = listEvents(runId, after, limit).map(serializeEvent);
  return c.json({ events, after, limit }, 200);
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
