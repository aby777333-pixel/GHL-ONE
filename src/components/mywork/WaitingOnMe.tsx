"use client";

import * as React from "react";
import Link from "next/link";
import { AtSign, CheckSquare, ClipboardList, Handshake, Hourglass, KeyRound, LifeBuoy, Palmtree, Target, Workflow } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/ui";
import { Blink } from "@/components/providers/ActivityProvider";
import { ago, cn, fmtDate, relDate } from "@/lib/utils";
import { jsonArr, jsonObj, num, str } from "@/components/intel/lib";

type Item = { id: string; title: string; by?: string; since?: string; extra?: string; href: string; zone?: string; warn?: boolean };
type Section = { key: string; label: string; icon: React.ReactNode; items: Item[] };

function build(j: Parameters<typeof jsonObj>[0]): { sections: Section[]; mentions: number; total: number } {
  const o = jsonObj(j);
  const sections: Section[] = [
    { key: "tasks", label: "Tasks waiting on you", icon: <Hourglass size={14} />, items: jsonArr(o.tasks).map((x) => ({ id: str(x.id), title: str(x.title), by: str(x.by), since: str(x.since) || undefined, extra: str(x.note) || undefined, href: `/tasks/${str(x.id)}`, zone: `task:${str(x.id)}` })) },
    { key: "acks", label: "Delegations to acknowledge", icon: <Target size={14} />, items: jsonArr(o.acks).map((x) => ({ id: str(x.id), title: str(x.title), by: str(x.from), href: `/tasks/${str(x.id)}`, zone: `task:${str(x.id)}` })) },
    { key: "approvals", label: "Approvals", icon: <CheckSquare size={14} />, items: jsonArr(o.approvals).map((x) => ({ id: str(x.id), title: str(x.title), by: str(x.by), since: str(x.since) || undefined, extra: num(x.blocks) ? `${num(x.blocks)} task${num(x.blocks) > 1 ? "s" : ""} blocked` : undefined, href: `/approvals/${str(x.id)}` })) },
    { key: "requests", label: "Requests to decide", icon: <ClipboardList size={14} />, items: jsonArr(o.requests).map((x) => ({ id: str(x.id), title: str(x.title), by: str(x.by), since: str(x.since) || undefined, extra: str(x.kind).replace(/_/g, " "), href: "/requests?tab=approvals" })) },
    { key: "leaves", label: "Leave to approve", icon: <Palmtree size={14} />, items: jsonArr(o.leaves).map((x) => ({ id: str(x.id), title: `${str(x.by)} · ${fmtDate(str(x.from))}${str(x.to) !== str(x.from) ? ` → ${fmtDate(str(x.to))}` : ""}`, href: "/leave?tab=team" })) },
    { key: "help", label: "Help requests", icon: <LifeBuoy size={14} />, items: jsonArr(o.help_requests).map((x) => ({ id: str(x.id), title: str(x.title), by: str(x.by), since: str(x.since) || undefined, warn: x.over_sla === true, extra: x.over_sla === true ? "over SLA" : undefined, href: `/help/${str(x.id)}`, zone: `help:${str(x.id)}` })) },
    { key: "access", label: "Access requests", icon: <KeyRound size={14} />, items: jsonArr(o.access_requests).map((x) => ({ id: str(x.id), title: str(x.label), by: str(x.by), since: str(x.since) || undefined, href: "/admin?tab=access" })) },
    { key: "workflow", label: "Workflow steps", icon: <Workflow size={14} />, items: jsonArr(o.workflow_steps).map((x) => ({ id: str(x.id), title: str(x.title), extra: str(x.run) || undefined, since: undefined, href: "/admin?tab=workflows", warn: !!str(x.due) && new Date(str(x.due)).getTime() < new Date().setHours(0, 0, 0, 0) })) },
    { key: "commitments", label: "Promises you made", icon: <Handshake size={14} />, items: jsonArr(o.commitments).map((x) => ({ id: str(x.id), title: str(x.text), by: str(x.to) ? `to ${str(x.to)}` : undefined, extra: str(x.due) ? `due ${relDate(str(x.due))}` : undefined, href: "/my-work?tab=commitments" })) },
  ].filter((s) => s.items.length > 0);
  return { sections, mentions: num(o.mentions), total: sections.reduce((a, s) => a + s.items.length, 0) };
}

/** Everything blocked on the viewer, across every module (`waiting_on_me()`). */
export function WaitingOnMe({ userId, title = "Waiting on you", compact }: { userId?: string; title?: string; compact?: boolean }) {
  const [data, setData] = React.useState<ReturnType<typeof build> | null>(null);
  React.useEffect(() => {
    let alive = true;
    createClient().rpc("waiting_on_me", userId ? { p_user: userId } : undefined).then(({ data: j }) => { if (alive) setData(build(j)); });
    return () => { alive = false; };
  }, [userId]);

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Hourglass size={15} /> {title}</span>} subtitle={data ? (data.total ? `${data.total} item${data.total > 1 ? "s" : ""} cannot move until you act${data.mentions ? ` · ${data.mentions} unread mention${data.mentions > 1 ? "s" : ""}` : ""}` : "Nobody is waiting on you") : "Across tasks, approvals, leave, help, access, requests, promises"} action={data && data.mentions > 0 ? <Link href="/inbox" className="pill tone-brand"><AtSign size={10} /> {data.mentions}</Link> : undefined} />
      {!data ? <div className="px-[var(--s4)] pb-3 space-y-2"><Skeleton /><Skeleton /></div> : data.sections.length === 0 ? <EmptyState title="You are not blocking anyone" hint="Approvals, delegations, help requests and promises that need you show up here." className="py-[var(--s4)]" /> : (
        <div className="divide-y border-t">
          {data.sections.map((s) => (
            <div key={s.key} className="px-[var(--s3)] py-2">
              <div className="eyebrow flex items-center gap-1.5 px-1 mb-1">{s.icon} {s.label} <span className="pill tone-neutral">{s.items.length}</span></div>
              {(compact ? s.items.slice(0, 4) : s.items).map((it) => (
                <Link key={it.id} href={it.href} className="flex items-center gap-2 px-1.5 py-1.5 rounded-[var(--radius-sm)] row-hover text-sm">
                  <span className="truncate flex-1 min-w-0">{it.title}{it.zone && <Blink zone={it.zone} className="ml-1" />}</span>
                  {it.by && <span className="text-[11px] text-muted truncate max-w-[120px]">{it.by}</span>}
                  {it.extra && <span className={cn("text-[11px] whitespace-nowrap", it.warn ? "text-danger" : "text-muted")}>{it.extra}</span>}
                  {it.since && <span className="text-[11px] text-muted whitespace-nowrap num">{ago(it.since)}</span>}
                </Link>
              ))}
              {compact && s.items.length > 4 && <div className="text-[11px] text-muted px-1.5">+{s.items.length - 4} more</div>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
