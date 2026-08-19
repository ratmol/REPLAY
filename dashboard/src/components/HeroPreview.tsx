// A decorative preview built from real, live data - not a video, not a gif,
// not mocked JSON. It fetches one actual recorded run and (a) types out its
// real event payloads, (b) auto-scrubs a miniature of the real timeline.
// "Live" here means literally reading from the collector on every page load,
// same as the runs list below it.

import { useEffect, useMemo, useRef, useState } from "react";
import type { EventRecord } from "replay-shared";
import { fetchEvents } from "../api";
import { pairEvents } from "../lib/pairing";
import { charsVisible, pickPreviewEvents } from "../lib/heroPreview";

const TYPE_MS_PER_CHAR = 22;
const HOLD_MS = 1600;
const MINI_TIMELINE_VIEWBOX_WIDTH = 400;
const MINI_TIMELINE_HEIGHT = 28;

interface HeroPreviewProps {
  runId: string;
  runName: string;
}

export default function HeroPreview({ runId, runName }: HeroPreviewProps) {
  const [events, setEvents] = useState<EventRecord[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEvents(runId)
      .then((fetched) => {
        if (!cancelled) {
          setEvents(fetched);
        }
      })
      .catch(() => {
        // Decorative only - if this fails, the hero just doesn't render.
        // The real runs list below has its own real error handling.
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  if (!events || events.length === 0) {
    return null;
  }

  return (
    <div className="relative rounded-sm border border-border p-5">
      <CornerBrackets />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PipelineStrip />
        <LiveBadge />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <TypewriterPanel events={events} />
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
            Flight recorder tape - {runName}
          </p>
          <MiniTimeline events={events} />
        </div>
      </div>
    </div>
  );
}

function CornerBrackets() {
  const corner = "absolute h-2.5 w-2.5 border-phosphor-dim";
  return (
    <span aria-hidden="true">
      <span className={`${corner} left-0 top-0 border-l border-t`} />
      <span className={`${corner} right-0 top-0 border-r border-t`} />
      <span className={`${corner} bottom-0 left-0 border-b border-l`} />
      <span className={`${corner} bottom-0 right-0 border-b border-r`} />
    </span>
  );
}

function PipelineStrip() {
  const steps = ["agent", "sdk", "collector", "dashboard"];
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
      {steps.map((step, i) => (
        <span key={step} className="flex items-center gap-2">
          <span className={i === steps.length - 1 ? "text-phosphor" : ""}>{step}</span>
          {i < steps.length - 1 && <span aria-hidden="true">&rarr;</span>}
        </span>
      ))}
    </div>
  );
}

function LiveBadge() {
  return (
    <span className="flex items-center gap-1.5 rounded border border-status-running/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-status-running">
      <span
        className="h-1.5 w-1.5 rounded-full bg-status-running animate-loading-pulse"
        aria-hidden="true"
      />
      Live
    </span>
  );
}

function TypewriterPanel({ events }: { events: EventRecord[] }) {
  const previewEvents = useMemo(() => pickPreviewEvents(events, 3), [events]);
  const [index, setIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const current = previewEvents[index % previewEvents.length];
  const text = current ? `${current.type}\n${JSON.stringify(current.payload, null, 2)}` : "";
  const visibleCount = charsVisible(elapsedMs, TYPE_MS_PER_CHAR, text.length);
  const isDoneTyping = visibleCount >= text.length;

  // Restart the typing clock whenever the displayed event changes.
  useEffect(() => {
    setElapsedMs(0);
  }, [index]);

  useEffect(() => {
    const id = setInterval(() => setElapsedMs((prev) => prev + 40), 40);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!isDoneTyping) {
      return;
    }
    const id = setTimeout(() => {
      setIndex((prev) => (prev + 1) % previewEvents.length);
    }, HOLD_MS);
    return () => clearTimeout(id);
  }, [isDoneTyping, previewEvents.length]);

  return (
    <div>
      <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
        replay-sdk &middot; run.logEvent(...)
      </p>
      <pre className="h-32 overflow-hidden rounded bg-surface p-3 font-mono text-xs text-phosphor">
        {text.slice(0, visibleCount)}
        <span className="animate-loading-pulse" aria-hidden="true">
          &#9608;
        </span>
      </pre>
    </div>
  );
}

function MiniTimeline({ events }: { events: EventRecord[] }) {
  const sorted = useMemo(() => [...events].sort((a, b) => a.seq - b.seq), [events]);
  const items = useMemo(() => pairEvents(events), [events]);
  const startMs = new Date(sorted[0]!.timestamp).getTime();
  const endMs = new Date(sorted[sorted.length - 1]!.timestamp).getTime();
  // Real runs in the demo data are seconds long; a floor keeps a very short
  // run's sweep from looking instantaneous.
  const durationMs = Math.max(endMs - startMs, 1000);

  const [currentMs, setCurrentMs] = useState(0);
  const rafRef = useRef<number>();
  const lastFrameRef = useRef<number>();

  useEffect(() => {
    function tick(time: number) {
      if (lastFrameRef.current !== undefined) {
        const deltaMs = time - lastFrameRef.current;
        setCurrentMs((prev) => {
          const next = prev + deltaMs;
          return next >= durationMs ? 0 : next;
        });
      }
      lastFrameRef.current = time;
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current);
      }
      lastFrameRef.current = undefined;
    };
  }, [durationMs]);

  const pxPerMs = MINI_TIMELINE_VIEWBOX_WIDTH / durationMs;
  const toX = (timestamp: string) => (new Date(timestamp).getTime() - startMs) * pxPerMs;
  const playheadX = currentMs * pxPerMs;

  return (
    <svg
      viewBox={`0 0 ${MINI_TIMELINE_VIEWBOX_WIDTH} ${MINI_TIMELINE_HEIGHT}`}
      preserveAspectRatio="none"
      className="h-8 w-full rounded bg-surface"
      aria-hidden="true"
    >
      <line
        x1={0}
        y1={MINI_TIMELINE_HEIGHT / 2}
        x2={MINI_TIMELINE_VIEWBOX_WIDTH}
        y2={MINI_TIMELINE_HEIGHT / 2}
        className="stroke-border"
        strokeWidth={1}
      />
      {items.map((item) =>
        item.kind === "span" ? (
          <rect
            key={`span-${item.start.seq}`}
            x={toX(item.start.timestamp)}
            y={MINI_TIMELINE_HEIGHT / 2 - 3}
            width={Math.max(toX(item.end.timestamp) - toX(item.start.timestamp), 2)}
            height={6}
            className="fill-phosphor-dim"
          />
        ) : (
          <circle
            key={`point-${item.event.seq}`}
            cx={toX(item.event.timestamp)}
            cy={MINI_TIMELINE_HEIGHT / 2}
            r={2.5}
            className="fill-phosphor-dim"
          />
        ),
      )}
      <line
        x1={playheadX}
        y1={0}
        x2={playheadX}
        y2={MINI_TIMELINE_HEIGHT}
        className="stroke-phosphor"
        strokeWidth={1}
      />
    </svg>
  );
}
