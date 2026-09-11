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

test("a throwing onError never rejects end() and never becomes an unhandled rejection", async (t) => {
  // The collector is down (every request rejects), so onError fires - and the
  // host's onError is itself buggy and throws. The SDK must absorb both: the
  // network failure and the callback's own throw. Two distinct escape routes:
  // (a) end() is awaited, so a rejection would surface into host code, and
  // (b) the constructor's fire-and-forget flush has no awaiter, so a rejection
  //     would become a process-killing unhandledRejection.
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown): void => {
    unhandled.push(reason);
  };
  process.on("unhandledRejection", onUnhandled);
  t.after(() => process.off("unhandledRejection", onUnhandled));

  mockFetch(t, () => "reject");
  const replay = new Replay({
    endpoint: ENDPOINT,
    flushIntervalMs: 50_000,
    onError: () => {
      throw new Error("buggy host onError");
    },
  });
  const run = replay.startRun({ name: "job-scraper" });
  run.logEvent({ type: "tool_call", payload: {} });

  // (a) awaited path.
  await assert.doesNotReject(() => run.end({ status: "completed" }));

  // (b) fire-and-forget path: let the constructor flush and any queued
  // microtasks settle, then confirm nothing landed on unhandledRejection.
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(unhandled, []);
});

test("a failed flush round does not wedge the run: a later flush still sends", async (t) => {
  // First flush round happens while the collector is unreachable AND the
  // host's onError throws - i.e. something inside the flush throws. flushPromise
  // must not be left pinned to that round: if it were, every later flush()
  // would return the same stale promise and no event would ever be sent again.
  // Once the collector comes back, end()'s flush must create the run and drain
  // the buffer.
  let collectorUp = false;
  const calls = mockFetch(t, () => (collectorUp ? { ok: true } : "reject"));
  const replay = new Replay({
    endpoint: ENDPOINT,
    flushIntervalMs: 50_000,
    onError: () => {
      throw new Error("buggy host onError");
    },
  });
  const run = replay.startRun({ name: "job-scraper" });
  run.logEvent({ type: "tool_call", payload: {} });

  // Let the constructor's flush attempt run and fail against the down collector.
  await new Promise((resolve) => setImmediate(resolve));

  collectorUp = true;
  await assert.doesNotReject(() => run.end({ status: "completed" }));

  // The run was created and the whole buffer was drained on the recovery flush.
  assert.ok(calls.some((c) => c.url === `${ENDPOINT}/runs`));
  const batchCall = calls.find((c) => c.url === `${ENDPOINT}/runs/${run.id}/events`);
  assert.ok(batchCall, "expected the recovery flush to send an events batch");
  const types = (batchCall!.body as { events: { type: string }[] }).events.map((e) => e.type);
  assert.deepEqual(types, ["run_start", "tool_call", "run_end"]);
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

test("a payload mutated after logEvent still flushes its original value", async (t) => {
  const calls = mockFetch(t, () => ({ ok: true }));
  const replay = new Replay({ endpoint: ENDPOINT, flushIntervalMs: 50_000 });
  const run = replay.startRun({ name: "job-scraper" });

  const payload: Record<string, unknown> = { toolName: "search", args: { query: "original" } };
  run.logEvent({ type: "tool_call", payload });
  // Host reuses/mutates the same object after handing it to logEvent - common
  // when an agent threads one options object through a loop. The recorded event
  // must be a snapshot taken at logEvent time, not a live alias.
  (payload["args"] as Record<string, unknown>)["query"] = "mutated";
  payload["toolName"] = "other";

  await run.end({ status: "completed" });

  const batchCall = calls.find((c) => c.url === `${ENDPOINT}/runs/${run.id}/events`);
  assert.ok(batchCall, "expected a batch POST to /runs/:id/events");
  const events = (batchCall!.body as { events: { type: string; payload: Record<string, unknown> }[] })
    .events;
  const toolCall = events.find((e) => e.type === "tool_call");
  assert.ok(toolCall, "expected the tool_call event in the batch");
  assert.equal(toolCall!.payload["toolName"], "search");
  assert.equal((toolCall!.payload["args"] as Record<string, unknown>)["query"], "original");
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
