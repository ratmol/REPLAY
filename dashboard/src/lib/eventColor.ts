// One colour language for every surface that draws events - the run detail
// timeline and the landing page's tape. Previously the tape used its own
// palette, which meant the first thing a visitor learned on the landing page
// had to be unlearned the moment they opened a run.
//
// The accent is deliberately absent here. `signal` means "the playhead" and
// nothing else; if an event shape could also be orange, the one mark that
// tells you where you are stops being findable at a glance.

import type { EventType } from "replay-shared";

export const EVENT_FILL: Record<EventType, string> = {
  run_start: "fill-ink-muted",
  llm_call: "fill-status-completed",
  llm_response: "fill-status-completed",
  tool_call: "fill-status-running",
  tool_result: "fill-status-running",
  retry: "fill-status-failed",
  error: "fill-status-failed",
  agent_decision: "fill-ink-muted",
  run_end: "fill-ink-muted",
};

export const EVENT_LEGEND: ReadonlyArray<{ label: string; className: string }> = [
  { label: "model", className: "bg-status-completed" },
  { label: "tool", className: "bg-status-running" },
  { label: "retry / error", className: "bg-status-failed" },
  { label: "lifecycle", className: "bg-ink-muted" },
];
