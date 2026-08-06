import { useCurrentPath } from "./router";
import RunsListPage from "./pages/RunsListPage";
import RunDetailPage from "./pages/RunDetailPage";

const RUN_DETAIL_PATTERN = /^\/runs\/([^/]+)\/?$/;

export default function App() {
  const path = useCurrentPath();
  const match = path.match(RUN_DETAIL_PATTERN);

  return (
    <main className="min-h-screen px-6 py-8">
      <h1 className="font-mono text-lg tracking-wide text-ink">replay</h1>
      <div className="mt-6">
        {match ? <RunDetailPage runId={decodeURIComponent(match[1]!)} /> : <RunsListPage />}
      </div>
    </main>
  );
}
