"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, ChevronLeft, ScrollText, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, EmptyState, SearchInput, Select, Spinner } from "@/components/ui";
import { ago, cn, fmtDate, humanize } from "@/lib/utils";
import type { Json } from "@/lib/database.types";

type Row = {
  id: number; action: string; entity_type: string; entity_id: string | null; summary: string | null; created_at: string;
  old_value: Json | null; new_value: Json | null; project_id: string | null; task_id: string | null;
  actor: { id: string; full_name: string; avatar_url: string | null } | null;
};

const PAGE = 40;
const ACTION_PREFIXES = ["task", "project", "approval", "file", "profile", "decision"];
const ENTITY_TYPES = ["task", "project", "approval", "file", "profile", "decision", "meeting", "wiki"];

function entityLink(r: Row) {
  if (!r.entity_id) return null;
  switch (r.entity_type) {
    case "task": return `/tasks/${r.entity_id}`;
    case "project": return `/projects/${r.entity_id}`;
    case "approval": return `/approvals/${r.entity_id}`;
    case "file": return `/files/${r.entity_id}`;
    case "profile": return `/people/${r.entity_id}`;
    case "decision": return `/decisions/${r.entity_id}`;
    case "meeting": return `/meetings/${r.entity_id}`;
    default: return null;
  }
}

function actionTone(a: string) {
  if (a.includes("rejected") || a.includes("deleted") || a.includes("permissions")) return "tone-danger";
  if (a.includes("approved") || a.includes("created") || a.includes("uploaded") || a.includes("recorded")) return "tone-success";
  if (a.includes("requested")) return "tone-warn";
  return "tone-neutral";
}

/** Flatten a JSON object to key → value for a compact diff view. */
function flat(j: Json | null): Record<string, string> {
  if (!j || typeof j !== "object" || Array.isArray(j)) return j == null ? {} : { value: String(j) };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(j)) out[k] = v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return out;
}

