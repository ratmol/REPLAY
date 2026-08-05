import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { chunkArray, postJsonWithRetry } from "./transport.js";

function mockFetch(t: TestContext, responses: Array<{ ok: boolean } | "reject">): void {
  let call = 0;
  t.mock.method(globalThis, "fetch", async () => {
    const response = responses[Math.min(call, responses.length - 1)];
    call += 1;
    if (response === "reject") {
      throw new Error("simulated network failure");
    }
    return new Response(null, { status: response.ok ? 200 : 500 });
  });
}

test("postJsonWithRetry succeeds on the first attempt without a retry", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return new Response(null, { status: 200 });
  });
  const result = await postJsonWithRetry("http://localhost:4747/runs", { id: "1" });
  assert.equal(result, true);
  assert.equal(calls, 1);
});

test("postJsonWithRetry retries once after a network error, then succeeds", async (t) => {
  mockFetch(t, ["reject", { ok: true }]);
  const result = await postJsonWithRetry("http://localhost:4747/runs", { id: "1" });
  assert.equal(result, true);
});

test("postJsonWithRetry retries once after a non-2xx response, then succeeds", async (t) => {
  mockFetch(t, [{ ok: false }, { ok: true }]);
  const result = await postJsonWithRetry("http://localhost:4747/runs", { id: "1" });
  assert.equal(result, true);
});

test("postJsonWithRetry gives up after both attempts fail", async (t) => {
  mockFetch(t, ["reject", "reject"]);
  const result = await postJsonWithRetry("http://localhost:4747/runs", { id: "1" });
  assert.equal(result, false);
});

test("postJsonWithRetry makes at most 2 attempts total", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    throw new Error("simulated network failure");
  });
  await postJsonWithRetry("http://localhost:4747/runs", { id: "1" });
  assert.equal(calls, 2);
});

test("chunkArray splits into fixed-size chunks", () => {
  assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("chunkArray handles an exact multiple with no remainder chunk", () => {
  assert.deepEqual(chunkArray([1, 2, 3, 4], 2), [
    [1, 2],
    [3, 4],
  ]);
});

test("chunkArray returns an empty array for empty input", () => {
  assert.deepEqual(chunkArray([], 5), []);
});

test("chunkArray returns one chunk when size exceeds length", () => {
  assert.deepEqual(chunkArray([1, 2], 500), [[1, 2]]);
});
