// Collector API client. Trusts the response shape (dashboard.md: "Trust data
// from the collector. No re-validation of parsed events here") - the
// collector already validated everything on the way in, and its response
// types are shared via replay-shared's RunSummary, not re-checked here.

import type { RunSummary } from "replay-shared";

// No .env mechanism yet: every other package in this repo defaults to
// localhost:4747 (the collector's own default port), so the dashboard does
// too. VITE_COLLECTOR_URL exists for later (the Vercel demo, roadmap 4.2)
// without needing a committed .env file now.
const API_BASE = (import.meta.env.VITE_COLLECTOR_URL as string | undefined) ?? "http://localhost:4747";

export async function fetchRuns(): Promise<RunSummary[]> {
  const response = await fetch(`${API_BASE}/runs`);
  if (!response.ok) {
    throw new Error(`GET /runs failed: ${response.status}`);
  }
  const body = (await response.json()) as { runs: RunSummary[] };
  return body.runs;
}
