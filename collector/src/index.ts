// replay-collector entry point.
//
// POST /runs, POST /runs/:id/events, PATCH /runs/:id, GET /runs,
// GET /runs/:id, GET /runs/:id/events. Zod validation at the edge, the
// documented error contract (docs/EVENT_SCHEMA.md section 6). Storage is
// SQLite via store.ts/db.ts.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
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
import { seedSampleRunsIfMissing } from "./seed.js";

const MAX_BATCH_SIZE = 500;

// Reject an oversized body before the route reads and parses it, so a runaway
// or hostile payload can't force a large allocation. 4MB comfortably clears a
// full 500-event batch of 50KB-truncated payloads.
// TODO: a shared write token to authenticate SDK/dashboard writes is a
// deferred decision - it needs the SDK and dashboard env/config rolled out in
// lockstep, so it is intentionally not enforced here yet.
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const writeBodyLimit = bodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: (c) => c.json({ error: "request body too large" }, 413),
});

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
    metadata: parseStoredJson(row.metadata) as Record<string, unknown> | undefined,
  };
}

// One malformed row must not 500 an entire page. Stored JSON is written by the
// collector itself and is trusted (invariant 4), so this only ever fires on
// out-of-band corruption or a manual edit; when it does, the row degrades to a
// small marker object instead of taking the whole request down.
function parseStoredJson(raw: string | null): unknown {
  if (raw === null) {
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return { _parseError: "malformed stored JSON" };
  }
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
    // Guarded the same way as run metadata: a single corrupt payload becomes a
    // marker object rather than failing the whole events page.
    payload: (parseStoredJson(row.payload) ?? {}) as Record<string, unknown>,
    tokensIn: row.tokens_in ?? undefined,
    tokensOut: row.tokens_out ?? undefined,
    costUsd: row.cost_usd ?? undefined,
  };
}

const app = new Hono();

// allowMethods lists exactly the verbs this API implements. The default set
// advertises PUT/DELETE the collector has no routes for, which would let a
// browser preflight a method that can only 404.
app.use(
  "/*",
  cors({ origin: DASHBOARD_ORIGIN, allowMethods: ["GET", "POST", "PATCH", "OPTIONS"] }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

app.post("/runs", writeBodyLimit, async (c) => {
  const body = await readJsonBody(c.req.raw);
  if (body === undefined) {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const parsed = CreateRunRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid run", issues: parsed.error.issues }, 400);
  }

  // Idempotent: a retried create finds the row already present and still
  // succeeds. 201 when we created it, 200 when it already existed.
  const created = createRun(parsed.data);
  return c.json({ id: parsed.data.id }, created ? 201 : 200);
});

app.post("/runs/:id/events", writeBodyLimit, async (c) => {
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

app.patch("/runs/:id", writeBodyLimit, async (c) => {
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

  // Only a running run can transition to a terminal state. If the run is
  // already completed/failed, updateRunStatus changes nothing and we answer
  // 409 rather than rewrite a finished run's status or ended_at.
  const updated = updateRunStatus(runId, parsed.data);
  if (!updated) {
    return c.json({ error: `run is not running: ${runId}` }, 409);
  }
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

// Exported so the test suite can drive the routes with app.request(...)
// without binding a port. The seed + serve bootstrap below is guarded to run
// only when this module is the process entry point, so importing `app` has no
// side effects.
export { app };

function startServer(): void {
  // Rebuild any missing sample runs before serving, so a hosted read-only
  // instance whose disk was wiped on restart comes back with data. No-op unless
  // SEED_DEMO is set.
  seedSampleRunsIfMissing();

  const port = Number(process.env.PORT ?? 4747);
  serve({ fetch: app.fetch, port });
  console.log(`replay-collector listening on :${port}`);
}

// argv[1] is the script node/tsx was told to run; when that resolves to this
// file, the collector was launched directly and should serve. When another
// module (a test) imports it, argv[1] is that other entry point and we stay
// inert. realpathSync normalizes drive-letter case and separators so the
// comparison holds on Windows and through tsx.
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  startServer();
}
