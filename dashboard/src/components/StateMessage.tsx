// Shared loading/error/empty treatment for every fetching page. Before this,
// each page had its own ad-hoc <p> tag for these three states (functional,
// unstyled - see the "later polish pass" comments they replaced). Three
// call sites with the same visual job is exactly the point where a small
// shared component earns its keep over three near-identical inline blocks.

type StateMessageKind = "loading" | "error" | "empty";

interface StateMessageProps {
  kind: StateMessageKind;
  message: string;
}

export default function StateMessage({ kind, message }: StateMessageProps) {
  if (kind === "error") {
    return (
      <div className="rounded border border-status-failed/40 bg-status-failed/5 px-4 py-3">
        <p className="font-mono text-xs text-status-failed">{message}</p>
      </div>
    );
  }

  if (kind === "empty") {
    return (
      <div className="rounded border border-dashed border-border px-4 py-6 text-center">
        <p className="font-mono text-xs text-ink-faint">{message}</p>
      </div>
    );
  }

  return (
    <p className="flex items-center gap-2 font-mono text-xs text-ink-muted">
      {message}
      <span className="flex items-center gap-0.5" aria-hidden="true">
        <span className="h-1 w-1 rounded-full bg-phosphor-dim animate-loading-pulse [animation-delay:0ms]" />
        <span className="h-1 w-1 rounded-full bg-phosphor-dim animate-loading-pulse [animation-delay:160ms]" />
        <span className="h-1 w-1 rounded-full bg-phosphor-dim animate-loading-pulse [animation-delay:320ms]" />
      </span>
    </p>
  );
}
