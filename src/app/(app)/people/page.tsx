import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Directory } from "@/components/people/Directory";
import { DIRECTORY_SELECT, type DirectoryPerson } from "@/components/people/types";

export const metadata = { title: "People" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await getSession();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select(DIRECTORY_SELECT).eq("is_active", true).order("full_name");
  return (
    <Directory
      people={(data || []) as DirectoryPerson[]}
      initial={{ q: typeof sp.q === "string" ? sp.q : undefined, department: typeof sp.department === "string" ? sp.department : undefined, view: sp.view === "org" ? "org" : "grid" }}
    />
  );
}
