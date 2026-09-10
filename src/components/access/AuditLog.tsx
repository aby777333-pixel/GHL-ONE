"use client";

/**
 * ACCESS CONTROL → AUDIT LOG (§18).
 *
 * Everything §18 asks to track was already being written, across four tables that nothing read:
 * `permission_changes` (what a role, a level or a person may do), `config_history` (roles assigned
 * and revoked, roles created and deleted, screen rules), `role_history` (level, title, status and
 * department moves) and `audit_logs`. This is the read side.
 *
 * The wording comes from the database, not from here. `access_audit()` composes each line — who
 * did what to whom, and which permissions moved — so the log reads the same whether it is rendered
 * on this screen, exported, or read straight out of Postgres during an incident. It re-checks
 * authorisation itself and refuses a caller who may not review access; this component never
 * decides who may read it.
 */

import * as React from "react";
import { CalendarDays, Download, Filter, History, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Card, CardHeader, EmptyState, Field, Pill, Select, Spinner, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, cn, fmtDate } from "@/lib/utils";
import type { PermissionRow } from "./lib";

type Row = {
  at: string;
  actor: string;
  actor_id: string | null;
  action: string;
  target: string;
  target_kind: string;
  person_id: string | null;
  role_id: string | null;
  added: string[] | null;
  removed: string[] | null;
  summary: string;
  reason: string | null;
};

/** The categories `access_audit()` emits, in the order an administrator most often wants them. */
const ACTION_LABEL: Record<string, string> = {
  role_assignment: "Role given or taken",
  role_permissions: "What a role can do",
  level_permissions: "What a level can do",
  individual_permission: "Individual allow or deny",
  role_definition: "Role created or deleted",
  scope: "Reach",
  screen_rule: "Screen access",
  profile_change: "Employment record",
};

const ACTION_TONE: Record<string, string> = {
  role_assignment: "tone-violet",
  role_permissions: "tone-brand",
  level_permissions: "tone-brand",
  individual_permission: "tone-warn",
  role_definition: "tone-info",
  scope: "tone-info",
  screen_rule: "tone-neutral",
  profile_change: "tone-neutral",
};

const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "all", label: "Everything", days: null },
];

const PAGE = 100;

