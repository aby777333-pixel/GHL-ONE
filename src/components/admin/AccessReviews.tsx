"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ClipboardCheck, DoorOpen, Hourglass, Play, RefreshCw, ShieldOff, UserX, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Progress, Spinner, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, cn, fmtDate, humanize } from "@/lib/utils";
import type { Json } from "@/lib/database.types";
import { Note, PersonLine } from "./AdminBits";
import { jsonArray, jsonObj, num, str, type AccessReviewItemRow, type AccessReviewRow } from "./people/lib";

type Findings = Record<string, Json | undefined>;

/** Access reviews (recertification) and findings — mounted at the bottom of the Access tab. */
export function AccessReviews({ canApply, initialReview }: { canApply: boolean; initialReview?: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, departments } = useSession();
  const [reviews, setReviews] = React.useState<AccessReviewRow[] | null>(null);
  const [items, setItems] = React.useState<AccessReviewItemRow[]>([]);
  const [findings, setFindings] = React.useState<Findings | null>(null);
  const [tick, setTick] = React.useState(0);
  const [starting, setStarting] = React.useState(false);
  const [openReview, setOpenReview] = React.useState<string | null>(initialReview || null);
  const [name, setName] = React.useState("");
  const [dept, setDept] = React.useState("");
  const [due, setDue] = React.useState(() => new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10));
  const [busy, setBusy] = React.useState(false);
  const [decide, setDecide] = React.useState<{ item: AccessReviewItemRow; decision: "keep" | "remove" | "extend" } | null>(null);

  React.useEffect(() => {
    let alive = true;
    const sb = createClient();
    Promise.all([sb.from("access_reviews").select("*").order("created_at", { ascending: false }).limit(50), sb.from("access_review_items").select("*").limit(2000), sb.rpc("access_findings")]).then(([r, i, f]) => {
      if (!alive) return;
      setReviews(r.data || []);
      setItems(i.data || []);
      setFindings(jsonObj(f.data));
    });
    return () => { alive = false; };
  }, [tick]);

  async function start() {
    if (!name.trim()) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("start_access_review", { p_name: name.trim(), p_department: dept || undefined, p_due: due });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Review started — reviewers have been notified", "success");
    setStarting(false); setName(""); setDept("");
    setOpenReview(data || null);
    setTick((t) => t + 1);
  }
  async function apply(id: string) {
    if (!confirm("Apply this review? Items marked Remove are revoked; Extend updates the expiry.")) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("apply_access_review", { p_review: id });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    const o = jsonObj(data);
    toast.push(`Applied — ${num(o.removed)} removed, ${num(o.extended)} extended`, "success");
    setTick((t) => t + 1); router.refresh();
  }
  async function saveDecision(note: string, extendTo: string) {
    if (!decide) return;
    setBusy(true);
    const { error } = await createClient().from("access_review_items").update({ decision: decide.decision, note: note.trim() || null, extend_to: decide.decision === "extend" && extendTo ? new Date(`${extendTo}T23:59:59`).toISOString() : null, decided_at: new Date().toISOString() }).eq("id", decide.item.id);
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    setDecide(null); setTick((t) => t + 1);
  }

  const mine = items.filter((i) => i.reviewer_id === profile.id && !i.decision && reviews?.some((r) => r.id === i.review_id && r.status === "open"));
  const current = reviews?.find((r) => r.id === openReview) || null;
  const currentItems = current ? items.filter((i) => i.review_id === current.id) : [];
  const done = currentItems.filter((i) => i.decision).length;

  return (
    <div className="space-y-[var(--s4)]">
      {/* --------------------------------------------------------- Reviews */}
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><ClipboardCheck size={16} className="text-[var(--brand-2)]" /> Access reviews {mine.length > 0 && <span className="pill tone-warn">{mine.length} for you</span>}</span>} subtitle="Periodic recertification: admin roles, system roles, grants, overrides and cross-department project access are listed for their owners to Keep, Remove or Extend." action={<div className="flex items-center gap-1.5"><Button variant="ghost" size="sm" icon aria-label="Refresh" onClick={() => setTick((t) => t + 1)}><RefreshCw size={14} /></Button>{canApply && <Button size="sm" variant="primary" onClick={() => setStarting(true)}><Play size={14} /> Start review</Button>}</div>} />
        {reviews === null ? <div className="flex justify-center py-6"><Spinner /></div> : reviews.length === 0 ? <EmptyState title="No reviews yet" hint="Start a company-wide or department review; reviewers get a notification and a due date." className="py-[var(--s4)]" /> : (
          <div className="divide-y border-t">
            {reviews.map((r) => {
              const its = items.filter((i) => i.review_id === r.id);
              const decided = its.filter((i) => i.decision).length;
              const pct = its.length ? Math.round((decided / its.length) * 100) : 0;
              return (
                <button key={r.id} type="button" onClick={() => setOpenReview(openReview === r.id ? null : r.id)} className={cn("w-full text-left px-[var(--s4)] py-2.5 flex flex-wrap items-center gap-3 row-hover", openReview === r.id && "bg-[var(--brand-bg)]/30")}>
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{r.name}</div><div className="text-[11px] text-muted">{r.department_id ? departments.find((d) => d.id === r.department_id)?.name || "Department" : "Company-wide"} · due {fmtDate(r.due_on)} · started {ago(r.created_at)}</div></div>
                  <div className="w-[160px]"><Progress value={pct} height={5} tone={r.status === "completed" ? "var(--success)" : "var(--brand)"} /><div className="text-[10px] text-muted num mt-0.5">{decided}/{its.length} decided</div></div>
                  <Pill tone={r.status === "completed" ? "tone-success" : "tone-warn"}>{humanize(r.status)}</Pill>
                </button>
              );
            })}
          </div>
        )}
        {current && (
          <div className="border-t px-[var(--s4)] py-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">{current.name}</span>
              <span className="text-[11px] text-muted">{done}/{currentItems.length} decided</span>
              <span className="ml-auto inline-flex gap-1.5">{canApply && current.status === "open" && <Button size="sm" variant="primary" loading={busy} onClick={() => apply(current.id)}><Check size={13} /> Apply decisions</Button>}<Button size="sm" variant="ghost" onClick={() => setOpenReview(null)}><X size={13} /></Button></span>
            </div>
            {currentItems.length === 0 ? <div className="text-xs text-muted">Nothing to review in this scope.</div> : (
              <div className="overflow-x-auto border rounded-[var(--radius-sm)]">
                <table className="w-full text-xs min-w-[760px]">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted"><th className="px-2 py-1.5 font-medium">Person</th><th className="px-2 py-1.5 font-medium">Item</th><th className="px-2 py-1.5 font-medium">Reviewer</th><th className="px-2 py-1.5 font-medium">Decision</th><th className="px-2 py-1.5" /></tr></thead>
                  <tbody className="divide-y">
                    {currentItems.map((i) => {
                      const canDecide = current.status === "open" && (i.reviewer_id === profile.id || canApply);
                      return (
                        <tr key={i.id}>
                          <td className="px-2 py-1.5"><PersonLine id={i.user_id} size={18} /></td>
                          <td className="px-2 py-1.5"><Pill tone="tone-neutral" className="mr-1">{humanize(i.item_type)}</Pill>{i.label}</td>
                          <td className="px-2 py-1.5"><PersonLine id={i.reviewer_id} size={16} className="!gap-1" /></td>
                          <td className="px-2 py-1.5">{i.decision ? <span className="inline-flex items-center gap-1"><Pill tone={i.decision === "keep" ? "tone-success" : i.decision === "remove" ? "tone-danger" : "tone-warn"}>{humanize(i.decision)}{i.decision === "extend" && i.extend_to ? ` → ${fmtDate(i.extend_to)}` : ""}</Pill>{i.note && <span className="text-muted italic truncate max-w-[200px]">“{i.note}”</span>}</span> : <span className="text-muted">Pending</span>}</td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap">{canDecide && <span className="inline-flex gap-0.5"><Button size="xs" variant="ghost" onClick={() => setDecide({ item: i, decision: "keep" })}>Keep</Button><Button size="xs" variant="ghost" className="text-danger" onClick={() => setDecide({ item: i, decision: "remove" })}>Remove</Button>{i.item_type !== "permission_override" && i.item_type !== "project_member" && <Button size="xs" variant="ghost" onClick={() => setDecide({ item: i, decision: "extend" })}>Extend</Button>}</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------- Findings */}
      <FindingsPanel findings={findings} onChanged={() => setTick((t) => t + 1)} />

      <Modal open={starting} onClose={() => setStarting(false)} title="Start an access review" footer={<><Button variant="ghost" onClick={() => setStarting(false)}>Cancel</Button><Button variant="primary" loading={busy} disabled={!name.trim()} onClick={start}><Play size={14} /> Start</Button></>}>
        <div className="space-y-3">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q4 access recertification" autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Scope"><DepartmentPicker value={dept} onChange={setDept} placeholder="Company-wide" /></Field><Field label="Due"><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field></div>
          <Note tone="info">Reviewers are the owners of each item (department head, manager, grantor, project owner) — the primary admin covers the rest. Nothing changes until the review is applied.</Note>
        </div>
      </Modal>
      {decide && <DecisionModal decision={decide} busy={busy} onClose={() => setDecide(null)} onSave={saveDecision} />}
    </div>
  );
}

function DecisionModal({ decision, busy, onClose, onSave }: { decision: { item: AccessReviewItemRow; decision: "keep" | "remove" | "extend" }; busy: boolean; onClose: () => void; onSave: (note: string, extendTo: string) => void }) {
  const [note, setNote] = React.useState("");
  const [extendTo, setExtendTo] = React.useState("");
  const d = decision.decision;
  return (
    <Modal open onClose={onClose} title={`${humanize(d)} · ${decision.item.label}`} width={460} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={d === "remove" ? "danger" : "primary"} loading={busy} disabled={d === "extend" && !extendTo} onClick={() => onSave(note, extendTo)}><Check size={14} /> Record decision</Button></>}>
      <div className="space-y-3">
        <div className="text-sm flex items-center gap-2"><PersonLine id={decision.item.user_id} size={22} /><Pill tone="tone-neutral">{humanize(decision.item.item_type)}</Pill></div>
        {d === "extend" && <Field label="Extend until"><Input type="date" value={extendTo} onChange={(e) => setExtendTo(e.target.value)} /></Field>}
        <Field label="Note (optional)"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={d === "keep" ? "Still needed because…" : d === "remove" ? "No longer needed because…" : "Why a bit longer"} /></Field>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------- Findings */
function FindingsPanel({ findings, onChanged }: { findings: Findings | null; onChanged: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function revokeGrant(id: string) {
    setBusy(id);
    const { error } = await createClient().rpc("revoke_grant", { p_grant: id, p_reason: "Stale grant — access review finding" });
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Grant revoked", "success"); onChanged(); router.refresh();
  }
  async function leaveRoom(userId: string, channelName: string) {
    setBusy(`${userId}:${channelName}`);
    const sb = createClient();
    const { data: ch } = await sb.from("channels").select("id").eq("name", channelName).eq("type", "department").limit(1).maybeSingle();
    const { error } = ch ? await sb.from("channel_members").delete().eq("channel_id", ch.id).eq("user_id", userId) : { error: { message: "Room not found" } };
    setBusy(null);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Removed from the old department room", "success"); onChanged();
  }

  if (findings === null) return <Card><div className="flex justify-center py-6"><Spinner /></div></Card>;
  if (findings.error) return <Note tone="warn">Findings need Security, Access approvals or Audit permissions.</Note>;

  const groups: { key: string; title: string; hint: string; icon: React.ReactNode; tone: string; render: (x: Record<string, Json | undefined>, i: number) => React.ReactNode }[] = [
    { key: "excess_after_transfer", title: "Excess access after transfer", hint: "Still in a former department's room", icon: <DoorOpen size={14} />, tone: "tone-warn", render: (x, i) => <Row key={i} person={str(x.user_id)} text={`${str(x.channel)} (${str(x.old_department)})`} action={<Button size="xs" variant="ghost" className="text-danger" loading={busy === `${str(x.user_id)}:${str(x.channel)}`} onClick={() => leaveRoom(str(x.user_id), str(x.channel))}>Remove from room</Button>} /> },
    { key: "stale_grants", title: "Stale grants", hint: "Permanent grants older than 90 days", icon: <Hourglass size={14} />, tone: "tone-warn", render: (x, i) => <Row key={i} person={str(x.user_id)} text={`${humanize(str(x.resource_type))} · ${humanize(str(x.level))} · ${num(x.age_days)} days`} action={<Button size="xs" variant="ghost" className="text-danger" loading={busy === str(x.grant_id)} onClick={() => revokeGrant(str(x.grant_id))}><ShieldOff size={11} /> Revoke</Button>} /> },
    { key: "role_conflicts", title: "Requester = approver", hint: "Pending approvals a person would decide for themselves", icon: <AlertTriangle size={14} />, tone: "tone-danger", render: (x, i) => <Row key={i} person={str(x.user_id)} text={str(x.title)} action={<Link href={`/approvals/${str(x.approval_id)}`} className="btn btn-ghost btn-xs">Open</Link>} /> },
    { key: "self_approved_recent", title: "Self-approved (30 days)", hint: "Approvals decided by their requester", icon: <AlertTriangle size={14} />, tone: "tone-danger", render: (x, i) => <Row key={i} text={`${str(x.name)} — ${str(x.title)}`} action={<Link href={`/approvals/${str(x.approval_id)}`} className="btn btn-ghost btn-xs">Open</Link>} /> },
    { key: "expiring_soon", title: "Expiring within 7 days", hint: "Temporary roles, grants, delegations, admin roles", icon: <Hourglass size={14} />, tone: "tone-info", render: (x, i) => <Row key={i} person={str(x.user_id)} text={`${humanize(str(x.kind))} · ${str(x.label)} · ${x.expires_at ? fmtDate(str(x.expires_at), true) : ""}`} /> },
    { key: "admins_without_manager", title: "Admins without a manager", hint: "Elevated access with no reporting line", icon: <UserX size={14} />, tone: "tone-warn", render: (x, i) => <Row key={i} person={str(x.user_id)} text="No manager" action={<Link href={`/admin?tab=hr&view=people&user=${str(x.user_id)}`} className="btn btn-ghost btn-xs">Fix</Link>} /> },
    { key: "inactive_with_access", title: "Inactive with live grants", hint: "Deactivated accounts that still hold grants", icon: <UserX size={14} />, tone: "tone-danger", render: (x, i) => <Row key={i} person={str(x.user_id)} text={`${num(x.grants)} grant${num(x.grants) === 1 ? "" : "s"}`} action={<Link href="/admin?tab=access" className="btn btn-ghost btn-xs">Revoke everywhere</Link>} /> },
    { key: "dormant_accounts", title: "Dormant accounts", hint: "Active but not seen for 30+ days", icon: <Hourglass size={14} />, tone: "tone-muted", render: (x, i) => <Row key={i} person={str(x.user_id)} text={x.last_seen ? `last seen ${ago(str(x.last_seen))}` : "never signed in"} action={<Link href={`/admin?tab=hr&view=people&user=${str(x.user_id)}`} className="btn btn-ghost btn-xs">Review</Link>} /> },
  ];
  const total = groups.reduce((a, g) => a + jsonArray(findings[g.key]).length, 0);

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2"><AlertTriangle size={16} className="text-[var(--warn)]" /> Findings <span className="pill tone-neutral">{total}</span></span>} subtitle="Computed live from grants, approvals, rooms and sign-ins. Each card has the obvious fix next to it." />
      {total === 0 ? <EmptyState icon={<Check size={18} />} title="No findings" hint="Access looks tidy. Reviews keep it that way." className="py-[var(--s4)]" /> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s3)] px-[var(--s4)] pb-[var(--s4)]">
          {groups.map((g) => {
            const list = jsonArray(findings[g.key]).map((x) => jsonObj(x));
            if (!list.length) return null;
            return (
              <div key={g.key} className="rounded-[var(--radius-sm)] border">
                <div className="px-3 py-2 flex items-center gap-2 border-b"><span className={cn("w-6 h-6 rounded-full inline-flex items-center justify-center", g.tone)}>{g.icon}</span><div className="min-w-0"><div className="text-sm font-medium">{g.title} <span className="pill tone-neutral ml-1">{list.length}</span></div><div className="text-[11px] text-muted">{g.hint}</div></div></div>
                <ul className="divide-y max-h-[260px] overflow-y-auto">{list.slice(0, 50).map((x, i) => g.render(x, i))}</ul>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function Row({ person, text, action }: { person?: string; text: string; action?: React.ReactNode }) {
  return <li className="px-3 py-1.5 flex items-center gap-2 text-xs">{person && <PersonLine id={person} size={16} className="!gap-1 shrink-0" />}<span className="truncate flex-1">{text}</span>{action}</li>;
}

