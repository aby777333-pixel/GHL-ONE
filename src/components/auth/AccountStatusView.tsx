"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Building2, Check, Clock3, KeyRound, LogOut, MailCheck, RefreshCw, ShieldAlert, UserX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Pill } from "@/components/ui";
import { JoinRequestForm, type JoinRequestRow } from "@/components/auth/JoinRequestForm";
import { OnboardingAssistant } from "@/components/auth/OnboardingAssistant";
import { firstName, NEED_LABEL, STATUS_LABEL, STATUS_TONE, type AccountStatus } from "@/lib/accountStatus";

/**
 * The account-status page (0078). One view per state, written for the person, not for an engineer:
 * never "company not found" for a recognised domain, never a bare "access denied".
 *
 * This page sits outside the app shell, so it has no ToastProvider — every message is inline.
 */
export function AccountStatusView({
  status,
  email,
  departments,
  request,
}: {
  status: AccountStatus;
  email: string;
  departments: { id: string; name: string }[];
  request: JoinRequestRow | null;
}) {
  const router = useRouter();
  const s = status.status;
  const company = status.company?.name || null;
  const name = firstName(status.full_name, email);
  const onPlatform = status.company?.on_platform === true;
  const waiting = s === "awaiting_company" || s === "pending_approval" || s === "pending_department" || s === "rejected";
  const closed = s === "suspended" || s === "deactivated";
  const needs = (status.needs || []).filter((n) => n !== "department");

  const head = HEAD[s] || HEAD.unknown;

  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-[560px] space-y-[var(--s3)] anim-fade-up">
        <div className="card p-[var(--s5)]">
          <div className="flex items-start gap-3">
            <div className={`w-12 h-12 rounded-full ${head.tone} flex items-center justify-center shrink-0`}>{head.icon}</div>
            <div className="min-w-0">
              <div className="h2">{head.title(name)}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span>Account status:</span>
                <Pill tone={STATUS_TONE[s]}>{STATUS_LABEL[s]}</Pill>
              </div>
            </div>
          </div>

          <div className="mt-[var(--s4)] space-y-2 text-sm text-2">
            {s === "awaiting_company" && (
              <>
                <p>Your account has been created and your email address verified.</p>
                <p>
                  We have identified your organization as <span className="font-semibold text-[var(--fg)]">{company || "your company"}</span>.
                  {onPlatform ? " Its workspace is currently being prepared." : " Your company’s workspace is currently being prepared."}
                </p>
                <p>You will receive an email and an in-app notification once your workspace is activated and your access is approved. You do not need to register again.</p>
              </>
            )}
            {s === "pending_approval" && (
              <p>
                Your email is verified and we have identified your organization as{" "}
                <span className="font-semibold text-[var(--fg)]">{company || "your company"}</span>. Your request is with the
                people who can admit you: your department head, HR and the company administrators.
              </p>
            )}
            {s === "pending_department" && (
              <p>
                {status.requested_department
                  ? <>You told us you work in <span className="font-semibold text-[var(--fg)]">{status.requested_department}</span>, which is not set up in {company || "your company"} yet. </>
                  : <>{company || "Your company"} has no departments set up yet. </>}
                An administrator will place you in the right department as part of approving your access. Nothing more is needed from you.
              </p>
            )}
            {s === "rejected" && (
              <div className="rounded-[var(--radius-sm)] tone-danger px-3 py-2">
                <div className="font-medium">Your request was not approved{status.decided_label ? ` by ${status.decided_label}` : ""}.</div>
                <div className="text-xs mt-0.5">{status.decision_note || "No reason was given."}</div>
                {!onPlatform && <div className="text-xs mt-1">If you think this is a mistake, contact your company’s HR or administrator.</div>}
              </div>
            )}
            {s === "suspended" && (
              <p>Your account is suspended, so your company’s workspace is closed to you for now. Your data is not deleted. If this is unexpected, contact your manager or HR.</p>
            )}
            {s === "deactivated" && (
              <p>Your access to {company || "your company’s workspace"} has been revoked. If you have rejoined or think this is a mistake, contact your manager or HR — they can reactivate the account.</p>
            )}
            {s === "email_verification_pending" && (
              <p>Open the link we emailed to <span className="font-medium text-[var(--fg)] break-all">{email}</span> to verify your address, then sign in again.</p>
            )}
            {s === "unknown" && <p>Your account is still being set up. Give it a moment and press Check again.</p>}
          </div>

          {waiting && needs.length > 0 && (
            <div className="mt-[var(--s3)] rounded-[var(--radius-sm)] tone-warn px-3 py-2 text-xs">
              {company || "Your company"} also asks for {needs.map((n) => NEED_LABEL[n] || n).join(" and ")}. Add it under Your details below.
            </div>
          )}

          {onPlatform && (s === "pending_approval" || s === "pending_department" || s === "rejected") && (
            <div className="mt-[var(--s4)]">
              <JoinRequestForm departments={departments} request={request} company={company} />
            </div>
          )}
        </div>

        {(waiting || s === "unknown") && <DetailsCard status={status} />}

        {!closed && <OnboardingAssistant status={status} name={name} />}

        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={() => router.refresh()}><RefreshCw size={14} /> Check again</Button>
          <Link href="/auth/update-password" className="btn btn-secondary"><KeyRound size={14} /> Change password</Link>
          <Link href="/auth/signout" prefetch={false} className="btn btn-ghost"><LogOut size={14} /> Sign out</Link>
        </div>
        <p className="text-[11px] text-muted text-center">Signed in as {email}. GHL ONE shows you nothing of a company until you are admitted to it.</p>
      </div>
    </div>
  );
}

