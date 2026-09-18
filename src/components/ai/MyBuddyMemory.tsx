"use client";

import * as React from "react";
import { Brain, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Pill, Skeleton, useToast } from "@/components/ui";
import { ago, fmtDate } from "@/lib/utils";

/**
 * Everything GHL Buddy remembers about you, and the button that removes it (schema 0062).
 *
 * §33: everything an employee's data shows is visible to the employee too. An assistant that builds
 * up a private picture of somebody they cannot read is exactly the thing that principle rules out —
 * so this is the whole of it, with where each piece came from, and every row can be deleted.
 *
 * `my_memory()` and `forget_memory()` read and write the caller's own rows under the `aim_all`
 * policy, so this component can only ever show one person their own memory.
 */

type Row = {
  key: string;
  text: string | null;
  kind: "fact" | "preference" | "instruction" | "decision" | "inference" | "uncertain";
  confidence: number | null;
  source: string | null;
  project: string | null;
  department: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  version: number;
  expired: boolean;
};

const KIND: Record<Row["kind"], { label: string; tone: string; hint: string }> = {
  fact: { label: "you told me", tone: "tone-success", hint: "Something you stated." },
  preference: { label: "preference", tone: "tone-neutral", hint: "How you like to work." },
  instruction: { label: "standing instruction", tone: "tone-violet", hint: "Something you asked Buddy to always do." },
  decision: { label: "decision", tone: "tone-info", hint: "A decision you recorded." },
  inference: { label: "Buddy worked this out", tone: "tone-warn", hint: "Not something you said — Buddy inferred it, so it may be wrong." },
  uncertain: { label: "unconfirmed", tone: "tone-warn", hint: "Buddy is not sure about this one." },
};

export function MyBuddyMemory() {
  const toast = useToast();
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await createClient().rpc("my_memory");
      if (alive) setRows((Array.isArray(data) ? data : []) as unknown as Row[]);
    })();
    return () => { alive = false; };
  }, []);

  const forget = async (key: string) => {
    setBusy(key);
    const { error } = await createClient().rpc("forget_memory", { p_key: key });
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    setRows((r) => (r || []).filter((x) => x.key !== key));
    toast.push("Forgotten", "success");
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="eyebrow inline-flex items-center gap-1.5"><Brain size={12} /> What GHL Buddy remembers about you</div>
        {rows && <span className="text-[11px] text-muted num">{rows.length} note{rows.length === 1 ? "" : "s"}</span>}
      </div>
      {!rows ? (
        <div className="space-y-2"><Skeleton className="h-5" /><Skeleton className="h-5 w-2/3" /></div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted rounded-[var(--radius-sm)] sunken p-3">
          Buddy has not noted anything about you yet. When it does — how you like to work, what you are focused on — it appears here, and you can delete any of it.
        </div>
      ) : (
        <ul className="rounded-[var(--radius-sm)] border divide-y">
          {rows.map((r) => {
            const k = KIND[r.kind] || KIND.preference;
            return (
              <li key={r.key} className="flex items-start gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium">{r.key}</span>
                    <Pill tone={k.tone} className="!text-[10px]" title={k.hint}>{k.label}</Pill>
                    {r.expired && <Pill tone="tone-neutral" className="!text-[10px]" title="Past its expiry date — Buddy no longer uses it">expired</Pill>}
                    {r.version > 1 && <span className="text-[10px] text-muted" title={`Corrected ${r.version - 1} time${r.version === 2 ? "" : "s"}`}>v{r.version}</span>}
                  </div>
                  <div className="text-muted break-words">{r.text}</div>
                  <div className="text-[11px] text-muted mt-0.5">
                    {r.source ? `from ${r.source}` : "source not recorded"}
                    {r.project ? ` · when working on ${r.project}` : ""}
                    {r.department ? ` · ${r.department}` : ""}
                    {" · "}
                    <span title={fmtDate(r.updated_at, true)}>updated {ago(r.updated_at)}</span>
                  </div>
                </div>
                <Button size="xs" variant="ghost" className="text-danger shrink-0" loading={busy === r.key} onClick={() => forget(r.key)} aria-label={`Forget ${r.key}`}>
                  <Trash2 size={13} /> Forget
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="text-[11px] text-muted mt-2">
        This memory is yours alone — nobody else can read it, and it is never treated as company policy. Ask Buddy
        &ldquo;how do you know that?&rdquo; about anything here and it will tell you where it came from.
      </div>
    </div>
  );
}
