// Static landing content for the runs list page. Split out from
// RunsListPage so that file stays focused on data-fetching/state, not
// mixed with a few hundred lines of copy.

import type { ReactNode } from "react";

const QUICKSTART = `import { Replay } from "replay-sdk";

const replay = new Replay({ endpoint: "http://localhost:4747" });
const run = replay.startRun({ name: "my-agent", model: "gpt-4o-mini" });

run.logEvent({ type: "tool_call", payload: { toolName: "search", args: { q: "..." } } });
// ...the rest of your agent's existing logic...

await run.end({ status: "completed" });`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border py-6 first:border-t-0 first:pt-0">
      <h2 className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

export default function AboutSection() {
  return (
    <div className="max-w-2xl">
      <Section title="About">
        <p>
          Replay is a flight recorder for AI agents. An SDK instruments a
          run, a collector validates and stores what happened, and this
          dashboard replays it on a scrubbable timeline - like game
          footage, for debugging.
        </p>
      </Section>

      <Section title="What it solves">
        <p>
          Debugging an agent today usually means reading console logs and
          guessing why it looped, burned three dollars in tokens, or
          silently failed a tool call. Nothing shows what the agent
          actually did, in what order, or what it cost. Replay records
          every step - tool calls, model calls, retries, errors - as an
          append-only log, so there is always a complete, ordered record
          to step back through.
        </p>
      </Section>

      <Section title="How it works">
        <ol className="list-decimal space-y-2 pl-4">
          <li>
            <span className="text-ink">Instrument.</span> Drop the SDK into
            your agent - a few lines, zero runtime dependencies - and it
            starts recording tool calls, model calls, retries, and errors
            as they happen. If the collector is ever unreachable, your
            agent runs exactly as it would without this library.
          </li>
          <li>
            <span className="text-ink">Collect.</span> A small API
            validates each event and stores it, append-only, with cost and
            token counts attached. Run totals are derived from that log,
            never edited directly.
          </li>
          <li>
            <span className="text-ink">Replay.</span> This dashboard reads
            a run back and renders it on a timeline: scrub or step through
            events one at a time, inspect any payload, and see cost
            accumulate over the run.
          </li>
        </ol>
      </Section>

      <Section title="How to use it">
        <pre className="overflow-x-auto rounded border border-border bg-surface p-3 font-mono text-xs text-ink-muted">
          {QUICKSTART}
        </pre>
        <p className="mt-2">Then open this dashboard and click into the run.</p>
      </Section>
    </div>
  );
}
