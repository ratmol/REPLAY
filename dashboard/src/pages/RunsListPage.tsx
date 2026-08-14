import { useEffect, useState } from "react";
import type { RunSummary } from "replay-shared";
import { fetchRuns } from "../api";
import RunRow from "../components/RunRow";
import StateMessage from "../components/StateMessage";

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
    return <StateMessage kind="loading" message="Loading runs" />;
  }

  if (state.kind === "error") {
    return <StateMessage kind="error" message={state.message} />;
  }

  if (state.runs.length === 0) {
    return <StateMessage kind="empty" message="No runs recorded yet." />;
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
