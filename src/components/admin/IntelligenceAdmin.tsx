"use client";

import * as React from "react";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Pill, Skeleton, Stat } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { callAI, type AskResponse } from "@/lib/ai/types";
import { cn, humanize } from "@/lib/utils";
import { useAIStatus } from "@/components/ai/useAIStatus";
import { AIMarkdown } from "@/components/ai/AIMarkdown";
import { BuddyControlCenter } from "./BuddyControlCenter";

type UsageRow = { feature: string; user_id: string | null; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; created_at: string; latency_ms: number | null };
type Totals = { calls: number; input: number; output: number; cacheRead: number; cacheWrite: number; cost: number };

/* Estimated list prices per 1M tokens (Opus 5). Cache write is billed at 1.25x input. */
const PRICE = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 };
const DAY = 86400e3;

const FEATURE_LABEL: Record<string, string> = {
  ask: "Ask GHL",
  brief_morning: "Morning brief",
  brief_eod: "End-of-day summary",
  risk_report: "Management briefing",
  risks_project: "Project risks",
  project_summary: "Project summary",
  meeting_extract: "Meeting extraction",
  extract_tasks: "Tasks from text",
  delegate_parse: "Delegation parsing",
  catch_up: "Catch me up",
  search: "AI search",
  inbox_digest: "Inbox digest",
  "buddy:chat": "GHL Buddy",
  "buddy:stuck": "Buddy · I'm stuck",
};
const featureLabel = (f: string) => FEATURE_LABEL[f] || (f.startsWith("buddy:") ? `Buddy · ${humanize(f.slice(6))}` : humanize(f));

