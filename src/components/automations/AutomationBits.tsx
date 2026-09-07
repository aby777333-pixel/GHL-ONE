"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, ListPlus, PencilLine, MessageSquare, CheckSquare, Webhook, Hash, FolderPlus, Braces, Copy, X, ScrollText, AlertTriangle, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Modal, Pill, Spinner, EmptyState, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, cn, fmtDate } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { actionLabel, actionSummary, variablesFor, type Action, type Entity, type RunRow } from "./model";

/* ------------------------------------------------------------- icons */
export function ActionIcon({ type, size = 13 }: { type: string; size?: number }) {
  switch (type) {
    case "notify": return <Bell size={size} />;
    case "create_task": return <ListPlus size={size} />;
    case "update_task": return <PencilLine size={size} />;
    case "post_message": return <MessageSquare size={size} />;
    case "create_approval": return <CheckSquare size={size} />;
    case "webhook": return <Webhook size={size} />;
    case "slack": return <Hash size={size} />;
    case "create_project_from_template": return <FolderPlus size={size} />;
    default: return <Braces size={size} />;
  }
}
export const ACTION_TONE: Record<string, string> = {
  notify: "tone-info", create_task: "tone-success", update_task: "tone-warn", post_message: "tone-violet",
  create_approval: "tone-orange", webhook: "tone-neutral", slack: "tone-neutral", create_project_from_template: "tone-success",
};

/** Names helper for summaries (people + departments from the session). */
export function useNames() {
  const { people, departments } = useSession();
  return React.useMemo(
    () => ({
      person: (id: string) => people.find((p) => p.id === id)?.full_name || "a person",
      department: (id: string) => departments.find((d) => d.id === id)?.name || "a department",
    }),
    [people, departments]
  );
}

export function ActionChip({ action, className }: { action: Action; className?: string }) {
  const names = useNames();
  return (
    <span className={cn("pill", ACTION_TONE[action.type] || "tone-neutral", className)} title={actionSummary(action, names)}>
      <ActionIcon type={action.type} size={11} /> {actionLabel(action.type)}
    </span>
  );
}

