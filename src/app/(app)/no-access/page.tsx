import Link from "next/link";
import { Lock, PackageOpen } from "lucide-react";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { FEATURE_DISABLED, type Screen } from "@/lib/screens";
import { ScreenAccessRequest } from "@/components/access/ScreenAccessRequest";

/**
 * Landing page when the proxy denies a governed screen. Never a bare "Access denied": explain and
 * offer Request access.
 *
 * Two different refusals reach this page and they need different words and different buttons:
 *
 *   - A PERMISSION rule switched the screen off for this person. Somebody inside the company can
 *     change that, so the page offers Request access and names the kind of rule responsible.
 *   - An ENTITLEMENT: the company's plan does not include the module at all (schema 0053). Nobody
 *     inside the company can say yes to that, so offering the form would send a request to people
 *     with no way to fulfil it. The page says so plainly and points at the person who can.
 */
export default async function NoAccessPage({ searchParams }: { searchParams: Promise<{ screen?: string; from?: string }> }) {
  await getSession();
  const { screen: key, from } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("effective_screens");
  const screen = ((data || []) as Screen[]).find((s) => s.key === key);
  const label = screen?.label || key || "this screen";
  const source = screen?.source;
  const notInPlan = source === FEATURE_DISABLED;

  return (
    <div className="page max-w-2xl">
      <div className="card p-[var(--s5)]">
        <div className="flex items-start gap-[var(--s3)]">
          <div className={`rounded-full p-3 shrink-0 ${notInPlan ? "tone-neutral" : "tone-warn"}`}>
            {notInPlan ? <PackageOpen size={20} /> : <Lock size={20} />}
          </div>
          <div className="min-w-0">
            <div className="eyebrow">{notInPlan ? "Not in your plan" : "Screen not enabled"}</div>
            <h1 className="h2 mt-1">
              {notInPlan ? `${label} is not part of your company's plan` : `${label} is not part of your workspace yet`}
            </h1>
            {notInPlan ? (
              <p className="text-muted mt-2 text-sm">
                This module has not been switched on for your company, so it is not available to anyone here —
                it is nothing to do with your own permissions. Whoever manages your GHL ONE subscription can
                turn it on, and it will appear for everyone entitled to it.
              </p>
            ) : (
              <p className="text-muted mt-2 text-sm">
                Nothing important in GHL ONE is visible without the right permission. This screen is switched off for you
                {source ? <> by a <strong>{source.replace(/_/g, " ")}</strong> rule</> : null}. If you need it for your work, ask below — your manager or the
                administrator decides, and the decision is recorded.
              </p>
            )}
            {from ? <p className="text-xs text-muted mt-1">You tried to open <code>{from}</code>.</p> : null}
          </div>
        </div>
        {!notInPlan && (
          <div className="mt-[var(--s4)]">
            <ScreenAccessRequest screenKey={key || ""} label={label} path={from || screen?.path || ""} />
          </div>
        )}
        <div className="mt-[var(--s4)] flex flex-wrap gap-2">
          <Link href="/" className="btn btn-ghost btn-sm">Back to Home</Link>
          <Link href="/help" className="btn btn-ghost btn-sm">Ask the Help Desk</Link>
        </div>
      </div>
    </div>
  );
}
