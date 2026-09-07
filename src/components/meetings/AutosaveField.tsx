"use client";

import * as React from "react";
import { Check, Loader2 } from "lucide-react";
import { Input, Textarea } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/database.types";

type TextField = "agenda" | "notes" | "summary" | "transcript" | "recording_url";
type MeetingUpdate = Database["public"]["Tables"]["meetings"]["Update"];

/**
 * Debounced autosaving text field bound to one column of `meetings`.
 * Saves whenever the value differs from the last persisted value (so programmatic
 * changes such as "Draft summary" are saved too). Read-only when `canEdit` is false.
 */
export function AutosaveField({ meetingId, field, initial, canEdit, placeholder, minHeight = 120, input, value: controlled, onChange: onControlledChange, mono }: { meetingId: string; field: TextField; initial: string | null; canEdit: boolean; placeholder?: string; minHeight?: number; input?: boolean; value?: string; onChange?: (v: string) => void; mono?: boolean }) {
  const [inner, setInner] = React.useState(initial || "");
  const value = controlled ?? inner;
  const setValue = onControlledChange || setInner;
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastSaved = React.useRef(initial || "");

  React.useEffect(() => {
    if (!canEdit || value === lastSaved.current) return;
    const t = setTimeout(async () => {
      setStatus("saving");
      const patch: MeetingUpdate = { [field]: value.trim() ? value : null };
      const { error } = await createClient().from("meetings").update(patch).eq("id", meetingId);
      if (!error) lastSaved.current = value;
      setStatus(error ? "error" : "saved");
    }, 800);
    return () => clearTimeout(t);
  }, [value, field, meetingId, canEdit]);

  if (!canEdit) {
    if (!value) return <div className="text-sm text-muted italic">Nothing here yet.</div>;
    return input ? <a href={value} target="_blank" rel="noreferrer" className="link text-sm break-all">{value}</a> : <div className={cn("text-sm whitespace-pre-wrap leading-relaxed", mono && "font-mono text-[13px]")}>{value}</div>;
  }

  return (
    <div className="relative">
      {input ? (
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />
      ) : (
        <Textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} style={{ minHeight }} className={cn(mono && "font-mono text-[13px]")} />
      )}
      <span className={cn("absolute right-2 -top-5 text-[11px] inline-flex items-center gap-1 transition-opacity", status === "idle" ? "opacity-0" : "opacity-100", status === "error" ? "text-danger" : "text-muted")}>
        {status === "saving" && <><Loader2 size={11} className="animate-spin" /> Saving</>}
        {status === "saved" && <><Check size={11} /> Saved</>}
        {status === "error" && "Not saved"}
      </span>
    </div>
  );
}
