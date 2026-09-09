"use client";

/**
 * Live docs hub — everything the person is allowed to open, newest first.
 * Creating a document here is deliberately one field: a title. Structure comes later, together.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, CalendarDays, FileText, FolderKanban, Globe2, Lock, Plus, Search, Trash2, Users } from "lucide-react";
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Pill, Select, Tabs, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { createDoc } from "@/lib/live/client";
import type { LiveDocKind } from "@/lib/live/types";
import { ago, cn, humanize } from "@/lib/utils";

export type DocListItem = {
  id: string;
  title: string;
  kind: string;
  visibility: string;
  owner_id: string | null;
  updated_at: string;
  body: string;
  project_id: string | null;
  meeting_id: string | null;
  department_id: string | null;
  room_id: string | null;
};

const KINDS: { key: LiveDocKind; label: string; hint: string }[] = [
  { key: "doc", label: "Document", hint: "A shared page for anything" },
  { key: "meeting_notes", label: "Meeting notes", hint: "Decisions and action items as they happen" },
  { key: "agenda", label: "Agenda", hint: "What we will cover, before we meet" },
  { key: "sop", label: "SOP draft", hint: "How we do this, written down" },
  { key: "handover", label: "Handover", hint: "What the next person needs" },
];

type TabKey = "all" | "mine" | "notes";

/**
 * How a document is shared, said out loud on every card. Keys match `live_docs.visibility`.
 */
const VISIBILITY_LABEL: Record<string, string> = { private: "only me", members: "members", department: "department", company: "everyone" };
const VISIBILITY_TONE: Record<string, string> = { private: "tone-neutral", members: "tone-info", department: "tone-warn", company: "tone-violet" };
const VISIBILITY_HINT: Record<string, string> = {
  private: "Only you can open this document.",
  members: "You and the people you added.",
  department: "Everyone in the department.",
  company: "Everyone in the company.",
};
const VISIBILITY_ICON: Record<string, React.ReactNode> = {
  private: <Lock size={10} />,
  members: <Users size={10} />,
  department: <Building2 size={10} />,
  company: <Globe2 size={10} />,
};

