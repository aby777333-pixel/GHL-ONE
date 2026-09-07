"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Briefcase, ClipboardCheck, FileText, Laptop, LogOut, Users, Workflow } from "lucide-react";
import { Tabs } from "@/components/ui";
import { PeopleRecords } from "./PeopleRecords";
import { WorkflowsView } from "./Workflows";
import { TransfersView } from "./TransfersRoles";
import { ProbationView } from "./Probation";
import { OffboardingView } from "./Offboarding";
import { AssetsView } from "./Assets";
import { DocumentsView } from "./Documents";
import { RecruitmentView } from "./Recruitment";
import { daysUntil, todayIso, type HrData, type HrView } from "./lib";

/** People Operations console — `/admin?tab=hr&view=<view>`. */
export function HrConsole({ data, perms, view, run, user }: { data: HrData; perms: string[]; view: HrView; run?: string | null; user?: string | null }) {
  const router = useRouter();
  const [current, setCurrent] = React.useState<HrView>(view);
  const [today] = React.useState(() => todayIso());

  const counts = {
    onboarding: data.runs.filter((r) => r.status === "running").length,
    transfers: data.transfers.filter((t) => t.status === "proposed" || t.status === "approved").length + data.roleChanges.filter((c) => c.status === "proposed").length,
    probation: data.people.filter((p) => p.is_active && p.probation_ends_on && daysUntil(p.probation_ends_on, today) <= 14).length,
    assets: data.assetRequests.filter((r) => r.status === "pending").length,
    ats: data.candidates.filter((c) => c.stage !== "hired" && c.stage !== "rejected").length,
  };

  const tabs: { key: HrView; label: React.ReactNode; count?: number }[] = [
    { key: "people", label: <span className="inline-flex items-center gap-1.5"><Users size={13} /> People</span> },
    { key: "onboarding", label: <span className="inline-flex items-center gap-1.5"><Workflow size={13} /> Onboarding & workflows</span>, count: counts.onboarding || undefined },
    { key: "transfers", label: <span className="inline-flex items-center gap-1.5"><ArrowRightLeft size={13} /> Transfers & roles</span>, count: counts.transfers || undefined },
    { key: "probation", label: <span className="inline-flex items-center gap-1.5"><ClipboardCheck size={13} /> Probation</span>, count: counts.probation || undefined },
    { key: "offboarding", label: <span className="inline-flex items-center gap-1.5"><LogOut size={13} /> Offboarding</span> },
    { key: "assets", label: <span className="inline-flex items-center gap-1.5"><Laptop size={13} /> Assets</span>, count: counts.assets || undefined },
    { key: "documents", label: <span className="inline-flex items-center gap-1.5"><FileText size={13} /> Documents</span> },
    { key: "ats", label: <span className="inline-flex items-center gap-1.5"><Briefcase size={13} /> Recruitment</span>, count: counts.ats || undefined },
  ];

  function go(v: HrView) {
    setCurrent(v);
    router.replace(`/admin?tab=hr&view=${v}`, { scroll: false });
  }

  return (
    <div className="space-y-[var(--s4)]">
      <Tabs<HrView> tabs={tabs} value={current} onChange={go} />
      <div key={current} className="anim-fade-in">
        {current === "people" && <PeopleRecords data={data} perms={perms} initialUser={user || undefined} />}
        {current === "onboarding" && <WorkflowsView runs={data.runs} templates={data.templates} people={data.people} perms={perms} initialRun={run} showTemplates />}
        {current === "transfers" && <TransfersView data={data} perms={perms} />}
        {current === "probation" && <ProbationView data={data} />}
        {current === "offboarding" && <OffboardingView data={data} />}
        {current === "assets" && <AssetsView data={data} initialTab={counts.assets > 0 && !data.assets.length ? "requests" : undefined} />}
        {current === "documents" && <DocumentsView data={data} initialUser={user || undefined} />}
        {current === "ats" && <RecruitmentView data={data} perms={perms} />}
      </div>
    </div>
  );
}
