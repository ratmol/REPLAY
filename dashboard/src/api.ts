// Collector API client. Trusts the response shape (dashboard.md: "Trust data
// from the collector. No re-validation of parsed events here") - the
// collector already validated everything on the way in, and its response
// types are shared via replay-shared's RunSummary, not re-checked here.

import type { EventRecord, RunSummary } from "replay-shared";

// No .env mechanism yet: every other package in this repo defaults to
// localhost:4747 (the collector's own default port), so the dashboard does
// too. VITE_COLLECTOR_URL exists for a future deployed environment without
// needing a committed .env file now.
const API_BASE =
  (import.meta.env.VITE_COLLECTOR_URL as string | undefined) ?? "http://localhost:4747";

export async function fetchRuns(): Promise<RunSummary[]> {
  // Ask for more than the collector's default page (50). The list view
  // filters and paginates client-side, so it wants the whole set in hand;
  // 200 is the collector's hard max and a comfortable ceiling for a demo.
  const response = await fetch(`${API_BASE}/runs?limit=200`);
  if (!response.ok) {
    throw new Error(`GET /runs failed: ${response.status}`);
  }
  const body = (await response.json()) as { runs: RunSummary[] };
  return body.runs;
}

export async function fetchRun(runId: string): Promise<RunSummary> {
  const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(runId)}`);
  if (!response.ok) {
    throw new Error(`GET /runs/${runId} failed: ${response.status}`);
  }
  return (await response.json()) as RunSummary;
}

// Fetches a single page (collector default: first 500 events by seq). A run
// with more events than that only shows the first 500 on the timeline -
// full cursor-pagination looping is a reasonable v2, not core to "v1".
export async function fetchEvents(runId: string): Promise<EventRecord[]> {
  const response = await fetch(`${API_BASE}/runs/${encodeURIComponent(runId)}/events`);
  if (!response.ok) {
    throw new Error(`GET /runs/${runId}/events failed: ${response.status}`);
  }
  const body = (await response.json()) as { events: EventRecord[] };
  return body.events;
}
