// Derives trust-boundary crossings from a run's events. The rule is
// authoritative and documented, not a rendering choice - docs/EVENT_SCHEMA.md
// section 8: "A source at seq S and a sink at seq K in the same run where
// K > S. That is the entire rule."
//
// Ordered by seq, never by timestamp: seq is the run's ordering key, and a
// clock skew of a few milliseconds must not be able to flip whether untrusted
// content was already in context when an action fired.

import type { EventRecord } from "replay-shared";

export interface SinkReach {
  sink: EventRecord;
  /**
   * How many sources have a lower seq than this sink. Stored as a count, not
   * a list: the sources before a sink are always a prefix of the seq-sorted
   * `sources` array, so `sources.slice(0, sourcesBefore)` recovers them.
   * Copying that prefix per sink would be sources x sinks memory for a run
   * that fetches and acts in a loop; a count keeps the whole result linear.
   */
  sourcesBefore: number;
}

export interface TrustPaths {
  /** Every `source` event, ascending by seq. */
  sources: EventRecord[];
  /** Every `sink` event, ascending by seq, crossed or not. */
  sinks: SinkReach[];
}

export function trustPaths(events: EventRecord[]): TrustPaths {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const sources: EventRecord[] = [];
  const sinks: SinkReach[] = [];

  // One pass: by the time a sink is reached, `sources` holds exactly the
  // sources with a lower seq, so its length is the answer.
  for (const event of sorted) {
    if (event.trust === "source") {
      sources.push(event);
    } else if (event.trust === "sink") {
      sinks.push({ sink: event, sourcesBefore: sources.length });
    }
  }

  return { sources, sinks };
}

/** True when at least one untrusted source preceded this sink. */
export function hasCrossed(reach: SinkReach): boolean {
  return reach.sourcesBefore > 0;
}

/**
 * The most recent source before a sink - the one the timeline draws its arc
 * from - or null if the sink never crossed a boundary.
 *
 * Nearest rather than earliest because each sink gets exactly one arc, and
 * the shortest one is the least likely to sweep over unrelated parts of the
 * run. The cost is that the arc names only one source; the inspector lists
 * all of them, so the full answer is one click away.
 */
export function nearestSource(paths: TrustPaths, reach: SinkReach): EventRecord | null {
  return reach.sourcesBefore > 0 ? paths.sources[reach.sourcesBefore - 1]! : null;
}

/** Every source that preceded a sink, oldest first. */
export function sourcesBefore(paths: TrustPaths, reach: SinkReach): EventRecord[] {
  return paths.sources.slice(0, reach.sourcesBefore);
}
