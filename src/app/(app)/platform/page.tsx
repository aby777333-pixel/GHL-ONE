import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PlatformDashboard } from "@/components/platform/PlatformDashboard";
import { PlatformError } from "@/components/platform/PlatformError";
import type { PlatformOverview } from "@/components/platform/lib";

export const metadata = { title: "Platform Command Center" };

/**
 * The platform layer is gated in the database (`is_platform_admin()` guards every RPC and policy).
 * This page re-checks it server-side before rendering anything: hiding a menu item is never the control.
 */
export default async function PlatformPage() {
  await getSession();
  const supabase = await createClient();

  const [{ data: isPlatformAdmin }, { data: platformRole }] = await Promise.all([supabase.rpc("is_platform_admin"), supabase.rpc("platform_role")]);
  if (!isPlatformAdmin) notFound();

  const { data, error } = await supabase.rpc("platform_overview");
  if (error || !data) return <PlatformError title="The platform overview could not be loaded" message={error?.message} backHref="/" backLabel="Back to Home" />;

  return <PlatformDashboard overview={data as unknown as PlatformOverview} platformRole={(platformRole as string | null) ?? null} />;
}
