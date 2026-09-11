import {
  memo,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { EventRecord } from "replay-shared";
import { isSameTimelineItem, itemAtTime, pairEvents, type TimelineItem } from "../lib/pairing";
import { SCRUBBER_SPEED_LEVELS, type Scrubber } from "../hooks/useScrubber";
import StateMessage from "./StateMessage";
import { useElementWidth } from "../hooks/useElementWidth";
import { EVENT_CATEGORY, EVENT_FILL, EVENT_LEGEND, type EventCategory } from "../lib/eventColor";
import InstrumentPanel from "./InstrumentPanel";

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

function buildTicks(totalWidth: number): number[] {
  const ticks: number[] = [];
  for (let x = 0; x <= totalWidth; x += TICK_SPACING_PX) {
    ticks.push(x);
  }
  return ticks;
}

interface TimelineMarksProps {
  items: TimelineItem[];
  ticks: number[];
  selected: TimelineItem | null;
  muted: ReadonlySet<EventCategory>;
  startMs: number;
  pxPerMs: number;
  totalWidth: number;
  onSelect: (item: TimelineItem) => void;
}

// Everything on the track that does NOT move every frame: the baseline, the
// tick ruler, and the event marks themselves. Split out and memoized so that
// scrubber.currentMs changing ~60x/s during playback (which forces Timeline
// itself to re-render, since it reads currentMs directly for the playhead
// and the elapsed readout) doesn't also re-run pairing's item.map and
// reconcile every SVG node in the run on every one of those frames - React
// bails out of this component entirely as long as its props are
// reference-equal, which they are unless events, selection, muting, zoom, or
// track width actually change.
const TimelineMarks = memo(function TimelineMarks({
  items,
  ticks,
  selected,
  muted,
  startMs,
  pxPerMs,
  totalWidth,
  onSelect,
}: TimelineMarksProps) {
  const toX = (timestamp: string) => (new Date(timestamp).getTime() - startMs) * pxPerMs;
  return (
    <>
      <line
        x1={0}
        y1={TRACK_HEIGHT / 2}
        x2={totalWidth}
        y2={TRACK_HEIGHT / 2}
        className="stroke-steel-deep"
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
          <text x={x + 4} y={TRACK_HEIGHT - 4} className="fill-steel font-mono text-[11px]">
            {formatTick(x / pxPerMs, TICK_SPACING_PX / pxPerMs)}
          </text>
        </g>
      ))}
      {items.map((item) => {
        const isSelected = isSameTimelineItem(item, selected);
        const selectionClass = isSelected ? "stroke-ink stroke-2" : "stroke-none";
        const mutedClass = muted.has(EVENT_CATEGORY[item.type]) ? "opacity-20" : "opacity-100";
        return item.kind === "span" ? (
          <rect
            key={`span-${item.start.seq}`}
            x={toX(item.start.timestamp)}
            y={TRACK_HEIGHT / 2 - 8}
            width={Math.max(toX(item.end.timestamp) - toX(item.start.timestamp), 3)}
            height={16}
            rx={3}
            className={`${EVENT_FILL[item.type]} ${selectionClass} ${mutedClass} cursor-pointer transition-opacity duration-150`}
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
            className={`${EVENT_FILL[item.type]} ${selectionClass} ${mutedClass} cursor-pointer transition-opacity duration-150`}
            onPointerDown={() => onSelect(item)}
          >
            <title>{`${item.type} - seq ${item.event.seq}`}</title>
          </circle>
        );
      })}
    </>
  );
});

// The one thing that DOES move every frame, kept to two small shapes so
// re-rendering it 60x/s during playback is cheap. Memoized anyway (on the
// single `x` prop) so a drag or a scrub that doesn't actually move the
// rounded pixel position skips even that.
const Playhead = memo(function Playhead({ x }: { x: number }) {
  return (
    <>
      <line x1={x} y1={0} x2={x} y2={TRACK_HEIGHT} className="stroke-signal" strokeWidth={2} />
      <polygon points={`${x - 5},0 ${x + 5},0 ${x},7`} className="fill-signal" />
    </>
  );
});

interface TimelineProps {
  events: EventRecord[];
  scrubber: Scrubber;
  selected: TimelineItem | null;
  onSelect: (item: TimelineItem) => void;
}

