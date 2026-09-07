"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Menu as MenuIcon, Moon, Plus, Search, Sun, LogOut, User, Settings, X, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Avatar, Button, Kbd, Menu, MenuItem, ToastProvider } from "@/components/ui";
import { cn, ROLE_LABEL } from "@/lib/utils";
import { navFor } from "./nav";
import { CommandPalette } from "./CommandPalette";
import { NotificationsPanel } from "./NotificationsPanel";
import { QuickCapture } from "./QuickCapture";

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

export function AppShell({ children, initialCounts }: { children: React.ReactNode; initialCounts: Counts }) {
  const { profile, departments } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { dark, toggle } = useTheme();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [captureOpen, setCaptureOpen] = React.useState(false);
  const [counts, setCounts] = React.useState<Counts>(initialCounts);
  const sections = React.useMemo(() => navFor(profile.role), [profile.role]);
  const dept = departments.find((d) => d.id === profile.department_id);

  // Keyboard: Ctrl/Cmd+K palette, "c" quick capture when not typing
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName) || target?.isContentEditable;
      if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "c" && !paletteOpen) {
        e.preventDefault();
        setCaptureOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [paletteOpen]);

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

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));
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
                    {n > 0 && <span className={cn("ml-auto pill", it.badge === "approvals" ? "tone-warn" : "tone-brand")}>{n > 99 ? "99+" : n}</span>}
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
        <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-[var(--sidebar-w)] border-r bg-[var(--bg-elev)] z-40">{Sidebar}</aside>
        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-[90] lg:hidden">
            <div className="absolute inset-0 bg-black/40 anim-fade-in" onClick={() => setMobileOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-[min(84vw,300px)] bg-[var(--bg-elev)] border-r anim-fade-in">{Sidebar}</aside>
          </div>
        )}

        <div className="flex-1 min-w-0 flex flex-col lg:pl-[var(--sidebar-w)]">
          {/* Topbar */}
          <header className="sticky top-0 z-30 glass border-b h-[var(--topbar-h)] flex items-center gap-2 px-3 sm:px-4">
            <button className="lg:hidden btn btn-ghost btn-sm btn-icon" onClick={() => setMobileOpen(true)} aria-label="Menu">
              <MenuIcon size={18} />
            </button>
            <button onClick={() => setPaletteOpen(true)} className="flex-1 min-w-0 max-w-xl flex items-center gap-2 h-9 px-3 rounded-[var(--radius-sm)] border bg-[var(--bg)] text-sm text-muted hover:border-[var(--line-strong)] transition-colors">
              <Search size={15} />
              <span className="truncate"><span className="sm:hidden">Search…</span><span className="hidden sm:inline">Search people, tasks, projects, messages, files…</span></span>
              <span className="ml-auto hidden sm:inline-flex gap-1"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
            </button>
            <div className="ml-auto flex items-center gap-1 shrink-0">
              <Button variant="primary" size="sm" onClick={() => setCaptureOpen(true)} className="hidden sm:inline-flex">
                <Plus size={15} /> New
              </Button>
              <Button variant="primary" size="sm" icon onClick={() => setCaptureOpen(true)} className="sm:hidden" aria-label="New">
                <Plus size={16} />
              </Button>
              <Button variant="ghost" size="sm" icon onClick={toggle} aria-label="Toggle theme">
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </Button>
              <button className="relative btn btn-ghost btn-sm btn-icon" onClick={() => setNotifOpen(true)} aria-label="Notifications">
                <Bell size={17} />
                {counts.inbox > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[var(--danger)] text-white text-[10px] font-semibold flex items-center justify-center">{counts.inbox > 99 ? "99+" : counts.inbox}</span>}
              </button>
              <Menu
                trigger={
                  <button className="flex items-center gap-1 pl-1 pr-1.5 h-8 rounded-full hover:bg-[var(--neutral-bg)]">
                    <Avatar name={profile.full_name} src={profile.avatar_url} size={26} presence={profile.presence} />
                    <ChevronDown size={13} className="text-muted hidden sm:block" />
                  </button>
                }
                width={210}
              >
                <div className="px-2.5 py-2 border-b mb-1">
                  <div className="text-sm font-medium truncate">{profile.full_name}</div>
                  <div className="text-[11px] text-muted truncate">{profile.email}</div>
                </div>
                <MenuItem icon={<User size={14} />} onClick={() => router.push(`/people/${profile.id}`)}>My profile</MenuItem>
                <MenuItem icon={<Settings size={14} />} onClick={() => router.push(`/people/${profile.id}?edit=1`)}>Settings & status</MenuItem>
                <MenuItem icon={<LogOut size={14} />} onClick={() => (window.location.href = "/auth/signout")} danger>Sign out</MenuItem>
              </Menu>
            </div>
          </header>

          <main className="flex-1 min-w-0 pb-16 lg:pb-0">{children}</main>

          {/* Mobile bottom nav */}
          <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 glass border-t safe-b">
            <div className="grid grid-cols-5">
              {mobileItems.map((it) => {
                const n = badgeFor(it.badge);
                return (
                  <Link key={it.href} href={it.href} className={cn("relative flex flex-col items-center justify-center gap-0.5 h-14 text-[10px]", isActive(it.href) ? "text-[var(--brand-2)] font-medium" : "text-muted")}>
                    <it.icon size={19} />
                    {it.label}
                    {n > 0 && <span className="absolute top-1.5 right-[22%] min-w-[16px] h-4 px-1 rounded-full bg-[var(--danger)] text-white text-[10px] font-semibold flex items-center justify-center">{n > 99 ? "99+" : n}</span>}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onCapture={() => { setPaletteOpen(false); setCaptureOpen(true); }} />
      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
      <QuickCapture open={captureOpen} onClose={() => setCaptureOpen(false)} />
    </ToastProvider>
  );
}