const HEAD: Record<string, { title: (n: string) => string; icon: React.ReactNode; tone: string }> = {
  awaiting_company: { title: () => "Welcome to GHL ONE!", icon: <Building2 size={22} />, tone: "tone-info" },
  pending_approval: { title: (n) => `Almost there, ${n}`, icon: <Clock3 size={22} />, tone: "tone-warn" },
  pending_department: { title: (n) => `Almost there, ${n}`, icon: <Clock3 size={22} />, tone: "tone-warn" },
  rejected: { title: () => "Request not approved", icon: <UserX size={22} />, tone: "tone-danger" },
  suspended: { title: () => "Account suspended", icon: <ShieldAlert size={22} />, tone: "tone-danger" },
  deactivated: { title: () => "Account deactivated", icon: <Ban size={22} />, tone: "tone-neutral" },
  email_verification_pending: { title: () => "Verify your email", icon: <MailCheck size={22} />, tone: "tone-info" },
  unknown: { title: () => "Setting up your account", icon: <Clock3 size={22} />, tone: "tone-neutral" },
};

/** Name, mobile, designation, employee ID and manager — editable while waiting (update_my_registration). */
function DetailsCard({ status }: { status: AccountStatus }) {
  const router = useRouter();
  const reg = status.registration || {};
  const [open, setOpen] = React.useState(false);
  const [fullName, setFullName] = React.useState(status.full_name || "");
  const [phone, setPhone] = React.useState(reg.phone || "");
  const [designation, setDesignation] = React.useState(reg.designation || "");
  const [employeeRef, setEmployeeRef] = React.useState(reg.employee_ref || "");
  const [manager, setManager] = React.useState(reg.manager_name || "");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().rpc("update_my_registration", {
      p_full_name: fullName.trim() || undefined,
      p_phone: phone.trim() || undefined,
      p_designation: designation.trim() || undefined,
      p_employee_ref: employeeRef.trim() || undefined,
      p_manager: manager.trim() || undefined,
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setMsg({ ok: true, text: "Saved. The people who approve you see the update." });
    setOpen(false);
    router.refresh();
  }

  const rows: [string, string | null | undefined][] = [
    ["Name", status.full_name],
    ["Mobile", reg.phone],
    ["Designation", reg.designation],
    ["Employee ID", reg.employee_ref],
    ["Reporting manager", reg.manager_name],
  ];

  return (
    <div className="card p-[var(--s4)]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">Your details</div>
        {!open && <button className="link text-xs" onClick={() => setOpen(true)}>Edit</button>}
      </div>
      {msg && <div className={`text-xs mt-2 flex items-center gap-1 ${msg.ok ? "text-[var(--success)]" : "text-danger"}`}>{msg.ok && <Check size={13} />}{msg.text}</div>}
      {!open ? (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          {rows.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt className="text-muted">{k}</dt>
              <dd className="min-w-0 truncate">{v || <span className="text-muted">—</span>}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : (
        <form onSubmit={save} className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Full name" className="sm:col-span-2"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} /></Field>
          <Field label="Mobile number"><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32} /></Field>
          <Field label="Designation"><Input value={designation} onChange={(e) => setDesignation(e.target.value)} maxLength={80} /></Field>
          <Field label="Employee ID"><Input value={employeeRef} onChange={(e) => setEmployeeRef(e.target.value)} maxLength={40} /></Field>
          <Field label="Reporting manager"><Input value={manager} onChange={(e) => setManager(e.target.value)} maxLength={120} placeholder="Name or work email" /></Field>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>Save details</Button>
          </div>
        </form>
      )}
    </div>
  );
}
