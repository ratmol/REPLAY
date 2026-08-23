// Filtering for the runs list. Every tracing tool this competes with lets you
// narrow a trace list before you open anything - filtering by outcome and by
// name is the minimum, and without it the list is only usable while it is
// short enough to read in full.
//
// Kept pure and out of the component for the usual reason: "does this run
// match" is a rule with edges (empty query, case, partial words, a run with no
// agent name) that is cheap to assert directly and tedious to click through.

import type { RunSummary } from "replay-shared";

export type StatusFilter = RunSummary["status"] | "all";

export type RunSortKey = "recent" | "cost" | "duration";

export interface RunQuery {
  status: StatusFilter;
  text: string;
  sort: RunSortKey;
}

export const EMPTY_RUN_QUERY: RunQuery = { status: "all", text: "", sort: "recent" };

/**
 * Wall-clock length of a run in ms. A run still in flight has no end, and is
 * measured to now - otherwise every running run sorts as zero-length and the
 * longest-running one, which is usually the one you are looking for, sinks to
 * the bottom.
 */
export function runDurationMs(run: RunSummary, nowMs: number): number {
  const startedMs = new Date(run.startedAt).getTime();
  const endedMs = run.endedAt ? new Date(run.endedAt).getTime() : nowMs;
  return Math.max(endedMs - startedMs, 0);
}

/**
 * Case-insensitive substring match across the fields a person would actually
 * type: the run's name, its agent, and its model. Whitespace-only input counts
 * as no filter rather than as a query that matches nothing.
 */
export function matchesText(run: RunSummary, text: string): boolean {
  const needle = text.trim().toLowerCase();
  if (needle === "") {
    return true;
  }
  return [run.name, run.agentName, run.model].some(
    (field) => field !== undefined && field.toLowerCase().includes(needle),
  );
}

export function filterAndSortRuns(
  runs: RunSummary[],
  query: RunQuery,
  nowMs: number,
): RunSummary[] {
  const matched = runs.filter(
    (run) =>
      (query.status === "all" || run.status === query.status) && matchesText(run, query.text),
  );

  // Sorting a copy, not in place: the caller's array is the fetched response
  // held in state, and mutating it would reorder the source of truth as a side
  // effect of rendering a view of it.
  return [...matched].sort((a, b) => {
    switch (query.sort) {
      case "cost":
        return b.totalCostUsd - a.totalCostUsd;
      case "duration":
        return runDurationMs(b, nowMs) - runDurationMs(a, nowMs);
      case "recent":
      default:
        return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    }
  });
}

/**
 * Moves pinned runs to the front, preserving order within each group. A
 * partition rather than a sort key: pinning means "keep this at the top",
 * not "outrank everything by a new criterion", so pinned runs still follow
 * whatever sort is active relative to each other, and so do the rest.
 */
export function partitionPinned(
  runs: RunSummary[],
  pinnedIds: ReadonlySet<string>,
): RunSummary[] {
  if (pinnedIds.size === 0) {
    return runs;
  }
  const pinned: RunSummary[] = [];
  const rest: RunSummary[] = [];
  for (const run of runs) {
    (pinnedIds.has(run.id) ? pinned : rest).push(run);
  }
  return [...pinned, ...rest];
}

/** Per-status totals for the filter chips, computed once over the full list. */
export function countByStatus(runs: RunSummary[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = {
    all: runs.length,
    running: 0,
    completed: 0,
    failed: 0,
  };
  for (const run of runs) {
    counts[run.status] += 1;
  }
  return counts;
}
