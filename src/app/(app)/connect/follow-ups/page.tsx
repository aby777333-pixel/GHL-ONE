import { getSession } from "@/lib/session";
import { connectPerms } from "@/lib/connectPerms";
import { FollowUpBoard } from "@/components/connect/FollowUpBoard";
import { ConnectGate } from "@/components/connect/ConnectGate";

export const metadata = { title: "Follow-ups · Connect" };

export default async function FollowUpsPage() {
  const [, perms] = await Promise.all([getSession(), connectPerms()]);
  if (!perms.use) return <ConnectGate />;
  return <FollowUpBoard />;
}
