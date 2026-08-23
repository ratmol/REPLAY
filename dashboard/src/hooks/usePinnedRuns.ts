import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "replay:pinned-runs";

function readStoredIds(): Set<string> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === "string"))
      : new Set();
  } catch {
    // Corrupt JSON or storage unavailable (private browsing, quota) -
    // pinning is a browser-local convenience, not data, so it degrades to
    // "nothing pinned" instead of breaking the page.
    return new Set();
  }
}

/**
 * Which runs this visitor has starred, kept in localStorage rather than the
 * collector: it is a preference about *their* view of the list, not part of
 * the run record itself, so it has no reason to round-trip through the API
 * or live in the runs table.
 */
export function usePinnedRuns() {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => readStoredIds());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...pinnedIds]));
    } catch {
      // Storage full or unavailable - the in-memory state still works for
      // this page view, it just will not survive a reload.
    }
  }, [pinnedIds]);

  const togglePin = useCallback((runId: string) => {
    setPinnedIds((current) => {
      const next = new Set(current);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  }, []);

  return { pinnedIds, togglePin };
}
