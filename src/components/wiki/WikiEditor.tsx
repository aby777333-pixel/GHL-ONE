"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, PencilLine, Columns2, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Select, Textarea, useToast } from "@/components/ui";
import { ClassificationPicker, DepartmentPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, slugify, type Classification } from "@/lib/utils";
import { Markdown } from "./markdown";
import { WIKI_CATEGORIES, WIKI_TEMPLATE } from "./constants";

export type WikiDraft = {
  id?: string;
  title: string;
  slug: string;
  category: string;
  department_id: string | null;
  classification: Classification;
  body: string;
};

/** Create or edit a wiki page with a live markdown preview. */
export function WikiEditor({ initial, onSaved, onCancel }: { initial?: Partial<WikiDraft>; onSaved?: (slug: string) => void; onCancel?: () => void }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const isNew = !initial?.id;
  const [title, setTitle] = React.useState(initial?.title || "");
  const [slugInput, setSlugInput] = React.useState(initial?.slug || "");
  const [slugTouched, setSlugTouched] = React.useState(!!initial?.slug);
  const slug = slugTouched ? slugInput : slugify(title);
  const [category, setCategory] = React.useState(initial?.category || WIKI_CATEGORIES[0]);
  const [departmentId, setDepartmentId] = React.useState(initial?.department_id || "");
  const [classification, setClassification] = React.useState<Classification>(initial?.classification || "internal");
  const [body, setBody] = React.useState(initial?.body ?? (isNew ? WIKI_TEMPLATE : ""));
  const [mode, setMode] = React.useState<"split" | "write" | "preview">("split");
  const [busy, setBusy] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const payload = { title: title.trim(), slug: slugify(slug), category, department_id: departmentId || null, classification, body };
    let error: string | null = null;
    if (isNew) {
      const { error: e1 } = await supabase.from("wiki_pages").insert({ ...payload, org_id: profile.org_id!, author_id: profile.id });
      error = e1?.message || null;
    } else {
      const { error: e2 } = await supabase.from("wiki_pages").update(payload).eq("id", initial!.id!);
      error = e2?.message || null;
    }
    setBusy(false);
    if (error) {
      toast.push(error.includes("duplicate") ? "A page with this slug already exists" : error, "danger");
      return;
    }
    toast.push(isNew ? "Page published" : "Page updated", "success");
    router.refresh();
    onSaved?.(payload.slug);
  }

  const showWrite = mode !== "preview";
  const showPreview = mode !== "write";

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Title" className="sm:col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Leave policy" required autoFocus />
        </Field>
        <Field label="Slug" hint={`/wiki/${slugify(slug) || "…"}`}>
          <Input value={slug} onChange={(e) => { setSlugInput(e.target.value); setSlugTouched(true); }} placeholder="leave-policy" required />
        </Field>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {[...WIKI_CATEGORIES, ...(WIKI_CATEGORIES.includes(category as (typeof WIKI_CATEGORIES)[number]) ? [] : [category])].map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Department">
          <DepartmentPicker value={departmentId} onChange={setDepartmentId} placeholder="Company-wide" />
        </Field>
        <Field label="Classification">
          <ClassificationPicker value={classification} onChange={setClassification} />
        </Field>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="label !mb-0">Content <span className="text-muted font-normal">(Markdown)</span></span>
          <div className="inline-flex rounded-[var(--radius-sm)] border overflow-hidden">
            <button type="button" className={cn("btn btn-ghost btn-xs rounded-none", mode === "write" && "bg-[var(--neutral-bg)]")} onClick={() => setMode("write")}><PencilLine size={12} /> Write</button>
            <button type="button" className={cn("btn btn-ghost btn-xs rounded-none hidden md:inline-flex", mode === "split" && "bg-[var(--neutral-bg)]")} onClick={() => setMode("split")}><Columns2 size={12} /> Split</button>
            <button type="button" className={cn("btn btn-ghost btn-xs rounded-none", mode === "preview" && "bg-[var(--neutral-bg)]")} onClick={() => setMode("preview")}><Eye size={12} /> Preview</button>
          </div>
        </div>
        <div className={cn("grid gap-3", showWrite && showPreview ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
          {showWrite && (
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} className={cn("font-mono text-[13px] leading-relaxed", mode === "split" ? "min-h-[55dvh]" : "min-h-[50dvh]")} placeholder="# Heading&#10;&#10;Write in markdown…" spellCheck />
          )}
          {showPreview && (
            <div className={cn("card p-[var(--s4)] overflow-y-auto", mode === "split" ? "max-h-[55dvh] hidden md:block" : "min-h-[50dvh]")}>
              {body.trim() ? <Markdown source={body} /> : <div className="text-sm text-muted">Nothing to preview yet.</div>}
            </div>
          )}
        </div>
        {mode === "split" && <div className="md:hidden text-[11px] text-muted mt-1">Preview is available in the Preview tab on small screens.</div>}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>}
        <Button type="submit" variant="primary" loading={busy}><Save size={15} /> {isNew ? "Publish page" : "Save changes"}</Button>
      </div>
    </form>
  );
}
