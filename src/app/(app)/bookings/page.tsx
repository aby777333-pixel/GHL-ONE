import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/utils";
import { Bookings } from "@/components/bookings/Bookings";

export const metadata = { title: "Bookings" };

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function BookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ profile }, sp] = await Promise.all([getSession(), searchParams]);
  const supabase = await createClient();
  const day = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : localDay();
  const start = new Date(`${day}T00:00:00`).toISOString();
  const end = new Date(new Date(`${day}T00:00:00`).getTime() + 86400000).toISOString();
  const [{ data: resources }, { data: bookings }, { data: hr }, { data: sys }] = await Promise.all([
    supabase.from("resources").select("*").order("kind").order("name"),
    supabase.from("bookings").select("*").lt("starts_at", end).gt("ends_at", start).order("starts_at"),
    supabase.rpc("is_hr"),
    supabase.rpc("has_admin_perm", { perm: "system.manage" }),
  ]);
  return <Bookings resources={resources || []} bookings={bookings || []} day={day} canManage={isAdminRole(profile.role) || !!hr || !!sys} />;
}
