"use client";
/**
 * Ask AI about this board. The panel sends a compact JSON description of the current page to
 * the existing /api/ai/buddy route and always shows the result as a **proposal** — nothing is
 * written to the canvas until a human presses Apply (house rule: AI proposes, humans confirm).
 */
import * as React from "react";
import { Check, Sparkles, X } from "lucide-react";
import { Button, EmptyState, Modal, Spinner, Textarea, useToast } from "@/components/ui";
import { callAI } from "@/lib/ai/types";
import type { BuddyResponse } from "@/lib/ai/types";
import type { BoardElement } from "@/lib/live/types";
import { cn } from "@/lib/utils";
import { uid } from "./BoardTemplates";

type Mode = "organise" | "cluster" | "flowchart" | "mindmap" | "process" | "summarise" | "tasks" | "decisions";

const MODES: { key: Mode; label: string; hint: string; needsPrompt?: boolean }[] = [
  { key: "organise", label: "Organise notes", hint: "Tidy messy stickies into a readable grid with headings." },
  { key: "cluster", label: "Cluster similar", hint: "Group similar stickies together and colour each cluster." },
  { key: "flowchart", label: "Make a flowchart", hint: "Describe the process and get shapes + connectors.", needsPrompt: true },
  { key: "mindmap", label: "Make a mind map", hint: "Central topic and branches from your prompt.", needsPrompt: true },
  { key: "process", label: "Process diagram", hint: "Swimlane-style steps from your prompt.", needsPrompt: true },
  { key: "summarise", label: "Summarise", hint: "One paragraph plus the key points of this brainstorm." },
  { key: "tasks", label: "Extract tasks", hint: "Turn the board into a list of concrete tasks." },
  { key: "decisions", label: "Identify decisions", hint: "What has actually been decided here." },
];

type NewEl = { ref?: string; type?: string; text?: string; title?: string; x?: number; y?: number; w?: number; h?: number; fill?: string; color?: string };
type Proposal = {
  summary?: string;
  create?: NewEl[];
  connect?: { from?: string; to?: string; label?: string }[];
  update?: { id?: string; x?: number; y?: number; fill?: string; color?: string; text?: string }[];
  points?: string[];
  tasks?: { title?: string; owner?: string; due?: string }[];
  decisions?: string[];
};

const SHAPES = new Set(["sticky", "text", "rect", "ellipse", "diamond", "frame"]);

/** Pull the first JSON object out of a model answer, however it was fenced. */
export function parseProposal(answer: string): Proposal | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(answer);
  const candidates = [fenced?.[1], answer];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start < 0 || end <= start) continue;
    try {
      const parsed = JSON.parse(c.slice(start, end + 1)) as Proposal;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      /* fall through to the next candidate */
    }
  }
  return null;
}

function instruction(mode: Mode, prompt: string, board: string) {
  const shape =
    `Reply with ONE JSON object and nothing else. Shape:\n` +
    `{"summary":"one sentence","create":[{"ref":"a","type":"sticky|text|rect|ellipse|diamond|frame","text":"","title":"","x":0,"y":0,"w":180,"h":120,"fill":"warn-bg|info-bg|success-bg|violet-bg|orange-bg|danger-bg|neutral-bg"}],` +
    `"connect":[{"from":"ref-or-existing-id","to":"ref-or-existing-id","label":""}],` +
    `"update":[{"id":"existing-element-id","x":0,"y":0,"fill":"info-bg"}],` +
    `"points":["…"],"tasks":[{"title":"","owner":"","due":""}],"decisions":["…"]}\n` +
    `Coordinates are absolute board pixels; keep elements at least 40px apart and start near x=0,y=0. Only use element ids that exist.`;
  const by: Record<Mode, string> = {
    organise: "Reorganise the existing notes into a clean grid grouped by theme. Use `update` to move existing elements and `create` only for frame/label headings.",
    cluster: "Group similar sticky notes: give every cluster one fill colour, move members of a cluster next to each other with `update`, and add one frame per cluster with a short title.",
    flowchart: "Design a flowchart for the request below: rect for steps, diamond for decisions, ellipse for start/end, connected top to bottom with connectors labelled Yes/No where relevant.",
    mindmap: "Design a mind map for the request below: one central ellipse, 3-6 branches, 2-3 leaves per branch, all connected.",
    process: "Design a process diagram for the request below: one frame per swimlane (department), steps inside, connectors between steps.",
    summarise: "Summarise this brainstorm. Put the paragraph in `summary` and the key points in `points`. Do not create or update elements.",
    tasks: "Extract concrete, assignable tasks from this board into `tasks`. Do not invent owners you cannot see. Do not create or update elements.",
    decisions: "List what has actually been decided on this board in `decisions`, plus anything still open in `points`. Do not create or update elements.",
  };
  return `${by[mode]}\n\n${prompt ? `Request: ${prompt}\n\n` : ""}Board (JSON):\n${board}\n\n${shape}`;
}

