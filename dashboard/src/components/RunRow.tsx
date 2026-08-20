import type { RunSummary } from "replay-shared";
import { Link } from "../router";

export const STATUS_COLOR: Record<RunSummary["status"], string> = {
  running: "text-status-running",
  completed: "text-status-completed",
  failed: "text-status-failed",
};

function formatDuration(startedAt: string, endedAt?: string): string {
  if (!endedAt) {
    return "running";
  }
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatCost(costUsd: number): string {
  return `$${costUsd.toFixed(4)}`;
}

// Shared between RunRow and RunsListPage's header row so the column labels
// actually line up with the data beneath them - a plain flex row (the
// previous layout) only looks aligned by coincidence, since duration/cost
// text widths vary row to row ("502ms" vs "2s" vs "4m 12s").
// Below md the model and duration columns are hidden (see RunRow / the
// header row): five fixed-ish columns need ~434px of track and would push a
// 375px phone into horizontal scroll. Status, name, and cost are the three
// that answer "which run do I want".
export const RUN_ROW_GRID =
  "grid grid-cols-[64px_1fr_80px] items-center gap-3 md:grid-cols-[90px_1fr_120px_70px_90px] md:gap-4";
export const RUN_ROW_DESKTOP_ONLY = "hidden md:block";

interface RunRowProps {
  run: RunSummary;
}

export default function RunRow({ run }: RunRowProps) {
  return (
    <Link
      to={`/runs/${run.id}`}
      className={`${RUN_ROW_GRID} group py-4 transition-colors duration-150 hover:bg-surface-overlay`}
    >
      <span className={`font-mono text-xs uppercase tracking-wide ${STATUS_COLOR[run.status]}`}>
        {run.status}
      </span>
      {/* A transport caret that slides in on hover - the row's "press play"
          affordance, and the only motion in the list. */}
      <span className="flex min-w-0 items-center gap-2 text-ink">
        <span
          aria-hidden="true"
          className="-ml-3 text-signal opacity-0 transition-all duration-150 group-hover:ml-0 group-hover:opacity-100"
        >
          &#9654;
        </span>
        <span className="truncate">{run.name}</span>
      </span>
      <span className={RUN_ROW_DESKTOP_ONLY}>
        {run.model && (
          <span className="rounded border border-border px-2 py-0.5 font-mono text-xs text-ink-muted">
            {run.model}
          </span>
        )}
      </span>
      <span className={`${RUN_ROW_DESKTOP_ONLY} text-right font-mono text-xs text-ink-muted`}>
        {formatDuration(run.startedAt, run.endedAt)}
      </span>
      <span className="text-right font-mono text-xs text-ink-muted">
        {formatCost(run.totalCostUsd)}
      </span>
    </Link>
  );
}
