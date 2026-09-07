"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, LifeBuoy, ListChecks, Users, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Card, CardHeader, EmptyState, Pill, Select, Spinner } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { PRESENCE_LABEL, PRESENCE_TONE } from "@/components/people/types";
import { ago, cn, humanize, PRIORITY_TONE, type Profile, type TaskPriority } from "@/lib/utils";
import { DeptStatusPill } from "./AdminBits";

/** "Look at: All departments / <dept>" — the Super Admin's department lens. */
export function DepartmentSwitcher({ value, onChange, className }: { value: string; onChange: (id: string) => void; className?: string }) {
  const { departments } = useSession();
  return (
    <label className={cn("inline-flex items-center gap-2 text-sm", className)}>
      <span className="text-muted inline-flex items-center gap-1.5 whitespace-nowrap"><Building2 size={14} /> Look at</span>
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="!h-8 !text-xs w-[200px]">
        <option value="">All departments</option>
        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </Select>
    </label>
  );
}

type Person = Pick<Profile, "id" | "full_name" | "avatar_url" | "designation" | "presence" | "status_text" | "role">;
type HelpRow = { id: string; title: string; status: string; priority: string; requester_id: string; owner_id: string | null; created_at: string; ack_due_at: string | null; over_sla?: boolean };
type Focus = { people: Person[]; help: HelpRow[]; openTasks: number; overdue: number; blocked: number };

const HELP_TONE: Record<string, string> = { new: "tone-warn", accepted: "tone-info", working: "tone-brand", waiting: "tone-orange", completed: "tone-success", declined: "tone-muted" };

