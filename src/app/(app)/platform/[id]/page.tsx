import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { CompanyView } from "@/components/platform/CompanyView";
import { PlatformError } from "@/components/platform/PlatformError";
import type { CompanyDetail } from "@/components/platform/lib";

export const metadata = { title: "Company · Platform" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One tenant, from the platform side (§70). `platform_company()` refuses with `forbidden` when the
 * caller may not touch this company — surfaced here as a sentence, and as a 404 for anyone who is
 * not platform staff at all.
 */
export default async function PlatformCompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await getSession();
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: isPlatformAdmin }, { data: platformRole }] = await Promise.all([supabase.rpc("is_platform_admin"), supabase.rpc("platform_role")]);
  if (!isPlatformAdmin) notFound();
  if (!UUID.test(id)) notFound();

  const { data, error } = await supabase.rpc("platform_company", { p_org: id });
  if (error || !data) {
    return <PlatformError title="This company could not be opened" message={error?.message || "The company no longer exists."} />;
  }

  return <CompanyView detail={data as unknown as CompanyDetail} platformRole={(platformRole as string | null) ?? null} created={sp.created === "1"} />;
}
