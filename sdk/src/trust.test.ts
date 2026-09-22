import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTrust } from "./trust.js";

test("classifies a fetch tool's result as a source", () => {
  assert.equal(classifyTrust("tool_result", { toolName: "web_fetch" }), "source");
});

test("classifies a send tool's call as a sink", () => {
  assert.equal(classifyTrust("tool_call", { toolName: "send_email" }), "sink");
});

test("matches camelCase and SCREAMING names the same as snake_case", () => {
  assert.equal(classifyTrust("tool_call", { toolName: "sendEmail" }), "sink");
  assert.equal(classifyTrust("tool_result", { toolName: "HTTPGet" }), "source");
  assert.equal(classifyTrust("tool_result", { toolName: "WebSearch" }), "source");
});

// The event type, not the tool name, decides which end of the boundary this is.
// A tool that both reads and acts produces one of each, rather than one
// classification having to out-vote the other.
test("splits a read-and-act tool across its call and its result", () => {
  assert.equal(classifyTrust("tool_call", { toolName: "fetch_and_send" }), "sink");
  assert.equal(classifyTrust("tool_result", { toolName: "fetch_and_send" }), "source");
});

test("does not classify a fetch as a sink, or a send as a source", () => {
  assert.equal(classifyTrust("tool_call", { toolName: "web_fetch" }), undefined);
  assert.equal(classifyTrust("tool_result", { toolName: "send_email" }), undefined);
});

// Whole-token matching is the point: substring matching would read "rewrite"
// as "write" and flag a harmless summariser as a consequential action. A false
// positive is how a security feature loses a user's trust permanently.
test("matches whole tokens, not substrings", () => {
  assert.equal(classifyTrust("tool_call", { toolName: "rewrite_summary" }), undefined);
  assert.equal(classifyTrust("tool_call", { toolName: "broadcast_check" }), undefined);
  assert.equal(classifyTrust("tool_result", { toolName: "spreadsheet_open" }), undefined);
});

test("leaves non-tool events unclassified", () => {
  for (const type of ["run_start", "llm_call", "llm_response", "error", "run_end"] as const) {
    assert.equal(classifyTrust(type, { toolName: "send_email" }), undefined);
  }
});

test("leaves an unnamed or oddly typed tool unclassified", () => {
  assert.equal(classifyTrust("tool_call", {}), undefined);
  assert.equal(classifyTrust("tool_call", { toolName: 42 }), undefined);
  assert.equal(classifyTrust("tool_call", { toolName: "" }), undefined);
  assert.equal(classifyTrust("tool_result", { toolName: "summarize" }), undefined);
});
