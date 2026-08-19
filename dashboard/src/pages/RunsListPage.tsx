import { useEffect, useState } from "react";
import type { RunSummary } from "replay-shared";
import { fetchRuns } from "../api";
import RunRow, { RUN_ROW_GRID } from "../components/RunRow";
import StateMessage from "../components/StateMessage";
import AboutSection from "../components/AboutSection";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; runs: RunSummary[] };

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

  return (
    <div>
      <AboutSection />

      <section className="mt-2 border-t border-border pt-6">
        <h2 className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
          Live runs
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Every run below was actually recorded through the SDK - this is
          real data from this collector, not a mockup.
        </p>

        <div className="mt-4">
          {state.kind === "loading" && <StateMessage kind="loading" message="Loading runs" />}
          {state.kind === "error" && <StateMessage kind="error" message={state.message} />}
          {state.kind === "loaded" && state.runs.length === 0 && (
            <StateMessage kind="empty" message="No runs recorded yet." />
          )}
          {state.kind === "loaded" && state.runs.length > 0 && (
            <div>
              <div
                className={`${RUN_ROW_GRID} border-b border-border pb-2 font-mono text-[10px] uppercase tracking-wide text-ink-faint`}
              >
                <span>Status</span>
                <span>Run</span>
                <span>Model</span>
                <span className="text-right">Duration</span>
                <span className="text-right">Cost</span>
              </div>
              <ul className="divide-y divide-border">
                {state.runs.map((run) => (
                  <li key={run.id}>
                    <RunRow run={run} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
