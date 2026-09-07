"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, Info, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, EmptyState, Pill, Skeleton } from "@/components/ui";
import { Blink } from "@/components/providers/ActivityProvider";
import { cn, fmtDate } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { jsonArray, jsonObj, num, str } from "./people/lib";

const KIND_TONE: Record<string, string> = { view: "tone-neutral", search: "tone-neutral", export: "tone-warn", download: "tone-warn", print: "tone-warn", share: "tone-orange", view_as: "tone-violet", denied: "tone-danger" };
const WINDOWS = [7, 30, 90] as const;

function Person({ id, name }: { id: string; name: string }) {
  return <Link href={`/people/${id}`} className="inline-flex items-center gap-1.5 hover:underline truncate">{name || "Former member"}<Blink zone={`user:${id}`} /></Link>;
}

/** Admin console tab `access-log`: who viewed / exported / was denied what, from `access_event_summary`. */
export function AccessLog() {
  const [days, setDays] = React.useState<number>(7);
  const [loaded, setLoaded] = React.useState<{ days: number; data: Json | null } | null>(null);
  const loading = !loaded || loaded.days !== days;

  React.useEffect(() => {
    let alive = true;
    createClient().rpc("access_event_summary", { p_days: days }).then(({ data }) => { if (alive) setLoaded({ days, data: data ?? null }); });
    return () => { alive = false; };
  }, [days]);

  const d = jsonObj(loaded?.data);
  const forbidden = !!loaded && (!loaded.data || !!d.error);
  const byKind = Object.entries(jsonObj(d.by_kind)).map(([k, v]) => ({ kind: k, n: num(v) })).sort((a, b) => b.n - a.n);
  const exportsList = jsonArray(d.exports).map(jsonObj);
  const denied = jsonArray(d.denied).map(jsonObj);
  const topViewers = jsonArray(d.top_viewers).map(jsonObj);
  const sensitive = jsonArray(d.sensitive).map(jsonObj);

  return (
    <div className="space-y-[var(--s3)]">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm text-muted flex items-start gap-1.5"><Info size={14} className="shrink-0 mt-0.5" /> Explicit view / export / share / denied events on governed records. Not browsing history. Every person can see their own entries in their Privacy Center.</div>
        <span className="inline-flex items-center gap-1 card p-0.5">{WINDOWS.map((n) => <button key={n} type="button" onClick={() => setDays(n)} className={cn("btn btn-sm", days === n ? "btn-secondary" : "btn-ghost")}>{n} days</button>)}</span>
      </div>

      {loading ? (
        <Card className="p-[var(--s4)] space-y-2"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-20" /></Card>
      ) : forbidden ? (
        <Card><EmptyState icon={<ShieldAlert size={18} />} title="Security or audit permission needed" hint="The access log is available to admins with security.manage or audit.read." /></Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {byKind.map((k) => <Pill key={k.kind} tone={KIND_TONE[k.kind] || "tone-neutral"}>{k.kind.replace(/_/g, " ")} <span className="num font-semibold ml-1">{k.n}</span></Pill>)}
            {byKind.length === 0 && <span className="text-xs text-muted">No access events in the last {days} days.</span>}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-[var(--s3)] items-start">
            <Card>
              <CardHeader title="Exports, downloads, prints, shares" subtitle="Data that left the system (also mirrored to security events)" action={<Pill tone={exportsList.length ? "tone-warn" : "tone-muted"}>{exportsList.length}</Pill>} />
              {exportsList.length === 0 ? <div className="px-[var(--s4)] pb-[var(--s4)] text-xs text-muted">Nothing exported.</div> : (
                <ul className="divide-y border-t max-h-96 overflow-y-auto">
                  {exportsList.map((x, i) => (
                    <li key={i} className="flex items-center gap-2 px-[var(--s4)] py-1.5 text-sm">
                      <Pill tone={KIND_TONE[str(x.kind)] || "tone-neutral"}>{str(x.kind)}</Pill>
                      <Person id={str(x.user_id)} name={str(x.user)} />
                      <span className="text-xs text-muted truncate flex-1">{str(x.entity_type) || "—"}{x.path ? ` · ${str(x.path)}` : ""}</span>
                      <span className="text-[11px] text-muted num shrink-0">{fmtDate(str(x.at), true)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title="Denied" subtitle="Attempts to open something the person could not see — repeated denials are worth a conversation" action={<Pill tone={denied.length ? "tone-danger" : "tone-muted"}>{denied.length}</Pill>} />
              {denied.length === 0 ? <div className="px-[var(--s4)] pb-[var(--s4)] text-xs text-muted">No denied attempts.</div> : (
                <ul className="divide-y border-t max-h-96 overflow-y-auto">
                  {denied.map((x, i) => (
                    <li key={i} className="flex items-center gap-2 px-[var(--s4)] py-1.5 text-sm">
                      <Person id={str(x.user_id)} name={str(x.user)} />
                      <span className="text-xs text-muted truncate flex-1">{str(x.path) || "—"}</span>
                      <span className="text-[11px] text-muted num shrink-0">{fmtDate(str(x.at), true)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title={<span className="inline-flex items-center gap-2"><Eye size={15} className="text-muted" /> Sensitive record views</span>} subtitle="Private profiles, employee documents, People Intelligence, payroll, confidential material" action={<Pill tone={sensitive.length ? "tone-violet" : "tone-muted"}>{sensitive.length}</Pill>} />
              {sensitive.length === 0 ? <div className="px-[var(--s4)] pb-[var(--s4)] text-xs text-muted">No sensitive views.</div> : (
                <ul className="divide-y border-t max-h-96 overflow-y-auto">
                  {sensitive.map((x, i) => (
                    <li key={i} className="flex items-center gap-2 px-[var(--s4)] py-1.5 text-sm">
                      <Pill tone="tone-violet">{str(x.entity_type).replace(/_/g, " ")}</Pill>
                      <Person id={str(x.user_id)} name={str(x.user)} />
                      <span className="text-[11px] text-muted num ml-auto shrink-0">{fmtDate(str(x.at), true)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title="Most views" subtitle="People with the most recorded views in the window — context, not a ranking" />
              {topViewers.length === 0 ? <div className="px-[var(--s4)] pb-[var(--s4)] text-xs text-muted">No views recorded.</div> : (
                <ul className="divide-y border-t">
                  {topViewers.map((x, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 px-[var(--s4)] py-1.5 text-sm">
                      <Person id={str(x.user_id)} name={str(x.user)} />
                      <span className="pill tone-neutral num">{num(x.views)} views</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
