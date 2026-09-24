import type { ReactNode } from "react";

// A quiet explanatory note, for things a first-time visitor would otherwise
// misread. Brass, not a status colour: this is a label explaining the data,
// not an outcome, and amber or crimson here would read as a warning about
// the dashboard itself.
export default function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div
      role="note"
      className="rounded-sm border-l-2 border-brass-dim bg-surface-raised px-4 py-3 font-mono text-sm leading-relaxed text-ink-muted"
    >
      {children}
    </div>
  );
}
