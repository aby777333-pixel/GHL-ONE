"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Menu as MenuIcon, Moon, MoonStar, PanelLeftClose, PanelLeftOpen, Plus, Search, Sun, LogOut, User, Settings, X, ChevronDown, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Avatar, Button, Kbd, Menu, MenuItem, ToastProvider } from "@/components/ui";
import { cn, fmtTime, ROLE_LABEL } from "@/lib/utils";
import { navFor, filterNav } from "./nav";
import { CommandPalette } from "./CommandPalette";
import { NotificationsPanel } from "./NotificationsPanel";
import { QuickCapture } from "./QuickCapture";
import { BuddyPanel, useBuddy } from "@/components/ai";
import { LiveProvider } from "@/components/live/LiveProvider";
import { CollaborateMenu } from "@/components/live/CollaborateMenu";
import { CollaborateButton } from "@/components/live/CollaborateButton";
import { Blink } from "@/components/providers/ActivityProvider";
import { ClockWidget } from "@/components/attendance";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { BreakGlassBanner } from "@/components/platform/BreakGlassDialog";
import { PushRegistrar } from "@/components/notifications/PushOptIn";

export type Counts = { inbox: number; approvals: number; chat: number };

const themeListeners = new Set<() => void>();
function subscribeTheme(cb: () => void) {
  themeListeners.add(cb);
  return () => { themeListeners.delete(cb); };
}
function useTheme() {
  const dark = React.useSyncExternalStore(subscribeTheme, () => document.documentElement.classList.contains("dark"), () => false);
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("ghl-theme", next ? "dark" : "light");
    } catch {}
    themeListeners.forEach((cb) => cb());
  };
  return { dark, toggle };
}

/**
 * Desktop sidebar collapse. The header hamburger used to be phone-only, so on a desktop it opened
 * a drawer that is itself `lg:hidden` — testers reported it as a button with no function. It now
 * genuinely collapses the rail, and the choice survives a reload.
 * Read through `useSyncExternalStore` (same shape as the theme above) so the server snapshot is
 * "open" and the client reads localStorage without a setState-in-effect cascade.
 */
const sidebarListeners = new Set<() => void>();
function subscribeSidebar(cb: () => void) {
  sidebarListeners.add(cb);
  return () => { sidebarListeners.delete(cb); };
}
function readSidebar() {
  try {
    return localStorage.getItem("ghl-sidebar") === "collapsed";
  } catch {
    return false;
  }
}
function useSidebarCollapsed() {
  const collapsed = React.useSyncExternalStore(subscribeSidebar, readSidebar, () => false);
  const toggle = React.useCallback(() => {
    try {
      localStorage.setItem("ghl-sidebar", readSidebar() ? "open" : "collapsed");
    } catch {}
    sidebarListeners.forEach((cb) => cb());
  }, []);
  return { collapsed, toggle };
}

