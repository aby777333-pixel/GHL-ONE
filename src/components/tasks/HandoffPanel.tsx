"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowRightLeft, Check, ExternalLink, Paperclip, Undo2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Pill, Textarea, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { ago, cn, fmtDate, isLeadPlus, isManagerPlus, relDate, type Tables } from "@/lib/utils";

export type HandoffRow = Tables<"handoffs">;
export type HandoffAsset = { name: string; link: string };
export type HandoffPackage = { brief?: string; copy?: string; assets?: HandoffAsset[]; deadline?: string | null; approver_id?: string | null };

export const HANDOFF_STATUS_LABEL: Record<HandoffRow["status"], string> = { pending: "Pending", accepted: "Accepted", rejected: "Declined" };
export const HANDOFF_STATUS_TONE: Record<HandoffRow["status"], string> = { pending: "tone-warn", accepted: "tone-success", rejected: "tone-danger" };

export function readPackage(p: HandoffRow["package"]): HandoffPackage {
  if (!p || typeof p !== "object" || Array.isArray(p)) return {};
  const o = p as Record<string, unknown>;
  const assets = Array.isArray(o.assets)
    ? (o.assets as unknown[]).flatMap((a) => {
        if (!a || typeof a !== "object") return [];
        const x = a as Record<string, unknown>;
        const link = typeof x.link === "string" ? x.link : typeof x.url === "string" ? x.url : "";
        return link ? [{ name: typeof x.name === "string" && x.name ? x.name : link, link }] : [];
      })
    : [];
  return {
    brief: typeof o.brief === "string" ? o.brief : "",
    copy: typeof o.copy === "string" ? o.copy : "",
    assets,
    deadline: typeof o.deadline === "string" ? o.deadline : null,
    approver_id: typeof o.approver_id === "string" ? o.approver_id : null,
  };
}

/** Who may accept/decline a pending handoff: the named receiver, a lead+ in the receiving department, or any manager+. */
export function canRespondToHandoff(h: HandoffRow, me: { id: string; role: Parameters<typeof isLeadPlus>[0]; department_id: string | null }) {
  if (h.status !== "pending") return false;
  if (h.to_user_id === me.id) return true;
  if (isManagerPlus(me.role)) return true;
  return isLeadPlus(me.role) && !!me.department_id && me.department_id === h.to_department_id;
}

/**
 * Accept / Decline (and Withdraw for the sender) for one pending handoff.
 * The `handoff_after_change` trigger moves the task, assigns the receiver and notifies the sender.
 */
