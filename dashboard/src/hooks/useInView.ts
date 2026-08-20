import { useEffect, useRef, useState } from "react";

/**
 * True once the element has entered the viewport, and it stays true - a
 * section that re-hides and re-reveals as you scroll back up reads as a
 * glitch, not as choreography.
 */
export function useInView<T extends HTMLElement>(rootMargin = "-12% 0px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    // The revealed content starts at opacity 0, so a browser without
    // IntersectionObserver would hide the section permanently rather than
    // just skipping the animation. Progressive enhancement, not a hard
    // dependency: no observer means the content is simply already there.
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, inView };
}
