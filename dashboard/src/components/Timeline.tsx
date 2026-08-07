import { useState } from "react";
import type { EventRecord, EventType } from "replay-shared";
import { pairEvents } from "../lib/pairing";

// v1: static positioning, pairing, and zoom only. No playhead, no drag, no
// keyboard stepping, no playback - that's roadmap 2.4, and CLAUDE.md
// reserves the scrubber interaction logic for Adarsha to write himself.

const ZOOM_LEVELS = [0.25, 0.5, 1, 2, 4, 8];
const DEFAULT_ZOOM_INDEX = 2; // 1x
const BASE_PX_PER_SECOND = 20;
const TRACK_HEIGHT = 64;
const TICK_SPACING_PX = 100;

const EVENT_COLOR: Record<EventType, string> = {
  run_start: "fill-ink-muted",
  llm_call: "fill-phosphor",
  llm_response: "fill-phosphor",
  tool_call: "fill-status-running",
  tool_result: "fill-status-running",
  retry: "fill-status-failed",
  error: "fill-status-failed",
  agent_decision: "fill-ink-muted",
  run_end: "fill-ink-muted",
};

function formatElapsed(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(totalSeconds < 10 ? 1 : 0)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${seconds}s`;
}

interface TimelineProps {
  events: EventRecord[];
}

export default function Timeline({ events }: TimelineProps) {
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);

  if (events.length === 0) {
    return <p className="text-sm text-ink-muted">No events recorded for this run.</p>;
  }

  const items = pairEvents(events);
  const startMs = new Date(events[0]!.timestamp).getTime();
  const pxPerMs = (BASE_PX_PER_SECOND * ZOOM_LEVELS[zoomIndex]!) / 1000;
  const toX = (timestamp: string) => (new Date(timestamp).getTime() - startMs) * pxPerMs;

  const lastMs = new Date(events[events.length - 1]!.timestamp).getTime();
  const totalWidth = Math.max((lastMs - startMs) * pxPerMs + 40, 200);

  const ticks: number[] = [];
  for (let x = 0; x <= totalWidth; x += TICK_SPACING_PX) {
    ticks.push(x);
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          className="rounded border border-border px-2 py-1 font-mono text-xs text-ink-muted hover:text-ink disabled:opacity-40"
          onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
          disabled={zoomIndex === 0}
        >
          −
        </button>
        <span className="w-10 text-center font-mono text-xs text-ink-muted">
          {ZOOM_LEVELS[zoomIndex]}x
        </span>
        <button
          type="button"
          className="rounded border border-border px-2 py-1 font-mono text-xs text-ink-muted hover:text-ink disabled:opacity-40"
          onClick={() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
          disabled={zoomIndex === ZOOM_LEVELS.length - 1}
        >
          +
        </button>
      </div>
      <div className="overflow-x-auto rounded border border-border bg-surface-raised">
        <svg width={totalWidth} height={TRACK_HEIGHT} className="block">
          <line
            x1={0}
            y1={TRACK_HEIGHT / 2}
            x2={totalWidth}
            y2={TRACK_HEIGHT / 2}
            className="stroke-border"
            strokeWidth={1}
          />
          {ticks.map((x) => (
            <g key={x}>
              <line x1={x} y1={8} x2={x} y2={TRACK_HEIGHT - 8} className="stroke-border" strokeWidth={1} />
              <text x={x + 4} y={TRACK_HEIGHT - 4} className="fill-ink-faint font-mono text-[10px]">
                {formatElapsed(x / pxPerMs)}
              </text>
            </g>
          ))}
          {items.map((item) =>
            item.kind === "span" ? (
              <rect
                key={`span-${item.start.seq}`}
                x={toX(item.start.timestamp)}
                y={TRACK_HEIGHT / 2 - 8}
                width={Math.max(toX(item.end.timestamp) - toX(item.start.timestamp), 3)}
                height={16}
                rx={3}
                className={EVENT_COLOR[item.type]}
              >
                <title>{`${item.type} - seq ${item.start.seq} to ${item.end.seq}`}</title>
              </rect>
            ) : (
              <circle
                key={`point-${item.event.seq}`}
                cx={toX(item.event.timestamp)}
                cy={TRACK_HEIGHT / 2}
                r={5}
                className={EVENT_COLOR[item.type]}
              >
                <title>{`${item.type} - seq ${item.event.seq}`}</title>
              </circle>
            ),
          )}
        </svg>
      </div>
    </div>
  );
}