export function HandoffActions({ handoff, compact, onDone }: { handoff: HandoffRow; compact?: boolean; onDone?: () => void }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = React.useState<null | "accept" | "decline">(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const canRespond = canRespondToHandoff(handoff, profile);
  const canWithdraw = handoff.status === "pending" && handoff.from_user_id === profile.id;
  if (!canRespond && !canWithdraw) return null;

  async function respond(status: "accepted" | "rejected", text: string) {
    setBusy(true);
    const { error } = await createClient()
      .from("handoffs")
      .update({ status, note: text || null, responded_by: profile.id, responded_at: new Date().toISOString() })
      .eq("id", handoff.id);
    setBusy(false);
    if (error) return toast.push(error.message, "danger");
    toast.push(status === "accepted" ? "Handoff accepted — the task is now yours" : text === "Withdrawn" ? "Handoff withdrawn" : "Handoff declined — sent back", "success");
    setMode(null);
    setNote("");
    router.refresh();
    onDone?.();
  }

  if (mode) {
    const declining = mode === "decline";
    return (
      <div className="space-y-2 mt-2">
        <Textarea
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={declining ? "Why are you declining? (required — the sender sees this)" : "Optional note for the sender"}
          style={{ minHeight: 60 }}
        />
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="ghost" type="button" onClick={() => { setMode(null); setNote(""); }} disabled={busy}>Cancel</Button>
          <Button size="sm" variant={declining ? "danger" : "success"} type="button" loading={busy} disabled={declining && !note.trim()} onClick={() => respond(declining ? "rejected" : "accepted", note.trim())}>
            {declining ? <><X size={13} /> Decline</> : <><Check size={13} /> Accept</>}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-1.5 flex-wrap", !compact && "mt-2")}>
      {canRespond && (
        <>
          <Button size={compact ? "xs" : "sm"} variant="success" type="button" onClick={() => setMode("accept")}><Check size={13} /> Accept</Button>
          <Button size={compact ? "xs" : "sm"} variant="secondary" type="button" onClick={() => setMode("decline")}><X size={13} /> Decline</Button>
        </>
      )}
      {canWithdraw && (
        <Button size={compact ? "xs" : "sm"} variant="ghost" type="button" loading={busy} onClick={() => { if (window.confirm("Withdraw this handoff? The task returns to your department.")) respond("rejected", "Withdrawn"); }}>
          <Undo2 size={13} /> Withdraw
        </Button>
      )}
    </div>
  );
}

function DeptName({ id }: { id: string | null }) {
  const { departments } = useSession();
  const d = id ? departments.find((x) => x.id === id) : undefined;
  if (!d) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
      <Link href={`/departments/${d.slug}`} className="hover:underline">{d.name}</Link>
    </span>
  );
}

/** Timeline of handoffs for one task, newest first. Anchored at #handoff on the task page. */
export function HandoffPanel({ handoffs, attachmentCount }: { handoffs: HandoffRow[]; attachmentCount: number }) {
  const pending = handoffs.filter((h) => h.status === "pending").length;
  return (
    <section className="card scroll-mt-24" id="handoff">
      <div className="flex items-center gap-2 px-[var(--s4)] pt-[var(--s3)] pb-[var(--s2)]">
        <span className="text-muted"><ArrowRightLeft size={15} /></span>
        <span className="h3">Handoffs</span>
        {pending > 0 && <span className="pill tone-warn">{pending} pending</span>}
        {handoffs.length > 0 && pending === 0 && <span className="pill tone-neutral">{handoffs.length}</span>}
      </div>
      <div className="px-[var(--s4)] pb-[var(--s3)]">
        {handoffs.length === 0 ? (
          <div className="text-sm text-muted py-1">No handoffs yet. Use <span className="font-medium">Hand off to department</span> to pass this task to another team with a brief, copy, assets and a deadline — they accept it explicitly, so nothing falls between departments.</div>
        ) : (
          <ol className="space-y-3">
            {handoffs.map((h) => {
              const pkg = readPackage(h.package);
              const assets = pkg.assets || [];
              return (
                <li key={h.id} className={cn("rounded-[var(--radius-sm)] border p-3", h.status === "pending" ? "border-[var(--warn)] bg-[var(--warn-bg)]" : "sunken border-transparent")}>
                  <div className="flex items-start gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-sm min-w-0 flex-wrap">
                      <DeptName id={h.from_department_id} />
                      <ArrowRight size={13} className="text-muted shrink-0" />
                      <DeptName id={h.to_department_id} />
                      {h.to_user_id && <span className="text-xs text-muted inline-flex items-center gap-1">· to <PersonChip id={h.to_user_id} size={16} /></span>}
                    </div>
                    <Pill tone={HANDOFF_STATUS_TONE[h.status]} className="ml-auto shrink-0">{HANDOFF_STATUS_LABEL[h.status]}</Pill>
                  </div>
                  {pkg.brief && <div className="text-sm mt-2 whitespace-pre-wrap break-words">{pkg.brief}</div>}
                  {pkg.copy && <div className="text-xs text-2 mt-1.5 whitespace-pre-wrap break-words border-l-2 pl-2">{pkg.copy}</div>}
                  <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-2 text-[11px] text-muted">
                    {pkg.deadline && <span className="num">Deadline {relDate(pkg.deadline)} · {fmtDate(pkg.deadline, true)}</span>}
                    {pkg.approver_id && <span className="inline-flex items-center gap-1">Approver <PersonChip id={pkg.approver_id} size={14} /></span>}
                    {attachmentCount > 0 && <span className="inline-flex items-center gap-1"><Paperclip size={11} /> {attachmentCount} attachment{attachmentCount === 1 ? "" : "s"} on the task</span>}
                  </div>
                  {assets.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5 mt-2">
                      {assets.map((a, i) => (
                        <li key={i}>
                          <a href={a.link} target="_blank" rel="noreferrer" className="pill tone-neutral hover:bg-[var(--line)] max-w-[240px]"><ExternalLink size={10} /><span className="truncate">{a.name}</span></a>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex items-center gap-2 flex-wrap mt-2 text-[11px] text-muted">
                    <span className="inline-flex items-center gap-1">Sent by <PersonChip id={h.from_user_id} size={14} /> <span className="num" title={fmtDate(h.created_at, true)}>{ago(h.created_at)}</span></span>
                    {h.responded_at && (
                      <span className="inline-flex items-center gap-1">· {h.status === "accepted" ? "Accepted" : "Declined"} by <PersonChip id={h.responded_by} size={14} /> <span className="num" title={fmtDate(h.responded_at, true)}>{ago(h.responded_at)}</span></span>
                    )}
                  </div>
                  {h.note && h.status !== "pending" && <div className="text-xs mt-1.5 rounded-[var(--radius-sm)] bg-[var(--bg-elev)] border px-2 py-1.5 break-words">“{h.note}”</div>}
                  <HandoffActions handoff={h} />
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
