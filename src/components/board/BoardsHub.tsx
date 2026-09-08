"use client";
/** /boards — every whiteboard you can open, and the "New board" template gallery. */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, LayoutTemplate, PenSquare, Plus, Star, Users } from "lucide-react";
import { createBoard, toggleFavorite } from "@/lib/live/client";
import {
  Avatar, Button, Card, EmptyState, Field, Input, Modal, PageHeader, SearchInput, Select, Tabs, useToast,
} from "@/components/ui";
import { DepartmentPicker, ProjectPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, cn } from "@/lib/utils";
import type { BoardKind, BoardTemplateKey, BoardVisibility } from "@/lib/live/types";
import { BoardTemplateGallery, templateDoc } from "./BoardTemplates";
import type { BoardRow } from "./useBoardDoc";

type Tab = "all" | "mine" | "team" | "department" | "project" | "shared" | "favourites" | "archived";

const KIND_TONE: Record<string, string> = {
  personal: "tone-neutral", team: "tone-info", department: "tone-violet", project: "tone-success", room: "tone-orange", shared: "tone-warn",
};

export function BoardsHub({ boards: initial, favorites: initialFavorites }: { boards: BoardRow[]; favorites: string[] }) {
  const { profile, people, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [boards, setBoards] = React.useState(initial);
  const [favorites, setFavorites] = React.useState<string[]>(initialFavorites);
  const [tab, setTab] = React.useState<Tab>("all");
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const [title, setTitle] = React.useState("");
  const [kind, setKind] = React.useState<BoardKind>("personal");
  const [visibility, setVisibility] = React.useState<BoardVisibility>("private");
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [departmentId, setDepartmentId] = React.useState<string | null>(profile.department_id);
  const [template, setTemplate] = React.useState<BoardTemplateKey>("blank");
  const [busy, setBusy] = React.useState(false);

  const matches = React.useCallback((b: BoardRow, t: Tab) => {
    switch (t) {
      case "mine": return b.owner_id === profile.id;
      case "team": return b.kind === "team";
      case "department": return b.kind === "department" || !!b.department_id;
      case "project": return !!b.project_id;
      case "shared": return b.owner_id !== profile.id;
      case "favourites": return favorites.includes(b.id);
      case "archived": return b.archived;
      default: return true;
    }
  }, [profile.id, favorites]);

  const list = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return boards
      .filter((b) => (tab === "archived" ? b.archived : !b.archived))
      .filter((b) => matches(b, tab))
      .filter((b) => !needle || b.title.toLowerCase().includes(needle))
      .sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1));
  }, [boards, tab, q, matches]);

  const count = (t: Tab) => boards.filter((b) => (t === "archived" ? b.archived : !b.archived)).filter((b) => matches(b, t)).length;

  async function create() {
    if (!profile.org_id) return;
    setBusy(true);
    try {
      const doc = templateDoc(template);
      const id = await createBoard({
        orgId: profile.org_id,
        ownerId: profile.id,
        title: title.trim() || "Untitled board",
        kind,
        visibility,
        projectId,
        departmentId: kind === "department" || visibility === "department" ? departmentId : null,
        templateKey: template,
        doc,
      });
      router.push(`/boards/${id}`);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Could not create the board", "danger");
      setBusy(false);
    }
  }

  async function star(b: BoardRow) {
    const on = !favorites.includes(b.id);
    setFavorites((f) => (on ? [...f, b.id] : f.filter((x) => x !== b.id)));
    try {
      await toggleFavorite("board", b.id, profile.id, on);
    } catch {
      setFavorites((f) => (on ? f.filter((x) => x !== b.id) : [...f, b.id]));
    }
  }

  async function archive(b: BoardRow) {
    const { createClient } = await import("@/lib/supabase/client");
    const { error } = await createClient().from("boards").update({ archived: !b.archived }).eq("id", b.id);
    if (error) return toast.push(error.message, "danger");
    setBoards((s) => s.map((x) => (x.id === b.id ? { ...x, archived: !b.archived } : x)));
  }

  return (
    <div className="page anim-fade-up">
      <PageHeader
        eyebrow="GHL Board"
        title="Boards"
        subtitle="Infinite whiteboards for planning, diagrams, workshops and brainstorms — live with your team."
        actions={<Button variant="primary" onClick={() => setOpen(true)}><Plus size={15} /> New board</Button>}
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-[var(--s3)]">
        <SearchInput placeholder="Search boards…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-xs w-full" />
      </div>

      <Tabs
        className="mb-[var(--s4)]"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: "all", label: "All", count: count("all") },
          { key: "mine", label: "My boards", count: count("mine") },
          { key: "team", label: "Team", count: count("team") },
          { key: "department", label: "Department", count: count("department") },
          { key: "project", label: "Project", count: count("project") },
          { key: "shared", label: "Shared with me", count: count("shared") },
          { key: "favourites", label: "Favourites", count: count("favourites") },
          { key: "archived", label: "Archived", count: count("archived") },
        ]}
      />

      {list.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate size={18} />}
          title={q ? "No boards match that search" : "No boards here yet"}
          hint={q ? "Try a different word." : "Start from a template — brainstorm, sprint planning, flowchart, root cause analysis and more."}
          action={<Button variant="primary" onClick={() => setOpen(true)}><Plus size={15} /> New board</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[var(--s3)]">
          {list.map((b) => {
            const owner = people.find((p) => p.id === b.owner_id);
            const dept = departments.find((d) => d.id === b.department_id);
            return (
              <Card key={b.id} hover className="p-[var(--s3)] flex flex-col gap-2 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/boards/${b.id}`} className="min-w-0 flex-1">
                    <div className="font-medium truncate">{b.title}</div>
                    <div className="text-[11px] text-muted mt-0.5 truncate">
                      {dept ? `${dept.name} · ` : ""}Updated {ago(b.updated_at)}
                    </div>
                  </Link>
                  <button type="button" aria-label="Favourite" onClick={() => star(b)} className={cn("shrink-0", favorites.includes(b.id) ? "text-[var(--accent)]" : "text-muted hover:text-[var(--fg-2)]")}>
                    <Star size={15} fill={favorites.includes(b.id) ? "currentColor" : "none"} />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className={cn("pill", KIND_TONE[b.kind] || "tone-neutral")}>{b.kind.replace("_", " ")}</span>
                    {b.locked && <span className="pill tone-warn">Locked</span>}
                    {b.member_ids?.length > 0 && <span className="pill tone-neutral"><Users size={10} /> {b.member_ids.length}</span>}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {owner && <Avatar name={owner.full_name} src={owner.avatar_url} size={22} />}
                    {(b.owner_id === profile.id) && (
                      <button type="button" aria-label={b.archived ? "Restore" : "Archive"} title={b.archived ? "Restore" : "Archive"} onClick={() => archive(b)} className="text-muted hover:text-[var(--fg-2)]">
                        <Archive size={14} />
                      </button>
                    )}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New board"
        width={760}
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={create} loading={busy}><PenSquare size={14} /> Create board</Button></>}
      >
        <div className="space-y-[var(--s4)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Board name"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q4 launch plan" autoFocus /></Field>
            <Field label="Type">
              <Select value={kind} onChange={(e) => { const k = e.target.value as BoardKind; setKind(k); setVisibility(k === "personal" ? "private" : k === "department" ? "department" : "members"); }}>
                <option value="personal">Personal</option>
                <option value="team">Team</option>
                <option value="department">Department</option>
                <option value="project">Project</option>
                <option value="shared">Shared</option>
              </Select>
            </Field>
            <Field label="Who can open it">
              <Select value={visibility} onChange={(e) => setVisibility(e.target.value as BoardVisibility)}>
                <option value="private">Private</option>
                <option value="members">Members</option>
                <option value="department">Department</option>
                <option value="company">Company</option>
              </Select>
            </Field>
            {(kind === "department" || visibility === "department") && (
              <Field label="Department"><DepartmentPicker value={departmentId} onChange={(v) => setDepartmentId(v || null)} /></Field>
            )}
            <Field label="Link to a project" className="sm:col-span-2"><ProjectPicker value={projectId} onChange={(v) => setProjectId(v || null)} /></Field>
          </div>
          <div>
            <div className="h3 mb-2">Start from a template</div>
            <BoardTemplateGallery value={template} onPick={setTemplate} compact />
          </div>
        </div>
      </Modal>
    </div>
  );
}
