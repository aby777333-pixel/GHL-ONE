"use client";

import * as React from "react";
import { Clock, DoorOpen, KeyRound, LifeBuoy, ShieldCheck, ShieldX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, Field, Modal, Pill, Select, Spinner, Textarea, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, fmtDate, humanize, isAdminRole } from "@/lib/utils";
import { countdown, isFuture, rpcError } from "@/components/platform/lib";

type SupportSession = {
  id: string;
  scope: string;
  reason: string | null;
  granted_by: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
};
type PlatformVisit = {
  id: string;
  reason: string;
  justification: string;
  scope: string;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
};

const HOURS = [2, 8, 24, 72, 168];
const SCOPES: { key: string; label: string; hint: string }[] = [
  { key: "configuration", label: "Settings only", hint: "They can see and change how your company is set up. They cannot read your people's work." },
  { key: "content", label: "Settings and content", hint: "They can also read what your people wrote — messages, tasks, files. Grant this only when the problem needs it." },
];

/**
 * The company's side of platform support (§115-117).
 *
 * The platform can enter this company on its own terms only by opening an authorised access session,
 * which notifies these same administrators. This screen is the *other* door: the one the company
 * opens deliberately, for a stated purpose, for a stated length of time, and can shut at any moment.
 */
type AccessData = { sessions: SupportSession[]; visits: PlatformVisit[] };

