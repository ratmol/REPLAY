import { useEffect, useState } from "react";
import { isTruncatedPayload, type EventRecord } from "replay-shared";
import { itemStartSeq, type TimelineItem } from "../lib/pairing";
import InstrumentPanel from "./InstrumentPanel";
import { EVENT_CATEGORY, EVENT_TEXT } from "../lib/eventColor";

/**
 * Copies text, reporting whether it worked. Clipboard access legitimately
 * fails on an insecure origin or with the permission denied, and both callers
 * treat that as "no confirmation shown" rather than as an error worth
 * interrupting anyone over - the payload is selectable text either way.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

interface EventInspectorProps {
  item: TimelineItem | null;
  onClose: () => void;
}

export default function EventInspector({ item, onClose }: EventInspectorProps) {
  if (item === null) {
    return (
      <InstrumentPanel className="p-4">
        <p className="font-mono text-sm text-steel">
          Select an event on the timeline to inspect it.
        </p>
      </InstrumentPanel>
    );
  }

  return (
    <InstrumentPanel className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-mono text-micro uppercase text-steel">Inspector</h3>
        <div className="flex items-center gap-3">
          <ShareLinkButton seq={itemStartSeq(item)} />
          <button
            type="button"
            className="font-mono text-sm text-steel hover:text-ink"
            onClick={onClose}
          >
            close
          </button>
        </div>
      </div>
      {item.kind === "point" ? (
        <EventCard key={item.event.seq} event={item.event} />
      ) : (
        <div className="flex flex-col gap-4">
          <EventCard key={item.start.seq} event={item.start} />
          <EventCard key={item.end.seq} event={item.end} />
        </div>
      )}
    </InstrumentPanel>
  );
}

/**
 * Copies a link to this exact event. The whole point of recording a run is
 * being able to hand someone the step that broke; without this you can only
 * tell them "open the run and look around seq 7".
 *
 * The URL is rebuilt from the current location rather than read from it,
 * because the address bar may still be one render behind the selection that
 * triggered this.
 */
function ShareLinkButton({ seq }: { seq: number }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  async function handleClick() {
    const url = new URL(window.location.href);
    url.searchParams.set("seq", String(seq));
    setCopied(await copyText(url.toString()));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="font-mono text-sm text-steel hover:text-signal"
      title="Copy a link to this event"
    >
      {copied ? "link copied" : "copy link"}
    </button>
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
    setCopied(await copyText(JSON.stringify(event.payload, null, 2)));
  }

  return (
    <div className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`font-mono text-base ${EVENT_TEXT[EVENT_CATEGORY[event.type]]}`}>
          {event.type}
        </span>
        <span className="font-mono text-sm text-steel">seq {event.seq}</span>
        <span className="font-mono text-sm text-steel">{event.timestamp}</span>
        {event.durationMs !== undefined && (
          <span className="font-mono text-sm text-steel">{event.durationMs}ms</span>
        )}
        {event.tokensIn !== undefined && (
          <span className="font-mono text-sm text-steel">in {event.tokensIn}tok</span>
        )}
        {event.tokensOut !== undefined && (
          <span className="font-mono text-sm text-steel">out {event.tokensOut}tok</span>
        )}
        {event.costUsd !== undefined && (
          <span className="font-mono text-sm text-steel">${event.costUsd.toFixed(4)}</span>
        )}
        {truncated && (
          <span
            className="rounded border border-status-failed px-1.5 py-0.5 font-mono text-micro uppercase text-status-failed"
            title={`Original payload was ${truncated._originalBytes} bytes, over the 50KB limit`}
          >
            truncated
          </span>
        )}
      </div>
      <div className="relative">
        <pre className="max-h-64 overflow-auto rounded-sm bg-glass p-3 font-mono text-sm text-ink-muted shadow-glass">
          {JSON.stringify(event.payload, null, 2)}
        </pre>
        <button
          type="button"
          className="absolute right-2 top-2 rounded-sm border border-steel-deep bg-surface px-2 py-0.5 font-mono text-xs text-steel hover:text-ink"
          onClick={handleCopy}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
    </div>
  );
}
