import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { AppShell } from "@/components/shell/AppShell";
import { ActivityProvider } from "@/components/providers/ActivityProvider";
import { PendingPoliciesBanner } from "@/components/policies/PendingPoliciesBanner";
import type { Screen } from "@/lib/screens";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const supabase = await createClient();
  const [{ data: departments }, { data: people }, { count: inbox }, { count: approvals }, { data: unread }, { data: screens }] = await Promise.all([
    supabase.from("departments").select("*").order("position"),
    supabase.from("profiles").select("id,full_name,avatar_url,designation,department_id,role,presence,email").eq("is_active", true).order("full_name"),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", session.userId).is("read_at", null),
    supabase.from("approvals").select("id", { count: "exact", head: true }).eq("approver_id", session.userId).eq("status", "pending"),
    supabase.rpc("my_unread_counts"),
    supabase.rpc("effective_screens"),
  ]);
  const chat = (unread || []).reduce((a, r) => a + Number(r.unread || 0), 0);

  return (
    <SessionProvider value={{ profile: session.profile, departments: departments || [], people: people || [], screens: ((screens || []) as Screen[]) }}>
      <ActivityProvider>
        <AppShell initialCounts={{ inbox: inbox || 0, approvals: approvals || 0, chat }}>
          <PendingPoliciesBanner className="mx-[var(--s3)] mt-[var(--s3)]" />
          {children}
        </AppShell>
      </ActivityProvider>
    </SessionProvider>
  );
}
