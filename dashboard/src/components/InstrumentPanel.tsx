// The framing device that carries the flight deck's instrument language into
// the rest of the page. Before this, only the hero looked like it belonged to
// a flight recorder - the runs table and the spec section were plain text on
// the same background as everything else, which is what makes a page read as
// one flashy component bolted onto generic boilerplate. A bordered panel with
// corner-bracket marks (the same reticle language the instrument strip's
// readouts imply) gives data/code artifacts the same object-hood the hero's
// readouts have, without touching prose - headlines and paragraphs stay free
// text, because putting a box around everything is its own kind of
// vibecode-y over-uniformity.

import type { ReactNode } from "react";

// No default padding: callers with edge-to-edge content (a table whose rows
// need their own horizontal padding, say) shouldn't have to fight an
// !important override to remove it. Pass p-5 md:p-6 in className for the
// common case of a panel wrapping prose/code directly.
export default function InstrumentPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    // The panel material: a machined face, not a card. shadow-panel is a 1px
    // inset top highlight plus a shallow drop - light from above, once. The
    // graticule is a 32px engineering grid at ~13% alpha, present enough to
    // read as a measured surface and faint enough to disappear behind data.
    <div
      className={`relative border border-steel-deep bg-surface bg-graticule bg-grid-32 shadow-panel ${className ?? ""}`}
    >
      <CornerBrackets />
      {children}
    </div>
  );
}

function CornerBrackets() {
  const corner = "absolute h-3 w-3 border-steel-dim";
  return (
    <span aria-hidden="true">
      <span className={`${corner} left-0 top-0 border-l border-t`} />
      <span className={`${corner} right-0 top-0 border-r border-t`} />
      <span className={`${corner} bottom-0 left-0 border-b border-l`} />
      <span className={`${corner} bottom-0 right-0 border-b border-r`} />
    </span>
  );
}
