"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronRight, ClipboardList, IndianRupee, MessageSquareWarning, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Pill, Select, Tabs, Textarea, useToast } from "@/components/ui";
import { PriorityPicker } from "@/components/pickers";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink, useSeen } from "@/components/providers/ActivityProvider";
import { WhoHasBall } from "@/components/mywork/WhoHasBall";
import { ago, cn, fmtDate, humanize, relDate, type Tables, type TaskPriority } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { KIND_HAS_AMOUNT, KIND_HAS_DATES, REQUEST_KIND_HINT, REQUEST_KIND_LABEL, REQUEST_KINDS, REQUEST_STATUS_TONE, jsonObj, str, useTouchModule, type RequestKind } from "@/components/intel/lib";

export type RequestRow = Tables<"requests">;
type TabKey = "mine" | "approvals" | "all";

export function RequestCenter({ rows, initialTab, threshold }: { rows: RequestRow[]; initialTab?: string; threshold: number }) {
  const { profile } = useSession();
  const router = useRouter();
  useTouchModule("requests");
  useSeen("nav:/requests");
  const mine = rows.filter((r) => r.user_id === profile.id);
  const toApprove = rows.filter((r) => r.status === "pending" && (r.approver_id === profile.id || (r.second_approver_id === profile.id && r.approver_id === profile.id)));
  const others = rows.filter((r) => r.user_id !== profile.id && !toApprove.includes(r));
  const [tab, setTab] = React.useState<TabKey>(initialTab === "approvals" && toApprove.length ? "approvals" : initialTab === "all" ? "all" : "mine");
  const [open, setOpen] = React.useState(initialTab === "new");
  const [filter, setFilter] = React.useState<"active" | "all">("active");

  const visibleMine = filter === "active" ? mine.filter((r) => r.status === "pending") : mine;
  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "mine", label: "My requests", count: mine.filter((r) => r.status === "pending").length || undefined },
    { key: "approvals", label: "To approve", count: toApprove.length || undefined },
    ...(others.length ? [{ key: "all" as TabKey, label: "Team & others", count: others.length }] : []),
  ];

  return (
    <div className="page">
      <PageHeader eyebrow="Self-service" title="Request Center" subtitle="Expenses, travel, purchases, WFH, field duty, overtime, comp-off, training — routed to the right approver automatically with an SLA." actions={<Button variant="primary" onClick={() => setOpen(true)}><Plus size={15} /> New request</Button>} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-3" />

      {tab === "mine" && (
        <Card>
          <CardHeader title="My requests" subtitle={`${mine.filter((r) => r.status === "pending").length} pending`} action={<Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="!h-8 !text-xs !w-auto"><option value="active">Pending only</option><option value="all">Everything</option></Select>} />
          {visibleMine.length === 0 ? (
            <EmptyState icon={<ClipboardList size={18} />} title={filter === "active" ? "No pending requests" : "No requests yet"} hint="Raise expenses, travel, WFH and other requests here — your manager gets notified and the SLA clock starts." action={<Button variant="primary" size="sm" onClick={() => setOpen(true)}><Plus size={14} /> New request</Button>} />
          ) : (
            <div className="divide-y border-t">{visibleMine.map((r) => <RequestItem key={r.id} r={r} mine onChanged={() => router.refresh()} threshold={threshold} />)}</div>
          )}
        </Card>
      )}

      {tab === "approvals" && (
        <Card>
          <CardHeader title="Waiting for your decision" subtitle="Approve, decline, or ask for changes. Big-ticket items go to a second approver automatically." />
          {toApprove.length === 0 ? <EmptyState icon={<Check size={18} />} title="Nothing to approve" className="py-[var(--s5)]" /> : <div className="divide-y border-t">{toApprove.map((r) => <RequestItem key={r.id} r={r} approver onChanged={() => router.refresh()} threshold={threshold} />)}</div>}
        </Card>
      )}

      {tab === "all" && (
        <Card>
          <CardHeader title="Team & others" subtitle="Requests you can see as a manager, HR or second approver." />
          <div className="divide-y border-t">{others.map((r) => <RequestItem key={r.id} r={r} onChanged={() => router.refresh()} threshold={threshold} />)}</div>
        </Card>
      )}

      <NewRequestModal open={open} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); setTab("mine"); setFilter("active"); router.refresh(); }} threshold={threshold} />
    </div>
  );
}

