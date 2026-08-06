import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Replay } from "./index.js";

type FetchCall = { url: string; body: unknown };

/**
 * Stands in for the collector. `handler` decides per-call whether the mocked
 * fetch resolves ok, resolves not-ok, or rejects (simulating a network
 * error) - covers everything postJsonWithRetry needs to branch on. Built on
 * node:test's own mock.method, so no mocking library is added as a dependency.
 */
function mockFetch(
  t: TestContext,
  handler: (url: string, body: unknown) => { ok: boolean } | "reject",
): FetchCall[] {
  const calls: FetchCall[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, body });
    const result = handler(url, body);
    if (result === "reject") {
      throw new Error("simulated network failure");
    }
    return new Response(null, { status: result.ok ? 200 : 500 });
  });
  return calls;
}

const ENDPOINT = "http://localhost:4747";

test("startRun creates the run exactly once, even across multiple flushes", async (t) => {
  const calls = mockFetch(t, () => ({ ok: true }));
  const replay = new Replay({ endpoint: ENDPOINT, flushIntervalMs: 50_000 });
  const run = replay.startRun({ name: "job-scraper", agentName: "aip444-agent" });
  run.logEvent({ type: "tool_call", payload: { toolName: "search" } });
  await run.end({ status: "completed" });

  const runCreationCalls = calls.filter((c) => c.url === `${ENDPOINT}/runs`);
  assert.equal(runCreationCalls.length, 1);
  const createBody = runCreationCalls[0]?.body as { id: string; name: string };
  assert.equal(createBody.id, run.id);
  assert.equal(createBody.name, "job-scraper");
});

test("end() sends run_start, logged events, and run_end in one batch", async (t) => {
  const calls = mockFetch(t, () => ({ ok: true }));
  const replay = new Replay({ endpoint: ENDPOINT, flushIntervalMs: 50_000 });
  const run = replay.startRun({ name: "job-scraper" });
  run.logEvent({ type: "tool_call", payload: { toolName: "search" } });
  await run.end({ status: "completed" });

  const batchCall = calls.find((c) => c.url === `${ENDPOINT}/runs/${run.id}/events`);
  assert.ok(batchCall, "expected a batch POST to /runs/:id/events");
  const batchBody = batchCall!.body as { events: { type: string }[] };
  const types = batchBody.events.map((e) => e.type);
  assert.deepEqual(types, ["run_start", "tool_call", "run_end"]);
  assert.deepEqual(run.getBufferedEvents(), []);
});

test("end() PATCHes runs.status to keep it in sync with the run_end event", async (t) => {
  const calls = mockFetch(t, () => ({ ok: true }));
  const replay = new Replay({ endpoint: ENDPOINT, flushIntervalMs: 50_000 });
  const run = replay.startRun({ name: "job-scraper" });
  await run.end({ status: "failed", summary: { reason: "budget exceeded" } });

  const patchCall = calls.find((c) => c.url === `${ENDPOINT}/runs/${run.id}`);
  assert.ok(patchCall, "expected a PATCH to /runs/:id");
  const patchBody = patchCall!.body as { status: string; endedAt: string };
  assert.equal(patchBody.status, "failed");
  assert.equal(typeof patchBody.endedAt, "string");
});

test("a PATCH failure is reported via onError, not thrown", async (t) => {
  mockFetch(t, (url) => (/\/runs\/[^/]+$/.test(url) ? "reject" : { ok: true }));
  const errors: unknown[] = [];
  const replay = new Replay({
    endpoint: ENDPOINT,
    flushIntervalMs: 50_000,
    onError: (e) => errors.push(e),
  });
  const run = replay.startRun({ name: "job-scraper" });

  await assert.doesNotReject(() => run.end({ status: "completed" }));
  assert.equal(errors.length, 1);
  assert.match(String((errors[0] as Error).message), /status/);
});

test("collector-down path: end() never throws, calls onError, keeps events buffered", async (t) => {
  mockFetch(t, () => "reject");
  const errors: unknown[] = [];
  const replay = new Replay({
    endpoint: ENDPOINT,
    flushIntervalMs: 50_000,
    onError: (e) => errors.push(e),
  });
  const run = replay.startRun({ name: "job-scraper" });
  run.logEvent({ type: "tool_call", payload: {} });

  await assert.doesNotReject(() => run.end({ status: "completed" }));
  assert.ok(errors.length > 0);
  // Run creation never succeeded, so flushOnce returns before draining -
  // nothing was lost, it's all still waiting for the collector to come back.
  assert.equal(run.getBufferedEvents().length, 3);
});

