"use client";

import * as React from "react";
import Link from "next/link";
import { FlaskConical, CheckCircle2, XCircle, Search, ChevronDown, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, Pill, Spinner, useToast } from "@/components/ui";
import { cn, PRIORITY_TONE, STATUS_LABEL, STATUS_TONE, type TaskPriority, type TaskStatus } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { ENTITY_FIELDS, actionLabel, opLabel, renderTpl, type Action, type Condition, type Entity } from "./model";
import { ActionIcon } from "./AutomationBits";

type TaskHit = { id: string; title: string; status: TaskStatus; priority: TaskPriority; project_id: string | null };
type TestResult = { matches: boolean; failed_conditions: Condition[]; context: Record<string, Json> };

const TEMPLATE_KEYS = ["title", "body", "description", "waiting_note", "name"];

export function TestPanel({ automationId, entity, actions, saved, canTest }: { automationId: string | null; entity: Entity; actions: Action[]; saved: boolean; canTest: boolean }) {
  const toast = useToast();
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<{ q: string; rows: TaskHit[] } | null>(null);
  const [picked, setPicked] = React.useState<TaskHit | null>(null);
  const [result, setResult] = React.useState<{ id: string; res: TestResult } | null>(null);
  const [running, setRunning] = React.useState(false);
  const [showCtx, setShowCtx] = React.useState(false);

  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let alive = true;
    const t = setTimeout(async () => {
      const { data } = await createClient().from("tasks").select("id,title,status,priority,project_id").ilike("title", `%${term.replace(/[%_]/g, " ")}%`).order("updated_at", { ascending: false }).limit(8);
      if (alive) setHits({ q: term, rows: (data || []) as TaskHit[] });
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  async function run(task: TaskHit) {
    if (!automationId) return;
    setPicked(task);
    setRunning(true);
    const { data, error } = await createClient().rpc("test_automation", { p_id: automationId, p_task: task.id });
    setRunning(false);
    if (error) { toast.push(error.message, "danger"); return; }
    setResult({ id: task.id, res: data as unknown as TestResult });
  }

  const fields = ENTITY_FIELDS[entity];
  const fieldLabel = (k: string) => fields.find((f) => f.key === k)?.label || k;
  const res = result && picked && result.id === picked.id ? result.res : null;
  const ctx = res?.context || {};
  const showHits = hits && hits.q === q.trim() && q.trim().length >= 2;

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><FlaskConical size={16} /> Test against a task</span>} subtitle="Evaluates the conditions and renders your templates. Nothing is sent or created." />
      <div className="px-[var(--s4)] pb-[var(--s4)] space-y-3">
        {!canTest ? (
          <div className="text-sm text-muted">Testing requires a manager role or above.</div>
        ) : !saved || !automationId ? (
          <div className="text-sm text-muted">Save the automation first, then test it here.</div>
        ) : entity !== "task" && entity !== "schedule" ? (
          <div className="text-sm text-muted">Testing uses a task as the sample record. This trigger works on {entity}s, so variables like <code className="font-mono text-xs">{"{{title}}"}</code> and <code className="font-mono text-xs">{"{{link}}"}</code> still preview correctly but entity-specific fields may show empty.</div>
        ) : null}
        {canTest && saved && automationId && (
          <>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input className="input pl-9" placeholder="Search tasks by title…" value={q} onChange={(e) => setQ(e.target.value)} />
              {showHits && (
                <div className="absolute left-0 right-0 top-full mt-1 z-40 card p-1 max-h-[260px] overflow-y-auto" style={{ boxShadow: "var(--shadow-lg)" }}>
                  {hits!.rows.length === 0 ? (
                    <div className="text-xs text-muted px-2 py-2">No tasks match.</div>
                  ) : (
                    hits!.rows.map((t) => (
                      <button key={t.id} type="button" onClick={() => { run(t); setQ(""); }} className="w-full flex items-center gap-2 px-2 py-1.5 text-left row-hover rounded-[var(--radius-sm)]">
                        <span className="text-sm truncate flex-1">{t.title}</span>
                        <span className={cn("pill", STATUS_TONE[t.status])}>{STATUS_LABEL[t.status]}</span>
                        <span className={cn("pill", PRIORITY_TONE[t.priority])}>{t.priority}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {picked && (
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="text-muted">Sample:</span>
                <Link href={`/tasks/${picked.id}`} className="link truncate max-w-full">{picked.title}</Link>
                {running ? <Spinner /> : res ? (
                  res.matches ? <Pill tone="tone-success"><CheckCircle2 size={11} /> conditions match</Pill> : <Pill tone="tone-danger"><XCircle size={11} /> {res.failed_conditions.length} condition{res.failed_conditions.length === 1 ? "" : "s"} failed</Pill>
                ) : null}
                <Button size="xs" variant="ghost" onClick={() => run(picked)} disabled={running}>Re-run</Button>
              </div>
            )}

            {res && (
              <div className="space-y-3">
                {res.failed_conditions.length > 0 && (
                  <div className="text-xs space-y-1">
                    {res.failed_conditions.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 flex-wrap">
                        <XCircle size={12} className="text-danger shrink-0" />
                        <span className="font-medium">{fieldLabel(c.field)}</span>
                        <span className="text-muted">{opLabel(c.op)}</span>
                        {c.value !== undefined && <code className="font-mono">{c.value}</code>}
                        <span className="text-muted">— actual:</span>
                        <code className="font-mono">{ctx[c.field] == null || ctx[c.field] === "" ? "∅" : String(ctx[c.field])}</code>
                      </div>
                    ))}
                  </div>
                )}

                {actions.length > 0 && (
                  <div>
                    <div className="eyebrow mb-1.5">Rendered previews</div>
                    <div className="space-y-1.5">
                      {actions.map((a, i) => {
                        const tplKeys = TEMPLATE_KEYS.filter((k) => typeof a[k] === "string" && String(a[k]).trim());
                        return (
                          <div key={i} className="sunken rounded-[var(--radius-sm)] px-3 py-2 text-xs">
                            <div className="inline-flex items-center gap-1.5 font-medium"><ActionIcon type={a.type} size={12} /> {actionLabel(a.type)}</div>
                            {tplKeys.length === 0 ? (
                              <div className="text-muted mt-0.5">No text templates in this action.</div>
                            ) : (
                              tplKeys.map((k) => (
                                <div key={k} className="mt-1 flex gap-2">
                                  <span className="text-muted shrink-0 w-[80px] truncate">{k}</span>
                                  <span className="whitespace-pre-wrap break-words">{renderTpl(String(a[k]), ctx)}</span>
                                </div>
                              ))
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <button type="button" className="inline-flex items-center gap-1 text-xs text-muted" onClick={() => setShowCtx((s) => !s)}>
                    {showCtx ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Context ({Object.keys(ctx).length} variables)
                  </button>
                  {showCtx && (
                    <div className="overflow-x-auto mt-1.5">
                      <table className="text-xs w-full min-w-[360px]">
                        <tbody>
                          {Object.entries(ctx).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
                            <tr key={k} className="border-t">
                              <td className="py-1 pr-3 font-mono text-muted whitespace-nowrap">{`{{${k}}}`}</td>
                              <td className="py-1 break-all">{v == null || v === "" ? <span className="text-muted">∅</span> : typeof v === "object" ? JSON.stringify(v) : String(v)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