/* ------------------------------------------------------------------- row */
function RequestItem({ r, mine, approver, onChanged, threshold }: { r: RequestRow; mine?: boolean; approver?: boolean; onChanged: () => void; threshold: number }) {
  const { profile } = useSession();
  const toast = useToast();
  const [expanded, setExpanded] = React.useState(!!approver);
  const [mode, setMode] = React.useState<null | "approved" | "rejected" | "changes">(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const payload = jsonObj(r.payload);
  const firstApproved = typeof payload.first_approved_by === "string" ? payload.first_approved_by : null;
  const [now] = React.useState(() => Date.now());
  const overSla = r.status === "pending" && !!r.sla_due_at && new Date(r.sla_due_at).getTime() < now;
  const kind = r.kind as RequestKind;
  const iAmSecond = r.second_approver_id === profile.id && r.approver_id === profile.id && !!firstApproved;

  async function decide(status: "approved" | "rejected", decision_note?: string) {
    setBusy(true);
    const patch: Partial<RequestRow> = { status, decision_note: decision_note || null };
    if (status === "approved" && iAmSecond) patch.payload = { ...payload, second_approved: true } as Json;
    const { error } = await createClient().from("requests").update(patch).eq("id", r.id);
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(status === "approved" ? (r.second_approver_id && !iAmSecond && r.second_approver_id !== profile.id ? "Approved — now with the second approver" : "Approved") : "Declined", status === "approved" ? "success" : "info");
    setMode(null); setNote(""); onChanged();
  }
  async function requestChanges() {
    if (!note.trim()) return;
    setBusy(true);
    // Not a decision: keep it pending, write the note and DM the requester (the trigger only notifies on a status change).
    const sb = createClient();
    const { error } = await sb.from("requests").update({ decision_note: `Changes requested: ${note.trim()}`, payload: { ...payload, changes_requested_by: profile.id, changes_requested_at: new Date().toISOString() } as Json }).eq("id", r.id);
    if (!error) {
      const { data: dm } = await sb.rpc("open_dm", { other: r.user_id });
      if (dm) await sb.from("messages").insert({ channel_id: dm, author_id: profile.id, body: `Changes requested on your request “${r.title}”: ${note.trim()}\n/requests` });
    }
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Requester notified", "success"); setMode(null); setNote(""); onChanged();
  }
  async function cancel() {
    setBusy(true);
    const { error } = await createClient().from("requests").update({ status: "cancelled" }).eq("id", r.id);
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Request withdrawn", "info"); onChanged();
  }

  return (
    <div className="px-[var(--s4)] py-3">
      <button type="button" className="w-full text-left flex items-start gap-3" onClick={() => setExpanded((e) => !e)}>
        <span className={cn("mt-1 w-8 h-8 rounded-full inline-flex items-center justify-center shrink-0", KIND_HAS_AMOUNT.includes(kind) ? "tone-violet" : "tone-info")}>{KIND_HAS_AMOUNT.includes(kind) ? <IndianRupee size={14} /> : <ClipboardList size={14} />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{r.title}</span>
            <Blink zone={`user:${r.user_id}`} />
            <Pill tone="tone-neutral">{REQUEST_KIND_LABEL[kind] || humanize(r.kind)}</Pill>
            <Pill tone={REQUEST_STATUS_TONE[r.status] || "tone-neutral"} className="capitalize">{r.status}</Pill>
            {overSla && <Pill tone="tone-danger"><AlertTriangle size={10} /> Over SLA</Pill>}
            {r.escalated_at && <Pill tone="tone-orange">Escalated</Pill>}
          </div>
          <div className="text-[11px] text-muted mt-0.5 flex items-center gap-2 flex-wrap">
            {!mine && <PersonChip id={r.user_id} size={14} />}
            <span>{ago(r.created_at)}</span>
            {r.amount != null && <span className="num">₹{Number(r.amount).toLocaleString("en-IN")}</span>}
            {r.starts_on && <span className="num">{fmtDate(r.starts_on)}{r.ends_on && r.ends_on !== r.starts_on ? ` → ${fmtDate(r.ends_on)}` : ""}</span>}
            {r.status === "pending" && r.sla_due_at && <span className={cn("num", overSla && "text-danger")}>SLA {relDate(r.sla_due_at)}</span>}
          </div>
        </div>
        <ChevronRight size={14} className={cn("text-muted mt-2 transition-transform shrink-0", expanded && "rotate-90")} />
      </button>

      {expanded && (
        <div className="mt-3 pl-11 space-y-3">
          {r.details && <p className="text-sm whitespace-pre-wrap">{r.details}</p>}
          <ImpactLine r={r} threshold={threshold} firstApproved={firstApproved} />
          <div className="flex flex-wrap items-center gap-2">
            <WhoHasBall type="request" id={r.id} size="sm" refreshKey={r.updated_at} />
            {r.decision_note && <span className="text-xs text-muted">“{r.decision_note}”{r.decided_by && <> — <PersonChip id={r.decided_by} size={12} /></>}</span>}
          </div>

          {approver && r.status === "pending" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="success" loading={busy && mode === "approved"} onClick={() => decide("approved")}><Check size={13} /> Approve</Button>
                <Button size="sm" variant={mode === "rejected" ? "danger" : "secondary"} onClick={() => setMode(mode === "rejected" ? null : "rejected")}><X size={13} /> Decline</Button>
                <Button size="sm" variant={mode === "changes" ? "primary" : "secondary"} onClick={() => setMode(mode === "changes" ? null : "changes")}><MessageSquareWarning size={13} /> Ask for changes</Button>
              </div>
              {mode && mode !== "approved" && (
                <div className="flex items-end gap-2">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "rejected" ? "Tell them why (they will see this)" : "What needs to change?"} style={{ minHeight: 48 }} className="flex-1" autoFocus />
                  {mode === "rejected" ? <Button size="sm" variant="danger" loading={busy} onClick={() => decide("rejected", note.trim() || undefined)}>Decline</Button> : <Button size="sm" variant="primary" loading={busy} disabled={!note.trim()} onClick={requestChanges}>Send</Button>}
                </div>
              )}
            </div>
          )}
          {mine && r.status === "pending" && <Button size="xs" variant="ghost" loading={busy} onClick={cancel}>Withdraw request</Button>}
        </div>
      )}
    </div>
  );
}

