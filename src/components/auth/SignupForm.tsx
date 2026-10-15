"use client";

import * as React from "react";
import { Building2, CircleAlert, Clock3, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Select } from "@/components/ui";
import { authErrorMessage } from "@/lib/authErrors";

/** What `registration_preview()` says about an address before the account exists (0078). */
type Preview = {
  valid: boolean;
  recognized: boolean;
  public_provider?: boolean;
  company?: string;
  workspace?: "ready" | "preparing" | "not_on_platform";
  auto_approve?: boolean;
  require_phone?: boolean;
  require_employee_id?: boolean;
  departments?: { id: string; name: string }[];
};

const OTHER = "__other__";

/**
 * Self-registration. The company is NEVER chosen here — it is read from the verified email domain
 * on the server (`handle_new_user`), so nobody can pick a different company to get past a domain
 * rule. The preview only tells the person, before they commit, what will happen to their address.
 *
 * Everything typed here travels as sign-up metadata and is re-validated in the database: a
 * department id must belong to the company the domain resolves to, and a self-chosen department is
 * never applied to the account before an approver confirms it.
 */
export function SignupForm({ onSent, onExisting }: { onSent: (email: string) => void; onExisting: () => void }) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [otherDept, setOtherDept] = React.useState("");
  const [designation, setDesignation] = React.useState("");
  const [employeeRef, setEmployeeRef] = React.useState("");
  const [manager, setManager] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [accepted, setAccepted] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [checking, setChecking] = React.useState(false);

  // Ask once the address looks complete; the newest answer wins.
  const domain = email.includes("@") ? email.split("@")[1]?.trim().toLowerCase() || "" : "";
  React.useEffect(() => {
    if (!domain || !domain.includes(".") || domain.endsWith(".")) {
      // Nothing to look up yet. Clearing happens in a timeout so it never runs synchronously in the effect body.
      const t = setTimeout(() => { setPreview(null); setChecking(false); }, 0);
      return () => clearTimeout(t);
    }
    let alive = true;
    const t = setTimeout(async () => {
      setChecking(true);
      const { data } = await createClient().rpc("registration_preview", { p_email: `x@${domain}` });
      if (!alive) return;
      setChecking(false);
      setPreview((data as Preview | null) ?? null);
      setDepartmentId("");
    }, 450);
    return () => { alive = false; clearTimeout(t); };
  }, [domain]);

  const departments = preview?.departments || [];
  const needPhone = !!preview?.require_phone;
  const needEmployeeId = !!preview?.require_employee_id;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (name.trim().length < 2) return setErr("Enter your full name.");
    if (password.length < 8) return setErr("Use a password of at least 8 characters.");
    if (needPhone && !phone.trim()) return setErr(`${preview?.company || "Your company"} asks for a mobile number.`);
    if (needEmployeeId && !employeeRef.trim()) return setErr(`${preview?.company || "Your company"} asks for your employee ID.`);
    if (!accepted) return setErr("Please accept the company policies and terms to continue.");

    setLoading(true);
    const realDept = departmentId && departmentId !== OTHER ? departmentId : "";
    const { data, error } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Without this the confirmation link points at the project's Site URL, whichever host the person signed up on.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
        data: {
          full_name: name.trim(),
          department_id: realDept || undefined,
          requested_department: !realDept && otherDept.trim() ? otherDept.trim() : undefined,
          designation: designation.trim() || undefined,
          employee_ref: employeeRef.trim() || undefined,
          manager: manager.trim() || undefined,
          phone: phone.trim() || undefined,
          policies_accepted: true,
        },
      },
    });
    setLoading(false);
    if (error) return setErr(authErrorMessage(error.message, { email }));
    /*
      An address that already has an account gets a 200 with a fake user and NO email (Supabase hides which
      addresses exist). The tell is an empty `identities` array.
    */
    if (data.user && !data.session && (data.user.identities?.length ?? 0) === 0) {
      onExisting();
      return;
    }
    if (data.session) {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
      return;
    }
    onSent(email.trim());
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Full name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Your name" autoComplete="name" maxLength={120} />
      </Field>
      <Field label="Official company email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com" autoComplete="email" />
      </Field>

      <CompanyNotice preview={preview} checking={checking} />

      <Field label="Password">
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters" autoComplete="new-password" />
      </Field>

      {departments.length > 0 ? (
        <Field label="Department" hint="Your company's administrators confirm this before it takes effect.">
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">Choose a department…</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            <option value={OTHER}>My department isn’t listed</option>
          </Select>
        </Field>
      ) : null}
      {(departments.length === 0 || departmentId === OTHER) && (
        <Field label={departments.length === 0 ? "Department (optional)" : "Your department"} hint="If it is not set up yet, you will be placed once it is.">
          <Input value={otherDept} onChange={(e) => setOtherDept(e.target.value)} placeholder="e.g. Content & Digital Marketing" maxLength={80} />
        </Field>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Designation (optional)">
          <Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Sales Executive" maxLength={80} />
        </Field>
        <Field label={needEmployeeId ? "Employee ID" : "Employee ID (if assigned)"}>
          <Input value={employeeRef} onChange={(e) => setEmployeeRef(e.target.value)} required={needEmployeeId} placeholder="e.g. EMP-0042" maxLength={40} />
        </Field>
        <Field label="Reporting manager (optional)">
          <Input value={manager} onChange={(e) => setManager(e.target.value)} placeholder="Name or work email" maxLength={120} />
        </Field>
        <Field label={needPhone ? "Mobile number" : "Mobile number (optional)"}>
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required={needPhone} placeholder="+91…" autoComplete="tel" maxLength={32} />
        </Field>
      </div>

      <label className="flex items-start gap-2 text-xs text-2 cursor-pointer select-none">
        <input type="checkbox" className="mt-0.5" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} required />
        <span>I confirm this is my official work email, and I accept my company’s policies and the GHL ONE terms of use.</span>
      </label>

      {err && <div className="text-sm text-danger" role="alert">{err}</div>}
      <Button type="submit" variant="primary" size="lg" className="w-full mt-1" loading={loading}>Create account</Button>
      <p className="text-[11px] text-muted text-center">We will email you a link to verify your address. Nothing is shared with your company until you do.</p>
    </form>
  );
}

