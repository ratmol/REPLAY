// A lit numeric display: engraved label above, glass panel below. This is the
// theme's one repeated object - the flight deck, the cost panel and the run
// header all show "a measured quantity" and all showed it differently before,
// each inventing its own label-plus-number stack.
//
// The tone argument is what keeps the palette functional rather than
// decorative: a value is coloured by what it means (in progress, settled,
// faulted, or the thing you are currently driving), never for variety.

import type { ReactNode } from "react";

export type ReadoutTone = "ink" | "signal" | "running" | "completed" | "failed";

const TONE_CLASS: Record<ReadoutTone, string> = {
  ink: "text-ink",
  signal: "text-signal",
  running: "text-status-running",
  completed: "text-status-completed",
  failed: "text-status-failed",
};

interface ReadoutProps {
  label: string;
  children: ReactNode;
  tone?: ReadoutTone;
  size?: "sm" | "md" | "lg";
  align?: "left" | "right";
}

const SIZE_CLASS = {
  sm: "text-base",
  md: "text-readout",
  lg: "text-readout-lg",
} as const;

export default function Readout({
  label,
  children,
  tone = "ink",
  size = "md",
  align = "left",
}: ReadoutProps) {
  return (
    <div className={align === "right" ? "text-right" : undefined}>
      <p className="font-mono text-micro uppercase text-steel">{label}</p>
      <p
        className={`mt-1.5 rounded-sm bg-glass px-2.5 py-1.5 font-mono shadow-glass ${SIZE_CLASS[size]} ${TONE_CLASS[tone]}`}
      >
        {children}
      </p>
    </div>
  );
}
