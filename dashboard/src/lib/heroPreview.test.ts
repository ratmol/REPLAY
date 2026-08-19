import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventRecord } from "replay-shared";
import { charsVisible, pickPreviewEvents } from "./heroPreview.js";

function event(seq: number, type: EventRecord["type"]): EventRecord {
  return { seq, type, timestamp: `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`, payload: {} };
}

test("pickPreviewEvents prefers llm/tool events over run_start/run_end", () => {
  const events = [event(0, "run_start"), event(1, "tool_call"), event(2, "tool_result"), event(3, "run_end")];
  const picked = pickPreviewEvents(events, 3);
  assert.deepEqual(picked.map((e) => e.type), ["tool_call", "tool_result"]);
});

test("pickPreviewEvents falls back to whatever exists if nothing preferred is present", () => {
  const events = [event(0, "run_start"), event(1, "agent_decision")];
  const picked = pickPreviewEvents(events, 3);
  assert.deepEqual(picked.map((e) => e.type), ["run_start", "agent_decision"]);
});

test("pickPreviewEvents respects the max and preserves seq order", () => {
  const events = [event(2, "tool_call"), event(0, "llm_call"), event(1, "llm_response")];
  const picked = pickPreviewEvents(events, 2);
  assert.deepEqual(picked.map((e) => e.seq), [0, 1]);
});

test("charsVisible is 0 before typing starts", () => {
  assert.equal(charsVisible(0, 30, 10), 0);
});

test("charsVisible clamps to text length once typing finishes", () => {
  assert.equal(charsVisible(10_000, 30, 10), 10);
});

test("charsVisible advances one character per msPerChar", () => {
  assert.equal(charsVisible(90, 30, 10), 3);
  assert.equal(charsVisible(91, 30, 10), 3);
  assert.equal(charsVisible(120, 30, 10), 4);
});

test("charsVisible returns the full string immediately when msPerChar is 0", () => {
  assert.equal(charsVisible(0, 0, 7), 7);
});
