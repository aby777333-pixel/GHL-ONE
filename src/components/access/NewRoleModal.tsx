"use client";

/**
 * Create a company's own role — from a curated starting point, or by copying one it already has.
 *
 * Until this existed the Roles tab could edit the seeded roles and nothing else, so "a company
 * defines its own roles" was not actually true.
 *
 * A template is COPIED, never linked: the company owns the result from the moment it is made, and
 * editing it later has nothing to do with the template. That is what makes it a starting point
 * rather than a parent.
 *
 * Nothing here decides whether the creator may grant what the template contains — `guard_system_role`
 * does that on insert and refuses by naming the permission. Showing its message verbatim beats
 * pre-filtering the list, because it tells the creator exactly which key they are missing.
 */

import * as React from "react";
import { Plus, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Modal, Pill, Spinner, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, ROLE_LABEL, type RoleLevel } from "@/lib/utils";
import type { RoleRow } from "./RoleMatrix";

type Template = {
  key: string;
  name: string;
  description: string;
  category: string;
  base_level: RoleLevel;
  permissions: string[];
  position: number;
};

const CATEGORY_LABEL: Record<string, string> = {
  people: "People & HR",
  operations: "Operations",
  oversight: "Oversight",
  craft: "Craft",
  commercial: "Commercial",
  general: "General",
};

export function NewRoleModal({
  mode,
  source,
  existingNames,
  onClose,
  onCreated,
}: {
  mode: "template" | "duplicate";
  source: RoleRow | null;
  existingNames: string[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { profile } = useSession();
  const toast = useToast();
  /* `null` means "still loading". Duplicating never loads templates, so it starts settled rather
     than emptying itself from inside the effect. */
  const [templates, setTemplates] = React.useState<Template[] | null>(mode === "template" ? null : []);
  const [pick, setPick] = React.useState("");
  const [name, setName] = React.useState(source ? `${source.name} (copy)` : "");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (mode !== "template") return;
    let alive = true;
    createClient()
      .from("role_templates")
      .select("key,name,description,category,base_level,permissions,position")
      .order("position")
      .then(({ data }) => {
        if (alive) setTemplates((data || []) as Template[]);
      });
    return () => {
      alive = false;
    };
  }, [mode]);

  const chosen = (templates || []).find((t) => t.key === pick) || null;
  const clash = !!name.trim() && existingNames.includes(name.trim().toLowerCase());
  const ready = !!name.trim() && !clash && (mode === "duplicate" || !!pick);

  async function create() {
    if (!ready || !profile.org_id) return;
    setBusy(true);
    const permissions = mode === "duplicate" ? source?.permissions || [] : chosen?.permissions || [];
    const denied = mode === "duplicate" ? source?.denied_permissions || [] : [];
    const base: RoleLevel = mode === "duplicate" ? ((source?.base_level as RoleLevel) || "employee") : chosen?.base_level || "employee";
    const key =
      name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) ||
      `role_${Date.now()}`;

    const { data, error } = await createClient()
      .from("system_roles")
      .insert({
        org_id: profile.org_id,
        key,
        name: name.trim(),
        description: mode === "duplicate" ? source?.description || null : chosen?.description || null,
        base_level: base,
        permissions,
        denied_permissions: denied,
        is_system: false,
        created_by: profile.id,
      })
      .select("id")
      .single();
    setBusy(false);

    if (error || !data) {
      // guard_system_role names the permission it refused. That is more useful than "failed".
      toast.push(error?.message || "Could not create the role", "danger");
      return;
    }
    toast.push(
      `“${name.trim()}” created with ${permissions.length} permission${permissions.length === 1 ? "" : "s"}. Adjust it below — nothing is linked back to the template.`,
      "success"
    );
    onCreated(data.id);
  }

  const grouped = React.useMemo(() => {
    const m = new Map<string, Template[]>();
    for (const t of templates || []) {
      if (!m.has(t.category)) m.set(t.category, []);
      m.get(t.category)!.push(t);
    }
    return [...m.entries()];
  }, [templates]);

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "duplicate" ? `Duplicate “${source?.name}”` : "New role"}
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!ready} onClick={create}>
            <Plus size={14} /> Create role
          </Button>
        </>
      }
    >
      <div className="space-y-[var(--s3)]">
        <Field
          label="Name"
          hint="What people see when this role is assigned."
          error={clash ? "A role with that name already exists in this company." : undefined}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Design Reviewer" autoFocus />
        </Field>

        {mode === "duplicate" ? (
          <p className="text-sm text-muted">
            Copies {source?.permissions.length || 0} permission{source?.permissions.length === 1 ? "" : "s"}
            {source?.denied_permissions?.length
              ? ` and ${source.denied_permissions.length} deny rule${source.denied_permissions.length === 1 ? "" : "s"}`
              : ""}{" "}
            into a new role you can change freely. The original is untouched.
          </p>
        ) : templates === null ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : (
          <div>
            <span className="label">Start from</span>
            <div className="space-y-[var(--s3)] max-h-[46vh] overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => setPick("blank")}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-[var(--radius-sm)] border transition-colors",
                  pick === "blank"
                    ? "border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_8%,transparent)]"
                    : "border-[var(--line)] hover:border-[var(--line-strong)]"
                )}
              >
                <span className="block text-sm font-medium">Nothing — start empty</span>
                <span className="block text-[11px] text-muted">Build the role up yourself in the matrix.</span>
              </button>
              {grouped.map(([cat, items]) => (
                <section key={cat}>
                  <div className="eyebrow mb-1.5">{CATEGORY_LABEL[cat] || cat}</div>
                  <div className="space-y-1">
                    {items.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => {
                          setPick(t.key);
                          if (!name.trim()) setName(t.name);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2.5 rounded-[var(--radius-sm)] border transition-colors",
                          pick === t.key
                            ? "border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_8%,transparent)]"
                            : "border-[var(--line)] hover:border-[var(--line-strong)]"
                        )}
                      >
                        <span className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{t.name}</span>
                          <Pill tone="tone-neutral">{ROLE_LABEL[t.base_level]}</Pill>
                          <Pill tone="tone-muted">{t.permissions.length} permissions</Pill>
                        </span>
                        <span className="block text-[11px] text-muted mt-0.5">{t.description}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted flex items-start gap-1.5 pt-1 border-t">
          <Sparkles size={12} className="mt-0.5 shrink-0 text-[var(--accent)]" />
          A template is a starting point, not a link — once created, the role is this company&apos;s own and
          changing it affects nothing else. You can only create a role containing permissions you hold
          yourself.
        </p>
      </div>
    </Modal>
  );
}
