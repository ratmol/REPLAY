// replay-collector entry point.
//
// POST /runs, POST /runs/:id/events, Zod validation at the edge, the
// documented error contract (docs/EVENT_SCHEMA.md section 6). Storage is
// SQLite via store.ts/db.ts (roadmap 1.2).

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { CreateRunRequestSchema, EventBatchSchema } from "replay-shared";
import { appendEvents, createRun, getRun } from "./store.js";

const MAX_BATCH_SIZE = 500;

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
