"use client";
/**
 * Bring people in mid-call (§112, §113, §114, §187, §188).
 * Person → ring · Department → ring the on-duty chain · "Who should join?" → GHL Buddy
 * (`who_can_help`) proposes people, a human clicks invite · External guest link (§160).
 */
import * as React from "react";
import { Building2, Copy, Link2, Sparkles, UserPlus, Users } from "lucide-react";
import { Avatar, Button, Field, Input, Modal, Pill, Spinner, useToast } from "@/components/ui";
import { DepartmentPicker, PersonPicker } from "@/components/pickers";
import { useSession } from "@/components/providers/SessionProvider";
import { guestLink, invitePerson, inviteDepartment } from "@/lib/live/client";
import { callAI, type BuddyResponse } from "@/lib/ai/types";

type Suggestion = { id: string; name: string; why: string };

export function InviteSheet({
  open,
  onClose,
  roomId,
  roomTitle,
  confidential,
  guestsAllowed,
  context,
}: {
  open: boolean;
  onClose: () => void;
  roomId: string;
  roomTitle: string;
  confidential: boolean;
  guestsAllowed: boolean;
  /** One line describing what the room is doing right now — used as AI context. */
  context?: string;
}) {
  const { people } = useSession();
  const toast = useToast();
  const [person, setPerson] = React.useState("");
  const [dept, setDept] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [link, setLink] = React.useState("");
  const [guestName, setGuestName] = React.useState("");
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiOff, setAiOff] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);

  async function ring(userId: string) {
    setBusy(true);
    try {
      await invitePerson(roomId, userId, "ring");
      toast.push(`${people.find((p) => p.id === userId)?.full_name || "They"} are being called`, "success");
      setPerson("");
    } catch (e) {
      toast.push((e as Error).message, "danger");
    }
    setBusy(false);
  }

  async function ringDepartment() {
    if (!dept) return;
    setBusy(true);
    try {
      const n = await inviteDepartment(roomId, dept, `You are needed in ${roomTitle}`);
      toast.push(n ? `Rang ${n} ${n === 1 ? "person" : "people"} in that department` : "Nobody is on duty in that department", n ? "success" : "danger");
      setDept("");
    } catch (e) {
      toast.push((e as Error).message, "danger");
    }
    setBusy(false);
  }

  async function askAI() {
    setAiBusy(true);
    setSuggestions([]);
    try {
      const res = await callAI<BuddyResponse>("buddy", {
        mode: "who_can_help",
        message: `We are in the live room “${roomTitle}”. ${context || ""} Who inside the company should join this call, and why? Keep it to at most four people.`,
        scope: { path: `/live/${roomId}` },
      });
      const named = res.proposals
        .filter((p) => p.person_id || p.assignee_id)
        .map((p) => ({ id: (p.person_id || p.assignee_id)!, name: p.assignee_name || people.find((x) => x.id === (p.person_id || p.assignee_id))?.full_name || "Someone", why: p.reason || p.description || p.title }));
      const fromContext = res.context
        .filter((c) => c.kind === "person" && c.id)
        .map((c) => ({ id: c.id!, name: c.title, why: "Mentioned as relevant" }));
      const merged = [...named, ...fromContext].filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i).slice(0, 5);
      setSuggestions(merged);
      if (!merged.length) toast.push(res.answer.slice(0, 140) || "No suggestions — use the picker above.", "info");
    } catch (e) {
      const err = e as Error & { disabled?: boolean };
      if (err.disabled) setAiOff(true);
      else toast.push(err.message, "danger");
    }
    setAiBusy(false);
  }

  async function makeGuestLink() {
    setBusy(true);
    try {
      const url = await guestLink(roomId, guestName.trim() || undefined, undefined, 4);
      setLink(url);
    } catch (e) {
      toast.push((e as Error).message, "danger");
    }
    setBusy(false);
  }

  return (
    <Modal open={open} onClose={onClose} title={`Bring people into ${roomTitle}`} width={520} side>
      <div className="space-y-[var(--s4)]">
        <div>
          <div className="eyebrow mb-2 flex items-center gap-1.5"><UserPlus size={12} /> Someone specific</div>
          <div className="flex items-end gap-2">
            <Field label="Person" className="flex-1"><PersonPicker value={person} onChange={setPerson} placeholder="Choose a person" /></Field>
            <Button variant="primary" size="sm" disabled={!person} loading={busy} onClick={() => void ring(person)}>Ring</Button>
          </div>
        </div>

        <div>
          <div className="eyebrow mb-2 flex items-center gap-1.5"><Building2 size={12} /> A whole department</div>
          <div className="flex items-end gap-2">
            <Field label="Department" className="flex-1" hint="Rings whoever is on duty plus the head and escalation chain."><DepartmentPicker value={dept} onChange={setDept} /></Field>
            <Button size="sm" disabled={!dept} loading={busy} onClick={() => void ringDepartment()}>Ring</Button>
          </div>
        </div>

        <div>
          <div className="eyebrow mb-2 flex items-center gap-1.5"><Sparkles size={12} /> Who should join?</div>
          {aiOff ? (
            <p className="text-xs text-muted">AI suggestions are switched off on this workspace. Use the picker above.</p>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={() => void askAI()} loading={aiBusy}>
                <Sparkles size={14} /> Suggest people
              </Button>
              <p className="text-[11px] text-muted mt-1.5">GHL Buddy proposes; you decide who actually gets called.</p>
              {aiBusy && <div className="py-3 flex justify-center"><Spinner /></div>}
              <div className="mt-2 space-y-1.5">
                {suggestions.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-2">
                    <Avatar name={s.name} src={people.find((p) => p.id === s.id)?.avatar_url} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{s.name}</span>
                      <span className="block text-[11px] text-muted truncate">{s.why}</span>
                    </span>
                    <Button size="xs" variant="primary" onClick={() => void ring(s.id)}>Invite</Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          <div className="eyebrow mb-2 flex items-center gap-1.5"><Link2 size={12} /> External guest</div>
          {confidential ? (
            <Pill tone="tone-warn">Confidential room — guest links are disabled.</Pill>
          ) : (
            <>
              <div className="flex items-end gap-2">
                <Field label="Guest name (optional)" className="flex-1"><Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="e.g. Priya from Acme" /></Field>
                <Button size="sm" loading={busy} onClick={() => void makeGuestLink()}>Create link</Button>
              </div>
              {link && (
                <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-2">
                  <code className="text-[11px] truncate flex-1 min-w-0">{link}</code>
                  <Button
                    size="xs"
                    onClick={() => {
                      void navigator.clipboard?.writeText(link);
                      toast.push("Link copied", "success");
                    }}
                  >
                    <Copy size={12} /> Copy
                  </Button>
                </div>
              )}
              <p className="text-[11px] text-muted mt-1.5">
                Valid for 4 hours, at most 3 uses. Guests see only this call — never company data. {guestsAllowed ? "" : "Creating a link switches guest access on for this room."}
              </p>
            </>
          )}
        </div>

        <p className="text-[11px] text-muted flex items-center gap-1.5"><Users size={12} /> Everyone you add is recorded in the room history.</p>
      </div>
    </Modal>
  );
}
