// Filter controls for the runs list: outcome chips, a text query, and a sort.
//
// The chips carry their counts because a filter that might return nothing is a
// filter people are afraid to click. Seeing "failed 2" before you press it
// means you already know what you are about to get, and an outcome with no
// runs is visibly empty rather than a dead end you discover by trying.

import { useEffect, useRef } from "react";
import type { RunQuery, RunSortKey, StatusFilter } from "../lib/runFilter";

const STATUS_ORDER: StatusFilter[] = ["all", "running", "completed", "failed"];

const STATUS_TONE: Record<StatusFilter, string> = {
  all: "text-ink",
  running: "text-status-running",
  completed: "text-status-completed",
  failed: "text-status-failed",
};

const SORTS: ReadonlyArray<{ key: RunSortKey; label: string }> = [
  { key: "recent", label: "Newest" },
  { key: "cost", label: "Costliest" },
  { key: "duration", label: "Longest" },
];

interface RunFilterBarProps {
  query: RunQuery;
  counts: Record<StatusFilter, number>;
  resultCount: number;
  totalCount: number;
  onChange: (query: RunQuery) => void;
}

export default function RunFilterBar({
  query,
  counts,
  resultCount,
  totalCount,
  onChange,
}: RunFilterBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // "/" to search is the convention this audience already has in their
      // fingers from GitHub, Linear and every tracing tool. Ignored while
      // another field has focus, so typing a slash into the query itself does
      // not fight the shortcut.
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      } else if (event.key === "Escape" && document.activeElement === inputRef.current) {
        // Escape inside the field clears the filter and lets go, rather than
        // only blurring: a filter you cannot get out of without reaching for
        // the mouse is worse than no shortcut at all.
        onChange({ ...query, text: "" });
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onChange, query]);

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_ORDER.map((status) => {
          const isActive = query.status === status;
          const count = counts[status];
          return (
            <button
              key={status}
              type="button"
              aria-pressed={isActive}
              disabled={count === 0 && status !== "all"}
              onClick={() => onChange({ ...query, status })}
              className={`rounded-sm border px-3 py-1.5 font-mono text-sm uppercase tracking-wide transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-35 ${
                isActive
                  ? `border-signal bg-surface-overlay ${STATUS_TONE[status]}`
                  : "border-steel-deep text-steel hover:border-steel-dim hover:text-ink"
              }`}
            >
              {status} <span className="text-steel-dim">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative">
          <span className="sr-only">Filter runs by name, agent or model</span>
          <input
            ref={inputRef}
            type="search"
            value={query.text}
            onChange={(event) => onChange({ ...query, text: event.target.value })}
            placeholder="Filter runs"
            className="w-56 rounded-sm border border-steel-deep bg-glass px-3 py-1.5 pr-10 font-mono text-sm text-ink shadow-glass placeholder:text-steel-dim"
          />
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-sm border border-steel-deep px-1.5 py-0.5 font-mono text-xs text-steel-dim"
          >
            /
          </kbd>
        </label>

        <div className="flex items-center gap-1">
          {SORTS.map((sort) => (
            <button
              key={sort.key}
              type="button"
              aria-pressed={query.sort === sort.key}
              onClick={() => onChange({ ...query, sort: sort.key })}
              className={`rounded-sm px-2.5 py-1.5 font-mono text-sm transition-colors duration-150 ${
                query.sort === sort.key ? "text-signal" : "text-steel hover:text-ink"
              }`}
            >
              {sort.label}
            </button>
          ))}
        </div>

        <p aria-live="polite" className="font-mono text-sm text-steel">
          {resultCount} of {totalCount}
        </p>
      </div>
    </div>
  );
}
