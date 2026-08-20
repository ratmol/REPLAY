// Pure derivation of a per-step, cumulative cost series from a run's events -
// feeds CostPanel's sparkline and per-step list. Kept separate from the
// component so the math is unit-testable without rendering anything, same
// split as pairing.ts and useScrubber.ts's pure helpers.

import type { EventRecord } from "replay-shared";

export interface CostStep {
  seq: number;
  type: EventRecord["type"];
  elapsedMs: number;
  costUsd: number;
  cumulativeCostUsd: number;
  tokensIn?: number;
  tokensOut?: number;
}

/**
 * Only events that actually report cost or token data become a step - most
 * event types (tool_call, retry, run_start, ...) never carry these optional
 * fields, and counting them as zero-cost steps would flatten the sparkline
 * and pad the per-step list with rows that say nothing.
 *
 * `startMs` is passed in rather than derived from `events[0]` here, so the
 * caller can share the same time origin as the timeline's own x-axis
 * (Timeline.tsx uses `events[0].timestamp` too, but that's the caller's
 * choice to make once, not this function's to assume).
 */
export function buildCostSteps(events: EventRecord[], startMs: number): CostStep[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  let cumulative = 0;
  const steps: CostStep[] = [];
  for (const event of sorted) {
    if (
      event.costUsd === undefined &&
      event.tokensIn === undefined &&
      event.tokensOut === undefined
    ) {
      continue;
    }
    cumulative += event.costUsd ?? 0;
    steps.push({
      seq: event.seq,
      type: event.type,
      elapsedMs: new Date(event.timestamp).getTime() - startMs,
      costUsd: event.costUsd ?? 0,
      cumulativeCostUsd: cumulative,
      tokensIn: event.tokensIn,
      tokensOut: event.tokensOut,
    });
  }
  return steps;
}
