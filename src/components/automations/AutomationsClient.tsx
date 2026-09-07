"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, Workflow, AlertTriangle, Clock3, ScrollText, FolderKanban, Building2, Zap, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, PageHeader, Pill, Tabs, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, cn, fmtDate, isManagerPlus } from "@/lib/utils";
import { draftFromRow, triggerLabel, type AutomationRow } from "./model";
import { ActionChip, RunLogDrawer, Toggle } from "./AutomationBits";
import { TemplatesGallery } from "./TemplatesGallery";

type Filter = "all" | "enabled" | "errors" | "scheduled";

export function AutomationsClient({ automations, projects, openTemplates }: { automations: AutomationRow[]; projects: { id: string; name: string }[]; openTemplates: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, departments } = useSession();
  const manager = isManagerPlus(profile.role);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [showTemplates, setShowTemplates] = React.useState(openTemplates);
  const [log, setLog] = React.useState<AutomationRow | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const projectName = React.useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const deptName = React.useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  const counts = {
    all: automations.length,
    enabled: automations.filter((a) => a.enabled).length,
    errors: automations.filter((a) => !!a.last_error).length,
    scheduled: automations.filter((a) => a.trigger_type === "schedule").length,
  };
  const list = automations.filter((a) => (filter === "enabled" ? a.enabled : filter === "errors" ? !!a.last_error : filter === "scheduled" ? a.trigger_type === "schedule" : true));

  async function toggle(a: AutomationRow, enabled: boolean) {
    setBusy(a.id);
    const { error } = await createClient().from("automations").update({ enabled }).eq("id", a.id);
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(enabled ? `“${a.name}” enabled` : `“${a.name}” paused`, "success");
    router.refresh();
  }

  function closeTemplates() {
    setShowTemplates(false);
    if (openTemplates) router.replace("/automations");
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Automation"
        title={<span className="inline-flex items-center gap-2"><Workflow size={22} className="text-[var(--brand)]" /> Automations</span>}
        subtitle={<span><span className="font-medium text-[var(--fg)]">WHEN</span> something happens → <span className="font-medium text-[var(--fg)]">IF</span> conditions match → <span className="font-medium text-[var(--fg)]">THEN</span> the company reacts. No code, no waiting.</span>}
        actions={
          <>
            <Button onClick={() => setShowTemplates(true)}><Sparkles size={15} /> Templates</Button>
            {manager && <Link href="/automations/new" className="btn btn-primary"><Plus size={15} /> New automation</Link>}
          </>
        }
      />

      <Tabs<Filter>
        tabs={[
          { key: "all", label: "All", count: counts.all },
          { key: "enabled", label: "Enabled", count: counts.enabled },
          { key: "errors", label: "Errors", count: counts.errors || undefined },
          { key: "scheduled", label: "Scheduled", count: counts.scheduled || undefined },
        ]}
        value={filter}
        onChange={setFilter}
        className="mb-[var(--s3)]"
      />

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={filter === "errors" ? <AlertTriangle size={18} /> : <Zap size={18} />}
            title={filter === "all" ? "No automations yet" : filter === "errors" ? "No errors — everything ran clean" : filter === "scheduled" ? "No scheduled automations" : "Nothing enabled"}
            hint={filter === "all" ? "Start from a template: design hand-offs, critical-ticket escalations, weekly reports, Slack alerts." : undefined}
            action={filter === "all" ? <Button variant="primary" onClick={() => setShowTemplates(true)}><Sparkles size={15} /> Browse templates</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-2 stagger">
          {list.map((a) => {
            const d = draftFromRow(a);
            return (
              <Card key={a.id} className={cn("p-3 sm:px-4", !a.enabled && "opacity-75")}>
                <div className="flex items-start gap-3">
                  <div className="pt-0.5 shrink-0">
                    <Toggle on={a.enabled} onChange={(v) => toggle(a, v)} disabled={!manager || busy === a.id} size="sm" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2 flex-wrap">
                      <Link href={`/automations/${a.id}`} className="font-medium text-sm leading-snug hover:underline min-w-0 break-words">{a.name}</Link>
                      {a.last_error && <Pill tone="tone-danger" className="max-w-full"><AlertTriangle size={10} /> <span className="truncate">error</span></Pill>}
                    </div>
                    {a.description && <div className="text-xs text-muted mt-0.5 line-clamp-2">{a.description}</div>}
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      <Pill tone="tone-brand">{a.trigger_type === "schedule" ? <Clock3 size={10} /> : <Zap size={10} />} {triggerLabel(a.trigger_type, d.trigger_config)}</Pill>
                      {d.conditions.length > 0 && <Pill tone="tone-neutral">IF ×{d.conditions.length}</Pill>}
                      {d.actions.length === 0 ? <Pill tone="tone-warn">no actions</Pill> : d.actions.map((act, i) => <ActionChip key={i} action={act} />)}
                      {a.scope_project_id && <Pill tone="tone-muted"><FolderKanban size={10} /> {projectName.get(a.scope_project_id) || "project"}</Pill>}
                      {a.scope_department_id && <Pill tone="tone-muted"><Building2 size={10} /> {deptName.get(a.scope_department_id) || "department"}</Pill>}
                    </div>
                    {a.last_error && <div className="text-xs text-danger mt-1.5 break-words">{a.last_error}</div>}
                    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px] text-muted mt-2 num">
                      <span>{a.run_count} run{a.run_count === 1 ? "" : "s"}</span>
                      {a.last_run_at && <span title={fmtDate(a.last_run_at, true)}>last {ago(a.last_run_at)}</span>}
                      {a.trigger_type === "schedule" && a.next_run_at && <span title={fmtDate(a.next_run_at, true)}>next {ago(a.next_run_at)}</span>}
                      <button type="button" className="inline-flex items-center gap-1 link" onClick={() => setLog(a)}><ScrollText size={11} /> Run log</button>
                    </div>
                  </div>
                  <Link href={`/automations/${a.id}`} className="btn btn-ghost btn-sm btn-icon shrink-0 hidden sm:inline-flex" aria-label="Open"><ChevronRight size={15} /></Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <TemplatesGallery open={showTemplates} onClose={closeTemplates} />
      {log && <RunLogDrawer automationId={log.id} name={log.name} open onClose={() => setLog(null)} />}
    </div>
  );
}
