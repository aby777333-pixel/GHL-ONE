"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Crown, Globe2, Hourglass, Lock, Shield, Sparkles, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Field, Input, Modal, SearchInput, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, fmtDate, slugify } from "@/lib/utils";
import { DEFAULT_SETTINGS, ROOM_TYPES, ROOM_TYPE_META, VISIBILITIES, VISIBILITY_META, type ChannelSettings, type RoomType, type Visibility } from "./visibility";

const ICON: Record<Visibility, React.ReactNode> = {
  company_open: <Globe2 size={15} />, department_open: <Building2 size={15} />, invite_only: <Users size={15} />, private: <Lock size={15} />, confidential: <Shield size={15} />, executive_only: <Crown size={15} />,
};

type SkillPerson = { id: string; full_name: string; avatar_url: string | null; skills: string[]; designation: string | null };

export function CreateRoomModal({ open, onClose, canManagement, defaultType = "group" }: { open: boolean; onClose: () => void; canManagement: boolean; defaultType?: RoomType }) {
  const { profile, people, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  const admin = canManagement;

  const [name, setName] = React.useState("");
  const [purpose, setPurpose] = React.useState("");
  const [type, setType] = React.useState<RoomType>(defaultType);
  const [visibility, setVisibility] = React.useState<Visibility>("invite_only");
  const [coOwner, setCoOwner] = React.useState("");
  const [members, setMembers] = React.useState<Set<string>>(() => new Set());
  const [depts, setDepts] = React.useState<string[]>([]);
  const [deptPick, setDeptPick] = React.useState("");
  const [q, setQ] = React.useState("");
  const [skillQ, setSkillQ] = React.useState("");
  const [skillPeople, setSkillPeople] = React.useState<SkillPerson[] | null>(null);
  const [archiveOn, setArchiveOn] = React.useState("");
  const [settings, setSettings] = React.useState<ChannelSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = React.useState(false);

  // Load skills lazily the first time the skill box is used.
  React.useEffect(() => {
    if (!skillQ.trim() || skillPeople) return;
    let alive = true;
    createClient()
      .from("profiles")
      .select("id,full_name,avatar_url,skills,designation")
      .eq("is_active", true)
      .then(({ data }) => {
        if (alive) setSkillPeople((data || []).map((p) => ({ ...p, skills: p.skills || [] })));
      });
    return () => {
      alive = false;
    };
  }, [skillQ, skillPeople]);

  const visibleTypes = ROOM_TYPES.filter((t) => t !== "management" || admin);
  const visibilities = VISIBILITIES.filter((v) => (v !== "executive_only" && v !== "company_open") || admin);
  const list = React.useMemo(() => people.filter((p) => p.id !== profile.id && (p.full_name || "").toLowerCase().includes(q.toLowerCase())).slice(0, 60), [people, profile.id, q]);
  const skillHits = React.useMemo(() => {
    const needle = skillQ.trim().toLowerCase();
    if (!needle || !skillPeople) return [];
    return skillPeople.filter((p) => p.id !== profile.id && p.skills.some((s) => s.toLowerCase().includes(needle))).slice(0, 12);
  }, [skillQ, skillPeople, profile.id]);

  const toggle = (id: string) =>
    setMembers((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  function reset() {
    setName(""); setPurpose(""); setType(defaultType); setVisibility("invite_only"); setCoOwner(""); setMembers(new Set()); setDepts([]); setDeptPick(""); setQ(""); setSkillQ(""); setArchiveOn(""); setSettings(DEFAULT_SETTINGS);
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!name.trim() || busy) return;
    if (type === "temporary" && !archiveOn) return toast.push("Temporary rooms need an archive date", "danger");
    setBusy(true);
    const supabase = createClient();
    const archiveAt = archiveOn ? new Date(`${archiveOn}T23:59:59`).toISOString() : null;
    const primaryDept = depts[0] || profile.department_id || null;
    const { data: ch, error } = await supabase
      .from("channels")
      .insert({
        org_id: profile.org_id!,
        type,
        name: name.trim().replace(/^#/, ""),
        slug: slugify(name),
        description: purpose.trim() || null,
        purpose: purpose.trim() || null,
        visibility,
        is_private: visibility !== "company_open" && visibility !== "department_open",
        owner_id: profile.id,
        co_owner_id: coOwner || null,
        created_by: profile.id,
        archive_at: archiveAt,
        settings,
        department_id: visibility === "department_open" ? primaryDept : null,
        department_ids: depts,
      })
      .select("id")
      .single();
    if (error || !ch) {
      setBusy(false);
      toast.push(error?.message || "Could not create the room", "danger");
      return;
    }
    const ids = new Set<string>(members);
    if (coOwner) ids.add(coOwner);
    ids.delete(profile.id);
    const rows = [{ channel_id: ch.id, user_id: profile.id, role: "owner" }, ...[...ids].map((user_id) => ({ channel_id: ch.id, user_id, role: user_id === coOwner ? "co_owner" : "member", invited_by: profile.id }))];
    const { error: mErr } = await supabase.from("channel_members").insert(rows);
    let invited = 0;
    for (const d of depts) {
      const { data: n } = await supabase.rpc("invite_department", { p_channel: ch.id, p_department: d, p_reason: purpose.trim() || undefined });
      invited += Number(n || 0);
    }
    setBusy(false);
    if (mErr) toast.push(`Room created, but adding members failed: ${mErr.message}`, "danger");
    else toast.push(`Room created${depts.length ? ` · ${invited} department contact${invited === 1 ? "" : "s"} notified` : ""}`, "success");
    reset();
    onClose();
    router.push(`/chat/${ch.id}`);
    router.refresh();
  }

  const vm = VISIBILITY_META[visibility];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a room"
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => submit()}>Create room</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mauritius launch war-room" required autoFocus />
          </Field>
          <Field label="Type">
            <select className="select" value={type} onChange={(e) => setType(e.target.value as RoomType)}>
              {visibleTypes.map((t) => (
                <option key={t} value={t}>{ROOM_TYPE_META[t].label}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="text-[11px] text-muted -mt-2">{ROOM_TYPE_META[type].hint}</div>
        <Field label="Purpose" hint="Shown to everyone who is brought in, so they know why they are here.">
          <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="What is this room for, and what does done look like?" style={{ minHeight: 64 }} />
        </Field>

        {type === "temporary" && (
          <div className="rounded-[var(--radius-sm)] border p-3 space-y-2" style={{ borderColor: "var(--warn)" }}>
            <Field label="Archive on">
              <Input type="date" value={archiveOn} onChange={(e) => setArchiveOn(e.target.value)} required />
            </Field>
            <div className="text-[11px] text-muted inline-flex items-start gap-1.5"><Hourglass size={12} className="mt-0.5 shrink-0" /> The room archives itself at the end of that day{archiveOn ? ` (${fmtDate(archiveOn)})` : ""}. Members lose access then; the history stays readable to owners and admins.</div>
          </div>
        )}

        {/* Visibility */}
        <div>
          <span className="label">Who can see it</span>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {visibilities.map((v) => {
              const m = VISIBILITY_META[v];
              const active = visibility === v;
              return (
                <label key={v} className={cn("flex items-start gap-2.5 p-2.5 rounded-[var(--radius-sm)] border cursor-pointer transition-colors", active ? "border-[var(--brand)] bg-[var(--neutral-bg)]" : "hover:bg-[var(--neutral-bg)]")}>
                  <input type="radio" name="visibility" className="accent-[var(--brand)] mt-1" checked={active} onChange={() => setVisibility(v)} />
                  <span className={cn("w-7 h-7 rounded-full inline-flex items-center justify-center shrink-0", m.tone)}>{ICON[v]}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{m.label}</span>
                    <span className="block text-[11px] text-muted leading-snug">{m.who}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Ownership */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Owner">
            <div className="input flex items-center gap-2 pointer-events-none">
              <Avatar name={profile.full_name} src={profile.avatar_url} size={20} />
              <span className="text-sm truncate">{profile.full_name} (you)</span>
            </div>
          </Field>
          <Field label="Co-owner (optional)" hint="Can invite and manage the room with you.">
            <PersonPicker value={coOwner} onChange={setCoOwner} placeholder="No co-owner" />
          </Field>
        </div>

        {/* Members */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="label !mb-0">Members</span>
            <span className="text-[11px] text-muted">{members.size} selected · you are added automatically</span>
          </div>
          <SearchInput placeholder="Find people…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-1.5" />
          <div className="max-h-44 overflow-y-auto rounded-[var(--radius-sm)] border divide-y">
            {list.map((p) => {
              const dept = departments.find((d) => d.id === p.department_id)?.name;
              return (
                <label key={p.id} className="flex items-center gap-3 h-10 px-2.5 cursor-pointer hover:bg-[var(--neutral-bg)]">
                  <input type="checkbox" checked={members.has(p.id)} onChange={() => toggle(p.id)} className="accent-[var(--brand)]" />
                  <Avatar name={p.full_name} src={p.avatar_url} size={24} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm truncate">{p.full_name}</span>
                    <span className="block text-[11px] text-muted truncate">{[p.designation, dept].filter(Boolean).join(" · ")}</span>
                  </span>
                </label>
              );
            })}
            {!list.length && <div className="text-sm text-muted p-3">No matches.</div>}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Invite a department */}
          <div>
            <span className="label">Invite a department</span>
            <div className="flex gap-2">
              <DepartmentPicker value={deptPick} onChange={setDeptPick} placeholder="Choose a department" className="flex-1" />
              <Button type="button" variant="secondary" disabled={!deptPick || depts.includes(deptPick)} onClick={() => { setDepts((d) => [...d, deptPick]); setDeptPick(""); }}>Add</Button>
            </div>
            {depts.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {depts.map((id) => (
                  <span key={id} className="pill tone-violet">
                    <Building2 size={10} /> {departments.find((d) => d.id === id)?.name || "Department"}
                    <button type="button" onClick={() => setDepts((d) => d.filter((x) => x !== id))} aria-label="Remove" className="ml-0.5"><X size={10} /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="text-[11px] text-muted mt-1">The head and on-duty person get a notification; available members can join.</div>
          </div>

          {/* Invite by skill */}
          <div>
            <span className="label">Invite by skill</span>
            <SearchInput placeholder="e.g. figma, tamil, excel…" value={skillQ} onChange={(e) => setSkillQ(e.target.value)} />
            {skillQ.trim() && (
              <div className="mt-1.5 max-h-36 overflow-y-auto rounded-[var(--radius-sm)] border divide-y">
                {skillPeople === null ? (
                  <div className="text-xs text-muted p-2.5">Searching skills…</div>
                ) : skillHits.length === 0 ? (
                  <div className="text-xs text-muted p-2.5">Nobody lists that skill yet.</div>
                ) : (
                  skillHits.map((p) => (
                    <label key={p.id} className="flex items-center gap-2.5 h-10 px-2.5 cursor-pointer hover:bg-[var(--neutral-bg)]">
                      <input type="checkbox" checked={members.has(p.id)} onChange={() => toggle(p.id)} className="accent-[var(--brand)]" />
                      <Avatar name={p.full_name} src={p.avatar_url} size={22} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm truncate">{p.full_name}</span>
                        <span className="block text-[11px] text-muted truncate"><Sparkles size={10} className="inline -mt-0.5 mr-0.5" />{p.skills.filter((s) => s.toLowerCase().includes(skillQ.trim().toLowerCase())).join(", ")}</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Settings */}
        <div>
          <span className="label">Room settings</span>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <SettingRow label="Who can post" hint="Owners-only makes it a broadcast room.">
              <select className="select !h-8 !text-xs w-[120px]" value={settings.post} onChange={(e) => setSettings((s) => ({ ...s, post: e.target.value as ChannelSettings["post"] }))}>
                <option value="members">Members</option>
                <option value="owners">Owners</option>
              </select>
            </SettingRow>
            <SettingRow label="Who can invite" hint={visibility === "confidential" || visibility === "executive_only" ? "Locked to owners for this visibility." : "Members can bring people in with a reason."}>
              <select className="select !h-8 !text-xs w-[120px]" value={visibility === "confidential" || visibility === "executive_only" ? "owners" : settings.invite} disabled={visibility === "confidential" || visibility === "executive_only"} onChange={(e) => setSettings((s) => ({ ...s, invite: e.target.value as ChannelSettings["invite"] }))}>
                <option value="members">Members</option>
                <option value="owners">Owners</option>
              </select>
            </SettingRow>
            <SettingRow label="File sharing" hint="Allow attachments in this room.">
              <input type="checkbox" className="accent-[var(--brand)] w-4 h-4" checked={settings.share_files} onChange={(e) => setSettings((s) => ({ ...s, share_files: e.target.checked }))} />
            </SettingRow>
            <SettingRow label="Guests allowed" hint="External consultants, vendors or clients may be brought in.">
              <input type="checkbox" className="accent-[var(--brand)] w-4 h-4" checked={settings.guests} onChange={(e) => setSettings((s) => ({ ...s, guests: e.target.checked }))} />
            </SettingRow>
          </div>
        </div>

        <div className="rounded-[var(--radius-sm)] sunken px-3 py-2 text-[11px] text-muted inline-flex items-start gap-2 w-full">
          <span className={cn("w-5 h-5 rounded-full inline-flex items-center justify-center shrink-0", vm.tone)}>{ICON[visibility]}</span>
          <span><span className="font-medium text-2">{vm.label}.</span> {vm.who}{type === "temporary" && archiveOn ? ` Archives on ${fmtDate(archiveOn)}.` : ""}</span>
        </div>
        <button type="submit" className="hidden" aria-hidden />
      </form>
    </Modal>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 p-2.5 rounded-[var(--radius-sm)] border">
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        <span className="block text-[11px] text-muted leading-snug">{hint}</span>
      </span>
      <span className="shrink-0 inline-flex items-center">{children}</span>
    </label>
  );
}
