import { Link } from "../router";

interface RunDetailPageProps {
  runId: string;
}

// Scaffold only - the timeline (2.3), scrubber (2.4), and event inspector
// (2.5) all land on this page in later tasks.
export default function RunDetailPage({ runId }: RunDetailPageProps) {
  return (
    <div>
      <Link to="/" className="text-sm text-ink-muted hover:text-ink">
        &larr; Runs
      </Link>
      <p className="mt-4 text-sm text-ink-muted">
        Run <span className="font-mono text-ink">{runId}</span> - timeline lands in 2.3.
      </p>
    </div>
  );
}