export default function Timeline({ events, scrubber, selected, onSelect }: TimelineProps) {
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  // Muted rather than removed: hiding events would change the shape of the
  // run - gaps would close up and the remaining marks would sit at times they
  // never happened. Dimming keeps the geometry honest while letting one kind
  // of event stand out, which is the actual question ("where are the retries
  // in all this?").
  const [muted, setMuted] = useState<ReadonlySet<EventCategory>>(new Set());
  const { ref: trackRef, width: trackWidth } =
    useElementWidth<HTMLDivElement>(FALLBACK_TRACK_WIDTH);

  // pairEvents does two sorts plus an allocation over every event in the
  // run; scrubber.currentMs changes ~60x/s during playback and on every
  // pointermove during a drag, and without this, that work (and the
  // items.map reconciliation below) reran on every one of those frames
  // instead of only when the underlying events actually change.
  const items = useMemo(() => pairEvents(events), [events]);

  // Hooks can't follow the early return further down, so everything they
  // depend on is computed defensively above it instead (an empty run just
  // yields durationMs=1, pxPerMs=0, an empty ticks array - never read, since
  // the return below fires first).
  const startMs = events.length > 0 ? new Date(events[0]!.timestamp).getTime() : 0;
  const lastMs = events.length > 0 ? new Date(events[events.length - 1]!.timestamp).getTime() : 0;
  // A run whose events all land in the same millisecond still needs a
  // non-zero duration, or pxPerMs is Infinity and every x is NaN.
  const durationMs = Math.max(lastMs - startMs, 1);

  const totalWidth = Math.max(trackWidth - TRACK_PADDING_PX, 200) * ZOOM_LEVELS[zoomIndex]!;
  const pxPerMs = totalWidth / durationMs;
  const playheadX = Math.min(totalWidth, Math.max(0, (scrubber.currentMs - startMs) * pxPerMs));

  // Only a new array reference when totalWidth itself changes (zoom or
  // resize), not on every currentMs-driven render, so TimelineMarks below -
  // which receives it as a prop - keeps bailing out during playback/drag.
  const ticks = useMemo(() => buildTicks(totalWidth), [totalWidth]);

  if (events.length === 0) {
    return <StateMessage kind="empty" message="No events recorded for this run." />;
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

  function toggleCategory(category: EventCategory) {
    setMuted((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
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
            className="rounded-sm border border-steel-deep px-2.5 py-1.5 font-mono text-base text-steel hover:border-steel-dim hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
            disabled={zoomIndex === 0}
          >
            −
          </button>
          <span className="w-12 text-center font-mono text-base text-ink">
            {ZOOM_LEVELS[zoomIndex]}x
          </span>
          <button
            type="button"
            className="rounded-sm border border-steel-deep px-2.5 py-1.5 font-mono text-base text-steel hover:border-steel-dim hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
            onClick={() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
          >
            +
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-sm border border-steel-deep px-4 py-1.5 font-mono text-base text-signal hover:border-signal"
            onClick={scrubber.togglePlay}
          >
            {scrubber.isPlaying ? "Pause" : "Play"}
          </button>
          <select
            className="rounded-sm border border-steel-deep bg-glass px-2 py-1.5 font-mono text-base text-ink shadow-glass"
            value={scrubber.speedIndex}
            onChange={(event) => scrubber.setSpeedIndex(Number(event.target.value))}
          >
            {SCRUBBER_SPEED_LEVELS.map((level, index) => (
              <option key={level} value={index}>
                {level}x
              </option>
            ))}
          </select>
          <span className="rounded-sm bg-glass px-2.5 py-1.5 font-mono text-base text-ink shadow-glass">
            {formatElapsed(scrubber.currentMs - startMs)} /{" "}
            {formatElapsed(scrubber.maxMs - startMs)}
          </span>
        </div>
      </div>

      <div
        ref={trackRef}
        className="overflow-x-auto rounded-sm border border-steel-deep bg-surface bg-graticule bg-grid-32 shadow-panel focus-visible:outline-none focus-visible:shadow-focus"
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
          <TimelineMarks
            items={items}
            ticks={ticks}
            selected={selected}
            muted={muted}
            startMs={startMs}
            pxPerMs={pxPerMs}
            totalWidth={totalWidth}
            onSelect={onSelect}
          />
          <Playhead x={playheadX} />
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {EVENT_LEGEND.map((entry) => {
          const isMuted = muted.has(entry.category);
          return (
            <button
              key={entry.category}
              type="button"
              aria-pressed={!isMuted}
              onClick={() => toggleCategory(entry.category)}
              title={isMuted ? `Show ${entry.label} events` : `Mute ${entry.label} events`}
              className={`flex items-center gap-1.5 rounded-sm px-1.5 py-1 font-mono text-sm transition-colors duration-150 ${
                isMuted ? "text-steel-dim" : "text-steel hover:text-ink"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-sm ${entry.className} ${isMuted ? "opacity-25" : ""}`}
              />
              {entry.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 font-mono text-sm leading-relaxed text-steel">
        Click or drag to seek, or click an event to inspect it. With the track focused: ←/→ steps
        between events, Enter inspects the one under the playhead, space plays.
      </p>
    </div>
  );
}
