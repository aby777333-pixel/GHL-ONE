import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { AccessStudio } from "@/components/access/AccessStudio";
import type { PermissionRow } from "@/components/access/lib";

export const metadata = { title: "Access Control" };

/**
 * The Access Control Studio.
 *
 * Re-checked server-side before anything renders, and again in the database on every RPC the page
 * makes: `explain_permission`, `preview_user_access`, `role_change_impact` and the rest each refuse
 * a caller who is not entitled to review the subject. Hiding the nav item is never the control.
 *
 * Open to the platform owner (all companies) and to anybody inside a company who administers
 * security — they see their own company and cannot reach the company-limits tab at all, because
 * that is the platform owner's authority over them.
 */
export default async function AccessControlPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await getSession();
  const sp = await searchParams;
  const supabase = await createClient();

  /*
    `access_control.view` is the key that names this page. It refines `security.manage`, so every
    existing security administrator still resolves it (0040) — but a company can now hand out the
    ability to *read* who holds what without handing over the ability to change it.
  */
  const [{ data: isOwner }, { data: canSecurity }, { data: canRead }] = await Promise.all([
    supabase.rpc("is_platform_owner"),
    supabase.rpc("has_perm", { p_perm: "security.manage" }),
    supabase.rpc("has_perm", { p_perm: "access_control.view" }),
  ]);
  if (!isOwner && !canSecurity && !canRead) notFound();

  const [{ data: catalogue }, { data: companies }] = await Promise.all([
    supabase.from("permissions").select("*").order("position"),
    isOwner
      ? supabase.from("organizations").select("id,name,tenant_code,status").order("name")
      : Promise.resolve({ data: [] as { id: string; name: string; tenant_code: string | null; status: string }[] }),
  ]);

  return (
    <AccessStudio
      isOwner={!!isOwner}
      companies={companies || []}
      catalogue={(catalogue || []) as PermissionRow[]}
      initialTab={typeof sp.tab === "string" ? sp.tab : undefined}
    />
  );
}
