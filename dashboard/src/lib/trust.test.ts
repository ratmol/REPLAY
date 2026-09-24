import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventRecord } from "replay-shared";
import { hasCrossed, nearestSource, sourcesBefore, trustPaths } from "./trust.js";

function event(
  seq: number,
  type: EventRecord["type"],
  trust?: EventRecord["trust"],
  timestamp = `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`,
): EventRecord {
  return { seq, type, timestamp, payload: {}, ...(trust ? { trust } : {}) };
}

test("a run with no trust markers has no sources or sinks", () => {
  const paths = trustPaths([event(0, "run_start"), event(1, "tool_call"), event(2, "run_end")]);
  assert.deepEqual(paths, { sources: [], sinks: [] });
});

test("a sink after a source has crossed, and points back at it", () => {
  const source = event(3, "tool_result", "source");
  const sink = event(5, "tool_call", "sink");
  const paths = trustPaths([event(0, "run_start"), source, event(4, "llm_call"), sink]);
  assert.equal(paths.sinks.length, 1);
  const reach = paths.sinks[0]!;
  assert.equal(hasCrossed(reach), true);
  assert.equal(nearestSource(paths, reach), source);
});

test("a sink before any source has not crossed", () => {
  const paths = trustPaths([event(1, "tool_call", "sink"), event(2, "tool_result", "source")]);
  const reach = paths.sinks[0]!;
  assert.equal(hasCrossed(reach), false);
  assert.equal(nearestSource(paths, reach), null);
  assert.deepEqual(sourcesBefore(paths, reach), []);
});

test("each sink counts only the sources strictly before it", () => {
  const s1 = event(1, "tool_result", "source");
  const s2 = event(3, "tool_result", "source");
  const paths = trustPaths([
    s1,
    event(2, "tool_call", "sink"),
    s2,
    event(4, "tool_call", "sink"),
  ]);
  assert.deepEqual(
    paths.sinks.map((r) => r.sourcesBefore),
    [1, 2],
  );
  assert.equal(nearestSource(paths, paths.sinks[0]!), s1);
  assert.equal(nearestSource(paths, paths.sinks[1]!), s2);
  assert.deepEqual(sourcesBefore(paths, paths.sinks[1]!), [s1, s2]);
});

test("orders by seq, not timestamp, when the two disagree", () => {
  // The source's clock reads later than the sink's, but it was logged first.
  // seq is the ordering key (invariant 5); a skewed clock must not hide the
  // crossing.
  const source = event(1, "tool_result", "source", "2026-01-01T00:00:09Z");
  const sink = event(2, "tool_call", "sink", "2026-01-01T00:00:01Z");
  const paths = trustPaths([sink, source]);
  assert.equal(hasCrossed(paths.sinks[0]!), true);
});

test("accepts events in any input order", () => {
  const paths = trustPaths([
    event(4, "tool_call", "sink"),
    event(2, "tool_result", "source"),
    event(0, "run_start"),
  ]);
  assert.deepEqual(
    paths.sources.map((e) => e.seq),
    [2],
  );
  assert.equal(paths.sinks[0]!.sourcesBefore, 1);
});
