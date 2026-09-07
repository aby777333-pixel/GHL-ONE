"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarRange, Network, Sunrise, Users } from "lucide-react";
import { Card, CardHeader, EmptyState, PageHeader, Skeleton, Tabs } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { useSeen } from "@/components/providers/ActivityProvider";
import { isManagerPlus } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { MyTeam } from "@/components/admin/people/ReportingTree";
import { TeamDigest } from "@/components/standups/Standup";
import { CapacityStrip } from "@/components/people/CapacityCalendar";
import { useTouchModule } from "@/components/intel/lib";

type TabKey = "team" | "digest" | "capacity";

/** `/people/team` — the manager's team view with tabs: roster (MyTeam), async standup digest, 7-day capacity per report. */
export function TeamPageTabs({ tab: initial }: { tab?: string }) {
  const { profile } = useSession();
  const router = useRouter();
  useSeen("nav:/people/team");
  useTouchModule("team");
  const [tab, setTab] = React.useState<TabKey>(initial === "digest" || initial === "capacity" ? initial : "team");
  const go = (t: TabKey) => { setTab(t); router.replace(`/people/team?tab=${t}`, { scroll: false }); };
  return (
    <div className="page">
      <PageHeader eyebrow="People" title="My team" subtitle="Direct and indirect reports — availability, attendance today, open work, blockers and requests." actions={isManagerPlus(profile.role) ? <Link href="/admin?tab=structure" className="btn btn-secondary btn-sm"><Network size={14} /> Reporting tree</Link> : undefined} />
      <Tabs<TabKey> tabs={[{ key: "team", label: <span className="inline-flex items-center gap-1.5"><Users size={13} /> Team</span> }, { key: "digest", label: <span className="inline-flex items-center gap-1.5"><Sunrise size={13} /> Digest</span> }, { key: "capacity", label: <span className="inline-flex items-center gap-1.5"><CalendarRange size={13} /> Capacity</span> }]} value={tab} onChange={go} className="mb-[var(--s3)]" />
      <div key={tab} className="anim-fade-in">
        {tab === "team" && <MyTeam />}
        {tab === "digest" && <TeamDigest departmentId={null} />}
        {tab === "capacity" && <TeamCapacity />}
      </div>
    </div>
  );
}

function TeamCapacity() {
  const { profile } = useSession();
  const [reports, setReports] = React.useState<{ id: string; full_name: string; depth: number }[] | null>(null);
  React.useEffect(() => {
    let alive = true;
    createClient().rpc("reports_of", { p_user: profile.id }).then(({ data }) => { if (alive) setReports((data || []).map((r) => ({ id: r.id, full_name: r.full_name, depth: r.depth }))); });
    return () => { alive = false; };
  }, [profile.id]);
  return (
    <Card>
      <CardHeader title="Capacity — next 7 days" subtitle="Tasks due and meeting hours per person. Check before you assign; heavy and critical days are where deadlines slip." />
      {!reports ? <div className="px-[var(--s4)] pb-3 space-y-2"><Skeleton /><Skeleton /></div> : reports.length === 0 ? <EmptyState title="No reports yet" className="py-[var(--s4)]" /> : (
        <div className="divide-y border-t">
          {reports.map((r) => (
            <div key={r.id} className="px-[var(--s4)] py-3 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-2 items-center">
              <div style={{ paddingLeft: (r.depth - 1) * 12 }}><PersonChip id={r.id} size={24} /></div>
              <CapacityStrip userId={r.id} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
