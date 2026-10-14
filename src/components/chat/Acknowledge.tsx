"use client";

import * as React from "react";
import { AlarmClock, BellRing, Check, CheckCheck, Eye, HelpCircle, MessageSquareReply, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, Button, Modal, Spinner, useToast } from "@/components/ui";
import { cn, fmtDate, ago } from "@/lib/utils";
import type { AckStatus, ChatMessage, MessageReceipt } from "./types";

/*
  Acknowledgement (0075). A message that asks for it — `ack_required`, or urgent / critical — gets
  a bar underneath:
    · for a recipient: Seen · Acknowledge · Will respond · Need clarification (their own state);
    · for the sender (and communication administrators): "4 of 9 acknowledged", opening the
      report of who was notified, who has seen it, and who answered what, with timestamps.
  Delivery, reading and acknowledging are three separate columns in `message_receipts` and are
  never conflated here: "Notified" means a notification row was created for that person, "Seen"
  means they opened the conversation (or pressed Seen), "Acknowledged" means they said so.
*/

export const ACK_OPTIONS: { key: AckStatus; label: string; icon: React.ReactNode; tone: string }[] = [
  { key: "seen", label: "Seen", icon: <Eye size={12} />, tone: "tone-neutral" },
  { key: "acknowledged", label: "Acknowledge", icon: <Check size={12} />, tone: "tone-success" },
  { key: "will_respond", label: "Will respond", icon: <MessageSquareReply size={12} />, tone: "tone-brand" },
  { key: "need_clarification", label: "Need clarification", icon: <HelpCircle size={12} />, tone: "tone-warn" },
];
const ACK_LABEL: Record<string, string> = { seen: "Seen", acknowledged: "Acknowledged", will_respond: "Will respond", need_clarification: "Needs clarification" };

export function tracksAck(m: Pick<ChatMessage, "ack_required" | "priority">) {
  return !!m.ack_required || m.priority === "urgent" || m.priority === "critical";
}

export function AckBar({
  m,
  me,
  receipts,
  canSeeReport,
  onAck,
  onReport,
}: {
  m: ChatMessage;
  me: string;
  /** Receipts for this message that the viewer may read (own row; all rows for the sender / admins). */
  receipts: MessageReceipt[];
  canSeeReport: boolean;
  onAck: (status: AckStatus) => Promise<void>;
  onReport: () => void;
}) {
  const [busy, setBusy] = React.useState<AckStatus | null>(null);
  const mine = receipts.find((r) => r.user_id === me);
  const isAuthor = m.author_id === me;

  if (isAuthor || canSeeReport) {
    const total = receipts.length;
    const acked = receipts.filter((r) => r.ack_status && r.ack_status !== "seen").length;
    const seen = receipts.filter((r) => r.seen_at).length;
    return (
      <button type="button" onClick={onReport} className="mt-1.5 inline-flex items-center gap-1.5 text-xs pill pill-lg tone-neutral hover:border-[var(--line-strong)] border border-transparent" title="Who has received, seen and acknowledged this">
        <CheckCheck size={12} />
        {total === 0 ? "Acknowledgement tracked" : `${acked} of ${total} acknowledged · ${seen} seen`}
        <span className="text-muted">· details</span>
      </button>
    );
  }

  const current = mine?.ack_status || null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1" role="group" aria-label="Acknowledge this message">
      <span className="text-[11px] text-muted inline-flex items-center gap-1 mr-1"><BellRing size={11} /> Acknowledgement requested</span>
      {ACK_OPTIONS.map((o) => {
        const on = current === o.key || (o.key === "seen" && !current && !!mine?.seen_at);
        return (
          <button
            key={o.key}
            type="button"
            disabled={!!busy}
            onClick={async () => {
              setBusy(o.key);
              try {
                await onAck(o.key);
              } finally {
                setBusy(null);
              }
            }}
            className={cn("pill pill-lg border transition-colors", on ? `${o.tone} border-transparent` : "tone-neutral border-transparent hover:border-[var(--line-strong)]")}
            aria-pressed={on}
          >
            {busy === o.key ? <Spinner className="!w-3 !h-3" /> : o.icon} {o.label}
          </button>
        );
      })}
      {current && current !== "seen" && mine?.acked_at && <span className="text-[10px] text-muted ml-1">{ACK_LABEL[current]} · {ago(mine.acked_at)}</span>}
    </div>
  );
}

type Report = {
  message_id: string;
  priority: string;
  ack_required: boolean;
  remind_after_minutes: number | null;
  escalate: boolean;
  ack_requested_at: string | null;
  tracked: boolean;
  members: number;
  recipients: { user_id: string; full_name: string | null; avatar_url: string | null; notified_at: string; seen_at: string | null; ack_status: string | null; acked_at: string | null; reminded_at: string | null; escalated_at: string | null }[];
};

