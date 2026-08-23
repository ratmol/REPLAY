import { useEffect, useState } from "react";
import type { RunSummary } from "replay-shared";
import { fetchRuns } from "../api";
import RunRow, { RUN_ROW_DESKTOP_ONLY, RUN_ROW_GRID } from "../components/RunRow";
import StateMessage from "../components/StateMessage";
import FlightDeck from "../components/FlightDeck";
import SpecSection from "../components/SpecSection";
import InstrumentPanel from "../components/InstrumentPanel";
import RunFilterBar from "../components/RunFilterBar";
import Reveal from "../components/Reveal";
import { usePinnedRuns } from "../hooks/usePinnedRuns";
import {
  countByStatus,
  EMPTY_RUN_QUERY,
  filterAndSortRuns,
  partitionPinned,
  type RunQuery,
} from "../lib/runFilter";

type LoadState =
  { kind: "loading" } | { kind: "error"; message: string } | { kind: "loaded"; runs: RunSummary[] };

// How many rows show before "Show more". Chosen so the table is a readable
// glance on first load rather than a wall of thirty rows the visitor has to
// scroll past to reach anything else on the page.
const RUNS_PAGE_SIZE = 8;

export default function RunsListPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [query, setQuery] = useState<RunQuery>(EMPTY_RUN_QUERY);
  const [expanded, setExpanded] = useState(false);
  const { pinnedIds, togglePin } = usePinnedRuns();

  useEffect(() => {
    let cancelled = false;
    fetchRuns()
      .then((runs) => {
        if (!cancelled) {
          setState({ kind: "loaded", runs });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Failed to load runs";
          setState({ kind: "error", message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The hero flies one run, and altitude is cumulative cost - so the most
  // expensive completed run gives the most dramatic climb to watch. Falls back
  // to any run if nothing has completed yet, so the hero still renders on a
  // fresh collector.
  const previewRun =
    state.kind === "loaded"
      ? (state.runs
          .filter((run) => run.status === "completed")
          .sort((a, b) => b.totalCostUsd - a.totalCostUsd)[0] ?? state.runs[0])
      : undefined;

  // Recomputed on every render rather than memoised: this is a filter over a
  // list that is one page long by construction (the collector caps it), so a
  // useMemo here would cost more in ceremony than it saves in work.
  //
  // Pinning partitions *after* sort/filter, not instead of it - a pinned run
  // still has to match the active filter to show up at all, and this is also
  // what keeps a pinned run from sliding off the page-8 cut below: the
  // partition runs before the slice, so pinning is what actually fixes it.
  const visibleRuns =
    state.kind === "loaded"
      ? partitionPinned(filterAndSortRuns(state.runs, query, Date.now()), pinnedIds)
      : [];
  // Collapse the tail behind "Show more" only when the list is actually long
  // and not being narrowed by a filter - a filtered result is already a short,
  // deliberate set, and hiding part of it would fight the filter the visitor
  // just applied.
  const collapsing = !expanded && query.status === "all" && query.text.trim() === "";
  const shownRuns = collapsing ? visibleRuns.slice(0, RUNS_PAGE_SIZE) : visibleRuns;
  const hiddenCount = visibleRuns.length - shownRuns.length;

  return (
    <div>
      {previewRun && (
        <FlightDeck
          runId={previewRun.id}
          runName={previewRun.name}
          agentName={previewRun.agentName}
          model={previewRun.model}
        />
      )}

      <section id="runs" className="mt-24 scroll-mt-24 border-t border-border pt-10">
        <Reveal>
          <h2 className="text-headline font-medium text-ink">Recorded runs</h2>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-muted">
            A run is one complete execution of an agent - from the moment it starts to the moment it
            stops, including every model call, tool call, retry and error in between. Each row below
            is one of those, recorded through the real SDK into this collector. Open one to replay
            it step by step on a timeline.
          </p>
          <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs text-brass">
            <div>
              <dt className="inline text-ink-muted">Status</dt>{" "}
              <dd className="inline">how the run ended</dd>
            </div>
            <div>
              <dt className="inline text-ink-muted">Duration</dt>{" "}
              <dd className="inline">wall-clock, start to finish</dd>
            </div>
            <div>
              <dt className="inline text-ink-muted">Cost</dt>{" "}
              <dd className="inline">summed from the events, not estimated</dd>
            </div>
          </dl>
        </Reveal>

        <div className="mt-8">
          {state.kind === "loading" && <StateMessage kind="loading" message="Loading runs" />}
          {state.kind === "error" && <StateMessage kind="error" message={state.message} />}
          {state.kind === "loaded" && state.runs.length === 0 && (
            <StateMessage kind="empty" message="No runs recorded yet." />
          )}
          {state.kind === "loaded" && state.runs.length > 0 && (
            <div>
              <RunFilterBar
                query={query}
                counts={countByStatus(state.runs)}
                resultCount={visibleRuns.length}
                totalCount={state.runs.length}
                onChange={setQuery}
              />
              <div className="mt-5">
                <InstrumentPanel>
                  <div
                    className={`${RUN_ROW_GRID} border-b border-border px-5 pb-3 pt-5 font-mono text-micro uppercase text-ink-faint md:px-6`}
                  >
                    <span>Status</span>
                    <span>Run</span>
                    <span className={RUN_ROW_DESKTOP_ONLY}>Model</span>
                    <span className={`${RUN_ROW_DESKTOP_ONLY} text-right`}>Duration</span>
                    <span className="text-right">Cost</span>
                  </div>
                  {visibleRuns.length === 0 ? (
                    <p className="px-5 py-8 text-center font-mono text-sm text-steel md:px-6">
                      No run matches this filter.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border px-5 md:px-6">
                      {shownRuns.map((run) => (
                        <li key={run.id}>
                          <RunRow run={run} pinned={pinnedIds.has(run.id)} onTogglePin={togglePin} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {hiddenCount > 0 && (
                    <div className="border-t border-border px-5 py-3 md:px-6">
                      <button
                        type="button"
                        onClick={() => setExpanded(true)}
                        className="font-mono text-sm text-brass transition-colors hover:text-signal"
                      >
                        Show {hiddenCount} more {hiddenCount === 1 ? "run" : "runs"}
                      </button>
                    </div>
                  )}
                  {expanded && visibleRuns.length > RUNS_PAGE_SIZE && (
                    <div className="border-t border-border px-5 py-3 md:px-6">
                      <button
                        type="button"
                        onClick={() => setExpanded(false)}
                        className="font-mono text-sm text-steel transition-colors hover:text-ink"
                      >
                        Show fewer
                      </button>
                    </div>
                  )}
                </InstrumentPanel>
              </div>
            </div>
          )}
        </div>
      </section>

      <SpecSection />
    </div>
  );
}
