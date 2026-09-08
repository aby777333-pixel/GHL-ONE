"use client";

/**
 * The live document surface.
 *
 * A `contentEditable` page with a formatting toolbar (headings, bold/italic/code, lists, checklists,
 * quote, table, divider) that serialises to markdown-ish text in `live_docs.body`. Editing is
 * simultaneous over `doc:<id>` with presence avatars; persistence is debounced with a version counter.
 *
 * On top of the text: comment threads with @mentions, suggestion mode, version history, highlight →
 * task, and — for meeting notes — Record decision / Action item.
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Bold, Check, CheckSquare, Code2, FileText, Gavel, Heading1, Heading2, Heading3, History,
  Italic, List, ListChecks, ListOrdered, ListPlus, Lock, MessageSquare, Minus, Quote, Table2, Users, Wand2, X,
} from "lucide-react";
import { Avatar, Button, Field, Input, Modal, Pill, Select, Textarea, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { docTask, roomDecision } from "@/lib/live/client";
import type { LiveDoc } from "@/lib/live/types";
import { cn, humanize, isAdminRole } from "@/lib/utils";
import { EntityLive } from "@/components/live/EntityLive";
import { DocComments, type DocComment } from "./DocComments";
import { DocVersions } from "./DocVersions";
import { htmlToMd, mdToHtml, useLiveDoc } from "./useLiveDoc";

type Rail = "comments" | "versions" | null;

const KIND_LABEL: Record<string, string> = {
  doc: "Document", meeting_notes: "Meeting notes", agenda: "Agenda", sop: "SOP draft", handover: "Handover", breakout_notes: "Breakout notes",
};

/* Scoped to the document surface — tokens only, so dark mode follows the app. */
const DOC_STYLES = `
.doc-surface:empty::before { content: "Start writing…"; color: var(--fg-muted); }
.doc-surface > :first-child { margin-top: 0; }
.doc-surface blockquote { border-left: 3px solid var(--line-strong); padding-left: .75em; margin: 0 0 .75em; color: var(--fg-2); }
.doc-surface pre { background: var(--bg-sunken); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: .75em; overflow-x: auto; font-family: var(--font-mono); font-size: .85em; margin: 0 0 .75em; white-space: pre-wrap; }
.doc-surface hr { border: 0; border-top: 1px solid var(--line); margin: 1.2em 0; }
.doc-surface table { width: 100%; border-collapse: collapse; margin: 0 0 .75em; display: block; overflow-x: auto; }
.doc-surface th, .doc-surface td { border: 1px solid var(--line); padding: .35em .6em; text-align: left; }
.doc-surface th { background: var(--bg-sunken); font-weight: 600; }
.doc-surface ul[data-check] { list-style: none; padding-left: 1.6em; }
.doc-surface ul[data-check] > li { position: relative; }
.doc-surface ul[data-check] > li::before { content: ""; position: absolute; left: -1.5em; top: .28em; width: 1em; height: 1em; border: 1.5px solid var(--line-strong); border-radius: 4px; cursor: pointer; }
.doc-surface ul[data-check] > li[data-checked="1"]::before { background: var(--brand); border-color: var(--brand); }
.doc-surface ul[data-check] > li[data-checked="1"]::after { content: ""; position: absolute; left: -1.22em; top: .44em; width: .28em; height: .55em; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.doc-surface ul[data-check] > li[data-checked="1"] { color: var(--fg-muted); text-decoration: line-through; }
`;

