import { getSession } from "@/lib/session";
import { connectPerms } from "@/lib/connectPerms";
import { ConnectWorkspace } from "@/components/connect/ConnectWorkspace";
import { ConnectGate } from "@/components/connect/ConnectGate";

export const metadata = { title: "GHL Connect" };

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function ConnectPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [, sp, perms] = await Promise.all([getSession(), searchParams, connectPerms()]);
  if (!perms.use) return <ConnectGate />;
  return <ConnectWorkspace initialInbox={one(sp.inbox) || null} canManage={perms.manage} canApprove={perms.approve} />;
}
