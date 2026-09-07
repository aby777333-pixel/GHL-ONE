import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isLeadPlus } from "@/lib/utils";
import { AttendanceClient, type AttendanceData } from "@/components/attendance/AttendanceClient";
import { istDay, monthBounds, type AttendanceDay, type BoardRow, type Shift, type ShiftSwap } from "@/components/attendance/attendanceUtils";

export const metadata = { title: "Attendance" };

export default async function AttendancePage() {
  const { profile } = await getSession();
  const supabase = await createClient();
  const today = istDay();
  const [y, m] = today.split("-").map(Number);
  const bounds = monthBounds(y, m - 1);

  const { data: perm } = await supabase.rpc("has_admin_perm", { perm: "attendance.manage" });
  const hasAttendancePerm = !!perm;
  const lead = isLeadPlus(profile.role) || hasAttendancePerm;

  const [{ data: myDays }, { data: board }, { data: shifts }, { data: swaps }, { data: tasks }, { data: hr }, { data: myRequests }] = await Promise.all([
    supabase.rpc("my_attendance", { p_from: bounds.from, p_to: bounds.to }),
    lead ? supabase.rpc("attendance_board", { p_day: today }) : Promise.resolve({ data: [] as BoardRow[] }),
    supabase.from("shifts").select("*").eq("active", true).order("start_time"),
    supabase.from("shift_swaps").select("*").order("created_at", { ascending: false }).limit(60),
    supabase.from("tasks").select("id,title,project:projects!tasks_project_id_fkey(name)").eq("assignee_id", profile.id).not("status", "in", "(done,cancelled)").order("due_date", { ascending: true, nullsFirst: false }).limit(80),
    supabase.from("departments").select("id").eq("slug", "hr").maybeSingle(),
    supabase.from("help_requests").select("id,title,status,created_at,form_data,details,owner_id").eq("requester_id", profile.id).eq("title", "Attendance correction").order("created_at", { ascending: false }).limit(20),
  ]);

  const { data: service } = hr ? await supabase.from("service_catalog").select("id").eq("department_id", hr.id).eq("name", "Attendance correction").eq("active", true).maybeSingle() : { data: null };

  const data: AttendanceData = {
    today,
    month: today.slice(0, 7),
    myDays: (myDays || []) as AttendanceDay[],
    board: (board || []) as BoardRow[],
    shifts: (shifts || []) as Shift[],
    swaps: (swaps || []) as ShiftSwap[],
    tasks: (tasks || []).map((t) => ({ id: t.id, title: t.title, project: (t.project as unknown as { name: string } | null) || null })),
    hrDepartmentId: hr?.id || null,
    serviceId: service?.id || null,
    myRequests: myRequests || [],
    hasAttendancePerm,
  };

  return <AttendanceClient data={data} />;
}