export function LiveDocEditor({ doc, initialComments }: { doc: LiveDoc; initialComments: DocComment[] }) {
  const { profile, people } = useSession();
  const router = useRouter();
  const toast = useToast();
  const editorRef = React.useRef<HTMLDivElement>(null);
  const [comments, setComments] = React.useState<DocComment[]>(initialComments);
  const [rail, setRail] = React.useState<Rail>(null);
  const [title, setTitle] = React.useState(doc.title);
  const [suggestionMode, setSuggestionMode] = React.useState(doc.suggestion_mode);
  const [visibility, setVisibility] = React.useState(doc.visibility);
  const [selection, setSelection] = React.useState("");
  const [anchor, setAnchor] = React.useState<string | null>(null);
  const [decisionOpen, setDecisionOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  const isOwner = doc.owner_id === profile.id || doc.created_by === profile.id;
  const canReview = isOwner || isAdminRole(profile.role);
  const readOnly = suggestionMode && !canReview;

  const { body, setBody, adopt, flush, version, peers, saving, savedAt, error, remoteNonce } = useLiveDoc({
    docId: doc.id,
    initialBody: doc.body,
    initialVersion: doc.version,
    me: { id: profile.id, name: profile.full_name, avatar: profile.avatar_url },
  });
  const bodyRef = React.useRef(body);
  bodyRef.current = body;

  /* Paint the DOM only when the text changed somewhere else — typing must never lose the caret. */
  React.useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = mdToHtml(bodyRef.current);
  }, [remoteNonce]);

  const sync = React.useCallback(() => {
    if (!editorRef.current) return;
    setBody(htmlToMd(editorRef.current));
  }, [setBody]);

  /* ------------------------------------------------------------ formatting */
  function cmd(command: string, value?: string) {
    if (readOnly) return;
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    sync();
  }
  function insert(html: string) {
    if (readOnly) return;
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, html);
    sync();
  }
  function wrapCode() {
    const sel = window.getSelection()?.toString();
    insert(sel ? `<code>${sel}</code>` : "<code>code</code>");
  }

  /* ------------------------------------------------------------ checklists */
  function onEditorClick(e: React.MouseEvent<HTMLDivElement>) {
    const li = (e.target as HTMLElement).closest("li");
    if (!li || !li.parentElement?.hasAttribute("data-check")) return;
    const rect = li.getBoundingClientRect();
    if (e.clientX - rect.left > 24) return;
    if (readOnly) return;
    li.setAttribute("data-checked", li.getAttribute("data-checked") === "1" ? "0" : "1");
    sync();
  }

  function onSelect() {
    const s = window.getSelection();
    const text = s?.toString().trim() || "";
    if (text && editorRef.current && s?.anchorNode && editorRef.current.contains(s.anchorNode)) setSelection(text);
    else setSelection("");
  }

  /* ------------------------------------------------------------ actions */
  async function saveTitle(next: string) {
    const t = next.trim() || "Untitled document";
    setTitle(t);
    const { error: e } = await createClient().from("live_docs").update({ title: t }).eq("id", doc.id);
    if (e) toast.push(e.message, "danger");
  }

  async function toggleSuggestionMode() {
    const next = !suggestionMode;
    setSuggestionMode(next);
    const { error: e } = await createClient().from("live_docs").update({ suggestion_mode: next }).eq("id", doc.id);
    if (e) {
      setSuggestionMode(!next);
      toast.push(e.message, "danger");
      return;
    }
    toast.push(next ? "Suggestion mode on — reviewers propose, you decide" : "Suggestion mode off", "success");
  }

  async function saveVisibility(v: LiveDoc["visibility"]) {
    setVisibility(v);
    const { error: e } = await createClient().from("live_docs").update({ visibility: v }).eq("id", doc.id);
    if (e) toast.push(e.message, "danger");
  }

  async function makeTask(text: string) {
    const t = text.trim();
    if (!t) return;
    try {
      const id = await docTask(doc.id, t.slice(0, 200));
      toast.push("Task created", "success");
      router.push(`/tasks/${id}`);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Could not create the task", "danger");
    }
  }

  function actionItem() {
    const text = selection || window.prompt("What is the action item?") || "";
    if (!text.trim()) return;
    if (!selection) {
      appendBlock(`- [ ] ${text.trim()}`);
    }
    void makeTask(text);
  }

  function appendBlock(md: string) {
    const next = `${bodyRef.current.replace(/\s+$/, "")}\n\n${md}\n`;
    setBody(next);
    adopt(next);
  }

  async function acceptSuggestion(c: DocComment) {
    if (!c.suggestion) return;
    const next = c.anchor && bodyRef.current.includes(c.anchor) ? bodyRef.current.replace(c.anchor, c.suggestion) : `${bodyRef.current}\n\n${c.suggestion}`;
    setBody(next);
    adopt(next);
    setComments((s) => s.map((x) => (x.id === c.id ? { ...x, accepted: true, resolved: true } : x)));
    const { error: e } = await createClient().from("live_doc_comments").update({ accepted: true, resolved: true }).eq("id", c.id);
    if (e) toast.push(e.message, "danger");
    else toast.push("Suggestion applied", "success");
  }

  const openComments = comments.filter((c) => !c.resolved).length;
  const isMeetingNotes = doc.kind === "meeting_notes" || doc.kind === "breakout_notes";

  const railBody = (which: Rail) =>
    which === "versions" ? (
      <DocVersions docId={doc.id} currentVersion={version} canEdit={!readOnly} onBeforeSnapshot={flush} onRestore={(b, v) => adopt(b, v)} />
    ) : (
      <DocComments
        docId={doc.id}
        comments={comments}
        setComments={setComments}
        canReview={canReview}
        onAccept={acceptSuggestion}
        pendingAnchor={anchor}
        onClearAnchor={() => setAnchor(null)}
      />
    );

  return (
    <div className="page page-wide">
      <style>{DOC_STYLES}</style>
      <div className="flex items-center gap-1.5 text-xs text-muted mb-[var(--s3)]">
        <Link href="/docs" className="hover:underline inline-flex items-center gap-1"><ArrowLeft size={12} /> Live docs</Link>
      </div>

      <div className={cn("grid gap-[var(--s4)] items-start", rail && "lg:grid-cols-[1fr_320px]")}>
        <div className="min-w-0">
          {/* Header */}
          <div className="flex flex-wrap items-start gap-2 mb-[var(--s3)]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Pill tone="tone-violet"><FileText size={11} /> {KIND_LABEL[doc.kind] || humanize(doc.kind)}</Pill>
                {suggestionMode && <Pill tone="tone-warn"><Wand2 size={11} /> Suggestion mode</Pill>}
                {readOnly && <Pill tone="tone-neutral"><Lock size={11} /> You can suggest, not edit</Pill>}
                <span className="text-[11px] text-muted num">v{version}</span>
                <span className="text-[11px] text-muted">
                  {error ? <span className="text-danger">Not saved — {error}</span> : saving ? "Saving…" : savedAt ? "Saved" : "Up to date"}
                </span>
              </div>
              <input
                className="h1 bg-transparent w-full outline-none border-0 p-0 focus:ring-0"
                value={title}
                disabled={!canReview}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={(e) => saveTitle(e.target.value)}
                aria-label="Document title"
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {peers.length > 0 && (
                <span className="flex items-center -space-x-2 mr-1" title={`${peers.map((p) => p.name).join(", ")} here now`}>
                  {peers.slice(0, 4).map((p) => (
                    <span key={p.id} className="rounded-full ring-2" style={{ ["--tw-ring-color" as string]: p.color, boxShadow: `0 0 0 2px ${p.color}` }}>
                      <Avatar name={p.name} src={p.avatar} size={24} />
                    </span>
                  ))}
                  {peers.length > 4 && <span className="pill tone-neutral ml-3">+{peers.length - 4}</span>}
                </span>
              )}
              <EntityLive
                ctx={{
                  projectId: doc.project_id,
                  taskId: doc.task_id,
                  departmentId: doc.department_id,
                  meetingId: doc.meeting_id,
                  title: title,
                  invitees: doc.member_ids,
                }}
                size="sm"
              />
              <Button size="sm" variant="secondary" onClick={() => setRail(rail === "comments" ? null : "comments")} className="relative">
                <MessageSquare size={14} /> <span className="hidden sm:inline">Comments</span>
                {openComments > 0 && <span className="pill tone-brand ml-1">{openComments}</span>}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setRail(rail === "versions" ? null : "versions")}>
                <History size={14} /> <span className="hidden sm:inline">History</span>
              </Button>
              {canReview && (
                <Button size="sm" variant="ghost" icon onClick={() => setSettingsOpen(true)} aria-label="Document settings" title="Sharing & suggestion mode">
                  <Users size={15} />
                </Button>
              )}
            </div>
          </div>

          {/* Toolbar */}
          <div className="card sticky top-[var(--topbar-h)] z-20 px-1.5 py-1 mb-[var(--s3)] flex items-center gap-0.5 overflow-x-auto no-scrollbar">
            <ToolButton label="Heading 1" onClick={() => cmd("formatBlock", "h1")} disabled={readOnly}><Heading1 size={15} /></ToolButton>
            <ToolButton label="Heading 2" onClick={() => cmd("formatBlock", "h2")} disabled={readOnly}><Heading2 size={15} /></ToolButton>
            <ToolButton label="Heading 3" onClick={() => cmd("formatBlock", "h3")} disabled={readOnly}><Heading3 size={15} /></ToolButton>
            <Sep />
            <ToolButton label="Bold" onClick={() => cmd("bold")} disabled={readOnly}><Bold size={15} /></ToolButton>
            <ToolButton label="Italic" onClick={() => cmd("italic")} disabled={readOnly}><Italic size={15} /></ToolButton>
            <ToolButton label="Code" onClick={wrapCode} disabled={readOnly}><Code2 size={15} /></ToolButton>
            <Sep />
            <ToolButton label="Bulleted list" onClick={() => cmd("insertUnorderedList")} disabled={readOnly}><List size={15} /></ToolButton>
            <ToolButton label="Numbered list" onClick={() => cmd("insertOrderedList")} disabled={readOnly}><ListOrdered size={15} /></ToolButton>
            <ToolButton label="Checklist" onClick={() => insert('<ul data-check="1"><li data-checked="0">To do</li></ul>')} disabled={readOnly}><ListChecks size={15} /></ToolButton>
            <Sep />
            <ToolButton label="Quote" onClick={() => cmd("formatBlock", "blockquote")} disabled={readOnly}><Quote size={15} /></ToolButton>
            <ToolButton
              label="Table"
              onClick={() => insert("<table><thead><tr><th>Column</th><th>Column</th></tr></thead><tbody><tr><td>—</td><td>—</td></tr><tr><td>—</td><td>—</td></tr></tbody></table>")}
              disabled={readOnly}
            >
              <Table2 size={15} />
            </ToolButton>
            <ToolButton label="Divider" onClick={() => insert("<hr>")} disabled={readOnly}><Minus size={15} /></ToolButton>
            {isMeetingNotes && (
              <>
                <Sep />
                <button type="button" onClick={() => setDecisionOpen(true)} className="btn btn-ghost btn-xs whitespace-nowrap" title="Record a decision taken in this meeting">
                  <Gavel size={14} /> Decision
                </button>
                <button type="button" onClick={actionItem} className="btn btn-ghost btn-xs whitespace-nowrap" title="Turn this into a task with an owner">
                  <ListPlus size={14} /> Action item
                </button>
              </>
            )}
          </div>

          {/* Selection actions */}
          {selection && (
            <div className="card px-2.5 py-1.5 mb-[var(--s3)] flex items-center gap-1.5 anim-fade-in min-w-0">
              <span className="text-[11px] text-muted truncate min-w-0 flex-1">“{selection.slice(0, 70)}{selection.length > 70 ? "…" : ""}”</span>
              <Button size="xs" variant="ghost" onClick={() => { setAnchor(selection); setRail("comments"); }}>
                <MessageSquare size={12} /> Comment
              </Button>
              <Button size="xs" variant="ghost" onClick={() => makeTask(selection)}>
                <CheckSquare size={12} /> Task
              </Button>
            </div>
          )}

          {/* The page */}
          <div
            ref={editorRef}
            className="card doc-surface prose-sm p-[var(--s4)] min-h-[52vh] outline-none text-[15px] leading-relaxed break-words"
            contentEditable={!readOnly}
            suppressContentEditableWarning
            spellCheck
            onInput={sync}
            onBlur={sync}
            onClick={onEditorClick}
            onMouseUp={onSelect}
            onKeyUp={onSelect}
            role="textbox"
            aria-multiline
            aria-label="Document body"
          />
          <p className="text-[11px] text-muted mt-2">
            {peers.length ? `${peers.map((p) => p.name).join(", ")} ${peers.length === 1 ? "is" : "are"} here too. ` : ""}
            Everything you type is shared as you type it and saved automatically.
          </p>
        </div>

        {/* Comments / history — a side column on desktop, a drawer on a phone (one instance either way) */}
        {rail && (
          <>
            <div className="lg:hidden fixed inset-0 z-[96] bg-black/40 anim-fade-in" onClick={() => setRail(null)} />
            <aside className="card p-[var(--s3)] flex flex-col fixed lg:sticky inset-y-0 right-0 z-[97] lg:z-auto w-[min(88vw,380px)] lg:w-auto rounded-none lg:rounded-[var(--radius)] max-h-[100dvh] lg:max-h-[calc(100dvh-var(--topbar-h)-64px)] lg:top-[calc(var(--topbar-h)+12px)] safe-b">
              <div className="flex items-center gap-2 mb-1.5 lg:hidden">
                <span className="h3">{rail === "versions" ? "Version history" : "Comments"}</span>
                <Button size="sm" variant="ghost" icon className="ml-auto" onClick={() => setRail(null)} aria-label="Close"><X size={16} /></Button>
              </div>
              {railBody(rail)}
            </aside>
          </>
        )}
      </div>

      <DocSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        visibility={visibility}
        onVisibility={saveVisibility}
        suggestionMode={suggestionMode}
        onSuggestionMode={toggleSuggestionMode}
        members={doc.member_ids}
        people={people}
      />

      {/* Mounted only while open: `title` then seeds from the selection once, instead of an effect
          overwriting whatever the user has typed every time the selection moves underneath. */}
      {decisionOpen && (
      <DecisionModal
        onClose={() => setDecisionOpen(false)}
        defaultTitle={selection.slice(0, 120)}
        onSave={async (t, d, reason) => {
          try {
            if (doc.room_id) await roomDecision(doc.room_id, { title: t, decision: d, reason });
            else {
              const { error: e } = await createClient().from("decisions").insert({
                org_id: profile.org_id!, title: t, decision: d, reason: reason || null, decided_by: profile.id,
                meeting_id: doc.meeting_id, project_id: doc.project_id, department_id: doc.department_id, classification: "internal",
              });
              if (e) throw new Error(e.message);
            }
            appendBlock(`> **Decision:** ${t}\n> ${d}`);
            toast.push("Decision recorded", "success");
            setDecisionOpen(false);
          } catch (e) {
            toast.push(e instanceof Error ? e.message : "Could not record the decision", "danger");
          }
        }}
      />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ bits */
function ToolButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} disabled={disabled} className="btn btn-ghost btn-sm btn-icon shrink-0 disabled:opacity-40" aria-label={label} title={label}>
      {children}
    </button>
  );
}
function Sep() {
  return <span className="w-px h-5 bg-[var(--line)] mx-0.5 shrink-0" />;
}

