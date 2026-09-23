"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader, Tabs } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { Blink, useSeen } from "@/components/providers/ActivityProvider";
import { isLeadPlus, type Tables } from "@/lib/utils";
import { MyAttendance } from "./MyAttendance";
import { TeamBoard } from "./TeamBoard";
import { RosterTab } from "./RosterTab";
import { TimesheetTab } from "./TimesheetTab";
import { CorrectionsTab } from "./CorrectionsTab";
import { ShiftHandover } from "./ShiftHandover";
import type { AttendanceDay, BoardRow, Shift, ShiftSwap } from "./attendanceUtils";

type TabKey = "me" | "team" | "roster" | "timesheet" | "corrections" | "handover";
type HelpRow = Pick<Tables<"help_requests">, "id" | "title" | "status" | "created_at" | "form_data" | "details" | "owner_id">;

export type AttendanceData = {
  today: string;
  month: string;
  myDays: AttendanceDay[];
  board: BoardRow[];
  shifts: Shift[];
  swaps: ShiftSwap[];
  tasks: { id: string; title: string; project?: { name: string } | null }[];
  hrDepartmentId: string | null;
  serviceId: string | null;
  myRequests: HelpRow[];
  hasAttendancePerm: boolean;
};

export function AttendanceClient({ data }: { data: AttendanceData }) {
  const { profile } = useSession();
  const router = useRouter();
  const sp = useSearchParams();
  useSeen("nav:/attendance");
  const lead = isLeadPlus(profile.role) || data.hasAttendancePerm;
  const requested = sp.get("tab") as TabKey | null;
  const fromUrl = (r: TabKey | null): TabKey => (r && ["me", "team", "roster", "timesheet", "corrections", "handover"].includes(r) && (r !== "team" || lead) ? r : "me");
  const [tab, setTab] = React.useState<TabKey>(fromUrl(requested));

  /*
    The URL is read once for the initial tab, so a link to `?tab=corrections` followed from this very
    page ("Request a correction" under My exceptions) changed the address bar and left the tab where it
    was. Follow the URL whenever it changes — adjusting state during render, not in an effect, so the
    right tab is on screen on the same paint.
  */
  const [seenRequested, setSeenRequested] = React.useState(requested);
  if (requested !== seenRequested) {
    setSeenRequested(requested);
    setTab(fromUrl(requested));
  }

  function go(t: TabKey) {
    setTab(t);
    const q = new URLSearchParams(sp.toString());
    if (t === "me") q.delete("tab"); else q.set("tab", t);
    router.replace(`/attendance${q.size ? `?${q}` : ""}`, { scroll: false });
  }

  const tabs: { key: TabKey; label: React.ReactNode; count?: number }[] = [
    { key: "me", label: "My attendance" },
    ...(lead ? [{ key: "team" as const, label: <span className="inline-flex items-center gap-1.5">Team board <Blink zone="nav:/attendance" /></span> }] : []),
    { key: "roster", label: "Roster", count: data.swaps.filter((s) => s.status === "pending").length || undefined },
    { key: "timesheet", label: "Timesheet" },
    { key: "corrections", label: "Corrections" },
    { key: "handover", label: "Handover" },
  ];

  return (
    <div className="page">
      <PageHeader eyebrow="Workforce" title="Attendance" subtitle="Clock in when you start, out when you stop. Nothing else is tracked — and you can always see what is recorded about you." />
      <Tabs tabs={tabs} value={tab} onChange={go} className="mb-[var(--s3)]" />
      {tab === "me" && <MyAttendance initialDays={data.myDays} initialMonth={data.month} />}
      {tab === "team" && lead && <TeamBoard initialRows={data.board} initialDay={data.today} />}
      {tab === "roster" && <RosterTab shifts={data.shifts} initialSwaps={data.swaps} />}
      {tab === "timesheet" && <TimesheetTab tasks={data.tasks} />}
      {tab === "handover" && <ShiftHandover openId={sp.get("id")} />}
      {tab === "corrections" && <CorrectionsTab hrDepartmentId={data.hrDepartmentId} serviceId={data.serviceId} initialRequests={data.myRequests} hasAttendancePerm={data.hasAttendancePerm} />}
    </div>
  );
}
