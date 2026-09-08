"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Building2, HardDrive, KeyRound, Layers, Megaphone, Plus, Radio, ShieldAlert, ShieldCheck, Sparkles, Users, Video } from "lucide-react";
import { Button, Card, EmptyState, PageHeader, Pill, SearchInput, Stat, Tabs } from "@/components/ui";
import { cn } from "@/lib/utils";
import { BreakGlassBanner } from "./BreakGlassDialog";
import { CompanyCard } from "./CompanyCard";
import { IsolationReport } from "./IsolationReport";
import { PlatformAnnouncements } from "./PlatformAnnouncements";
import { PlatformStaff } from "./PlatformStaff";
import { canCreateCompany, fmtMb, fmtNum, PLATFORM_ROLE_LABEL, STATUS_LABEL, STATUS_TONE, type PlatformOverview } from "./lib";

const STATUS_COLOR: Record<string, string> = {
  active: "var(--success)",
  onboarding: "var(--warn)",
  trial: "var(--info)",
  read_only: "var(--orange)",
  suspended: "var(--danger)",
  archived: "var(--fg-muted)",
  closed: "var(--fg-muted)",
  pending: "var(--neutral)",
};

type Tab = "companies" | "announcements" | "staff" | "isolation";

/** The Platform Command Center (§120, §121, §175). One screen that answers: is every company healthy? */
export function PlatformDashboard({ overview, platformRole }: { overview: PlatformOverview; platformRole: string | null }) {
  const [tab, setTab] = React.useState<Tab>("companies");
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);

  const companies = React.useMemo(() => overview.companies_list || [], [overview.companies_list]);
  const attention = overview.needs_attention || [];
  const canCreate = canCreateCompany(platformRole);

  const byStatus = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const c of companies) m.set(c.status, (m.get(c.status) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [companies]);

  const filtered = companies.filter((c) => {
    if (status && c.status !== status) return false;
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return [c.name, c.slug, c.tenant_code, c.industry, c.admin].some((v) => (v || "").toLowerCase().includes(t));
  });

  const pickList = companies.map((c) => ({ org_id: c.org_id, name: c.name }));

  return (
    <div className="page page-wide">
      <PageHeader
        eyebrow="Platform"
        title={
          <span className="inline-flex items-center gap-2">
            <Layers size={22} className="text-[var(--brand)]" /> Command Center
          </span>
        }
        subtitle={
          <>
            Every company on GHL ONE, and nothing from inside any of them.
            {platformRole && <span className="ml-1.5">You are signed in as <span className="font-medium text-2">{PLATFORM_ROLE_LABEL[platformRole] || platformRole}</span>.</span>}
          </>
        }
        actions={
          canCreate ? (
            <Link href="/platform/new" className="btn btn-primary">
              <Plus size={15} /> Onboard company
            </Link>
          ) : null
        }
      />

      <BreakGlassBanner className="mb-[var(--s3)]" />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-[var(--s2)] mb-[var(--s4)] stagger">
        <Stat label="Companies" value={fmtNum(overview.companies)} sub={`${overview.active} active · ${overview.onboarding} onboarding`} icon={<Building2 size={14} />} />
        <Stat label="Employees" value={fmtNum(overview.employees)} sub={`${fmtNum(overview.online)} online now`} icon={<Users size={14} />} />
        <Stat label="Storage today" value={fmtMb(overview.storage_mb)} sub="Files and recordings" icon={<HardDrive size={14} />} />
        <Stat label="AI calls today" value={fmtNum(overview.ai_calls_today)} sub="Across every company" icon={<Sparkles size={14} />} />
        <Stat label="Video minutes" value={fmtNum(overview.video_minutes_today)} sub="Live rooms today" icon={<Video size={14} />} />
        <Stat
          label="Security signals"
          value={fmtNum(overview.security_alerts)}
          tone={overview.security_alerts > 0 ? "text-danger" : undefined}
          sub={overview.break_glass_open > 0 ? `${overview.break_glass_open} access session${overview.break_glass_open === 1 ? "" : "s"} open` : "Last 7 days"}
          icon={overview.break_glass_open > 0 ? <KeyRound size={14} /> : <ShieldAlert size={14} />}
        />
      </div>

      <Tabs
        className="mb-[var(--s4)]"
        value={tab}
        onChange={(t) => setTab(t as Tab)}
        tabs={[
          { key: "companies", label: <span className="inline-flex items-center gap-1.5"><Building2 size={14} /> Companies</span>, count: companies.length },
          { key: "announcements", label: <span className="inline-flex items-center gap-1.5"><Megaphone size={14} /> Announcements</span> },
          { key: "staff", label: <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} /> Platform staff</span> },
          { key: "isolation", label: <span className="inline-flex items-center gap-1.5"><Radio size={14} /> Isolation</span> },
        ]}
      />

      {tab === "companies" && (
        <div className="space-y-[var(--s4)]">
          {/* Status map */}
          <Card className="p-[var(--s4)] min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="eyebrow">Company status</div>
                <div className="text-[11px] text-muted mt-0.5">Click a status to filter the list below.</div>
              </div>
              {status && (
                <Button size="xs" variant="ghost" onClick={() => setStatus(null)}>
                  Clear filter
                </Button>
              )}
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden mt-[var(--s3)] sunken">
              {byStatus.map(([s, n]) => (
                <div key={s} style={{ width: `${(n / Math.max(1, companies.length)) * 100}%`, background: STATUS_COLOR[s] || "var(--neutral)" }} title={`${STATUS_LABEL[s] || s}: ${n}`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-[var(--s3)]">
              {byStatus.map(([s, n]) => (
                <button key={s} type="button" onClick={() => setStatus(status === s ? null : s)} className={cn("pill pill-lg", STATUS_TONE[s] || "tone-neutral", status && status !== s && "opacity-45")}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_COLOR[s] || "var(--neutral)" }} />
                  {STATUS_LABEL[s] || s} · {n}
                </button>
              ))}
            </div>
          </Card>

          {/* What needs my attention */}
          <section className="min-w-0">
            <div className="eyebrow mb-2 flex items-center gap-1.5">
              <AlertTriangle size={12} className={attention.length ? "text-warn" : "text-success"} /> What needs my attention
            </div>
            {attention.length === 0 ? (
              <Card className="px-[var(--s4)] py-[var(--s3)] flex items-center gap-2 text-sm">
                <ShieldCheck size={16} className="text-success shrink-0" />
                <span>Every company has an administrator, a verified domain where one is set, and no stalled onboarding.</span>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--s2)]">
                {attention.map((a) => (
                  <Link key={a.org_id} href={`/platform/${a.org_id}`} className="card card-hover p-[var(--s3)] min-w-0 block">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold truncate">{a.name}</span>
                      <Pill tone={STATUS_TONE[a.status] || "tone-neutral"}>{STATUS_LABEL[a.status] || a.status}</Pill>
                    </div>
                    <ul className="mt-1.5 space-y-1">
                      {a.reasons.map((r, i) => (
                        <li key={i} className="text-[12px] text-2 flex items-start gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--warn)] shrink-0 mt-1.5" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Company grid */}
          <section className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="eyebrow">
                Companies {filtered.length !== companies.length && <span className="text-muted">· {filtered.length} shown</span>}
              </div>
              <SearchInput className="w-full sm:w-[280px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, industry…" />
            </div>
            {filtered.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Building2 size={20} />}
                  title={companies.length === 0 ? "No companies yet" : "No company matches"}
                  hint={companies.length === 0 ? "Onboard the first company to see it here." : "Try a different search or clear the status filter."}
                  action={canCreate && companies.length === 0 ? <Link href="/platform/new" className="btn btn-primary">Onboard company</Link> : undefined}
                />
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-[var(--s2)] stagger">
                {filtered.map((c) => (
                  <CompanyCard key={c.org_id} c={c} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "announcements" && <PlatformAnnouncements companies={pickList} platformRole={platformRole} />}
      {tab === "staff" && <PlatformStaff companies={pickList} platformRole={platformRole} />}
      {tab === "isolation" && <IsolationReport companies={pickList} />}
    </div>
  );
}
