"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail, MessagesSquare, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, useToast } from "@/components/ui";
import { ago } from "@/lib/utils";
import { ChannelIcon, ConvStatusPill, AssigneeAvatar } from "./ConnectBits";
import { ContactPane } from "./ContactPane";
import { NewConversationModal } from "./ConnectWorkspace";
import { errText, type ContactRow, type ConversationRow, type InboxLite } from "./lib";

/** /connect/contacts/[id] — full profile, conversations and timeline; start an email or log a call from here. */
export function ContactPage({ contact, conversations, inboxes }: { contact: ContactRow; conversations: ConversationRow[]; inboxes: InboxLite[] }) {
  const router = useRouter();
  const toast = useToast();
  const [newOpen, setNewOpen] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  async function logCall() {
    // Start (or reuse) a call thread so the full Log call form is available.
    const { data, error } = await createClient().rpc("start_conversation", { p_contact: contact.id, p_channel: "call", p_subject: `Call · ${contact.name}` });
    if (error || !data) return toast.push(errText(error), "danger");
    router.push(`/connect/${data}`);
  }

  return (
    <div className="page">
      <Link href="/connect/contacts" className="inline-flex items-center gap-1.5 text-xs text-muted hover:underline mb-[var(--s3)]"><ArrowLeft size={12} /> Contacts</Link>
      <div className="grid lg:grid-cols-[360px_1fr] gap-[var(--s3)] items-start">
        <Card className="overflow-hidden">
          <ContactPane contactId={contact.id} refreshKey={tick} full onOpenConversation={(id) => router.push(`/connect/${id}`)} onStart={(ch) => (ch === "email" ? setNewOpen(true) : logCall())} />
        </Card>
        <div className="space-y-[var(--s3)] min-w-0">
          <Card>
            <div className="flex items-center justify-between px-[var(--s4)] py-[var(--s3)] border-b">
              <div className="h3">Conversations</div>
              <div className="flex gap-1.5">
                {!contact.do_not_contact && <Button size="sm" variant="primary" onClick={() => setNewOpen(true)}><Mail size={13} /> New email</Button>}
                {!contact.do_not_contact && <Button size="sm" onClick={logCall}><Phone size={13} /> Log call</Button>}
              </div>
            </div>
            {conversations.length === 0 ? (
              <EmptyState icon={<MessagesSquare size={18} />} title="No conversations yet" className="py-8" />
            ) : (
              <div className="divide-y">
                {conversations.map((c) => (
                  <Link key={c.id} href={`/connect/${c.id}`} className="flex items-center gap-3 px-[var(--s4)] py-2.5 row-hover">
                    <span className="w-8 h-8 rounded-full sunken flex items-center justify-center text-muted shrink-0"><ChannelIcon channel={c.channel} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{c.subject || c.channel}</div>
                      <div className="text-xs text-muted">{ago(c.last_message_at)}{c.disposition ? ` · ${c.disposition.replace(/_/g, " ")}` : ""}</div>
                    </div>
                    <AssigneeAvatar id={c.assigned_to} />
                    <ConvStatusPill status={c.status} />
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
      {newOpen && <NewConversationModal open onClose={() => setNewOpen(false)} inboxes={inboxes} contact={contact} onCreated={(id) => { setNewOpen(false); setTick((t) => t + 1); router.push(`/connect/${id}`); }} />}
    </div>
  );
}
