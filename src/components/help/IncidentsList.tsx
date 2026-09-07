"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Flame } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardHeader, EmptyState, Pill } from "@/components/ui";
import { Blink } from "@/components/providers/ActivityProvider";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { ago, humanize, type Tables } from "@/lib/utils";
import { INCIDENT_STATUS_TONE, SEVERITY_TONE } from "./IncidentView";

type Row = Pick<Tables<"incidents">, "id" | "title" | "severity" | "status" | "department_id" | "owner_id" | "channel_id" | "started_at">;

/** Open incidents (open + mitigated). RLS shows them to internal staff only; loads client-side and follows realtime changes. */
export function IncidentsList() {
  const { departments } = useSession();
  const [rows, setRows] = React.useState<Row[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    const supabase = createClient();
    const load = () => supabase.from("incidents").select("id,title,severity,status,department_id,owner_id,channel_id,started_at").neq("status", "resolved").order("started_at", { ascending: false }).limit(20).then(({ data }) => { if (alive) setRows(data || []); });
    void load();
    const ch = supabase.channel("incidents-open").on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => { void load(); }).subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, []);

  if (rows === null) return null;
  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><Flame size={16} className={rows.length ? "text-danger" : "text-muted"} /> Incidents</span>} subtitle={rows.length ? `${rows.length} open — join the war room if you can help.` : "Nothing burning right now."} />
      {rows.length === 0 ? (
        <EmptyState title="No open incidents" className="py-[var(--s3)]" />
      ) : (
        <div className="divide-y border-t">
          {rows.map((r) => {
            const dept = departments.find((d) => d.id === r.department_id);
            return (
              <Link key={r.id} href={`/help/incidents/${r.id}`} className="flex items-center gap-3 px-[var(--s4)] py-2.5 row-hover">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate inline-flex items-center gap-1.5">{r.title}{r.channel_id && <Blink zone={`channel:${r.channel_id}`} />}</div>
                  <div className="text-[11px] text-muted truncate">{dept ? `${dept.name} · ` : ""}started {ago(r.started_at)}{r.owner_id && <> · owner <PersonChip id={r.owner_id} size={12} /></>}</div>
                </div>
                <Pill tone={SEVERITY_TONE[r.severity] || "tone-neutral"}>{humanize(r.severity)}</Pill>
                <Pill tone={INCIDENT_STATUS_TONE[r.status] || "tone-neutral"}>{humanize(r.status)}</Pill>
                <ChevronRight size={14} className="text-muted" />
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}
