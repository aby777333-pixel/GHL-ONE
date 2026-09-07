"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookmarkPlus, BookOpen, Building2, Check, ChevronDown, ChevronRight, ExternalLink, FileText, Gavel, KeyRound, LifeBuoy, ListChecks, Lock, MessageSquare, Sparkles, ThumbsDown, ThumbsUp, User, Users, Video, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Button, Field, Input, Modal, Pill, Textarea, useToast } from "@/components/ui";
import { DepartmentPicker } from "@/components/pickers";
import { RequestAccessModal, type AccessResourceType } from "@/components/access/RequestAccess";
import type { BuddyContextItem, BuddyMode, BuddyProposal, BuddyResponse, BuddyRestrictedHit } from "@/lib/ai/types";
import { cn } from "@/lib/utils";
import { AIMarkdown } from "./AIMarkdown";
import { BuddyProposals } from "./BuddyProposals";
import { CONFIDENCE_META, MODE_META, contextLink } from "./buddyModes";

/* ------------------------------------------------------------------ types ---- */

export type BuddyMsg = {
  key: string;
  id: string | null;
  role: "user" | "assistant";
  content: string;
  mode?: BuddyMode | null;
  confidence?: BuddyResponse["confidence"] | null;
  context?: BuddyContextItem[];
  proposals?: BuddyProposal[];
  restricted?: BuddyRestrictedHit[];
  suggestions?: string[];
  handoff?: BuddyResponse["handoff"];
  sources?: { link: string; title: string }[];
  assistant?: BuddyResponse["assistant"] | null;
  attachments?: { kind: string; name: string }[];
  /** Live responses only — history rows have no action level, so we fall back to the panel's. */
  actionLevel?: number;
};

type Rating = "helpful" | "not_helpful" | "incorrect" | "outdated" | "unsafe";
const RATINGS: { key: Rating; label: string; icon?: React.ReactNode; note: boolean }[] = [
  { key: "helpful", label: "Helpful", icon: <ThumbsUp size={12} />, note: false },
  { key: "not_helpful", label: "Not helpful", icon: <ThumbsDown size={12} />, note: true },
  { key: "incorrect", label: "Incorrect", note: true },
  { key: "outdated", label: "Outdated", note: true },
  { key: "unsafe", label: "Unsafe", note: true },
];

const CONTEXT_ICON: Record<BuddyContextItem["kind"], React.ReactNode> = {
  task: <ListChecks size={12} />,
  project: <BookOpen size={12} />,
  channel: <MessageSquare size={12} />,
  knowledge: <BookOpen size={12} />,
  person: <User size={12} />,
  department: <Building2 size={12} />,
  help_request: <LifeBuoy size={12} />,
  file: <FileText size={12} />,
  meeting: <Video size={12} />,
  decision: <Gavel size={12} />,
  my_work: <ListChecks size={12} />,
  hr: <Users size={12} />,
  memory: <Sparkles size={12} />,
};
const CONTEXT_LABEL: Record<BuddyContextItem["kind"], string> = {
  task: "Task", project: "Project", channel: "Conversation", knowledge: "Knowledge article", person: "Person", department: "Department", help_request: "Help request", file: "File", meeting: "Meeting", decision: "Decision", my_work: "Your work", hr: "Your HR data", memory: "Your notes",
};

function accessType(t: string): AccessResourceType {
  const ok: AccessResourceType[] = ["project", "file", "channel", "department", "task", "wiki", "folder", "dataset"];
  return (ok as string[]).includes(t) ? (t as AccessResourceType) : "file";
}

/* ------------------------------------------------------------------ component ---- */

