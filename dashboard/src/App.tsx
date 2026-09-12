import { useCurrentPath, Link } from "./router";
import RunsListPage from "./pages/RunsListPage";
import RunDetailPage from "./pages/RunDetailPage";
import ShortcutOverlay from "./components/ShortcutOverlay";

const RUN_DETAIL_PATTERN = /^\/runs\/([^/]+)\/?$/;

export default function App() {
  const path = useCurrentPath();
  const match = path.match(RUN_DETAIL_PATTERN);
  const isHome = path === "/";

  return (
    <div className="mx-auto max-w-[1400px] px-6 md:px-10">
      <SiteHeader isLanding={isHome} />
      {/* The header floats over the page so the landing hero can pin to
          top-0 and occupy a full viewport exactly. Content that is not the
          hero pushes itself clear of it with this padding; the hero cancels
          it with a matching negative margin. */}
      <main className="pt-20">
        {match ? (
          <RunDetailPage runId={decodeURIComponent(match[1]!)} />
        ) : isHome ? (
          <RunsListPage />
        ) : (
          <NotFoundPage />
        )}
      </main>
      <SiteFooter />
      <ShortcutOverlay />
    </div>
  );
}

// A path matching neither route (a stale link, a typo) previously fell
// through to the landing page with no indication anything was wrong. This
// is deliberately small - a portfolio dashboard with two real routes
// doesn't need a designed 404 page, just an honest one.
function NotFoundPage() {
  return (
    <div className="mt-16 flex flex-col items-start gap-4">
      <p className="font-mono text-micro uppercase text-steel">404</p>
      <h2 className="text-headline font-medium text-ink">Nothing recorded here</h2>
      <p className="max-w-md text-lg leading-relaxed text-ink-muted">
        There&apos;s no page at this address.
      </p>
      <Link to="/" className="font-mono text-sm text-brass hover:text-signal">
        &larr; All runs
      </Link>
    </div>
  );
}

function SiteHeader({ isLanding }: { isLanding: boolean }) {
  return (
    // The fade is load-bearing, not decoration: the header floats over live
    // content, and without a ground behind it the wordmark collides with
    // whatever text scrolls underneath. A gradient rather than a blur panel -
    // the page has no glass anywhere else.
    <header className="fixed inset-x-0 top-0 z-30 bg-gradient-to-b from-surface-deep via-surface-deep/85 to-transparent pb-8">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-6 pt-6 md:px-10">
        <Link to="/" className="font-mono text-sm tracking-[0.2em] text-ink">
          REPLAY
        </Link>
        <nav className="flex items-center gap-6 font-mono text-micro uppercase text-ink-faint">
          {/* An in-page anchor only exists on the landing page. On a run
              detail page the same nav item has to navigate home instead, or
              it is a link that visibly does nothing. */}
          {isLanding ? (
            <a href="#runs" className="transition-colors hover:text-ink">
              Runs
            </a>
          ) : (
            <Link to="/#runs" className="transition-colors hover:text-ink">
              Runs
            </Link>
          )}
          <span className="hidden font-mono text-micro uppercase text-steel-dim sm:inline">
            Press ? for keys
          </span>
          <a
            href="https://github.com/ratmol/REPLAY"
            className="transition-colors hover:text-signal"
            target="_blank"
            rel="noreferrer"
          >
            Source
          </a>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-24 flex flex-wrap items-center justify-between gap-3 border-t border-border py-8 font-mono text-micro uppercase text-ink-faint">
      <span>Replay &middot; flight recorder for AI agents</span>
      <span>SDK &rarr; collector &rarr; SQLite &rarr; this page</span>
    </footer>
  );
}
