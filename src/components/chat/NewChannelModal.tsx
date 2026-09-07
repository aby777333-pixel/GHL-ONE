"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Hash, Lock, Users, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Field, Input, Modal, SearchInput, Tabs, Textarea, EmptyState, Spinner, useToast } from "@/components/ui";
import { PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, type Channel } from "@/lib/utils";

type Tab = "dm" | "channel" | "browse";

export function NewChannelModal({ open, onClose, memberChannelIds, initialTab = "dm" }: { open: boolean; onClose: () => void; memberChannelIds: string[]; initialTab?: Tab }) {
  const [tab, setTab] = React.useState<Tab>(initialTab);
  return (
    <Modal open={open} onClose={onClose} title="New conversation" width={520}>
      <Tabs<Tab>
        tabs={[
          { key: "dm", label: "Direct message" },
          { key: "channel", label: "Channel" },
          { key: "browse", label: "Browse" },
        ]}
        value={tab}
        onChange={setTab}
        className="-mt-1 mb-3"
      />
      {tab === "dm" && <StartDm onDone={onClose} />}
      {tab === "channel" && <CreateChannel onDone={onClose} />}
      {tab === "browse" && <BrowseChannels memberChannelIds={memberChannelIds} onDone={onClose} open={open} />}
    </Modal>
  );
}

function StartDm({ onDone }: { onDone: () => void }) {
  const { profile, people } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [other, setOther] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [q, setQ] = React.useState("");
  const list = React.useMemo(() => people.filter((p) => p.id !== profile.id && (p.full_name || "").toLowerCase().includes(q.toLowerCase())).slice(0, 8), [people, profile.id, q]);

  async function start(id: string) {
    setLoading(true);
    const { data, error } = await createClient().rpc("open_dm", { other: id });
    setLoading(false);
    if (error || !data) {
      toast.push(error?.message || "Could not open conversation", "danger");
      return;
    }
    onDone();
    router.push(`/chat/${data}`);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <SearchInput placeholder="Search people…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="space-y-0.5">
        {list.map((p) => (
          <button key={p.id} type="button" onClick={() => start(p.id)} disabled={loading} className="w-full flex items-center gap-3 h-11 px-2 rounded-[var(--radius-sm)] hover:bg-[var(--neutral-bg)] text-left">
            <Avatar name={p.full_name} src={p.avatar_url} size={30} presence={p.presence} />
            <span className="min-w-0">
              <span className="block text-sm font-medium truncate">{p.full_name}</span>
              <span className="block text-[11px] text-muted truncate">{p.designation || p.email}</span>
            </span>
          </button>
        ))}
        {!list.length && <div className="text-sm text-muted px-2 py-3">No matches.</div>}
      </div>
      <div className="flex items-end gap-2 pt-2 border-t">
        <Field label="Or pick from the directory" className="flex-1">
          <PersonPicker value={other} onChange={setOther} placeholder="Choose a person" />
        </Field>
        <Button variant="primary" disabled={!other} loading={loading} onClick={() => other && start(other)}>
          Start
        </Button>
      </div>
    </div>
  );
}

