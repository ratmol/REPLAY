import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EventSchema,
  RunStartEventSchema,
  ToolResultEventSchema,
  isTruncatedPayload,
  CreateRunRequestSchema,
  EventBatchSchema,
  PatchRunRequestSchema,
} from "./index.js";

const baseRunStart = {
  seq: 0,
  type: "run_start",
  timestamp: "2026-07-31T12:00:00Z",
  payload: { agentName: "job-scraper", model: "claude-sonnet-4-6" },
};

test("parses a minimal valid event of every event type", () => {
  const samples = [
    { ...baseRunStart },
    { seq: 1, type: "llm_call", timestamp: "2026-07-31T12:00:01Z", payload: {} },
    { seq: 2, type: "llm_response", timestamp: "2026-07-31T12:00:02Z", payload: {} },
    { seq: 3, type: "tool_call", timestamp: "2026-07-31T12:00:03Z", payload: {} },
    { seq: 4, type: "tool_result", timestamp: "2026-07-31T12:00:04Z", payload: { ok: true } },
    { seq: 5, type: "retry", timestamp: "2026-07-31T12:00:05Z", payload: { attempt: 1 } },
    { seq: 6, type: "error", timestamp: "2026-07-31T12:00:06Z", payload: { message: "boom" } },
    { seq: 7, type: "agent_decision", timestamp: "2026-07-31T12:00:07Z", payload: {} },
    { seq: 8, type: "run_end", timestamp: "2026-07-31T12:00:08Z", payload: { status: "completed" } },
  ];

  for (const sample of samples) {
    const result = EventSchema.safeParse(sample);
    assert.equal(result.success, true, `expected ${sample.type} to parse`);
  }
});

test("rejects an unknown envelope field", () => {
  const result = RunStartEventSchema.safeParse({ ...baseRunStart, unexpected: "nope" });
  assert.equal(result.success, false);
});

test("keeps unknown payload fields instead of stripping them", () => {
  const result = RunStartEventSchema.safeParse({
    ...baseRunStart,
    payload: { agentName: "job-scraper", frameworkSpecificThing: { nested: true } },
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.payload.frameworkSpecificThing, { nested: true });
  }
});

test("rejects a negative seq", () => {
  const result = RunStartEventSchema.safeParse({ ...baseRunStart, seq: -1 });
  assert.equal(result.success, false);
});

test("rejects a type outside the closed event set", () => {
  const result = EventSchema.safeParse({ ...baseRunStart, type: "not_a_real_event" });
  assert.equal(result.success, false);
});

test("requires the payload key even when the type carries no fields", () => {
  const { payload: _payload, ...withoutPayload } = baseRunStart;
  const result = RunStartEventSchema.safeParse(withoutPayload);
  assert.equal(result.success, false);
});

test("accepts a truncated payload marker on any event type", () => {
  const truncated = {
    _truncated: true,
    _originalBytes: 184320,
    _preview: "x".repeat(50),
  };
  const result = ToolResultEventSchema.safeParse({
    seq: 9,
    type: "tool_result",
    timestamp: "2026-07-31T12:00:09Z",
    payload: truncated,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(isTruncatedPayload(result.data.payload), true);
  }
});

test("isTruncatedPayload returns false for an ordinary payload", () => {
  assert.equal(isTruncatedPayload({ agentName: "job-scraper" }), false);
});

test("parses a minimal valid create-run request", () => {
  const result = CreateRunRequestSchema.safeParse({
    id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    name: "job-scraper",
    startedAt: "2026-07-31T12:00:00Z",
  });
  assert.equal(result.success, true);
});

test("rejects a create-run request missing a required field", () => {
  const result = CreateRunRequestSchema.safeParse({
    id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    startedAt: "2026-07-31T12:00:00Z",
  });
  assert.equal(result.success, false);
});

test("rejects a create-run request with an id that is not a uuid", () => {
  const result = CreateRunRequestSchema.safeParse({
    id: "not-a-uuid",
    name: "job-scraper",
    startedAt: "2026-07-31T12:00:00Z",
  });
  assert.equal(result.success, false);
});

test("parses a batch of valid events", () => {
  const result = EventBatchSchema.safeParse({
    events: [
      { ...baseRunStart },
      { seq: 1, type: "run_end", timestamp: "2026-07-31T12:00:01Z", payload: { status: "completed" } },
    ],
  });
  assert.equal(result.success, true);
});

test("surfaces per-event issues when one event in a batch is invalid", () => {
  const result = EventBatchSchema.safeParse({
    events: [{ ...baseRunStart }, { ...baseRunStart, seq: -1 }],
  });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.ok(result.error.issues.some((issue) => issue.path.includes("seq")));
  }
});

test("parses a valid patch-run request", () => {
  const result = PatchRunRequestSchema.safeParse({
    status: "completed",
    endedAt: "2026-07-31T12:00:10Z",
  });
  assert.equal(result.success, true);
});

test("rejects a patch-run status outside completed/failed", () => {
  const result = PatchRunRequestSchema.safeParse({
    status: "running",
    endedAt: "2026-07-31T12:00:10Z",
  });
  assert.equal(result.success, false);
});
