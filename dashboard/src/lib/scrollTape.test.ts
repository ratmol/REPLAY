import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { EventRecord } from "replay-shared";
import { clamp01, eventIndexAtProgress, sectionProgress, timecode } from "./scrollTape";

function event(seq: number, offsetMs: number): EventRecord {
  return {
    id: `e${seq}`,
    runId: "r1",
    seq,
    type: "tool_call",
    timestamp: new Date(1000 + offsetMs).toISOString(),
    payload: {},
  } as EventRecord;
}

test("sectionProgress is 0 before the section pins", () => {
  assert.equal(sectionProgress(400, 2000, 800), 0);
});

test("sectionProgress reaches 1 at the end of the scrub distance", () => {
  // height 2000, viewport 800 -> 1200px of scrub
  assert.equal(sectionProgress(-1200, 2000, 800), 1);
  assert.equal(sectionProgress(-600, 2000, 800), 0.5);
});

test("sectionProgress clamps past the end instead of overshooting", () => {
  assert.equal(sectionProgress(-9999, 2000, 800), 1);
});

test("sectionProgress returns 0 when the section is shorter than the viewport", () => {
  assert.equal(sectionProgress(-10, 500, 800), 0);
});

test("clamp01 handles NaN", () => {
  assert.equal(clamp01(Number.NaN), 0);
});

test("eventIndexAtProgress walks the run by wall-clock, not by event count", () => {
  // Three events bunched at the start, one far later: at 50% of the run's
  // duration the playhead is still on the third, not the second.
  const events = [event(0, 0), event(1, 100), event(2, 200), event(3, 10000)];
  assert.equal(eventIndexAtProgress(events, 0), 0);
  assert.equal(eventIndexAtProgress(events, 0.5), 2);
  assert.equal(eventIndexAtProgress(events, 1), 3);
});

test("eventIndexAtProgress lands exactly on an event at its own timestamp", () => {
  const events = [event(0, 0), event(1, 500), event(2, 1000)];
  assert.equal(eventIndexAtProgress(events, 0.5), 1);
});

test("eventIndexAtProgress handles a zero-duration run", () => {
  const events = [event(0, 0), event(1, 0)];
  assert.equal(eventIndexAtProgress(events, 0.3), 1);
});

test("eventIndexAtProgress handles an empty run", () => {
  assert.equal(eventIndexAtProgress([], 0.5), 0);
});

test("timecode formats as mm:ss.cs", () => {
  assert.equal(timecode(0), "00:00.00");
  assert.equal(timecode(1240), "00:01.24");
  assert.equal(timecode(65999), "01:05.99");
  assert.equal(timecode(-5), "00:00.00");
});
