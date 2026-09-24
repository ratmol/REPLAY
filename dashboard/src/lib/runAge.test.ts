import { test } from "node:test";
import assert from "node:assert/strict";
import { LIKELY_STOPPED_AFTER_MS, formatAge, isLikelyStopped } from "./runAge.js";

test("formats seconds, minutes, and hours at their boundaries", () => {
  assert.equal(formatAge(0), "0s ago");
  assert.equal(formatAge(59_999), "59s ago");
  assert.equal(formatAge(60_000), "1m ago");
  assert.equal(formatAge(59 * 60_000 + 59_000), "59m ago");
  assert.equal(formatAge(60 * 60_000), "1h 0m ago");
  assert.equal(formatAge(100 * 60_000 + 3_000), "1h 40m ago");
});

test("a clock slightly behind the server never prints a negative age", () => {
  assert.equal(formatAge(-1500), "0s ago");
});

test("likely stopped only once the silence reaches the threshold", () => {
  const last = 1_000_000;
  assert.equal(isLikelyStopped(last, last + LIKELY_STOPPED_AFTER_MS - 1), false);
  assert.equal(isLikelyStopped(last, last + LIKELY_STOPPED_AFTER_MS), true);
});
