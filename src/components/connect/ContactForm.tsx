"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Button, Field, Input, Modal, Select, Textarea, useToast } from "@/components/ui";
import { PersonPicker, DepartmentPicker } from "@/components/pickers";
import { CONTACT_KINDS, CONTACT_KIND_LABEL, errText, type ContactRow } from "./lib";

type Draft = { name: string; company: string; kind: string; emails: string; phones: string; owner_id: string; department_id: string; tags: string; preferred_channel: string; language: string; notes: string };
const split = (s: string) => s.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);

/** Create / edit a contact. Work-relevant fields only — no personal profiling. */
export function ContactFormModal({ open, onClose, contact, onSaved, initial }: { open: boolean; onClose: () => void; contact?: ContactRow | null; onSaved: (c: ContactRow) => void; initial?: Partial<Draft> }) {
  const { profile } = useSession();
  const toast = useToast();
  const [d, setD] = React.useState<Draft>(() => ({
    name: contact?.name || initial?.name || "",
    company: contact?.company || initial?.company || "",
    kind: contact?.kind || initial?.kind || "customer",
    emails: (contact?.emails || []).join(", ") || initial?.emails || "",
    phones: (contact?.phones || []).join(", ") || initial?.phones || "",
    owner_id: contact?.owner_id || profile.id,
    department_id: contact?.department_id || profile.department_id || "",
    tags: (contact?.tags || []).join(", "),
    preferred_channel: contact?.preferred_channel || "",
    language: contact?.language || "",
    notes: contact?.notes || "",
  }));
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD((x) => ({ ...x, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!d.name.trim()) return toast.push("Name is required", "danger");
    setBusy(true);
    const row = {
      name: d.name.trim(),
      company: d.company.trim() || null,
      kind: d.kind,
      emails: split(d.emails).map((x) => x.toLowerCase()),
      phones: split(d.phones).map((x) => x.replace(/[^0-9+]/g, "")),
      owner_id: d.owner_id || null,
      department_id: d.department_id || null,
      tags: split(d.tags),
      preferred_channel: d.preferred_channel || null,
      language: d.language.trim() || null,
      notes: d.notes.trim() || null,
    };
    const supabase = createClient();
    const q = contact
      ? supabase.from("contacts").update(row).eq("id", contact.id).select("*").single()
      : supabase.from("contacts").insert({ ...row, org_id: profile.org_id!, created_by: profile.id, source: "manual" }).select("*").single();
    const { data, error } = await q;
    setBusy(false);
    if (error || !data) return toast.push(errText(error), "danger");
    toast.push(contact ? "Contact updated" : "Contact created", "success");
    onSaved(data);
  }

  return (
    <Modal open={open} onClose={onClose} title={contact ? "Edit contact" : "New contact"} width={620}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Name"><Input value={d.name} onChange={set("name")} required autoFocus /></Field>
          <Field label="Company"><Input value={d.company} onChange={set("company")} /></Field>
          <Field label="Type">
            <Select value={d.kind} onChange={set("kind")}>{CONTACT_KINDS.map((k) => <option key={k} value={k}>{CONTACT_KIND_LABEL[k]}</option>)}</Select>
          </Field>
          <Field label="Preferred channel">
            <Select value={d.preferred_channel} onChange={set("preferred_channel")}>
              <option value="">Not set</option><option value="email">Email</option><option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option>
            </Select>
          </Field>
          <Field label="Emails" hint="Comma separated"><Input value={d.emails} onChange={set("emails")} placeholder="name@company.com" /></Field>
          <Field label="Phones" hint="Comma separated, with country code"><Input value={d.phones} onChange={set("phones")} placeholder="+91 98…" /></Field>
          <Field label="Owner"><PersonPicker value={d.owner_id} onChange={(v) => setD((x) => ({ ...x, owner_id: v }))} placeholder="No owner" /></Field>
          <Field label="Department"><DepartmentPicker value={d.department_id} onChange={(v) => setD((x) => ({ ...x, department_id: v }))} /></Field>
          <Field label="Tags" hint="Comma separated"><Input value={d.tags} onChange={set("tags")} placeholder="e.g. renewal, enterprise" /></Field>
          <Field label="Language"><Input value={d.language} onChange={set("language")} placeholder="e.g. Tamil" /></Field>
        </div>
        <Field label="Working notes" hint="Work-relevant context only (what they need, who they deal with). Visible to the owner and managers."><Textarea value={d.notes} onChange={set("notes")} style={{ minHeight: 72 }} /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>{contact ? "Save" : "Create contact"}</Button>
        </div>
      </form>
    </Modal>
  );
}
