import {
  useState,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { EventRecord } from "replay-shared";
import { isSameTimelineItem, itemAtTime, pairEvents, type TimelineItem } from "../lib/pairing";
import { SCRUBBER_SPEED_LEVELS, type Scrubber } from "../hooks/useScrubber";
import StateMessage from "./StateMessage";
import { useElementWidth } from "../hooks/useElementWidth";
import { EVENT_FILL, EVENT_LEGEND } from "../lib/eventColor";

// Zoom is a multiple of "the whole run fits the visible track", not an
// absolute pixels-per-second. A fixed scale looked fine on the seeded demo
// runs and fell apart on real ones: a 500ms run drew as a 10px sliver in a
// 1000px track at 1x, and a four-minute run needed six clicks to become
// readable. Relative zoom means 1x is always the useful default, whatever the
// run's duration.
const ZOOM_LEVELS = [1, 2, 4, 8, 16, 32];
const DEFAULT_ZOOM_INDEX = 0; // 1x = fit
const FALLBACK_TRACK_WIDTH = 800;
const TRACK_PADDING_PX = 24;
const TRACK_HEIGHT = 64;
const TICK_SPACING_PX = 100;
const SELECT_TOLERANCE_PX = 8;

function formatElapsed(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(totalSeconds < 10 ? 1 : 0)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${seconds}s`;
}

// Tick labels need as many decimals as the gap between ticks actually
// resolves. Reusing formatElapsed here printed "0.1s 0.1s 0.2s 0.2s" on a
// half-second run - a ruler with two identical marks is worse than no ruler.
function formatTick(ms: number, msPerTick: number): string {
  if (ms >= 60_000) {
    return formatElapsed(ms);
  }
  const decimals = msPerTick < 100 ? 2 : msPerTick < 1000 ? 1 : 0;
  return `${(ms / 1000).toFixed(decimals)}s`;
}

interface TimelineProps {
  events: EventRecord[];
  scrubber: Scrubber;
  selected: TimelineItem | null;
  onSelect: (item: TimelineItem) => void;
}

export default function Timeline({ events, scrubber, selected, onSelect }: TimelineProps) {
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const { ref: trackRef, width: trackWidth } =
    useElementWidth<HTMLDivElement>(FALLBACK_TRACK_WIDTH);

  if (events.length === 0) {
    return <StateMessage kind="empty" message="No events recorded for this run." />;
  }

  const items = pairEvents(events);
  const startMs = new Date(events[0]!.timestamp).getTime();
  const lastMs = new Date(events[events.length - 1]!.timestamp).getTime();
  // A run whose events all land in the same millisecond still needs a
  // non-zero duration, or pxPerMs is Infinity and every x is NaN.
  const durationMs = Math.max(lastMs - startMs, 1);

  const totalWidth = Math.max(trackWidth - TRACK_PADDING_PX, 200) * ZOOM_LEVELS[zoomIndex]!;
  const pxPerMs = totalWidth / durationMs;
  const toX = (timestamp: string) => (new Date(timestamp).getTime() - startMs) * pxPerMs;
  const playheadX = Math.min(totalWidth, Math.max(0, (scrubber.currentMs - startMs) * pxPerMs));

  const ticks: number[] = [];
  for (let x = 0; x <= totalWidth; x += TICK_SPACING_PX) {
    ticks.push(x);
  }

  function seekFromPointer(event: ReactPointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    scrubber.seek(startMs + x / pxPerMs);
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    // setPointerCapture redirects every subsequent pointer/mouse event for
    // this pointer - including the click that fires on release - to the
    // capturing element (this <svg>), not whatever was actually under the
    // cursor. That's why event selection is wired to onPointerDown directly
    // on each shape below, not onClick: by the time capture takes effect,
    // a click on a shape would already have been retargeted to the track
    // background and silently never fire the shape's own handler.
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromPointer(event);
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.buttons !== 1) {
      return;
    }
    seekFromPointer(event);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      scrubber.stepForward();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrubber.stepBackward();
    } else if (event.key === " ") {
      event.preventDefault();
      scrubber.togglePlay();
    } else if (event.key === "Enter") {
      // Without this the timeline is mouse-only: arrow keys move the playhead
      // but nothing can be opened. Enter inspects whatever the playhead is
      // sitting on. The tolerance is expressed in pixels and converted to a
      // duration, so "close enough to click" means the same thing at every
      // zoom level rather than drifting with the time scale.
      event.preventDefault();
      const item = itemAtTime(items, scrubber.currentMs, SELECT_TOLERANCE_PX / pxPerMs);
      if (item) {
        onSelect(item);
      }
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded border border-border px-3 py-1 font-mono text-xs text-ink-muted hover:text-ink"
            onClick={scrubber.togglePlay}
          >
            {scrubber.isPlaying ? "Pause" : "Play"}
          </button>
          <select
            className="rounded border border-border bg-surface px-1 py-1 font-mono text-xs text-ink-muted hover:text-ink"
            value={scrubber.speedIndex}
            onChange={(event) => scrubber.setSpeedIndex(Number(event.target.value))}
          >
            {SCRUBBER_SPEED_LEVELS.map((level, index) => (
              <option key={level} value={index}>
                {level}x
              </option>
            ))}
          </select>
          <span className="font-mono text-xs text-ink-muted">
            {formatElapsed(scrubber.currentMs - startMs)} /{" "}
            {formatElapsed(scrubber.maxMs - startMs)}
          </span>
        </div>
      </div>

      <div
        ref={trackRef}
        className="overflow-x-auto rounded border border-border bg-surface-raised focus:outline focus:outline-1 focus:outline-signal"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <svg
          width={totalWidth}
          height={TRACK_HEIGHT}
          className="block cursor-pointer"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
        >
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
              <line
                x1={x}
                y1={8}
                x2={x}
                y2={TRACK_HEIGHT - 8}
                className="stroke-border"
                strokeWidth={1}
              />
              <text x={x + 4} y={TRACK_HEIGHT - 4} className="fill-ink-faint font-mono text-[10px]">
                {formatTick(x / pxPerMs, TICK_SPACING_PX / pxPerMs)}
              </text>
            </g>
          ))}
          {items.map((item) => {
            const isSelected = isSameTimelineItem(item, selected);
            const selectionClass = isSelected ? "stroke-ink stroke-2" : "stroke-none";
            return item.kind === "span" ? (
              <rect
                key={`span-${item.start.seq}`}
                x={toX(item.start.timestamp)}
                y={TRACK_HEIGHT / 2 - 8}
                width={Math.max(toX(item.end.timestamp) - toX(item.start.timestamp), 3)}
                height={16}
                rx={3}
                className={`${EVENT_FILL[item.type]} ${selectionClass} cursor-pointer`}
                onPointerDown={() => onSelect(item)}
              >
                <title>{`${item.type} - seq ${item.start.seq} to ${item.end.seq}`}</title>
              </rect>
            ) : (
              <circle
                key={`point-${item.event.seq}`}
                cx={toX(item.event.timestamp)}
                cy={TRACK_HEIGHT / 2}
                r={5}
                className={`${EVENT_FILL[item.type]} ${selectionClass} cursor-pointer`}
                onPointerDown={() => onSelect(item)}
              >
                <title>{`${item.type} - seq ${item.event.seq}`}</title>
              </circle>
            );
          })}
          <line
            x1={playheadX}
            y1={0}
            x2={playheadX}
            y2={TRACK_HEIGHT}
            className="stroke-signal"
            strokeWidth={2}
          />
          <polygon
            points={`${playheadX - 5},0 ${playheadX + 5},0 ${playheadX},7`}
            className="fill-signal"
          />
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {EVENT_LEGEND.map((entry) => (
          <span
            key={entry.label}
            className="flex items-center gap-1.5 font-mono text-[10px] text-ink-faint"
          >
            <span aria-hidden="true" className={`h-2 w-2 rounded-sm ${entry.className}`} />
            {entry.label}
          </span>
        ))}
      </div>
      <p className="mt-2 font-mono text-[10px] leading-relaxed text-ink-faint">
        Click or drag to seek, or click an event to inspect it. With the track focused: ←/→ steps
        between events, Enter inspects the one under the playhead, space plays.
      </p>
    </div>
  );
}
