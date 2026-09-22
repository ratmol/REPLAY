// Trust-boundary classification (docs/EVENT_SCHEMA.md section 8).
//
// Marks where untrusted content entered a run (`source`) and where a
// consequential action fired (`sink`), so the dashboard can show that a run
// crossed a trust boundary. This is visibility, not prevention: a classified
// event says "untrusted content was here", never "an injection happened".
//
// Declared locally rather than type-imported from the shared schema package,
// for exactly the reason event-type.ts explains: an erased `import type` still
// emits a type-level reference into the published .d.ts, and that package is
// workspace-only. tests/guardrails.test.mjs asserts this union cannot silently
// drift from the shared source of truth.
export type TrustRole = "source" | "sink";

import type { EventType } from "./event-type.js";

// Tokens that mean "content came from somewhere this agent does not control".
// Matched only against `tool_result`, i.e. the moment content actually arrives.
const SOURCE_TOKENS: ReadonlySet<string> = new Set([
  "browse",
  "browser",
  "crawl",
  "curl",
  "download",
  "feed",
  "fetch",
  "http",
  "https",
  "rag",
  "read",
  "retrieval",
  "retrieve",
  "rss",
  "scrape",
  "search",
  "url",
  "web",
  "wget",
]);

// Tokens that mean "this does something the user cannot take back". Matched
// only against `tool_call`, i.e. the moment the action is invoked.
const SINK_TOKENS: ReadonlySet<string> = new Set([
  "bash",
  "buy",
  "charge",
  "checkout",
  "commit",
  "delete",
  "deploy",
  "drop",
  "email",
  "eval",
  "exec",
  "execute",
  "insert",
  "mail",
  "notify",
  "order",
  "pay",
  "payment",
  "post",
  "publish",
  "purchase",
  "push",
  "refund",
  "remove",
  "send",
  "shell",
  "slack",
  "sms",
  "spawn",
  "transfer",
  "tweet",
  "update",
  "upload",
  "upsert",
  "webhook",
  "write",
]);

// Whole-token matching, not substring: "rewrite_summary" must not read as a
// write sink, and "broadcast" must not read as a cast. Splits on separators
// and on camelCase boundaries, so send_email, sendEmail and HTTPGet all
// tokenize the same way.
function tokenize(toolName: string): string[] {
  return toolName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/**
 * Best-effort role for an event, from its tool name. Returns undefined for
 * anything it cannot confidently classify, which is the overwhelming majority
 * of events - a noisy security default is worse than a quiet one, because the
 * first false positive is when a user stops believing the feature.
 *
 * The event type picks both the vocabulary and the role, which is what removes
 * the ambiguity a single tool name would otherwise carry: for a tool called
 * `fetch_and_send`, the `tool_call` is the sink and the `tool_result` is the
 * source, and neither has to out-vote the other.
 */
export function classifyTrust(
  type: EventType,
  payload: Record<string, unknown>,
): TrustRole | undefined {
  if (type !== "tool_call" && type !== "tool_result") {
    return undefined;
  }

  const toolName = payload["toolName"];
  if (typeof toolName !== "string") {
    return undefined;
  }

  const vocabulary = type === "tool_call" ? SINK_TOKENS : SOURCE_TOKENS;
  const role: TrustRole = type === "tool_call" ? "sink" : "source";

  return tokenize(toolName).some((token) => vocabulary.has(token)) ? role : undefined;
}
