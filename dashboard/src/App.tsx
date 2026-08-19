import { useCurrentPath } from "./router";
import RunsListPage from "./pages/RunsListPage";
import RunDetailPage from "./pages/RunDetailPage";

const RUN_DETAIL_PATTERN = /^\/runs\/([^/]+)\/?$/;

export default function App() {
  const path = useCurrentPath();
  const match = path.match(RUN_DETAIL_PATTERN);

  return (
    <>
      {/* Scanlines are ambient (present for the whole session, not just on
          load) and deliberately faint - 3.5% opacity was chosen by eye
          against the actual JSON payload text in EventInspector, since
          dashboard.md is explicit that a CRT effect gets cut the moment it
          makes a trace harder to read. Fixed + pointer-events-none so it
          never intercepts clicks/drags on the timeline underneath it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-50 bg-[repeating-linear-gradient(to_bottom,transparent_0px,transparent_2px,rgba(0,0,0,0.035)_3px,rgba(0,0,0,0.035)_4px)]"
      />
      {/* animate-crt-wobble plays once because <main> mounts once per page
          load - the router swaps only the child below it, not this node -
          so it never replays on run-to-run navigation. */}
      <main className="min-h-screen animate-crt-wobble px-6 py-8">
        <h1 className="font-mono text-lg tracking-wide text-ink">replay</h1>
        <p className="mt-1 text-xs text-ink-muted">
          Flight recorder for AI agents - every tool call, retry, and dollar
          spent, recorded and replayable on a timeline.
        </p>
        <div className="mt-6">
          {match ? <RunDetailPage runId={decodeURIComponent(match[1]!)} /> : <RunsListPage />}
        </div>
      </main>
    </>
  );
}
