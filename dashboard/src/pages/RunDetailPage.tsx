import { useEffect, useState } from "react";
import type { EventRecord, RunSummary } from "replay-shared";
import { fetchEvents, fetchRun } from "../api";
import { Link } from "../router";
import Timeline from "../components/Timeline";
import EventInspector from "../components/EventInspector";
import CostPanel from "../components/CostPanel";
import StateMessage from "../components/StateMessage";
import { STATUS_COLOR } from "../components/RunRow";
import { useScrubber } from "../hooks/useScrubber";
import { isSameTimelineItem, type TimelineItem } from "../lib/pairing";

interface RunDetailPageProps {
  runId: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "loaded"; run: RunSummary; events: EventRecord[] };

export default function RunDetailPage({ runId }: RunDetailPageProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  // Hooks can't be called conditionally, so this always runs, seeded with an
  // empty array before the real events arrive - useScrubber's own effect
  // resets the playhead once state.events actually changes.
  const events = state.kind === "loaded" ? state.events : [];
  const scrubber = useScrubber(events);
  const [selected, setSelected] = useState<TimelineItem | null>(null);

  function handleSelect(item: TimelineItem) {
    // Clicking the already-selected event closes the inspector instead of
    // re-selecting it - the common "toggle" behavior for a detail panel.
    setSelected((current) => (isSameTimelineItem(current, item) ? null : item));
  }

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    setSelected(null);
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

      {state.kind === "loading" && (
        <div className="mt-4">
          <StateMessage kind="loading" message="Loading run" />
        </div>
      )}

      {state.kind === "error" && (
        <div className="mt-4">
          <StateMessage kind="error" message={state.message} />
        </div>
      )}

      {state.kind === "loaded" && (
        <div className="mt-4">
          <h2 className="text-headline font-medium text-ink">{state.run.name}</h2>
          <p className="mt-1 font-mono text-xs text-ink-muted">
            <span className={`uppercase tracking-wide ${STATUS_COLOR[state.run.status]}`}>
              {state.run.status}
            </span>
            {state.run.model ? ` · ${state.run.model}` : ""}
            {" · "}
            {new Date(state.run.startedAt).toLocaleString()}
          </p>
          <div className="mt-6">
            <CostPanel run={state.run} events={state.events} />
          </div>

          <div className="mt-6 md:flex md:items-start md:gap-6">
            <div className="min-w-0 flex-1">
              <Timeline
                events={state.events}
                scrubber={scrubber}
                selected={selected}
                onSelect={handleSelect}
              />
            </div>
            <div className="mt-4 md:mt-0 md:w-80 md:shrink-0">
              <EventInspector item={selected} onClose={() => setSelected(null)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
