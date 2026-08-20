import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventRecord } from "replay-shared";
import { altitudeAtX, buildFlightPath } from "./flightPath.js";

function event(seq: number, costUsd?: number): EventRecord {
  return {
    seq,
    type: "llm_response",
    timestamp: `2026-01-01T00:00:${String(seq).padStart(2, "0")}Z`,
    payload: {},
    ...(costUsd === undefined ? {} : { costUsd }),
  };
}

test("the profile climbs as cost accumulates and tops out at the last event", () => {
  const points = buildFlightPath([event(0, 0), event(1, 0.5), event(2, 0.5)], 100, 100);
  assert.equal(points.length, 3);
  assert.equal(points[0]!.y, 82); // floor - nothing spent yet
  assert.equal(points[1]!.y, 50); // half the run's cost
  assert.equal(points[2]!.y, 18); // ceiling - all of it
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
  const points = buildFlightPath([event(0, 0), event(1, 1)], 100, 100);
  assert.equal(altitudeAtX(points, 50), 50);
});

test("altitudeAtX holds level outside the route", () => {
  const points = buildFlightPath([event(0, 0), event(1, 1)], 100, 100);
  assert.equal(altitudeAtX(points, -20), 82);
  assert.equal(altitudeAtX(points, 500), 18);
});

test("altitudeAtX returns 0 for an empty route rather than NaN", () => {
  assert.equal(altitudeAtX([], 10), 0);
});
