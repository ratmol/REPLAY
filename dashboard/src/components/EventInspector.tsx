import { useEffect, useState } from "react";
import { isTruncatedPayload, type EventRecord } from "replay-shared";
import type { TimelineItem } from "../lib/pairing";

interface EventInspectorProps {
  item: TimelineItem | null;
  onClose: () => void;
}

export default function EventInspector({ item, onClose }: EventInspectorProps) {
  if (item === null) {
    return (
      <div className="rounded border border-border bg-surface-raised p-4">
        <p className="font-mono text-xs text-ink-faint">
          Select an event on the timeline to inspect it.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded border border-border bg-surface-raised p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-xs uppercase tracking-wide text-ink-muted">Inspector</h3>
        <button
          type="button"
          className="font-mono text-xs text-ink-faint hover:text-ink"
          onClick={onClose}
        >
          close
        </button>
      </div>
      {item.kind === "point" ? (
        <EventCard key={item.event.seq} event={item.event} />
      ) : (
        <div className="flex flex-col gap-4">
          <EventCard key={item.start.seq} event={item.start} />
          <EventCard key={item.end.seq} event={item.end} />
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: EventRecord }) {
  const [copied, setCopied] = useState(false);
  const truncated = isTruncatedPayload(event.payload) ? event.payload : null;

  // Auto-reset through an effect, not a bare setTimeout in the click handler:
  // this component is keyed by seq (see EventInspector above) so it remounts
  // on selection change, but a bare setTimeout would still fire its callback
  // against a torn-down instance after that remount. The effect's cleanup
  // cancels it instead.
  useEffect(() => {
    if (!copied) {
      return;
    }
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(event.payload, null, 2));
      setCopied(true);
    } catch {
      // Clipboard access can fail (denied permission, insecure context) - this
      // is a convenience feature, not core functionality, so it fails silently
      // rather than surfacing an error state for something the user can just
      // select-and-copy from the <pre> block themselves.
    }
  }

  return (
    <div className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-xs text-ink">{event.type}</span>
        <span className="font-mono text-xs text-ink-faint">seq {event.seq}</span>
        <span className="font-mono text-xs text-ink-faint">{event.timestamp}</span>
        {event.durationMs !== undefined && (
          <span className="font-mono text-xs text-ink-faint">{event.durationMs}ms</span>
        )}
        {event.tokensIn !== undefined && (
          <span className="font-mono text-xs text-ink-faint">in {event.tokensIn}tok</span>
        )}
        {event.tokensOut !== undefined && (
          <span className="font-mono text-xs text-ink-faint">out {event.tokensOut}tok</span>
        )}
        {event.costUsd !== undefined && (
          <span className="font-mono text-xs text-ink-faint">${event.costUsd.toFixed(4)}</span>
        )}
        {truncated && (
          <span
            className="rounded border border-status-failed px-1.5 py-0.5 font-mono text-[10px] uppercase text-status-failed"
            title={`Original payload was ${truncated._originalBytes} bytes, over the 50KB limit`}
          >
            truncated
          </span>
        )}
      </div>
      <div className="relative">
        <pre className="max-h-64 overflow-auto rounded bg-surface p-2 font-mono text-xs text-ink-muted">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
        <button
          type="button"
          className="absolute right-2 top-2 rounded border border-border bg-surface-raised px-2 py-0.5 font-mono text-[10px] text-ink-muted hover:text-ink"
          onClick={handleCopy}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
    </div>
  );
}
