"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, ListChecks, Lock, Rocket, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, Pill, Progress, Textarea, useToast } from "@/components/ui";
import type { Json } from "@/lib/database.types";
import { cn, fmtDate } from "@/lib/utils";
import { rpcError, type OnboardingRecord, type OnboardingStep, type SetupHealth } from "./lib";

/**
 * The checklist a company is carried through before it goes live (§35, §169).
 * Blocking steps are the ones `company_go_live_blockers()` will also refuse on — the checklist is a
 * plan, the blockers are the truth, and both are shown together so nobody is surprised at the end.
 */
export function OnboardingChecklist({
  orgId,
  companyName,
  onboarding,
  setup,
  status,
  canGoLive,
}: {
  orgId: string;
  companyName: string;
  onboarding: OnboardingRecord | null;
  setup: SetupHealth;
  status: string;
  canGoLive: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [steps, setSteps] = React.useState<OnboardingStep[]>(onboarding?.steps || []);
  const [notes, setNotes] = React.useState(onboarding?.notes || "");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const done = steps.filter((s) => s.done).length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const blockers = setup?.blockers || [];
  const liveReady = blockers.length === 0 && status !== "active";

  async function persist(next: OnboardingStep[], nextNotes?: string) {
    const { error } = await createClient()
      .from("company_onboarding")
      .update({ steps: next as unknown as Json, notes: nextNotes ?? notes, updated_at: new Date().toISOString() })
      .eq("org_id", orgId);
    if (error) {
      toast.push(rpcError(error.message), "danger");
      return false;
    }
    return true;
  }

  async function toggle(key: string) {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    setBusy(key);
    const prev = steps;
    const next = steps.map((s) =>
      s.key === key ? { ...s, done: !s.done, done_at: !s.done ? new Date().toISOString() : null, done_by: !s.done ? auth.user?.id || null : null } : s
    );
    setSteps(next);
    const ok = await persist(next);
    setBusy(null);
    if (!ok) setSteps(prev);
  }

  async function saveNotes() {
    setBusy("notes");
    await persist(steps, notes);
    setBusy(null);
    toast.push("Notes saved", "success");
  }

  async function createChecklist() {
    setCreating(true);
    const supabase = createClient();
    const { data: defaults } = await supabase.rpc("default_onboarding_steps");
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("company_onboarding").insert({ org_id: orgId, steps: (defaults || []) as Json, owner_id: auth.user?.id || null });
    setCreating(false);
    if (error) {
      toast.push(rpcError(error.message), "danger");
      return;
    }
    setSteps(((defaults || []) as unknown as OnboardingStep[]) || []);
    router.refresh();
  }

  async function goLive() {
    setBusy("golive");
    const { error } = await createClient().rpc("set_company_status", { p_org: orgId, p_status: "active", p_reason: `Go-live for ${companyName}` });
    setBusy(null);
    if (error) {
      toast.push(rpcError(error.message), "danger");
      return;
    }
    toast.push(`${companyName} is live`, "success");
    router.refresh();
  }

  if (!onboarding && steps.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ListChecks size={20} />}
          title="No onboarding checklist yet"
          hint="Companies created through the wizard get one automatically. This one predates it — start a fresh checklist."
          action={
            <Button variant="primary" loading={creating} onClick={createChecklist}>
              Start checklist
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.618fr_1fr] gap-[var(--s3)] items-start">
      <Card className="p-[var(--s4)] min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="eyebrow">Onboarding</div>
            <div className="h2 mt-1">
              {done} of {steps.length} done
            </div>
          </div>
          <Pill tone={pct === 100 ? "tone-success" : "tone-info"} size="lg">
            {pct}%
          </Pill>
        </div>
        <Progress value={pct} tone={pct === 100 ? "var(--success)" : "var(--brand-2)"} className="mt-2" />

        <div className="mt-[var(--s4)] divide-y">
          {steps.map((s) => (
            <button
              key={s.key}
              type="button"
              disabled={busy === s.key}
              onClick={() => toggle(s.key)}
              className={cn("w-full flex items-start gap-2.5 py-2.5 text-left row-hover px-1 -mx-1 rounded-[var(--radius-sm)]", busy === s.key && "opacity-60")}
            >
              {s.done ? <CheckCircle2 size={17} className="text-success shrink-0 mt-px" /> : <Circle size={17} className="text-muted shrink-0 mt-px" />}
              <span className="min-w-0 flex-1">
                <span className={cn("text-sm block", s.done && "text-muted line-through")}>{s.label}</span>
                {s.done && s.done_at && <span className="text-[11px] text-muted">Completed {fmtDate(s.done_at, true)}</span>}
              </span>
              {s.blocking && !s.done && (
                <span className="pill tone-warn shrink-0">
                  <Lock size={10} /> Blocks go-live
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-[var(--s4)]">
          <span className="label">Handover notes</span>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the next person needs to know about this company's setup…" className="min-h-[70px]" />
          <div className="flex justify-end mt-2">
            <Button size="sm" variant="secondary" loading={busy === "notes"} disabled={notes === (onboarding?.notes || "")} onClick={saveNotes}>
              Save notes
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-[var(--s4)] min-w-0">
        <div className="eyebrow">Go-live</div>
        {blockers.length === 0 ? (
          <>
            <div className="flex items-center gap-2 mt-2 text-sm font-medium text-success">
              <CheckCircle2 size={16} /> Nothing is blocking go-live
            </div>
            <p className="text-[12px] text-muted mt-1">
              {status === "active" ? `${companyName} is already live.` : `${companyName} has an administrator, departments, employees and reporting lines. It can be switched to Active.`}
            </p>
            {canGoLive && liveReady && (
              <Button variant="success" className="mt-[var(--s3)] w-full" loading={busy === "golive"} onClick={goLive}>
                <Rocket size={15} /> Take {companyName} live
              </Button>
            )}
            {!canGoLive && status !== "active" && <p className="text-[11px] text-warn mt-2">Only a platform owner or operations admin can change a company&apos;s status.</p>}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mt-2 text-sm font-medium text-warn">
              <TriangleAlert size={16} /> {blockers.length} thing{blockers.length === 1 ? "" : "s"} still block go-live
            </div>
            <ul className="mt-2 space-y-1.5">
              {blockers.map((b, i) => (
                <li key={i} className="text-[12px] text-2 flex items-start gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--warn)] shrink-0 mt-1.5" />
                  {b}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted mt-[var(--s3)]">
              These are checked in the database by <span className="font-mono">company_go_live_blockers</span> — activation is refused while any remain, whatever the checklist says.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
