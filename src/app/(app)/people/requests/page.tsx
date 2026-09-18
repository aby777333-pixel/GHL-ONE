import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { AccountRequests, type PendingAccount } from "@/components/people/AccountRequests";

export const metadata = { title: "Account requests" };

/**
 * Sign-ups waiting to be admitted. `pending_accounts()` returns only the people the caller may
 * actually act on — the same `can_approve_account()` gate the approve and decline RPCs use — so a
 * department head sees the requests for their department and nothing else.
 */
export default async function AccountRequestsPage() {
  await getSession();
  const supabase = await createClient();
  const [{ data: rows }, { data: may }] = await Promise.all([
    supabase.rpc("pending_accounts"),
    supabase.rpc("can_approve_accounts"),
  ]);
  return <AccountRequests initial={(rows || []) as unknown as PendingAccount[]} may={!!may} />;
}
