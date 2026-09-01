import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventRecord } from "replay-shared";
import { altitudeAtX, buildFlightPath, groundY } from "./flightPath.js";

function event(seq: number, costUsd?: number): EventRecord {
  return {
    seq,
    type: "llm_response",
    timestamp: `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`,
    payload: {},
    ...(costUsd === undefined ? {} : { costUsd }),
  };
}

test("the profile climbs as cost accumulates, then lands on the ground at the final event", () => {
  // Costs [0, 1, 1, 0]: cumulative [0, 1, 2, 2] of a total 2. The peak is the
  // second-to-last event; the last one touches down on the runway.
  const points = buildFlightPath([event(0, 0), event(1, 1), event(2, 1), event(3, 0)], 100, 100);
  assert.equal(points.length, 4);
  assert.equal(points[0]!.y, 82); // ground - takeoff, nothing spent yet
  assert.equal(points[1]!.y, 50); // half the run's cost
  assert.equal(points[2]!.y, 18); // ceiling - the cruise peak
  assert.equal(points[3]!.y, 82); // ground again - the landing
});

test("cumulativeCostUsd keeps the true total even though the last event lands", () => {
  const points = buildFlightPath([event(0, 0), event(1, 1), event(2, 1)], 100, 100);
  assert.equal(points[2]!.y, groundY(100)); // drawn on the ground
  assert.equal(points[2]!.cumulativeCostUsd, 2); // but the readout still sees $2
});

test("x is spread across the full width by time", () => {
  const points = buildFlightPath([event(0), event(1), event(2)], 100, 100);
  assert.deepEqual(
    points.map((point) => point.x),
    [0, 50, 100],
  );
});

test("a run that spent nothing cruises flat instead of dividing by zero", () => {
  const points = buildFlightPath([event(0), event(1)], 100, 100);
  assert.deepEqual(
    points.map((point) => point.y),
    [82, 82],
  );
});

test("a run whose events share one timestamp still produces finite coordinates", () => {
  const same = [event(0, 1), { ...event(1, 1), timestamp: event(0).timestamp }];
  const points = buildFlightPath(same, 100, 100);
  assert.ok(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
});

test("buildFlightPath handles an empty run", () => {
  assert.deepEqual(buildFlightPath([], 100, 100), []);
});

test("altitudeAtX interpolates between two waypoints", () => {
  // Three events (so the middle one carries altitude and the last one lands):
  // p0 ground(82) at x=0, p1 peak(18) at x=50, p2 ground(82) at x=100.
  const points = buildFlightPath([event(0, 0), event(1, 1), event(2, 0)], 100, 100);
  assert.equal(altitudeAtX(points, 25), 50); // halfway up the climb
});

test("altitudeAtX holds level outside the route", () => {
  const points = buildFlightPath([event(0, 0), event(1, 1), event(2, 0)], 100, 100);
  assert.equal(altitudeAtX(points, -20), 82); // before takeoff, on the ground
  assert.equal(altitudeAtX(points, 500), 82); // after landing, on the ground
});

test("altitudeAtX returns 0 for an empty route rather than NaN", () => {
  assert.equal(altitudeAtX([], 10), 0);
});
