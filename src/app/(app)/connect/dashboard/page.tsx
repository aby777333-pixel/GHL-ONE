import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { connectPerms } from "@/lib/connectPerms";
import { ConnectDashboard } from "@/components/connect/ConnectDashboard";
import { ConnectGate } from "@/components/connect/ConnectGate";

export const metadata = { title: "Dashboard · Connect" };

export default async function ConnectDashboardPage() {
  const [, perms] = await Promise.all([getSession(), connectPerms()]);
  if (!perms.use) return <ConnectGate />;
  const supabase = await createClient();
  const { data: inboxes } = await supabase.from("inboxes").select("id,name,kind,address").eq("active", true).order("name");
  // The RPC itself decides who may see the numbers (supervisors, managers, connect.manage / view_all).
  return <ConnectDashboard inboxes={inboxes || []} />;
}
