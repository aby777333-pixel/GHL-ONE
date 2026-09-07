import Link from "next/link";
import { Lock } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Screen } from "@/lib/screens";
import { ScreenAccessRequest } from "@/components/access/ScreenAccessRequest";

/** Landing page when the proxy denies a governed screen. Never a bare "Access denied": explain and offer Request access. */
export default async function NoAccessPage({ searchParams }: { searchParams: Promise<{ screen?: string; from?: string }> }) {
  await getSession();
  const { screen: key, from } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("effective_screens");
  const screen = ((data || []) as Screen[]).find((s) => s.key === key);
  const label = screen?.label || key || "this screen";
  const source = screen?.source;

  return (
    <div className="page max-w-2xl">
      <div className="card p-[var(--s5)]">
        <div className="flex items-start gap-[var(--s3)]">
          <div className="rounded-full p-3 tone-warn shrink-0"><Lock size={20} /></div>
          <div className="min-w-0">
            <div className="eyebrow">Screen not enabled</div>
            <h1 className="h2 mt-1">{label} is not part of your workspace yet</h1>
            <p className="text-muted mt-2 text-sm">
              Nothing important in GHL ONE is visible without the right permission. This screen is switched off for you
              {source ? <> by a <strong>{source.replace(/_/g, " ")}</strong> rule</> : null}. If you need it for your work, ask below — your manager or the
              administrator decides, and the decision is recorded.
            </p>
            {from ? <p className="text-xs text-muted mt-1">You tried to open <code>{from}</code>.</p> : null}
          </div>
        </div>
        <div className="mt-[var(--s4)]">
          <ScreenAccessRequest screenKey={key || ""} label={label} path={from || screen?.path || ""} />
        </div>
        <div className="mt-[var(--s4)] flex flex-wrap gap-2">
          <Link href="/" className="btn btn-ghost btn-sm">Back to Home</Link>
          <Link href="/help" className="btn btn-ghost btn-sm">Ask the Help Desk</Link>
        </div>
      </div>
    </div>
  );
}
