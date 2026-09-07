import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Visitors } from "@/components/visitors/Visitors";

export const metadata = { title: "Visitors" };

/** RLS scopes rows to: my visitors, HR, system admins, and the Admin department (front desk). */
export default async function VisitorsPage() {
  await getSession();
  const supabase = await createClient();
  const from = new Date(); from.setDate(from.getDate() - 30);
  const since = from.toISOString();
  const { data } = await supabase.from("visitors").select("*").gte("expected_at", since).order("expected_at").limit(500);
  return <Visitors rows={data || []} />;
}
