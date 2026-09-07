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
import { altitudeAtX, buildFlightPath, groundY } from "../lib/flightPath";
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
  const { ref, progress, prefersReducedMotion } = useScrollProgress<HTMLDivElement>();

  useEffect(() => {
    let cancelled = false;
    fetchEvents(runId)
      .then(({ events: fetched }) => {
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

  // The 260vh scroll-jacking wrapper only exists to give the pinned content
  // something to scrub against; with motion turned off there is nothing to
  // pin and no reason to force 160vh of extra scrolling to reach the runs
  // list. progress stays 0 (see useScrollProgress), so this renders the
  // flight's start state as a normal, static block instead - not the "final"
  // state, because HeroCopy's own fade is keyed to progress too, and a
  // reduced-motion visitor should see the intro copy, not have it hidden.
  return (
    <div
      ref={ref}
      className={prefersReducedMotion ? "relative -mt-20 pb-8 pt-24" : "relative -mt-20 h-[260vh]"}
    >
      <div
        className={
          prefersReducedMotion
            ? "flex flex-col justify-between gap-12"
            : "sticky top-0 flex h-screen flex-col justify-between overflow-hidden pb-8 pt-20"
        }
      >
        <HeroCopy progress={progress} runId={runId} />
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
            {prefersReducedMotion
              ? "Open the run to replay it"
              : progress > 0.02
                ? `${Math.round(progress * 100)} percent flown`
                : "Scroll to fly it, or open a run below"}
          </p>
        </div>
      </div>
    </div>
  );
}

function HeroCopy({ progress, runId }: { progress: number; runId: string }) {
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
      <h1 className="mt-4 text-display font-medium text-ink">
        Play the run
        <br />
        back.
      </h1>
      <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-muted">
        Your agent looped, burned dollars, and failed a tool call somewhere. Console logs will not
        tell you where. Replay records every step and lets you scrub through it.
      </p>
      {/* One real way in, on the first screen. The primary link opens an actual
          run's scrubber rather than only scrolling the hero, so the first
          interaction is using the product. Kept to a single compact row - an
          earlier pass stacked three extra descriptive lines here, which grew
          the header past the pinned viewport and clipped the flight route off
          the bottom of the frame. Source lives in the top nav, so it is not
          repeated here. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <Link
          to={`/runs/${runId}`}
          className="inline-flex items-center gap-2 border border-signal/70 px-4 py-2 font-mono text-sm text-signal transition-colors hover:bg-signal hover:text-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        >
          Open a live run <span aria-hidden="true">&rarr;</span>
        </Link>
        <a
          href="#spec"
          className="px-2 py-2 font-mono text-sm text-ink-muted transition-colors hover:text-ink"
        >
          Quickstart
        </a>
      </div>
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

const GROUND_Y = groundY(ROUTE_HEIGHT);
// Half-window (in world px) used to read the local slope of the route for the
// aircraft's pitch. Big enough to smooth over a single steep segment, small
// enough that the nose still visibly drops on final approach.
const PITCH_SAMPLE_DX = 30;
const MAX_PITCH_DEG = 24;

function Route({
  points,
  progress,
}: {
  points: ReturnType<typeof buildFlightPath>;
  progress: number;
}) {
  const aircraftX = progress * ROUTE_WIDTH;
  const aircraftY = altitudeAtX(points, aircraftX);
  const destination = points[points.length - 1]!;
  const landed = aircraftX >= destination.x - 1;

  const flown = points.filter((point) => point.x <= aircraftX);
  // The flown segment ends exactly under the aircraft rather than at the last
  // waypoint behind it, so the trail never visibly lags the nose.
  const trail = [...flown.map((point) => `${point.x},${point.y}`), `${aircraftX},${aircraftY}`];

  // Pitch = the slope of the route right under the nose. y grows downward, so a
  // climb (y falling) gives a negative angle = nose up, and the descent onto
  // the destination runway gives nose down - the aircraft visibly flares in to
  // land. Clamped so a near-vertical segment can't spin it.
  const behind = altitudeAtX(points, aircraftX - PITCH_SAMPLE_DX);
  const ahead = altitudeAtX(points, aircraftX + PITCH_SAMPLE_DX);
  const rawPitch = (Math.atan2(ahead - behind, PITCH_SAMPLE_DX * 2) * 180) / Math.PI;
  const pitch = Math.max(-MAX_PITCH_DEG, Math.min(MAX_PITCH_DEG, rawPitch));

  // Everything that depends only on the route - the runway, both airports, the
  // per-event drop lines, the base profile and the waypoints - is memoised so a
  // scroll frame doesn't rebuild it. Scrolling changes only `progress`, and the
  // only things that actually move with it are the signal-coloured trail and
  // the aircraft; without this, every frame re-created ~40 SVG nodes just to
  // hand React back an identical tree to diff.
  const routeBackdrop = useMemo(() => {
    const origin = points[0]!;
    const dest = points[points.length - 1]!;
    return (
      <>
        {/* The runway both airports sit on - the reference the altitude is
            measured against. */}
        <line
          x1={0}
          y1={GROUND_Y}
          x2={ROUTE_WIDTH}
          y2={GROUND_Y}
          className="stroke-steel-deep"
          strokeWidth={1}
        />
        <Airport x={origin.x} label="DEP" side="right" />
        <Airport x={dest.x} label="ARR" side="left" />

        {points.map((point) => (
          <line
            key={`drop-${point.seq}`}
            x1={point.x}
            y1={point.y}
            x2={point.x}
            y2={GROUND_Y}
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
      </>
    );
  }, [points]);

  // The waypoint dots are static too, but they draw *after* the trail so an
  // event mark is never painted over by the signal line crossing it - the same
  // z-order the un-memoised version had.
  const waypointDots = useMemo(
    () =>
      points.map((point) => (
        <circle
          key={`waypoint-${point.seq}`}
          cx={point.x}
          cy={point.y}
          r={4}
          className={EVENT_FILL[point.type]}
        />
      )),
    [points],
  );

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
          {routeBackdrop}
          {/* The one geometry that changes per frame: the flown trail, drawn on
              top of the memoised backdrop and under the waypoint dots. */}
          <polyline
            points={trail.join(" ")}
            fill="none"
            className="stroke-signal"
            strokeWidth={2}
          />
          {waypointDots}
        </svg>
      </div>

      {/* The aircraft holds the centre of the frame and rides the profile
          vertically. It lives outside the sliding group because its x is fixed
          in screen space while the world scrolls beneath it. The inner element
          rotates it to the route's pitch; on the ground it levels off. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 will-change-transform"
        style={{ transform: `translateY(${aircraftY}px)` }}
      >
        <div style={{ transform: `translate(-50%, -50%) rotate(${landed ? 0 : pitch}deg)` }}>
          <Aircraft />
        </div>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-fade-x-surface" />
    </div>
  );
}

// A control tower on the runway, marking where the run departs and arrives.
// `side` puts the label clear of the flight path: the origin's label to its
// right (into the run), the destination's to its left.
function Airport({ x, label, side }: { x: number; label: string; side: "left" | "right" }) {
  const mastTop = GROUND_Y - 20;
  return (
    <g>
      <line x1={x} y1={GROUND_Y} x2={x} y2={mastTop} className="stroke-steel" strokeWidth={1.5} />
      <path
        d={`M${x - 4} ${mastTop} L${x + 4} ${mastTop} L${x + 2.5} ${mastTop - 6} L${x - 2.5} ${mastTop - 6} Z`}
        className="fill-steel"
      />
      <rect x={x - 9} y={GROUND_Y} width={18} height={2.5} className="fill-steel-dim" />
      <text
        x={side === "right" ? x + 10 : x - 10}
        y={GROUND_Y - 6}
        textAnchor={side === "right" ? "start" : "end"}
        className="fill-steel font-mono"
        style={{ fontSize: 11, letterSpacing: "0.14em" }}
      >
        {label}
      </text>
    </g>
  );
}

// A side-on airframe, drawn rather than imported: nose right, swept wing,
// tailplane. Small enough to read as an instrument mark instead of an
// illustration.
function Aircraft() {
  return (
    <svg width={40} height={22} viewBox="0 0 40 22">
      <path
        d="M2 11 L20 8 L34 8 L38 11 L34 14 L20 14 Z M14 8 L8 1 L12 1 L22 8 Z M14 14 L8 21 L12 21 L22 14 Z"
        className="fill-signal"
      />
    </svg>
  );
}