/** Who this affects and money vs threshold — an approver should never have to guess. */
function ImpactLine({ r, threshold, firstApproved }: { r: RequestRow; threshold: number; firstApproved: string | null }) {
  const parts: React.ReactNode[] = [];
  const amount = r.amount != null ? Number(r.amount) : null;
  if (amount != null) parts.push(<span key="amt" className={cn("num", amount >= threshold && "text-warn font-medium")}>₹{amount.toLocaleString("en-IN")}{amount >= threshold ? ` · above the ₹${threshold.toLocaleString("en-IN")} threshold — needs a second approval` : ` · under the ₹${threshold.toLocaleString("en-IN")} threshold`}</span>);
  if (r.starts_on) {
    const days = r.ends_on ? Math.round((new Date(r.ends_on).getTime() - new Date(r.starts_on).getTime()) / 86400000) + 1 : 1;
    parts.push(<span key="days" className="num">{days} day{days === 1 ? "" : "s"} {r.kind === "wfh" ? "away from the office" : r.kind === "field_duty" ? "on field duty" : "affected"}</span>);
  }
  if (r.approver_id) parts.push(<span key="appr" className="inline-flex items-center gap-1">Approver <PersonChip id={r.approver_id} size={14} /></span>);
  if (r.second_approver_id) parts.push(<span key="second" className="inline-flex items-center gap-1">{firstApproved ? <>First approval by <PersonChip id={firstApproved} size={14} /> · now with</> : "Then"} <PersonChip id={r.second_approver_id} size={14} /></span>);
  if (!parts.length) return null;
  return <div className="text-xs text-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-sm)] sunken px-2.5 py-1.5"><span className="eyebrow">Impact</span>{parts}</div>;
}