export function AuditLog() {
  const [page, setPage] = React.useState(0);
  const [action, setActionState] = React.useState("");
  const [entity, setEntityState] = React.useState("");
  const [q, setQState] = React.useState("");
  const [open, setOpen] = React.useState<Record<number, boolean>>({});
  const [tick, setTick] = React.useState(0);
  const [loaded, setLoaded] = React.useState<{ key: string; rows: Row[]; total: number | null } | null>(null);
  const key = JSON.stringify([page, action, entity, q.trim(), tick]);
  const loading = !loaded || loaded.key !== key;
  const rows = loaded?.rows ?? [];
  const total = loaded?.total ?? null;
  const setAction = (v: string) => { setActionState(v); setPage(0); };
  const setEntity = (v: string) => { setEntityState(v); setPage(0); };
  const setQ = (v: string) => { setQState(v); setPage(0); };

  React.useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      let query = createClient()
        .from("audit_logs")
        .select("id,action,entity_type,entity_id,summary,created_at,old_value,new_value,project_id,task_id,actor:profiles!audit_logs_actor_id_fkey(id,full_name,avatar_url)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (action) query = query.like("action", `${action}.%`);
      if (entity) query = query.eq("entity_type", entity);
      if (q.trim()) query = query.ilike("summary", `%${q.trim().replace(/[%_]/g, " ")}%`);
      const { data, count } = await query;
      if (!alive) return;
      setLoaded({ key, rows: (data || []) as unknown as Row[], total: count ?? null });
    }, q ? 220 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [page, action, entity, q, tick, key]);

  const pages = total != null ? Math.max(1, Math.ceil(total / PAGE)) : 1;

  return (
    <div className="space-y-[var(--s3)]">
      <div className="flex flex-col sm:flex-row gap-2">
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search summaries…" className="flex-1" />
        <div className="grid grid-cols-2 sm:flex gap-2">
          <Select value={action} onChange={(e) => setAction(e.target.value)} className="sm:w-[160px]">
            <option value="">All actions</option>
            {ACTION_PREFIXES.map((a) => <option key={a} value={a}>{humanize(a)}.*</option>)}
          </Select>
          <Select value={entity} onChange={(e) => setEntity(e.target.value)} className="sm:w-[160px]">
            <option value="">All entities</option>
            {ENTITY_TYPES.map((a) => <option key={a} value={a}>{humanize(a)}</option>)}
          </Select>
        </div>
        <Button variant="ghost" icon onClick={() => setTick((t) => t + 1)} aria-label="Refresh"><RefreshCw size={15} className={cn(loading && "animate-spin")} /></Button>
      </div>

      <Card>
        {loading && rows.length === 0 ? (
          <div className="flex justify-center py-[var(--s6)]"><Spinner /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<ScrollText size={20} />} title="No audit entries" hint="Actions on tasks, projects, approvals, files and permissions are recorded here automatically." />
        ) : (
          <div className="divide-y">
            {rows.map((r) => {
              const isOpen = !!open[r.id];
              const oldF = flat(r.old_value);
              const newF = flat(r.new_value);
              const keys = [...new Set([...Object.keys(oldF), ...Object.keys(newF)])];
              const changed = keys.filter((k) => oldF[k] !== newF[k]);
              const href = entityLink(r);
              return (
                <div key={r.id} className={cn(loading && "opacity-60")}>
                  <button onClick={() => setOpen((o) => ({ ...o, [r.id]: !isOpen }))} className="w-full flex items-center gap-3 px-[var(--s3)] sm:px-[var(--s4)] py-2.5 text-left row-hover">
                    <span className="text-muted shrink-0">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                    <span className={cn("pill shrink-0", actionTone(r.action))}>{r.action}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm truncate">{r.summary || <span className="text-muted">—</span>}</span>
                      <span className="block text-[11px] text-muted truncate">{humanize(r.entity_type)}{changed.length ? ` · ${changed.length} field${changed.length > 1 ? "s" : ""} changed` : ""}</span>
                    </span>
                    <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted shrink-0"><Avatar name={r.actor?.full_name} src={r.actor?.avatar_url} size={18} />{r.actor?.full_name || "System"}</span>
                    <span className="text-[11px] text-muted num shrink-0 w-[70px] text-right" title={fmtDate(r.created_at, true)}>{ago(r.created_at)}</span>
                  </button>
                  {isOpen && (
                    <div className="px-[var(--s3)] sm:px-[var(--s4)] pb-3 pl-[42px] sm:pl-[52px]">
                      <div className="text-[11px] text-muted mb-2 flex flex-wrap gap-x-3 gap-y-1">
                        <span className="sm:hidden inline-flex items-center gap-1"><Avatar name={r.actor?.full_name} src={r.actor?.avatar_url} size={14} />{r.actor?.full_name || "System"}</span>
                        <span>{fmtDate(r.created_at, true)}</span>
                        {href && <a href={href} className="link">Open {r.entity_type}</a>}
                        {r.entity_id && <span className="font-mono">{r.entity_id.slice(0, 8)}</span>}
                      </div>
                      {keys.length === 0 ? (
                        <div className="text-xs text-muted">No payload recorded.</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="text-xs min-w-[420px] w-full">
                            <thead><tr className="text-muted text-left"><th className="py-1 pr-3 font-medium w-[140px]">Field</th><th className="py-1 pr-3 font-medium">Before</th><th className="py-1 font-medium">After</th></tr></thead>
                            <tbody>
                              {keys.map((k) => {
                                const diff = oldF[k] !== newF[k];
                                return (
                                  <tr key={k} className={cn("border-t", diff && "font-medium")}>
                                    <td className="py-1 pr-3 font-mono text-muted">{k}</td>
                                    <td className={cn("py-1 pr-3 break-all", diff && "text-danger line-through")}>{oldF[k] ?? "—"}</td>
                                    <td className={cn("py-1 break-all", diff && "text-success")}>{newF[k] ?? "—"}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between text-xs text-muted">
        <span className="num">{total != null ? `${total} entr${total === 1 ? "y" : "ies"}` : ""}</span>
        <span className="flex items-center gap-1">
          <Button size="sm" variant="ghost" icon disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous"><ChevronLeft size={14} /></Button>
          <span className="num">Page {page + 1} / {pages}</span>
          <Button size="sm" variant="ghost" icon disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next"><ChevronRight size={14} /></Button>
        </span>
      </div>
    </div>
  );
}