export function AppShell({ children, initialCounts }: { children: React.ReactNode; initialCounts: Counts }) {
  const { profile, departments, screens, platformAdmin, permissions } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { dark, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { collapsed, toggle: toggleCollapsed } = useSidebarCollapsed();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [captureOpen, setCaptureOpen] = React.useState(false);
  const [askOpen, setAskOpen] = React.useState(false);
  const closeAsk = React.useCallback(() => setAskOpen(false), []);
  const { open: buddyOpen } = useBuddy();
  const [counts, setCounts] = React.useState<Counts>(initialCounts);
  const sections = React.useMemo(() => filterNav(navFor(profile.role, { platformAdmin, permissions }), screens), [profile.role, screens, platformAdmin, permissions]);
  const dept = departments.find((d) => d.id === profile.department_id);

  // Do not disturb (notification_prefs.dnd_until) — read once, refreshed every minute so the moon disappears on expiry.
  const [dndUntil, setDndUntil] = React.useState<string | null>(null);
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  React.useEffect(() => {
    let alive = true;
    createClient().from("notification_prefs").select("dnd_until").eq("user_id", profile.id).maybeSingle().then(({ data }) => {
      if (alive) setDndUntil(data?.dnd_until || null);
    });
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [profile.id]);
  const dndActive = !!dndUntil && Date.parse(dndUntil) > nowMs;
  async function setDnd(minutes: number | "tomorrow" | null) {
    let until: string | null = null;
    if (minutes === "tomorrow") {
      const t = new Date();
      t.setDate(t.getDate() + 1);
      t.setHours(8, 0, 0, 0);
      until = t.toISOString();
    } else if (typeof minutes === "number") until = new Date(Date.now() + minutes * 60_000).toISOString();
    const supabase = createClient();
    const { error } = await supabase.from("notification_prefs").upsert({ user_id: profile.id, dnd_until: until, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return;
    setDndUntil(until);
    setNowMs(Date.now());
    await supabase.from("profiles").update({ presence: until ? "dnd" : "available" }).eq("id", profile.id);
    router.refresh();
  }

  // Keyboard: Ctrl/Cmd+K palette, Ctrl/Cmd+J Ask GHL, "c" quick capture when not typing
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setAskOpen((o) => !o);
      }
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName) || target?.isContentEditable;
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "c" && !paletteOpen && !askOpen) {
        e.preventDefault();
        setCaptureOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [paletteOpen, askOpen]);

  // Realtime badge counts
  React.useEffect(() => {
    const supabase = createClient();
    const refresh = async () => {
      const [{ count: inbox }, { count: approvals }, { data: unread }] = await Promise.all([
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", profile.id).is("read_at", null),
        supabase.from("approvals").select("id", { count: "exact", head: true }).eq("approver_id", profile.id).eq("status", "pending"),
        supabase.rpc("my_unread_counts"),
      ]);
      setCounts({ inbox: inbox || 0, approvals: approvals || 0, chat: (unread || []).reduce((a, r) => a + Number(r.unread || 0), 0) });
    };
    const ch = supabase
      .channel("shell-counts")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${profile.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "channel_members", filter: `user_id=eq.${profile.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "approvals" }, refresh)
      .subscribe();
    // presence heartbeat
    supabase.from("profiles").update({ last_seen_at: new Date().toISOString(), presence: profile.presence === "offline" ? "available" : profile.presence }).eq("id", profile.id).then(() => {});
    const hb = setInterval(() => supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", profile.id).then(() => {}), 120000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(hb);
    };
  }, [profile.id, profile.presence]);

  /**
   * The nav contains nested paths (`/wiki` and `/wiki/questions`, `/platform` and `/platform/access`).
   * A plain prefix match lit both, so on Q&A the sidebar claimed two current sections. Only the
   * longest href that matches the current path is the active one.
   */
  const matches = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
  const activeHref = React.useMemo(() => {
    const hit = sections.flatMap((s) => s.items.map((i) => i.href)).filter(matches);
    return hit.sort((a, b) => b.length - a.length)[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections, pathname]);
  const isActive = (href: string) => href === activeHref;
  const badgeFor = (b?: "inbox" | "approvals" | "chat") => (b ? counts[b] : 0);

  const Sidebar = (
    <nav className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-3 h-[var(--topbar-h)] shrink-0">
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-[9px] flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: "linear-gradient(135deg, var(--brand), #0f172a)" }}>G</span>
          <span className="font-semibold tracking-tight">GHL ONE</span>
        </Link>
        <button className="ml-auto lg:hidden btn btn-ghost btn-sm btn-icon" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-4">
        {sections.map((s, i) => (
          <div key={i}>
            {s.title && <div className="eyebrow px-2.5 mb-1.5 mt-2">{s.title}</div>}
            <div className="space-y-0.5">
              {s.items.map((it) => {
                const n = badgeFor(it.badge);
                return (
                  <Link key={it.href} href={it.href} className="navlink" data-active={isActive(it.href)} onClick={() => setMobileOpen(false)}>
                    <it.icon size={16} className="shrink-0" />
                    <span className="truncate">{it.label}</span>
                    {n > 0 ? <span className={cn("ml-auto pill", it.badge === "approvals" ? "tone-warn" : "tone-brand")}>{n > 99 ? "99+" : n}</span> : <Blink zone={`nav:${it.href}`} className="ml-auto" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t p-2 shrink-0">
        <Link href={`/people/${profile.id}`} onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 px-2 py-2 rounded-[var(--radius-sm)] hover:bg-[var(--neutral-bg)]">
          <Avatar name={profile.full_name} src={profile.avatar_url} size={30} presence={profile.presence} />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{profile.full_name}</div>
            <div className="text-[11px] text-muted truncate">{profile.designation || ROLE_LABEL[profile.role]}{dept ? ` · ${dept.name}` : ""}</div>
          </div>
        </Link>
      </div>
    </nav>
  );

  const mobileItems = sections.flatMap((s) => s.items).filter((i) => i.mobile);

  return (
    <ToastProvider>
      <div className="flex min-h-dvh">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-[var(--sidebar-w)] border-r bg-[var(--bg-elev)] z-40" style={collapsed ? { display: "none" } : undefined}>
          {Sidebar}
        </aside>
        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-[90] lg:hidden">
            <div className="absolute inset-0 bg-black/40 anim-fade-in" onClick={() => setMobileOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-[min(84vw,300px)] bg-[var(--bg-elev)] border-r anim-fade-in">{Sidebar}</aside>
          </div>
        )}

        {/* Collapsing the rail is just `--sidebar-w: 0` here — `lg:pl-[var(--sidebar-w)]` reads it. */}
        <div className="flex-1 min-w-0 flex flex-col lg:pl-[var(--sidebar-w)]" style={collapsed ? ({ ["--sidebar-w" as string]: "0px" } as React.CSSProperties) : undefined}>
          {/* Topbar */}
          <header className="sticky top-0 z-30 glass border-b h-[var(--topbar-h)] flex items-center gap-2 px-3 sm:px-4">
            <button className="lg:hidden btn btn-ghost btn-sm btn-icon shrink-0" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <MenuIcon size={18} />
            </button>
            <button
              className="hidden lg:inline-flex btn btn-ghost btn-sm btn-icon shrink-0"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
              aria-expanded={!collapsed}
              title={collapsed ? "Show sidebar" : "Hide sidebar"}
            >
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            {/* Which company am I in? Always visible, and coloured when you are here as platform staff. */}
            <WorkspaceSwitcher />
            <button onClick={() => setPaletteOpen(true)} className="flex-1 min-w-0 max-w-xl flex items-center gap-2 h-9 px-3 rounded-[var(--radius-sm)] border bg-[var(--bg)] text-sm text-muted hover:border-[var(--line-strong)] transition-colors">
              <Search size={15} className="shrink-0" />
              <span className="truncate"><span className="sm:hidden">Search…</span><span className="hidden sm:inline">Search people, tasks, projects, messages, files…</span></span>
              <span className="ml-auto hidden sm:inline-flex gap-1"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
            </button>
            {/*
              One gap value for the whole cluster. The clock carried an extra `mr-1`, so the run of
              buttons had a single wider seam in the middle of it and the header read as unevenly
              spaced — more so on pages where the clock is a different width (clocked in vs out).
            */}
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              <ClockWidget />
              <Button variant="primary" size="sm" onClick={() => setCaptureOpen(true)} className="hidden sm:inline-flex">
                <Plus size={15} /> New
              </Button>
              <Button variant="primary" size="sm" icon onClick={() => setCaptureOpen(true)} className="sm:hidden" aria-label="New">
                <Plus size={16} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAskOpen(true)} className="hidden sm:inline-flex" title="GHL Buddy (Ctrl+J)">
                <Sparkles size={15} className="text-[var(--violet)]" /> Buddy
              </Button>
              <Button variant="ghost" size="sm" icon onClick={() => setAskOpen(true)} className="sm:hidden" aria-label="GHL Buddy">
                <Sparkles size={16} className="text-[var(--violet)]" />
              </Button>
              <CollaborateButton ctx={{}} size="sm" variant="ghost" className="hidden sm:inline-flex" />
              <Button variant="ghost" size="sm" icon onClick={toggle} aria-label="Toggle theme">
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </Button>
              <button className="relative btn btn-ghost btn-sm btn-icon" onClick={() => setNotifOpen(true)} aria-label="Notifications">
                <Bell size={17} />
                {counts.inbox > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--danger)] text-white text-[10px] font-semibold flex items-center justify-center">{counts.inbox > 99 ? "99+" : counts.inbox}</span>}
              </button>
              <Menu
                trigger={
                  <button className="flex items-center gap-1 pl-1 pr-1.5 h-8 rounded-full hover:bg-[var(--neutral-bg)]" title={dndActive ? `Do not disturb until ${fmtTime(dndUntil)}` : undefined}>
                    <span className="relative inline-flex">
                      <Avatar name={profile.full_name} src={profile.avatar_url} size={26} presence={dndActive ? "dnd" : profile.presence} />
                      {dndActive && <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-[var(--violet)] text-white flex items-center justify-center ring-2 ring-[var(--bg-elev)]" aria-label="Do not disturb on"><MoonStar size={9} /></span>}
                    </span>
                    <ChevronDown size={13} className="text-muted hidden sm:block" />
                  </button>
                }
                width={230}
              >
                <div className="px-2.5 py-2 border-b mb-1">
                  <div className="text-sm font-medium truncate">{profile.full_name}</div>
                  <div className="text-[11px] text-muted truncate">{profile.email}</div>
                </div>
                <MenuItem icon={<User size={14} />} onClick={() => router.push(`/people/${profile.id}?from=nav`)}>My profile</MenuItem>
                <MenuItem icon={<Settings size={14} />} onClick={() => router.push(`/people/${profile.id}?edit=1&from=nav`)}>Settings & status</MenuItem>
                <div className="px-2.5 pt-2 pb-1.5 border-t mt-1">
                  <div className={cn("flex items-center gap-1.5 text-[11px] mb-1.5", dndActive ? "text-violet font-medium" : "text-muted")}>
                    <MoonStar size={12} /> Do not disturb{dndActive && dndUntil ? ` · until ${fmtTime(dndUntil)}` : ""}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <button type="button" onClick={() => setDnd(30)} className="pill tone-neutral hover:bg-[var(--line)]">30 min</button>
                    <button type="button" onClick={() => setDnd(60)} className="pill tone-neutral hover:bg-[var(--line)]">1 h</button>
                    <button type="button" onClick={() => setDnd("tomorrow")} className="pill tone-neutral hover:bg-[var(--line)]">Until tomorrow</button>
                    {dndActive && <button type="button" onClick={() => setDnd(null)} className="pill tone-violet hover:opacity-80">Off</button>}
                  </div>
                </div>
                {/* `/auth/signout` is a Route Handler, not a page: it clears the session cookies
                    server-side and redirects. `router.push` cannot navigate to one, so this has to
                    be a real document request. */}
                {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination */}
                <MenuItem icon={<LogOut size={14} />} onClick={() => (window.location.href = "/auth/signout")} danger>Sign out</MenuItem>
              </Menu>
            </div>
          </header>

          <main className="flex-1 min-w-0 pb-16 lg:pb-0">
            {platformAdmin && <BreakGlassBanner className="mx-[var(--s3)] mt-[var(--s3)]" />}
            {children}
          </main>

          {/* Mobile: floating Ask GHL button above the bottom nav (hidden inside chat conversations where the composer lives) */}
          {!askOpen && !buddyOpen && !pathname.startsWith("/chat/") && (
            <button
              type="button"
              onClick={() => setAskOpen(true)}
              className="lg:hidden fixed right-4 z-30 w-11 h-11 rounded-full text-white flex items-center justify-center active:scale-95 transition-transform"
              style={{ bottom: "calc(56px + 16px + env(safe-area-inset-bottom))", background: "linear-gradient(135deg, var(--brand), var(--violet))", boxShadow: "var(--shadow-lg)" }}
              aria-label="GHL Buddy"
            >
              <Sparkles size={20} />
            </button>
          )}

          {/* Mobile bottom nav */}
          <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 glass border-t safe-b">
            <div className="grid grid-cols-5">
              {mobileItems.map((it) => {
                const n = badgeFor(it.badge);
                return (
                  <Link key={it.href} href={it.href} className={cn("relative flex flex-col items-center justify-center gap-0.5 h-14 text-[10px]", isActive(it.href) ? "text-[var(--brand-2)] font-medium" : "text-muted")}>
                    <it.icon size={19} />
                    {it.label}
                    {n > 0 ? <span className="absolute top-1.5 right-[22%] min-w-[16px] h-4 px-1 rounded-full bg-[var(--danger)] text-white text-[10px] font-semibold flex items-center justify-center">{n > 99 ? "99+" : n}</span> : <Blink zone={`nav:${it.href}`} className="absolute top-2 right-[26%]" size={6} />}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onCapture={() => { setPaletteOpen(false); setCaptureOpen(true); }} onAsk={() => { setPaletteOpen(false); setAskOpen(true); }} />
      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
      <QuickCapture open={captureOpen} onClose={() => setCaptureOpen(false)} />
      <BuddyPanel open={askOpen} onClose={closeAsk} />
      <LiveProvider />
      <CollaborateMenu />
      {/* Registers /sw.js and keeps this device's push row pointed at the active workspace. Never prompts. */}
      <PushRegistrar />
    </ToastProvider>
  );
}