export function AckReportModal({ m, onClose }: { m: ChatMessage | null; onClose: () => void }) {
  const toast = useToast();
  const [report, setReport] = React.useState<Report | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [requesting, setRequesting] = React.useState(false);
  const [loadedAt, setLoadedAt] = React.useState(0);

  const load = React.useCallback(async (id: string) => {
    setLoading(true);
    const { data, error } = await createClient().rpc("message_ack_report", { p_message: id });
    setLoading(false);
    setLoadedAt(new Date().getTime());
    if (error) {
      toast.push(error.message, "danger");
      return;
    }
    setReport(data as unknown as Report);
  }, [toast]);

  React.useEffect(() => {
    const t = setTimeout(() => {
      if (m) void load(m.id);
      else setReport(null);
    }, 0);
    return () => clearTimeout(t);
  }, [m, load]);

  async function requestAgain() {
    if (!m) return;
    setRequesting(true);
    const { data, error } = await createClient().rpc("request_acks", { p_message: m.id });
    setRequesting(false);
    if (error) return toast.push(error.message, "danger");
    toast.push(`Reminder sent to ${data ?? 0} ${Number(data) === 1 ? "person" : "people"}`, "success");
    void load(m.id);
  }

  const recipients = report?.recipients || [];
  const notified = recipients.length;
  const seen = recipients.filter((r) => r.seen_at).length;
  const acked = recipients.filter((r) => r.ack_status && r.ack_status !== "seen").length;
  const pending = recipients.filter((r) => !r.ack_status || r.ack_status === "seen").length;
  const recentlyRequested = !!report?.ack_requested_at && loadedAt - Date.parse(report.ack_requested_at) < 3600_000;

  return (
    <Modal open={!!m} onClose={onClose} title={<span className="flex items-center gap-2"><Users size={16} /> Acknowledgements</span>} width={560}>
      {m && (
        <div className="rounded-[var(--radius-sm)] border sunken px-3 py-2 mb-3 text-sm max-h-24 overflow-hidden">
          <div className="truncate-2">{m.body || "(attachment)"}</div>
        </div>
      )}
      {loading && !report && <div className="py-6 flex justify-center"><Spinner /></div>}
      {report && (
        <>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              { label: "Notified", n: notified, hint: "A notification was created for them" },
              { label: "Seen", n: seen, hint: "Opened the conversation after it was sent" },
              { label: "Acknowledged", n: acked, hint: "Said so explicitly" },
              { label: "Pending", n: pending, hint: "No answer yet" },
            ].map((s) => (
              <div key={s.label} className="rounded-[var(--radius-sm)] border p-2" title={s.hint}>
                <div className="text-lg font-semibold num leading-tight">{s.n}</div>
                <div className="text-[11px] text-muted">{s.label}</div>
              </div>
            ))}
          </div>
          {report.members > notified && <div className="text-[11px] text-muted mb-2">{report.members - notified} member{report.members - notified === 1 ? "" : "s"} of this channel received no notification (inactive, or muted before an acknowledgement rule applied).</div>}
          <div className="flex items-center justify-between gap-2 mb-2 text-[11px] text-muted">
            <span>
              {report.remind_after_minutes ? `Reminder after ${report.remind_after_minutes} min` : "No automatic reminder"}
              {report.escalate ? " · escalates to the department head" : ""}
              {report.ack_requested_at ? ` · last reminder ${ago(report.ack_requested_at)}` : ""}
            </span>
            {pending > 0 && (
              <Button size="xs" variant="secondary" onClick={requestAgain} loading={requesting} disabled={recentlyRequested} title={recentlyRequested ? "A reminder was sent less than an hour ago" : "Nudge everyone who has not acknowledged"}>
                <AlarmClock size={12} /> Request acknowledgement
              </Button>
            )}
          </div>
          <div className="max-h-[50vh] overflow-y-auto -mx-1">
            <table className="w-full text-xs">
              <thead className="text-muted text-left">
                <tr><th className="px-2 py-1 font-medium">Person</th><th className="px-2 py-1 font-medium">Notified</th><th className="px-2 py-1 font-medium">Seen</th><th className="px-2 py-1 font-medium">Answer</th></tr>
              </thead>
              <tbody>
                {recipients.map((r) => (
                  <tr key={r.user_id} className="border-t">
                    <td className="px-2 py-1.5"><span className="inline-flex items-center gap-1.5"><Avatar name={r.full_name} src={r.avatar_url} size={20} /><span className="truncate max-w-[160px]">{r.full_name || "Unknown"}</span></span></td>
                    <td className="px-2 py-1.5 num text-muted" title={fmtDate(r.notified_at, true)}>{ago(r.notified_at)}{r.reminded_at ? " · reminded" : ""}{r.escalated_at ? " · escalated" : ""}</td>
                    <td className="px-2 py-1.5 num">{r.seen_at ? <span className="text-success" title={fmtDate(r.seen_at, true)}>{ago(r.seen_at)}</span> : <span className="text-muted">—</span>}</td>
                    <td className="px-2 py-1.5">
                      {r.ack_status && r.ack_status !== "seen" ? (
                        <span className={cn("pill", r.ack_status === "acknowledged" ? "tone-success" : r.ack_status === "will_respond" ? "tone-brand" : "tone-warn")} title={r.acked_at ? fmtDate(r.acked_at, true) : undefined}>{ACK_LABEL[r.ack_status]}</span>
                      ) : (
                        <span className="text-muted">{r.seen_at ? "Seen, not acknowledged" : "Not yet"}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {recipients.length === 0 && <tr><td colSpan={4} className="px-2 py-4 text-center text-muted">Nobody was notified for this message.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="text-[10px] text-muted mt-2">Notified = a notification row was created in GHL ONE (push to a phone is attempted on top and is not reported here). Seen = the person opened the conversation, or pressed Seen. Acknowledged = the person said so.</div>
        </>
      )}
    </Modal>
  );
}
