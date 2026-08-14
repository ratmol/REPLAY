import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventRecord } from "replay-shared";
import { buildCostSteps } from "./cost.js";

function event(
  seq: number,
  type: EventRecord["type"],
  extra: Partial<Pick<EventRecord, "costUsd" | "tokensIn" | "tokensOut">> = {},
): EventRecord {
  return {
    seq,
    type,
    timestamp: `2026-01-01T00:00:${String(seq).padStart(2, "0")}.000Z`,
    payload: {},
    ...extra,
  };
}

test("returns an empty series for no events", () => {
  assert.deepEqual(buildCostSteps([], 0), []);
});

test("excludes events that report neither cost nor tokens", () => {
  const events = [event(0, "run_start"), event(1, "tool_call")];
  assert.deepEqual(buildCostSteps(events, 0), []);
});

test("accumulates cost across multiple cost-bearing events", () => {
  const startMs = new Date("2026-01-01T00:00:00.000Z").getTime();
  const events = [
    event(0, "llm_call", { tokensIn: 100 }),
    event(1, "llm_response", { tokensOut: 50, costUsd: 0.01 }),
    event(2, "tool_result", { costUsd: 0.002 }),
  ];
  const steps = buildCostSteps(events, startMs);
  assert.equal(steps.length, 3);
  assert.deepEqual(
    steps.map((s) => s.cumulativeCostUsd),
    [0, 0.01, 0.012],
  );
});

test("a step with tokens but no costUsd contributes zero cost, not undefined", () => {
  const startMs = new Date("2026-01-01T00:00:00.000Z").getTime();
  const steps = buildCostSteps([event(0, "llm_call", { tokensIn: 100 })], startMs);
  assert.equal(steps[0]!.costUsd, 0);
  assert.equal(steps[0]!.cumulativeCostUsd, 0);
  assert.equal(steps[0]!.tokensIn, 100);
});

test("elapsedMs is relative to the given startMs, not the first cost-bearing event", () => {
  const startMs = new Date("2026-01-01T00:00:00.000Z").getTime();
  const events = [event(0, "run_start"), event(3, "tool_result", { costUsd: 0.5 })];
  const steps = buildCostSteps(events, startMs);
  assert.equal(steps.length, 1);
  assert.equal(steps[0]!.elapsedMs, 3000);
});

test("output is sorted by seq regardless of input order", () => {
  const events = [
    event(2, "tool_result", { costUsd: 0.03 }),
    event(0, "tool_result", { costUsd: 0.01 }),
    event(1, "tool_result", { costUsd: 0.02 }),
  ];
  const steps = buildCostSteps(events, 0);
  assert.deepEqual(
    steps.map((s) => s.seq),
    [0, 1, 2],
  );
  assert.deepEqual(
    steps.map((s) => s.cumulativeCostUsd),
    [0.01, 0.03, 0.06],
  );
});