export function DocsHub({ docs }: { docs: DocListItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const { profile, people, departments } = useSession();
  const [q, setQ] = React.useState("");
  const [tab, setTab] = React.useState<TabKey>("all");
  const [newOpen, setNewOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<LiveDocKind>("doc");
  const [visibility, setVisibility] = React.useState<"private" | "members" | "department" | "company">("members");
  /* The person who created a document had no way to remove it — the list was append-only.
     `ld_delete` already allows the owner (and admins); this is the missing affordance. */
  const [confirmDelete, setConfirmDelete] = React.useState<DocListItem | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const isOwner = React.useCallback((d: DocListItem) => d.owner_id === profile.id, [profile.id]);
  async function removeDoc(d: DocListItem) {
    setDeleting(true);
    const { error } = await createClient().from("live_docs").delete().eq("id", d.id);
    setDeleting(false);
    if (error) { toast.push(error.message, "danger"); return; }
    setConfirmDelete(null);
    toast.push("Document deleted", "success");
    router.refresh();
  }
  const [busy, setBusy] = React.useState(false);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return docs
      .filter((d) => (tab === "mine" ? d.owner_id === profile.id : tab === "notes" ? d.kind === "meeting_notes" || d.kind === "breakout_notes" : true))
      .filter((d) => !needle || d.title.toLowerCase().includes(needle) || (d.body || "").toLowerCase().includes(needle));
  }, [docs, q, tab, profile.id]);

  async function create() {
    if (!profile.org_id) return;
    setBusy(true);
    try {
      const id = await createDoc({
        orgId: profile.org_id,
        ownerId: profile.id,
        title: title.trim() || "Untitled document",
        kind,
        visibility,
        departmentId: profile.department_id,
      });
      router.push(`/docs/${id}`);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Could not create the document", "danger");
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="GHL LIVE"
        title="Live docs"
        subtitle="Write together, in the same place, at the same time — linked to the work it belongs to."
        actions={<Button variant="primary" onClick={() => setNewOpen(true)}><Plus size={15} /> New document</Button>}
      />

      <div className="flex flex-wrap items-center gap-2 mb-[var(--s3)]">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search documents…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <Tabs
        className="mb-[var(--s3)]"
        tabs={[
          { key: "all", label: "All", count: docs.length },
          { key: "mine", label: "Mine", count: docs.filter((d) => d.owner_id === profile.id).length },
          { key: "notes", label: "Meeting notes", count: docs.filter((d) => d.kind === "meeting_notes" || d.kind === "breakout_notes").length },
        ]}
        value={tab}
        onChange={setTab}
      />

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText size={18} />}
            title={q ? "Nothing matches that" : "No documents yet"}
            hint={q ? "Try a shorter search." : "Start one from here, from a meeting, or from the Collaborate button on any project or task."}
            action={!q ? <Button variant="primary" onClick={() => setNewOpen(true)}><Plus size={15} /> New document</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-[var(--s3)] stagger">
          {filtered.map((d) => {
            const owner = people.find((p) => p.id === d.owner_id);
            const dept = departments.find((x) => x.id === d.department_id);
            const preview = (d.body || "").replace(/[#>*_`|-]/g, " ").replace(/\s+/g, " ").trim();
            return (
              <Card key={d.id} hover className="p-[var(--s4)] flex flex-col gap-2 min-w-0">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="w-8 h-8 rounded-[var(--radius-sm)] sunken flex items-center justify-center text-[var(--violet)] shrink-0">
                    <FileText size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/docs/${d.id}`} className="block font-medium leading-snug truncate hover:underline">{d.title}</Link>
                    <div className="text-[11px] text-muted truncate">{humanize(d.kind)} · updated {ago(d.updated_at)}</div>
                  </div>
                </div>
                <p className={cn("text-xs text-muted line-clamp-2 min-h-[2rem]")}>{preview || "Empty — start writing."}</p>
                <div className="flex items-center gap-1.5 flex-wrap mt-auto">
                  {owner && <Pill tone="tone-neutral">{owner.full_name}</Pill>}
                  {dept && <Pill tone="tone-neutral"><Building2 size={10} /> {dept.name}</Pill>}
                  {d.project_id && <Pill tone="tone-info"><FolderKanban size={10} /> project</Pill>}
                  {d.meeting_id && <Pill tone="tone-info"><CalendarDays size={10} /> meeting</Pill>}
                  {/* Only "company" used to be labelled, so a doc set to Private, Members or
                      Department looked like it had no sharing setting at all. */}
                  <Pill tone={VISIBILITY_TONE[d.visibility] || "tone-neutral"} title={VISIBILITY_HINT[d.visibility]}>
                    {VISIBILITY_ICON[d.visibility]} {VISIBILITY_LABEL[d.visibility] || humanize(d.visibility)}
                  </Pill>
                  {isOwner(d) && (
                    <button
                      type="button"
                      className="ml-auto text-[11px] text-muted hover:text-danger inline-flex items-center gap-1"
                      onClick={() => setConfirmDelete(d)}
                      title="Delete this document"
                    >
                      <Trash2 size={11} /> Delete
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete this document?"
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={deleting}>Keep it</Button>
            <Button variant="danger" loading={deleting} onClick={() => confirmDelete && removeDoc(confirmDelete)}><Trash2 size={15} /> Delete</Button>
          </>
        }
      >
        <p className="text-sm text-muted">“{confirmDelete?.title}” and its version history go for good. Anyone you shared it with loses access.</p>
      </Modal>

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New live document"
        width={440}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={create}>Create & open</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is this about?" autoFocus onKeyDown={(e) => e.key === "Enter" && create()} />
          </Field>
          <Field label="Kind" hint={KINDS.find((k) => k.key === kind)?.hint}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as LiveDocKind)}>
              {KINDS.map((k) => (
                <option key={k.key} value={k.key}>{k.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Who can open it">
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
              <option value="private">Only me and people I add</option>
              <option value="members">People in the linked work</option>
              <option value="department">My department</option>
              <option value="company">Everyone in the company</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
