import { useEffect, useRef, useState } from "react";
import { sectionProgress } from "../lib/scrollTape";

/**
 * Tracks how far a pinned section has been scrubbed, 0..1.
 *
 * Reads layout inside a requestAnimationFrame rather than in the scroll
 * handler itself: getBoundingClientRect() forces a synchronous layout, and
 * doing that on every scroll event (which can fire many times per frame) is
 * the classic way to make a scroll-driven effect stutter. One read per frame,
 * at most.
 *
 * prefers-reduced-motion is not optional here the way it is for a CSS
 * transition: index.css's global rule zeroes animation/transition durations,
 * but this hook drives a pinned scroll-jacking hero through imperative style
 * mutation on every scroll frame, which that rule cannot see or stop. Anyone
 * who has asked their OS not to move things at them gets progress fixed at 0
 * and no scroll/resize listeners at all - the caller is expected to render a
 * normal, non-pinned block in that case (see FlightDeck).
 */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);
  const frameRef = useRef<number>();
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    function measure() {
      frameRef.current = undefined;
      const node = ref.current;
      if (!node) {
        return;
      }
      const rect = node.getBoundingClientRect();
      setProgress(sectionProgress(rect.top, rect.height, window.innerHeight));
    }

    function schedule() {
      if (frameRef.current === undefined) {
        frameRef.current = requestAnimationFrame(measure);
      }
    }

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frameRef.current !== undefined) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [prefersReducedMotion]);

  return { ref, progress, prefersReducedMotion };
}