/** Plain fetch helper — no state, so callers decide when the result is applied. */
async function fetchAccess(): Promise<AccessData> {
  const supabase = createClient();
  const [{ data: s }, { data: b }] = await Promise.all([
    supabase.from("support_sessions").select("id,scope,reason,granted_by,expires_at,revoked_at,created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("break_glass_sessions").select("id,reason,justification,scope,started_at,expires_at,ended_at").order("started_at", { ascending: false }).limit(50),
  ]);
  return { sessions: (s || []) as SupportSession[], visits: (b || []) as PlatformVisit[] };
}

export function SupportAccess({ perms }: { perms: string[] }) {
  const { profile } = useSession();
  const toast = useToast();
  const canGrant = isAdminRole(profile.role) || perms.includes("*");
  const [sessions, setSessions] = React.useState<SupportSession[] | null>(null);
  const [visits, setVisits] = React.useState<PlatformVisit[]>([]);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  const [hours, setHours] = React.useState(8);
  const [scope, setScope] = React.useState("configuration");
  const [reason, setReason] = React.useState("");

  const apply = React.useCallback((d: AccessData) => {
    setSessions(d.sessions);
    setVisits(d.visits);
  }, []);

  const load = React.useCallback(async () => {
    apply(await fetchAccess());
  }, [apply]);

  React.useEffect(() => {
    let alive = true;
    void fetchAccess().then((d) => {
      if (alive) apply(d);
    });
    return () => {
      alive = false;
    };
  }, [apply]);

  const live = (sessions || []).filter((s) => !s.revoked_at && isFuture(s.expires_at));

  async function grant() {
    setBusy("grant");
    const { error } = await createClient().rpc("grant_support_access", { p_hours: hours, p_scope: scope, p_reason: reason.trim() || undefined });
    setBusy(null);
    if (error) {
      toast.push(rpcError(error.message), "danger");
      return;
    }
    setOpen(false);
    setReason("");
    toast.push("Support access granted — you can end it at any time", "success");
    load();
  }

  async function revoke(id: string) {
    setBusy(id);
    const { error } = await createClient().rpc("revoke_support_access", { p_id: id });
    setBusy(null);
    if (error) {
      toast.push(rpcError(error.message), "danger");
      return;
    }
    toast.push("Support access ended", "success");
    load();
  }

  return (
    <div className="space-y-[var(--s3)]">
      <Card className={cn("p-[var(--s4)] min-w-0", live.length > 0 && "border-[var(--warn)]")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow flex items-center gap-1.5">
              <LifeBuoy size={12} /> Platform support access
            </div>
            <div className="h2 mt-1 flex items-center gap-2">
              {live.length > 0 ? (
                <>
                  <DoorOpen size={19} className="text-warn" /> The door is open
                </>
              ) : (
                <>
                  <ShieldCheck size={19} className="text-success" /> Nobody from the platform has access
                </>
              )}
            </div>
            <p className="text-sm text-muted mt-1 max-w-xl">
              {live.length > 0
                ? "A platform support person can work inside your company right now, within the scope you granted. End it the moment you no longer need help."
                : "The GHL ONE platform team cannot look inside your company. If they need to help with something they cannot see, grant them access here — for a scope and a length of time you choose."}
            </p>
          </div>
          {canGrant ? (
            <Button variant={live.length > 0 ? "secondary" : "primary"} onClick={() => setOpen(true)}>
              <KeyRound size={15} /> Grant access
            </Button>
          ) : (
            <Pill tone="tone-warn">Only a company administrator can grant this</Pill>
          )}
        </div>

        {live.length > 0 && (
          <div className="mt-[var(--s3)] space-y-1.5">
            {live.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] tone-warn px-2.5 py-2">
                <Pill tone="tone-warn">{SCOPES.find((x) => x.key === s.scope)?.label || humanize(s.scope)}</Pill>
                <span className="text-[12px] inline-flex items-center gap-1">
                  <Clock size={12} /> {countdown(s.expires_at)}
                </span>
                <span className="text-[12px] min-w-0 flex-1 truncate">{s.reason || "No reason recorded"}</span>
                {canGrant && (
                  <Button size="xs" variant="danger" loading={busy === s.id} onClick={() => revoke(s.id)}>
                    <ShieldX size={12} /> End now
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="min-w-0">
        <div className="px-[var(--s4)] pt-[var(--s3)] pb-2">
          <div className="eyebrow">Access history</div>
          <div className="text-[11px] text-muted mt-0.5">Every time this door was opened, by whom and for how long.</div>
        </div>
        {sessions === null ? (
          <div className="px-[var(--s4)] pb-[var(--s4)] flex items-center gap-2 text-sm text-muted">
            <Spinner /> Loading…
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState icon={<LifeBuoy size={20} />} title="Support access has never been granted" hint="That is the normal state. Grant it only while someone is actively helping you." />
        ) : (
          <div className="divide-y">
            {sessions.map((s) => {
              const active = !s.revoked_at && isFuture(s.expires_at);
              return (
                <div key={s.id} className="px-[var(--s4)] py-2.5 flex flex-wrap items-center gap-2 min-w-0">
                  <Pill tone={active ? "tone-warn" : s.revoked_at ? "tone-neutral" : "tone-muted"}>{active ? "Active" : s.revoked_at ? "Ended early" : "Expired"}</Pill>
                  <Pill tone="tone-neutral">{SCOPES.find((x) => x.key === s.scope)?.label || humanize(s.scope)}</Pill>
                  <span className="text-[12px] text-2 min-w-0 flex-1 truncate">{s.reason || "No reason recorded"}</span>
                  <span className="text-[11px] text-muted shrink-0">
                    {fmtDate(s.created_at, true)} → {fmtDate(s.revoked_at || s.expires_at, true)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="min-w-0">
        <div className="px-[var(--s4)] pt-[var(--s3)] pb-2">
          <div className="eyebrow">Authorised platform access</div>
          <div className="text-[11px] text-muted mt-0.5">
            The separate, exceptional route: a platform administrator opening your company&apos;s content with a written reason. You are notified every time it happens, and it is listed here permanently.
          </div>
        </div>
        {visits.length === 0 ? (
          <div className="px-[var(--s4)] pb-[var(--s4)] text-sm text-muted flex items-center gap-2">
            <ShieldCheck size={16} className="text-success" /> This has never happened.
          </div>
        ) : (
          <div className="divide-y">
            {visits.map((v) => {
              const open = !v.ended_at && isFuture(v.expires_at);
              return (
                <div key={v.id} className="px-[var(--s4)] py-2.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={open ? "tone-danger" : "tone-neutral"}>{open ? `Open · ${countdown(v.expires_at)}` : "Closed"}</Pill>
                    <Pill tone="tone-neutral">{humanize(v.justification)}</Pill>
                    <Pill tone="tone-neutral">{humanize(v.scope)}</Pill>
                    <span className="text-[11px] text-muted ml-auto">{fmtDate(v.started_at, true)}</span>
                  </div>
                  <div className="text-[12px] text-2 mt-1">{v.reason}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Grant platform support access"
        width={520}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy === "grant"} onClick={grant}>
              Grant for {hours < 24 ? `${hours} hours` : `${hours / 24} days`}
            </Button>
          </>
        }
      >
        <div className="space-y-[var(--s3)]">
          <Field label="What may they see?" hint={SCOPES.find((s) => s.key === scope)?.hint}>
            <Select value={scope} onChange={(e) => setScope(e.target.value)}>
              {SCOPES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="For how long?" hint="Access ends by itself. You can also end it early at any time.">
            <div className="flex flex-wrap gap-1.5">
              {HOURS.map((h) => (
                <button key={h} type="button" onClick={() => setHours(h)} className={cn("pill pill-lg", hours === h ? "tone-brand" : "tone-neutral hover:bg-[var(--line)]")}>
                  {h < 24 ? `${h} h` : `${h / 24} d`}
                </button>
              ))}
            </div>
          </Field>
          <Field label="What are they helping with? (optional)" hint="Recorded in your own audit log so your team knows why the door was opened.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[70px]" placeholder="e.g. Attendance report shows wrong totals for the night shift — ticket #221." />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
