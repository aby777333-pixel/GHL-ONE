"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Building2, ExternalLink, Handshake, Mail, Pencil, Phone, ShieldBan, Star, Tag, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Button, Field, Modal, Skeleton, Textarea, useToast } from "@/components/ui";
import { ago, cn, fmtDate, isManagerPlus } from "@/lib/utils";
import { ChannelIcon } from "./ConnectBits";
import { ContactFormModal } from "./ContactForm";
import { CONTACT_KIND_LABEL, errText, humanizeKey, telHref, type ContactRow, type ContactTimeline, type TimelineItem } from "./lib";

/** Contact card + unified timeline. Used as the right pane and (with `full`) on /connect/contacts/[id]. */
export function ContactPane({ contactId, refreshKey, onBack, onOpenConversation, full, onStart }: { contactId: string | null; refreshKey: number; onBack?: () => void; onOpenConversation?: (id: string) => void; full?: boolean; onStart?: (channel: "email" | "call") => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [tlState, setTl] = React.useState<ContactTimeline | null>(null);
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null);
  const [now] = React.useState(() => Date.now());
  const [edit, setEdit] = React.useState(false);
  const [dncOpen, setDncOpen] = React.useState(false);
  const [dncReason, setDncReason] = React.useState("");

  const load = React.useCallback(async () => {
    if (!contactId) return;
    const { data } = await createClient().rpc("contact_timeline", { p_contact: contactId, p_limit: full ? 300 : 80 });
    setTl((data as unknown as ContactTimeline) || null);
    setLoadedFor(contactId);
  }, [contactId, full]);
  React.useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load, refreshKey]);
  const loading = loadedFor !== contactId;
  const tl = loadedFor === contactId ? tlState : null;

  const c = tl?.contact || null;
  const canManage = isManagerPlus(profile.role) || c?.owner_id === profile.id;

  async function patch(p: Partial<ContactRow>) {
    if (!c) return;
    const { error } = await createClient().from("contacts").update(p).eq("id", c.id);
    if (error) return toast.push(errText(error), "danger");
    load();
  }

  if (!contactId) {
    return <div className="p-4 text-sm text-muted text-center">No contact on this conversation.</div>;
  }
  if (loading && !tl) {
    return <div className="p-4 space-y-3"><Skeleton className="h-16" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>;
  }
  if (!c || tl?.error) {
    return <div className="p-4 text-sm text-muted text-center">This contact is restricted.</div>;
  }

  const openPromises = (tl?.items || []).filter((i) => i.type === "commitment" && i.status === "open");
  const openFollowUps = (tl?.items || []).filter((i) => i.type === "follow_up" && i.status === "open");

  return (
    <div className={cn("flex flex-col min-h-0", full ? "" : "h-full")}>
      <div className="p-3 border-b space-y-2">
        <div className="flex items-start gap-2">
          {onBack && <Button size="sm" icon variant="ghost" className="lg:hidden shrink-0" onClick={onBack} aria-label="Back"><ArrowLeft size={16} /></Button>}
          <span className="w-9 h-9 rounded-full sunken flex items-center justify-center shrink-0 text-muted"><User size={16} /></span>
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate flex items-center gap-1.5">{c.name}{c.vip && <Star size={12} className="text-[var(--orange)]" />}</div>
            <div className="text-xs text-muted truncate">{CONTACT_KIND_LABEL[c.kind] || c.kind}{c.company ? ` · ${c.company}` : ""}</div>
          </div>
          <Button size="xs" icon variant="ghost" onClick={() => setEdit(true)} aria-label="Edit contact" title="Edit contact"><Pencil size={13} /></Button>
        </div>
        {c.do_not_contact && (
          <div className="rounded-[var(--radius-sm)] tone-danger px-2.5 py-1.5 text-xs flex items-start gap-1.5"><ShieldBan size={13} className="mt-0.5 shrink-0" /><span><strong>Do Not Contact.</strong> {c.dnc_reason || "No reason recorded."}</span></div>
        )}
        <div className="space-y-1 text-xs">
          {c.emails.map((e) => <div key={e} className="flex items-center gap-1.5 min-w-0"><Mail size={12} className="text-muted shrink-0" /><a href={`mailto:${e}`} className="truncate hover:underline">{e}</a></div>)}
          {c.phones.map((p) => <div key={p} className="flex items-center gap-1.5 min-w-0"><Phone size={12} className="text-muted shrink-0" /><a href={telHref(p)} className="truncate hover:underline" title="Call from this device">{p}</a></div>)}
          {c.company && <div className="flex items-center gap-1.5"><Building2 size={12} className="text-muted" />{c.company}</div>}
          {c.owner && <div className="flex items-center gap-1.5"><User size={12} className="text-muted" />Owner: {c.owner}</div>}
          {c.tags.length > 0 && <div className="flex items-center gap-1.5 flex-wrap"><Tag size={12} className="text-muted" />{c.tags.map((t) => <span key={t} className="pill tone-neutral">{t}</span>)}</div>}
          {c.last_contact_at && <div className="text-muted">Last contact {ago(c.last_contact_at)}</div>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className={cn("pill pill-lg", c.vip ? "tone-orange" : "tone-neutral")} onClick={() => patch({ vip: !c.vip })} title="VIP contacts get priority and are visible to supervisors">
            <Star size={11} /> {c.vip ? "VIP" : "Mark VIP"}
          </button>
          {c.do_not_contact ? (
            <button className="pill pill-lg tone-neutral" disabled={!canManage} title={canManage ? "Clear the Do Not Contact flag" : "Only the owner or a manager can clear this"} onClick={() => patch({ do_not_contact: false, dnc_reason: null })}>
              <ShieldBan size={11} /> Clear DNC
            </button>
          ) : (
            <button className="pill pill-lg tone-neutral" onClick={() => setDncOpen(true)} title="Stop all outbound contact"><ShieldBan size={11} /> Do not contact</button>
          )}
          {onStart && !c.do_not_contact && (
            <>
              <button className="pill pill-lg tone-info" onClick={() => onStart("email")}><Mail size={11} /> New email</button>
              <button className="pill pill-lg tone-info" onClick={() => onStart("call")}><Phone size={11} /> Log call</button>
            </>
          )}
          {!full && <Link href={`/connect/contacts/${c.id}`} className="pill pill-lg tone-neutral"><ExternalLink size={11} /> Full profile</Link>}
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-center text-[11px]">
          <div className="rounded-[var(--radius-sm)] sunken py-1.5"><div className="font-semibold num">{tl?.open_conversations ?? 0}</div><div className="text-muted">Open</div></div>
          <div className="rounded-[var(--radius-sm)] sunken py-1.5"><div className={cn("font-semibold num", (tl?.open_promises ?? 0) > 0 && "text-warn")}>{tl?.open_promises ?? 0}</div><div className="text-muted">Promises</div></div>
          <div className="rounded-[var(--radius-sm)] sunken py-1.5"><div className="font-semibold num">{openFollowUps.length}</div><div className="text-muted">Follow-ups</div></div>
        </div>
      </div>

      {(openPromises.length > 0 || openFollowUps.length > 0) && (
        <div className="p-3 border-b space-y-1.5">
          {openPromises.length > 0 && <div className="eyebrow">Open promises</div>}
          {openPromises.map((i) => <QuickRow key={i.id} item={i} now={now} onOpen={onOpenConversation} />)}
          {openFollowUps.length > 0 && <div className="eyebrow pt-1">Follow-ups</div>}
          {openFollowUps.map((i) => <QuickRow key={i.id} item={i} now={now} onOpen={onOpenConversation} />)}
        </div>
      )}

      <div className={cn("min-h-0", full ? "" : "flex-1 overflow-y-auto")}>
        <div className="px-3 pt-3 eyebrow">Timeline</div>
        <TimelineList items={tl?.items || []} onOpen={onOpenConversation} />
      </div>

      {edit && <ContactFormModal open onClose={() => setEdit(false)} contact={c} onSaved={() => { setEdit(false); load(); }} />}
      <Modal open={dncOpen} onClose={() => setDncOpen(false)} title="Mark as Do Not Contact" width={440} footer={<><Button onClick={() => setDncOpen(false)}>Cancel</Button><Button variant="danger" onClick={async () => { await patch({ do_not_contact: true, dnc_reason: dncReason.trim() || null }); setDncOpen(false); }}><ShieldBan size={14} /> Block outbound contact</Button></>}>
        <p className="text-sm text-muted mb-3">The database will refuse every outbound email, message and logged outbound call to this contact until the flag is cleared by the owner or a manager. The reason is shown to everyone who opens the contact.</p>
        <Field label="Reason"><Textarea value={dncReason} onChange={(e) => setDncReason(e.target.value)} placeholder="e.g. Asked us not to contact them again on 3 Sep" style={{ minHeight: 64 }} /></Field>
      </Modal>
    </div>
  );
}

