"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Avatar, SearchInput } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { cn } from "@/lib/utils";

/** Searchable checkbox list of people. Selected people are shown first. */
export function PeopleMultiSelect({ value, onChange, exclude = [], maxHeight = 220, placeholder = "Search people…" }: { value: string[]; onChange: (ids: string[]) => void; exclude?: string[]; maxHeight?: number; placeholder?: string }) {
  const { people, departments } = useSession();
  const [q, setQ] = React.useState("");
  const deptName = React.useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
  const selected = React.useMemo(() => new Set(value), [value]);
  const list = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people
      .filter((p) => !exclude.includes(p.id))
      .filter((p) => !needle || p.full_name.toLowerCase().includes(needle) || (p.designation || "").toLowerCase().includes(needle) || (deptName.get(p.department_id || "") || "").toLowerCase().includes(needle))
      .sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)) || a.full_name.localeCompare(b.full_name));
  }, [people, exclude, q, deptName, selected]);

  const toggle = (id: string) => onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="rounded-[var(--radius-sm)] border overflow-hidden">
      <div className="p-2 border-b bg-[var(--bg-sunken)]">
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      </div>
      <div className="overflow-y-auto" style={{ maxHeight }}>
        {list.length === 0 && <div className="text-sm text-muted px-3 py-3">No one matches.</div>}
        {list.map((p) => {
          const on = selected.has(p.id);
          return (
            <button type="button" key={p.id} onClick={() => toggle(p.id)} className={cn("w-full flex items-center gap-2.5 px-3 py-2 text-left row-hover", on && "bg-[color-mix(in_oklab,var(--brand)_7%,transparent)]")}>
              <span className={cn("w-4 h-4 rounded border inline-flex items-center justify-center shrink-0", on ? "bg-[var(--brand)] border-[var(--brand)] text-[var(--brand-fg)]" : "border-[var(--line-strong)]")}>{on && <Check size={11} />}</span>
              <Avatar name={p.full_name} src={p.avatar_url} size={22} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm truncate">{p.full_name}</span>
                <span className="block text-[11px] text-muted truncate">{[p.designation, deptName.get(p.department_id || "")].filter(Boolean).join(" · ")}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="px-3 py-1.5 border-t text-[11px] text-muted num">{value.length} selected</div>
    </div>
  );
}

/** Department multi-select as toggle chips. */
export function DepartmentChips({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { departments } = useSession();
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {departments.map((d) => {
        const on = value.includes(d.id);
        return (
          <button type="button" key={d.id} onClick={() => toggle(d.id)} className={cn("pill pill-lg border transition-colors", on ? "tone-brand border-transparent" : "tone-neutral border-transparent hover:border-[var(--line-strong)]")}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? "currentColor" : d.color }} />
            {d.name}
          </button>
        );
      })}
    </div>
  );
}