/* ---------------------------------------------------------------- wizard */
function NewRequestModal({ open, onClose, onCreated, threshold }: { open: boolean; onClose: () => void; onCreated: () => void; threshold: number }) {
  const { profile } = useSession();
  const toast = useToast();
  const [step, setStep] = React.useState<1 | 2>(1);
  const [kind, setKind] = React.useState<RequestKind>("expense");
  const [title, setTitle] = React.useState("");
  const [details, setDetails] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [hours, setHours] = React.useState("");
  const [days, setDays] = React.useState("1");
  const [attachments, setAttachments] = React.useState("");
  const [priority, setPriority] = React.useState<TaskPriority>("normal");
  const [busy, setBusy] = React.useState(false);
  const [similar, setSimilar] = React.useState<{ key: string; rows: { id: string; title: string; status: string }[] }>({ key: "", rows: [] });

  const hasAmount = KIND_HAS_AMOUNT.includes(kind);
  const hasDates = KIND_HAS_DATES.includes(kind);
  const titleOk = title.trim().length >= 8;
  const detailsOk = details.trim().length > 0;
  const amountNum = amount ? Number(amount) : null;
  const canSubmit = titleOk && detailsOk && (!hasAmount || amountNum == null || amountNum >= 0) && (!hasDates || !from || !to || to >= from);

  // "Already asked?" — cheap duplicate check on my own pending requests of the same kind.
  React.useEffect(() => {
    const q = title.trim();
    if (q.length < 6 || !open) return;
    let alive = true;
    const t = setTimeout(async () => {
      const { data } = await createClient().from("requests").select("id,title,status").eq("user_id", profile.id).eq("kind", kind).eq("status", "pending").ilike("title", `%${q.slice(0, 24)}%`).limit(3);
      if (alive) setSimilar({ key: q, rows: data || [] });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [title, kind, open, profile.id]);

  function reset() { setStep(1); setTitle(""); setDetails(""); setAmount(""); setFrom(""); setTo(""); setHours(""); setDays("1"); setAttachments(""); setPriority("normal"); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    const payload: Record<string, Json> = { priority };
    if (hours) payload.hours = Number(hours);
    if (kind === "comp_off") payload.days = Number(days) || 1;
    if (attachments.trim()) payload.attachments = attachments.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
    const { error } = await createClient().from("requests").insert({
      org_id: profile.org_id!, user_id: profile.id, kind, title: title.trim(), details: details.trim(), payload: payload as Json,
      amount: hasAmount && amountNum != null && amount !== "" ? amountNum : null,
      starts_on: hasDates && from ? from : null, ends_on: hasDates ? (to || from || null) : null,
    });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Request sent — your approver has been notified", "success");
    reset(); onCreated();
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title={step === 1 ? "New request · what is it about?" : `New request · ${REQUEST_KIND_LABEL[kind]}`} width={620}>
      {step === 1 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {REQUEST_KINDS.map((k) => (
            <button key={k} type="button" onClick={() => { setKind(k); setStep(2); }} className={cn("card card-hover text-left p-3", kind === k && "border-[var(--brand)]")}>
              <div className="text-sm font-medium">{REQUEST_KIND_LABEL[k]}</div>
              <div className="text-[11px] text-muted mt-0.5">{REQUEST_KIND_HINT[k]}</div>
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <button type="button" className="text-xs text-muted hover:text-[var(--fg)]" onClick={() => setStep(1)}>← Change type</button>
          <Field label="Title" hint={titleOk ? undefined : "At least 8 characters — say what it is for."}>
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "expense" ? "e.g. Client lunch — Mauritius delegation" : kind === "wfh" ? "e.g. WFH while the AC is repaired" : "What do you need?"} required minLength={8} />
          </Field>
          {similar.key === title.trim() && similar.rows.length > 0 && (
            <div className="text-xs rounded-[var(--radius-sm)] border px-2.5 py-2 tone-warn"><AlertTriangle size={12} className="inline mr-1" /> You already have a pending {REQUEST_KIND_LABEL[kind].toLowerCase()} that looks similar: {similar.rows.map((s) => `“${s.title}”`).join(", ")}. Withdraw it first if this replaces it.</div>
          )}
          <Field label="Details" hint="Approvers decide faster with context: why, for whom, what happens if it is declined.">
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} required style={{ minHeight: 80 }} placeholder="Context, justification, links…" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {hasAmount && (
              <Field label="Amount (₹)" hint={amountNum != null && amountNum >= threshold ? `Above ₹${threshold.toLocaleString("en-IN")} — a second approval (Finance) is added automatically.` : undefined}>
                <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
              </Field>
            )}
            {hasDates && (
              <>
                <Field label={kind === "late_explanation" ? "Date" : "From"}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required /></Field>
                {kind !== "late_explanation" && <Field label="To"><Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field>}
              </>
            )}
            {kind === "overtime" && <Field label="Hours"><Input type="number" min={0} step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>}
            {kind === "comp_off" && <Field label="Days to credit"><Input type="number" min={0.5} step="0.5" value={days} onChange={(e) => setDays(e.target.value)} /></Field>}
            <Field label="Priority"><PriorityPicker value={priority} onChange={setPriority} /></Field>
          </div>
          <Field label="Attachments" hint="Paste file paths or links (receipts, quotes, tickets) — one per line. Upload to Files first if needed.">
            <Textarea value={attachments} onChange={(e) => setAttachments(e.target.value)} style={{ minHeight: 48 }} placeholder="files/receipts/lunch-12-sep.pdf" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!canSubmit} title={!canSubmit ? "Add a title (8+ characters) and details" : undefined}>Send for approval</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export const requestKindLabel = (k: string) => REQUEST_KIND_LABEL[k as RequestKind] || str(k);
