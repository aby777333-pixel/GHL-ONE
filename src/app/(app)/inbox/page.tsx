import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "@/components/inbox/InboxClient";

export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const session = await getSession();
  const supabase = await createClient();
  const horizon = new Date(new Date().getTime() + 48 * 3600_000).toISOString();
  const [{ data: notifications }, { data: tasks }] = await Promise.all([
    supabase.from("notifications").select("*").eq("user_id", session.userId).order("created_at", { ascending: false }).limit(200),
    supabase
      .from("tasks")
      .select("id,title,status,priority,due_date,project_id,assignee_id,waiting_on,waiting_on_user_id")
      .eq("assignee_id", session.userId)
      .not("due_date", "is", null)
      .lte("due_date", horizon)
      .not("status", "in", "(done,cancelled)")
      .order("due_date", { ascending: true })
      .limit(50),
  ]);
  return <InboxClient initial={notifications || []} dueTasks={tasks || []} />;
}
