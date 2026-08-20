import { useEffect, useState } from "react";
import type { EventRecord, RunSummary } from "replay-shared";
import { fetchEvents, fetchRun } from "../api";
import { Link, useSearchParam } from "../router";
import Timeline from "../components/Timeline";
import EventInspector from "../components/EventInspector";
import CostPanel from "../components/CostPanel";
import StateMessage from "../components/StateMessage";
import Readout, { type ReadoutTone } from "../components/Readout";

// The status hues are already named on the Readout tone scale, so the run
// header reuses them instead of importing RunRow's text-colour map - one
// place decides what "failed" looks like.
const STATUS_TONE: Record<RunSummary["status"], ReadoutTone> = {
  running: "running",
  completed: "completed",
  failed: "failed",
};
import { useScrubber } from "../hooks/useScrubber";
import {
  isSameTimelineItem,
  itemBySeq,
  itemStartSeq,
  pairEvents,
  type TimelineItem,
} from "../lib/pairing";

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
  const [seqParam, setSeqParam] = useSearchParam("seq");

  function handleSelect(item: TimelineItem) {
    // Clicking the already-selected event closes the inspector instead of
    // re-selecting it - the common "toggle" behavior for a detail panel.
    //
    // Computed from `selected` rather than inside a setSelected updater: an
    // updater runs during render, and calling the URL setter from in there
    // updates the router while this component is rendering. React warns about
    // exactly that, and it is a real hazard rather than a style note - the two
    // states can be committed out of step.
    const next = isSameTimelineItem(selected, item) ? null : item;
    setSelected(next);
    setSeqParam(next ? String(itemStartSeq(next)) : null);
  }

  function handleClose() {
    setSelected(null);
    setSeqParam(null);
  }

  // Restore a shared ?seq= link once the events for this run have arrived.
  // Keyed on the parameter and the loaded events rather than run once on
  // mount, because the URL is readable long before there is anything to
  // resolve it against. Selecting is skipped when the same item is already
  // selected, so this never fights handleSelect for control of the panel.
  useEffect(() => {
    if (seqParam === null || events.length === 0) {
      return;
    }
    const seq = Number(seqParam);
    if (!Number.isInteger(seq)) {
      return;
    }
    const item = itemBySeq(pairEvents(events), seq);
    if (item) {
      setSelected((current) => (isSameTimelineItem(current, item) ? current : item));
    }
  }, [seqParam, events]);

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
      <Link to="/#runs" className="font-mono text-sm text-steel hover:text-ink">
        &larr; All runs
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
          <div className="mt-4 flex flex-wrap items-start gap-x-8 gap-y-4">
            <Readout label="Status" tone={STATUS_TONE[state.run.status]} size="sm">
              <span className="uppercase">{state.run.status}</span>
            </Readout>
            {state.run.agentName && (
              <Readout label="Agent" size="sm">
                {state.run.agentName}
              </Readout>
            )}
            {state.run.model && (
              <Readout label="Model" size="sm">
                {state.run.model}
              </Readout>
            )}
            <Readout label="Started" size="sm">
              {new Date(state.run.startedAt).toLocaleString()}
            </Readout>
          </div>
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
              <EventInspector item={selected} onClose={handleClose} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
