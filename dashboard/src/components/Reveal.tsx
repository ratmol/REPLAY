// A single, restrained scroll animation, used in a few places rather than on
// everything. The brief is "necessary but won't annoy": one rise-and-fade as a
// block first enters the viewport, transform and opacity only so it stays on
// the compositor, and it never re-hides on the way back up - a section that
// re-animates every time it scrolls past reads as a glitch, not as polish.
//
// Honours prefers-reduced-motion through the global rule in index.css, which
// zeroes the transition duration, so this resolves to an instant show.

import type { ReactNode } from "react";
import { useInView } from "../hooks/useInView";

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger, in ms, for revealing a row of siblings one after another. */
  delayMs?: number;
}

export default function Reveal({ children, className, delayMs = 0 }: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-700 ease-out ${className ?? ""}`}
      style={{
        transitionDelay: inView ? `${delayMs}ms` : "0ms",
        opacity: inView ? 1 : 0,
        transform: inView ? "none" : "translateY(20px)",
      }}
    >
      {children}
    </div>
  );
}
