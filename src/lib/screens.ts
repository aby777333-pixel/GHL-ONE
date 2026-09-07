/** Screen governance helpers shared by the proxy, the shell and client components. Mirrors `effective_screens()` rows. */
export type Screen = {
  key: string;
  label: string;
  path: string;
  grp: string;
  allowed: boolean;
  source: string;
  sort_order: number;
};

/** Paths that are never governed by the screen catalogue. */
const UNGOVERNED = ["/no-access", "/policies", "/broadcasts", "/status", "/privacy", "/profile", "/settings"];

/** Longest path-prefix match. "/" only matches the home route itself. */
export function matchScreen(screens: Screen[], pathname: string): Screen | undefined {
  if (UNGOVERNED.some((p) => pathname === p || pathname.startsWith(p + "/"))) return undefined;
  let best: Screen | undefined;
  for (const s of screens) {
    if (s.path === "/") {
      if (pathname === "/") best = best && best.path.length > 1 ? best : s;
      continue;
    }
    if (pathname === s.path || pathname.startsWith(s.path + "/")) {
      if (!best || s.path.length > best.path.length) best = s;
    }
  }
  return best;
}

export function isPathAllowed(screens: Screen[] | undefined, pathname: string): boolean {
  if (!screens || !screens.length) return true;
  const s = matchScreen(screens, pathname);
  return s ? s.allowed : true;
}