export function AuditLog({ catalogue }: { catalogue: PermissionRow[] }) {
  const { people } = useSession();
  const toast = useToast();
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [page, setPage] = React.useState(0);

  const [range, setRange] = React.useState("30");
  const [actor, setActor] = React.useState("");
  const [person, setPerson] = React.useState("");
  const [action, setAction] = React.useState("");
  const [perm, setPerm] = React.useState("");

  const filtered = !!(actor || person || action || perm) || range !== "30";

  /*
   * The fetch lives in the effect and state is only ever set from the promise callback — calling a
   * loader that sets state synchronously from an effect body is a cascading render, and the lint
   * rule that catches it is right. Paging and filtering are plain state that the effect depends on.
   */
  React.useEffect(() => {
    let alive = true;
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    createClient()
      .rpc("access_audit", {
        /* The generated Args type takes `undefined` for an omitted argument, not `null` — a null
           would be sent as an explicit SQL NULL rather than letting the default apply. */
        p_from: days === null ? undefined : new Date(Date.now() - days * 86_400_000).toISOString(),
        p_actor: actor || undefined,
        p_person: person || undefined,
        p_perm: perm || undefined,
        p_action: action || undefined,
        p_limit: PAGE,
        p_offset: page * PAGE,
      })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          // access_audit() refuses a caller who may not review access, and says so plainly.
          toast.push(error.message, "danger");
          setRows([]);
          return;
        }
        setRows((data || []) as Row[]);
      });
    return () => { alive = false; };
  }, [range, actor, person, action, perm, page, toast]);

  /* Any filter change starts again at the first page: page 3 of a different question is nonsense. */
  const onFilter = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(0); };

  function reset() {
    setRange("30");
    setActor("");
    setPerson("");
    setAction("");
    setPerm("");
    setPage(0);
  }

  /** Export what is on screen, not a different query — an export that disagrees with the view is worse than none. */
  function exportCsv() {
    if (!rows?.length) return;
    const esc = (v: string) => `"${(v || "").replace(/"/g, '""')}"`;
    const csv = [
      ["When", "Who", "What happened", "Category", "Target", "Added", "Removed", "Reason"].join(","),
      ...rows.map((r) =>
        [
          esc(new Date(r.at).toISOString()),
          esc(r.actor),
          esc(r.summary),
          esc(ACTION_LABEL[r.action] || r.action),
          esc(r.target),
          esc((r.added || []).join(" ")),
          esc((r.removed || []).join(" ")),
          esc(r.reason || ""),
        ].join(",")
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `access-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-[var(--s3)]">
      <Card>
        <CardHeader
          title={<span className="inline-flex items-center gap-2"><History size={16} /> Audit log</span>}
          subtitle="Every change to who can do what: who made it, to whom, which permissions moved, and why."
          action={
            <div className="flex items-center gap-2">
              {filtered && <Button size="sm" variant="ghost" onClick={reset}><RotateCcw size={14} /> Clear filters</Button>}
              <Button size="sm" variant="secondary" disabled={!rows?.length} onClick={exportCsv}><Download size={14} /> Export</Button>
            </div>
          }
        />
        <div className="px-[var(--s4)] pb-[var(--s4)] grid gap-[var(--s2)] sm:grid-cols-2 lg:grid-cols-5">
          <Field label="When">
            <Select value={range} onChange={(e) => onFilter(setRange)(e.target.value)}>
              {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </Select>
          </Field>
          <Field label="Changed by">
            <PersonPicker value={actor} onChange={onFilter(setActor)} placeholder="Anyone" />
          </Field>
          <Field label="About">
            <PersonPicker value={person} onChange={onFilter(setPerson)} placeholder="Anyone" />
          </Field>
          <Field label="Kind of change">
            <Select value={action} onChange={(e) => onFilter(setAction)(e.target.value)}>
              <option value="">Everything</option>
              {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Permission">
            <Select value={perm} onChange={(e) => onFilter(setPerm)(e.target.value)}>
              <option value="">Any</option>
              {catalogue.filter((p) => !p.platform_only && p.key !== "*").map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        {rows === null ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Filter size={18} />}
            title={filtered ? "Nothing matches those filters" : "No access changes recorded yet"}
            hint={filtered ? "Widen the date range or clear a filter." : "Changes to roles, permissions and access appear here as they happen."}
            className="py-[var(--s6)]"
          />
        ) : (
          <ul className="divide-y">
            {rows.map((r, i) => {
              const who = r.actor_id ? people.find((p) => p.id === r.actor_id) : undefined;
              return (
                <li key={`${r.at}-${i}`} className="flex items-start gap-3 px-[var(--s4)] py-[var(--s3)]">
                  <Avatar name={r.actor} src={who?.avatar_url} size={30} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{r.summary}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <Pill tone={ACTION_TONE[r.action] || "tone-neutral"}>{ACTION_LABEL[r.action] || r.action}</Pill>
                      <span className="text-[11px] text-muted inline-flex items-center gap-1">
                        <CalendarDays size={11} /> {fmtDate(r.at)} · {ago(r.at)}
                      </span>
                    </div>
                    {r.reason ? <p className="text-[11px] text-muted mt-1">Reason given: {r.reason}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {rows && (rows.length === PAGE || page > 0) && (
        <div className="flex items-center justify-between">
          <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</Button>
          <span className="text-[11px] text-muted">Page {page + 1}</span>
          <Button size="sm" variant="ghost" disabled={rows.length < PAGE} onClick={() => setPage(page + 1)}>Older</Button>
        </div>
      )}

      <p className={cn("text-[11px] text-muted px-1")}>
        Entries cannot be edited or deleted — these tables have no write policy at all, so the record is
        append-only. Who acted is stored as text at the time it happened, so it survives that person
        later being removed.
      </p>
    </div>
  );
}
