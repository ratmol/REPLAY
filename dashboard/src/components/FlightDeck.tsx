// The landing page's signature moment: scrolling flies a real recorded run.
//
// Not a video, not a gif, not mocked JSON - it fetches one actual run from the
// collector on page load, and the page's own scroll position drives the
// aircraft along it. Scroll-as-scrub rather than an autoplaying loop because
// the product *is* a scrubber: a hero that plays itself demonstrates nothing,
// while one the visitor drives teaches the interaction before they ever open a
// run.
//
// The aviation framing is load-bearing rather than a costume. Altitude is
// cumulative dollars spent, distance is elapsed time, and the waypoints are
// the run's real events in their real colours - the same colours the run
// detail timeline uses. Every number on the instrument strip is read off the
// event log.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { EventRecord } from "replay-shared";
import { fetchEvents } from "../api";
import { EVENT_FILL } from "../lib/eventColor";
import { altitudeAtX, buildFlightPath } from "../lib/flightPath";
import { eventIndexAtProgress, timecode } from "../lib/scrollTape";
import { useScrollProgress } from "../hooks/useScrollProgress";
import { Link } from "../router";
import Readout from "./Readout";
import { EVENT_CATEGORY, EVENT_TEXT } from "../lib/eventColor";

// The route is drawn at a fixed intrinsic width and slid horizontally behind a
// stationary aircraft - the world moves, the cockpit does not, which is how it
// feels to actually fly one. Units are SVG user units, and nothing scales the
// wrapper, so one unit is one CSS pixel.
const ROUTE_WIDTH = 2600;
const ROUTE_HEIGHT = 150;

interface FlightDeckProps {
  runId: string;
  runName: string;
  agentName?: string;
  model?: string;
}

