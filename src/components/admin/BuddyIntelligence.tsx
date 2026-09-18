"use client";

import * as React from "react";
import Link from "next/link";
import { Activity, AlertTriangle, BookOpen, Bot, Coins, Gauge, RefreshCw, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, CardHeader, EmptyState, Pill, Select, Skeleton, Stat } from "@/components/ui";
import { ago, humanize } from "@/lib/utils";
import { estimateCostUsd, usd } from "@/lib/ai/pricing";

/*
  The Buddy Intelligence Console (§15).

  Feedback had been collected since 0011 and read by nobody; routing has been recorded since 0061;
  usage since 0002. This is the screen that asks those three tables the questions an administrator
  actually has — is Buddy answering well, what is it answering badly, which knowledge is carrying
  the answers, which knowledge is rotting, and what is it all costing.

  Every number comes from a SECURITY DEFINER function gated on `can_see_ai_console()` — the same
  gate as the AI control centre this sits inside, so it grants nobody anything new. Nothing here is
  a judgement about a person: the unit is the *question*, never who asked it.
*/

type Quality = {
  days: number;
  answers: number;
  confidence: Record<string, number> | null;
  low_confidence_rate: number;
  grounded_rate: number;
  proposal_rate: number;
  feedback: Record<string, number> | null;
  unresolved_flags: number;
  by_intent: { intent: string; answers: number; insufficient: number; insufficient_rate: number; routed_by: string | null; flags: number }[];
  by_mode: { mode: string; answers: number }[];
};
type Cost = {
  days: number;
  total: { requests: number; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; p50_latency_ms: number | null };
  by_model: { model: string; requests: number; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number }[];
  by_feature: { feature: string; requests: number; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; model: string | null }[];
};
type Persona = { key: string; name: string; answers: number; grounded_rate: number; insufficient_rate: number; proposals: number; flags: number };
type ToolRow = { name: string; calls: number; errors: number; empty: number; error_rate: number; empty_rate: number; p50_ms: number | null };
type Verification = { performed: number; verified: number; failed: number; unchecked: number; failures: { kind: string; entity: string | null; id: string | null; when: string | null }[] };
type Health = {
  id: string; title: string; kind: string; department: string | null; owner: string | null;
  review_at: string | null; outdated: boolean; cited: number; helpful: number; flags: number; last_flagged: string | null;
}[];

