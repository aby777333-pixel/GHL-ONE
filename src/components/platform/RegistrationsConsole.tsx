"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRightLeft, Building2, CheckCircle2, Globe, Link2, Plus, RefreshCw, Search, Settings2, ShieldCheck, UserCheck, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Field, Input, Modal, Pill, SearchInput, Select, Skeleton, Tabs, Textarea, useToast } from "@/components/ui";
import { fmtDate, ROLE_LABEL, type RoleLevel } from "@/lib/utils";
import { STATUS_LABEL, STATUS_ORDER, STATUS_TONE, statusKey, type AccountStatusKey } from "@/lib/accountStatus";

/* ------------------------------------------------------------------ types (platform_registrations) */

type Domain = {
  id: string;
  domain: string;
  company_name: string;
  org_id: string | null;
  org_name: string | null;
  org_status: string | null;
  status: "active" | "disabled";
  verified: boolean;
  verification_method: "dns" | "owner_attested" | null;
  verification_token: string;
  verified_at: string | null;
  verified_label: string | null;
  verification_note: string | null;
  auto_approve: boolean;
  notes: string | null;
  registrations: number;
  waiting: number;
};

type Registration = {
  user_id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  org_id: string | null;
  domain: string;
  recognized: boolean;
  via: string;
  designation: string | null;
  employee_ref: string | null;
  phone: string | null;
  manager_name: string | null;
  requested_department: string | null;
  department: string | null;
  status: string;
  decision_note: string | null;
  has_profile: boolean;
  created_at: string;
  email_verified_at: string | null;
};

type Company = {
  id: string;
  name: string;
  status: string;
  tenant_code: string | null;
  available: boolean;
  settings: { require_phone: boolean; require_employee_id: boolean; show_departments: boolean; reminder_days: number };
  departments: { id: string; name: string }[];
};

type Data = { domains: Domain[]; registrations: Registration[]; companies: Company[] };
type Section = "registrations" | "domains" | "people" | "rules";

const ROLES: RoleLevel[] = ["director", "executive", "department_head", "manager", "team_lead", "employee", "intern", "consultant", "vendor", "guest"];

/**
 * Platform → Registrations (0078). Owner-only: the page re-checks ownership on the server and every
 * RPC behind this checks `is_platform_owner()` again, so nothing here is a control on its own.
 *
 * Four jobs: which domains belong to which company (and whether ownership is proven), who has
 * registered and what state they are in, a person's access across companies, and each company's
 * registration rules.
 */
export function RegistrationsConsole() {
  const toast = useToast();
  const [data, setData] = React.useState<Data | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [section, setSection] = React.useState<Section>("registrations");

  const load = React.useCallback(async () => {
    const { data: d, error: e } = await createClient().rpc("platform_registrations");
    if (e) { setError(e.message); return; }
    setError(null);
    setData(d as unknown as Data);
  }, []);

  React.useEffect(() => {
    let alive = true;
    createClient().rpc("platform_registrations").then(({ data: d, error: e }) => {
      if (!alive) return;
      if (e) setError(e.message);
      else setData(d as unknown as Data);
    });
    return () => { alive = false; };
  }, []);

  const run = React.useCallback(async (p: PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    const { error: e } = await p;
    if (e) { toast.push(e.message, "danger"); return false; }
    toast.push(ok, "success");
    await load();
    return true;
  }, [load, toast]);

  if (error) return <Card className="p-[var(--s4)] text-sm text-danger">{error}</Card>;
  if (!data) return <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-40" /></div>;

  const waitingNoCompany = data.registrations.filter((r) => r.status === "awaiting_company").length;
  const pending = data.registrations.filter((r) => r.status === "pending_approval" || r.status === "pending_department").length;

  return (
    <div className="space-y-[var(--s3)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          value={section}
          onChange={setSection}
          tabs={[
            { key: "registrations", label: <span className="inline-flex items-center gap-1.5"><Users size={14} /> Registrations</span>, count: data.registrations.length },
            { key: "domains", label: <span className="inline-flex items-center gap-1.5"><Globe size={14} /> Domains</span>, count: data.domains.length },
            { key: "people", label: <span className="inline-flex items-center gap-1.5"><ArrowRightLeft size={14} /> Across companies</span> },
            { key: "rules", label: <span className="inline-flex items-center gap-1.5"><Settings2 size={14} /> Rules</span> },
          ]}
        />
        <Button size="sm" variant="ghost" onClick={load}><RefreshCw size={13} /> Refresh</Button>
      </div>

      {(waitingNoCompany > 0 || pending > 0) && (
        <Card className="px-[var(--s4)] py-[var(--s3)] text-sm flex flex-wrap gap-x-4 gap-y-1">
          {waitingNoCompany > 0 && <span><b>{waitingNoCompany}</b> waiting for their company to be activated</span>}
          {pending > 0 && <span><b>{pending}</b> waiting for approval inside their company</span>}
        </Card>
      )}

      {section === "registrations" && <RegistrationList data={data} run={run} />}
      {section === "domains" && <DomainList data={data} run={run} reload={load} />}
      {section === "people" && <PeopleAcross data={data} run={run} />}
      {section === "rules" && <RulesList data={data} run={run} />}
    </div>
  );
}

