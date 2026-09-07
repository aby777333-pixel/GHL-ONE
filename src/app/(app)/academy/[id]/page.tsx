import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isLeadPlus } from "@/lib/utils";
import { CoursePage, type CoursePageData } from "@/components/academy/CoursePage";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function AcademyCoursePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const [{ id }, sp, { profile }] = await Promise.all([params, searchParams, getSession()]);
  const supabase = await createClient();

  const { data: course } = await supabase.from("courses").select("*").eq("id", id).maybeSingle();
  if (!course) notFound();

  const [{ data: lessons }, { data: enrollment }, { data: hr }] = await Promise.all([
    supabase.from("lessons").select("*").eq("course_id", id).order("position"),
    supabase.from("enrollments").select("*").eq("course_id", id).eq("user_id", profile.id).maybeSingle(),
    supabase.rpc("is_hr"),
  ]);

  const wikiIds = (lessons || []).map((l) => l.wiki_page_id).filter((x): x is string => !!x);
  const fileIds = (lessons || []).map((l) => l.file_id).filter((x): x is string => !!x);
  const [{ data: progress }, { data: wiki }, { data: files }, { data: versions }] = await Promise.all([
    enrollment ? supabase.from("lesson_progress").select("*").eq("enrollment_id", enrollment.id) : Promise.resolve({ data: [] as CoursePageData["progress"] }),
    wikiIds.length ? supabase.from("wiki_pages").select("id,title,slug").in("id", wikiIds) : Promise.resolve({ data: [] as CoursePageData["wiki"] }),
    fileIds.length ? supabase.from("files").select("id,name").in("id", fileIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    fileIds.length ? supabase.from("file_versions").select("file_id,storage_path,mime_type,version").in("file_id", fileIds).order("version", { ascending: false }) : Promise.resolve({ data: [] as { file_id: string; storage_path: string; mime_type: string | null; version: number }[] }),
  ]);

  const latest = new Map<string, { storage_path: string; mime_type: string | null }>();
  for (const v of versions || []) if (!latest.has(v.file_id)) latest.set(v.file_id, { storage_path: v.storage_path, mime_type: v.mime_type });

  const data: CoursePageData = {
    course,
    lessons: lessons || [],
    enrollment: enrollment || null,
    progress: progress || [],
    wiki: wiki || [],
    files: (files || []).map((f) => ({ id: f.id, name: f.name, storage_path: latest.get(f.id)?.storage_path || null, mime_type: latest.get(f.id)?.mime_type || null })),
    canManage: isLeadPlus(profile.role) || !!hr || course.created_by === profile.id,
    openEdit: one(sp.edit) === "1",
    lessonId: one(sp.lesson),
  };
  return <CoursePage data={data} />;
}
