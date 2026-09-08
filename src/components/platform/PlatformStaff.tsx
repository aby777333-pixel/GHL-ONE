"use client";

import * as React from "react";
import { Building2, Crown, Mail, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, EmptyState, Field, Input, Modal, Pill, Select, Spinner, useToast } from "@/components/ui";
import { cn, fmtDate } from "@/lib/utils";
import { isOwnerRole, PLATFORM_ROLES, PLATFORM_ROLE_LABEL, rpcError } from "./lib";

type AdminRow = { user_id: string; role: string; note: string | null; created_at: string };
type InviteRow = { email: string; role: string; created_at: string };
type Assignment = { user_id: string; org_id: string };
type Person = { id: string; full_name: string | null; email: string | null; avatar_url: string | null };

/** Roles whose reach is limited to the companies explicitly assigned to them (`platform_can_touch`). */
const SCOPED_ROLES = ["platform_support", "platform_billing", "platform_developer"];

/**
 * Who works on the platform, and which companies each of them may touch (§113).
 * Only a platform owner can write here — the database enforces it (`is_platform_owner()`), this UI
 * simply stops offering the controls.
 */
type StaffData = { admins: AdminRow[]; assignments: Assignment[]; invites: InviteRow[]; people: Record<string, Person> | null };

/** Plain fetch helper — no state, so callers decide when the result is applied. */
async function fetchStaff(): Promise<StaffData> {
  const supabase = createClient();
  const [{ data: a }, { data: asg }, { data: inv }] = await Promise.all([
    supabase.from("platform_admins").select("user_id,role,note,created_at").order("created_at"),
    supabase.from("platform_assignments").select("user_id,org_id"),
    supabase.from("platform_admin_invites").select("email,role,created_at").order("created_at"),
  ]);
  const rows = (a || []) as AdminRow[];
  let people: Record<string, Person> | null = null;
  if (rows.length) {
    const { data: p } = await supabase.from("profiles").select("id,full_name,email,avatar_url").in("id", rows.map((r) => r.user_id));
    people = Object.fromEntries(((p || []) as Person[]).map((x) => [x.id, x]));
  }
  return { admins: rows, assignments: (asg || []) as Assignment[], invites: (inv || []) as InviteRow[], people };
}

