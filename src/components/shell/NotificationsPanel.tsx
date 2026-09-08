"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertOctagon, AtSign, Bell, CheckCheck, CheckSquare, Clock, Info, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Button, EmptyState, Modal } from "@/components/ui";
import { PushOptInPrompt } from "@/components/notifications/PushOptIn";
import { ago, cn, type Notification } from "@/lib/utils";

export const KIND_ICON: Record<string, React.ReactNode> = {
  critical: <AlertOctagon size={15} className="text-danger" />,
  action_required: <Zap size={15} className="text-warn" />,
  mention: <AtSign size={15} className="text-info" />,
  approval: <CheckSquare size={15} className="text-violet" />,
  deadline: <Clock size={15} className="text-orange" />,
  information: <Info size={15} className="text-muted" />,
};

export function NotificationsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile } = useSession();
  const router = useRouter();
  const [items, setItems] = React.useState<Notification[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data } = await createClient().from("notifications").select("*").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(40);
    setItems(data || []);
    setLoading(false);
  }, [profile.id]);

  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [open, load]);

  async function markAll() {
    await createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", profile.id).is("read_at", null);
    load();
  }
  async function openItem(n: Notification) {
    if (!n.read_at) await createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    onClose();
    if (n.link) router.push(n.link);
  }

  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><Bell size={16} /> Notifications</span>} side width={420}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted">{items.filter((i) => !i.read_at).length} unread</span>
        <div className="flex gap-1">
          <Button size="xs" variant="ghost" onClick={markAll}><CheckCheck size={13} /> Mark all read</Button>
          <Button size="xs" variant="ghost" onClick={() => { onClose(); router.push("/inbox"); }}>Open Inbox</Button>
        </div>
      </div>
      <PushOptInPrompt />
      {!loading && items.length === 0 && <EmptyState icon={<Bell size={18} />} title="You're all caught up" hint="Assignments, mentions, approvals and deadlines land here." />}
      <div className="space-y-1">
        {items.map((n) => (
          <button key={n.id} onClick={() => openItem(n)} className={cn("w-full text-left flex gap-3 px-2.5 py-2.5 rounded-[var(--radius-sm)] row-hover", !n.read_at && "bg-[color-mix(in_oklab,var(--brand)_7%,transparent)]")}>
            <span className="mt-0.5 shrink-0">{KIND_ICON[n.kind]}</span>
            <span className="min-w-0 flex-1">
              <span className={cn("block text-sm leading-snug", !n.read_at && "font-medium")}>{n.title}</span>
              {n.body && <span className="block text-xs text-muted truncate-2 mt-0.5">{n.body}</span>}
              <span className="block text-[11px] text-muted mt-1">{ago(n.created_at)}</span>
            </span>
            {!n.read_at && <span className="w-2 h-2 rounded-full bg-[var(--brand-2)] mt-2 shrink-0" />}
          </button>
        ))}
      </div>
    </Modal>
  );
}
