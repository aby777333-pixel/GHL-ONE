"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Hourglass, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Modal, Tabs, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, type Channel } from "@/lib/utils";
import { asVisibility, VISIBILITY_META } from "@/components/common/visibility";

type Mode = "person" | "department";
type Expiry = "none" | "1d" | "1w" | "date";
const EXPIRY: { key: Expiry; label: string }[] = [
  { key: "none", label: "No expiry" },
  { key: "1d", label: "1 day" },
  { key: "1w", label: "1 week" },
  { key: "date", label: "Until a date" },
];

/** "Bring someone in" — add a person (or a department) to a conversation with a reason and optional access expiry. */
export function BringInModal({ open, onClose, channel, memberIds, onAdded }: { open: boolean; onClose: () => void; channel: Channel; memberIds: string[]; onAdded?: (userId: string, expiresAt: string | null, reason: string) => void }) {
  const { profile, people, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = React.useState<Mode>("person");
  const [person, setPerson] = React.useState("");
  const [dept, setDept] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [expiry, setExpiry] = React.useState<Expiry>("none");
  const [until, setUntil] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const vis = asVisibility(channel.visibility);
  const restricted = vis === "confidential" || vis === "executive_only";
  const canInvite = !restricted || channel.owner_id === profile.id || channel.co_owner_id === profile.id;
  const already = person && memberIds.includes(person);

  function expiresAt(): string | null {
    const now = Date.now();
    if (expiry === "1d") return new Date(now + 86_400_000).toISOString();
    if (expiry === "1w") return new Date(now + 7 * 86_400_000).toISOString();
    if (expiry === "date" && until) return new Date(`${until}T23:59:59`).toISOString();
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return toast.push("Say why they are being brought in", "danger");
    if (expiry === "date" && !until) return toast.push("Pick an end date", "danger");
    setBusy(true);
    const supabase = createClient();
    if (mode === "person") {
      if (!person) {
        setBusy(false);
        return;
      }
      const exp = expiresAt();
      const { error } = await supabase.rpc("bring_in", { p_channel: channel.id, p_user: person, p_reason: reason.trim(), p_expires_at: exp || undefined });
      setBusy(false);
      if (error) return toast.push(error.message, "danger");
      const p = people.find((x) => x.id === person);
      toast.push(`${p?.full_name || "They"} ${already ? "updated" : "brought in"}${exp ? " · temporary access" : ""}`, "success");
      onAdded?.(person, exp, reason.trim());
    } else {
      if (!dept) {
        setBusy(false);
        return;
      }
      const { data, error } = await supabase.rpc("invite_department", { p_channel: channel.id, p_department: dept, p_reason: reason.trim() });
      setBusy(false);
      if (error) return toast.push(error.message, "danger");
      const d = departments.find((x) => x.id === dept);
      toast.push(`${d?.name || "Department"} invited · ${Number(data || 0)} contact${Number(data || 0) === 1 ? "" : "s"} notified`, "success");
    }
    setPerson(""); setDept(""); setReason(""); setExpiry("none"); setUntil("");
    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title="Bring someone in" width={520}>
      {!canInvite ? (
        <div className="text-sm text-muted">
          <span className={cn("pill mr-1.5", VISIBILITY_META[vis].tone)}>{VISIBILITY_META[vis].label}</span>
          Only the owner or co-owner can bring people into this room.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Tabs<Mode> tabs={[{ key: "person", label: "A person" }, { key: "department", label: "A department" }]} value={mode} onChange={setMode} className="-mt-1" />
          {mode === "person" ? (
            <Field label="Who" hint={already ? "Already a member — this updates their access and reason." : undefined}>
              <PersonPicker value={person} onChange={setPerson} placeholder="Choose a person" />
            </Field>
          ) : (
            <Field label="Which department" hint="Their head and on-duty person are notified; available members can join.">
              <DepartmentPicker value={dept} onChange={setDept} placeholder="Choose a department" />
            </Field>
          )}
          <Field label="Why they're here" hint="Shown to them in the notification and pinned as a system line in the room.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Need your eyes on the pricing sheet before Friday's call." style={{ minHeight: 72 }} required autoFocus />
          </Field>
          {mode === "person" && (
            <div>
              <span className="label">Access ends</span>
              <div className="flex flex-wrap gap-1.5">
                {EXPIRY.map((x) => (
                  <button key={x.key} type="button" onClick={() => setExpiry(x.key)} className={cn("pill pill-lg cursor-pointer", expiry === x.key ? "tone-brand" : "tone-neutral")}>
                    {x.key !== "none" && <Hourglass size={11} />} {x.label}
                  </button>
                ))}
              </div>
              {expiry === "date" && <Input type="date" className="mt-2" value={until} onChange={(e) => setUntil(e.target.value)} required />}
              {expiry !== "none" && <div className="text-[11px] text-muted mt-1.5">They are removed automatically when access ends. You can extend it later by bringing them in again.</div>}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy} disabled={mode === "person" ? !person : !dept}>
              {mode === "person" ? <UserPlus size={14} /> : <Building2 size={14} />} {mode === "person" ? "Bring in" : "Invite department"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
