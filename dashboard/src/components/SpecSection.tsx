// The bottom of the landing page: what Replay actually is, stated as
// checkable facts rather than claims. Everything here is verifiable against
// the source in one click - the event types are the schema's, the endpoints
// are the collector's, and the guarantees are the ones the test suite
// enforces. That is the point: a landing page for a developer tool earns
// trust by being specific, not by being enthusiastic.
//
// The code block and the API table sit inside InstrumentPanel, same framing
// as the runs table - before this they were just a bordered <pre> and a bare
// <table> floating on the page background, which is what made this section
// read as generic docs bolted onto the flight deck rather than the same
// instrument.

import InstrumentPanel from "./InstrumentPanel";
import Reveal from "./Reveal";
import { EVENT_CATEGORY, EVENT_TEXT } from "../lib/eventColor";
import type { EventType } from "replay-shared";

const QUICKSTART = `import { Replay } from "replay-sdk";

const replay = new Replay({ endpoint: "http://localhost:4747", onError: console.error });
const run = replay.startRun({ name: "support-agent", model: "gpt-4o-mini" });

run.logEvent({ type: "tool_call", payload: { toolName: "search", args: { q } } });

await run.end({ status: "completed" });`;

const EVENT_TYPES = [
  "run_start",
  "llm_call",
  "llm_response",
  "tool_call",
  "tool_result",
  "retry",
  "error",
  "agent_decision",
  "run_end",
];

const ENDPOINTS = [
  { method: "POST", path: "/runs", note: "open a run" },
  { method: "POST", path: "/runs/:id/events", note: "append a batch" },
  { method: "PATCH", path: "/runs/:id", note: "close it out" },
  { method: "GET", path: "/runs", note: "list" },
  { method: "GET", path: "/runs/:id", note: "run plus derived totals" },
  { method: "GET", path: "/runs/:id/events", note: "the log itself" },
];

const GUARANTEES = [
  {
    title: "The SDK cannot crash your agent",
    body: "Every network call, serialization and flush is wrapped. If the collector is down, slow, or returning garbage, your run behaves exactly as it would without this library.",
  },
  {
    title: "Zero runtime dependencies",
    body: "The SDK imports nothing at runtime. A build-time check fails the suite if a dependency is ever added, so this stays true rather than being true today.",
  },
  {
    title: "The log is append-only",
    body: "Events are never updated in place. Cost and token totals are derived from the log, so the numbers and the evidence for them can never disagree.",
  },
  {
    title: "Ordered by sequence, not by clock",
    body: "(run_id, seq) is the ordering key. Clocks drift and retried batches arrive out of order; timestamps position events on the timeline, seq orders and de-duplicates them.",
  },
];

export default function SpecSection() {
  return (
    <section id="spec" className="mt-24 scroll-mt-24 border-t border-border pt-10">
      <h2 className="text-headline font-medium text-ink">The short version</h2>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-muted">
        An SDK instruments your agent, a collector validates and stores what happened, and this
        dashboard replays it. Three packages, one SQLite file, no hosted service to sign up for.
      </p>

      {/* min-w-0 on the columns: a grid item defaults to min-width:auto, so
          the code block's longest line forces the whole track wider than the
          viewport instead of scrolling inside its own overflow-x-auto box. */}
      <div className="mt-12 grid gap-12 lg:grid-cols-2">
        <Reveal className="min-w-0">
          <h3 className="font-mono text-micro uppercase text-brass">Add it to an agent</h3>
          <p className="mt-3 text-sm text-ink-muted">
            Start the collector first (<code className="font-mono">pnpm dev:collector</code>,
            :4747) - the SDK fails silently without <code className="font-mono">onError</code>.
          </p>
          <InstrumentPanel className="mt-3 overflow-x-auto p-5">
            <pre className="font-mono text-sm leading-relaxed text-ink-muted">{QUICKSTART}</pre>
          </InstrumentPanel>

          <h3 className="mt-10 font-mono text-micro uppercase text-brass">Nine event types</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {EVENT_TYPES.map((type) => (
              <li
                key={type}
                className={`border border-steel-deep bg-glass px-2 py-1 font-mono text-sm ${EVENT_TEXT[EVENT_CATEGORY[type as EventType]]}`}
              >
                {type}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal className="min-w-0" delayMs={120}>
          <h3 className="font-mono text-micro uppercase text-brass">The whole API</h3>
          <InstrumentPanel className="mt-3 p-5">
            <table className="w-full border-collapse">
              <tbody>
                {ENDPOINTS.map((endpoint) => (
                  <tr
                    key={`${endpoint.method} ${endpoint.path}`}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="py-2 pr-3 align-top font-mono text-sm text-signal">
                      {endpoint.method}
                    </td>
                    <td className="py-2 pr-3 align-top font-mono text-sm text-ink">
                      {endpoint.path}
                    </td>
                    <td className="py-2 text-right align-top text-sm text-ink-muted">
                      {endpoint.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </InstrumentPanel>

          <h3 className="mt-10 font-mono text-micro uppercase text-brass">What it promises</h3>
          <dl className="mt-3 space-y-5">
            {GUARANTEES.map((guarantee) => (
              <div key={guarantee.title}>
                <dt className="text-base text-ink">{guarantee.title}</dt>
                <dd className="mt-1 text-base leading-relaxed text-ink-muted">{guarantee.body}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
