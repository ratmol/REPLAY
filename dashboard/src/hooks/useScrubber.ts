// Scrubber state: current playhead position, playback, and stepping between
// events. Lifted out of Timeline (not owned by it) so a future event
// inspector can read the same "what's currently selected" state without
// restructuring - both would otherwise need it independently.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventRecord } from "replay-shared";

const SPEED_LEVELS = [0.5, 1, 2, 4, 8];
const DEFAULT_SPEED_INDEX = 1; // 1x

export interface Scrubber {
  currentMs: number;
  minMs: number;
  maxMs: number;
  isPlaying: boolean;
  speed: number;
  speedIndex: number;
  seek: (ms: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  togglePlay: () => void;
  setSpeedIndex: (index: number) => void;
}

export const SCRUBBER_SPEED_LEVELS = SPEED_LEVELS;

// Pure and separated from the hook on purpose: this is the one piece of
// scrubber logic with real edge cases (no next/previous, exact-match
// boundaries, an empty list, duplicate timestamps) worth testing directly,
// without needing a React-hook-testing dependency to exercise the rest of
// useScrubber.
//
// Steps by array index (seq order), not by comparing distinct timestamp
// values. Agent events routinely land in the same millisecond (a tool_call
// and its retry can both stamp the same ms), and "the next time strictly
// greater than this one" skips every duplicate but the last - the second of
// two same-millisecond events could never be stepped onto. indexOf finds
// the earliest occurrence of the current position and returns the entry one
// index later in seq order, whether or not its value actually differs.
export function findNextTime(sortedTimes: number[], afterMs: number): number | undefined {
  const index = sortedTimes.indexOf(afterMs);
  if (index !== -1) {
    return sortedTimes[index + 1];
  }
  // No exact match (e.g. after a drag-seek that landed between events):
  // fall back to the first time strictly after the given position.
  return sortedTimes.find((t) => t > afterMs);
}

export function findPreviousTime(sortedTimes: number[], beforeMs: number): number | undefined {
  // Symmetric with findNextTime: lastIndexOf finds the latest occurrence of
  // the current position, so stepping backward off of it always lands on
  // the entry one index earlier, including a duplicate-timestamp neighbor.
  const index = sortedTimes.lastIndexOf(beforeMs);
  if (index !== -1) {
    return index > 0 ? sortedTimes[index - 1] : undefined;
  }
  let prev: number | undefined;
  for (const t of sortedTimes) {
    if (t >= beforeMs) {
      break;
    }
    prev = t;
  }
  return prev;
}

export function useScrubber(events: EventRecord[]): Scrubber {
  const sortedTimes = useMemo(
    () => events.map((e) => new Date(e.timestamp).getTime()).sort((a, b) => a - b),
    [events],
  );
  const minMs = sortedTimes[0] ?? 0;
  const maxMs = sortedTimes[sortedTimes.length - 1] ?? 0;

  const [currentMs, setCurrentMs] = useState(minMs);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(DEFAULT_SPEED_INDEX);

  // A different run's events (e.g. after navigating from one run detail page
  // to another without unmounting this hook's owner) must reset the
  // playhead - otherwise it stays wherever it was for the previous run.
  useEffect(() => {
    setCurrentMs(minMs);
    setIsPlaying(false);
  }, [minMs, maxMs]);

  const clamp = useCallback((ms: number) => Math.min(maxMs, Math.max(minMs, ms)), [minMs, maxMs]);

  const seek = useCallback(
    (ms: number) => {
      setCurrentMs(clamp(ms));
    },
    [clamp],
  );

  const rafRef = useRef<number>();
  const lastFrameRef = useRef<number>();
  // Mirrors currentMs so the rAF loop can read the latest position without
  // depending on it - adding currentMs to the effect below would tear down
  // and restart requestAnimationFrame (resetting lastFrameRef) on every
  // frame it itself just produced.
  const currentMsRef = useRef(currentMs);
  useEffect(() => {
    currentMsRef.current = currentMs;
  }, [currentMs]);

  useEffect(() => {
    if (!isPlaying) {
      lastFrameRef.current = undefined;
      return;
    }
    const tick = (time: number) => {
      if (lastFrameRef.current !== undefined) {
        const deltaMs = time - lastFrameRef.current;
        const next = currentMsRef.current + deltaMs * SPEED_LEVELS[speedIndex]!;
        // Stopping playback here, in the tick itself, rather than from
        // inside a setCurrentMs updater: an updater is supposed to be a
        // pure function of its previous value, and calling setIsPlaying as
        // a side effect of one is exactly what StrictMode's double-invoke
        // is designed to catch. Reading the previous position off a ref
        // instead of the updater's `prev` argument is what makes that
        // possible - the ref is ours to read from anywhere in the tick, not
        // just inside the updater callback.
        if (next >= maxMs) {
          currentMsRef.current = maxMs;
          setCurrentMs(maxMs);
          setIsPlaying(false);
        } else {
          currentMsRef.current = next;
          setCurrentMs(next);
        }
      }
      lastFrameRef.current = time;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isPlaying, speedIndex, maxMs]);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      if (!prev && currentMs >= maxMs) {
        // Replaying after reaching the end starts over, rather than doing
        // nothing (the play button would otherwise look broken at the end).
        setCurrentMs(minMs);
      }
      return !prev;
    });
  }, [currentMs, maxMs, minMs]);

  const stepForward = useCallback(() => {
    setCurrentMs(findNextTime(sortedTimes, currentMs) ?? maxMs);
  }, [sortedTimes, currentMs, maxMs]);

  const stepBackward = useCallback(() => {
    setCurrentMs(findPreviousTime(sortedTimes, currentMs) ?? minMs);
  }, [sortedTimes, currentMs, minMs]);

  return {
    currentMs,
    minMs,
    maxMs,
    isPlaying,
    speed: SPEED_LEVELS[speedIndex]!,
    speedIndex,
    seek,
    stepForward,
    stepBackward,
    togglePlay,
    setSpeedIndex,
  };
}