/* ------------------------------------------------------------ toggle */
export function Toggle({ on, onChange, label, hint, disabled, size = "md" }: { on: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; hint?: string; disabled?: boolean; size?: "sm" | "md" }) {
  const sm = size === "sm";
  return (
    <label className={cn("inline-flex items-start gap-2.5", disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer")}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); onChange(!on); }}
        className={cn("relative shrink-0 inline-flex items-center rounded-full transition-colors", sm ? "h-4 w-7 mt-0.5" : "h-5 w-9 mt-0.5", on ? "bg-[var(--brand)]" : "bg-[var(--line-strong)]")}
      >
        <span className={cn("inline-block rounded-full bg-white shadow transition-transform", sm ? "h-3 w-3" : "h-4 w-4", on ? (sm ? "translate-x-[14px]" : "translate-x-[18px]") : "translate-x-[2px]")} />
      </button>
      {(label || hint) && (
        <span className="text-sm min-w-0">
          {label && <span className="font-medium">{label}</span>}
          {hint && <span className="block text-xs text-muted">{hint}</span>}
        </span>
      )}
    </label>
  );
}

/* -------------------------------------------------- variables popover */
export function VariablesHelp({ entity }: { entity: Entity }) {
  const [open, setOpen] = React.useState(false);
  const toast = useToast();
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const vars = variablesFor(entity);
  return (
    <div ref={ref} className="relative inline-flex">
      <Button type="button" size="xs" variant="ghost" onClick={() => setOpen((o) => !o)}><Braces size={12} /> Variables</Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 card p-2 w-[min(92vw,340px)] anim-pop" style={{ boxShadow: "var(--shadow-lg)" }}>
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="eyebrow">Template variables</span>
            <button type="button" className="text-muted" onClick={() => setOpen(false)} aria-label="Close"><X size={13} /></button>
          </div>
          <div className="max-h-[260px] overflow-y-auto divide-y">
            {vars.map((v) => (
              <button
                type="button"
                key={v.key}
                className="w-full flex items-center gap-2 px-1.5 py-1.5 text-left row-hover rounded-[var(--radius-sm)]"
                onClick={() => { navigator.clipboard?.writeText(`{{${v.key}}}`); toast.push(`Copied {{${v.key}}}`, "success"); }}
              >
                <code className="text-[11px] font-mono shrink-0 text-[var(--brand-2)]">{`{{${v.key}}}`}</code>
                <span className="text-[11px] text-muted truncate flex-1">{v.desc}</span>
                <Copy size={11} className="text-muted shrink-0" />
              </button>
            ))}
          </div>
          <div className="text-[10px] text-muted px-1 pt-1">Click to copy. Unknown variables render as empty text.</div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ run log */
type RunDetail = Record<string, Json | undefined>;

function detailsToChips(details: Json | null): { text: string; tone: string; href?: string }[] {
  if (!details) return [];
  if (Array.isArray(details)) {
    return details
      .filter((d): d is RunDetail => !!d && typeof d === "object" && !Array.isArray(d))
      .map((d) => {
        const t = String(d.type || "");
        if (d.skipped) return { text: `${actionLabel(t)}: skipped (${String(d.skipped)})`, tone: "tone-muted" };
        if (d.notified != null) return { text: `notified ${String(d.notified)}`, tone: "tone-info" };
        if (d.task_id) return { text: "task created", tone: "tone-success", href: `/tasks/${String(d.task_id)}` };
        if (d.updated) return { text: "task updated", tone: "tone-warn", href: `/tasks/${String(d.updated)}` };
        if (d.channel_id) return { text: "message posted", tone: "tone-violet", href: `/chat/${String(d.channel_id)}` };
        if (d.approval_id) return { text: "approval requested", tone: "tone-orange", href: `/approvals/${String(d.approval_id)}` };
        if (d.delivery) return { text: `${t === "slack" ? "Slack" : "webhook"} delivery #${String(d.delivery)}`, tone: "tone-neutral" };
        if (d.project_id) return { text: "project created", tone: "tone-success", href: `/projects/${String(d.project_id)}` };
        return { text: actionLabel(t), tone: "tone-neutral" };
      });
  }
  if (typeof details === "object") {
    const d = details as RunDetail;
    const out: { text: string; tone: string; href?: string }[] = [];
    if (d.error) out.push({ text: String(d.error), tone: "tone-danger" });
    if (Array.isArray(d.partial)) out.push(...detailsToChips(d.partial));
    return out;
  }
  return [{ text: String(details), tone: "tone-neutral" }];
}

export function entityHref(type: string | null, id: string | null) {
  if (!id) return null;
  switch (type) {
    case "task": case "handoff": return `/tasks/${id}`;
    case "approval": return `/approvals/${id}`;
    case "project": return `/projects/${id}`;
    case "decision": return `/decisions/${id}`;
    case "file": return `/files/${id}`;
    default: return null;
  }
}

export function RunLogDrawer({ automationId, name, open, onClose }: { automationId: string; name: string; open: boolean; onClose: () => void }) {
  const [rows, setRows] = React.useState<{ id: string; rows: RunRow[] } | null>(null);
  const loading = !rows || rows.id !== automationId;
  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    createClient()
      .from("automation_runs")
      .select("*")
      .eq("automation_id", automationId)
      .order("created_at", { ascending: false })
      .limit(60)
      .then(({ data }) => alive && setRows({ id: automationId, rows: data || [] }));
    return () => { alive = false; };
  }, [open, automationId]);
  return (
    <Modal open={open} onClose={onClose} side width={520} title={<span className="inline-flex items-center gap-2"><ScrollText size={16} /> Run log · {name}</span>}>
      {loading ? (
        <div className="flex justify-center py-[var(--s6)]"><Spinner /></div>
      ) : rows.rows.length === 0 ? (
        <EmptyState icon={<ScrollText size={18} />} title="No runs yet" hint="Runs appear here every time the trigger fires and the conditions match." />
      ) : (
        <div className="divide-y -mx-[var(--s4)]">
          {rows.rows.map((r) => {
            const chips = detailsToChips(r.details);
            const href = entityHref(r.entity_type, r.entity_id);
            return (
              <div key={r.id} className="px-[var(--s4)] py-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Pill tone={r.status === "ok" ? "tone-success" : r.status === "error" ? "tone-danger" : "tone-muted"}>{r.status === "error" && <AlertTriangle size={10} />} {r.status}</Pill>
                  <span className="text-xs font-mono text-muted">{r.event}</span>
                  <span className="text-[11px] text-muted num ml-auto" title={fmtDate(r.created_at, true)}>{ago(r.created_at)}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  {chips.map((c, i) =>
                    c.href ? (
                      <Link key={i} href={c.href} className={cn("pill", c.tone)}>{c.text} <ExternalLink size={10} /></Link>
                    ) : (
                      <span key={i} className={cn("pill", c.tone, c.tone === "tone-danger" && "whitespace-normal h-auto py-0.5 text-left")}>{c.text}</span>
                    )
                  )}
                  {href && <Link href={href} className="text-[11px] link ml-auto">Open {r.entity_type}</Link>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
