// Turns a flat event list into timeline items: spans for paired events,
// points for everything else. The pairing rule itself is authoritative and
// documented, not a rendering choice - docs/EVENT_SCHEMA.md section 3:
// "tool_call/tool_result pair on callId. llm_call/llm_response pair on
// adjacency... Unpaired events render as points, which is itself a useful
// debugging signal (a tool_call with no tool_result is visibly a hang)."

import type { EventRecord, EventType } from "replay-shared";

export type TimelineItem =
  | { kind: "span"; type: EventType; start: EventRecord; end: EventRecord }
  | { kind: "point"; type: EventType; event: EventRecord };

function itemSeq(item: TimelineItem): number {
  return item.kind === "span" ? item.start.seq : item.event.seq;
}

export function pairEvents(events: EventRecord[]): TimelineItem[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const usedSeqs = new Set<number>();
  const items: TimelineItem[] = [];

  // tool_call / tool_result pair by callId. A Map handles calls that are
  // opened out of strict adjacency (call A, call B, result B, result A is
  // valid - concurrent tool calls aren't unusual).
  const pendingToolCalls = new Map<string, EventRecord>();
  for (const event of sorted) {
    if (event.type === "tool_call") {
      const callId = event.payload["callId"];
      if (typeof callId === "string") {
        pendingToolCalls.set(callId, event);
      }
    } else if (event.type === "tool_result") {
      const callId = event.payload["callId"];
      const start = typeof callId === "string" ? pendingToolCalls.get(callId) : undefined;
      if (start) {
        pendingToolCalls.delete(callId as string);
        items.push({ kind: "span", type: "tool_call", start, end: event });
        usedSeqs.add(start.seq);
        usedSeqs.add(event.seq);
      }
    }
  }

  // llm_call / llm_response pair only when directly adjacent in seq order.
  for (let i = 0; i < sorted.length; i += 1) {
    const event = sorted[i]!;
    if (usedSeqs.has(event.seq) || event.type !== "llm_call") {
      continue;
    }
    const next = sorted[i + 1];
    if (next?.type === "llm_response") {
      items.push({ kind: "span", type: "llm_call", start: event, end: next });
      usedSeqs.add(event.seq);
      usedSeqs.add(next.seq);
    }
  }

  // Everything left unmatched - including a tool_call with no result, a
  // tool_result with no matching call, or a lone llm_response - is a point.
  for (const event of sorted) {
    if (!usedSeqs.has(event.seq)) {
      items.push({ kind: "point", type: event.type, event });
    }
  }

  return items.sort((a, b) => itemSeq(a) - itemSeq(b));
}
