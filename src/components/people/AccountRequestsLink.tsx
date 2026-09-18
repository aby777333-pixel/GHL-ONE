"use client";

import * as React from "react";
import Link from "next/link";
import { UserCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * A quiet way in for the people who can admit somebody. It renders nothing at all unless there is
 * a sign-up this viewer may act on — `pending_accounts()` answers that in the database, so the
 * link is never offered to someone who would then be refused.
 */
export function AccountRequestsLink({ className }: { className?: string }) {
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    let live = true;
    createClient()
      .rpc("pending_accounts")
      .then(({ data }) => { if (live) setCount(Array.isArray(data) ? data.length : 0); });
    return () => { live = false; };
  }, []);

  if (count === 0) return null;
  return (
    <Link href="/people/requests" className={`btn btn-sm btn-secondary ${className || ""}`}>
      <UserCheck size={14} /> {count} waiting to join
    </Link>
  );
}