function QuickRow({ item, now, onOpen }: { item: TimelineItem; now: number; onOpen?: (id: string) => void }) {
  const overdue = !!item.at && new Date(item.at).getTime() < now;
  return (
    <button className="w-full text-left flex items-center gap-2 text-xs row-hover rounded-[var(--radius-sm)] px-1.5 py-1" onClick={() => item.conversation_id && onOpen?.(item.conversation_id)} disabled={!item.conversation_id || !onOpen}>
      <Handshake size={12} className="text-muted shrink-0" />
      <span className="flex-1 truncate">{item.subject}</span>
      <span className={cn("num whitespace-nowrap", overdue ? "text-danger" : "text-muted")}>{fmtDate(item.at)}</span>
    </button>
  );
}

export function TimelineList({ items, onOpen }: { items: TimelineItem[]; onOpen?: (id: string) => void }) {
  if (items.length === 0) return <div className="p-4 text-xs text-muted text-center">No activity yet.</div>;
  return (
    <ol className="px-3 py-2 space-y-2">
      {items.map((i) => {
        const clickable = !!i.conversation_id && !!onOpen;
        return (
          <li key={`${i.type}:${i.id}`} className={cn("flex gap-2 text-xs", clickable && "cursor-pointer row-hover rounded-[var(--radius-sm)] -mx-1 px-1")} onClick={() => clickable && onOpen?.(i.conversation_id!)}>
            <span className={cn("w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5", i.type === "note" ? "tone-warn" : i.type === "commitment" ? "tone-violet" : i.type === "follow_up" ? "tone-info" : "sunken text-muted")}>
              {i.type === "commitment" ? <Handshake size={11} /> : <ChannelIcon channel={i.kind === "follow_up" ? "note" : i.kind} size={11} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="truncate font-medium">{i.subject || humanizeKey(i.kind)}</span>
                {i.direction && i.type !== "note" && <span className="text-muted">· {i.direction}</span>}
                {i.status && i.status !== "received" && i.status !== "sent" && <span className="pill tone-neutral">{humanizeKey(i.status)}</span>}
                <span className="ml-auto text-muted whitespace-nowrap">{fmtDate(i.at, true)}</span>
              </div>
              {i.preview && <div className="text-muted line-clamp-2">{i.preview}</div>}
              <div className="text-[11px] text-muted">{i.by ? `by ${i.by}` : ""}{i.duration ? ` · ${Math.round(i.duration / 60)} min` : ""}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
