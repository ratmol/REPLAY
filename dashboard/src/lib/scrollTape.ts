// Pure math behind the scroll-scrubbed hero tape. Same extract-and-test
// pattern as pairing.ts / cost.ts / heroPreview.ts: the component only wires
// these to a scroll listener and a transform, but "how far through the
// section are we" and "which event is under the playhead" are exactly the
// kind of clamp/off-by-one code that is cheap to verify directly and
// miserable to debug through the DOM.

import type { EventRecord } from "replay-shared";

/**
 * How far a pinned (position: sticky) section has been scrubbed, 0..1.
 *
 * `top` is the section's bounding-rect top: positive while it is still below
 * the fold, 0 the moment it pins, negative as it scrolls past. The scrubbable
 * distance is the section's own height minus one viewport, because the last
 * viewport-worth of the section is what stays pinned on screen.
 *
 * A section shorter than the viewport has no scrub distance at all; it
 * reports 0 rather than dividing by zero or a negative.
 */
export function sectionProgress(top: number, height: number, viewportHeight: number): number {
  const scrubbable = height - viewportHeight;
  if (scrubbable <= 0) {
    return 0;
  }
  return clamp01(-top / scrubbable);
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
}

/**
 * Index of the last event at or before `progress` through the run, where
 * progress is a fraction of wall-clock duration (not of event count - the
 * whole point of the tape is that gaps between events are visible).
 *
 * Returns 0 for an empty-ish edge rather than -1 so callers can index
 * directly; a zero-duration run (every event in the same millisecond) maps
 * to the last event, since the playhead has nowhere else to be.
 */
export function eventIndexAtProgress(sorted: EventRecord[], progress: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const startMs = new Date(sorted[0]!.timestamp).getTime();
  const endMs = new Date(sorted[sorted.length - 1]!.timestamp).getTime();
  const durationMs = endMs - startMs;
  if (durationMs <= 0) {
    return sorted.length - 1;
  }
  const targetMs = startMs + clamp01(progress) * durationMs;
  let index = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    if (new Date(sorted[i]!.timestamp).getTime() <= targetMs) {
      index = i;
    }
  }
  return index;
}

/** Tape-counter style timecode: mm:ss.cs, e.g. 1240ms -> "00:01.24". */
export function timecode(ms: number): string {
  const safe = Math.max(ms, 0);
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const centis = Math.floor((safe % 1000) / 10);
  return `${pad2(minutes)}:${pad2(seconds)}.${pad2(centis)}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
