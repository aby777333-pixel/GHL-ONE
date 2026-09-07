"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ScrollText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, fmtDate, humanize } from "@/lib/utils";

type Pending = { id: string; title: string; category: string; version: number; effective_on: string; has_quiz: boolean };

/**
 * "Policies to confirm" banner — `my_pending_policies()`; hidden when nothing is pending or while reading a policy.
 * Mount once in the shell; it re-checks after each navigation.
 */
export function PendingPoliciesBanner({ className }: { className?: string }) {
  const pathname = usePathname();
  const [rows, setRows] = React.useState<Pending[]>([]);

  React.useEffect(() => {
    let alive = true;
    createClient().rpc("my_pending_policies").then(({ data }) => { if (alive) setRows((data || []) as Pending[]); });
    return () => { alive = false; };
  }, [pathname]);

  if (!rows.length || pathname.startsWith("/policies/")) return null;
  const first = rows[0]!;
  return (
    <div className={cn("card border-[var(--warn)] tone-warn px-[var(--s3)] py-2 flex items-center gap-3 text-sm", className)} role="status">
      <ScrollText size={16} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="font-medium">{rows.length === 1 ? "1 policy to read & confirm" : `${rows.length} policies to read & confirm`}</span>
        <span className="text-xs opacity-80 block truncate">{first.title} · {humanize(first.category)} · v{first.version} · effective {fmtDate(first.effective_on)}{first.has_quiz ? " · short quiz" : ""}{rows.length > 1 ? ` · +${rows.length - 1} more` : ""}</span>
      </div>
      <Link href={`/policies/${first.id}`} className="btn btn-primary btn-sm shrink-0">Read now <ArrowRight size={13} /></Link>
    </div>
  );
}

export default PendingPoliciesBanner;
