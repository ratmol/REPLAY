import { useEffect, useState } from "react";
import type { RunSummary } from "replay-shared";
import { fetchRuns } from "../api";
import RunRow from "../components/RunRow";

// Minimal functional loading/error/empty handling only - a fetching page
// can't work without *some* behavior for these. The actual VHS-styled
// treatment for them is a later polish pass, not this one.
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

  if (state.kind === "loading") {
    return <p className="text-sm text-ink-muted">Loading runs...</p>;
  }

  if (state.kind === "error") {
    return <p className="text-sm text-status-failed">{state.message}</p>;
  }

  if (state.runs.length === 0) {
    return <p className="text-sm text-ink-muted">No runs recorded yet.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {state.runs.map((run) => (
        <li key={run.id}>
          <RunRow run={run} />
        </li>
      ))}
    </ul>
  );
}