function CreateChannel({ onDone }: { onDone: () => void }) {
  const { profile, people, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [isPrivate, setIsPrivate] = React.useState(false);
  const [members, setMembers] = React.useState<Set<string>>(() => new Set());
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const list = React.useMemo(() => people.filter((p) => p.id !== profile.id && (p.full_name || "").toLowerCase().includes(q.toLowerCase())), [people, profile.id, q]);
  const toggle = (id: string) =>
    setMembers((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    const supabase = createClient();
    const { data: ch, error } = await supabase
      .from("channels")
      .insert({ org_id: profile.org_id!, type: "group", name: name.trim().replace(/^#/, ""), description: description.trim() || null, is_private: isPrivate, created_by: profile.id })
      .select("id")
      .single();
    if (error || !ch) {
      setLoading(false);
      toast.push(error?.message || "Could not create channel", "danger");
      return;
    }
    const rows = [profile.id, ...members].map((user_id) => ({ channel_id: ch.id, user_id, role: user_id === profile.id ? "owner" : "member" }));
    const { error: mErr } = await supabase.from("channel_members").insert(rows);
    setLoading(false);
    if (mErr) toast.push(`Channel created, but adding members failed: ${mErr.message}`, "danger");
    else toast.push("Channel created", "success");
    onDone();
    router.push(`/chat/${ch.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Name">
        <div className="relative">
          <Hash size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input className="pl-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. investor-deck-q4" required autoFocus />
        </div>
      </Field>
      <Field label="Description (optional)">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this channel for?" style={{ minHeight: 60 }} />
      </Field>
      <label className="flex items-center gap-3 p-3 rounded-[var(--radius-sm)] border cursor-pointer hover:bg-[var(--neutral-bg)]">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="accent-[var(--brand)]" />
        <span className="w-8 h-8 rounded-full sunken flex items-center justify-center text-muted">
          <Lock size={15} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">Private channel</span>
          <span className="block text-[11px] text-muted">Only invited members can find and read it.</span>
        </span>
      </label>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="label !mb-0">Members</span>
          <span className="text-[11px] text-muted">{members.size} selected · you are added automatically</span>
        </div>
        <SearchInput placeholder="Filter people…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-1.5" />
        <div className="max-h-52 overflow-y-auto rounded-[var(--radius-sm)] border divide-y">
          {list.map((p) => {
            const dept = departments.find((d) => d.id === p.department_id)?.name;
            return (
              <label key={p.id} className="flex items-center gap-3 h-11 px-2.5 cursor-pointer hover:bg-[var(--neutral-bg)]">
                <input type="checkbox" checked={members.has(p.id)} onChange={() => toggle(p.id)} className="accent-[var(--brand)]" />
                <Avatar name={p.full_name} src={p.avatar_url} size={26} />
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
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" loading={loading} disabled={!name.trim()}>
          Create channel
        </Button>
      </div>
    </form>
  );
}

function BrowseChannels({ memberChannelIds, onDone, open }: { memberChannelIds: string[]; onDone: () => void; open: boolean }) {
  const { profile, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [list, setList] = React.useState<Channel[] | null>(null);
  const [joining, setJoining] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const mine = React.useMemo(() => new Set(memberChannelIds), [memberChannelIds]);

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    createClient()
      .from("channels")
      .select("*")
      .in("type", ["company", "announcement", "department", "group"])
      .eq("is_private", false)
      .order("type")
      .order("name")
      .then(({ data }) => {
        if (alive) setList(data || []);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const visible = (list || []).filter((c) => !mine.has(c.id) && c.name.toLowerCase().includes(q.toLowerCase()));

  async function join(c: Channel) {
    setJoining(c.id);
    const { error } = await createClient().from("channel_members").insert({ channel_id: c.id, user_id: profile.id });
    setJoining(null);
    if (error) {
      toast.push(error.message, "danger");
      return;
    }
    toast.push(`Joined #${c.name}`, "success");
    onDone();
    router.push(`/chat/${c.id}`);
    router.refresh();
  }

  if (!list)
    return (
      <div className="py-8 flex justify-center">
        <Spinner />
      </div>
    );

  return (
    <div className="space-y-2">
      <SearchInput placeholder="Search channels…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {!visible.length ? (
        <EmptyState icon={<Hash size={18} />} title="Nothing to join" hint="You are already a member of every public channel you can see." />
      ) : (
        <div className="divide-y rounded-[var(--radius-sm)] border">
          {visible.map((c) => {
            const dept = c.department_id ? departments.find((d) => d.id === c.department_id) : null;
            return (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className={cn("w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0", c.type === "department" ? "tone-violet" : c.type === "announcement" ? "tone-warn" : "tone-info")}>
                  {c.type === "department" ? <Building2 size={15} /> : c.type === "group" ? <Users size={15} /> : <Hash size={15} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">#{c.name}</span>
                  <span className="block text-[11px] text-muted truncate">{c.description || dept?.name || c.type}</span>
                </span>
                <Button size="sm" variant="secondary" loading={joining === c.id} onClick={() => join(c)}>
                  Join
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
