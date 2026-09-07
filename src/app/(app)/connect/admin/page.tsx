import { getSession } from "@/lib/session";
import { connectPerms } from "@/lib/connectPerms";
import { ConnectAdmin } from "@/components/connect/ConnectAdmin";
import { ConnectGate } from "@/components/connect/ConnectGate";

export const metadata = { title: "Connect admin" };

export default async function ConnectAdminPage() {
  const [, perms] = await Promise.all([getSession(), connectPerms()]);
  if (!perms.manage) return <ConnectGate perm="connect.manage" what="Connect admin" />;
  return <ConnectAdmin />;
}
