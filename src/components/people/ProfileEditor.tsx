"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Field, Input, Select, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { isAdminRole, isManagerPlus, ROLE_LABEL, type Profile, type RoleLevel } from "@/lib/utils";
import { extOf, publicUrl, uploadFile } from "@/components/files/storage";
import { PRESENCE_LABEL, PRESENCE_OPTIONS } from "./types";

const ROLES: RoleLevel[] = ["super_admin", "director", "executive", "department_head", "manager", "team_lead", "employee", "intern", "consultant", "vendor", "guest"];
const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Australia/Sydney"];

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
  const [skills, setSkills] = React.useState(person.skills.join(", "));
  const [statusText, setStatusText] = React.useState(person.status_text || "");
  const [presence, setPresence] = React.useState<Profile["presence"]>(person.presence);
  const [departmentId, setDepartmentId] = React.useState(person.department_id || "");
  const [managerId, setManagerId] = React.useState(person.manager_id || "");
  const [role, setRole] = React.useState<RoleLevel>(person.role);
  const [isActive, setIsActive] = React.useState(person.is_active);
  const [isExternal, setIsExternal] = React.useState(person.is_external);
  const [avatarUrl, setAvatarUrl] = React.useState(person.avatar_url);
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

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
      skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
      status_text: statusText.trim() || null,
      presence,
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
          <Button type="button" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}><Camera size={14} /> Change photo</Button>
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
        <Field label="Presence">
          <Select value={presence} onChange={(e) => setPresence(e.target.value as Profile["presence"])}>
            {[...PRESENCE_OPTIONS, ...(PRESENCE_OPTIONS.includes(presence) ? [] : [presence])].map((p) => <option key={p} value={p}>{PRESENCE_LABEL[p]}</option>)}
          </Select>
        </Field>
        <Field label="Status" className="sm:col-span-2"><Input value={statusText} onChange={(e) => setStatusText(e.target.value)} placeholder="What are you focused on?" maxLength={120} /></Field>
        <Field label="Skills" hint="Comma separated" className="sm:col-span-2"><Input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Figma, React, Investor decks" /></Field>
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