type Run = (p: PromiseLike<{ error: { message: string } | null }>, ok: string) => Promise<boolean>;

/* ------------------------------------------------------------------ registrations */

function RegistrationList({ data, run }: { data: Data; run: Run }) {
  const [filter, setFilter] = React.useState<AccountStatusKey | "all">("all");
  const [q, setQ] = React.useState("");
  const [acting, setActing] = React.useState<{ r: Registration; action: string } | null>(null);

  const counts = new Map<string, number>();
  for (const r of data.registrations) counts.set(r.status, (counts.get(r.status) || 0) + 1);
  const rows = data.registrations.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    const t = q.trim().toLowerCase();
    return !t || [r.email, r.full_name, r.company, r.domain].some((v) => (v || "").toLowerCase().includes(t));
  });

  return (
    <Card className="min-w-0">
      <div className="p-[var(--s3)] flex flex-wrap items-center gap-1.5 border-b">
        <button type="button" onClick={() => setFilter("all")} className={`pill pill-lg ${filter === "all" ? "tone-info" : "tone-neutral"}`}>All · {data.registrations.length}</button>
        {STATUS_ORDER.filter((k) => counts.get(k)).map((k) => (
          <button key={k} type="button" onClick={() => setFilter(filter === k ? "all" : k)} className={`pill pill-lg ${filter === k ? STATUS_TONE[k] : "tone-neutral"}`}>
            {STATUS_LABEL[k]} · {counts.get(k)}
          </button>
        ))}
        <SearchInput className="w-full sm:w-[240px] sm:ml-auto" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, company…" />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Users size={20} />} title={data.registrations.length ? "Nobody matches" : "No registrations yet"} hint="Self sign-ups from now on appear here with their company and status." />
      ) : (
        <div className="divide-y">
          {rows.map((r) => {
            const k = statusKey(r.status);
            return (
              <div key={r.user_id} className="px-[var(--s4)] py-3 flex flex-col lg:flex-row lg:items-center gap-2 min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium truncate">{r.full_name || r.email}</span>
                    <Pill tone={STATUS_TONE[k]}>{STATUS_LABEL[k]}</Pill>
                    {!r.recognized && <Pill tone="tone-neutral" title="The email domain is not mapped to a company">Unrecognised domain</Pill>}
                  </div>
                  <div className="text-xs text-muted truncate">
                    {r.email} · {r.company || "No company"} · registered {fmtDate(r.created_at)}{r.email_verified_at ? "" : " · email not verified"}
                  </div>
                  <div className="text-xs text-muted truncate">
                    {[r.designation, r.employee_ref && `ID ${r.employee_ref}`, r.phone, r.manager_name && `Reports to ${r.manager_name}`,
                      r.department ? `Dept: ${r.department}` : r.requested_department ? `Asked for: ${r.requested_department}` : null].filter(Boolean).join(" · ") || "No extra details"}
                  </div>
                  {r.decision_note && <div className="text-xs text-danger truncate">Reason: {r.decision_note}</div>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {!r.has_profile && k !== "rejected" && <Button size="xs" variant="ghost" onClick={() => setActing({ r, action: "reject" })}>Reject</Button>}
                  {!r.has_profile && k === "rejected" && <Button size="xs" variant="ghost" onClick={() => run(createClient().rpc("platform_account_action", { p_user: r.user_id, p_action: "reopen" }), "Registration reopened")}>Reopen</Button>}
                  {r.has_profile && (k === "pending_approval" || k === "pending_department" || k === "awaiting_company") && (
                    <>
                      <Button size="xs" variant="ghost" onClick={() => setActing({ r, action: "reject" })}>Reject</Button>
                      <Button size="xs" variant="primary" onClick={() => setActing({ r, action: "approve" })}><UserCheck size={13} /> Approve</Button>
                    </>
                  )}
                  {r.has_profile && k === "rejected" && <Button size="xs" variant="ghost" onClick={() => setActing({ r, action: "approve" })}>Approve anyway</Button>}
                  {r.has_profile && k === "active" && (
                    <>
                      <Button size="xs" variant="ghost" onClick={() => setActing({ r, action: "move_department" })}>Move department</Button>
                      <Button size="xs" variant="ghost" onClick={() => setActing({ r, action: "suspend" })}>Suspend</Button>
                      <Button size="xs" variant="ghost" onClick={() => setActing({ r, action: "deactivate" })}>Deactivate</Button>
                    </>
                  )}
                  {r.has_profile && (k === "suspended" || k === "deactivated") && <Button size="xs" variant="secondary" onClick={() => setActing({ r, action: "reactivate" })}>Reactivate</Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {acting && <ActionModal key={acting.r.user_id + acting.action} r={acting.r} action={acting.action} data={data} run={run} onClose={() => setActing(null)} />}
    </Card>
  );
}

const ACTION_TITLE: Record<string, string> = {
  approve: "Approve", reject: "Reject", suspend: "Suspend", deactivate: "Deactivate", reactivate: "Reactivate", move_department: "Move department",
};

function ActionModal({ r, action, data, run, onClose }: { r: Registration; action: string; data: Data; run: Run; onClose: () => void }) {
  const company = data.companies.find((c) => c.id === r.org_id);
  const [reason, setReason] = React.useState("");
  const [dept, setDept] = React.useState("");
  const [role, setRole] = React.useState<RoleLevel>("employee");
  const [designation, setDesignation] = React.useState(r.designation || "");
  const [busy, setBusy] = React.useState(false);
  const needsDept = action === "move_department";
  const needsReason = action !== "approve" && action !== "reactivate";

  async function go() {
    setBusy(true);
    const ok = await run(
      createClient().rpc("platform_account_action", {
        p_user: r.user_id,
        p_action: action,
        p_reason: reason.trim() || undefined,
        p_department: dept || undefined,
        p_role: action === "approve" ? role : undefined,
        p_designation: action === "approve" ? designation.trim() || undefined : undefined,
      }),
      `${ACTION_TITLE[action]}: ${r.full_name || r.email}`,
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${ACTION_TITLE[action]} ${r.full_name || r.email}`}
      width={500}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={action === "approve" || action === "reactivate" ? "primary" : "danger"} onClick={go} loading={busy} disabled={(needsDept && !dept) || (needsReason && reason.trim().length < 3)}>{ACTION_TITLE[action]}</Button></>}
    >
      <div className="space-y-3 text-sm">
        <p className="text-muted">
          {r.email} · {r.company || "No company"}. The person is told by email and in GHL ONE, and the action is written to the platform audit log.
        </p>
        {(action === "approve" || action === "move_department") && (
          <Field label="Department" hint={r.requested_department ? `They asked for “${r.requested_department}”.` : undefined}>
            <Select value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">{action === "approve" ? "Keep what they asked for" : "Choose a department…"}</option>
              {(company?.departments || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
        )}
        {action === "approve" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Access level"><Select value={role} onChange={(e) => setRole(e.target.value as RoleLevel)}>{ROLES.map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}</Select></Field>
            <Field label="Designation"><Input value={designation} onChange={(e) => setDesignation(e.target.value)} /></Field>
          </div>
        )}
        {action === "approve" && company && !company.available && (
          <div className="rounded-[var(--radius-sm)] tone-warn px-3 py-2 text-xs">{company.name} is not active yet. Approving lets this person in before the rest of the company.</div>
        )}
        <Field label={needsReason ? "Reason" : "Note (optional)"} hint={action === "reject" ? "They see this." : "Kept in the audit log."}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </Field>
        {action === "approve" && <p className="text-[11px] text-muted">Access level is the chain of command, not permissions. Permissions come from security roles in Access Control.</p>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ domains */

function DomainList({ data, run, reload }: { data: Data; run: Run; reload: () => Promise<void> }) {
  const [adding, setAdding] = React.useState(false);
  const [linking, setLinking] = React.useState<Domain | null>(null);
  const [verifying, setVerifying] = React.useState<Domain | null>(null);

  return (
    <Card className="min-w-0">
      <CardHeader
        title="Company email domains"
        subtitle="A verified, enabled domain identifies a person's company at registration. Being on a domain never grants access on its own."
        action={<Button size="sm" variant="primary" onClick={() => setAdding(true)}><Plus size={14} /> Add domain</Button>}
      />
      <div className="divide-y border-t">
        {data.domains.map((d) => (
          <div key={d.id} className="px-[var(--s4)] py-3 flex flex-col lg:flex-row lg:items-center gap-2 min-w-0">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold">@{d.domain}</span>
                {d.verified ? <Pill tone="tone-success" title={d.verification_note || undefined}><CheckCircle2 size={11} /> Verified{d.verification_method === "dns" ? " by DNS" : " by owner"}</Pill> : <Pill tone="tone-warn">Not verified</Pill>}
                {d.status === "disabled" && <Pill tone="tone-neutral">Disabled</Pill>}
                {d.auto_approve && <Pill tone="tone-info" title="A verified address is admitted on arrival, without an approver">Trusted: admits on arrival</Pill>}
              </div>
              <div className="text-xs text-muted truncate">
                {d.org_id ? <>Company: <Link className="link" href={`/platform/${d.org_id}`}>{d.org_name}</Link> ({d.org_status})</> : <>Company: {d.company_name} · <span className="text-warn">not on GHL ONE yet</span></>}
                {" · "}{d.registrations} registered{d.waiting ? `, ${d.waiting} waiting` : ""}
              </div>
              {d.notes && <div className="text-xs text-muted truncate">{d.notes}</div>}
            </div>
            <div className="flex flex-wrap gap-1.5 shrink-0">
              <Button size="xs" variant="ghost" onClick={() => setLinking(d)}><Link2 size={12} /> {d.org_id ? "Change company" : "Link to company"}</Button>
              <Button size="xs" variant="ghost" onClick={() => setVerifying(d)}><ShieldCheck size={12} /> {d.verified ? "Verification" : "Verify"}</Button>
              <Button size="xs" variant="ghost" onClick={() => run(createClient().rpc("upsert_company_domain", { p_domain: d.domain, p_company_name: d.company_name, p_auto_approve: !d.auto_approve, p_notes: d.notes || undefined, p_status: d.status }), d.auto_approve ? "Approval required again" : "Trusted provisioning on")}>
                {d.auto_approve ? "Require approval" : "Trust (admit on arrival)"}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => run(createClient().rpc("upsert_company_domain", { p_domain: d.domain, p_company_name: d.company_name, p_auto_approve: d.auto_approve, p_notes: d.notes || undefined, p_status: d.status === "active" ? "disabled" : "active" }), d.status === "active" ? "Domain disabled" : "Domain enabled")}>
                {d.status === "active" ? "Disable" : "Enable"}
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div className="px-[var(--s4)] py-3 border-t text-xs text-muted">
        Creating a company in the onboarding wizard with one of these domains links it automatically, and everybody waiting on that domain moves into the new company&apos;s approval queue.
      </div>
      {adding && <AddDomainModal run={run} onClose={() => setAdding(false)} />}
      {linking && <LinkModal d={linking} data={data} run={run} onClose={() => setLinking(null)} />}
      {verifying && <VerifyModal d={verifying} run={run} reload={reload} onClose={() => setVerifying(null)} />}
    </Card>
  );
}

function AddDomainModal({ run, onClose }: { run: Run; onClose: () => void }) {
  const [domain, setDomain] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function go() {
    setBusy(true);
    const ok = await run(createClient().rpc("upsert_company_domain", { p_domain: domain, p_company_name: company, p_auto_approve: false, p_notes: notes.trim() || undefined }), "Domain added. Verify it before sign-ups on it are recognised.");
    setBusy(false);
    if (ok) onClose();
  }
  return (
    <Modal open onClose={onClose} title="Add a company domain" width={480}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go} loading={busy} disabled={!domain.trim() || company.trim().length < 2}>Add domain</Button></>}>
      <div className="space-y-3">
        <Field label="Domain" hint="Just the part after @, e.g. company.com. Public providers such as gmail.com are refused."><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="company.com" /></Field>
        <Field label="Company name" hint="Use the same name for every domain of one company: they are linked together."><Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company name" /></Field>
        <Field label="Notes (optional)"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
        <p className="text-[11px] text-muted">New domains start unverified and not trusted: nobody is recognised by it until you verify it, and nobody is admitted by it without an approver unless you choose to trust it.</p>
      </div>
    </Modal>
  );
}

function LinkModal({ d, data, run, onClose }: { d: Domain; data: Data; run: Run; onClose: () => void }) {
  const [org, setOrg] = React.useState(d.org_id || "");
  const [aliases, setAliases] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const siblings = data.domains.filter((x) => x.id !== d.id && !x.org_id && x.company_name.trim().toLowerCase() === d.company_name.trim().toLowerCase());
  async function go() {
    setBusy(true);
    const ok = await run(createClient().rpc("link_company_domain", { p_id: d.id, p_org: org || (null as unknown as string), p_include_aliases: aliases }), org ? "Linked. Waiting registrations moved into the company." : "Unlinked");
    setBusy(false);
    if (ok) onClose();
  }
  return (
    <Modal open onClose={onClose} title={`Link @${d.domain} to a company`} width={480}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go} loading={busy} disabled={org === (d.org_id || "")}>{org ? "Link" : "Unlink"}</Button></>}>
      <div className="space-y-3 text-sm">
        <Field label="Company">
          <Select value={org} onChange={(e) => setOrg(e.target.value)}>
            <option value="">Not on GHL ONE (registrations wait)</option>
            {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.status}</option>)}
          </Select>
        </Field>
        {siblings.length > 0 && org && (
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={aliases} onChange={(e) => setAliases(e.target.checked)} className="mt-0.5" />
            <span>Also link {siblings.map((s) => "@" + s.domain).join(", ")} (same company name).</span>
          </label>
        )}
        <p className="text-xs text-muted">
          {d.waiting > 0 && org ? `${d.waiting} waiting registration${d.waiting === 1 ? "" : "s"} will move into this company and enter its approval queue (or wait for its activation). ` : ""}
          Unlinking only affects future sign-ups; people already moved stay in their company.
        </p>
        {!data.companies.length && <p className="text-xs">No companies yet. <Link href="/platform/new" className="link">Onboard one</Link>.</p>}
      </div>
    </Modal>
  );
}

function VerifyModal({ d, run, reload, onClose }: { d: Domain; run: Run; reload: () => Promise<void>; onClose: () => void }) {
  const toast = useToast();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [dns, setDns] = React.useState<{ found: boolean; checked: string[]; records: string[] } | null>(null);
  const record = `ghl-one-verify=${d.verification_token}`;

  async function checkDns() {
    setBusy("dns");
    const res = await fetch("/api/platform/domains/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: d.id }) });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { toast.push(body.error || "The check failed", "danger"); return; }
    setDns(body);
    if (body.found) { toast.push(`@${d.domain} verified by DNS`, "success"); await reload(); onClose(); }
  }
  async function attest() {
    setBusy("attest");
    const ok = await run(createClient().rpc("verify_company_domain", { p_id: d.id, p_method: "owner_attested", p_note: note }), `@${d.domain} verified`);
    setBusy(null);
    if (ok) onClose();
  }
  async function unverify() {
    setBusy("un");
    const ok = await run(createClient().rpc("verify_company_domain", { p_id: d.id, p_method: null as unknown as string, p_note: note || undefined }), `@${d.domain} is no longer recognised`);
    setBusy(null);
    if (ok) onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Verify @${d.domain}`} width={540} footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      <div className="space-y-4 text-sm">
        {d.verified && (
          <div className="rounded-[var(--radius-sm)] tone-success px-3 py-2 text-xs">
            Verified {d.verification_method === "dns" ? "by DNS" : "by owner attestation"}{d.verified_label ? ` · ${d.verified_label}` : ""}{d.verified_at ? ` · ${fmtDate(d.verified_at)}` : ""}.
            {d.verification_note ? ` “${d.verification_note}”` : ""}
          </div>
        )}
        <div>
          <div className="font-medium">Prove ownership with DNS (recommended)</div>
          <p className="text-xs text-muted mt-1">Ask whoever runs the company&apos;s DNS to add this TXT record to <b>{d.domain}</b> or <b>_ghl-one.{d.domain}</b>, then check:</p>
          <code className="block sunken rounded-[var(--radius-sm)] px-3 py-2 mt-2 text-xs break-all select-all">{record}</code>
          <Button size="sm" className="mt-2" onClick={checkDns} loading={busy === "dns"}><Search size={13} /> Check DNS now</Button>
          {dns && !dns.found && (
            <div className="text-xs text-muted mt-2">Not found yet at {dns.checked.join(" or ")}.{dns.records.length ? ` Records seen: ${dns.records.slice(0, 4).join(" | ")}` : " No TXT records were returned."} DNS changes can take a while to appear.</div>
          )}
        </div>
        <div className="border-t pt-3">
          <div className="font-medium">Or record your own attestation</div>
          <p className="text-xs text-muted mt-1">For a domain you know belongs to the company. Your name and reason go into the audit log.</p>
          <Textarea className="mt-2" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Confirmed with the company's director; it is on their website and invoices." />
          <div className="flex flex-wrap gap-2 mt-2">
            <Button size="sm" variant="primary" onClick={attest} loading={busy === "attest"} disabled={note.trim().length < 8}>Mark as verified</Button>
            {d.verified && <Button size="sm" variant="danger" onClick={unverify} loading={busy === "un"}>Stop recognising this domain</Button>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ across companies */

type PersonAccess = {
  user_id: string;
  full_name: string;
  email: string;
  home_org: string;
  status: string;
  department: string | null;
  memberships: { org_id: string; name: string; role: RoleLevel; status: string; home: boolean }[];
};

function PeopleAcross({ data, run }: { data: Data; run: Run }) {
  const toast = useToast();
  const [email, setEmail] = React.useState("");
  const [person, setPerson] = React.useState<PersonAccess | null | undefined>(undefined);
  const [busy, setBusy] = React.useState(false);
  const [mode, setMode] = React.useState<"grant" | "transfer" | null>(null);

  async function lookup(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    const { data: d, error } = await createClient().rpc("platform_person_access", { p_email: email.trim() });
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    setPerson((d as unknown as PersonAccess | null) ?? null);
  }
  async function wrap(p: PromiseLike<{ error: { message: string } | null }>, ok: string) {
    const done = await run(p, ok);
    if (done) { setMode(null); await lookup(); }
    return done;
  }

  return (
    <Card className="p-[var(--s4)] space-y-3 min-w-0">
      <div>
        <div className="text-sm font-semibold">One person, several companies</div>
        <p className="text-xs text-muted mt-0.5">A single login can belong to more than one company. Each membership is explicit, permissions stay separate per company, and the person switches with the workspace switcher.</p>
      </div>
      <form onSubmit={lookup} className="flex gap-2">
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@company.com" type="email" />
        <Button type="submit" loading={busy}><Search size={14} /> Look up</Button>
      </form>
      {person === null && <div className="text-sm text-muted">Nobody with that email has a profile yet. If they registered for a company that is not on GHL ONE, they are under Registrations.</div>}
      {person && (
        <div className="space-y-3">
          <div className="text-sm"><b>{person.full_name}</b> · {person.email} · <Pill tone={STATUS_TONE[statusKey(person.status)]}>{STATUS_LABEL[statusKey(person.status)]}</Pill>{person.department ? ` · ${person.department}` : ""}</div>
          <div className="divide-y rounded-[var(--radius)] border">
            {person.memberships.map((m) => (
              <div key={m.org_id} className="px-3 py-2 flex flex-wrap items-center gap-2 text-sm">
                <Building2 size={14} className="text-muted" />
                <span className="font-medium">{m.name}</span>
                {m.home && <Pill tone="tone-info">Home company</Pill>}
                <Pill tone={m.status === "active" ? "tone-success" : "tone-neutral"}>{m.status}</Pill>
                <span className="text-xs text-muted">{ROLE_LABEL[m.role] || m.role}</span>
                {!m.home && m.status === "active" && (
                  <Button size="xs" variant="ghost" className="ml-auto" onClick={() => {
                    const reason = window.prompt(`Why remove ${person.full_name}'s access to ${m.name}? (at least 8 characters)`) || "";
                    if (reason.trim().length >= 8) wrap(createClient().rpc("platform_set_membership", { p_user: person.user_id, p_org: m.org_id, p_role: m.role, p_active: false, p_reason: reason }), "Access removed");
                  }}>Remove access</Button>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setMode("grant")}><Plus size={13} /> Give access to another company</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("transfer")}><ArrowRightLeft size={13} /> Transfer home company</Button>
          </div>
          {mode && <CrossCompanyModal mode={mode} person={person} data={data} onSubmit={wrap} onClose={() => setMode(null)} />}
        </div>
      )}
    </Card>
  );
}

function CrossCompanyModal({ mode, person, data, onSubmit, onClose }: {
  mode: "grant" | "transfer"; person: PersonAccess; data: Data;
  onSubmit: (p: PromiseLike<{ error: { message: string } | null }>, ok: string) => Promise<boolean>; onClose: () => void;
}) {
  const [org, setOrg] = React.useState("");
  const [role, setRole] = React.useState<RoleLevel>("employee");
  const [dept, setDept] = React.useState("");
  const [keep, setKeep] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const choices = data.companies.filter((c) => c.id !== person.home_org);
  const target = data.companies.find((c) => c.id === org);
  async function go() {
    setBusy(true);
    await onSubmit(
      mode === "grant"
        ? createClient().rpc("platform_set_membership", { p_user: person.user_id, p_org: org, p_role: role, p_active: true, p_reason: reason })
        : createClient().rpc("platform_transfer_company", { p_user: person.user_id, p_org: org, p_department: dept || undefined, p_keep_access: keep, p_reason: reason }),
      mode === "grant" ? "Access granted" : "Transferred",
    );
    setBusy(false);
  }
  return (
    <Modal open onClose={onClose} width={480} title={mode === "grant" ? `Give ${person.full_name} access to another company` : `Transfer ${person.full_name} to another company`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go} loading={busy} disabled={!org || reason.trim().length < 8}>{mode === "grant" ? "Give access" : "Transfer"}</Button></>}>
      <div className="space-y-3">
        <Field label="Company"><Select value={org} onChange={(e) => setOrg(e.target.value)}><option value="">Choose…</option>{choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        {mode === "grant" ? (
          <Field label="Access level in that company"><Select value={role} onChange={(e) => setRole(e.target.value as RoleLevel)}>{ROLES.map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}</Select></Field>
        ) : (
          <>
            <Field label="Department in the new company"><Select value={dept} onChange={(e) => setDept(e.target.value)}><option value="">Assign later</option>{(target?.departments || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
            <label className="flex items-start gap-2 text-xs cursor-pointer"><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="mt-0.5" /><span>Keep their access to the current company as a second workspace</span></label>
            <p className="text-[11px] text-muted">Their manager and team are cleared. Security roles from the old company stop applying, because roles only count inside the company that owns them.</p>
          </>
        )}
        <Field label="Reason" hint="At least 8 characters. Written to the platform audit log."><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ rules */

function RulesList({ data, run }: { data: Data; run: Run }) {
  return (
    <Card className="min-w-0">
      <CardHeader title="Registration rules per company" subtitle="What each company asks for when somebody registers, and how often approvers are reminded." />
      <div className="divide-y border-t">
        {data.companies.map((c) => <RuleRow key={c.id} c={c} run={run} />)}
      </div>
    </Card>
  );
}

function RuleRow({ c, run }: { c: Company; run: Run }) {
  const [v, setV] = React.useState(c.settings);
  const [busy, setBusy] = React.useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(c.settings);
  async function save() {
    setBusy(true);
    await run(createClient().rpc("set_registration_settings", { p_org: c.id, p_settings: v }), `${c.name}: rules saved`);
    setBusy(false);
  }
  const box = (k: "require_phone" | "require_employee_id" | "show_departments", label: string) => (
    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
      <input type="checkbox" checked={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} /> {label}
    </label>
  );
  return (
    <div className="px-[var(--s4)] py-3 flex flex-col lg:flex-row lg:items-center gap-3">
      <div className="min-w-0 lg:w-56">
        <div className="text-sm font-medium truncate">{c.name}</div>
        <div className="text-xs text-muted">{c.status}{c.available ? "" : " · not accepting admissions yet"}</div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 flex-1">
        {box("require_phone", "Mobile number required")}
        {box("require_employee_id", "Employee ID required")}
        {box("show_departments", "Show departments at sign-up")}
        <label className="flex items-center gap-1.5 text-xs">
          Remind approvers after
          <Input type="number" min={0} max={30} className="!w-16 !py-1" value={v.reminder_days} onChange={(e) => setV({ ...v, reminder_days: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })} />
          days (0 = never)
        </label>
      </div>
      <Button size="sm" variant="primary" onClick={save} loading={busy} disabled={!dirty}>Save</Button>
    </div>
  );
}