export function PlatformStaff({ companies, platformRole }: { companies: { org_id: string; name: string }[]; platformRole: string | null }) {
  const toast = useToast();
  const isOwner = isOwnerRole(platformRole);
  const [admins, setAdmins] = React.useState<AdminRow[] | null>(null);
  const [invites, setInvites] = React.useState<InviteRow[]>([]);
  const [assignments, setAssignments] = React.useState<Assignment[]>([]);
  const [people, setPeople] = React.useState<Record<string, Person>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);

  const apply = React.useCallback((s: StaffData) => {
    setAdmins(s.admins);
    setAssignments(s.assignments);
    setInvites(s.invites);
    if (s.people) setPeople(s.people);
  }, []);

  const load = React.useCallback(async () => {
    apply(await fetchStaff());
  }, [apply]);

  React.useEffect(() => {
    let alive = true;
    void fetchStaff().then((s) => {
      if (alive) apply(s);
    });
    return () => {
      alive = false;
    };
  }, [apply]);

  async function setRole(user_id: string, role: string) {
    setBusy(user_id);
    const { error } = await createClient().from("platform_admins").update({ role }).eq("user_id", user_id);
    setBusy(null);
    if (error) return toast.push(rpcError(error.message), "danger");
    setAdmins((s) => (s || []).map((r) => (r.user_id === user_id ? { ...r, role } : r)));
  }

  async function remove(user_id: string) {
    setBusy(user_id);
    const { error } = await createClient().from("platform_admins").delete().eq("user_id", user_id);
    setBusy(null);
    if (error) return toast.push(rpcError(error.message), "danger");
    setAdmins((s) => (s || []).filter((r) => r.user_id !== user_id));
    toast.push("Removed from platform staff", "success");
  }

  async function toggleAssignment(user_id: string, org_id: string, on: boolean) {
    const supabase = createClient();
    setBusy(user_id + org_id);
    const { error } = on
      ? await supabase.from("platform_assignments").insert({ user_id, org_id })
      : await supabase.from("platform_assignments").delete().eq("user_id", user_id).eq("org_id", org_id);
    setBusy(null);
    if (error) return toast.push(rpcError(error.message), "danger");
    setAssignments((s) => (on ? [...s, { user_id, org_id }] : s.filter((x) => !(x.user_id === user_id && x.org_id === org_id))));
  }

  async function removeInvite(email: string) {
    setBusy(email);
    const { error } = await createClient().from("platform_admin_invites").delete().eq("email", email);
    setBusy(null);
    if (error) return toast.push(rpcError(error.message), "danger");
    setInvites((s) => s.filter((i) => i.email !== email));
  }

  if (admins === null)
    return (
      <div className="card p-[var(--s4)] flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading platform staff…
      </div>
    );

  return (
    <div className="space-y-[var(--s3)]">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="eyebrow">Platform staff</div>
          <div className="text-[11px] text-muted mt-0.5">
            Platform staff are not members of any company. They see administrative metadata; reading a company&apos;s own content needs an authorised access session.
          </div>
        </div>
        {isOwner ? (
          <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus size={14} /> Add staff
          </Button>
        ) : (
          <Pill tone="tone-warn">Only the platform owner can change this</Pill>
        )}
      </div>

      {admins.length === 0 ? (
        <Card>
          <EmptyState icon={<ShieldCheck size={20} />} title="No platform staff recorded" hint="The platform owner is recognised from the invite list below until they first sign in." />
        </Card>
      ) : (
        <div className="space-y-[var(--s2)]">
          {admins.map((a) => {
            const p = people[a.user_id];
            const scoped = SCOPED_ROLES.includes(a.role);
            const mine = assignments.filter((x) => x.user_id === a.user_id).map((x) => x.org_id);
            return (
              <Card key={a.user_id} className={cn("p-[var(--s3)] min-w-0", busy === a.user_id && "animate-pulse")}>
                <div className="flex items-start gap-2.5 min-w-0">
                  <Avatar name={p?.full_name || "?"} src={p?.avatar_url} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{p?.full_name || "Unknown user"}</div>
                    <div className="text-[11px] text-muted truncate">{p?.email || a.user_id}</div>
                    {a.note && <div className="text-[11px] text-2 mt-0.5">{a.note}</div>}
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    {a.role === "platform_super_admin" && <Crown size={14} className="text-accent" />}
                    {isOwner ? (
                      <Select value={a.role} onChange={(e) => setRole(a.user_id, e.target.value)} className="h-8 text-[13px] w-[168px]">
                        {PLATFORM_ROLES.map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Pill tone="tone-neutral">{PLATFORM_ROLE_LABEL[a.role] || a.role}</Pill>
                    )}
                    {isOwner && (
                      <Button size="sm" variant="ghost" icon aria-label="Remove" onClick={() => remove(a.user_id)}>
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </div>

                {scoped && (
                  <div className="mt-2.5 pt-2.5 border-t">
                    <div className="text-[11px] text-muted flex items-center gap-1.5 mb-1.5">
                      <Building2 size={12} /> Companies this person may touch {mine.length === 0 && <span className="text-warn">— none yet, so they can see nothing</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {companies.map((c) => {
                        const on = mine.includes(c.org_id);
                        return (
                          <button
                            key={c.org_id}
                            type="button"
                            disabled={!isOwner}
                            onClick={() => toggleAssignment(a.user_id, c.org_id, !on)}
                            className={cn("pill pill-lg", on ? "tone-brand" : "tone-neutral", isOwner && "hover:opacity-80")}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {!scoped && <div className="text-[11px] text-muted mt-2 pt-2 border-t">This role reaches every company on the platform.</div>}
              </Card>
            );
          })}
        </div>
      )}

      {invites.length > 0 && (
        <Card className="p-[var(--s3)]">
          <div className="eyebrow flex items-center gap-1.5">
            <Mail size={12} /> Recognised before first sign-in
          </div>
          <div className="text-[11px] text-muted mt-0.5 mb-2">These email addresses get platform access the moment they have a profile.</div>
          <div className="space-y-1.5">
            {invites.map((i) => (
              <div key={i.email} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{i.email}</span>
                <Pill tone="tone-neutral">{PLATFORM_ROLE_LABEL[i.role] || i.role}</Pill>
                <span className="text-[11px] text-muted hidden sm:block">{fmtDate(i.created_at)}</span>
                {isOwner && (
                  <Button size="xs" variant="ghost" icon aria-label="Remove invite" loading={busy === i.email} onClick={() => removeInvite(i.email)}>
                    <Trash2 size={13} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {addOpen && <AddStaff onClose={() => setAddOpen(false)} onDone={load} />}
    </div>
  );
}

/* ------------------------------------------------------------- Add staff */
function AddStaff({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<Person[]>([]);
  const [role, setRole] = React.useState("platform_support");
  const [note, setNote] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) return setResults([]);
      const { data } = await createClient()
        .from("profiles")
        .select("id,full_name,email,avatar_url")
        .or(`full_name.ilike.%${q.trim()}%,email.ilike.%${q.trim()}%`)
        .eq("is_active", true)
        .limit(8);
      setResults((data || []) as Person[]);
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  async function add(user_id: string) {
    setBusy(true);
    const { error } = await createClient().from("platform_admins").insert({ user_id, role, note: note.trim() || null });
    setBusy(false);
    if (error) return toast.push(rpcError(error.message), "danger");
    toast.push("Added to platform staff", "success");
    onDone();
    onClose();
  }

  async function invite() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return;
    setBusy(true);
    const { error } = await createClient().from("platform_admin_invites").insert({ email: email.trim().toLowerCase(), role });
    setBusy(false);
    if (error) return toast.push(rpcError(error.message), "danger");
    toast.push("They will have platform access from their first sign-in", "success");
    onDone();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Add platform staff" width={540}>
      <div className="space-y-[var(--s3)]">
        <Field label="Platform role" hint={PLATFORM_ROLES.find((r) => r.key === role)?.hint}>
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            {PLATFORM_ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Why (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Handles support for the south-region tenants" />
        </Field>
        <Field label="Find an existing person" hint="Search anyone you can already see. Their company membership is unaffected.">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email…" />
        </Field>
        {results.length > 0 && (
          <div className="space-y-1">
            {results.map((p) => (
              <button key={p.id} type="button" disabled={busy} onClick={() => add(p.id)} className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--radius-sm)] row-hover text-left">
                <Avatar name={p.full_name} src={p.avatar_url} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate">{p.full_name}</span>
                  <span className="block text-[11px] text-muted truncate">{p.email}</span>
                </span>
                <UserPlus size={14} className="text-muted shrink-0" />
              </button>
            ))}
          </div>
        )}
        <div className="pt-[var(--s3)] border-t">
          <Field label="Or pre-authorise an email address" hint="They get platform access automatically once they have a profile.">
            <div className="flex gap-2">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@company.com" />
              <Button variant="secondary" loading={busy} onClick={invite}>
                Invite
              </Button>
            </div>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
