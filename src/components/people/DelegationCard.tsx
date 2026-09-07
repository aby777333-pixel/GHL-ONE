"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, LifeBuoy, Plus, Square } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Spinner, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, cn, fmtDate, type Tables } from "@/lib/utils";
import { PersonChip } from "@/components/tasks/TaskBits";
import { DELEGATION_KINDS, endOfDayIso } from "@/components/admin/people/lib";

type DelegationRow = Tables<"delegations">;

/**
 * Delegations on a profile (self or manager): delegate approvals / leave / requests / decisions / tasks / help
 * to someone for a period. Routing switches automatically (`effective_approver`).
 */
export function DelegationCard({ userId, self, canManage }: { userId: string; self: boolean; canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [rows, setRows] = React.useState<DelegationRow[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const [now] = React.useState(() => Date.now());
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    createClient().from("delegations").select("*").or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`).order("created_at", { ascending: false }).limit(40).then(({ data }) => { if (alive) setRows(data || []); });
    return () => { alive = false; };
  }, [userId, tick]);

  async function end(d: DelegationRow) {
    const { error } = await createClient().from("delegations").update({ active: false }).eq("id", d.id);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Delegation ended", "success"); setTick((t) => t + 1); router.refresh();
  }

  const list = rows || [];
  const live = (d: DelegationRow) => d.active && (!d.ends_at || new Date(d.ends_at).getTime() > now) && new Date(d.starts_at).getTime() <= now;
  const active = list.filter(live);
  const past = list.filter((d) => !live(d));
  const editable = self || canManage;

  return (
    <Card id="delegations" className="scroll-mt-24">
      <CardHeader title={self ? "My delegations" : "Delegations"} subtitle={self ? "Away for a while? Hand approvals, leave decisions or requests to a colleague — routing switches automatically." : "What this person has delegated, and what is delegated to them."} action={editable ? <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> Delegate</Button> : <LifeBuoy size={15} className="text-muted" />} />
      {rows === null ? <div className="flex justify-center py-6"><Spinner /></div> : list.length === 0 ? (
        <EmptyState icon={<LifeBuoy size={18} />} title="No delegations" hint={self ? "Nothing is delegated. Set one up before leave so nothing waits on you." : "Nothing delegated for or by this person."} className="py-[var(--s4)]" />
      ) : (
        <div className="divide-y border-t">
          {[...active, ...past].map((d) => {
            const outgoing = d.from_user_id === userId;
            const isLive = live(d);
            return (
              <div key={d.id} className={cn("px-[var(--s4)] py-2.5 flex flex-wrap items-center gap-2 text-sm", !isLive && "opacity-60")}>
                <span className="text-xs text-muted w-[52px] shrink-0">{outgoing ? "To" : "From"}</span>
                <PersonChip id={outgoing ? d.to_user_id : d.from_user_id} size={22} />
                <span className="flex flex-wrap gap-1">{d.kinds.map((k) => <Pill key={k} tone={isLive ? "tone-brand" : "tone-neutral"}>{DELEGATION_KINDS.find((x) => x.key === k)?.label || k}</Pill>)}</span>
                <span className="text-[11px] text-muted ml-auto">{isLive ? (d.ends_at ? `until ${fmtDate(d.ends_at)}` : "until ended") : d.active ? `starts ${fmtDate(d.starts_at)}` : `ended · ${ago(d.created_at)}`}{d.reason ? ` · ${d.reason}` : ""}</span>
                {isLive && outgoing && (self || canManage) && <Button size="xs" variant="ghost" onClick={() => end(d)}><Square size={11} /> End</Button>}
              </div>
            );
          })}
        </div>
      )}
      <NewDelegationModal open={open} fromUserId={userId} onClose={() => setOpen(false)} onDone={() => { setTick((t) => t + 1); router.refresh(); }} orgId={profile.org_id || ""} />
    </Card>
  );
}

function NewDelegationModal({ open, fromUserId, orgId, onClose, onDone }: { open: boolean; fromUserId: string; orgId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [to, setTo] = React.useState("");
  const [kinds, setKinds] = React.useState<string[]>(["approvals"]);
  const [from, setFrom] = React.useState("");
  const [until, setUntil] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const toggle = (k: string) => setKinds((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  async function save() {
    if (!orgId || !to || to === fromUserId || !kinds.length) return;
    setBusy(true);
    const { error } = await createClient().from("delegations").insert({ org_id: orgId, from_user_id: fromUserId, to_user_id: to, kinds, starts_at: from ? new Date(`${from}T00:00:00`).toISOString() : undefined, ends_at: endOfDayIso(until), reason: reason.trim() || null });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Delegation created — the delegate has been notified", "success");
    setTo(""); setKinds(["approvals"]); setFrom(""); setUntil(""); setReason("");
    onClose(); onDone();
  }

  return (
    <Modal open={open} onClose={onClose} title="Delegate" width={500} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!to || to === fromUserId || !kinds.length} onClick={save}><Check size={14} /> Delegate</Button></>}>
      <div className="space-y-3">
        <Field label="Delegate to"><PersonPicker value={to} onChange={setTo} placeholder="Choose a colleague…" /></Field>
        <div><span className="label">What</span><div className="flex flex-wrap gap-1.5">{DELEGATION_KINDS.map((k) => <button type="button" key={k.key} title={k.hint} onClick={() => toggle(k.key)} className={cn("pill pill-lg", kinds.includes(k.key) ? "tone-brand" : "tone-neutral")}>{k.label}</button>)}</div></div>
        <div className="grid grid-cols-2 gap-3"><Field label="From" hint="Empty = now"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="Until" hint="Empty = until you end it"><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field></div>
        <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Annual leave 12–20 Oct" /></Field>
        <p className="text-[11px] text-muted">While active, approvals, leave and requests addressed to you go to the delegate. Task delegation lets them assign work to your reports. Everything is audited and reverts automatically.</p>
      </div>
    </Modal>
  );
}
