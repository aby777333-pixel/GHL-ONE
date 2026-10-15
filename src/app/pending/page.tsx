import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { JoinRequestRow } from "@/components/auth/JoinRequestForm";
import { AccountStatusView } from "@/components/auth/AccountStatusView";
import type { AccountStatus } from "@/lib/accountStatus";

export const metadata = { title: "Account status" };

/**
 * Where everybody who is signed in but not (or no longer) inside a workspace lands: awaiting company
 * activation, pending approval, pending department, rejected, suspended or deactivated.
 *
 * The status comes from `my_account_status()` (0078), the same function the owner console and the
 * approver list read, so this page cannot disagree with them. It shows the person their own
 * registration and nothing of their company beyond its name and department list — and since 0079 the
 * database refuses a non-active account every channel, membership, wiki page and template anyway.
 */
export default async function PendingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: raw } = await supabase.rpc("my_account_status");
  const status = (raw as unknown as AccountStatus | null) ?? ({ status: "unknown" } as AccountStatus);
  if (status.status === "active") redirect("/");

  // Departments and the join request exist only once there is a profile in a company. `dept_read` is
  // org-scoped (not member-scoped), which is why a pending account can list its company's departments.
  const hasProfile = status.company?.on_platform === true;
  const [{ data: departments }, { data: request }] = hasProfile
    ? await Promise.all([
        supabase.from("departments").select("id, name").order("position"),
        supabase
          .from("join_requests")
          .select("id, department_id, designation, note, status, decision_note, decided_label, requested_department")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
    : [{ data: [] }, { data: null }];

  return (
    <AccountStatusView
      status={status}
      email={user.email || status.email || ""}
      departments={(departments || []) as { id: string; name: string }[]}
      request={(request as JoinRequestRow | null) ?? null}
    />
  );
}
