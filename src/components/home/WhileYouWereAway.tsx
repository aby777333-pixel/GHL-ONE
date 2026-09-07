"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Coffee, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, relDate } from "@/lib/utils";
import { jsonArr, jsonObj, num, str } from "@/components/intel/lib";

const STAMP_KEY = "ghl.lastVisit";
const GAP_HOURS = 20;

type Away = { since: string; tasks: { id: string; title: string; due: string | null }[]; tasksChanged: number; decisions: { id: string; title: string }[]; mentions: number; unread: number; approvals: number; projects: { id: string; name: string; status: string }[]; announcements: { id: string; title: string }[]; commitmentsDue: number };

function parse(j: Parameters<typeof jsonObj>[0]): Away {
  const o = jsonObj(j);
  return {
    since: str(o.since), tasks: jsonArr(o.tasks_assigned).map((t) => ({ id: str(t.id), title: str(t.title), due: typeof t.due === "string" ? t.due : null })), tasksChanged: num(o.tasks_changed),
    decisions: jsonArr(o.decisions).map((d) => ({ id: str(d.id), title: str(d.title) })), mentions: num(o.mentions), unread: num(o.unread), approvals: num(o.approvals_waiting),
    projects: jsonArr(o.projects_updated).map((p) => ({ id: str(p.id), name: str(p.name), status: str(p.status) })), announcements: jsonArr(o.announcements).map((a) => ({ id: str(a.id), title: str(a.title) })), commitmentsDue: num(o.commitments_due),
  };
}

/**
 * Shown on the home page after a gap of 20h+ (local last-visit stamp, falling back to `profiles.last_seen_at`).
 * Dismissible; the stamp is refreshed on every home visit.
 */
export function WhileYouWereAway() {
  const { profile } = useSession();
  const [data, setData] = React.useState<Away | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    let last: number | null = null;
    try { const v = localStorage.getItem(STAMP_KEY); if (v) last = Number(v) || null; } catch {}
    if (!last && profile.last_seen_at) last = new Date(profile.last_seen_at).getTime();
    const now = Date.now();
    try { localStorage.setItem(STAMP_KEY, String(now)); } catch {}
    if (!last || now - last < GAP_HOURS * 3600000) return;
    const since = new Date(last).toISOString();
    createClient().rpc("while_you_were_away", { p_since: since }).then(({ data: j, error }) => {
      if (!alive || error) return;
      const a = parse(j);
      const anything = a.tasks.length || a.tasksChanged || a.decisions.length || a.mentions || a.approvals || a.projects.length || a.announcements.length || a.commitmentsDue;
      if (anything) setData(a);
    });
    return () => { alive = false; };
  }, [profile.last_seen_at]);

  if (!data || dismissed) return null;
  const chips: { label: string; href: string }[] = [
    ...(data.mentions ? [{ label: `${data.mentions} mention${data.mentions > 1 ? "s" : ""}`, href: "/my-work?tab=mentions" }] : []),
    ...(data.approvals ? [{ label: `${data.approvals} approval${data.approvals > 1 ? "s" : ""} waiting`, href: "/approvals" }] : []),
    ...(data.tasksChanged ? [{ label: `${data.tasksChanged} update${data.tasksChanged > 1 ? "s" : ""} on your tasks`, href: "/my-work" }] : []),
    ...(data.commitmentsDue ? [{ label: `${data.commitmentsDue} promise${data.commitmentsDue > 1 ? "s" : ""} due soon`, href: "/my-work?tab=commitments" }] : []),
    ...(data.unread ? [{ label: `${data.unread} unread notification${data.unread > 1 ? "s" : ""}`, href: "/inbox" }] : []),
  ];
  return (
    <Card className="p-[var(--s4)] border-[var(--brand)] relative anim-fade-in">
      <button type="button" onClick={() => setDismissed(true)} className="absolute top-3 right-3 text-muted hover:text-[var(--fg)]" aria-label="Dismiss"><X size={15} /></button>
      <div className="flex items-center gap-2 mb-2"><span className="w-8 h-8 rounded-full tone-brand inline-flex items-center justify-center"><Coffee size={15} /></span><div><div className="font-medium">While you were away</div><div className="text-[11px] text-muted">Since {ago(data.since)} — the short version.</div></div></div>
      {chips.length > 0 && <div className="flex flex-wrap gap-1.5 mb-3">{chips.map((c) => <Link key={c.label} href={c.href} className="pill pill-lg tone-neutral hover:bg-[var(--line)]">{c.label} <ArrowRight size={11} /></Link>)}</div>}
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        {data.tasks.length > 0 && <List title={`New tasks for you (${data.tasks.length})`} items={data.tasks.slice(0, 5).map((t) => ({ key: t.id, label: t.title, href: `/tasks/${t.id}`, right: t.due ? relDate(t.due) : undefined }))} />}
        {data.decisions.length > 0 && <List title={`Decisions (${data.decisions.length})`} items={data.decisions.slice(0, 5).map((d) => ({ key: d.id, label: d.title, href: `/decisions/${d.id}` }))} />}
        {data.projects.length > 0 && <List title={`Projects updated (${data.projects.length})`} items={data.projects.slice(0, 5).map((p) => ({ key: p.id, label: p.name, href: `/projects/${p.id}`, right: p.status.replace(/_/g, " ") }))} />}
        {data.announcements.length > 0 && <List title={`Announcements (${data.announcements.length})`} items={data.announcements.slice(0, 5).map((a) => ({ key: a.id, label: a.title, href: `/announcements#${a.id}` }))} />}
      </div>
    </Card>
  );
}

function List({ title, items }: { title: string; items: { key: string; label: string; href: string; right?: string }[] }) {
  return (
    <div>
      <div className="eyebrow mb-1">{title}</div>
      <ul className="space-y-0.5">{items.map((i) => <li key={i.key} className="flex items-center gap-2"><Link href={i.href} className="truncate hover:underline flex-1 min-w-0">{i.label}</Link>{i.right && <span className="text-[11px] text-muted whitespace-nowrap">{i.right}</span>}</li>)}</ul>
    </div>
  );
}