function emptyTotals(): Totals {
  return { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
}
function costOf(r: Pick<UsageRow, "input_tokens" | "output_tokens" | "cache_read_tokens" | "cache_write_tokens">) {
  return (r.input_tokens * PRICE.input + r.output_tokens * PRICE.output + r.cache_read_tokens * PRICE.cacheRead + r.cache_write_tokens * PRICE.cacheWrite) / 1e6;
}
function add(t: Totals, r: UsageRow) {
  t.calls += 1;
  t.input += r.input_tokens;
  t.output += r.output_tokens;
  t.cacheRead += r.cache_read_tokens;
  t.cacheWrite += r.cache_write_tokens;
  t.cost += costOf(r);
}
async function fetchUsage(): Promise<{ rows: UsageRow[]; now: number; error?: string }> {
  const now = Date.now();
  const since = new Date(now - 30 * DAY).toISOString();
  const { data, error } = await createClient()
    .from("ai_usage")
    .select("feature,user_id,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,created_at,latency_ms")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  return { rows: (data as UsageRow[]) || [], now, error: error?.message };
}
const fmtTokens = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const fmtUsd = (n: number) => (n < 0.01 && n > 0 ? "<$0.01" : `$${n.toFixed(2)}`);

/** Admin → Intelligence: configuration status, usage & estimated cost, and a live test of the assistant. */
export function IntelligenceAdmin() {
  const ai = useAIStatus();
  const { people } = useSession();
  const [usage, setUsage] = React.useState<{ rows: UsageRow[]; now: number; error?: string } | null>(null);
  const [test, setTest] = React.useState<{ busy: boolean; answer?: string; error?: string; ms?: number }>({ busy: false });

  const [tick, setTick] = React.useState(0);
  const loadUsage = () => setTick((t) => t + 1);

  React.useEffect(() => {
    let alive = true;
    fetchUsage().then((u) => alive && setUsage(u));
    return () => {
      alive = false;
    };
  }, [tick]);

  const agg = React.useMemo(() => {
    if (!usage) return null;
    const { rows, now } = usage;
    const t7 = emptyTotals();
    const t30 = emptyTotals();
    const byFeature = new Map<string, Totals>();
    const byUser = new Map<string, Totals>();
    const daily = new Map<string, Totals>();
    for (let i = 29; i >= 0; i--) daily.set(format(new Date(now - i * DAY), "yyyy-MM-dd"), emptyTotals());
    let latency = 0;
    let latencyN = 0;
    for (const r of rows) {
      const ts = new Date(r.created_at).getTime();
      add(t30, r);
      if (now - ts <= 7 * DAY) add(t7, r);
      const f = byFeature.get(r.feature) || emptyTotals();
      add(f, r);
      byFeature.set(r.feature, f);
      const uk = r.user_id || "unknown";
      const u = byUser.get(uk) || emptyTotals();
      add(u, r);
      byUser.set(uk, u);
      const dk = format(new Date(ts), "yyyy-MM-dd");
      const d = daily.get(dk);
      if (d) add(d, r);
      if (r.latency_ms) {
        latency += r.latency_ms;
        latencyN++;
      }
    }
    const features = [...byFeature.entries()].sort((a, b) => b[1].cost - a[1].cost);
    const users = [...byUser.entries()].sort((a, b) => b[1].calls - a[1].calls).slice(0, 10);
    const days = [...daily.entries()];
    const maxCalls = Math.max(1, ...days.map(([, d]) => d.calls));
    return { t7, t30, features, users, days, maxCalls, avgLatency: latencyN ? Math.round(latency / latencyN) : null };
  }, [usage]);

  const runTest = async () => {
    setTest({ busy: true });
    const started = Date.now();
    try {
      const res = await callAI<AskResponse>("ask", { message: "Say hello and confirm you can see today's date" });
      setTest({ busy: false, answer: res.answer, ms: Date.now() - started });
      loadUsage();
    } catch (e) {
      setTest({ busy: false, error: (e as Error).message || "Request failed", ms: Date.now() - started });
    }
  };

  const personName = (id: string) => people.find((p) => p.id === id)?.full_name || (id === "unknown" ? "Unknown" : "Former member");

  return (
    <div className="space-y-[var(--s4)]">
      {/* Status */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-[var(--s3)]">
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><Sparkles size={15} className="text-[var(--accent)]" /> Intelligence status</span>} subtitle="Ask GHL, briefs, summaries, extraction and AI search share one configuration" />
          <div className="px-[var(--s4)] pb-[var(--s4)] space-y-3">
            {ai.loading ? (
              <Skeleton className="h-5 w-40" />
            ) : ai.enabled ? (
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="tone-success"><CheckCircle2 size={12} /> Enabled</Pill>
                <span className="text-sm">Model <code className="num">{ai.model}</code></span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="tone-danger"><XCircle size={12} /> Not configured</Pill>
                <span className="text-sm text-muted">The API key is missing, so every AI feature shows a “not configured” note.</span>
              </div>
            )}
            <div className="text-sm">
              <div className="eyebrow mb-1.5">How to configure</div>
              <ol className="list-decimal pl-5 space-y-1 text-2">
                <li>Create an API key in the Anthropic Console.</li>
                <li>Netlify → Site configuration → Environment variables → add <code>ANTHROPIC_API_KEY</code>.</li>
                <li>Optional: <code>AI_MODEL</code> to pin a model (defaults to <code>claude-opus-5</code>).</li>
                <li>Trigger a new deploy. Status here turns green on the next page load.</li>
              </ol>
              <p className="text-xs text-muted mt-2">Keys are read on the server only and never sent to the browser. All AI reads go through row-level security as the signed-in user.</p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Test the assistant" subtitle="Sends one short question through /api/ai/ask as you" action={<Button size="sm" variant="primary" onClick={runTest} loading={test.busy} disabled={ai.loading || !ai.enabled}><Sparkles size={13} /> Run test</Button>} />
          <div className="px-[var(--s4)] pb-[var(--s4)]">
            {test.busy ? (
              <div className="space-y-2"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-2/3" /></div>
            ) : test.error ? (
              <div className="flex items-start gap-2 text-sm text-danger rounded-[var(--radius-sm)] border border-[var(--danger)] px-3 py-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span className="min-w-0 break-words">{test.error}</span>
              </div>
            ) : test.answer ? (
              <div>
                <AIMarkdown source={test.answer} className="text-sm" />
                <div className="text-[11px] text-muted num mt-2">Answered in {((test.ms || 0) / 1000).toFixed(1)}s</div>
              </div>
            ) : (
              <p className="text-sm text-muted">Prompt: <em>“Say hello and confirm you can see today’s date.”</em> A healthy answer greets you and names today’s date in IST.</p>
            )}
          </div>
        </Card>
      </div>

      {/* GHL Buddy control center */}
      <BuddyControlCenter />

      {/* Usage */}
      <div className="flex items-center justify-between gap-2">
        <div className="h2">Usage</div>
        <Button size="sm" variant="ghost" onClick={() => { setUsage(null); loadUsage(); }} disabled={!usage}><RefreshCw size={13} /> Refresh</Button>
      </div>
      {usage?.error && <div className="text-sm text-danger">{usage.error}</div>}
      {!agg ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--s3)]">{[0, 1, 2, 3].map((i) => <Card key={i} className="p-[var(--s4)]"><Skeleton className="h-3 w-1/2 mb-2" /><Skeleton className="h-6 w-1/3" /></Card>)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--s3)] stagger">
            <Stat label="Calls · 7 days" value={agg.t7.calls} sub={`${fmtTokens(agg.t7.input + agg.t7.cacheRead + agg.t7.cacheWrite)} in · ${fmtTokens(agg.t7.output)} out`} />
            <Stat label="Est. cost · 7 days" value={fmtUsd(agg.t7.cost)} sub="list prices, estimate" />
            <Stat label="Calls · 30 days" value={agg.t30.calls} sub={`${fmtTokens(agg.t30.input + agg.t30.cacheRead + agg.t30.cacheWrite)} in · ${fmtTokens(agg.t30.output)} out`} />
            <Stat label="Est. cost · 30 days" value={fmtUsd(agg.t30.cost)} sub={agg.avgLatency ? `avg ${(agg.avgLatency / 1000).toFixed(1)}s per call` : "list prices, estimate"} />
          </div>

          <Card>
            <CardHeader title="Calls per day" subtitle="Last 30 days" />
            <div className="px-[var(--s4)] pb-[var(--s4)]">
              {agg.t30.calls === 0 ? (
                <EmptyState title="No AI usage yet" hint="Usage appears here as soon as someone asks GHL, opens a brief or runs an extraction." className="py-6" />
              ) : (
                <div className="flex items-end gap-[3px] h-28 border-b">
                  {agg.days.map(([day, d]) => (
                    <div key={day} className="flex-1 min-w-0 h-full flex flex-col justify-end group" title={`${format(new Date(day), "d MMM")}: ${d.calls} call${d.calls === 1 ? "" : "s"} · ${fmtUsd(d.cost)}`}>
                      <div className={cn("w-full rounded-t-[3px] transition-[height]", d.calls ? "bg-[var(--brand-2)] group-hover:bg-[var(--brand)]" : "bg-[var(--bg-sunken)]")} style={{ height: d.calls ? `${Math.max(4, (d.calls / agg.maxCalls) * 100)}%` : 2 }} />
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between text-[10px] text-muted num mt-1">
                <span>{format(new Date(agg.days[0][0]), "d MMM")}</span>
                <span>{format(new Date(agg.days[agg.days.length - 1][0]), "d MMM")}</span>
              </div>
            </div>
          </Card>

          <div className="grid lg:grid-cols-2 gap-[var(--s3)]">
            <Card>
              <CardHeader title="By feature" subtitle="Last 30 days" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="text-left text-[11px] text-muted border-b">
                      <th className="px-4 py-2 font-medium">Feature</th>
                      <th className="px-3 py-2 font-medium text-right">Calls</th>
                      <th className="px-3 py-2 font-medium text-right">Input</th>
                      <th className="px-3 py-2 font-medium text-right">Output</th>
                      <th className="px-3 py-2 font-medium text-right">Cache read</th>
                      <th className="px-4 py-2 font-medium text-right">Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agg.features.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-muted">No usage yet</td></tr>}
                    {agg.features.map(([f, t]) => (
                      <tr key={f} className="border-b last:border-0">
                        <td className="px-4 py-2">{featureLabel(f)}</td>
                        <td className="px-3 py-2 text-right num">{t.calls}</td>
                        <td className="px-3 py-2 text-right num text-muted">{fmtTokens(t.input)}</td>
                        <td className="px-3 py-2 text-right num text-muted">{fmtTokens(t.output)}</td>
                        <td className="px-3 py-2 text-right num text-muted">{fmtTokens(t.cacheRead)}</td>
                        <td className="px-4 py-2 text-right num">{fmtUsd(t.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 pb-3 text-[11px] text-muted">Estimate at ${PRICE.input}/M input · ${PRICE.output}/M output · ${PRICE.cacheRead}/M cache read · ${PRICE.cacheWrite}/M cache write. Actual invoices may differ.</div>
            </Card>
            <Card>
              <CardHeader title="Top users" subtitle="Last 30 days · by calls" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[360px]">
                  <thead>
                    <tr className="text-left text-[11px] text-muted border-b">
                      <th className="px-4 py-2 font-medium">Person</th>
                      <th className="px-3 py-2 font-medium text-right">Calls</th>
                      <th className="px-3 py-2 font-medium text-right">Tokens</th>
                      <th className="px-4 py-2 font-medium text-right">Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agg.users.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-muted">No usage yet</td></tr>}
                    {agg.users.map(([id, t]) => (
                      <tr key={id} className="border-b last:border-0">
                        <td className="px-4 py-2 truncate max-w-[220px]">{personName(id)}</td>
                        <td className="px-3 py-2 text-right num">{t.calls}</td>
                        <td className="px-3 py-2 text-right num text-muted">{fmtTokens(t.input + t.output + t.cacheRead + t.cacheWrite)}</td>
                        <td className="px-4 py-2 text-right num">{fmtUsd(t.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
