import type { EventRecord, RunSummary } from "replay-shared";
import { buildCostSteps, type CostStep } from "../lib/cost";
import InstrumentPanel from "./InstrumentPanel";
import Readout from "./Readout";
import { EVENT_CATEGORY, EVENT_TEXT } from "../lib/eventColor";

const SPARKLINE_WIDTH = 240;
const SPARKLINE_HEIGHT = 32;

function formatCost(costUsd: number): string {
  return `$${costUsd.toFixed(4)}`;
}

function formatTokens(tokens: number): string {
  return tokens.toLocaleString();
}

interface CostPanelProps {
  run: RunSummary;
  events: EventRecord[];
}

// Totals in the summary strip come from `run` (the collector's derived,
// authoritative sum over ALL of a run's events - shared.md invariant 3),
// never from summing the fetched `events` array here: fetchEvents only
// returns the first page (api.ts's documented 500-event cap), so a
// client-side sum would silently undercount cost on a long run. The
// sparkline and per-step list below are necessarily scoped to that fetched
// page, same as the timeline already is.
export default function CostPanel({ run, events }: CostPanelProps) {
  const startMs = events.length > 0 ? new Date(events[0]!.timestamp).getTime() : 0;
  const steps = buildCostSteps(events, startMs);

  return (
    <InstrumentPanel className="p-5 md:p-6">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <Readout label="Total cost" tone="signal">
          {formatCost(run.totalCostUsd)}
        </Readout>
        <Readout label="Tokens in">{formatTokens(run.totalTokensIn)}</Readout>
        <Readout label="Tokens out">{formatTokens(run.totalTokensOut)}</Readout>
      </div>

      {steps.length === 0 ? (
        <p className="mt-4 font-mono text-sm text-steel">
          No per-step cost or token data recorded for this run.
        </p>
      ) : (
        <>
          <div className="mt-4">
            <p className="mb-2 font-mono text-micro uppercase text-steel">Cost over time</p>
            <Sparkline steps={steps} />
          </div>

          <div className="mt-4 max-h-40 overflow-auto">
            <table className="w-full max-w-xl font-mono text-sm">
              <tbody>
                {steps.map((step) => (
                  <tr key={step.seq} className="border-t border-border first:border-t-0">
                    <td className="py-1.5 pr-3 text-steel">{step.seq}</td>
                    <td className={`py-1.5 pr-3 ${EVENT_TEXT[EVENT_CATEGORY[step.type]]}`}>
                      {step.type}
                    </td>
                    <td className="py-1.5 pr-3 text-ink">{formatCost(step.costUsd)}</td>
                    <td className="py-1.5 text-steel">
                      {[
                        step.tokensIn !== undefined ? `in ${step.tokensIn}` : null,
                        step.tokensOut !== undefined ? `out ${step.tokensOut}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </InstrumentPanel>
  );
}

function Sparkline({ steps }: { steps: CostStep[] }) {
  const last = steps[steps.length - 1]!;
  // costUsd is schema-guaranteed >= 0 (docs/EVENT_SCHEMA.md section 2), so the
  // cumulative sum is monotonically non-decreasing - the last step's total is
  // always the max, no separate Math.max scan needed. `|| 1` guards the
  // divide when every step so far is free (elapsed 0 or cost 0), not a
  // real-data case this project expects to hit often.
  const maxElapsed = last.elapsedMs || 1;
  const maxCost = last.cumulativeCostUsd || 1;

  if (steps.length === 1) {
    return (
      <svg width={SPARKLINE_WIDTH} height={SPARKLINE_HEIGHT} className="block">
        <circle cx={0} cy={SPARKLINE_HEIGHT} r={3} className="fill-signal" />
      </svg>
    );
  }

  const points = steps
    .map((step) => {
      const x = (step.elapsedMs / maxElapsed) * SPARKLINE_WIDTH;
      const y = SPARKLINE_HEIGHT - (step.cumulativeCostUsd / maxCost) * SPARKLINE_HEIGHT;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={SPARKLINE_WIDTH} height={SPARKLINE_HEIGHT} className="block">
      <polyline points={points} fill="none" className="stroke-signal" strokeWidth={1.5} />
    </svg>
  );
}
