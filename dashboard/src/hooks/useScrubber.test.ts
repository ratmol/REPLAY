import { test } from "node:test";
import assert from "node:assert/strict";
import { findNextTime, findPreviousTime } from "./useScrubber.js";

test("findNextTime returns the first time strictly after the given one", () => {
  assert.equal(findNextTime([0, 10, 20, 30], 10), 20);
});

test("findNextTime returns undefined when already at or past the last time", () => {
  assert.equal(findNextTime([0, 10, 20], 20), undefined);
  assert.equal(findNextTime([0, 10, 20], 25), undefined);
});

test("findNextTime on an empty list returns undefined", () => {
  assert.equal(findNextTime([], 5), undefined);
});

test("findPreviousTime returns the last time strictly before the given one", () => {
  assert.equal(findPreviousTime([0, 10, 20, 30], 20), 10);
});

test("findPreviousTime returns undefined when already at or before the first time", () => {
  assert.equal(findPreviousTime([0, 10, 20], 0), undefined);
  assert.equal(findPreviousTime([0, 10, 20], -5), undefined);
});

test("findPreviousTime on an empty list returns undefined", () => {
  assert.equal(findPreviousTime([], 5), undefined);
});

test("stepping is exact-match aware, not just nearest", () => {
  // Landing exactly on an event's timestamp (e.g. after a drag-seek) must
  // step to the *next* distinct event, not re-select the same one.
  const times = [0, 10, 20];
  assert.equal(findNextTime(times, 10), 20);
  assert.equal(findPreviousTime(times, 10), 0);
});

test("steps onto the second of two same-millisecond events, not past it", () => {
  // Two events sharing a timestamp (routine for agent runs - e.g. a
  // tool_call and its retry) used to be unreachable: stepping forward from
  // the first 10 jumped straight to 20, and stepping backward from the
  // second 10 jumped straight to 0. Index-based stepping lands on the
  // duplicate itself in both directions instead of skipping over it.
  const times = [0, 10, 10, 20];
  assert.equal(findNextTime(times, 10), 10);
  assert.equal(findPreviousTime(times, 10), 10);
});
