"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { STATUS_LABEL, type AccountStatus } from "@/lib/accountStatus";

/**
 * The onboarding assistant on the account-status page (brief §12).
 *
 * Deliberately not the AI: a person who is not yet admitted to a company must not reach a model
 * that can read company data, and the questions people ask while waiting are a short, known list.
 * Every answer is built from the person's OWN status (`my_account_status()`), so it cannot reveal
 * anything about the company, and none of them can approve, skip or speed up anything — it only
 * explains what is already true and what happens next.
 */
export function OnboardingAssistant({ status, name }: { status: AccountStatus; name: string }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const company = status.company?.name || "your company";
  const s = status.status;

  const greeting =
    s === "awaiting_company"
      ? `Hi ${name}! Welcome to GHL ONE. We’ve verified your ${company} email address. Your company workspace is being set up. You don’t need to register again. We’ll notify you when your account is ready for approval.`
      : s === "pending_approval"
        ? `Hi ${name}! Your ${company} account is waiting for approval. The people who can admit you have been told, and you’ll get an email the moment they say yes.`
        : s === "pending_department"
          ? `Hi ${name}! Your registration is safe. ${company} just needs to place you in a department, which an administrator does when they approve you.`
          : s === "rejected"
            ? `Hi ${name}. Your request wasn’t approved this time. The reason is shown above — if your company is on GHL ONE you can correct your details and ask again.`
            : `Hi ${name}! I can explain where your account stands and what happens next.`;

  const faqs: { q: string; a: string }[] = [
    {
      q: "Do I need to register again?",
      a: "No. Your registration and your verified email are kept. When your status changes you’ll get an email and an in-app notice — just sign in with the same address and password.",
    },
    {
      q: "Who approves my account?",
      a:
        s === "awaiting_company"
          ? `Nobody yet: ${company}’s workspace has to be activated first. After that its administrators, HR and the head of your department can approve you.`
          : `People at ${company} who are allowed to admit colleagues: the head of the department you named, HR and the company administrators. Nobody outside ${company} sees your request.`,
    },
    {
      q: "How long does it take?",
      a: "It depends on your company’s administrators. Pending requests are reminded to them every day until somebody answers, so nothing is forgotten.",
    },
    {
      q: "Can I change my department or details?",
      a: "Yes. Use “Your details” for your name, mobile, designation, employee ID and manager, and the request form above for your department. An approver confirms the department before it takes effect.",
    },
    {
      q: "What will I be able to use?",
      a: `Once you’re approved you get the tools your role and department at ${company} are allowed — for example a content writer does not get payroll or company finance. Until then you see only this page.`,
    },
    {
      q: "I forgot my password",
      a: "Use “Change password” below while you’re signed in, or “Forgot password?” on the sign-in page to get a reset link by email.",
    },
    {
      q: "Is anything about me shared?",
      a: `Only your registration — name, email, the details you entered and your status — and only with the people who can approve you at ${company}. Your current status is “${STATUS_LABEL[s]}”.`,
    },
  ];

  return (
    <div className="card p-[var(--s4)]">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles size={15} className="text-[var(--brand-2)]" /> GHL ONE onboarding assistant
      </div>
      <p className="text-sm text-2 mt-2">{greeting}</p>
      <div className="flex flex-wrap gap-1.5 mt-3">
        {faqs.map((f) => (
          <button
            key={f.q}
            type="button"
            onClick={() => setOpen(open === f.q ? null : f.q)}
            className={`pill pill-lg ${open === f.q ? "tone-info" : "tone-neutral"}`}
            aria-expanded={open === f.q}
          >
            {f.q}
          </button>
        ))}
      </div>
      {open && (
        <div className="sunken rounded-[var(--radius-sm)] px-3 py-2 mt-3 text-sm text-2" aria-live="polite">
          {faqs.find((f) => f.q === open)?.a}
        </div>
      )}
      <p className="text-[11px] text-muted mt-3">The assistant only explains your own status. It cannot approve, skip or speed up anything.</p>
    </div>
  );
}
