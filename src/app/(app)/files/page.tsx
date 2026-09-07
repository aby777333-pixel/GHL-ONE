import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { FilesBrowser } from "@/components/files/FilesBrowser";
import { FILE_SELECT, type FileListItem } from "@/components/files/types";

export const metadata = { title: "Files" };

export default async function FilesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await getSession();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: files }, { data: projects }] = await Promise.all([
    supabase.from("files").select(FILE_SELECT).order("updated_at", { ascending: false }),
    supabase.from("projects").select("id,name").eq("archived", false).order("name"),
  ]);

  return (
    <FilesBrowser
      files={(files || []) as unknown as FileListItem[]}
      projects={projects || []}
      initial={{
        folder: typeof sp.folder === "string" ? sp.folder : undefined,
        project: typeof sp.project === "string" ? sp.project : undefined,
        q: typeof sp.q === "string" ? sp.q : undefined,
        upload: sp.upload === "1",
      }}
    />
  );
}
