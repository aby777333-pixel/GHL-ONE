"use client";

import * as React from "react";
import { AlertTriangle, Check, Sunrise, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Skeleton, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker } from "@/components/pickers";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { cn, fmtDate, isLeadPlus } from "@/lib/utils";
import { istDay } from "@/components/attendance/attendanceUtils";
import { jsonArr, jsonObj, num, str, strArr } from "@/components/intel/lib";

/** Async standup: yesterday / today / blockers — one row per person per day (`standups`, unique user+day). */
export function Standup({ compact }: { compact?: boolean }) {
  const { profile } = useSession();
  const toast = useToast();
  const [day] = React.useState(() => istDay());
  const [state, setState] = React.useState<{ loaded: boolean; id: string | null; done: string; next: string; blockers: string; savedAt: string | null }>({ loaded: false, id: null, done: "", next: "", blockers: "", savedAt: null });
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(!compact);

  React.useEffect(() => {
    let alive = true;
    createClient().from("standups").select("id,done,next,blockers,created_at").eq("user_id", profile.id).eq("day", day).maybeSingle().then(({ data }) => {
      if (!alive) return;
      setState({ loaded: true, id: data?.id || null, done: data?.done || "", next: data?.next || "", blockers: data?.blockers || "", savedAt: data?.created_at || null });
    });
    return () => { alive = false; };
  }, [profile.id, day]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await createClient().from("standups").upsert({ org_id: profile.org_id!, user_id: profile.id, day, done: state.done.trim() || null, next: state.next.trim() || null, blockers: state.blockers.trim() || null }, { onConflict: "user_id,day" }).select("id,created_at").single();
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    setState((s) => ({ ...s, id: data.id, savedAt: data.created_at }));
    toast.push(state.blockers.trim() ? "Standup saved — your lead sees the blocker in the digest" : "Standup saved", "success");
    if (compact) setOpen(false);
  }
  const posted = !!state.id;

  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><Sunrise size={15} /> Daily standup</span>}
        subtitle={!state.loaded ? "…" : posted ? `Posted for ${fmtDate(day)} — edit any time today` : `Two minutes, no meeting: what you did, what is next, what is in the way.`}
        action={compact ? <Button size="sm" variant={posted ? "ghost" : "primary"} onClick={() => setOpen((o) => !o)}>{open ? "Hide" : posted ? "Edit" : "Post"}</Button> : posted ? <span className="pill tone-success"><Check size={10} /> Posted</span> : undefined}
      />
      {open && (
        !state.loaded ? <div className="px-[var(--s4)] pb-3 space-y-2"><Skeleton /><Skeleton /></div> : (
          <form onSubmit={save} className="px-[var(--s4)] pb-[var(--s3)] space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Field label="Yesterday / since last time"><Textarea value={state.done} onChange={(e) => setState((s) => ({ ...s, done: e.target.value }))} placeholder="Shipped, finished, decided…" style={{ minHeight: 64 }} /></Field>
              <Field label="Today"><Textarea value={state.next} onChange={(e) => setState((s) => ({ ...s, next: e.target.value }))} placeholder="Focus for today" style={{ minHeight: 64 }} /></Field>
              <Field label="Blockers" hint="Leads see blockers first."><Textarea value={state.blockers} onChange={(e) => setState((s) => ({ ...s, blockers: e.target.value }))} placeholder="Waiting on…, need…, stuck on…" style={{ minHeight: 64 }} className={cn(state.blockers.trim() && "border-[var(--warn)]")} /></Field>
            </div>
            <div className="flex justify-end"><Button type="submit" size="sm" variant="primary" loading={busy} disabled={!state.done.trim() && !state.next.trim() && !state.blockers.trim()}>{posted ? "Update" : "Post standup"}</Button></div>
          </form>
        )
      )}
    </Card>
  );
}

type Digest = { day: string; standups: { user_id: string; name: string; done: string; next: string; blockers: string }[]; missing: string[]; blockers: number };

/** Team digest for a day: who posted, who is missing, blockers first (`team_digest`). */
export function TeamDigest({ departmentId, title = "Team digest" }: { departmentId?: string | null; title?: string }) {
  const { profile } = useSession();
  const [day, setDay] = React.useState(() => istDay());
  const [dept, setDept] = React.useState(departmentId ?? profile.department_id ?? "");
  const [data, setData] = React.useState<{ key: string; d: Digest } | null>(null);
  const key = `${day}:${dept}`;

  React.useEffect(() => {
    let alive = true;
    createClient().rpc("team_digest", { p_day: day, p_department: dept || undefined }).then(({ data: j }) => {
      if (!alive) return;
      const o = jsonObj(j);
      setData({ key, d: { day: str(o.day, day), standups: jsonArr(o.standups).map((s) => ({ user_id: str(s.user_id), name: str(s.name), done: str(s.done), next: str(s.next), blockers: str(s.blockers) })), missing: strArr(o.missing), blockers: num(o.blockers) } });
    });
    return () => { alive = false; };
  }, [day, dept, key]);

  const d = data?.key === key ? data.d : null;
  const withBlockers = d ? d.standups.filter((s) => s.blockers.trim()) : [];
  const rest = d ? d.standups.filter((s) => !s.blockers.trim()) : [];
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Users size={15} /> {title}</span>} subtitle={d ? `${d.standups.length} posted · ${d.missing.length} missing · ${d.blockers} blocker${d.blockers === 1 ? "" : "s"}` : "Async standups for the day"} action={<span className="flex items-center gap-1.5"><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="!h-8 !text-xs !w-auto" />{isLeadPlus(profile.role) && <DepartmentPicker value={dept} onChange={setDept} placeholder="Everyone I lead" className="!h-8 !text-xs !w-auto" />}</span>} />
      {!d ? <div className="px-[var(--s4)] pb-3 space-y-2"><Skeleton /><Skeleton /></div> : d.standups.length === 0 && d.missing.length === 0 ? <EmptyState title="Nobody in scope" className="py-[var(--s4)]" /> : (
        <div className="divide-y border-t">
          {withBlockers.map((s) => <DigestRow key={s.user_id} s={s} blocked />)}
          {rest.map((s) => <DigestRow key={s.user_id} s={s} />)}
          {d.missing.length > 0 && (
            <div className="px-[var(--s4)] py-2.5 text-xs text-muted flex flex-wrap items-center gap-1.5"><span className="eyebrow mr-1">Not posted</span>{d.missing.map((n) => <span key={n} className="pill tone-neutral">{n}</span>)}</div>
          )}
        </div>
      )}
    </Card>
  );
}

function DigestRow({ s, blocked }: { s: Digest["standups"][number]; blocked?: boolean }) {
  return (
    <div className={cn("px-[var(--s4)] py-2.5", blocked && "bg-[color-mix(in_oklab,var(--warn)_7%,transparent)]")}>
      <div className="flex items-center gap-2 flex-wrap"><PersonChip id={s.user_id} size={18} /><Blink zone={`user:${s.user_id}`} />{blocked && <span className="pill tone-warn"><AlertTriangle size={10} /> Blocked</span>}</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-1 mt-1.5 text-sm">
        {s.blockers && <div className="md:col-span-3 text-warn"><span className="eyebrow text-warn">Blocker</span><div className="whitespace-pre-wrap">{s.blockers}</div></div>}
        <div><span className="eyebrow">Done</span><div className="whitespace-pre-wrap text-2">{s.done || "—"}</div></div>
        <div className="md:col-span-2"><span className="eyebrow">Next</span><div className="whitespace-pre-wrap text-2">{s.next || "—"}</div></div>
      </div>
    </div>
  );
}