export function BuddyIntelligence() {
  const [days, setDays] = React.useState(30);
  const [tick, setTick] = React.useState(0);
  const [allowed, setAllowed] = React.useState<boolean | null>(null);
  const [quality, setQuality] = React.useState<Quality | null>(null);
  const [cost, setCost] = React.useState<Cost | null>(null);
  const [health, setHealth] = React.useState<Health | null>(null);
  const [verif, setVerif] = React.useState<Verification | null>(null);
  const [personas, setPersonas] = React.useState<Persona[] | null>(null);
  const [toolRows, setToolRows] = React.useState<ToolRow[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = createClient();
      const { data: may } = await supabase.rpc("can_see_ai_console");
      if (!alive) return;
      setAllowed(!!may);
      if (!may) return;
      const [q, c, h, v, ap, th] = await Promise.all([
        supabase.rpc("answer_quality", { p_days: days }),
        supabase.rpc("ai_cost_summary", { p_days: days }),
        supabase.rpc("knowledge_health", { p_days: Math.max(days, 90) }),
        supabase.rpc("action_verification", { p_days: days }),
        supabase.rpc("assistant_performance", { p_days: days }),
        supabase.rpc("tool_health", { p_days: days }),
      ]);
      if (!alive) return;
      setQuality((q.data || null) as unknown as Quality | null);
      setCost((c.data || null) as unknown as Cost | null);
      setHealth((h.data || []) as unknown as Health);
      setVerif((v.data || null) as unknown as Verification | null);
      setPersonas((ap.data || []) as unknown as Persona[]);
      setToolRows((th.data || []) as unknown as ToolRow[]);
    })();
    return () => { alive = false; };
  }, [days, tick]);

  // `estimateCostUsd` returns null for a model with no published price — an unknown price is not
  // zero, so those rows say so instead of contributing a made-up number to the total.
  const totalCost = React.useMemo(() => {
    if (!cost) return { known: 0, unknown: 0 };
    let known = 0, unknown = 0;
    for (const m of cost.by_model) {
      const c = estimateCostUsd(m.model, m);
      if (c === null) unknown += 1; else known += c;
    }
    return { known, unknown };
  }, [cost]);

  if (allowed === false) return null;

  const struggling = (quality?.by_intent || []).filter((i) => i.answers >= 1 && (i.insufficient > 0 || i.flags > 0));
  const rotting = (health || []).filter((k) => k.flags > 0 || k.outdated);
  // Approved, permission-cleared, and never once used to answer anything in the period.
  const unused = (health || []).filter((k) => k.cited === 0 && k.flags === 0 && !k.outdated);
  const troubled = (toolRows || []).filter((t) => t.errors > 0 || (t.calls >= 3 && t.empty_rate >= 80));

  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex items-center gap-2"><Gauge size={15} /> Buddy intelligence</span>}
        subtitle="How well Buddy is answering, what it struggles with, which knowledge is carrying it — and what that costs. Questions, never people."
        action={
          <div className="flex items-center gap-2">
            <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="!h-8 !text-xs w-[110px]">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </Select>
            <Button size="xs" variant="ghost" icon aria-label="Refresh" onClick={() => setTick((t) => t + 1)}><RefreshCw size={13} /></Button>
          </div>
        }
      />

      <div className="p-[var(--s4)] border-t space-y-[var(--s4)]">
        {allowed === null || !quality ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
              <Stat label="Answers" value={quality.answers} sub={`last ${quality.days} days`} icon={<Activity size={14} />} />
              <Stat
                label="Grounded"
                value={`${quality.grounded_rate}%`}
                sub="used live data or approved knowledge"
                tone={quality.grounded_rate >= 70 ? "tone-success" : quality.grounded_rate >= 40 ? "tone-warn" : "tone-danger"}
              />
              <Stat
                label="Couldn't answer"
                value={`${quality.low_confidence_rate}%`}
                sub="said so instead of guessing"
                tone={quality.low_confidence_rate <= 15 ? "tone-success" : quality.low_confidence_rate <= 35 ? "tone-warn" : "tone-danger"}
              />
              <Stat
                label="Open flags"
                value={quality.unresolved_flags}
                sub="wrong · outdated · unsafe"
                tone={quality.unresolved_flags === 0 ? "tone-success" : "tone-warn"}
              />
              <Stat
                label="Actions checked"
                value={verif ? `${verif.verified}/${verif.performed}` : "—"}
                sub={verif && verif.failed > 0 ? `${verif.failed} could not be read back` : "created and read back"}
                tone={verif && verif.failed > 0 ? "tone-danger" : undefined}
              />
              <Stat
                label="Estimated cost"
                value={usd(totalCost.known)}
                sub={totalCost.unknown ? `${totalCost.unknown} model(s) with no published price` : `${cost?.total.requests ?? 0} requests`}
                icon={<Coins size={14} />}
              />
            </div>

            {/* Where Buddy struggles — the reason 0061 records the routing decision on every answer */}
            <div>
              <div className="eyebrow mb-2">Where Buddy struggles</div>
              {!struggling.length ? (
                <div className="text-sm text-muted rounded-[var(--radius-sm)] sunken p-3">
                  Nothing stands out: no kind of question is coming back unanswered or flagged in this period.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-[var(--radius-sm)] border">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                        <th className="px-3 py-2 font-medium">Kind of question</th>
                        <th className="px-3 py-2 font-medium">Asked</th>
                        <th className="px-3 py-2 font-medium">Couldn&apos;t answer</th>
                        <th className="px-3 py-2 font-medium">Flagged</th>
                        <th className="px-3 py-2 font-medium">Routed by</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {struggling.map((i) => (
                        <tr key={i.intent} className="row-hover">
                          <td className="px-3 py-2">{humanize(i.intent)}</td>
                          <td className="px-3 py-2 num">{i.answers}</td>
                          <td className="px-3 py-2">
                            <Pill tone={i.insufficient_rate >= 50 ? "tone-danger" : i.insufficient_rate > 0 ? "tone-warn" : "tone-success"}>{i.insufficient_rate}%</Pill>
                          </td>
                          <td className="px-3 py-2 num">{i.flags || "—"}</td>
                          <td className="px-3 py-2 text-muted text-xs">{i.routed_by ? humanize(i.routed_by) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="text-[11px] text-muted mt-1.5">
                A high &ldquo;couldn&apos;t answer&rdquo; rate is usually a knowledge gap, not a model problem — Buddy is
                designed to say so rather than guess. Write the missing SOP and it disappears.
              </div>
            </div>

            {/* Anything Buddy said it did that could not be read back afterwards (0064) */}
            {verif && verif.failed > 0 && (
              <div>
                <div className="eyebrow mb-2 inline-flex items-center gap-1.5 text-danger"><AlertTriangle size={12} /> Confirmed but not there</div>
                <ul className="rounded-[var(--radius-sm)] border divide-y">
                  {verif.failures.map((f, i) => (
                    <li key={`${f.id}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <Pill tone="tone-danger" className="shrink-0">{humanize(f.kind)}</Pill>
                      <span className="text-muted truncate flex-1">{f.entity ? `${humanize(f.entity)} could not be read back` : "could not be read back"}</span>
                      <span className="text-[11px] text-muted shrink-0">{f.when ? ago(f.when) : ""}</span>
                    </li>
                  ))}
                </ul>
                <div className="text-[11px] text-muted mt-1.5">
                  Somebody confirmed one of Buddy&apos;s proposals, the write returned no error, and the row could not
                  be read back afterwards. That is usually a permission rule refusing the write silently — worth
                  checking, because the person was told it worked.
                </div>
              </div>
            )}

            {/* Knowledge that needs attention */}
            <div>
              <div className="eyebrow mb-2 inline-flex items-center gap-1.5"><BookOpen size={12} /> Knowledge needing attention</div>
              {!health ? (
                <Skeleton className="h-10" />
              ) : !rotting.length ? (
                <div className="text-sm text-muted rounded-[var(--radius-sm)] sunken p-3">
                  No approved article is flagged or past its review date.
                </div>
              ) : (
                <ul className="rounded-[var(--radius-sm)] border divide-y">
                  {rotting.slice(0, 8).map((k) => (
                    <li key={k.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <Link href={`/wiki/knowledge/${k.id}`} className="font-medium hover:underline truncate block">{k.title}</Link>
                        <div className="text-[11px] text-muted">
                          {k.department || "company-wide"}{k.owner ? ` · owner ${k.owner}` : " · no owner"} · cited {k.cited}×
                          {k.last_flagged ? ` · last flagged ${ago(k.last_flagged)}` : ""}
                        </div>
                      </div>
                      {k.flags > 0 && <Pill tone="tone-danger" className="shrink-0"><AlertTriangle size={11} /> {k.flags} reported wrong</Pill>}
                      {k.outdated && <Pill tone="tone-warn" className="shrink-0">review overdue</Pill>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="text-[11px] text-muted mt-1.5">
                Buddy already warns people when it cites one of these. Resolving the flag in the feedback queue below
                removes the warning.
              </div>
            </div>

            {/* Which persona is answering, and how well (§15 — per persona, never per person) */}
            {!!personas?.length && (
              <div>
                <div className="eyebrow mb-2 inline-flex items-center gap-1.5"><Bot size={12} /> By assistant</div>
                <div className="overflow-x-auto rounded-[var(--radius-sm)] border">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                        <th className="px-3 py-2 font-medium">Assistant</th>
                        <th className="px-3 py-2 font-medium">Answers</th>
                        <th className="px-3 py-2 font-medium">Grounded</th>
                        <th className="px-3 py-2 font-medium">Couldn&apos;t answer</th>
                        <th className="px-3 py-2 font-medium">Proposed</th>
                        <th className="px-3 py-2 font-medium">Flagged</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {personas.map((p) => (
                        <tr key={p.key} className="row-hover">
                          <td className="px-3 py-2">{p.name}</td>
                          <td className="px-3 py-2 num">{p.answers}</td>
                          <td className="px-3 py-2 num">{p.grounded_rate}%</td>
                          <td className="px-3 py-2"><Pill tone={p.insufficient_rate >= 50 ? "tone-danger" : p.insufficient_rate > 0 ? "tone-warn" : "tone-success"}>{p.insufficient_rate}%</Pill></td>
                          <td className="px-3 py-2 num">{p.proposals || "—"}</td>
                          <td className="px-3 py-2 num">{p.flags || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tools that error, or that never find anything */}
            {!!troubled.length && (
              <div>
                <div className="eyebrow mb-2 inline-flex items-center gap-1.5"><Wrench size={12} /> Tools needing a look</div>
                <ul className="rounded-[var(--radius-sm)] border divide-y">
                  {troubled.slice(0, 6).map((t) => (
                    <li key={t.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <code className="text-xs">{t.name}</code>
                      <span className="text-muted text-xs flex-1 truncate">
                        {t.calls} call{t.calls === 1 ? "" : "s"}
                        {t.errors > 0 ? ` · ${t.errors} errored` : ""}
                        {t.empty_rate >= 80 ? ` · came back empty ${t.empty_rate}% of the time` : ""}
                        {t.p50_ms !== null ? ` · median ${t.p50_ms}ms` : ""}
                      </span>
                      <Pill tone={t.errors > 0 ? "tone-danger" : "tone-warn"} className="shrink-0">{t.errors > 0 ? "erroring" : "always empty"}</Pill>
                    </li>
                  ))}
                </ul>
                <div className="text-[11px] text-muted mt-1.5">
                  A tool that is always empty is usually a permission or data problem rather than a broken tool — the
                  data it reads may not exist yet, or the assistant&apos;s data scopes may exclude it.
                </div>
              </div>
            )}

            {/* Approved knowledge nobody is using */}
            {unused.length > 0 && (
              <div className="text-[11px] text-muted">
                <span className="font-medium text-[var(--fg)]">{unused.length}</span> approved article{unused.length === 1 ? " has" : "s have"} not been
                used to answer anything in this period. Not necessarily a problem — but if people keep asking what they
                cover, the wording is probably not matching the words they use.
              </div>
            )}

            {/* What it costs, by what */}
            {cost && cost.by_feature.length > 0 && (
              <div>
                <div className="eyebrow mb-2 inline-flex items-center gap-1.5"><Coins size={12} /> Cost by feature</div>
                <div className="overflow-x-auto rounded-[var(--radius-sm)] border">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                        <th className="px-3 py-2 font-medium">Feature</th>
                        <th className="px-3 py-2 font-medium">Requests</th>
                        <th className="px-3 py-2 font-medium">Model</th>
                        <th className="px-3 py-2 font-medium">Tokens in / out</th>
                        <th className="px-3 py-2 font-medium">Estimated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {cost.by_feature.slice(0, 10).map((f) => (
                        <tr key={f.feature} className="row-hover">
                          <td className="px-3 py-2">{humanize(f.feature.replace(/:/g, " · "))}</td>
                          <td className="px-3 py-2 num">{f.requests}</td>
                          <td className="px-3 py-2 text-xs text-muted">{f.model || "—"}</td>
                          <td className="px-3 py-2 num text-xs">{(f.input_tokens || 0).toLocaleString()} / {(f.output_tokens || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 num">{usd(f.model ? estimateCostUsd(f.model, f) : null)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-[11px] text-muted mt-1.5">
                  Estimated from published per-million-token prices — for proportion and trend, not an invoice. Median
                  response {cost.total.p50_latency_ms ? `${(cost.total.p50_latency_ms / 1000).toFixed(1)}s` : "—"}.
                  Each kind of work can be pointed at a different model with an <code>AI_MODEL_*</code> variable.
                </div>
              </div>
            )}

            {quality.answers === 0 && (
              <EmptyState title="No answers yet in this period" hint="Once people start asking Buddy, this fills in." className="py-[var(--s3)]" />
            )}
          </>
        )}
      </div>
    </Card>
  );
}