/** One line under the email field: which company this address belongs to, and what happens next. */
function CompanyNotice({ preview, checking }: { preview: Preview | null; checking: boolean }) {
  if (checking) return <div className="text-xs text-muted -mt-1">Checking your company…</div>;
  if (!preview || !preview.valid) return null;

  let icon = <Building2 size={15} className="text-[var(--brand-2)] shrink-0 mt-[1px]" />;
  let title = "";
  let body = "";
  if (preview.recognized) {
    title = preview.company || "Your company";
    if (preview.workspace === "ready" && preview.auto_approve) {
      icon = <ShieldCheck size={15} className="text-[var(--success)] shrink-0 mt-[1px]" />;
      body = "Recognised. Once you confirm your email you can sign straight in.";
    } else if (preview.workspace === "ready") {
      body = "Recognised. After you confirm your email, your company’s administrators approve your access.";
    } else if (preview.workspace === "preparing") {
      icon = <Clock3 size={15} className="text-[var(--warn)] shrink-0 mt-[1px]" />;
      body = "Your company’s workspace is being prepared. Register now and we will keep your place.";
    } else {
      icon = <Clock3 size={15} className="text-[var(--warn)] shrink-0 mt-[1px]" />;
      body = "Your company is not on GHL ONE yet. Register now: your account is kept safe and you will be told when it is ready.";
    }
  } else {
    icon = <CircleAlert size={15} className="text-[var(--warn)] shrink-0 mt-[1px]" />;
    title = preview.public_provider ? "Personal email address" : "Company not recognised";
    body = preview.public_provider
      ? "Please use your official company email if you have one. Otherwise an administrator has to approve you before you can sign in."
      : "We do not recognise this company domain yet. You can still register; an administrator reviews the request.";
  }
  return (
    <div className="sunken rounded-[var(--radius-sm)] px-3 py-2 flex items-start gap-2 -mt-1" aria-live="polite">
      {icon}
      <div className="min-w-0">
        <div className="text-xs font-medium truncate">{title}</div>
        <div className="text-[11px] text-muted">{body}</div>
      </div>
    </div>
  );
}
