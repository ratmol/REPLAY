// Collector HTTP-contract tests. These drive the real Hono app via
// app.request(...), so they exercise the route handlers, Zod edge validation,
// and the SQLite store together - the same path a real request takes, minus
// the port bind.
//
// Isolation: DB_PATH is set to ":memory:" before the first dynamic import of
// the app, so db.ts opens a throwaway in-memory database instead of the real
// ./replay.sqlite. The node test runner isolates each test file in its own
// process, so this file owns its database outright; tests within it use
// distinct run ids to stay independent. index.ts guards its serve() bootstrap
// behind an entry-point check, so importing the app starts no server.

import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DB_PATH = ":memory:";
delete process.env.SEED_DEMO;

const { app } = await import("./index.js");
const { db } = await import("./db.js");

const ISO = "2026-01-01T00:00:00.000Z";

function runBody(id: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ id, name: "test-agent", startedAt: ISO, ...overrides });
}

async function post(path: string, body: string): Promise<Response> {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

async function patch(path: string, body: unknown): Promise<Response> {
  return app.request(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// H2: a retried POST /runs must not 500. INSERT OR IGNORE makes the second
// create a no-op; the route reports success either way and the row count holds.
test("H2: duplicate POST /runs succeeds and leaves exactly one row", async () => {
  const id = "11111111-1111-4111-8111-111111111111";

  const first = await post("/runs", runBody(id));
  assert.equal(first.status, 201);
  assert.deepEqual(await first.json(), { id });

  const second = await post("/runs", runBody(id));
  assert.equal(second.status, 200); // already existed, idempotent
  assert.deepEqual(await second.json(), { id });

  const row = db.prepare("SELECT COUNT(*) AS c FROM runs WHERE id = ?").get(id) as { c: number };
  assert.equal(row.c, 1);
});

// M4: a run finishes exactly once. The first PATCH transitions running ->
// terminal (200); a second PATCH finds no running row (409) and must not
// rewrite the recorded ended_at.
test("M4: PATCH only transitions a running run, else 409 with ended_at intact", async () => {
  const id = "22222222-2222-4222-8222-222222222222";
  await post("/runs", runBody(id));

  const firstEnd = "2026-01-01T00:05:00.000Z";
  const ok = await patch(`/runs/${id}`, { status: "completed", endedAt: firstEnd });
  assert.equal(ok.status, 200);

  const secondEnd = "2026-01-01T09:00:00.000Z";
  const conflict = await patch(`/runs/${id}`, { status: "failed", endedAt: secondEnd });
  assert.equal(conflict.status, 409);

  const detail = await app.request(`/runs/${id}`);
  const run = (await detail.json()) as { status: string; endedAt: string };
  assert.equal(run.status, "completed");
  assert.equal(run.endedAt, firstEnd); // unchanged by the rejected PATCH
});

// M7: summing floats yields binary-fraction noise (0.1 + 0.2 = 0.300...004).
// The derive step ROUNDs the total, so the API returns a clean number.
test("M7: derived totalCostUsd is rounded free of float noise", async () => {
  const id = "33333333-3333-4333-8333-333333333333";
  await post("/runs", runBody(id));

  const events = {
    events: [
      { seq: 0, type: "run_start", timestamp: ISO, payload: {} },
      {
        seq: 1,
        type: "llm_response",
        timestamp: "2026-01-01T00:00:01.000Z",
        payload: {},
        costUsd: 0.1,
      },
      {
        seq: 2,
        type: "llm_response",
        timestamp: "2026-01-01T00:00:02.000Z",
        payload: {},
        costUsd: 0.2,
      },
    ],
  };
  const res = await post(`/runs/${id}/events`, JSON.stringify(events));
  assert.equal(res.status, 200);

  const detail = await app.request(`/runs/${id}`);
  const run = (await detail.json()) as { totalCostUsd: number };
  assert.equal(run.totalCostUsd, 0.3);
});

// L9: one corrupt stored payload must degrade to a marker, not 500 the page.
// The bad row is inserted straight into SQLite to simulate out-of-band
// corruption the trusted write path would never produce.
test("L9: a malformed stored payload degrades to a marker, other rows intact", async () => {
  const id = "44444444-4444-4444-8444-444444444444";
  await post("/runs", runBody(id));
  await post(
    `/runs/${id}/events`,
    JSON.stringify({ events: [{ seq: 0, type: "run_start", timestamp: ISO, payload: { ok: true } }] }),
  );

  // Corrupt row, inserted directly (bypassing the validated route).
  db.prepare(
    "INSERT INTO events (run_id, seq, timestamp, type, payload) VALUES (?, 1, ?, 'llm_call', ?)",
  ).run(id, "2026-01-01T00:00:01.000Z", "{not valid json");

  const res = await app.request(`/runs/${id}/events`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { events: { seq: number; payload: Record<string, unknown> }[] };
  assert.equal(body.events.length, 2);
  assert.deepEqual(body.events[0]?.payload, { ok: true }); // good row untouched
  assert.ok(body.events[1]?.payload._parseError); // bad row degraded to marker
});

// L10: CORS advertises exactly the verbs the API implements.
test("L10: CORS allowMethods is exactly the implemented verbs", async () => {
  const res = await app.request("/runs", {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "POST",
    },
  });
  assert.equal(res.headers.get("access-control-allow-methods"), "GET,POST,PATCH,OPTIONS");
});

// M1: an oversized body is rejected before the handler parses it.
test("M1: an over-limit body is rejected with 413", async () => {
  const big = "x".repeat(5 * 1024 * 1024);
  const res = await app.request("/runs", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": String(big.length) },
    body: big,
  });
  assert.equal(res.status, 413);
});