export function BuddyMessage({ m, question, conversationId, actionLevel, onSuggestion, onNavigate, onSpeak, speaking }: {
  m: BuddyMsg;
  /** The user message that preceded this answer (for "Save as knowledge"). */
  question: string;
  conversationId: string | null;
  actionLevel: number;
  onSuggestion: (text: string) => void;
  onNavigate: () => void;
  onSpeak?: (text: string) => void;
  speaking?: boolean;
}) {
  const { profile, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [ctxOpen, setCtxOpen] = React.useState(false);
  const [rating, setRating] = React.useState<Rating | null>(null);
  const [noteFor, setNoteFor] = React.useState<Rating | null>(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [access, setAccess] = React.useState<BuddyRestrictedHit | null>(null);
  const [askInfo, setAskInfo] = React.useState(false);

  const conf = m.confidence ? CONFIDENCE_META[m.confidence] : null;
  const modeMeta = m.mode && m.mode !== "chat" ? MODE_META[m.mode] : null;
  const level = m.actionLevel ?? actionLevel;
  const name = m.assistant?.name || "GHL Buddy";

  const submitFeedback = async (r: Rating, text?: string) => {
    if (!m.id) return toast.push("Feedback is available once the answer is saved", "info");
    setBusy(r);
    const { error } = await createClient().from("ai_feedback").insert({ org_id: profile.org_id!, user_id: profile.id, message_id: m.id, rating: r, note: text?.trim() || null, department_id: profile.department_id || null });
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    setRating(r);
    setNoteFor(null);
    setNote("");
    toast.push(r === "helpful" ? "Thanks — noted" : r === "not_helpful" ? "Thanks — we'll do better" : "Flagged and routed to your department's knowledge owner", "success");
  };

  const saveKnowledge = async () => {
    setBusy("save");
    const title = (question || m.content.split("\n")[0] || "Buddy answer").replace(/^[#>\-*\s]+/, "").slice(0, 120);
    const { data, error } = await createClient().from("ai_knowledge").insert({
      org_id: profile.org_id!,
      title,
      body: m.content,
      department_id: profile.department_id || null,
      kind: "faq",
      status: "draft",
      source_type: "conversation",
      source_id: conversationId,
      created_by: profile.id,
    }).select("id").single();
    setBusy(null);
    if (error || !data) return toast.push(error?.message || "Could not save", "danger");
    setSaved(data.id);
    toast.push("Sent to your department's knowledge owner for approval", "success");
  };

  const handoff = async (h: NonNullable<BuddyMsg["handoff"]>[number]) => {
    if (h.kind === "person" && h.id) {
      setBusy(`h:${h.id}`);
      const { data, error } = await createClient().rpc("open_dm", { other: h.id });
      setBusy(null);
      if (error || !data) return toast.push(error?.message || "Could not open the chat", "danger");
      onNavigate();
      router.push(`/chat/${data}`);
      return;
    }
    onNavigate();
    if (h.kind === "department" && h.id) router.push(`/help?dept=${h.id}`);
    else if (h.kind === "chat" && h.id) router.push(`/chat/${h.id}`);
    else router.push("/help");
  };

  // "Don't guess" targets
  const myDept = departments.find((d) => d.id === profile.department_id);
  const hrDept = departments.find((d) => d.slug === "hr" || d.name.toLowerCase() === "hr" || d.name.toLowerCase().includes("human"));
  const itDept = departments.find((d) => d.slug === "technology" || d.slug === "it");
  const managerId = myDept?.head_id && myDept.head_id !== profile.id ? myDept.head_id : null;
  const askManager = async () => {
    if (!managerId) {
      onNavigate();
      router.push("/people");
      return;
    }
    setBusy("mgr");
    const { data, error } = await createClient().rpc("open_dm", { other: managerId });
    setBusy(null);
    if (error || !data) return toast.push(error?.message || "Could not open the chat", "danger");
    onNavigate();
    router.push(`/chat/${data}`);
  };

  return (
    <div className="flex gap-2.5 anim-fade-in">
      <span className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 mt-0.5" style={{ background: "linear-gradient(135deg, var(--brand), var(--violet))" }}><Sparkles size={13} /></span>
      <div className="min-w-0 flex-1 space-y-2">
        {/* Meta line */}
        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
          <span className="font-semibold text-[var(--fg)]">{name}</span>
          {modeMeta && <Pill tone="tone-neutral" className="!text-[10px]"><modeMeta.icon size={10} /> {modeMeta.label}</Pill>}
          {conf && <Pill tone={conf.tone} className="!text-[10px]" ><span title={conf.hint}>{conf.label}</span></Pill>}
        </div>

        <AIMarkdown source={m.content} className="text-sm" onNavigate={onNavigate} />

        {/* Insufficient → don't guess */}
        {m.confidence === "insufficient" && (
          <div className="rounded-[var(--radius-sm)] border border-dashed px-3 py-2 text-xs space-y-2">
            <div className="text-muted">No approved answer — rather than guess, ask a person who knows:</div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="xs" variant="secondary" onClick={askManager} loading={busy === "mgr"}><User size={12} /> Ask manager</Button>
              {hrDept && <Button size="xs" variant="secondary" onClick={() => { onNavigate(); router.push(`/help?dept=${hrDept.id}`); }}><Users size={12} /> Ask HR</Button>}
              {itDept && <Button size="xs" variant="secondary" onClick={() => { onNavigate(); router.push(`/help?dept=${itDept.id}`); }}><Building2 size={12} /> Ask IT</Button>}
              <Button size="xs" variant="secondary" onClick={() => setAskInfo(true)}><LifeBuoy size={12} /> Request information</Button>
            </div>
          </div>
        )}

        {/* Restricted hits */}
        {!!m.restricted?.length && (
          <div className="rounded-[var(--radius-sm)] border px-3 py-2 text-xs space-y-1.5 tone-warn !bg-[var(--warn-bg)]/60">
            <div className="flex items-center gap-1.5 font-medium"><Lock size={12} /> I found relevant information, but you don&apos;t currently have permission to view it.</div>
            {m.restricted.map((r) => (
              <div key={`${r.resource_type}:${r.resource_id}`} className="flex items-center gap-2 min-w-0">
                <span className="truncate flex-1 text-[var(--fg)]">{r.label} <span className="text-muted">· {r.resource_type}</span></span>
                <Button size="xs" variant="secondary" onClick={() => setAccess(r)}><KeyRound size={12} /> Request access</Button>
              </div>
            ))}
          </div>
        )}

        {/* Using context */}
        {!!m.context?.length && (
          <div className="text-xs">
            <button type="button" onClick={() => setCtxOpen((o) => !o)} className="inline-flex items-center gap-1 text-muted hover:text-[var(--fg)]" aria-expanded={ctxOpen}>
              {ctxOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Using context · {m.context.length}
            </button>
            {ctxOpen && (
              <ul className="mt-1.5 space-y-1 pl-1">
                {m.context.map((c, i) => {
                  const href = contextLink(c);
                  const inner = <><span className="text-muted shrink-0">{CONTEXT_ICON[c.kind]}</span><span className="text-muted shrink-0">{CONTEXT_LABEL[c.kind]}:</span><span className="truncate">{c.title}</span></>;
                  return (
                    <li key={`${c.kind}-${c.id || i}`} className="flex items-center gap-1.5 min-w-0">
                      {href ? <Link href={href} onClick={onNavigate} className="inline-flex items-center gap-1.5 min-w-0 hover:underline">{inner}<ExternalLink size={10} className="shrink-0 text-muted" /></Link> : <span className="inline-flex items-center gap-1.5 min-w-0">{inner}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Sources (history rows keep these) */}
        {!!m.sources?.length && !m.context?.length && (
          <div className="flex flex-wrap gap-1.5">
            {m.sources.map((s) => (
              <Link key={s.link} href={s.link} onClick={onNavigate} className="pill tone-neutral max-w-full hover:border-[var(--line-strong)]" title={s.title}><ExternalLink size={10} /> <span className="truncate">{s.title}</span></Link>
            ))}
          </div>
        )}

        {/* Proposals */}
        {!!m.proposals?.length && level >= 3 && <BuddyProposals proposals={m.proposals} conversationId={conversationId} actionLevel={level} onNavigate={onNavigate} />}

        {/* Human handoff — the AI is never a barrier */}
        {!!m.handoff?.length && (
          <div className="flex flex-wrap gap-1.5">
            {m.handoff.map((h, i) => (
              <Button key={`${h.kind}-${h.id || i}`} size="xs" variant="secondary" onClick={() => handoff(h)} loading={busy === `h:${h.id}`}>
                {h.kind === "person" ? <MessageSquare size={12} /> : h.kind === "department" ? <Building2 size={12} /> : <LifeBuoy size={12} />} {h.label}
              </Button>
            ))}
          </div>
        )}

        {/* Suggestions */}
        {!!m.suggestions?.length && (
          <div className="flex flex-wrap gap-1.5">
            {m.suggestions.map((s) => (
              <button key={s} type="button" onClick={() => onSuggestion(s)} className="pill tone-neutral hover:border-[var(--line-strong)] cursor-pointer">
                <Sparkles size={10} className="text-[var(--accent)]" /> {s}
              </button>
            ))}
          </div>
        )}

        {/* Feedback + save + read aloud */}
        <div className="flex items-center gap-1 flex-wrap pt-0.5">
          {RATINGS.map((r) => {
            const active = rating === r.key;
            return (
              <button
                key={r.key}
                type="button"
                disabled={!!rating || busy === r.key}
                onClick={() => (r.note ? setNoteFor(r.key) : submitFeedback(r.key))}
                className={cn("inline-flex items-center gap-1 h-6 px-2 rounded-full border text-[11px] transition-colors", active ? "tone-success border-transparent" : rating ? "text-muted opacity-50" : "text-muted hover:text-[var(--fg)] hover:border-[var(--line-strong)]")}
                title={r.key === "helpful" ? "This helped" : `Flag as ${r.label.toLowerCase()}`}
              >
                {active ? <Check size={12} /> : r.icon}{r.label}
              </button>
            );
          })}
          <span className="flex-1" />
          {onSpeak && (
            <button type="button" onClick={() => onSpeak(m.content)} className={cn("btn btn-ghost btn-xs", speaking && "text-[var(--brand-2)]")} title="Read aloud" aria-label="Read aloud"><Volume2 size={13} /></button>
          )}
          {saved ? (
            <Link href={`/wiki/knowledge/${saved}`} onClick={onNavigate} className="btn btn-ghost btn-xs"><Check size={12} /> Saved draft</Link>
          ) : (
            <Button size="xs" variant="ghost" onClick={saveKnowledge} loading={busy === "save"} title="Save this answer as a draft knowledge article for your department"><BookmarkPlus size={13} /> Save as knowledge</Button>
          )}
        </div>
      </div>

      {/* Feedback note modal */}
      <Modal open={!!noteFor} onClose={() => setNoteFor(null)} title={`Flag as ${RATINGS.find((r) => r.key === noteFor)?.label.toLowerCase() || "feedback"}`} width={480} footer={
        <>
          <Button variant="ghost" onClick={() => setNoteFor(null)}>Cancel</Button>
          <Button variant="primary" loading={!!busy} onClick={() => noteFor && submitFeedback(noteFor, note)}>Send</Button>
        </>
      }>
        <p className="text-sm text-muted mb-3">{noteFor === "not_helpful" ? "What were you hoping for? (optional)" : "What is wrong or what should it say instead? This goes to your department's knowledge owner so the guidance gets fixed. (optional)"}</p>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" className="!min-h-[88px]" autoFocus />
      </Modal>

      {access && (
        <RequestAccessModal open onClose={() => setAccess(null)} resource_type={accessType(access.resource_type)} resource_id={access.resource_id} resource_label={access.label} onSent={() => setAccess(null)} />
      )}

      <RequestInfoModal open={askInfo} onClose={() => setAskInfo(false)} question={question} defaultDept={hrDept?.id || myDept?.id || ""} />
    </div>
  );
}

/* ------------------------------------------------------------------ request information ---- */

function RequestInfoModal({ open, onClose, question, defaultDept }: { open: boolean; onClose: () => void; question: string; defaultDept: string }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [dept, setDept] = React.useState(defaultDept);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const title = `Information request: ${(question || "question").slice(0, 90)}`;

  const send = async () => {
    if (!dept) return toast.push("Pick a department", "danger");
    setBusy(true);
    const { data, error } = await createClient().from("help_requests").insert({
      org_id: profile.org_id!,
      requester_id: profile.id,
      requester_department_id: profile.department_id || null,
      department_id: dept,
      title,
      details: [question ? `Asked GHL Buddy: “${question}”` : "", "Buddy had no approved answer.", text.trim()].filter(Boolean).join("\n\n"),
      priority: "normal",
      form_data: { source: "buddy", question } as never,
    }).select("id").single();
    setBusy(false);
    if (error || !data) return toast.push(error?.message || "Could not send", "danger");
    toast.push("Request sent — someone will own it shortly", "success");
    onClose();
    router.push(`/help/${data.id}`);
  };

  return (
    <Modal open={open} onClose={onClose} title="Request information" width={520} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={send}><LifeBuoy size={14} /> Send request</Button></>}>
      <div className="space-y-3">
        <p className="text-sm text-muted">Creates a help request so a real person answers — with an owner and an acknowledgement target.</p>
        <Field label="Ask which department?"><DepartmentPicker value={dept} onChange={setDept} placeholder="Pick a department" /></Field>
        <Field label="Request"><Input value={title} readOnly /></Field>
        <Field label="Anything to add?"><Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Context that helps them answer faster (optional)" className="!min-h-[72px]" /></Field>
      </div>
    </Modal>
  );
}
