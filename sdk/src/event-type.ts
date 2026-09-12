// The nine-literal event type union, declared locally rather than imported.
//
// The shared schema package is the source of truth for this union (see its
// EVENT_TYPES array), and the SDK could type-import it with zero runtime
// cost - `import type` is erased at compile time either way. But an erased
// import still leaves a *type-level* reference behind: tsc emits it verbatim
// into this file's declaration output (e.g. `import type { EventType } from
// "the-shared-package"`), and that package is workspace-only, never
// published. Any consumer of the published SDK whose build resolves types
// (which is most TypeScript setups) would fail with "cannot find module" the
// moment it touched this type. Declaring the union locally keeps the SDK's
// public .d.ts self-contained - nothing it exports ever points outside the
// package. tests/guardrails.test.mjs asserts this list can never silently
// drift from the shared source of truth.
export type EventType =
  | "run_start"
  | "llm_call"
  | "llm_response"
  | "tool_call"
  | "tool_result"
  | "retry"
  | "error"
  | "agent_decision"
  | "run_end";
