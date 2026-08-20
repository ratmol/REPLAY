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

// Structural equality for two TimelineItem values, used by Timeline to
// highlight the selected item and by RunDetailPage to toggle selection off on
// a second click. Compares by kind + underlying seq, not object identity:
// pairEvents() rebuilds the whole array (and its item objects) on every
// events-prop change, so `===` would silently break the highlight on any
// re-render even though "the same event" is still selected.
export function isSameTimelineItem(a: TimelineItem | null, b: TimelineItem | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.kind === b.kind && itemSeq(a) === itemSeq(b);
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

/**
 * The timeline item under a given wall-clock time, or null if there is none.
 *
 * Exists so the timeline can be inspected without a mouse: pressing Enter
 * selects whatever the playhead is currently sitting on. A span wins whenever
 * the time falls inside it; otherwise the nearest point within `toleranceMs`
 * is returned, because a point has no width and landing on its exact
 * millisecond by keyboard is not realistic.
 *
 * Ties go to the lower seq, so repeated presses at the same position are
 * stable rather than flickering between two events recorded in the same
 * millisecond.
 */
export function itemAtTime(
  items: TimelineItem[],
  ms: number,
  toleranceMs: number,
): TimelineItem | null {
  let nearestPoint: TimelineItem | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const item of items) {
    if (item.kind === "span") {
      const startMs = new Date(item.start.timestamp).getTime();
      const endMs = new Date(item.end.timestamp).getTime();
      if (ms >= startMs && ms <= endMs) {
        return item;
      }
      continue;
    }
    const distance = Math.abs(new Date(item.event.timestamp).getTime() - ms);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPoint = item;
    }
  }

  return nearestDistance <= toleranceMs ? nearestPoint : null;
}
