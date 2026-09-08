"use client";

/**
 * Comment threads on a live document: @mentions (the DB trigger sends the notification), resolve,
 * and suggestion review — a reviewer proposes a replacement for the text they highlighted, the owner
 * accepts (the replacement is written into the body) or rejects.
 */

import * as React from "react";
import { AtSign, Check, CheckCheck, MessageSquare, Reply, Send, X } from "lucide-react";
import { Avatar, Button, EmptyState, Pill, useToast } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { ago, cn } from "@/lib/utils";

export type DocComment = {
  id: string;
  doc_id: string;
  anchor: string | null;
  body: string;
  suggestion: string | null;
  author_id: string | null;
  mentions: string[];
  resolved: boolean;
  accepted: boolean | null;
  task_id: string | null;
  created_at: string;
};

export function DocComments({ docId, comments, setComments, canReview, onAccept, pendingAnchor, onClearAnchor }: {
  docId: string;
  comments: DocComment[];
  setComments: React.Dispatch<React.SetStateAction<DocComment[]>>;
  /** The owner (or an admin) may accept / reject suggestions. */
  canReview: boolean;
  onAccept: (c: DocComment) => Promise<void> | void;
  /** Text the editor highlighted, waiting for a comment. */
  pendingAnchor?: string | null;
  onClearAnchor?: () => void;
}) {
  const { profile, people } = useSession();
  const toast = useToast();
  const [text, setText] = React.useState("");
  const [suggestion, setSuggestion] = React.useState("");
  const [showSuggest, setShowSuggest] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [showResolved, setShowResolved] = React.useState(false);
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (pendingAnchor) inputRef.current?.focus();
  }, [pendingAnchor]);

  // Realtime: comments appear for everyone in the document.
  React.useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const ch = supabase
      .channel(`doc-comments-${docId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_doc_comments", filter: `doc_id=eq.${docId}` }, (p) => {
        if (p.eventType === "DELETE") {
          const old = p.old as { id?: string };
          setComments((s) => s.filter((c) => c.id !== old.id));
          return;
        }
        const row = p.new as unknown as DocComment;
        setComments((s) => (s.some((c) => c.id === row.id) ? s.map((c) => (c.id === row.id ? row : c)) : [...s, row]));
      });
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      ch.subscribe();
    });
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [docId, setComments]);

  const mentionMatches = React.useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return people.filter((p) => p.id !== profile.id && (p.full_name || "").toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, people, profile.id]);

  function onChange(v: string) {
    setText(v);
    const m = v.slice(0, inputRef.current?.selectionStart ?? v.length).match(/@([\w ]{0,20})$/);
    setMentionQuery(m ? m[1] : null);
  }

  function insertMention(name: string) {
    setText((v) => v.replace(/@([\w ]{0,20})$/, `@${name} `));
    setMentionQuery(null);
    inputRef.current?.focus();
  }

  function mentionIds(v: string): string[] {
    const ids = new Set<string>();
    for (const p of people) {
      if (!p.full_name) continue;
      if (v.includes(`@${p.full_name}`)) ids.add(p.id);
    }
    return [...ids];
  }

  async function post() {
    const b = text.trim();
    if (!b && !suggestion.trim()) return;
    setBusy(true);
    const { data, error } = await createClient()
      .from("live_doc_comments")
      .insert({
        doc_id: docId,
        body: b || "Suggested an edit",
        anchor: pendingAnchor || null,
        suggestion: showSuggest && suggestion.trim() ? suggestion : null,
        author_id: profile.id,
        mentions: mentionIds(b),
      })
      .select("*")
      .single();
    setBusy(false);
    if (error || !data) {
      toast.push(error?.message || "Could not add the comment", "danger");
      return;
    }
    setComments((s) => (s.some((c) => c.id === data.id) ? s : [...s, data as unknown as DocComment]));
    setText("");
    setSuggestion("");
    setShowSuggest(false);
    onClearAnchor?.();
  }

  async function resolve(c: DocComment, resolved: boolean) {
    setComments((s) => s.map((x) => (x.id === c.id ? { ...x, resolved } : x)));
    const { error } = await createClient().from("live_doc_comments").update({ resolved }).eq("id", c.id);
    if (error) toast.push(error.message, "danger");
  }

  async function reject(c: DocComment) {
    setComments((s) => s.map((x) => (x.id === c.id ? { ...x, accepted: false, resolved: true } : x)));
    const { error } = await createClient().from("live_doc_comments").update({ accepted: false, resolved: true }).eq("id", c.id);
    if (error) toast.push(error.message, "danger");
  }

  const open = comments.filter((c) => !c.resolved);
  const done = comments.filter((c) => c.resolved);
  const list = showResolved ? [...open, ...done] : open;

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-2">
        <span className="eyebrow inline-flex items-center gap-1.5"><MessageSquare size={12} /> Comments</span>
        {open.length > 0 && <Pill tone="tone-brand">{open.length} open</Pill>}
        {done.length > 0 && (
          <button type="button" className="ml-auto text-[11px] text-muted hover:underline" onClick={() => setShowResolved((s) => !s)}>
            {showResolved ? "Hide" : "Show"} {done.length} resolved
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5">
        {list.length === 0 ? (
          <EmptyState icon={<MessageSquare size={16} />} title="No comments" hint="Highlight text in the document and press Comment to start a thread." className="py-[var(--s4)]" />
        ) : (
          list.map((c) => {
            const author = people.find((p) => p.id === c.author_id);
            return (
              <div key={c.id} className={cn("card p-2.5", c.resolved && "opacity-60")}>
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar name={author?.full_name} src={author?.avatar_url} size={22} />
                  <span className="text-xs font-medium truncate">{author?.full_name || "Someone"}</span>
                  <span className="text-[11px] text-muted ml-auto shrink-0">{ago(c.created_at)}</span>
                </div>
                {c.anchor && (
                  <div className="mt-1.5 text-[11px] pl-2 border-l-2 border-[var(--warn)] text-muted line-clamp-2">“{c.anchor}”</div>
                )}
                <p className="text-sm mt-1.5 whitespace-pre-wrap break-words">{c.body}</p>
                {c.suggestion && (
                  <div className="mt-2 rounded-[var(--radius-sm)] sunken p-2">
                    <div className="eyebrow mb-1">Suggested replacement</div>
                    <p className="text-sm whitespace-pre-wrap break-words">{c.suggestion}</p>
                    {c.accepted === true && <Pill tone="tone-success" className="mt-1.5">accepted</Pill>}
                    {c.accepted === false && <Pill tone="tone-neutral" className="mt-1.5">not used</Pill>}
                    {canReview && c.accepted === null && !c.resolved && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <Button size="xs" variant="success" onClick={() => onAccept(c)}><Check size={12} /> Accept</Button>
                        <Button size="xs" variant="ghost" onClick={() => reject(c)}><X size={12} /> Reject</Button>
                      </div>
                    )}
                  </div>
                )}
                {c.mentions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {c.mentions.map((id) => (
                      <span key={id} className="pill tone-violet"><AtSign size={10} /> {people.find((p) => p.id === id)?.full_name || "someone"}</span>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-2">
                  {!c.resolved ? (
                    <Button size="xs" variant="ghost" onClick={() => resolve(c, true)}><CheckCheck size={12} /> Resolve</Button>
                  ) : (
                    <Button size="xs" variant="ghost" onClick={() => resolve(c, false)}><Reply size={12} /> Reopen</Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="pt-2 mt-2 border-t shrink-0">
        {pendingAnchor && (
          <div className="flex items-start gap-1.5 mb-1.5 text-[11px] text-muted">
            <span className="pl-2 border-l-2 border-[var(--warn)] line-clamp-2 min-w-0 flex-1">“{pendingAnchor}”</span>
            <button type="button" onClick={onClearAnchor} className="btn btn-ghost btn-xs btn-icon shrink-0" aria-label="Clear the highlighted text"><X size={12} /></button>
          </div>
        )}
        <div className="relative">
          {mentionMatches.length > 0 && (
            <div className="absolute bottom-full mb-1 left-0 right-0 card p-1 z-20" style={{ boxShadow: "var(--shadow-lg)" }}>
              {mentionMatches.map((p) => (
                <button key={p.id} type="button" onClick={() => insertMention(p.full_name || "")} className="w-full flex items-center gap-2 px-2 h-8 rounded-[var(--radius-sm)] text-sm hover:bg-[var(--neutral-bg)] text-left">
                  <Avatar name={p.full_name} src={p.avatar_url} size={18} />
                  <span className="truncate">{p.full_name}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            className="input min-h-[62px] resize-y"
            placeholder="Comment… use @ to pull someone in"
            value={text}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void post();
              }
            }}
          />
        </div>
        {showSuggest && (
          <textarea
            className="input min-h-[54px] resize-y mt-1.5"
            placeholder={pendingAnchor ? "Replace the highlighted text with…" : "Your suggested wording…"}
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
          />
        )}
        <div className="flex items-center gap-1.5 mt-1.5">
          <Button
            size="xs"
            variant={showSuggest ? "primary" : "ghost"}
            onClick={() => setShowSuggest((s) => !s)}
            title={pendingAnchor ? "Propose a replacement for the highlighted text" : "Highlight text first to suggest a replacement"}
          >
            Suggest an edit
          </Button>
          <Button size="xs" variant="primary" className="ml-auto" loading={busy} onClick={post}><Send size={12} /> Comment</Button>
        </div>
      </div>
    </div>
  );
}
