"use client";

import * as React from "react";
import { CheckCircle2, RefreshCw, ShieldCheck, ShieldX, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Pill, Select, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { rpcError } from "./lib";

type Report = {
  tables: number;
  rls_disabled: string[];
  no_policies: string[];
  org_column_but_unscoped: string[];
  child_tables_no_org: string[];
  checked_at: string;
};

type Probe = {
  caller_org?: string;
  target_org?: string;
  visible_rows?: Record<string, number>;
  isolated?: boolean;
  skipped?: string;
};

const GROUPS: { key: keyof Report; label: string; hint: string; severity: "danger" | "warn" }[] = [
  { key: "rls_disabled", label: "Tables with row-level security switched off", hint: "Anyone signed in could read every company's rows in these tables.", severity: "danger" },
  { key: "no_policies", label: "Tables with security on but no policy", hint: "Nobody can read them — usually a mistake rather than a leak.", severity: "warn" },
  { key: "org_column_but_unscoped", label: "Tables that carry org_id but do not filter on it", hint: "The column exists but no policy uses current_org(): a second company would see the first one's rows.", severity: "danger" },
  { key: "child_tables_no_org", label: "Tables with no company column", hint: "These must reach their company through a parent row. Check each one before release.", severity: "warn" },
];

/**
 * The release check (§146). Plain English first, table names second: a platform owner should be able
 * to read the verdict without knowing what a policy is.
 */
type ReportResult = { report: Report | null; error: string | null };

/** Plain fetch helper — no state, so callers decide when the result is applied. */
async function fetchReport(): Promise<ReportResult> {
  const { data, error } = await createClient().rpc("tenant_isolation_report");
  if (error) return { report: null, error: rpcError(error.message) };
  return { report: data as unknown as Report, error: null };
}

export function IsolationReport({ companies, className }: { companies?: { org_id: string; name: string }[]; className?: string }) {
  const [report, setReport] = React.useState<Report | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [probeOrg, setProbeOrg] = React.useState("");
  const [probe, setProbe] = React.useState<Probe | null>(null);
  const [probing, setProbing] = React.useState(false);

  /* Apply a finished report. Split from the fetch so the mount effect writes state from a callback. */
  const apply = React.useCallback((r: ReportResult) => {
    setLoading(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setError(null);
    setReport(r.report);
  }, []);

  const run = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    apply(await fetchReport());
  }, [apply]);

  React.useEffect(() => {
    let alive = true;
    /* `loading` already starts true, so nothing is set before the answer lands. */
    void fetchReport().then((r) => {
      if (alive) apply(r);
    });
    return () => {
      alive = false;
    };
  }, [apply]);

  async function runProbe() {
    if (!probeOrg) return;
    setProbing(true);
    setProbe(null);
    const { data, error } = await createClient().rpc("tenant_isolation_probe", { p_other_org: probeOrg });
    setProbing(false);
    if (error) {
      setError(rpcError(error.message));
      return;
    }
    setProbe(data as unknown as Probe);
  }

  const problems = report ? GROUPS.filter((g) => g.severity === "danger" && (report[g.key] as string[]).length > 0) : [];
  const clean = report && problems.length === 0;

  return (
    <div className={cn("space-y-[var(--s3)]", className)}>
      <Card className="p-[var(--s4)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Tenant isolation</div>
            <div className="h2 mt-1 flex items-center gap-2">
              {loading && !report ? (
                <>
                  <Spinner /> Checking…
                </>
              ) : error ? (
                <>
                  <ShieldX size={20} className="text-danger" /> Check could not run
                </>
              ) : clean ? (
                <>
                  <ShieldCheck size={20} className="text-success" /> No tables are missing tenant scoping
                </>
              ) : (
                <>
                  <TriangleAlert size={20} className="text-danger" /> {problems.reduce((a, g) => a + (report![g.key] as string[]).length, 0)} tables need attention
                </>
              )}
            </div>
            <p className="text-sm text-muted mt-1">
              {error
                ? error
                : clean
                  ? `Every one of the ${report?.tables} tables in the database either filters by company or is a deliberate platform-wide table. A second company cannot see the first one's rows.`
                  : report
                    ? "Each table below either has row-level security switched off, or carries a company column that no policy actually filters on. Fix these before another company is created."
                    : ""}
            </p>
          </div>
          <Button size="sm" variant="secondary" loading={loading} onClick={run}>
            <RefreshCw size={14} /> Re-check
          </Button>
        </div>

        {report && (
          <div className="mt-[var(--s4)] space-y-[var(--s3)]">
            {GROUPS.map((g) => {
              const list = report[g.key] as string[];
              return (
                <div key={g.key} className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {list.length === 0 ? <CheckCircle2 size={14} className="text-success shrink-0" /> : <TriangleAlert size={14} className={cn("shrink-0", g.severity === "danger" ? "text-danger" : "text-warn")} />}
                    <span className="text-sm font-medium">{g.label}</span>
                    <Pill tone={list.length === 0 ? "tone-success" : g.severity === "danger" ? "tone-danger" : "tone-warn"}>{list.length}</Pill>
                  </div>
                  <div className="text-[11px] text-muted mt-0.5 ml-[22px]">{g.hint}</div>
                  {list.length > 0 && (
                    <div className="ml-[22px] mt-1.5 flex flex-wrap gap-1">
                      {list.map((t) => (
                        <span key={t} className="pill tone-neutral font-mono">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="text-[11px] text-muted pt-1 border-t">Checked {new Date(report.checked_at).toLocaleString()}</div>
          </div>
        )}
      </Card>

      {companies && companies.length > 0 && (
        <Card className="p-[var(--s4)]">
          <div className="eyebrow">Live cross-company probe</div>
          <p className="text-sm text-muted mt-1">
            Runs with <em>your own</em> permissions and counts how many rows of another company you can actually read. Every number must be zero.
          </p>
          <div className="flex flex-wrap items-end gap-2 mt-[var(--s3)]">
            <label className="min-w-0 flex-1 max-w-xs">
              <span className="label">Company to probe</span>
              <Select value={probeOrg} onChange={(e) => setProbeOrg(e.target.value)}>
                <option value="">Select a company…</option>
                {companies.map((c) => (
                  <option key={c.org_id} value={c.org_id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
            <Button variant="secondary" loading={probing} disabled={!probeOrg} onClick={runProbe}>
              Run probe
            </Button>
          </div>

          {probe && (
            <div className="mt-[var(--s3)]">
              {probe.skipped ? (
                <div className="text-sm text-muted">That is your own company — nothing to probe.</div>
              ) : (
                <>
                  <div className={cn("text-sm font-medium flex items-center gap-1.5", probe.isolated ? "text-success" : "text-danger")}>
                    {probe.isolated ? <ShieldCheck size={15} /> : <ShieldX size={15} />}
                    {probe.isolated ? "Isolated — you cannot read a single row of that company." : "LEAK — you can read rows that belong to another company."}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2">
                    {Object.entries(probe.visible_rows || {}).map(([k, v]) => (
                      <div key={k} className={cn("rounded-[var(--radius-sm)] px-2 py-1.5", Number(v) > 0 ? "tone-danger" : "sunken")}>
                        <div className="text-[10px] text-muted capitalize">{k.replace(/_/g, " ")}</div>
                        <div className="text-sm font-semibold num">{v}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
