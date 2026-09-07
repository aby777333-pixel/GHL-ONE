"use client";

import * as React from "react";
import { Trophy, Globe2, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Field, Modal, Textarea, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { cn } from "@/lib/utils";
import { KUDOS_CATEGORIES, KUDOS_EMOJI, KUDOS_LABEL, type KudosCategory } from "./lib";

export function KudosModal({ toUserId, onClose, onDone }: { toUserId?: string; onClose: () => void; onDone?: () => void }) {
  const { profile, people } = useSession();
  const toast = useToast();
  const [to, setTo] = React.useState(toUserId || "");
  const [category, setCategory] = React.useState<KudosCategory>("great_work");
  const [message, setMessage] = React.useState("");
  const [isPublic, setIsPublic] = React.useState(true);
  const [loading, setLoading] = React.useState(false);
  const person = people.find((p) => p.id === to);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!to || !message.trim()) return;
    setLoading(true);
    const { error } = await createClient().from("kudos").insert({ org_id: profile.org_id!, from_user_id: profile.id, to_user_id: to, category, message: message.trim(), public: isPublic });
    setLoading(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push(isPublic ? `Posted to #wins — ${person?.full_name.split(" ")[0] || "they"} will love it.` : `Sent privately to ${person?.full_name.split(" ")[0] || "them"}.`, "success");
    onDone?.();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Recognise a colleague" width={500}>
      <form onSubmit={submit} className="space-y-3">
        {toUserId && person ? (
          <div className="flex items-center gap-2.5 text-sm"><Avatar name={person.full_name} src={person.avatar_url} size={30} /><div><div className="font-medium">{person.full_name}</div><div className="text-[11px] text-muted">{person.designation || ""}</div></div></div>
        ) : (
          <Field label="Who"><PersonPicker value={to} onChange={setTo} placeholder="Pick a colleague" allowEmpty /></Field>
        )}
        <Field label="For">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {KUDOS_CATEGORIES.map((c) => (
              <button type="button" key={c} onClick={() => setCategory(c)} className={cn("rounded-[var(--radius-sm)] border px-2.5 py-2 text-left text-xs transition-colors", category === c ? "border-[var(--brand)] bg-[var(--neutral-bg)] font-medium" : "hover:bg-[var(--neutral-bg)]")}>
                <span className="mr-1.5">{KUDOS_EMOJI[c]}</span>{KUDOS_LABEL[c]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Message" hint="Say what they did and why it mattered. Specific beats generic.">
          <Textarea autoFocus value={message} onChange={(e) => setMessage(e.target.value)} style={{ minHeight: 100 }} placeholder="e.g. Stayed late to get the investor data room ready — and it showed on the call." required />
        </Field>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => setIsPublic(true)} className={cn("rounded-[var(--radius-sm)] border p-2.5 text-left transition-colors", isPublic ? "border-[var(--brand)] bg-[var(--neutral-bg)]" : "hover:bg-[var(--neutral-bg)]")}>
            <div className="text-sm font-medium inline-flex items-center gap-1.5"><Globe2 size={13} /> Public</div>
            <div className="text-[11px] text-muted mt-0.5">Posted to #wins and shown on the recognition wall.</div>
          </button>
          <button type="button" onClick={() => setIsPublic(false)} className={cn("rounded-[var(--radius-sm)] border p-2.5 text-left transition-colors", !isPublic ? "border-[var(--brand)] bg-[var(--neutral-bg)]" : "hover:bg-[var(--neutral-bg)]")}>
            <div className="text-sm font-medium inline-flex items-center gap-1.5"><Lock size={13} /> Private</div>
            <div className="text-[11px] text-muted mt-0.5">Only they (and HR) see it. Still counts.</div>
          </button>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={loading} disabled={!to || !message.trim()}><Trophy size={14} /> Send kudos</Button>
        </div>
      </form>
    </Modal>
  );
}
