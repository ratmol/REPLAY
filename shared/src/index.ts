// replay-shared - the wire contract between the SDK, collector, and dashboard.
//
// TODO: implement the Zod schemas specified in docs/EVENT_SCHEMA.md. That
// document is authoritative. If the design is wrong, change the doc first and
// say why, then change the code.
//
// Import rules, which are load-bearing:
//   - collector and dashboard may import values (runtime Zod parsing).
//   - the SDK may only use `import type { ... } from "replay-shared"`. Type-only
//     imports are erased at compile time, which is how the SDK keeps zero
//     runtime dependencies while still sharing one source of truth for shapes.
//
// Everything below is a placeholder so the workspace typechecks. Replace it.

export const REPLAY_SCHEMA_VERSION = "0.1.0";

/** Closed set of v1 event types. See docs/EVENT_SCHEMA.md section 3. */
export const EVENT_TYPES = [
  "run_start",
  "llm_call",
  "llm_response",
  "tool_call",
  "tool_result",
  "retry",
  "error",
  "agent_decision",
  "run_end",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
