// A shortcut sheet on "?".
//
// The timeline already had keyboard control, and the runs list has just gained
// it, but neither announced itself - a shortcut nobody can discover is a
// shortcut nobody has. The convention this audience already knows is "?", so
// that is the key, and the sheet lists what actually exists rather than what
// would look impressive.

import { useEffect, useState } from "react";
import InstrumentPanel from "./InstrumentPanel";

const SHORTCUTS: ReadonlyArray<{ group: string; items: [string, string][] }> = [
  {
    group: "Anywhere",
    items: [
      ["/", "Filter runs"],
      ["?", "Open this sheet"],
      ["Esc", "Close this sheet, or clear the filter"],
    ],
  },
  {
    group: "On a run timeline",
    items: [
      ["Click / drag", "Move the playhead"],
      ["Left / Right", "Step to the previous or next event"],
      ["Enter", "Inspect the event under the playhead"],
      ["Space", "Play or pause"],
    ],
  },
];

export default function ShortcutOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;
      if (event.key === "?" && !typing) {
        event.preventDefault();
        setOpen((current) => !current);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!open) {
    return null;
  }

  return (
    // Deliberately not a focus-trapping modal: nothing here is interactive, so
    // trapping focus would take control away without giving anything back. It
    // dismisses on Escape and on click, and the page underneath stays usable.
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Keyboard shortcuts"
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-deep/80 p-6"
    >
      <InstrumentPanel className="w-full max-w-lg p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-mono text-micro uppercase text-steel">Keyboard</h2>
          <span className="font-mono text-sm text-steel-dim">Esc to close</span>
        </div>
        <div className="mt-5 space-y-6">
          {SHORTCUTS.map((section) => (
            <div key={section.group}>
              <h3 className="font-mono text-micro uppercase text-signal">{section.group}</h3>
              <dl className="mt-3 space-y-2">
                {section.items.map(([key, description]) => (
                  <div key={key} className="flex items-baseline gap-4">
                    <dt className="w-32 shrink-0">
                      <kbd className="rounded-sm bg-glass px-2 py-1 font-mono text-sm text-ink shadow-glass">
                        {key}
                      </kbd>
                    </dt>
                    <dd className="text-base text-ink-muted">{description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </InstrumentPanel>
    </div>
  );
}
