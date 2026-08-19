// Pure helpers for the hero preview's typewriter effect and event picking -
// kept separate and tested for the same reason pairing.ts/cost.ts are: the
// component itself just wires these to setInterval/requestAnimationFrame,
// but the math (how many characters are visible at a given elapsed time,
// which events are worth showing) is easy to get off-by-one on and cheap to
// verify directly.

import type { EventRecord } from "replay-shared";

// Types most likely to carry a payload worth reading - run_start/run_end
// payloads are usually sparse (metadata, status) and make a dull typewriter.
const PREVIEW_WORTHY_TYPES: ReadonlySet<EventRecord["type"]> = new Set([
  "llm_call",
  "llm_response",
  "tool_call",
  "tool_result",
]);

/**
 * Picks up to `max` events (in seq order) worth showing in the typewriter
 * panel. Falls back to whatever exists if nothing matches the preferred
 * types, so a run with only run_start/run_end still previews something
 * rather than showing nothing.
 */
export function pickPreviewEvents(events: EventRecord[], max: number): EventRecord[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const worthy = sorted.filter((e) => PREVIEW_WORTHY_TYPES.has(e.type));
  const pool = worthy.length > 0 ? worthy : sorted;
  return pool.slice(0, max);
}

/**
 * How many characters of `text` should be visible after `elapsedMs` of
 * typing at `msPerChar`. Clamped to [0, text.length] so a caller never has
 * to guard against overshooting the string.
 */
export function charsVisible(elapsedMs: number, msPerChar: number, textLength: number): number {
  if (msPerChar <= 0) {
    return textLength;
  }
  const chars = Math.floor(elapsedMs / msPerChar);
  return Math.min(Math.max(chars, 0), textLength);
}
