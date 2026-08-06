import type { RunSummary } from "replay-shared";
import { Link } from "../router";

const STATUS_COLOR: Record<RunSummary["status"], string> = {
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

interface RunRowProps {
  run: RunSummary;
}

export default function RunRow({ run }: RunRowProps) {
  return (
    <Link
      to={`/runs/${run.id}`}
      className="flex items-center gap-4 py-3 hover:bg-surface-overlay"
    >
      <span className={`font-mono text-xs uppercase tracking-wide ${STATUS_COLOR[run.status]}`}>
        {run.status}
      </span>
      <span className="flex-1 truncate text-ink">{run.name}</span>
      {run.model && (
        <span className="rounded border border-border px-2 py-0.5 font-mono text-xs text-ink-muted">
          {run.model}
        </span>
      )}
      <span className="font-mono text-xs text-ink-muted">
        {formatDuration(run.startedAt, run.endedAt)}
      </span>
      <span className="font-mono text-xs text-ink-muted">{formatCost(run.totalCostUsd)}</span>
    </Link>
  );
}
