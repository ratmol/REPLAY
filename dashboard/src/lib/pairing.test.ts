import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventRecord } from "replay-shared";
import { isSameTimelineItem, itemAtTime, itemBySeq, itemStartSeq, pairEvents } from "./pairing.js";

function event(
  seq: number,
  type: EventRecord["type"],
  payload: Record<string, unknown> = {},
): EventRecord {
  return {
    seq,
    type,
    timestamp: `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`,
    payload,
  };
}

test("pairs tool_call/tool_result by callId into a span", () => {
  const events = [event(0, "tool_call", { callId: "a" }), event(1, "tool_result", { callId: "a" })];
  const items = pairEvents(events);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    kind: "span",
    type: "tool_call",
    start: events[0],
    end: events[1],
  });
});

test("a tool_call with no matching tool_result renders as a point", () => {
  const events = [event(0, "tool_call", { callId: "a" })];
  const items = pairEvents(events);
  assert.deepEqual(items, [{ kind: "point", type: "tool_call", event: events[0] }]);
});

test("a tool_result with no matching tool_call renders as a point", () => {
  const events = [event(0, "tool_result", { callId: "orphan" })];
  const items = pairEvents(events);
  assert.deepEqual(items, [{ kind: "point", type: "tool_result", event: events[0] }]);
});

test("handles concurrent, non-adjacent tool calls correctly", () => {
  // call A, call B, result B, result A - A and B should each pair with
  // their own result despite the interleaving.
  const events = [
    event(0, "tool_call", { callId: "a" }),
    event(1, "tool_call", { callId: "b" }),
    event(2, "tool_result", { callId: "b" }),
    event(3, "tool_result", { callId: "a" }),
  ];
  const items = pairEvents(events);
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((i) => (i.kind === "span" ? [i.start.seq, i.end.seq] : null)).sort(),
    [
      [0, 3],
      [1, 2],
    ].sort(),
  );
});

test("pairs llm_call/llm_response only when directly adjacent", () => {
  const events = [event(0, "llm_call", {}), event(1, "llm_response", {})];
  const items = pairEvents(events);
  assert.deepEqual(items, [{ kind: "span", type: "llm_call", start: events[0], end: events[1] }]);
});

test("an llm_call not immediately followed by llm_response renders as a point", () => {
  const events = [event(0, "llm_call", {}), event(1, "tool_call", { callId: "a" })];
  const items = pairEvents(events);
  const llmItem = items.find((i) => (i.kind === "point" ? i.event.seq === 0 : false));
  assert.deepEqual(llmItem, {
    kind: "point",
    type: "llm_call",
    event: events[0],
  });
});

test("a lone llm_response with no preceding llm_call renders as a point", () => {
  const events = [event(0, "tool_call", { callId: "a" }), event(1, "llm_response", {})];
  const items = pairEvents(events);
  const responseItem = items.find((i) =>
    i.kind === "point" ? i.event.type === "llm_response" : false,
  );
  assert.deepEqual(responseItem, {
    kind: "point",
    type: "llm_response",
    event: events[1],
  });
});

test("run_start, retry, agent_decision, error, and run_end always render as points", () => {
  const events = [
    event(0, "run_start"),
    event(1, "retry", { attempt: 1 }),
    event(2, "agent_decision", {}),
    event(3, "error", { message: "boom" }),
    event(4, "run_end", { status: "completed" }),
  ];
  const items = pairEvents(events);
  assert.equal(items.length, 5);
  assert.ok(items.every((i) => i.kind === "point"));
});

test("output is sorted by seq regardless of input order", () => {
  const events = [event(2, "run_end"), event(0, "run_start"), event(1, "agent_decision")];
  const items = pairEvents(events);
  assert.deepEqual(
    items.map((i) => (i.kind === "point" ? i.event.seq : -1)),
    [0, 1, 2],
  );
});

test("a tool_call/tool_result without a callId in the payload cannot pair", () => {
  const events = [event(0, "tool_call", {}), event(1, "tool_result", {})];
  const items = pairEvents(events);
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.kind === "point"));
});

