// Turns a run into a flight profile: time on the x axis, money spent on the y
// axis. Cost is monotonically non-decreasing, so a run that spends tokens
// literally climbs, and one that stalls without spending cruises flat. The
// altitude is a real quantity read off the events, not decoration - that is
// the only reason the aviation metaphor is allowed to exist here.
//
// Pure and tested for the same reason pairing.ts and cost.ts are: the
// component only feeds these numbers to an SVG, but interpolating an altitude
// between two waypoints is exactly the kind of off-by-one that is invisible
// on screen and obvious in an assertion.

import type { EventRecord, EventType } from "replay-shared";

export interface FlightPoint {
  seq: number;
  type: EventType;
  x: number;
  y: number;
  cumulativeCostUsd: number;
}

// Keeps the profile off the top and bottom edges of its box, so the aircraft
// glyph and the waypoint marks are never clipped in half.
const CEILING_FRACTION = 0.18;
const FLOOR_FRACTION = 0.82;

/**
 * Every event placed at its time (x) and its cumulative cost (y), in SVG user
 * units. Events are returned in seq order.
 *
 * A run that spent nothing - or a run whose events all share one timestamp -
 * gets a flat cruise rather than a divide-by-zero: there is no altitude to
 * show, but there is still a run to draw.
 */
export function buildFlightPath(
  events: EventRecord[],
  width: number,
  height: number,
): FlightPoint[] {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  if (sorted.length === 0) {
    return [];
  }

  const startMs = new Date(sorted[0]!.timestamp).getTime();
  const endMs = new Date(sorted[sorted.length - 1]!.timestamp).getTime();
  const durationMs = Math.max(endMs - startMs, 1);
  const totalCost = sorted.reduce((sum, event) => sum + (event.costUsd ?? 0), 0);

  const ceiling = height * CEILING_FRACTION;
  const floor = height * FLOOR_FRACTION;

  let cumulative = 0;
  return sorted.map((event) => {
    cumulative += event.costUsd ?? 0;
    const climb = totalCost > 0 ? cumulative / totalCost : 0;
    return {
      seq: event.seq,
      type: event.type,
      x: ((new Date(event.timestamp).getTime() - startMs) / durationMs) * width,
      y: floor - climb * (floor - ceiling),
      cumulativeCostUsd: cumulative,
    };
  });
}

/**
 * The altitude of the profile at an arbitrary x, linearly interpolated
 * between the two waypoints either side of it. The aircraft rides this, so it
 * has to be defined everywhere along the route - including before the first
 * waypoint and after the last, where it simply holds level.
 */
export function altitudeAtX(points: FlightPoint[], x: number): number {
  if (points.length === 0) {
    return 0;
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (x <= first.x) {
    return first.y;
  }
  if (x >= last.x) {
    return last.y;
  }
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1]!;
    const next = points[i]!;
    if (x <= next.x) {
      const span = next.x - previous.x;
      // Two events at the same instant have no span to interpolate across;
      // the later one wins, which matches how the profile is drawn.
      if (span <= 0) {
        return next.y;
      }
      return previous.y + ((x - previous.x) / span) * (next.y - previous.y);
    }
  }
  return last.y;
}
