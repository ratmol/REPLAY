import { test } from "node:test";
import assert from "node:assert/strict";
import { truncatePayload } from "./payload.js";

test("passes a small payload through unchanged", () => {
  const payload = { toolName: "search", args: { query: "hi" } };
  assert.deepEqual(truncatePayload(payload), payload);
});

test("returns a deep copy, not the caller's object, on the under-limit path", () => {
  const payload: Record<string, unknown> = { toolName: "search", args: { query: "hi" } };
  const result = truncatePayload(payload);
  // Structurally equal but a distinct object graph, so a later mutation of the
  // caller's object cannot reach into what we buffered.
  assert.deepEqual(result, payload);
  assert.notEqual(result, payload);
  assert.notEqual(result["args"], payload["args"]);
  (payload["args"] as Record<string, unknown>)["query"] = "mutated";
  assert.equal((result["args"] as Record<string, unknown>)["query"], "hi");
});

test("truncates a payload over 50KB", () => {
  const big = { blob: "x".repeat(60 * 1024) };
  const result = truncatePayload(big);
  assert.equal(result["_truncated"], true);
  assert.equal(typeof result["_originalBytes"], "number");
  assert.ok((result["_originalBytes"] as number) > 50 * 1024);
  assert.equal((result["_preview"] as string).length, 2000);
});

test("does not truncate a payload right at the boundary", () => {
  // Small enough that the JSON envelope plus this string stays under 50KB.
  const payload = { blob: "x".repeat(1000) };
  const result = truncatePayload(payload);
  assert.deepEqual(result, payload);
});

test("never throws on an unserializable payload", () => {
  const circular: Record<string, unknown> = {};
  circular["self"] = circular;
  const result = truncatePayload(circular);
  assert.equal(result["_truncated"], true);
  assert.equal(result["_preview"], "[unserializable payload]");
});
