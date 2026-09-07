import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { AnnouncementsClient } from "./AnnouncementsClient";

export const metadata = { title: "Announcements" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await getSession();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: announcements }, { data: acks }] = await Promise.all([
    supabase.from("announcements").select("*").order("pinned", { ascending: false }).order("published_at", { ascending: false }).limit(200),
    supabase.from("announcement_acks").select("announcement_id,user_id,acked_at").limit(5000),
  ]);
  return <AnnouncementsClient announcements={announcements || []} acks={acks || []} openNew={one(sp.new) === "1"} />;
}
