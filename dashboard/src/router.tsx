// Minimal client-side router. Two routes total (runs list, run detail) don't
// justify a routing library - this is the History API plus a small context,
// not something worth owning for its own sake the way the timeline is.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface RouterContextValue {
  path: string;
  search: string;
  navigate: (to: string) => void;
  setSearchParam: (key: string, value: string | null) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(window.location.pathname);
  const [search, setSearch] = useState(window.location.search);

  useEffect(() => {
    const onPopState = () => {
      setPath(window.location.pathname);
      setSearch(window.location.search);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (to: string): void => {
    window.history.pushState(null, "", to);
    const [pathname, hash] = to.split("#");
    setPath((pathname ?? to).split("?")[0] ?? "/");
    setSearch(new URL(to, window.location.origin).search);
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

  /**
   * Writes one query parameter without adding a history entry.
   *
   * replaceState rather than pushState on purpose: selecting events is
   * something you do a dozen times while reading a run, and each selection
   * becoming a back-button stop would make the back button useless for
   * actually leaving the page. The URL stays shareable either way, which is
   * the point - a link to a specific event is how you hand a colleague the
   * exact step that broke.
   */
  const setSearchParam = (key: string, value: string | null): void => {
    const params = new URLSearchParams(window.location.search);
    if (value === null) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const nextSearch = params.toString();
    const url = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
    window.history.replaceState(null, "", url);
    setSearch(nextSearch ? `?${nextSearch}` : "");
  };

  return (
    <RouterContext.Provider value={{ path, search, navigate, setSearchParam }}>
      {children}
    </RouterContext.Provider>
  );
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

/**
 * One query parameter's current value, plus a setter that keeps the URL and
 * the component in step. Returning a tuple mirrors useState deliberately: at
 * the call site this is state that happens to live in the address bar.
 */
export function useSearchParam(key: string): [string | null, (value: string | null) => void] {
  const { search, setSearchParam } = useRouter();
  const value = new URLSearchParams(search).get(key);
  return [value, (next: string | null) => setSearchParam(key, next)];
}

export function useCurrentPath(): string {
  return useRouter().path;
}

interface LinkProps {
  to: string;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}

export function Link({ to, children, className, ...rest }: LinkProps) {
  const navigate = useNavigate();
  return (
    <a
      href={to}
      className={className}
      {...rest}
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