export default function FlightDeck({ runId, runName, agentName, model }: FlightDeckProps) {
  const [events, setEvents] = useState<EventRecord[] | null>(null);
  const { ref, progress } = useScrollProgress<HTMLDivElement>();

  useEffect(() => {
    let cancelled = false;
    fetchEvents(runId)
      .then((fetched) => {
        if (!cancelled) {
          setEvents(fetched);
        }
      })
      .catch(() => {
        // The hero is decorative. If this fails the page still works - the
        // runs list below has its own real error handling.
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  const sorted = useMemo(() => (events ? [...events].sort((a, b) => a.seq - b.seq) : []), [events]);
  const points = useMemo(() => buildFlightPath(sorted, ROUTE_WIDTH, ROUTE_HEIGHT), [sorted]);

  if (sorted.length === 0) {
    return null;
  }

  const startMs = new Date(sorted[0]!.timestamp).getTime();
  const endMs = new Date(sorted[sorted.length - 1]!.timestamp).getTime();
  const durationMs = Math.max(endMs - startMs, 1);
  const current = sorted[eventIndexAtProgress(sorted, progress)]!;
  const currentPoint = points[eventIndexAtProgress(sorted, progress)];

  return (
    // 260vh of scroll for ~100vh of pinned content: the extra 160vh is the
    // flight. Long enough that the aircraft moves at a readable speed, short
    // enough that nobody feels trapped in the hero.
    <div ref={ref} className="relative -mt-20 h-[260vh]">
      <div className="sticky top-0 flex h-screen flex-col justify-between overflow-hidden pb-8 pt-24">
        <HeroCopy progress={progress} />
        <div>
          <InstrumentStrip
            runId={runId}
            runName={runName}
            agentName={agentName}
            model={model}
            current={current}
            elapsedMs={progress * durationMs}
            spentUsd={currentPoint?.cumulativeCostUsd ?? 0}
          />
          <Route points={points} progress={progress} />
          <p className="mt-3 text-right font-mono text-micro uppercase text-steel">
            {progress > 0.02 ? `${Math.round(progress * 100)} percent flown` : "Scroll to fly"}
          </p>
        </div>
      </div>
    </div>
  );
}

function HeroCopy({ progress }: { progress: number }) {
  // The headline hands off to the flight as you scroll - one continuous move
  // rather than two focal points competing. It fully clears out (opacity 0,
  // lifted away) instead of lingering half-faded, which read as "stuck": the
  // copy has said its piece by the time the instrument is worth watching.
  // reaches 0 at ~55% of the scrub so the flight has the frame to itself for
  // the second half. pointer-events are dropped once it is gone so it never
  // eats a click meant for the tape beneath it. transform/opacity only, since
  // these are per-frame values no Tailwind token can express.
  const recede = Math.min(progress / 0.55, 1);
  const gone = recede >= 1;
  return (
    <header
      aria-hidden={gone}
      className="max-w-4xl will-change-transform"
      style={{
        opacity: 1 - recede,
        transform: `translateY(${-recede * 72}px)`,
        pointerEvents: gone ? "none" : undefined,
      }}
    >
      <p className="font-mono text-micro uppercase text-brass">Flight recorder for AI agents</p>
      <h1 className="mt-5 text-display font-medium text-ink">
        Play the run
        <br />
        back.
      </h1>
      <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-muted">
        Your agent looped, burned three dollars, and failed a tool call somewhere. Console logs will
        not tell you where. Replay records every step and lets you scrub through it.
      </p>
    </header>
  );
}

interface InstrumentStripProps {
  runId: string;
  runName: string;
  agentName?: string;
  model?: string;
  current: EventRecord;
  elapsedMs: number;
  spentUsd: number;
}

function InstrumentStrip({
  runId,
  runName,
  agentName,
  model,
  current,
  elapsedMs,
  spentUsd,
}: InstrumentStripProps) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        <Plate label="Flight">
          <Link to={`/runs/${runId}`} className="text-ink hover:text-signal">
            {runName}
          </Link>
        </Plate>
        {agentName && <Plate label="Agent">{agentName}</Plate>}
        {model && <Plate label="Aircraft">{model}</Plate>}
        <Plate label="Event">
          <span className={EVENT_TEXT[EVENT_CATEGORY[current.type]]}>{current.type}</span>{" "}
          <span className="text-steel">seq {current.seq}</span>
        </Plate>
      </dl>
      <div className="flex items-end gap-6">
        <Readout label="Spent" align="right">
          ${spentUsd.toFixed(4)}
        </Readout>
        <Readout label="Elapsed" tone="signal" size="lg" align="right">
          {timecode(elapsedMs)}
        </Readout>
      </div>
    </div>
  );
}

// An engraved nameplate, not a lit display: these are labels for the flight,
// fixed for its whole duration. Only the two values that actually change while
// you scroll get the glass treatment, which is what keeps the eye on them.
function Plate({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-micro uppercase text-steel">{label}</dt>
      <dd className="mt-1.5 font-mono text-base text-ink-muted">{children}</dd>
    </div>
  );
}

function Route({
  points,
  progress,
}: {
  points: ReturnType<typeof buildFlightPath>;
  progress: number;
}) {
  const aircraftX = progress * ROUTE_WIDTH;
  const aircraftY = altitudeAtX(points, aircraftX);
  const flown = points.filter((point) => point.x <= aircraftX);
  // The flown segment ends exactly under the aircraft rather than at the last
  // waypoint behind it, so the trail never visibly lags the nose.
  const trail = [...flown.map((point) => `${point.x},${point.y}`), `${aircraftX},${aircraftY}`];

  return (
    <div className="relative overflow-hidden border-y border-steel-deep bg-surface bg-graticule bg-grid-32">
      <div
        className="will-change-transform"
        style={{ transform: `translateX(calc(50% - ${aircraftX}px))` }}
      >
        <svg
          width={ROUTE_WIDTH}
          height={ROUTE_HEIGHT}
          viewBox={`0 0 ${ROUTE_WIDTH} ${ROUTE_HEIGHT}`}
          aria-hidden="true"
        >
          {points.map((point) => (
            <line
              key={`drop-${point.seq}`}
              x1={point.x}
              y1={point.y}
              x2={point.x}
              y2={ROUTE_HEIGHT}
              className="stroke-border"
              strokeWidth={1}
            />
          ))}
          <polyline
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="none"
            className="stroke-steel-dim"
            strokeWidth={1.5}
          />
          <polyline
            points={trail.join(" ")}
            fill="none"
            className="stroke-signal"
            strokeWidth={2}
          />
          {points.map((point) => (
            <circle
              key={`waypoint-${point.seq}`}
              cx={point.x}
              cy={point.y}
              r={4}
              className={EVENT_FILL[point.type]}
            />
          ))}
        </svg>
      </div>

      {/* The aircraft holds the centre of the frame and rides the profile
          vertically. It lives outside the sliding group because its x is fixed
          in screen space while the world scrolls beneath it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 will-change-transform"
        style={{ transform: `translate(-50%, ${aircraftY}px)` }}
      >
        <Aircraft />
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-fade-x-surface" />
    </div>
  );
}

// A side-on airframe, drawn rather than imported: nose right, swept wing,
// tailplane. Small enough to read as an instrument mark instead of an
// illustration.
function Aircraft() {
  return (
    <svg width={40} height={22} viewBox="0 0 40 22" className="-translate-y-1/2">
      <path
        d="M2 11 L20 8 L34 8 L38 11 L34 14 L20 14 Z M14 8 L8 1 L12 1 L22 8 Z M14 14 L8 21 L12 21 L22 14 Z"
        className="fill-signal"
      />
    </svg>
  );
}