export function BoardAI({
  open, onClose, boardId, elements, origin, onApply, onAddStickies,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  elements: BoardElement[];
  origin: { x: number; y: number };
  onApply: (add: BoardElement[], update: { id: string; patch: Partial<BoardElement> }[]) => void;
  onAddStickies: (titles: string[], heading: string) => void;
}) {
  const toast = useToast();
  const [enabled, setEnabled] = React.useState<boolean | null>(null);
  const [mode, setMode] = React.useState<Mode>("organise");
  const [prompt, setPrompt] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [proposal, setProposal] = React.useState<Proposal | null>(null);
  const [raw, setRaw] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || enabled !== null) return;
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((j: { enabled?: boolean }) => setEnabled(!!j.enabled))
      .catch(() => setEnabled(false));
  }, [open, enabled]);

  const compact = React.useMemo(
    () =>
      JSON.stringify(
        elements
          .filter((e) => e.type !== "pen" && e.type !== "highlighter")
          .slice(0, 160)
          .map((e) => ({
            id: e.id, type: e.type, text: (e.text || e.title || e.name || "").slice(0, 160),
            x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.w ?? 0), h: Math.round(e.h ?? 0),
            fill: e.fill, votes: e.votes?.length || undefined,
          }))
      ),
    [elements]
  );

  async function run() {
    setBusy(true);
    setProposal(null);
    setRaw(null);
    try {
      const res = await callAI<BuddyResponse>("buddy", {
        message: instruction(mode, prompt.trim(), compact),
        mode: mode === "summarise" || mode === "decisions" ? "brief" : "draft",
        scope: { path: `/boards/${boardId}` },
      });
      const parsed = parseProposal(res.answer || "");
      if (parsed) setProposal(parsed);
      else setRaw(res.answer || "The assistant did not return anything to apply.");
    } catch (e) {
      const err = e as Error & { disabled?: boolean };
      if (err.disabled) setEnabled(false);
      else toast.push(err.message || "The assistant could not answer", "danger");
    } finally {
      setBusy(false);
    }
  }

  function apply() {
    if (!proposal) return;
    const byId = new Map(elements.map((e) => [e.id, e]));
    const refs = new Map<string, string>();
    const add: BoardElement[] = [];
    for (const c of proposal.create || []) {
      const type = SHAPES.has(String(c.type)) ? (c.type as BoardElement["type"]) : "sticky";
      const id = uid();
      if (c.ref) refs.set(c.ref, id);
      add.push({
        id,
        type,
        x: origin.x + (Number(c.x) || 0),
        y: origin.y + (Number(c.y) || 0),
        w: Number(c.w) || (type === "frame" ? 420 : type === "sticky" ? 180 : 200),
        h: Number(c.h) || (type === "frame" ? 320 : type === "sticky" ? 130 : 100),
        text: typeof c.text === "string" ? c.text : "",
        title: typeof c.title === "string" ? c.title : undefined,
        fill: typeof c.fill === "string" ? c.fill : type === "sticky" ? "warn-bg" : type === "frame" ? "none" : "info-bg",
        color: typeof c.color === "string" ? c.color : type === "frame" ? "line-strong" : "fg",
        fontSize: type === "text" ? 20 : 14,
        z: type === "frame" ? -900 : 0,
      });
    }
    const resolveRef = (r?: string) => (r ? refs.get(r) || (byId.has(r) ? r : null) : null);
    for (const c of proposal.connect || []) {
      const from = resolveRef(c.from);
      const to = resolveRef(c.to);
      if (!from || !to) continue;
      add.push({ id: uid(), type: "connector", x: 0, y: 0, from, to, text: c.label || undefined, color: "fg-muted", strokeWidth: 2 });
    }
    const update: { id: string; patch: Partial<BoardElement> }[] = [];
    for (const u of proposal.update || []) {
      if (!u.id || !byId.has(u.id)) continue;
      const patch: Partial<BoardElement> = {};
      if (typeof u.x === "number") patch.x = u.x;
      if (typeof u.y === "number") patch.y = u.y;
      if (typeof u.fill === "string") patch.fill = u.fill;
      if (typeof u.color === "string") patch.color = u.color;
      if (typeof u.text === "string") patch.text = u.text;
      if (Object.keys(patch).length) update.push({ id: u.id, patch });
    }
    if (!add.length && !update.length) {
      toast.push("Nothing on the canvas to change — see the notes below", "info");
      return;
    }
    onApply(add, update);
    toast.push(`Applied ${add.length} new and ${update.length} changed element${add.length + update.length === 1 ? "" : "s"}`, "success");
    setProposal(null);
  }

  const active = MODES.find((m) => m.key === mode)!;

  return (
    <Modal open={open} onClose={onClose} title="Ask AI about this board" side width={440}>
      {enabled === false ? (
        <EmptyState
          icon={<Sparkles size={18} />}
          title="AI is switched off"
          hint="No API key is configured for this workspace, so the board assistant is unavailable. Your admin can enable it in the AI control center."
        />
      ) : (
        <div className={cn("space-y-[var(--s3)]", enabled === null && "opacity-60 pointer-events-none")}>
          <div className="grid grid-cols-2 gap-1.5">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => { setMode(m.key); setProposal(null); setRaw(null); }}
                className={cn(
                  "text-left rounded-[var(--radius-sm)] border px-2.5 py-2 text-xs transition-colors",
                  mode === m.key ? "border-[var(--brand)] bg-[var(--info-bg)]" : "hover:bg-[var(--neutral-bg)]"
                )}
              >
                <span className="block font-medium">{m.label}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{active.hint}</p>

          {active.needsPrompt && (
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What should it draw? e.g. “our onboarding process from offer letter to day 30”" style={{ minHeight: 72 }} />
          )}

          <Button variant="primary" className="w-full" onClick={run} loading={busy} disabled={active.needsPrompt && !prompt.trim()}>
            <Sparkles size={14} /> {busy ? "Thinking…" : "Ask"}
          </Button>

          {busy && <div className="py-6 flex justify-center"><Spinner /></div>}

          {raw && (
            <div className="rounded-[var(--radius-sm)] border p-3 text-sm whitespace-pre-wrap break-words">{raw}</div>
          )}

          {proposal && (
            <div className="rounded-[var(--radius)] border p-3 space-y-3 anim-pop">
              <div className="eyebrow">Proposal — nothing changes until you apply</div>
              {proposal.summary && <p className="text-sm">{proposal.summary}</p>}
              {!!proposal.points?.length && (
                <ul className="text-sm list-disc pl-4 space-y-0.5">{proposal.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
              )}
              {!!proposal.decisions?.length && (
                <div>
                  <div className="eyebrow mb-1">Decisions</div>
                  <ul className="text-sm list-disc pl-4 space-y-0.5">{proposal.decisions.map((p, i) => <li key={i}>{p}</li>)}</ul>
                  <Button size="sm" className="mt-2" onClick={() => onAddStickies(proposal.decisions || [], "Decisions")}>Add to board</Button>
                </div>
              )}
              {!!proposal.tasks?.length && (
                <div>
                  <div className="eyebrow mb-1">Tasks</div>
                  <ul className="text-sm list-disc pl-4 space-y-0.5">
                    {proposal.tasks.map((t, i) => <li key={i}>{t.title}{t.owner ? ` — ${t.owner}` : ""}{t.due ? ` (${t.due})` : ""}</li>)}
                  </ul>
                  <Button size="sm" className="mt-2" onClick={() => onAddStickies((proposal.tasks || []).map((t) => t.title || "").filter(Boolean), "Extracted tasks")}>
                    Add as stickies
                  </Button>
                </div>
              )}
              {(!!proposal.create?.length || !!proposal.update?.length) && (
                <div className="text-xs text-muted">
                  {proposal.create?.length || 0} new element{(proposal.create?.length || 0) === 1 ? "" : "s"} · {proposal.update?.length || 0} moved/recoloured · {proposal.connect?.length || 0} connector{(proposal.connect?.length || 0) === 1 ? "" : "s"}
                </div>
              )}
              <div className="flex gap-2">
                {(!!proposal.create?.length || !!proposal.update?.length) && (
                  <Button variant="primary" onClick={apply}><Check size={14} /> Apply to board</Button>
                )}
                <Button variant="ghost" onClick={() => setProposal(null)}><X size={14} /> Discard</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