/** Department focus: its people (with presence), open help requests and open-task counts — all through the caller's RLS. */
export function DepartmentFocus({ departmentId }: { departmentId: string }) {
  const { departments } = useSession();
  const dept = departments.find((d) => d.id === departmentId);
  const [state, setState] = React.useState<{ id: string; data: Focus } | null>(null);
  const loading = !state || state.id !== departmentId;

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const sb = createClient();
      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const [{ data: people }, { data: help }, { count: open }, { count: overdue }, { count: blocked }] = await Promise.all([
        sb.from("profiles").select("id,full_name,avatar_url,designation,presence,status_text,role").eq("department_id", departmentId).eq("is_active", true).order("full_name"),
        sb.from("help_requests").select("id,title,status,priority,requester_id,owner_id,created_at,ack_due_at").eq("department_id", departmentId).in("status", ["new", "accepted", "working", "waiting"]).order("created_at", { ascending: false }).limit(30),
        sb.from("tasks").select("id", { count: "exact", head: true }).eq("department_id", departmentId).not("status", "in", "(done,cancelled)"),
        sb.from("tasks").select("id", { count: "exact", head: true }).eq("department_id", departmentId).not("status", "in", "(done,cancelled)").lt("due_date", nowIso),
        sb.from("tasks").select("id", { count: "exact", head: true }).eq("department_id", departmentId).in("status", ["blocked", "waiting"]),
      ]);
      if (!alive) return;
      setState({ id: departmentId, data: { people: (people || []) as Person[], help: ((help || []) as HelpRow[]).map((h) => ({ ...h, over_sla: h.status === "new" && !!h.ack_due_at && new Date(h.ack_due_at).getTime() < now })), openTasks: open ?? 0, overdue: overdue ?? 0, blocked: blocked ?? 0 } });
    })();
    return () => { alive = false; };
  }, [departmentId]);

  if (!dept) return null;
  const d = state?.data;
  const onDuty = d?.people.find((p) => p.id === dept.on_duty_user_id);
  const head = d?.people.find((p) => p.id === dept.head_id);
  const available = d?.people.filter((p) => p.presence === "available" || p.presence === "remote").length ?? 0;

  return (
    <Card className="border-l-4" style={{ borderLeftColor: dept.color }}>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: dept.color }} />{dept.name} <DeptStatusPill status={dept.status} /><Blink zone={`dept:${dept.id}`} /></span>}
        subtitle={head || onDuty ? <>{head && <>Head: {head.full_name}</>}{head && onDuty && " · "}{onDuty && <>On duty: {onDuty.full_name}</>}</> : "No head or on-duty person set"}
        action={<Link href={`/departments/${dept.slug}`} className="btn btn-secondary btn-sm shrink-0">Open portal <ArrowRight size={14} /></Link>}
      />
      {loading || !d ? (
        <div className="flex justify-center py-[var(--s5)]"><Spinner /></div>
      ) : (
        <div className="px-[var(--s4)] pb-[var(--s4)] grid grid-cols-1 lg:grid-cols-3 gap-[var(--s3)]">
          <div className="min-w-0">
            <div className="eyebrow mb-2 inline-flex items-center gap-1.5"><Users size={12} /> People <span className="pill tone-neutral">{d.people.length}</span><span className="text-[11px] normal-case tracking-normal font-normal text-muted">· {available} available</span></div>
            {d.people.length === 0 ? <div className="text-xs text-muted">Nobody assigned to this department.</div> : (
              <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                {d.people.map((p) => (
                  <Link key={p.id} href={`/people/${p.id}`} className="flex items-center gap-2 py-1 px-1 rounded-[var(--radius-sm)] row-hover">
                    <Avatar name={p.full_name} src={p.avatar_url} size={24} presence={p.presence} />
                    <span className="min-w-0 flex-1"><span className="block text-sm truncate">{p.full_name}<Blink zone={`user:${p.id}`} className="ml-1.5" /></span><span className="block text-[11px] text-muted truncate">{p.status_text || p.designation || humanize(p.role)}</span></span>
                    <Pill tone={PRESENCE_TONE[p.presence]}>{PRESENCE_LABEL[p.presence]}</Pill>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="eyebrow mb-2 inline-flex items-center gap-1.5"><LifeBuoy size={12} /> Open requests <span className="pill tone-neutral">{d.help.length}</span></div>
            {d.help.length === 0 ? <EmptyState title="No open requests" className="py-4" /> : (
              <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                {d.help.map((h) => (
                  <Link key={h.id} href={`/help/${h.id}`} className="block py-1.5 px-1 rounded-[var(--radius-sm)] row-hover">
                    <span className="flex items-center gap-2 min-w-0"><span className="text-sm truncate flex-1">{h.title}</span><Blink zone={`help:${h.id}`} /><Pill tone={HELP_TONE[h.status] || "tone-neutral"}>{humanize(h.status)}</Pill></span>
                    <span className="flex items-center gap-2 text-[11px] text-muted mt-0.5"><Pill tone={PRIORITY_TONE[h.priority as TaskPriority] || "tone-neutral"}>{humanize(h.priority)}</Pill><span>{ago(h.created_at)}</span>{h.over_sla && <span className="text-danger font-medium">over SLA</span>}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="eyebrow mb-2 inline-flex items-center gap-1.5"><ListChecks size={12} /> Work</div>
            <div className="grid grid-cols-3 gap-2">
              <Link href={`/departments/${dept.slug}?tab=tasks`} className="card card-hover px-3 py-2.5"><div className="text-[11px] text-muted">Open</div><div className="text-xl font-semibold num">{d.openTasks}</div></Link>
              <Link href={`/departments/${dept.slug}?tab=tasks`} className="card card-hover px-3 py-2.5"><div className="text-[11px] text-muted">Overdue</div><div className={cn("text-xl font-semibold num", d.overdue > 0 && "text-danger")}>{d.overdue}</div></Link>
              <Link href={`/departments/${dept.slug}?tab=tasks`} className="card card-hover px-3 py-2.5"><div className="text-[11px] text-muted">Blocked</div><div className={cn("text-xl font-semibold num", d.blocked > 0 && "text-warn")}>{d.blocked}</div></Link>
            </div>
            <div className="text-[11px] text-muted mt-3 leading-relaxed">Counts respect your own visibility — what you see here is what you can open. Nothing about this view is recorded against the employees shown.</div>
          </div>
        </div>
      )}
    </Card>
  );
}
