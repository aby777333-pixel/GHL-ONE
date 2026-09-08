import { GuestJoin } from "@/components/live/GuestJoin";

/**
 * External guest join — deliberately OUTSIDE the `(app)` shell so it carries no company
 * navigation, no session provider and no screen governance. Access is the capability token
 * itself, validated server-side by `live_guest_lookup` in /api/live/token.
 */
export const metadata = { title: "Join the call", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function GuestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <GuestJoin token={token} />;
}