test("an unrelated event between a tool_call and its result stays its own point", () => {
  // Found against real seeded data, not just synthesized here: a retry
  // event landing between a tool_call and its eventual tool_result must not
  // get swallowed into that span.
  const events = [
    event(0, "tool_call", { callId: "a" }),
    event(1, "retry", { attempt: 1 }),
    event(2, "tool_result", { callId: "a" }),
  ];
  const items = pairEvents(events);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    kind: "span",
    type: "tool_call",
    start: events[0],
    end: events[2],
  });
  assert.deepEqual(items[1], {
    kind: "point",
    type: "retry",
    event: events[1],
  });
});

test("isSameTimelineItem treats two null selections as equal", () => {
  assert.ok(isSameTimelineItem(null, null));
});

test("isSameTimelineItem treats null and a selection as different", () => {
  const point: ReturnType<typeof pairEvents>[number] = {
    kind: "point",
    type: "run_start",
    event: event(0, "run_start"),
  };
  assert.ok(!isSameTimelineItem(null, point));
  assert.ok(!isSameTimelineItem(point, null));
});

test("isSameTimelineItem compares points by seq, not object identity", () => {
  const a = {
    kind: "point" as const,
    type: "run_start" as const,
    event: event(0, "run_start"),
  };
  const b = {
    kind: "point" as const,
    type: "run_start" as const,
    event: event(0, "run_start"),
  };
  const c = {
    kind: "point" as const,
    type: "run_start" as const,
    event: event(1, "run_start"),
  };
  assert.ok(isSameTimelineItem(a, b));
  assert.ok(!isSameTimelineItem(a, c));
});

test("isSameTimelineItem does not confuse a span with a point sharing its start seq", () => {
  const span = {
    kind: "span" as const,
    type: "tool_call" as const,
    start: event(0, "tool_call", { callId: "a" }),
    end: event(1, "tool_result", { callId: "a" }),
  };
  const point = {
    kind: "point" as const,
    type: "tool_call" as const,
    event: event(0, "tool_call", { callId: "a" }),
  };
  assert.ok(!isSameTimelineItem(span, point));
});

// The event() helper above puts event N at second N, so BASE_MS + 500 is
// half a second past event 0.
const BASE_MS = new Date("2026-01-01T00:00:00Z").getTime();

test("itemAtTime returns the span the time falls inside", () => {
  const items = pairEvents([
    event(0, "tool_call", { callId: "a" }),
    event(1, "tool_result", { callId: "a" }),
  ]);
  assert.equal(itemAtTime(items, BASE_MS + 500, 100)?.kind, "span");
});

test("itemAtTime falls back to the nearest point inside the tolerance", () => {
  const items = pairEvents([event(0, "run_start")]);
  assert.equal(itemAtTime(items, BASE_MS + 80, 100)?.kind, "point");
});

test("itemAtTime returns null when the nearest point is outside the tolerance", () => {
  const items = pairEvents([event(0, "run_start")]);
  assert.equal(itemAtTime(items, BASE_MS + 5000, 100), null);
});

test("itemAtTime prefers a span over a point that is closer in time", () => {
  const items = pairEvents([
    event(0, "tool_call", { callId: "a" }),
    event(1, "agent_decision"),
    event(2, "tool_result", { callId: "a" }),
  ]);
  // 1.2s in: inside the tool span, and 200ms from the agent_decision point.
  assert.equal(itemAtTime(items, BASE_MS + 1200, 500)?.kind, "span");
});

test("itemBySeq finds a point by its own seq", () => {
  const items = pairEvents([event(0, "run_start"), event(1, "agent_decision")]);
  assert.equal(itemStartSeq(itemBySeq(items, 1)!), 1);
});

test("itemBySeq finds a span from either half of the pair", () => {
  const items = pairEvents([
    event(0, "tool_call", { callId: "a" }),
    event(1, "tool_result", { callId: "a" }),
  ]);
  assert.equal(itemBySeq(items, 0)?.kind, "span");
  assert.equal(itemBySeq(items, 1)?.kind, "span");
});

test("itemBySeq returns null for a seq that is not in the run", () => {
  assert.equal(itemBySeq(pairEvents([event(0, "run_start")]), 99), null);
});

test("itemStartSeq identifies a span by its opening event", () => {
  const items = pairEvents([
    event(0, "tool_call", { callId: "a" }),
    event(1, "tool_result", { callId: "a" }),
  ]);
  assert.equal(itemStartSeq(items[0]!), 0);
});
