import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTick, tickDecimals } from "./ticks.js";

test("decimals follow the tick step", () => {
  assert.equal(tickDecimals(2500), 0);
  assert.equal(tickDecimals(1000), 0);
  assert.equal(tickDecimals(700), 1);
  assert.equal(tickDecimals(100), 1);
  assert.equal(tickDecimals(99), 2);
  assert.equal(tickDecimals(6.8), 3);
  assert.equal(tickDecimals(0.2), 4);
  assert.equal(tickDecimals(0.0001), 4); // capped
});

test("the two cases seen on the live ruler no longer repeat", () => {
  // A 0.06s run at 1x: ~6.8ms per 100px tick used to print "0.01s" twice.
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => formatTick(i * 6.8, 6.8)),
    ["0.000s", "0.007s", "0.014s", "0.020s"],
  );
  // The same run zoomed in, where every label used to read "0.06s".
  const step = 0.2;
  const labels = [0, 1, 2].map((i) => formatTick(60 + i * step, step));
  assert.equal(new Set(labels).size, labels.length);
});

test("adjacent labels are always distinct, across steps and past a minute", () => {
  for (const step of [0.2, 0.75, 6.8, 50, 99, 100, 101, 700, 999, 1000, 1500, 30_000]) {
    for (const start of [0, 59_000, 119_500]) {
      const labels = Array.from({ length: 40 }, (_unused, i) => formatTick(start + i * step, step));
      for (let i = 1; i < labels.length; i += 1) {
        assert.notEqual(labels[i], labels[i - 1], `step ${step}ms from ${start}ms: "${labels[i]}"`);
      }
    }
  }
});

test("minutes carry correctly instead of printing 60 seconds", () => {
  assert.equal(formatTick(119_960, 100), "2m 00.0s");
  assert.equal(formatTick(64_000, 1000), "1m 04s");
  assert.equal(formatTick(64_250, 100), "1m 04.3s");
});
