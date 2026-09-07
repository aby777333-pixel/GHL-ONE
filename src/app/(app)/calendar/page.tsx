import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { CalendarClient } from "@/components/calendar/CalendarClient";
import { loadCalendarItems } from "@/components/calendar/loadCalendar";
import { windowFor } from "@/components/calendar/calendarUtils";

export const metadata = { title: "Calendar" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await getSession();
  const sp = await searchParams;
  const supabase = await createClient();
  const now = new Date();
  const win = windowFor(now);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().slice(0, 10);

  const [{ data: people }, { data: projects }, { data: leaves }] = await Promise.all([
    supabase.from("profiles").select("id,full_name").eq("is_active", true),
    supabase.from("projects").select("id,name").eq("archived", false).order("name"),
    supabase.from("leaves").select("*").gte("ends_on", sixMonthsAgo).order("starts_on", { ascending: false }).limit(400),
  ]);
  const nameOf = (id: string) => (people || []).find((p) => p.id === id)?.full_name || "Someone";
  const items = await loadCalendarItems(supabase, win.from, win.to, session.userId, nameOf);

  return (
    <CalendarClient
      initialItems={items}
      initialWindow={{ from: win.from.toISOString(), to: win.to.toISOString() }}
      leaves={leaves || []}
      projects={projects || []}
      initialView={one(sp.tab) || one(sp.view) || undefined}
      openNew={one(sp.new) === "1"}
    />
  );
}
