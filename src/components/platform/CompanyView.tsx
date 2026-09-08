"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity, ArrowLeft, BadgeCheck, Building2, CheckCircle2, ChevronRight, Circle, Crown, ExternalLink, KeyRound, ListChecks, LogIn,
  ScrollText, Settings2, ShieldAlert, ShieldCheck, Sliders, TriangleAlert, Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, EmptyState, Field, Modal, Pill, Progress, Tabs, Textarea, useToast } from "@/components/ui";
import { cn, fmtDate, humanize } from "@/lib/utils";
import { BreakGlassBanner, BreakGlassDialog } from "./BreakGlassDialog";
import { CompanyConfig } from "./CompanyConfig";
import { FeatureMatrix } from "./FeatureMatrix";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { UsagePanel } from "./UsagePanel";
import { IsolationReport } from "./IsolationReport";
import {
  canChangeStatus, countdown, fmtMb, fmtNum, isFuture, LIFECYCLE_ACTIONS, rpcError, setupScore, SETUP_LABEL,
  STATUS_HINT, STATUS_LABEL, STATUS_TONE, type CompanyDetail,
} from "./lib";

type Tab = "overview" | "admins" | "departments" | "usage" | "features" | "security" | "onboarding" | "audit" | "configuration";

/** One company, seen from the platform (§70). Administrative metadata only — never the company's content. */
export function CompanyView({ detail, platformRole, created }: { detail: CompanyDetail; platformRole: string | null; created?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = React.useState<Tab>(created ? "onboarding" : "overview");
  const [bgOpen, setBgOpen] = React.useState(false);
  const [lifecycle, setLifecycle] = React.useState<string | null>(null);
  const [entering, setEntering] = React.useState(false);

  const c = detail.company;
  const setup = detail.setup;
  const score = setupScore(setup);
  const canStatus = canChangeStatus(platformRole);
  const blockers = setup?.blockers || [];
  const openBg = (detail.break_glass || []).filter((b) => !b.ended_at && isFuture(b.expires_at));

  async function enterWorkspace() {
    setEntering(true);
    const { error } = await createClient().rpc("set_active_workspace", { p_org: c.id, p_reason: `Opened ${c.name} from the platform command center` });
    setEntering(false);
    if (error) {
      toast.push(rpcError(error.message), "danger");
      return;
    }
    toast.push(`You are now in ${c.name}`, "success");
    router.push("/");
    router.refresh();
  }

  const tabs: { key: Tab; label: React.ReactNode; count?: number }[] = [
    { key: "overview", label: <span className="inline-flex items-center gap-1.5"><Activity size={14} /> Overview</span> },
    { key: "admins", label: <span className="inline-flex items-center gap-1.5"><Crown size={14} /> Admins</span>, count: detail.admins.length || undefined },
    { key: "departments", label: <span className="inline-flex items-center gap-1.5"><Building2 size={14} /> Departments</span>, count: detail.departments.length || undefined },
    { key: "usage", label: <span className="inline-flex items-center gap-1.5"><Sliders size={14} /> Usage</span> },
    { key: "features", label: <span className="inline-flex items-center gap-1.5"><Settings2 size={14} /> Features</span> },
    { key: "security", label: <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} /> Security</span>, count: openBg.length || undefined },
    { key: "onboarding", label: <span className="inline-flex items-center gap-1.5"><ListChecks size={14} /> Onboarding</span>, count: blockers.length || undefined },
    { key: "audit", label: <span className="inline-flex items-center gap-1.5"><ScrollText size={14} /> Audit</span> },
    { key: "configuration", label: <span className="inline-flex items-center gap-1.5"><Sliders size={14} /> Configuration</span> },
  ];

  return (
    <div className="page page-wide">
      <Link href="/platform" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-[var(--fg)] mb-[var(--s3)]">
        <ArrowLeft size={15} /> All companies
      </Link>

      <BreakGlassBanner orgId={c.id} className="mb-[var(--s3)]" />

      {created && (
        <Card className="p-[var(--s3)] mb-[var(--s3)] border-[var(--success)]">
          <div className="text-sm font-semibold text-success flex items-center gap-1.5">
            <CheckCircle2 size={16} /> {c.name} was created
          </div>
          <div className="text-[12px] text-2 mt-1">
            Tenant code <span className="font-mono font-semibold">{c.tenant_code}</span> · slug <span className="font-mono font-semibold">{c.slug}</span>. Work through the onboarding checklist below before taking it live.
          </div>
        </Card>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start gap-[var(--s3)] mb-[var(--s4)]">
        <span className="w-12 h-12 rounded-[12px] shrink-0 inline-flex items-center justify-center text-white font-bold overflow-hidden" style={{ background: c.accent_color || "linear-gradient(135deg, var(--brand), #0f172a)" }}>
          {c.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.logo_url} alt="" className="w-full h-full object-cover" />
          ) : (
            (c.name || "?").slice(0, 2).toUpperCase()
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="h1">{c.name}</h1>
            <Pill tone={STATUS_TONE[c.status] || "tone-neutral"} size="lg">
              {STATUS_LABEL[c.status] || c.status}
            </Pill>
          </div>
          <div className="text-sm text-muted mt-1">
            <span className="font-mono">{c.tenant_code}</span>
            {c.industry ? ` · ${c.industry}` : ""}
            {c.country ? ` · ${c.country}` : ""}
            {c.timezone ? ` · ${c.timezone}` : ""} · created {fmtDate(c.created_at)}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" loading={entering} onClick={enterWorkspace}>
            <LogIn size={15} /> Enter workspace
          </Button>
          <Button variant="danger" onClick={() => setBgOpen(true)}>
            <KeyRound size={15} /> Authorised access
          </Button>
        </div>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={(t) => setTab(t as Tab)} className="mb-[var(--s4)]" />

      {tab === "overview" && (
        <div className="space-y-[var(--s4)]">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--s2)]">
            <Tile label="Employees" value={fmtNum(setup?.employees)} icon={<Users size={14} />} />
            <Tile label="Departments" value={fmtNum(setup?.departments)} icon={<Building2 size={14} />} />
            <Tile label="Storage today" value={fmtMb(detail.usage?.[0]?.storage_mb)} icon={<Sliders size={14} />} />
            <Tile label="Setup" value={`${score.done}/${score.total}`} icon={<CheckCircle2 size={14} />} tone={score.pct === 100 ? "text-success" : undefined} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.618fr_1fr] gap-[var(--s3)] items-start">
            <Card className="p-[var(--s4)] min-w-0">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="eyebrow">Setup health</div>
                  <div className="text-[11px] text-muted mt-0.5">What is actually true in the database right now, not what a checklist says.</div>
                </div>
                <span className="text-sm font-semibold num">{score.pct}%</span>
              </div>
              <Progress value={score.pct} tone={score.pct === 100 ? "var(--success)" : "var(--brand-2)"} className="mt-2" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-[var(--s3)] gap-y-1.5 mt-[var(--s3)]">
                {Object.entries(setup?.checks || {}).map(([k, ok]) => (
                  <div key={k} className="flex items-center gap-2 text-sm min-w-0">
                    {ok ? <CheckCircle2 size={15} className="text-success shrink-0" /> : <Circle size={15} className="text-muted shrink-0" />}
                    <span className={cn("truncate", !ok && "text-muted")}>{SETUP_LABEL[k] || humanize(k)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-[var(--s4)] min-w-0">
              <div className="eyebrow">Lifecycle</div>
              <p className="text-[12px] text-muted mt-1">{STATUS_HINT[c.status] || ""}</p>
              {blockers.length > 0 && (
                <div className="mt-[var(--s3)] rounded-[var(--radius-sm)] tone-warn px-2.5 py-2">
                  <div className="text-[12px] font-semibold flex items-center gap-1.5">
                    <TriangleAlert size={13} /> {blockers.length} blocker{blockers.length === 1 ? "" : "s"} before go-live
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {blockers.map((b, i) => (
                      <li key={i} className="text-[11px]">
                        · {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {canStatus ? (
                <div className="mt-[var(--s3)] space-y-1.5">
                  {c.status !== "active" && (
                    <button type="button" onClick={() => setLifecycle("active")} className="w-full flex items-center gap-2 px-2.5 h-9 rounded-[var(--radius-sm)] row-hover text-left text-sm">
                      <CheckCircle2 size={15} className="text-success shrink-0" /> Activate company
                      <ChevronRight size={14} className="ml-auto text-muted" />
                    </button>
                  )}
                  {LIFECYCLE_ACTIONS.filter((a) => a.status !== c.status).map((a) => (
                    <button key={a.status} type="button" onClick={() => setLifecycle(a.status)} className="w-full flex items-start gap-2 px-2.5 py-2 rounded-[var(--radius-sm)] row-hover text-left">
                      <ShieldAlert size={15} className={cn("shrink-0 mt-0.5", a.danger ? "text-danger" : "text-warn")} />
                      <span className="min-w-0">
                        <span className="block text-sm">{a.label}</span>
                        <span className="block text-[11px] text-muted">{a.hint}</span>
                      </span>
                    </button>
                  ))}
                  <p className="text-[11px] text-muted pt-1.5 border-t mt-1.5">A company is never deleted. Suspending or archiving keeps every record intact and can be reversed.</p>
                </div>
              ) : (
                <p className="text-[11px] text-warn mt-[var(--s3)]">Only a platform owner or operations admin can change a company&apos;s status.</p>
              )}
            </Card>
          </div>

          {c.welcome_message && (
            <Card className="p-[var(--s4)]">
              <div className="eyebrow">Welcome message</div>
              <p className="text-sm text-2 mt-1.5 whitespace-pre-wrap">{c.welcome_message}</p>
            </Card>
          )}
        </div>
      )}

      {tab === "admins" && (
        <Card className="min-w-0">
          {detail.admins.length === 0 ? (
            <EmptyState icon={<Crown size={20} />} title="No administrator" hint="This company cannot run itself. Invite a super admin before it goes live." />
          ) : (
            <div className="divide-y">
              {detail.admins.map((a) => (
                <div key={a.id} className="flex items-center gap-2.5 px-[var(--s4)] py-2.5 min-w-0">
                  <Avatar name={a.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{a.name || "—"}</div>
                    <div className="text-[11px] text-muted truncate">{a.email}</div>
                  </div>
                  <Pill tone={a.role === "super_admin" ? "tone-brand" : "tone-neutral"}>{humanize(a.role)}</Pill>
                  <span className="text-[11px] text-muted hidden sm:block w-[110px] text-right shrink-0">{a.last_seen_at ? `Seen ${fmtDate(a.last_seen_at, true)}` : "Never signed in"}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "departments" && (
        <Card className="min-w-0">
          {detail.departments.length === 0 ? (
            <EmptyState icon={<Building2 size={20} />} title="No departments" hint="Departments come from the template chosen at creation, or can be added inside the company." />
          ) : (
            <div className="divide-y">
              {detail.departments.map((d) => (
                <div key={d.id} className="flex items-center gap-2.5 px-[var(--s4)] py-2.5 min-w-0">
                  <span className="text-sm truncate min-w-0 flex-1">{d.name}</span>
                  <Pill tone={d.people === 0 ? "tone-warn" : "tone-neutral"}>{d.people} {d.people === 1 ? "person" : "people"}</Pill>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "usage" && <UsagePanel usage={detail.usage || []} />}

      {tab === "features" && <FeatureMatrix orgId={c.id} features={detail.features || []} readOnly={!platformRole} />}

      {tab === "security" && (
        <div className="space-y-[var(--s3)]">
          <Card className="p-[var(--s4)] min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="eyebrow">Authorised access sessions</div>
                <div className="text-[11px] text-muted mt-0.5">Every time platform staff opened this company&apos;s content, with the reason they gave.</div>
              </div>
              <Button size="sm" variant="danger" onClick={() => setBgOpen(true)}>
                <KeyRound size={14} /> Open a session
              </Button>
            </div>
            {detail.break_glass.length === 0 ? (
              <div className="text-sm text-muted mt-[var(--s3)] flex items-center gap-2">
                <ShieldCheck size={16} className="text-success" /> Nobody from the platform has ever opened this company&apos;s content.
              </div>
            ) : (
              <div className="divide-y mt-[var(--s2)]">
                {detail.break_glass.map((b, i) => {
                  const open = !b.ended_at && isFuture(b.expires_at);
                  return (
                    <div key={i} className="py-2.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Pill tone={open ? "tone-danger" : "tone-neutral"}>{open ? `Open · ${countdown(b.expires_at)}` : "Closed"}</Pill>
                        <span className="text-sm font-medium">{b.actor || "Unknown"}</span>
                        <Pill tone="tone-neutral">{humanize(b.justification)}</Pill>
                        <Pill tone="tone-neutral">{humanize(b.scope)}</Pill>
                        <span className="text-[11px] text-muted ml-auto">{fmtDate(b.started_at, true)}</span>
                      </div>
                      <div className="text-[12px] text-2 mt-1">{b.reason}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-[var(--s4)] min-w-0">
            <div className="eyebrow">Support access granted by the company</div>
            <div className="text-[11px] text-muted mt-0.5">The company&apos;s own administrators open this door from their Administration console — the platform cannot open it for them.</div>
            {detail.support_sessions.length === 0 ? (
              <div className="text-sm text-muted mt-[var(--s3)]">No support access has been granted.</div>
            ) : (
              <div className="divide-y mt-[var(--s2)]">
                {detail.support_sessions.map((s) => {
                  const live = !s.revoked_at && isFuture(s.expires_at);
                  return (
                    <div key={s.id} className="py-2.5 flex flex-wrap items-center gap-2 min-w-0">
                      <Pill tone={live ? "tone-success" : "tone-neutral"}>{live ? `Active · ${countdown(s.expires_at)}` : s.revoked_at ? "Revoked" : "Expired"}</Pill>
                      <Pill tone="tone-neutral">{humanize(s.scope)}</Pill>
                      <span className="text-[12px] text-2 min-w-0 flex-1 truncate">{s.reason || "No reason given"}</span>
                      <span className="text-[11px] text-muted">{fmtDate(s.created_at, true)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <IsolationReport companies={[{ org_id: c.id, name: c.name }]} />
        </div>
      )}

      {tab === "onboarding" && (
        <OnboardingChecklist orgId={c.id} companyName={c.name} onboarding={detail.onboarding} setup={setup} status={c.status} canGoLive={canStatus} />
      )}

      {tab === "audit" && (
        <Card className="min-w-0">
          {detail.audit.length === 0 ? (
            <EmptyState icon={<ScrollText size={20} />} title="Nothing recorded yet" hint="Platform actions on this company appear here, and in the company's own audit log." />
          ) : (
            <div className="divide-y">
              {detail.audit.map((a, i) => (
                <div key={i} className="px-[var(--s4)] py-2.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="pill tone-neutral font-mono">{a.action.replace(/^platform\./, "")}</span>
                    <span className="text-sm truncate min-w-0">{a.summary || "—"}</span>
                    <span className="text-[11px] text-muted ml-auto shrink-0">{fmtDate(a.at, true)}</span>
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">
                    {a.actor || "Unknown"}
                    {a.reason ? ` · ${a.reason}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "configuration" && <CompanyConfig company={c} readOnly={!platformRole} />}

      <BreakGlassDialog open={bgOpen} onClose={() => setBgOpen(false)} orgId={c.id} companyName={c.name} />
      {lifecycle && <LifecycleDialog orgId={c.id} companyName={c.name} status={lifecycle} onClose={() => setLifecycle(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Tile */
function Tile({ label, value, icon, tone }: { label: string; value: React.ReactNode; icon: React.ReactNode; tone?: string }) {
  return (
    <div className="card px-[var(--s3)] py-2.5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted truncate">{label}</span>
        <span className="text-muted shrink-0">{icon}</span>
      </div>
      <div className={cn("text-[1.25rem] font-semibold num leading-tight mt-0.5", tone)}>{value}</div>
    </div>
  );
}

/* ------------------------------------------------------- Lifecycle dialog */
function LifecycleDialog({ orgId, companyName, status, onClose }: { orgId: string; companyName: string; status: string; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const action = LIFECYCLE_ACTIONS.find((a) => a.status === status);
  const activating = status === "active";
  const short = reason.trim().length < 8;

  async function apply() {
    if (short) return;
    setBusy(true);
    const { error } = await createClient().rpc("set_company_status", { p_org: orgId, p_status: status, p_reason: reason.trim() });
    setBusy(false);
    if (error) {
      toast.push(rpcError(error.message), "danger");
      return;
    }
    toast.push(`${companyName} is now ${STATUS_LABEL[status] || status}`, "success");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      title={
        <span className="inline-flex items-center gap-2">
          {activating ? <BadgeCheck size={17} className="text-[var(--success)]" /> : <ShieldAlert size={17} className="text-[var(--danger)]" />}
          {activating ? "Activate" : action?.label} — {companyName}
        </span>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={activating ? "success" : "danger"} loading={busy} disabled={short} onClick={apply}>
            {activating ? "Activate company" : action?.label}
          </Button>
        </>
      }
    >
      <p className="text-sm text-2">{activating ? STATUS_HINT.active : action?.hint}</p>
      <p className="text-[12px] text-muted mt-2">
        Nothing is deleted. The change, your name and the reason below go into this company&apos;s own audit trail, which its administrators can read.
      </p>
      <Field label="Reason (required)" className="mt-[var(--s3)]" hint="At least 8 characters. Write it for the company's administrator.">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-[70px]" placeholder={activating ? "Setup complete and signed off by the company." : "e.g. Contract ended on 31 March; suspending at the customer's written request."} />
      </Field>
      {!activating && (
        <div className="mt-[var(--s3)] text-[11px] text-muted flex items-start gap-1.5">
          <ExternalLink size={13} className="shrink-0 mt-px" /> Reversible: the company can be set back to Active from this same screen once the blockers are clear.
        </div>
      )}
      {activating && (
        <div className="mt-[var(--s3)] text-[11px] text-muted">Activation is refused by the database while any go-live blocker remains.</div>
      )}
    </Modal>
  );
}
