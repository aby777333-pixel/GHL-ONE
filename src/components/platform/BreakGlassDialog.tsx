"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ShieldAlert, Timer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Modal, Pill, Select, Textarea, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { BG_DURATIONS, BG_SCOPES, countdown, JUSTIFICATIONS, MIN_REASON, rpcError } from "./lib";

/**
 * Break-glass (§3, §60). Reading a company's own content is never a side effect of being platform
 * staff: it takes a written reason, a category, a scope and an expiry, the company's administrators
 * are notified the moment it opens, and the session shows as a banner until it is closed.
 */
export function BreakGlassDialog({ open, onClose, orgId, companyName }: { open: boolean; onClose: () => void; orgId: string; companyName: string }) {
  /* The form is mounted only while open, so every field starts blank again on the next open —
     `useState` initialisers do the reset that an effect used to do. */
  if (!open) return null;
  return <BreakGlassForm onClose={onClose} orgId={orgId} companyName={companyName} />;
}

function BreakGlassForm({ onClose, orgId, companyName }: { onClose: () => void; orgId: string; companyName: string }) {
  const toast = useToast();
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  const [justification, setJustification] = React.useState(JUSTIFICATIONS[0].key);
  const [scope, setScope] = React.useState("configuration");
  const [minutes, setMinutes] = React.useState(60);
  const [busy, setBusy] = React.useState(false);

  const short = reason.trim().length < MIN_REASON;
  const scopeInfo = BG_SCOPES.find((s) => s.key === scope);
  const justInfo = JUSTIFICATIONS.find((j) => j.key === justification);

  async function start() {
    if (short) return;
    setBusy(true);
    const { error } = await createClient().rpc("start_break_glass", {
      p_org: orgId,
      p_reason: reason.trim(),
      p_justification: justification,
      p_scope: scope,
      p_minutes: minutes,
    });
    setBusy(false);
    if (error) {
      toast.push(rpcError(error.message), "danger");
      return;
    }
    toast.push("Authorised access session opened — the company's administrators have been notified", "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title={
        <span className="inline-flex items-center gap-2">
          <KeyRound size={17} className="text-[var(--danger)]" /> Authorised access — {companyName}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} disabled={short} onClick={start}>
            Open access session
          </Button>
        </>
      }
    >
      <div className="rounded-[var(--radius-sm)] border border-[var(--danger)] bg-[var(--danger-bg)] p-3 mb-[var(--s3)]">
        <div className="text-sm font-semibold text-danger flex items-center gap-1.5">
          <ShieldAlert size={15} /> This is recorded and the company is told immediately
        </div>
        <p className="text-[12px] text-2 mt-1">
          Every administrator of {companyName} receives a notification with your reason, the scope and the expiry time. The session appears in
          their own audit trail and in the platform security log. It closes by itself when it expires.
        </p>
      </div>

      <div className="space-y-[var(--s3)]">
        <Field label={`Why do you need this? (${Math.min(reason.trim().length, 999)}/${MIN_REASON} minimum)`} hint="Write it for the company's administrator to read, not for yourself. Reference a ticket or a person where you can.">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Ticket #4821 — payroll export produced empty rows; need to inspect the failed job records."
            className="min-h-[76px]"
          />
        </Field>
        {short && <div className="text-[11px] text-warn -mt-2">A specific written reason of at least {MIN_REASON} characters is required.</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--s3)]">
          <Field label="Category" hint={justInfo?.hint}>
            <Select value={justification} onChange={(e) => setJustification(e.target.value)}>
              {JUSTIFICATIONS.map((j) => (
                <option key={j.key} value={j.key}>
                  {j.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Scope" hint={scopeInfo?.hint}>
            <Select value={scope} onChange={(e) => setScope(e.target.value)}>
              {BG_SCOPES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="How long do you need?" hint="Keep it short. You can open another session if you need more time.">
          <div className="flex flex-wrap gap-1.5">
            {BG_DURATIONS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutes(m)}
                className={cn("pill pill-lg", minutes === m ? "tone-brand" : "tone-neutral hover:bg-[var(--line)]")}
              >
                {m < 60 ? `${m} min` : `${m / 60} h`}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Banner */

type OpenSession = { id: string; org_id: string; reason: string; scope: string; justification: string; expires_at: string };

/**
 * Persistent reminder that an authorised access session is open, with the way to close it.
 * Rendered by the app shell for platform staff, so it follows you onto every page.
 */
/**
 * Plain fetch helper — no state, so the mount effect can apply the result from a promise callback.
 * Returns null when there is no signed-in user: the caller then leaves the banner as it is rather
 * than clearing an active privileged session off the screen on a transient auth blip.
 */
async function fetchOpenSessions(orgId?: string): Promise<OpenSession[] | null> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data } = await supabase
    .from("break_glass_sessions")
    .select("id,org_id,reason,scope,justification,expires_at")
    .eq("actor_id", auth.user.id)
    .is("ended_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("started_at", { ascending: false });
  return ((data || []) as OpenSession[]).filter((s) => !orgId || s.org_id === orgId);
}

export function BreakGlassBanner({ orgId, className }: { orgId?: string; className?: string }) {
  const toast = useToast();
  const router = useRouter();
  const [sessions, setSessions] = React.useState<OpenSession[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [, setTick] = React.useState(0);

  const load = React.useCallback(async () => {
    const rows = await fetchOpenSessions(orgId);
    if (rows) setSessions(rows);
  }, [orgId]);

  React.useEffect(() => {
    let alive = true;
    void fetchOpenSessions(orgId).then((rows) => {
      if (alive && rows) setSessions(rows);
    });
    const id = setInterval(() => {
      setTick((t) => t + 1);
      void load();
    }, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [orgId, load]);

  async function end(id: string) {
    setBusy(id);
    const { error } = await createClient().rpc("end_break_glass", { p_id: id });
    setBusy(null);
    if (error) {
      toast.push(rpcError(error.message), "danger");
      return;
    }
    toast.push("Access session closed", "success");
    setSessions((s) => s.filter((x) => x.id !== id));
    router.refresh();
  }

  if (!sessions.length) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {sessions.map((s) => (
        <div key={s.id} className="rounded-[var(--radius)] border border-[var(--danger)] bg-[var(--danger-bg)] px-[var(--s3)] py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-danger">
            <KeyRound size={15} /> Authorised access session open
          </span>
          <Pill tone="tone-danger">{BG_SCOPES.find((x) => x.key === s.scope)?.label || s.scope}</Pill>
          <span className="inline-flex items-center gap-1 text-[11px] text-2">
            <Timer size={12} /> {countdown(s.expires_at)}
          </span>
          <span className="text-[11px] text-2 min-w-0 flex-1 truncate" title={s.reason}>
            {s.reason}
          </span>
          <Button size="xs" variant="danger" loading={busy === s.id} onClick={() => end(s.id)}>
            End session
          </Button>
        </div>
      ))}
    </div>
  );
}