test("a batch that fails once then succeeds on retry is not reported as an error", async (t) => {
  let eventsAttempts = 0;
  mockFetch(t, (url) => {
    if (!url.endsWith("/events")) return { ok: true }; // POST /runs, PATCH /runs/:id
    eventsAttempts += 1;
    return eventsAttempts === 1 ? "reject" : { ok: true };
  });
  const errors: unknown[] = [];
  const replay = new Replay({
    endpoint: ENDPOINT,
    flushIntervalMs: 50_000,
    onError: (e) => errors.push(e),
  });
  const run = replay.startRun({ name: "job-scraper" });
  await run.end({ status: "completed" });

  assert.equal(eventsAttempts, 2);
  assert.deepEqual(errors, []);
  assert.deepEqual(run.getBufferedEvents(), []);
});

test("a batch that fails both attempts calls onError and does not requeue", async (t) => {
  mockFetch(t, (url) => (url.endsWith("/events") ? "reject" : { ok: true }));
  const errors: unknown[] = [];
  const replay = new Replay({
    endpoint: ENDPOINT,
    flushIntervalMs: 50_000,
    onError: (e) => errors.push(e),
  });
  const run = replay.startRun({ name: "job-scraper" });
  await run.end({ status: "completed" });

  assert.equal(errors.length, 1);
  assert.match(String((errors[0] as Error).message), /dropped/);
  // Drained before the send attempt, so a failure doesn't leave it stuck in
  // the buffer either - it's gone, not retried on the next flush.
  assert.deepEqual(run.getBufferedEvents(), []);
});

test("flushes on an interval without end() being called", async (t) => {
  const calls = mockFetch(t, () => ({ ok: true }));
  const replay = new Replay({ endpoint: ENDPOINT, flushIntervalMs: 10 });
  const run = replay.startRun({ name: "job-scraper" });
  run.logEvent({ type: "tool_call", payload: {} });

  await new Promise((resolve) => setTimeout(resolve, 100));

  const batchCall = calls.find((c) => c.url === `${ENDPOINT}/runs/${run.id}/events`);
  assert.ok(batchCall, "expected an interval-triggered batch send");
  assert.equal(run.getBufferedEvents().length, 0);
  await run.end({ status: "completed" });
});

test("logEvent assigns seq monotonically starting from run_start at 0", async (t) => {
  mockFetch(t, () => ({ ok: true }));
  const replay = new Replay({ endpoint: ENDPOINT, flushIntervalMs: 50_000 });
  const run = replay.startRun({ name: "job-scraper" });
  run.logEvent({ type: "tool_call", payload: {} });
  run.logEvent({ type: "tool_result", payload: {} });
  const events = run.getBufferedEvents();
  assert.deepEqual(
    events.map((e) => e.seq),
    [0, 1, 2],
  );
  assert.deepEqual(
    events.map((e) => e.type),
    ["run_start", "tool_call", "tool_result"],
  );
  await run.end({ status: "completed" });
});

test("logEvent after end is a silent no-op, not a throw", async (t) => {
  mockFetch(t, () => ({ ok: true }));
  const replay = new Replay({ endpoint: ENDPOINT, flushIntervalMs: 50_000 });
  const run = replay.startRun({ name: "job-scraper" });
  await run.end({ status: "completed" });
  assert.doesNotThrow(() => run.logEvent({ type: "tool_call", payload: {} }));
});

test("buffer overflow drops oldest events and reports the count", async (t) => {
  mockFetch(t, () => ({ ok: true }));
  const replay = new Replay({ endpoint: ENDPOINT, flushIntervalMs: 50_000, maxBufferSize: 3 });
  const run = replay.startRun({ name: "job-scraper" });
  for (let i = 0; i < 10; i += 1) {
    run.logEvent({ type: "tool_call", payload: { i } });
  }
  const events = run.getBufferedEvents();
  assert.equal(events.length, 3);
  assert.equal(run.droppedEventCount, 8);
  assert.equal(events[events.length - 1]?.payload["i"], 9);
  await run.end({ status: "completed" });
});

test("an invalid maxBufferSize or flushIntervalMs never crashes startRun", async (t) => {
  mockFetch(t, () => ({ ok: true }));
  for (const bad of [0, -5, NaN, 1.5]) {
    const replay = new Replay({ endpoint: ENDPOINT, maxBufferSize: bad, flushIntervalMs: bad });
    let run: ReturnType<typeof replay.startRun> | undefined;
    assert.doesNotThrow(() => {
      run = replay.startRun({ name: "job-scraper" });
    });
    await run?.end({ status: "completed" });
  }
});
