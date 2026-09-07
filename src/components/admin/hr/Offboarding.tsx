"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, GitBranch, LogOut, ShieldOff, Workflow } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { PersonChip } from "@/components/tasks/TaskBits";
import { ago, cn, fmtDate } from "@/lib/utils";
import { Note, PersonLine } from "../AdminBits";
import { daysUntil, RUN_STATUS_TONE, todayIso, type HrData, type HrPerson } from "./lib";

export function OffboardingView({ data }: { data: HrData }) {
  const [open, setOpen] = React.useState(false);
  const runs = data.runs.filter((r) => r.kind === "offboarding");
  return (
    <div className="space-y-[var(--s4)]">
      <Card className="px-[var(--s4)] py-[var(--s3)] flex flex-wrap items-start gap-3 text-sm">
        <LogOut size={16} className="text-[var(--brand)] shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">Structured exit</div>
          <div className="text-muted">Open work moves to a colleague in one step, the exit workflow assigns the human tasks (handover, assets, access, exit interview, archive), and the account is disabled on the last day.</div>
        </div>
        <Button variant="danger" size="sm" onClick={() => setOpen(true)}><LogOut size={14} /> Offboard someone</Button>
      </Card>

      <Card>
        <CardHeader title="Exit workflows" subtitle={runs.length ? `${runs.length} run${runs.length === 1 ? "" : "s"}` : "None yet."} action={<Workflow size={15} className="text-muted" />} />
        {runs.length === 0 ? (
          <EmptyState icon={<GitBranch size={18} />} title="No offboarding in progress" className="py-[var(--s4)]" />
        ) : (
          <div className="divide-y border-t">
            {runs.map((r) => {
              const ctx = r.context && typeof r.context === "object" && !Array.isArray(r.context) ? (r.context as Record<string, unknown>) : {};
              return (
                <Link key={r.id} href={`/admin?tab=workflows&run=${r.id}`} className="flex flex-wrap items-center gap-3 px-[var(--s4)] py-2.5 row-hover">
                  <PersonLine id={r.subject_user_id} name={r.subject_label} size={30} sub={<>Started {ago(r.started_at)}{r.started_by && <> by <PersonChip id={r.started_by} size={12} /></>}{typeof ctx.last_day === "string" ? ` · last day ${fmtDate(ctx.last_day)}` : ""}</>} className="flex-1 min-w-[220px]" />
                  {typeof ctx.reason === "string" && ctx.reason && <span className="text-xs text-muted truncate max-w-[280px]">{ctx.reason}</span>}
                  <Pill tone={RUN_STATUS_TONE[r.status] || "tone-neutral"}>{r.status}</Pill>
                  <ArrowRight size={14} className="text-muted" />
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      <OffboardWizard open={open} people={data.people} onClose={() => setOpen(false)} />
    </div>
  );
}

type Result = { run_id: string | null; moved: Record<string, number>; revoked: Record<string, unknown> | null };

export function OffboardWizard({ open, person, people, onClose }: { open: boolean; person?: HrPerson | null; people: HrPerson[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useSession();
  const [userId, setUserId] = React.useState(person?.id || "");
  const subject = person || people.find((p) => p.id === userId) || null;
  const [transferTo, setTransferTo] = React.useState(person?.manager_id || "");
  const [reason, setReason] = React.useState("");
  const [lastDay, setLastDay] = React.useState(() => todayIso());
  const [typed, setTyped] = React.useState("");
  const [step, setStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);
  const [today] = React.useState(() => todayIso());

  function pick(v: string) {
    setUserId(v);
    const p = people.find((x) => x.id === v);
    setTransferTo(p?.manager_id || "");
  }

  const immediate = daysUntil(lastDay, today) <= 0;
  const canProceed = step === 0 ? !!subject && subject.id !== profile.id : step === 1 ? !!transferTo && transferTo !== subject?.id : step === 2 ? reason.trim().length > 0 && !!lastDay : typed.trim().toLowerCase() === (subject?.full_name || "").trim().toLowerCase();

  async function run() {
    if (!subject || !transferTo) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("offboard_user", { p_user: subject.id, p_transfer_to: transferTo, p_reason: reason.trim(), p_last_day: lastDay });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    const j = (data && typeof data === "object" && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
    setResult({
      run_id: typeof j.run_id === "string" ? j.run_id : null,
      moved: (j.moved && typeof j.moved === "object" && !Array.isArray(j.moved) ? j.moved : {}) as Record<string, number>,
      revoked: (j.revoked && typeof j.revoked === "object" && !Array.isArray(j.revoked) ? j.revoked : null) as Record<string, unknown> | null,
    });
    toast.push(`${subject.full_name} offboarded`, "success");
    router.refresh();
  }

  function close() {
    onClose();
    if (result) { setResult(null); setStep(0); setTyped(""); setReason(""); }
  }

  const steps = ["Person", "Transfer work", "Reason & last day", "Confirm"];

  return (
    <Modal open={open} onClose={close} title={<span className="inline-flex items-center gap-2"><LogOut size={16} className="text-danger" /> Offboard</span>} width={560}
      footer={result ? <Button variant="primary" onClick={close}>Done</Button> : <><Button variant="ghost" onClick={close}>Cancel</Button>{step > 0 && <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>Back</Button>}{step < 3 ? <Button variant="primary" disabled={!canProceed} onClick={() => setStep((s) => s + 1)}>Next <ArrowRight size={14} /></Button> : <Button variant="danger" disabled={!canProceed} loading={busy} onClick={run}><ShieldOff size={14} /> Offboard {subject?.full_name.split(" ")[0]}</Button>}</>}>
      {result ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-success"><CheckCircle2 size={18} /> <span className="font-medium">{subject?.full_name} has been offboarded.</span></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(["tasks", "projects", "approvals", "requests", "files"] as const).map((k) => (
              <div key={k} className="card px-3 py-2"><div className="text-[11px] text-muted capitalize">{k} moved</div><div className="text-lg font-semibold num">{result.moved[k] ?? 0}</div></div>
            ))}
            <div className="card px-3 py-2"><div className="text-[11px] text-muted">Account</div><div className="text-sm font-medium">{result.revoked ? "Disabled now" : `Disabled on ${fmtDate(lastDay)}`}</div></div>
          </div>
          <Note tone="info">Work went to <PersonChip id={transferTo} size={14} />, who was notified. {result.revoked ? "Access, sessions and memberships were revoked everywhere and the event is audited." : "Until the last day the person keeps working; access is revoked by the exit workflow's IT step or by revoking everywhere from Security."}</Note>
          {result.run_id && <Link href={`/admin?tab=workflows&run=${result.run_id}`} className="btn btn-secondary w-full"><GitBranch size={14} /> Open the exit workflow</Link>}
        </div>
      ) : (
        <div className="space-y-[var(--s4)]">
          <ol className="flex items-center gap-1 text-[11px]">
            {steps.map((s, i) => <li key={s} className={cn("flex items-center gap-1", i > 0 && "before:content-[''] before:w-3 before:h-px before:bg-[var(--line)] before:mx-1")}><span className={cn("w-5 h-5 rounded-full inline-flex items-center justify-center font-semibold", i <= step ? "bg-[var(--brand)] text-white" : "sunken text-muted")}>{i + 1}</span><span className={cn("hidden sm:inline", i === step ? "font-medium" : "text-muted")}>{s}</span></li>)}
          </ol>

          {step === 0 && (
            <div className="space-y-3">
              {person ? <PersonLine id={person.id} name={person.full_name} size={36} sub={person.designation || person.email} /> : <Field label="Who is leaving?"><PersonPicker value={userId} onChange={pick} placeholder="Choose a person…" /></Field>}
              {subject?.id === profile.id && <Note tone="danger">You cannot offboard yourself.</Note>}
              <Note tone="neutral">Nothing happens until the final confirmation.</Note>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-3">
              <Field label="Transfer open work to" hint="Defaults to the manager. Open tasks, projects, pending approvals, help requests, files and owned rooms move in one step."><PersonPicker value={transferTo} onChange={setTransferTo} placeholder="Choose a colleague…" /></Field>
              {transferTo && transferTo === subject?.id && <Note tone="danger">Pick someone other than the person leaving.</Note>}
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <Field label="Reason"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Resignation, contract end, performance… Kept in the audit trail and the workflow context." autoFocus /></Field>
              <Field label="Last working day"><Input type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} /></Field>
              <Note tone={immediate ? "warn" : "info"}>{immediate ? "Last day is today or earlier: the account is disabled immediately — sessions ended, memberships and grants revoked." : `The account stays active until ${fmtDate(lastDay)}. Work is transferred and the exit workflow starts now; IT confirms revocation as one of its steps.`}</Note>
            </div>
          )}
          {step === 3 && subject && (
            <div className="space-y-3">
              <div className="sunken rounded-[var(--radius-sm)] p-3 text-sm space-y-1">
                <div className="flex justify-between gap-3"><span className="text-muted">Leaving</span><span className="font-medium">{subject.full_name}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted">Work goes to</span><span><PersonChip id={transferTo} size={14} /></span></div>
                <div className="flex justify-between gap-3"><span className="text-muted">Last day</span><span className="num">{fmtDate(lastDay)}{immediate ? " · disabled now" : ""}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted">Reason</span><span className="text-right">{reason}</span></div>
              </div>
              <Field label={`Type “${subject.full_name}” to confirm`}><Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus /></Field>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
