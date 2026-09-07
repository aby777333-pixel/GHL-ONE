"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X, MessageSquareWarning, KeyRound, ShieldOff, Siren, RefreshCw, Inbox, Hourglass } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Select, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink } from "@/components/providers/ActivityProvider";
import { ago, cn, fmtDate, humanize, isAdminRole, APPROVAL_STATUS_LABEL, APPROVAL_STATUS_TONE, type ApprovalStatus, type Tables } from "@/lib/utils";
import { fromLocalInput, LevelPill, Note, PersonLine, ResourceTypePill, RiskPill, toLocalInput } from "./AdminBits";
import { hasPerm } from "./perms";
import { resolveResourceLabels, resourceHref } from "./resourceLabels";
import { AccessReviews } from "./AccessReviews";

export type AccessRequestRow = Tables<"access_requests">;
export type AccessGrantRow = Tables<"access_grants"> & { label?: string | null };

const LEVELS = ["view", "comment", "edit", "download"];
const DURATION_LABEL: Record<string, string> = { once: "One-time (24h)", until_date: "Until a date", project_active: "While the project is active", permanent: "Permanent" };
const DAY = 86_400_000;

type Decision = { req: AccessRequestRow; mode: "approve" | "reject" | "changes" } | null;

export function AccessAdmin({ requests: initialRequests, grants: initialGrants, perms, isPrimary, review }: { requests: AccessRequestRow[]; grants: AccessGrantRow[]; perms: string[]; isPrimary: boolean; review?: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const me = profile.id;
  const admin = isAdminRole(profile.role);
  const canApproveAll = admin || hasPerm(perms, "access.approve");
  const canEmergency = isPrimary || hasPerm(perms, "security.manage");

  const [requests, setRequests] = React.useState(initialRequests);
  const [grants, setGrants] = React.useState(initialGrants);
  const [labels, setLabels] = React.useState<Record<string, string>>({});
  const [now] = React.useState(() => Date.now());
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState<"pending" | "all" | ApprovalStatus>("pending");
  const [risk, setRisk] = React.useState("");
  const [type, setType] = React.useState("");
  const [decision, setDecision] = React.useState<Decision>(null);
  const [revoking, setRevoking] = React.useState<AccessGrantRow | null>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const sb = createClient();
    const [{ data: rq }, { data: gr }] = await Promise.all([
      sb.from("access_requests").select("*").order("created_at", { ascending: false }).limit(300),
      sb.from("access_grants").select("*").is("revoked_at", null).order("expires_at", { ascending: true, nullsFirst: false }).limit(300),
    ]);
    const grantRows = (gr || []) as AccessGrantRow[];
    const lbl = await resolveResourceLabels(sb, grantRows);
    setRequests((rq || []) as AccessRequestRow[]);
    setGrants(grantRows.map((g) => ({ ...g, label: lbl[`${g.resource_type}:${g.resource_id}`] ?? g.label ?? null })));
    setLabels(lbl);
    setLoading(false);
  }, []);

  // Realtime: new / decided requests appear without a refresh.
  React.useEffect(() => {
    const sb = createClient();
    let t: ReturnType<typeof setTimeout> | null = null;
    const ch = sb.channel("access-inbox").on("postgres_changes", { event: "*", schema: "public", table: "access_requests" }, () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => { reload(); }, 600);
    }).subscribe();
    return () => { if (t) clearTimeout(t); sb.removeChannel(ch); };
  }, [reload]);

  const types = React.useMemo(() => [...new Set(requests.map((r) => r.resource_type))].sort(), [requests]);
  const filtered = requests
    .filter((r) => (status === "all" ? true : r.status === status))
    .filter((r) => !risk || r.risk === risk)
    .filter((r) => !type || r.resource_type === type)
    .sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || (a.risk === "high" ? 0 : 1) - (b.risk === "high" ? 0 : 1) || b.created_at.localeCompare(a.created_at));
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  const activeGrants = grants.filter((g) => !g.revoked_at && (!g.expires_at || new Date(g.expires_at).getTime() > now));
  const canDecide = (r: AccessRequestRow) => r.status === "pending" && (canApproveAll || r.approver_id === me);

  async function decide(req: AccessRequestRow, mode: NonNullable<Decision>["mode"], patch: { granted_level?: string; granted_until?: string | null; note: string }) {
    const next: ApprovalStatus = mode === "approve" ? "approved" : mode === "reject" ? "rejected" : "changes_requested";
    const { error } = await createClient().from("access_requests").update({
      status: next,
      decided_by: me,
      decided_at: new Date().toISOString(),
      decision_note: patch.note.trim() || null,
      ...(mode === "approve" ? { granted_level: patch.granted_level || req.level, granted_until: patch.granted_until ?? null } : {}),
    }).eq("id", req.id);
    if (error) { toast.push(error.message, "danger"); return false; }
    toast.push(mode === "approve" ? `Access approved for ${req.resource_label}` : mode === "reject" ? "Request rejected" : "Changes requested", mode === "approve" ? "success" : "info");
    await reload();
    router.refresh();
    return true;
  }

  async function revoke(g: AccessGrantRow, reason: string) {
    const { error } = await createClient().rpc("revoke_grant", { p_grant: g.id, p_reason: reason.trim() || undefined });
    if (error) { toast.push(error.message, "danger"); return false; }
    toast.push("Access revoked", "success");
    await reload();
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-[var(--s4)]">
      {/* ------------------------------------------------------------ Inbox */}
      <Card>
        <CardHeader
          title={<span className="inline-flex items-center gap-2"><Inbox size={16} className="text-[var(--brand-2)]" /> Access requests {pendingCount > 0 && <span className="pill tone-warn">{pendingCount} pending</span>}</span>}
          subtitle="Request access instead of access denied — every request is routed to the data owner, high-risk ones to the primary admin."
          action={<Button variant="ghost" size="sm" icon aria-label="Refresh" onClick={reload}><RefreshCw size={14} className={cn(loading && "animate-spin")} /></Button>}
        />
        <div className="px-[var(--s4)] pb-3 grid grid-cols-3 sm:flex gap-2">
          <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="!h-8 !text-xs sm:w-[160px]">
            <option value="pending">Pending</option>
            <option value="all">All statuses</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="changes_requested">Changes requested</option>
          </Select>
          <Select value={risk} onChange={(e) => setRisk(e.target.value)} className="!h-8 !text-xs sm:w-[130px]">
            <option value="">Any risk</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value)} className="!h-8 !text-xs sm:w-[140px]">
            <option value="">Any type</option>
            {types.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}
          </Select>
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={<KeyRound size={20} />} title={status === "pending" ? "Inbox zero" : "No matching requests"} hint={status === "pending" ? "New access requests will appear here in real time." : "Try widening the filters."} className="py-[var(--s5)]" />
        ) : (
          <div className="divide-y border-t">
            {filtered.map((r) => {
              const href = resourceHref(r.resource_type, r.resource_id);
              const pending = r.status === "pending";
              const untilLabel = r.duration === "until_date" ? (r.until_at ? `until ${fmtDate(r.until_at, true)}` : "until a date") : DURATION_LABEL[r.duration] || humanize(r.duration);
              return (
                <div key={r.id} className={cn("px-[var(--s4)] py-3 flex flex-col lg:flex-row lg:items-start gap-3", r.risk === "high" && pending && "bg-[var(--danger-bg)]/40")}>
                  <div className="lg:w-[220px] shrink-0"><PersonLine id={r.requester_id} size={28} sub={ago(r.created_at)} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <Blink zone={`access:${r.id}`} />
                      <ResourceTypePill type={r.resource_type} />
                      {href ? <Link href={href} className="text-sm font-medium truncate link">{r.resource_label}</Link> : <span className="text-sm font-medium truncate">{r.resource_label}</span>}
                      <LevelPill level={r.granted_level || r.level} />
                      <span className="text-[11px] text-muted">{untilLabel}</span>
                      <RiskPill risk={r.risk} />
                      {!pending && <Pill tone={APPROVAL_STATUS_TONE[r.status]}>{APPROVAL_STATUS_LABEL[r.status]}</Pill>}
                    </div>
                    <div className="text-sm text-[var(--fg-2)] mt-1 truncate-2">{r.reason}</div>
                    <div className="text-[11px] text-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1">Approver: <PersonLine id={r.approver_id} size={14} className="!gap-1" /></span>
                      {r.decided_at && <span>Decided {ago(r.decided_at)}{r.decided_by ? <> by <PersonLine id={r.decided_by} size={14} className="!gap-1" /></> : null}</span>}
                      {r.decision_note && <span className="italic">“{r.decision_note}”</span>}
                      {r.status === "approved" && r.granted_until && <span>Granted until {fmtDate(r.granted_until, true)}</span>}
                    </div>
                  </div>
                  {canDecide(r) && (
                    <div className="flex items-center gap-1.5 shrink-0 lg:pt-0.5">
                      <Button size="sm" variant="success" onClick={() => setDecision({ req: r, mode: "approve" })}><Check size={14} /> Approve</Button>
                      <Button size="sm" variant="secondary" onClick={() => setDecision({ req: r, mode: "changes" })}><MessageSquareWarning size={14} /> Changes</Button>
                      <Button size="sm" variant="danger" onClick={() => setDecision({ req: r, mode: "reject" })}><X size={14} /> Reject</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------ Active grants */}
      <Card>
        <CardHeader title={<span className="inline-flex items-center gap-2"><KeyRound size={16} className="text-[var(--violet)]" /> Active grants <span className="pill tone-neutral">{activeGrants.length}</span></span>} subtitle="Everything currently granted through an approved request. Temporary grants expire on their own; you can revoke earlier." />
        {activeGrants.length === 0 ? <EmptyState title="No active grants" hint="Approved requests create grants here." className="py-[var(--s4)]" /> : (
          <div className="overflow-x-auto border-t">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-[var(--s4)] py-2 font-medium">Person</th>
                  <th className="px-3 py-2 font-medium">Resource</th>
                  <th className="px-3 py-2 font-medium">Level</th>
                  <th className="px-3 py-2 font-medium">Expires</th>
                  <th className="px-3 py-2 font-medium">Granted by</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {activeGrants.map((g) => {
                  const exp = g.expires_at ? new Date(g.expires_at).getTime() - now : null;
                  const soon = exp != null && exp < 7 * DAY;
                  const verySoon = exp != null && exp < DAY;
                  const href = resourceHref(g.resource_type, g.resource_id);
                  const label = g.label || labels[`${g.resource_type}:${g.resource_id}`] || `${humanize(g.resource_type)} ${g.resource_id.slice(0, 8)}`;
                  return (
                    <tr key={g.id} className={cn("row-hover", soon && "bg-[var(--warn-bg)]/40")}>
                      <td className="px-[var(--s4)] py-2"><PersonLine id={g.user_id} size={24} /></td>
                      <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 min-w-0"><ResourceTypePill type={g.resource_type} />{href ? <Link href={href} className="link truncate max-w-[220px]">{label}</Link> : <span className="truncate max-w-[220px]">{label}</span>}</span></td>
                      <td className="px-3 py-2"><LevelPill level={g.level} /></td>
                      <td className={cn("px-3 py-2 whitespace-nowrap num", verySoon ? "text-danger font-medium" : soon ? "text-warn font-medium" : "text-muted")}>
                        {g.expires_at ? <span className="inline-flex items-center gap-1">{soon && <Hourglass size={12} />}{ago(g.expires_at)}</span> : <Pill tone="tone-muted">Permanent</Pill>}
                      </td>
                      <td className="px-3 py-2"><PersonLine id={g.granted_by} size={18} /></td>
                      <td className="px-3 py-2 text-xs text-muted max-w-[260px] truncate" title={g.reason || undefined}>{g.reason || "—"}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {(canApproveAll || g.granted_by === me) && <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRevoking(g)}><ShieldOff size={13} /> Revoke</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ------------------------------------------- Access reviews & findings */}
      <AccessReviews canApply={canApproveAll || isPrimary || hasPerm(perms, "security.manage")} initialReview={review} />

      {/* --------------------------------------------------------- Emergency */}
      {canEmergency && <EmergencyRevoke onDone={reload} />}

      <DecisionModal decision={decision} onClose={() => setDecision(null)} onSubmit={decide} />
      <RevokeModal grant={revoking} onClose={() => setRevoking(null)} onSubmit={revoke} />
    </div>
  );
}

/* --------------------------------------------------------- Decision modal */
function DecisionModal({ decision, onClose, onSubmit }: { decision: Decision; onClose: () => void; onSubmit: (req: AccessRequestRow, mode: NonNullable<Decision>["mode"], patch: { granted_level?: string; granted_until?: string | null; note: string }) => Promise<boolean> }) {
  const [level, setLevel] = React.useState("");
  const [until, setUntil] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const key = decision ? `${decision.req.id}:${decision.mode}` : "";
  const [seeded, setSeeded] = React.useState("");
  if (decision && seeded !== key) {
    // Seed form from the request each time a different decision opens (render-time derived state).
    setSeeded(key);
    setLevel(decision.req.level);
    setUntil(toLocalInput(decision.req.until_at));
    setNote("");
  }
  if (!decision) return null;
  const { req, mode } = decision;
  const title = mode === "approve" ? "Approve access" : mode === "reject" ? "Reject request" : "Request changes";
  const timeBoxed = req.duration === "until_date" || req.duration === "once";

  async function submit() {
    if (!decision) return;
    if (mode !== "approve" && !note.trim()) return;
    setBusy(true);
    const ok = await onSubmit(req, mode, { granted_level: level, granted_until: mode === "approve" ? fromLocalInput(until) : undefined, note });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal open onClose={onClose} title={title} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={mode === "approve" ? "success" : mode === "reject" ? "danger" : "primary"} loading={busy} disabled={mode !== "approve" && !note.trim()} onClick={submit}>{title}</Button></>}>
      <div className="space-y-3">
        <div className="sunken rounded-[var(--radius-sm)] p-3 text-sm space-y-1">
          <div className="flex items-center gap-2 flex-wrap"><PersonLine id={req.requester_id} size={20} /> <span className="text-muted">wants</span> <LevelPill level={req.level} /> <span className="text-muted">on</span> <ResourceTypePill type={req.resource_type} /> <span className="font-medium">{req.resource_label}</span> <RiskPill risk={req.risk} /></div>
          <div className="text-xs text-muted">{DURATION_LABEL[req.duration] || humanize(req.duration)}{req.until_at ? ` · ${fmtDate(req.until_at, true)}` : ""}</div>
          <div className="text-xs">“{req.reason}”</div>
        </div>
        {req.risk === "high" && mode === "approve" && <Note tone="danger" icon={<Siren size={14} />}>High-risk: this resource is highly confidential or the request includes download rights. Prefer the narrowest level and a short expiry.</Note>}
        {mode === "approve" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Granted level" hint="You may grant less than requested">
              <Select value={level} onChange={(e) => setLevel(e.target.value)}>{LEVELS.map((l) => <option key={l} value={l}>{humanize(l)}</option>)}</Select>
            </Field>
            <Field label="Granted until" hint={timeBoxed ? "Leave empty to use the requested date" : "Optional — turns a permanent grant into a temporary one"}>
              <Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
            </Field>
          </div>
        )}
        <Field label={mode === "approve" ? "Note to requester (optional)" : "Note to requester"} hint={mode === "changes" ? "Say what they should change — narrower scope, a better reason, a shorter period." : undefined}>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "approve" ? "Anything they should know" : mode === "reject" ? "Why this is declined" : "What to change"} />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ Revoke modal */
function RevokeModal({ grant, onClose, onSubmit }: { grant: AccessGrantRow | null; onClose: () => void; onSubmit: (g: AccessGrantRow, reason: string) => Promise<boolean> }) {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [forId, setForId] = React.useState("");
  if (grant && forId !== grant.id) { setForId(grant.id); setReason(""); }
  if (!grant) return null;
  async function submit() {
    if (!grant || !reason.trim()) return;
    setBusy(true);
    const ok = await onSubmit(grant, reason);
    setBusy(false);
    if (ok) onClose();
  }
  return (
    <Modal open onClose={onClose} title="Revoke access" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={submit}><ShieldOff size={14} /> Revoke now</Button></>}>
      <div className="space-y-3">
        <div className="text-sm flex items-center gap-2 flex-wrap"><PersonLine id={grant.user_id} size={20} /> <span className="text-muted">loses</span> <LevelPill level={grant.level} /> <span className="text-muted">on</span> <ResourceTypePill type={grant.resource_type} /> <span className="font-medium">{grant.label || grant.resource_id.slice(0, 8)}</span></div>
        <Field label="Reason" hint="Recorded in the audit log and visible to the person."><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this access is being removed" /></Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------- Revoke everywhere */
function EmergencyRevoke({ onDone }: { onDone: () => Promise<void> }) {
  const toast = useToast();
  const router = useRouter();
  const { people, profile } = useSession();
  const [user, setUser] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ name: string; grants: number; channels: number; projects: number } | null>(null);
  const person = people.find((p) => p.id === user);
  const ready = !!person && person.id !== profile.id && reason.trim().length >= 4 && typed.trim().toLowerCase() === person.full_name.trim().toLowerCase();

  async function run() {
    if (!ready || !person) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("revoke_everywhere", { p_user: person.id, p_reason: reason.trim() });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    const r = (data || {}) as { grants?: number; channels?: number; projects?: number };
    setResult({ name: person.full_name, grants: r.grants ?? 0, channels: r.channels ?? 0, projects: r.projects ?? 0 });
    setUser(""); setReason(""); setTyped("");
    toast.push(`${person.full_name}: access revoked everywhere`, "success");
    await onDone();
    router.refresh();
  }

  return (
    <Card className="border-[var(--danger)]">
      <CardHeader title={<span className="inline-flex items-center gap-2 text-danger"><Siren size={16} /> Emergency: revoke everywhere</span>} subtitle="Removes every grant, leaves all non-company rooms and projects, and deactivates the account in one step. Use for departures and compromised accounts. Fully audited." />
      <div className="px-[var(--s4)] pb-[var(--s4)] grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
        <Field label="Person"><PersonPicker value={user} onChange={setUser} placeholder="Choose a person…" /></Field>
        <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Left the company on 8 Sep" /></Field>
        <Field label={person ? `Type “${person.full_name}” to confirm` : "Type the person's full name to confirm"}><Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={person?.full_name || "Full name"} autoComplete="off" /></Field>
        <Button variant="danger" disabled={!ready} loading={busy} onClick={run}><ShieldOff size={14} /> Revoke everywhere</Button>
      </div>
      {person && person.id === profile.id && <div className="px-[var(--s4)] pb-3 -mt-2"><Note tone="warn">You cannot revoke your own access from here.</Note></div>}
      {result && (
        <div className="px-[var(--s4)] pb-[var(--s4)]">
          <Note tone="success" icon={<Check size={14} />}>
            <span className="font-medium">{result.name}</span> — revoked <span className="num font-medium">{result.grants}</span> grant{result.grants === 1 ? "" : "s"}, removed from <span className="num font-medium">{result.channels}</span> room{result.channels === 1 ? "" : "s"} and <span className="num font-medium">{result.projects}</span> project{result.projects === 1 ? "" : "s"}; account deactivated.
          </Note>
        </div>
      )}
    </Card>
  );
}
