// Minimal client-side router. Two routes total (runs list, run detail) don't
// justify a routing library - this is the History API plus a small context,
// not something worth owning for its own sake the way the timeline is.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface RouterContextValue {
  path: string;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (to: string): void => {
    window.history.pushState(null, "", to);
    const [pathname, hash] = to.split("#");
    setPath(pathname ?? to);
    // A pushState navigation does not move the viewport, so without this the
    // visitor keeps whatever scroll offset the previous page had - clicking
    // "Runs" from a run detail page left them at the top of the landing page
    // instead of at the runs list they asked for. The scroll is deferred a
    // frame because the target section does not exist in the DOM until the
    // new route has rendered. Back/forward are deliberately not touched, so
    // the browser can restore their positions itself.
    requestAnimationFrame(() => {
      const target = hash ? document.getElementById(hash) : null;
      if (target) {
        target.scrollIntoView({ block: "start" });
      } else {
        window.scrollTo(0, 0);
      }
    });
  };

  return <RouterContext.Provider value={{ path, navigate }}>{children}</RouterContext.Provider>;
}

function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error("useRouter/useNavigate/useCurrentPath must be used within a RouterProvider");
  }
  return ctx;
}

export function useNavigate(): (to: string) => void {
  return useRouter().navigate;
}

export function useCurrentPath(): string {
  return useRouter().path;
}

interface LinkProps {
  to: string;
  children: ReactNode;
  className?: string;
}

export function Link({ to, children, className }: LinkProps) {
  const navigate = useNavigate();
  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        // Let the browser handle new-tab/new-window clicks natively - a
        // router that always intercepts breaks ctrl/cmd-click and
        // middle-click, which a real routing library wouldn't get wrong.
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.altKey ||
          event.ctrlKey ||
          event.shiftKey
        ) {
          return;
        }
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
