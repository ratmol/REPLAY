import { test } from "node:test";
import assert from "node:assert/strict";
import { RingBuffer } from "./ring-buffer.js";

test("keeps items in order under capacity", () => {
  const buffer = new RingBuffer<number>(5);
  buffer.push(1);
  buffer.push(2);
  buffer.push(3);
  assert.deepEqual(buffer.toArray(), [1, 2, 3]);
  assert.equal(buffer.droppedCount, 0);
  assert.equal(buffer.size, 3);
});

test("drops the oldest item and keeps the newest N at capacity", () => {
  const buffer = new RingBuffer<number>(3);
  for (let i = 0; i < 5; i += 1) {
    buffer.push(i);
  }
  assert.deepEqual(buffer.toArray(), [2, 3, 4]);
  assert.equal(buffer.droppedCount, 2);
  assert.equal(buffer.size, 3);
});

test("continues counting drops past a single lap around the buffer", () => {
  const buffer = new RingBuffer<number>(2);
  for (let i = 0; i < 10; i += 1) {
    buffer.push(i);
  }
  assert.deepEqual(buffer.toArray(), [8, 9]);
  assert.equal(buffer.droppedCount, 8);
});

test("rejects a capacity below 1", () => {
  assert.throws(() => new RingBuffer<number>(0));
});

test("drain snapshots and clears in one call, without touching droppedCount", () => {
  const buffer = new RingBuffer<number>(3);
  buffer.push(1);
  buffer.push(2);
  buffer.push(3);
  buffer.push(4); // drops 1
  assert.deepEqual(buffer.drain(), [2, 3, 4]);
  assert.equal(buffer.size, 0);
  assert.deepEqual(buffer.toArray(), []);
  assert.equal(buffer.droppedCount, 1);
});

test("drain leaves the buffer usable for further pushes", () => {
  const buffer = new RingBuffer<number>(2);
  buffer.push(1);
  buffer.drain();
  buffer.push(2);
  buffer.push(3);
  assert.deepEqual(buffer.toArray(), [2, 3]);
});
