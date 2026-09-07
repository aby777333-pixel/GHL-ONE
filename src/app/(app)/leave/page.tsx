import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { LeaveClient, type LeaveData } from "@/components/leave/LeaveClient";
import { istDay } from "@/components/attendance/attendanceUtils";

export const metadata = { title: "Leave" };

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const { profile } = await getSession();
  const supabase = await createClient();
  const today = istDay();
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const [{ data: balances }, { data: types }, { data: mine }, { data: team }, { data: holidays }, { data: tasks }, { data: approvePerm }, { data: hrPerm }] = await Promise.all([
    supabase.rpc("my_leave_balances", { p_user: profile.id }),
    supabase.from("leave_types").select("*").eq("active", true).order("position"),
    supabase.from("leaves").select("*").eq("user_id", profile.id).gte("ends_on", yearStart).order("starts_on", { ascending: false }).limit(60),
    supabase.from("leaves").select("*").neq("user_id", profile.id).or(`status.eq.pending,and(status.eq.approved,ends_on.gte.${today})`).order("starts_on").limit(200),
    supabase.from("calendar_events").select("id,title,starts_at,ends_at,description").eq("kind", "holiday").gte("starts_at", `${yearStart}T00:00:00+05:30`).order("starts_at").limit(40),
    supabase.from("tasks").select("id,title,due_date,priority").eq("assignee_id", profile.id).not("status", "in", "(done,cancelled)").order("due_date", { ascending: true, nullsFirst: false }).limit(80),
    supabase.rpc("has_admin_perm", { perm: "leave.approve" }),
    supabase.rpc("has_admin_perm", { perm: "hr.manage" }),
  ]);

  const data: LeaveData = {
    balances: balances || [],
    types: types || [],
    mine: mine || [],
    team: team || [],
    holidays: holidays || [],
    tasks: tasks || [],
    canApproveLeave: !!approvePerm,
    canHr: !!hrPerm,
  };
  return <LeaveClient data={data} initialTab={sp.tab} />;
}
