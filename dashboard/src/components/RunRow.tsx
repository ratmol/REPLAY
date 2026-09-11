import type { RunSummary } from "replay-shared";
import { Link } from "../router";
import { runDurationMs } from "../lib/runFilter";

export const STATUS_COLOR: Record<RunSummary["status"], string> = {
  running: "text-status-running",
  completed: "text-status-completed",
  failed: "text-status-failed",
};

function formatDurationMs(ms: number): string {
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

// runFilter's "Longest" sort ranks a still-running run by elapsed time (via
// runDurationMs, measured to now), but this used to just render the word
// "running" with no number - so a stale running run topping that sort
// looked broken rather than like the sort doing its job. Reusing
// runDurationMs here means the number in the row is the same one the sort
// is actually ranking by.
function formatDuration(run: RunSummary): string {
  if (run.status === "running") {
    return `running · ${formatDurationMs(runDurationMs(run, Date.now()))}`;
  }
  if (!run.endedAt) {
    return "running";
  }
  return formatDurationMs(new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime());
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
  "grid grid-cols-[64px_1fr_80px] items-center gap-3 md:grid-cols-[90px_1fr_150px_70px_90px] md:gap-4";
export const RUN_ROW_DESKTOP_ONLY = "hidden md:block";

interface RunRowProps {
  run: RunSummary;
  pinned: boolean;
  onTogglePin: (runId: string) => void;
}

export default function RunRow({ run, pinned, onTogglePin }: RunRowProps) {
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
        <button
          type="button"
          aria-pressed={pinned}
          aria-label={pinned ? `Unpin ${run.name}` : `Pin ${run.name}`}
          // The row itself is the link (the whole thing navigates on click),
          // so this nested button must stop the click from reaching it:
          // preventDefault blocks the anchor's own navigation, stopPropagation
          // stops it from also reaching Link's own routing handler.
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onTogglePin(run.id);
          }}
          className={`shrink-0 font-mono text-sm leading-none transition-colors ${
            pinned
              ? "text-signal"
              : "text-steel-dim opacity-0 group-hover:opacity-100 hover:text-ink"
          }`}
        >
          {pinned ? "★" : "☆"}
        </button>
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
          <span className="inline-block whitespace-nowrap rounded-sm border border-steel-deep bg-glass px-2 py-0.5 font-mono text-xs text-brass">
            {run.model}
          </span>
        )}
      </span>
      <span className={`${RUN_ROW_DESKTOP_ONLY} text-right font-mono text-xs text-ink-muted`}>
        {formatDuration(run)}
      </span>
      <span className="text-right font-mono text-xs text-ink-muted">
        {formatCost(run.totalCostUsd)}
      </span>
    </Link>
  );
}
