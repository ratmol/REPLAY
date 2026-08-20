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

// The four things an agent run is actually made of. Grouping the nine event
// types into categories is what makes filtering usable: nobody wants to tick
// "llm_call" and "llm_response" separately to see model traffic.
export type EventCategory = "model" | "tool" | "fault" | "lifecycle";

export const EVENT_CATEGORY: Record<EventType, EventCategory> = {
  run_start: "lifecycle",
  llm_call: "model",
  llm_response: "model",
  tool_call: "tool",
  tool_result: "tool",
  retry: "fault",
  error: "fault",
  agent_decision: "lifecycle",
  run_end: "lifecycle",
};

// The same four categories as text colour, for the many places an event type
// is written as a word (run rows, the cost table, the inspector, the flight
// deck) rather than drawn as a mark. Colouring the word by what kind of event
// it is - model traffic teal, tool work amber, faults red - is most of what
// turns a wall of one-colour monospace into something you can skim.
export const EVENT_TEXT: Record<EventCategory, string> = {
  model: "text-status-completed",
  tool: "text-status-running",
  fault: "text-status-failed",
  lifecycle: "text-brass",
};

export const EVENT_LEGEND: ReadonlyArray<{
  category: EventCategory;
  label: string;
  className: string;
}> = [
  { category: "model", label: "model", className: "bg-status-completed" },
  { category: "tool", label: "tool", className: "bg-status-running" },
  { category: "fault", label: "retry / error", className: "bg-status-failed" },
  { category: "lifecycle", label: "lifecycle", className: "bg-ink-muted" },
];
