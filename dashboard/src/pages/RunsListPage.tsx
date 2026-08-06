import { Link } from "../router";

// Scaffold only - fetching real runs from GET /runs is roadmap 2.2.
export default function RunsListPage() {
  return (
    <div>
      <p className="text-sm text-ink-muted">Runs list - wired up to the collector in 2.2.</p>
      <Link to="/runs/demo" className="mt-4 inline-block text-sm text-phosphor hover:underline">
        View a run &rarr;
      </Link>
    </div>
  );
}
