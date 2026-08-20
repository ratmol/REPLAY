import { useEffect, useState } from "react";
import type { RunSummary } from "replay-shared";
import { fetchRuns } from "../api";
import RunRow, { RUN_ROW_DESKTOP_ONLY, RUN_ROW_GRID } from "../components/RunRow";
import StateMessage from "../components/StateMessage";
import FlightDeck from "../components/FlightDeck";
import SpecSection from "../components/SpecSection";
import InstrumentPanel from "../components/InstrumentPanel";

type LoadState =
  { kind: "loading" } | { kind: "error"; message: string } | { kind: "loaded"; runs: RunSummary[] };

export default function RunsListPage() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

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

  // Prefer a completed run for the hero - a nicer first impression than a
  // still-running or failed one, but either works if that's all there is.
  const previewRun =
    state.kind === "loaded"
      ? (state.runs.find((run) => run.status === "completed") ?? state.runs[0])
      : undefined;

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
        <h2 className="text-headline font-medium text-ink">Recorded runs</h2>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-muted">
          A run is one complete execution of an agent - from the moment it starts to the moment it
          stops, including every model call, tool call, retry and error in between. Each row below
          is one of those, recorded through the real SDK into this collector. Open one to replay it
          step by step on a timeline.
        </p>
        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs text-ink-faint">
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

        <div className="mt-8">
          {state.kind === "loading" && <StateMessage kind="loading" message="Loading runs" />}
          {state.kind === "error" && <StateMessage kind="error" message={state.message} />}
          {state.kind === "loaded" && state.runs.length === 0 && (
            <StateMessage kind="empty" message="No runs recorded yet." />
          )}
          {state.kind === "loaded" && state.runs.length > 0 && (
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
              <ul className="divide-y divide-border px-5 md:px-6">
                {state.runs.map((run) => (
                  <li key={run.id}>
                    <RunRow run={run} />
                  </li>
                ))}
              </ul>
            </InstrumentPanel>
          )}
        </div>
      </section>

      <SpecSection />
    </div>
  );
}
