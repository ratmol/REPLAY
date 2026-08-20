import { test } from "node:test";
import assert from "node:assert/strict";
import type { RunSummary } from "replay-shared";
import {
  countByStatus,
  filterAndSortRuns,
  matchesText,
  runDurationMs,
  EMPTY_RUN_QUERY,
} from "./runFilter.js";

const NOW = new Date("2026-01-01T00:10:00Z").getTime();

function run(overrides: Partial<RunSummary> & { name: string }): RunSummary {
  return {
    id: overrides.name,
    startedAt: "2026-01-01T00:00:00Z",
    status: "completed",
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalCostUsd: 0,
    ...overrides,
  };
}

test("an empty query returns everything", () => {
  const runs = [run({ name: "a" }), run({ name: "b", status: "failed" })];
  assert.equal(filterAndSortRuns(runs, EMPTY_RUN_QUERY, NOW).length, 2);
});

test("status narrows to one outcome", () => {
  const runs = [run({ name: "a" }), run({ name: "b", status: "failed" })];
  const failed = filterAndSortRuns(runs, { ...EMPTY_RUN_QUERY, status: "failed" }, NOW);
  assert.deepEqual(
    failed.map((r) => r.name),
    ["b"],
  );
});

test("text matches name, agent and model case-insensitively", () => {
  const target = run({ name: "Support-Agent", agentName: "triage", model: "gpt-4o-mini" });
  assert.ok(matchesText(target, "support"));
  assert.ok(matchesText(target, "TRIAGE"));
  assert.ok(matchesText(target, "4o"));
  assert.ok(!matchesText(target, "claude"));
});

test("whitespace-only text is not a filter", () => {
  assert.ok(matchesText(run({ name: "a" }), "   "));
});

test("a run with no agent or model does not throw on a text query", () => {
  assert.ok(!matchesText(run({ name: "a" }), "zzz"));
});

test("sorting by cost puts the most expensive first", () => {
  const runs = [
    run({ name: "cheap", totalCostUsd: 0.001 }),
    run({ name: "dear", totalCostUsd: 2 }),
  ];
  assert.equal(filterAndSortRuns(runs, { ...EMPTY_RUN_QUERY, sort: "cost" }, NOW)[0]!.name, "dear");
});

test("a run still in flight is measured to now, not to zero", () => {
  const inFlight = run({ name: "live", status: "running", endedAt: undefined });
  assert.equal(runDurationMs(inFlight, NOW), 600_000);
});

test("sorting by duration ranks an in-flight run against finished ones", () => {
  const runs = [
    run({ name: "quick", endedAt: "2026-01-01T00:00:01Z" }),
    run({ name: "live", status: "running", endedAt: undefined }),
  ];
  const sorted = filterAndSortRuns(runs, { ...EMPTY_RUN_QUERY, sort: "duration" }, NOW);
  assert.equal(sorted[0]!.name, "live");
});

test("filterAndSortRuns does not reorder the array it was given", () => {
  const runs = [run({ name: "a", totalCostUsd: 1 }), run({ name: "b", totalCostUsd: 5 })];
  filterAndSortRuns(runs, { ...EMPTY_RUN_QUERY, sort: "cost" }, NOW);
  assert.deepEqual(
    runs.map((r) => r.name),
    ["a", "b"],
  );
});

test("countByStatus totals each outcome plus an all bucket", () => {
  const runs = [
    run({ name: "a" }),
    run({ name: "b", status: "failed" }),
    run({ name: "c", status: "running" }),
  ];
  assert.deepEqual(countByStatus(runs), { all: 3, running: 1, completed: 1, failed: 1 });
});
