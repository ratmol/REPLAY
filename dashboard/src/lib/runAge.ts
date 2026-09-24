// Wording for runs that have no recorded end. "running" only means end() was
// never called - a crashed agent, a Ctrl+C, or a sleeping laptop all look the
// same as an agent that is still working - so every place that shows such a
// run speaks in ages ("started 1h 40m ago", "last event 3m ago") and never
// claims a duration of work the event log does not contain.

/**
 * How long a run can go without a new event before the dashboard says it has
 * most likely stopped. A judgment call, not a measured number: a single slow
 * model call or tool call rarely runs past a couple of minutes, so five
 * minutes of silence is a strong hint without flagging an agent that is just
 * waiting on one long request.
 */
export const LIKELY_STOPPED_AFTER_MS = 5 * 60_000;

/** A compact age for a table cell or a sentence: "42s ago", "7m ago", "1h 40m ago". */
export function formatAge(ms: number): string {
  const clamped = Math.max(ms, 0);
  const minutes = Math.floor(clamped / 60_000);
  if (minutes < 1) {
    return `${Math.floor(clamped / 1000)}s ago`;
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

/** True when a run with no recorded end has been silent long enough to say so. */
export function isLikelyStopped(lastEventMs: number, nowMs: number): boolean {
  return nowMs - lastEventMs >= LIKELY_STOPPED_AFTER_MS;
}
