import { useEffect, useState } from "react";
import type { EventRecord, RunSummary } from "replay-shared";
import { fetchEvents, fetchRun } from "../api";
import { Link } from "../router";
import Timeline from "../components/Timeline";

interface RunDetailPageProps {
  runId: string;
}

// Minimal functional loading/error handling only, same call as
// RunsListPage - the styled treatment is roadmap 2.7's job.
type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; run: RunSummary; events: EventRecord[] };

export default function RunDetailPage({ runId }: RunDetailPageProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    Promise.all([fetchRun(runId), fetchEvents(runId)])
      .then(([run, events]) => {
        if (!cancelled) {
          setState({ kind: "loaded", run, events });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Failed to load run";
          setState({ kind: "error", message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  return (
    <div>
      <Link to="/" className="text-sm text-ink-muted hover:text-ink">
        &larr; Runs
      </Link>

      {state.kind === "loading" && <p className="mt-4 text-sm text-ink-muted">Loading run...</p>}

      {state.kind === "error" && <p className="mt-4 text-sm text-status-failed">{state.message}</p>}

      {state.kind === "loaded" && (
        <div className="mt-4">
          <h2 className="text-ink">{state.run.name}</h2>
          <p className="mt-1 font-mono text-xs text-ink-muted">
            {state.run.status}
            {state.run.model ? ` · ${state.run.model}` : ""}
          </p>
          <div className="mt-6">
            <Timeline events={state.events} />
          </div>
        </div>
      )}
    </div>
  );
}
