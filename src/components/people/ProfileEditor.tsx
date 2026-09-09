"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Save, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Field, Input, Select, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { isAdminRole, isManagerPlus, ROLE_LABEL, type Profile, type RoleLevel } from "@/lib/utils";
import { extOf, publicUrl, uploadFile } from "@/components/files/storage";
import { PRESENCE_LABEL } from "./types";

const ROLES: RoleLevel[] = ["super_admin", "director", "executive", "department_head", "manager", "team_lead", "employee", "intern", "consultant", "vendor", "guest"];
const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Australia/Sydney"];

/**
 * Multi-value tag field. A single comma-separated text box let people type anything and gave no way
 * to take one entry back out, so skill data drifted into duplicates and typos and skill-based search
 * stopped being trustworthy. Each value is now its own chip with a remove button, and the picker
 * offers what the company already uses before accepting something new.
 */
function TagInput({ value, onChange, suggestions, placeholder }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[]; placeholder?: string }) {
  const [draft, setDraft] = React.useState("");
  const [openList, setOpenList] = React.useState(false);
  const has = React.useCallback((s: string) => value.some((v) => v.toLowerCase() === s.trim().toLowerCase()), [value]);

  const add = (raw: string) => {
    const s = raw.trim().replace(/,+$/, "").trim();
    if (!s || has(s)) { setDraft(""); return; }
    onChange([...value, s]);
    setDraft("");
  };
  const remove = (s: string) => onChange(value.filter((v) => v !== s));

  const matches = React.useMemo(() => {
    const q = draft.trim().toLowerCase();
    return suggestions.filter((s) => !has(s) && (!q || s.toLowerCase().includes(q))).slice(0, 8);
  }, [draft, suggestions, has]);

  return (
    <div className="relative">
      <div className="input h-auto min-h-[36px] py-1.5 flex flex-wrap items-center gap-1.5">
        {value.map((s) => (
          <span key={s} className="pill tone-neutral">
            {s}
            <button type="button" onClick={() => remove(s)} aria-label={`Remove ${s}`} className="ml-0.5 hover:text-[var(--danger)]">
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm py-0.5"
          value={draft}
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => { setDraft(e.target.value); setOpenList(true); }}
          onFocus={() => setOpenList(true)}
          onBlur={() => setTimeout(() => setOpenList(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); }
            else if (e.key === "Backspace" && !draft && value.length) remove(value[value.length - 1]);
          }}
        />
      </div>
      {openList && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 card p-1 max-h-[180px] overflow-y-auto" style={{ boxShadow: "var(--shadow-lg)" }}>
          {matches.map((s) => (
            <button key={s} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)} className="w-full text-left px-2.5 h-8 rounded-[var(--radius-sm)] text-sm hover:bg-[var(--neutral-bg)]">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Profile form. Self can edit personal fields; managers can edit department/manager/designation of others;
 * admins can edit role/active/external. The DB trigger `profile_guard` silently reverts anything else,
 * so fields are only shown when the change would actually persist.
 */
export function ProfileEditor({ person, onDone }: { person: Profile; onDone?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const { profile: me } = useSession();
  const self = me.id === person.id;
  const admin = isAdminRole(me.role);
  const manager = isManagerPlus(me.role);
  const canOrg = admin || (manager && !self);

  const [fullName, setFullName] = React.useState(person.full_name);
  const [designation, setDesignation] = React.useState(person.designation || "");
  const [phone, setPhone] = React.useState(person.phone || "");
  const [hours, setHours] = React.useState(person.working_hours || "");
  const [tz, setTz] = React.useState(person.timezone || "Asia/Kolkata");
  const [skills, setSkills] = React.useState<string[]>(person.skills || []);
  const [statusText, setStatusText] = React.useState(person.status_text || "");
  const presence = person.presence;
  const [departmentId, setDepartmentId] = React.useState(person.department_id || "");
  const [managerId, setManagerId] = React.useState(person.manager_id || "");
  const [role, setRole] = React.useState<RoleLevel>(person.role);
  const [isActive, setIsActive] = React.useState(person.is_active);
  const [isExternal, setIsExternal] = React.useState(person.is_external);
  const [avatarUrl, setAvatarUrl] = React.useState(person.avatar_url);
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  /* The skill list people can pick from is the set already in use across the company (RLS-scoped),
     so it grows with the org instead of being a hard-coded taxonomy that goes stale. */
  const [skillSuggestions, setSkillSuggestions] = React.useState<string[]>([]);
  React.useEffect(() => {
    let alive = true;
    createClient()
      .from("profiles")
      .select("skills")
      .eq("is_active", true)
      .then(({ data }) => {
        if (!alive || !data) return;
        const seen = new Map<string, string>();
        for (const row of data) for (const s of (row.skills as string[] | null) || []) {
          const k = s.trim().toLowerCase();
          if (k && !seen.has(k)) seen.set(k, s.trim());
        }
        setSkillSuggestions([...seen.values()].sort((a, b) => a.localeCompare(b)));
      });
    return () => { alive = false; };
  }, []);

  async function removeAvatar() {
    setUploading(true);
    const { error } = await createClient().from("profiles").update({ avatar_url: null }).eq("id", person.id);
    setUploading(false);
    if (error) { toast.push(error.message, "danger"); return; }
    setAvatarUrl(null);
    toast.push("Photo removed", "success");
    router.refresh();
  }

  async function pickAvatar(f: File) {
    if (!f.type.startsWith("image/")) { toast.push("Please choose an image", "danger"); return; }
    if (f.size > 5 * 1024 * 1024) { toast.push("Image must be under 5 MB", "danger"); return; }
    setUploading(true);
    const supabase = createClient();
    const path = `${person.id}/${Date.now()}.${extOf(f.name) || "jpg"}`;
    const up = await uploadFile(supabase, { bucket: "avatars", path, file: f, upsert: true });
    if (up.error) { setUploading(false); toast.push(up.error, "danger"); return; }
    const url = publicUrl(supabase, "avatars", path);
    const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", person.id);
    setUploading(false);
    if (error) { toast.push(error.message, "danger"); return; }
    setAvatarUrl(url);
    toast.push("Photo updated", "success");
    router.refresh();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const patch: Partial<Profile> = {
      full_name: fullName.trim() || person.full_name,
      designation: designation.trim() || null,
      phone: phone.trim() || null,
      working_hours: hours.trim() || null,
      timezone: tz,
      skills,
      status_text: statusText.trim() || null,
    };
    if (canOrg) {
      patch.department_id = departmentId || null;
      patch.manager_id = managerId || null;
    }
    if (admin) {
      patch.role = role;
      patch.is_active = isActive;
      patch.is_external = isExternal;
    }
    const { error } = await createClient().from("profiles").update(patch).eq("id", person.id);
    setBusy(false);
    if (error) { toast.push(error.message, "danger"); return; }
    toast.push("Profile saved", "success");
    router.refresh();
    onDone?.();
  }

  return (
    <form onSubmit={save} className="space-y-[var(--s4)]">
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => fileRef.current?.click()} className="relative group rounded-full" aria-label="Change photo" disabled={uploading}>
          <Avatar name={fullName} src={avatarUrl} size={72} />
          <span className="absolute inset-0 rounded-full bg-black/45 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Camera size={18} /></span>
        </button>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}><Camera size={14} /> {avatarUrl ? "Change photo" : "Add photo"}</Button>
            {/* Uploading a photo used to be one-way — there was no way back to the initials avatar. */}
            {avatarUrl && <Button type="button" size="sm" variant="ghost" onClick={removeAvatar} disabled={uploading}><Trash2 size={14} /> Remove photo</Button>}
          </div>
          <div className="text-[11px] text-muted mt-1">JPG, PNG or WebP · up to 5 MB</div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickAvatar(f); e.target.value = ""; }} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Full name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></Field>
        <Field label="Designation"><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Senior Designer" /></Field>
        <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" inputMode="tel" /></Field>
        <Field label="Working hours"><Input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="09:30–18:30 IST" /></Field>
        <Field label="Timezone">
          <Select value={tz} onChange={(e) => setTz(e.target.value)}>
            {[...TIMEZONES, ...(TIMEZONES.includes(tz) ? [] : [tz])].map((z) => <option key={z} value={z}>{z}</option>)}
          </Select>
        </Field>
        {/*
          Presence is read-only on purpose. It used to be a free dropdown, so anyone could park
          themselves on "Available" while they were nowhere near their desk and the whole signal
          became untrustworthy. It is now derived: the shell's heartbeat drives available/offline,
          Do not disturb comes from the avatar menu, a focus session sets Focus and a live room
          sets In a meeting.
        */}
        <Field label="Presence" hint="Set automatically from your activity. Use Do not disturb in the avatar menu to mute notifications.">
          <div className="input flex items-center gap-2 cursor-not-allowed opacity-90" aria-readonly>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "currentColor" }} />
            <span className="text-sm">{PRESENCE_LABEL[presence]}</span>
          </div>
        </Field>
        <Field label="Status" className="sm:col-span-2"><Input value={statusText} onChange={(e) => setStatusText(e.target.value)} placeholder="What are you focused on?" maxLength={120} /></Field>
        <Field label="Skills" hint="Pick from the list or type your own, then press Enter. Click × to remove one." className="sm:col-span-2">
          <TagInput value={skills} onChange={setSkills} suggestions={skillSuggestions} placeholder="Figma, React, Investor decks…" />
        </Field>
      </div>

      {canOrg && (
        <div>
          <div className="eyebrow mb-2">Organisation</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Department"><DepartmentPicker value={departmentId} onChange={setDepartmentId} /></Field>
            <Field label="Reports to"><PersonPicker value={managerId} onChange={setManagerId} placeholder="No manager" /></Field>
            {admin && (
              <>
                <Field label="Role">
                  <Select value={role} onChange={(e) => setRole(e.target.value as RoleLevel)}>
                    {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </Select>
                </Field>
                <div className="flex flex-col gap-2 justify-end pb-1">
                  <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-[var(--brand)]" /> Active account</label>
                  <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={isExternal} onChange={(e) => setIsExternal(e.target.checked)} className="accent-[var(--brand)]" /> External (consultant / vendor)</label>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {onDone && <Button type="button" variant="ghost" onClick={onDone} disabled={busy}>Cancel</Button>}
        <Button type="submit" variant="primary" loading={busy}><Save size={15} /> Save profile</Button>
      </div>
    </form>
  );
}
