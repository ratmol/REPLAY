import { useEffect, useRef, useState } from "react";

/**
 * The measured content width of an element, in CSS pixels.
 *
 * Uses ResizeObserver rather than a window resize listener because the
 * timeline's container also changes width when the event inspector opens and
 * closes beside it, which no window event reports. Falls back to a fixed
 * width where ResizeObserver is unavailable, so the timeline still renders at
 * a sane scale instead of collapsing to zero.
 */
export function useElementWidth<T extends HTMLElement>(fallbackPx: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallbackPx);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0;
      if (measured > 0) {
        setWidth(measured);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}