function DocSettings({ open, onClose, visibility, onVisibility, suggestionMode, onSuggestionMode, members, people }: {
  open: boolean;
  onClose: () => void;
  visibility: LiveDoc["visibility"];
  onVisibility: (v: LiveDoc["visibility"]) => void;
  suggestionMode: boolean;
  onSuggestionMode: () => void;
  members: string[];
  people: { id: string; full_name: string | null; avatar_url: string | null }[];
}) {
  return (
    <Modal open={open} onClose={onClose} title="Sharing & review" width={420} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="space-y-3">
        <Field label="Who can open this" hint="Anyone who can see the linked project, task, meeting or room can open it too.">
          <Select value={visibility} onChange={(e) => onVisibility(e.target.value as LiveDoc["visibility"])}>
            <option value="private">Only me and the people I add</option>
            <option value="members">People in the linked work</option>
            <option value="department">My department</option>
            <option value="company">Everyone in the company</option>
          </Select>
        </Field>
        <button type="button" onClick={onSuggestionMode} className="w-full card p-3 text-left row-hover flex items-start gap-2.5">
          <span className={cn("w-9 h-5 rounded-full relative shrink-0 mt-0.5 transition-colors", suggestionMode ? "bg-[var(--brand)]" : "bg-[var(--line)]")}>
            <span className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all", suggestionMode ? "left-[18px]" : "left-0.5")} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium">Suggestion mode</span>
            <span className="block text-[11px] text-muted">Reviewers propose replacements instead of editing. You accept or reject each one.</span>
          </span>
        </button>
        {members.length > 0 && (
          <div>
            <div className="eyebrow mb-1.5">Added directly</div>
            <div className="flex flex-wrap gap-1.5">
              {members.map((id) => {
                const p = people.find((x) => x.id === id);
                return (
                  <span key={id} className="pill tone-neutral">
                    <Avatar name={p?.full_name} src={p?.avatar_url} size={16} /> {p?.full_name || "Someone"}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function DecisionModal({ onClose, defaultTitle, onSave }: {
  onClose: () => void;
  defaultTitle: string;
  onSave: (title: string, decision: string, reason: string) => Promise<void>;
}) {
  const [title, setTitle] = React.useState(defaultTitle);
  const [decision, setDecision] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Record a decision"
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!title.trim() || !decision.trim()}
            onClick={async () => {
              setBusy(true);
              await onSave(title.trim(), decision.trim(), reason.trim());
              setBusy(false);
            }}
          >
            <Check size={15} /> Record
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="What was decided">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ship the new onboarding flow on Monday" autoFocus />
        </Field>
        <Field label="The decision, in full">
          <Textarea value={decision} onChange={(e) => setDecision(e.target.value)} rows={3} placeholder="We will…" />
        </Field>
        <Field label="Why" hint="Optional — future you will thank present you.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
