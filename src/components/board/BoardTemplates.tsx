"use client";
/**
 * Template → BoardDoc factories. Every key in BOARD_TEMPLATES produces a real starting
 * layout (frames + stickies + labels + connectors), never an empty canvas, plus the
 * gallery used by "New board" and "Apply template".
 */
import * as React from "react";
import { LayoutTemplate } from "lucide-react";
import { BOARD_TEMPLATES, type BoardDoc, type BoardElement, type BoardElementType, type BoardTemplateKey } from "@/lib/live/types";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui";

let seq = 0;
export const uid = () => `e${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ------------------------------------------------------------- builders */
function el(e: Partial<BoardElement> & { type: BoardElementType; x: number; y: number }): BoardElement {
  return { id: uid(), z: 0, ...e } as BoardElement;
}
const frame = (x: number, y: number, w: number, h: number, title: string, color = "line-strong") =>
  el({ type: "frame", x, y, w, h, title, color, z: -1000 });
const sticky = (x: number, y: number, text: string, fill = "warn-bg", w = 170, h = 120) =>
  el({ type: "sticky", x, y, w, h, text, fill, fontSize: 14 });
const label = (x: number, y: number, text: string, fontSize = 22, w = 320) =>
  el({ type: "text", x, y, w, h: Math.max(34, fontSize * 1.6), text, fontSize, color: "fg" });
const shape = (type: "rect" | "ellipse" | "diamond", x: number, y: number, w: number, h: number, text = "", fill = "info-bg", color = "brand") =>
  el({ type, x, y, w, h, text, fill, color, strokeWidth: 2 });
const conn = (from: string, to: string, text?: string, color = "fg-muted") =>
  el({ type: "connector", x: 0, y: 0, from, to, text, color, strokeWidth: 2 });
const table = (x: number, y: number, w: number, h: number, rows: string[][]) =>
  el({ type: "table", x, y, w, h, rows, fontSize: 12 });

/** A titled column of stickies. */
function column(x: number, y: number, title: string, items: string[], fill: string, w = 300): BoardElement[] {
  const out: BoardElement[] = [frame(x, y, w, 120 + items.length * 140, title)];
  items.forEach((t, i) => out.push(sticky(x + (w - 170) / 2, y + 60 + i * 140, t, fill)));
  return out;
}

function doc(elements: BoardElement[], background: BoardDoc["background"] = "dots", title = "Page 1"): BoardDoc {
  return { pages: [{ id: uid(), title, elements: elements.map((e, i) => ({ ...e, z: e.z ?? i })) }], background };
}

/* ------------------------------------------------------------ templates */
function brainstorm(): BoardDoc {
  const out = [
    label(0, -70, "Brainstorm — write one idea per note, then vote", 24, 700),
    ...column(0, 0, "Ideas", ["Idea…", "Idea…", "Idea…"], "warn-bg"),
    ...column(340, 0, "Promising", ["Move the best ideas here"], "success-bg"),
    ...column(680, 0, "Parked", ["Not now — revisit later"], "neutral-bg"),
    frame(1020, 0, 320, 400, "How we decide"),
    sticky(1085, 60, "1. 5 min silent writing\n2. Cluster\n3. 3 votes each\n4. Decide", "info-bg", 190, 200),
  ];
  return doc(out);
}

function projectPlanning(): BoardDoc {
  const goal = sticky(0, -10, "Goal: what does done look like?", "info-bg", 300, 120);
  const out: BoardElement[] = [label(0, -80, "Project planning", 24, 480), goal];
  const names = ["Milestone 1 — Discovery", "Milestone 2 — Build", "Milestone 3 — Launch"];
  names.forEach((n, i) => {
    const x = i * 360;
    out.push(frame(x, 160, 320, 560, n));
    out.push(sticky(x + 75, 220, "Task…", "warn-bg"));
    out.push(sticky(x + 75, 360, "Task…", "warn-bg"));
    out.push(sticky(x + 75, 500, "Owner + due date", "neutral-bg"));
  });
  out.push(frame(1120, 160, 300, 300, "Risks"));
  out.push(sticky(1185, 220, "Risk…", "danger-bg"));
  return doc(out);
}

function flowchart(): BoardDoc {
  const start = shape("ellipse", 0, 0, 180, 90, "Start", "success-bg", "success");
  const step1 = shape("rect", 0, 160, 200, 100, "Step");
  const dec = shape("diamond", -10, 320, 220, 140, "Decision?", "warn-bg", "warn");
  const yes = shape("rect", -300, 520, 200, 100, "Yes path");
  const no = shape("rect", 300, 520, 200, 100, "No path");
  const end = shape("ellipse", 0, 700, 180, 90, "End", "neutral-bg", "fg-muted");
  return doc([
    label(-40, -80, "Flowchart", 24, 400),
    start, step1, dec, yes, no, end,
    conn(start.id, step1.id), conn(step1.id, dec.id),
    conn(dec.id, yes.id, "Yes"), conn(dec.id, no.id, "No"),
    conn(yes.id, end.id), conn(no.id, end.id),
  ]);
}

function orgChart(): BoardDoc {
  const head = shape("rect", 0, 0, 240, 90, "Department head", "info-bg");
  const kids = ["Manager", "Team lead", "Team lead"].map((t, i) => shape("rect", -360 + i * 360, 200, 220, 80, t, "neutral-bg", "fg-muted"));
  const grand = ["Employee", "Employee", "Employee", "Employee"].map((t, i) => shape("rect", -470 + i * 250, 380, 200, 70, t, "bg-elev", "line-strong"));
  return doc([
    label(-40, -80, "Org chart — who reports to whom", 24, 560),
    head, ...kids, ...grand,
    ...kids.map((k) => conn(head.id, k.id)),
    conn(kids[0].id, grand[0].id), conn(kids[0].id, grand[1].id), conn(kids[1].id, grand[2].id), conn(kids[2].id, grand[3].id),
  ]);
}

function customerJourney(): BoardDoc {
  const stages = ["Awareness", "Consideration", "Decision", "Onboarding", "Support"];
  const out: BoardElement[] = [label(0, -80, "Customer journey", 24, 460)];
  const lanes = ["Touchpoints", "Pains", "Gains"];
  lanes.forEach((lane, li) => out.push(label(-180, 120 + li * 220, lane, 15, 160)));
  stages.forEach((s, i) => {
    const x = i * 300;
    out.push(frame(x, 0, 270, 700, s));
    out.push(sticky(x + 50, 110, "Touchpoint…", "info-bg", 170, 100));
    out.push(sticky(x + 50, 330, "Pain…", "danger-bg", 170, 100));
    out.push(sticky(x + 50, 550, "Gain…", "success-bg", 170, 100));
  });
  return doc(out);
}

function mindMap(): BoardDoc {
  const center = shape("ellipse", 0, 0, 260, 120, "Central topic", "brand", "brand");
  const branches = ["Branch A", "Branch B", "Branch C", "Branch D"].map((t, i) => {
    const a = (Math.PI / 2) * i - Math.PI / 4;
    return shape("rect", Math.cos(a) * 420 - 90, Math.sin(a) * 320 - 40, 200, 90, t, "violet-bg", "violet");
  });
  const leaves = branches.flatMap((b, i) => [0, 1].map((j) => sticky(b.x + (i < 2 ? 260 : -240), b.y - 60 + j * 130, "Idea…", "warn-bg", 160, 100)));
  return doc([
    center, ...branches, ...leaves,
    ...branches.map((b) => conn(center.id, b.id)),
    ...branches.flatMap((b, i) => [conn(b.id, leaves[i * 2].id), conn(b.id, leaves[i * 2 + 1].id)]),
  ]);
}

function processMap(): BoardDoc {
  const lanes = ["Sales", "Operations", "Finance", "IT"];
  const out: BoardElement[] = [label(0, -80, "Process map — swimlanes", 24, 480)];
  const boxes: BoardElement[] = [];
  lanes.forEach((lane, i) => {
    const y = i * 200;
    out.push(frame(0, y, 1500, 170, lane));
    const b = shape("rect", 60 + i * 120, y + 45, 200, 80, "Step…");
    boxes.push(b);
    out.push(b);
  });
  for (let i = 0; i + 1 < boxes.length; i++) out.push(conn(boxes[i].id, boxes[i + 1].id));
  return doc(out);
}

function sprintPlanning(): BoardDoc {
  return doc([
    label(0, -80, "Sprint planning", 24, 400),
    ...column(0, 0, "Backlog", ["Story…", "Story…", "Story…"], "neutral-bg"),
    ...column(340, 0, "This sprint", ["Committed story…"], "info-bg"),
    ...column(680, 0, "In progress", ["Pick me up"], "warn-bg"),
    ...column(1020, 0, "Done", ["Shipped"], "success-bg"),
    frame(1360, 0, 300, 280, "Sprint goal"),
    sticky(1425, 60, "One sentence the team can repeat", "violet-bg", 170, 160),
  ]);
}

function retrospective(): BoardDoc {
  return doc([
    label(0, -80, "Retrospective", 24, 400),
    ...column(0, 0, "Went well", ["…"], "success-bg"),
    ...column(340, 0, "To improve", ["…"], "warn-bg"),
    ...column(680, 0, "Puzzles", ["…"], "info-bg"),
    ...column(1020, 0, "Actions (owner + date)", ["…"], "violet-bg"),
    sticky(0, 420, "House rule: talk about the system, never the person.", "neutral-bg", 300, 90),
  ]);
}

function incidentAnalysis(): BoardDoc {
  return doc([
    label(0, -80, "Incident analysis", 24, 420),
    frame(0, 0, 320, 340, "What happened"), sticky(65, 60, "Summary…", "danger-bg"),
    frame(360, 0, 320, 340, "Impact"), sticky(425, 60, "Who / how many / how long", "warn-bg"),
    frame(720, 0, 320, 340, "Root cause"), sticky(785, 60, "Cause…", "info-bg"),
    frame(1080, 0, 320, 340, "Fix + prevention"), sticky(1145, 60, "Action + owner", "success-bg"),
    table(0, 400, 1400, 160, [["Time", "Event", "Who", "Evidence"], ["", "", "", ""], ["", "", "", ""]]),
  ]);
}

function architectureDiagram(): BoardDoc {
  const web = shape("rect", 0, 0, 220, 90, "Web app", "info-bg");
  const api = shape("rect", 320, 0, 220, 90, "API");
  const auth = shape("rect", 320, 160, 220, 90, "Auth", "violet-bg", "violet");
  const db = shape("rect", 640, 0, 220, 90, "Postgres", "success-bg", "success");
  const store = shape("rect", 640, 160, 220, 90, "Object storage", "success-bg", "success");
  const queue = shape("rect", 320, 320, 220, 90, "Jobs / cron", "warn-bg", "warn");
  return doc([
    label(0, -80, "Architecture", 24, 400),
    web, api, auth, db, store, queue,
    conn(web.id, api.id, "https"), conn(api.id, db.id), conn(api.id, store.id), conn(web.id, auth.id), conn(api.id, queue.id),
  ]);
}

function incidentTimeline(): BoardDoc {
  const steps = ["Detected", "Triaged", "Mitigated", "Resolved", "Reviewed"];
  const boxes = steps.map((s, i) => shape("rect", i * 300, 0, 220, 90, s, i < 3 ? "danger-bg" : "success-bg", i < 3 ? "danger" : "success"));
  const notes = steps.map((_, i) => sticky(i * 300 + 25, 160, "hh:mm — what happened", "neutral-bg", 170, 110));
  return doc([label(0, -80, "Incident timeline", 24, 420), ...boxes, ...notes, ...boxes.slice(0, -1).map((b, i) => conn(b.id, boxes[i + 1].id))]);
}

function apiFlow(): BoardDoc {
  const client = shape("rect", 0, 0, 200, 80, "Client");
  const gw = shape("rect", 280, 0, 200, 80, "API route");
  const authz = shape("diamond", 560, -20, 220, 120, "RLS / permission?", "warn-bg", "warn");
  const svc = shape("rect", 860, 0, 200, 80, "Service");
  const db = shape("rect", 1140, 0, 200, 80, "Database", "success-bg", "success");
  const err = shape("rect", 560, 220, 220, 80, "403 + Request access", "danger-bg", "danger");
  return doc([
    label(0, -90, "API flow", 24, 340),
    client, gw, authz, svc, db, err,
    conn(client.id, gw.id, "request"), conn(gw.id, authz.id), conn(authz.id, svc.id, "allowed"),
    conn(authz.id, err.id, "denied"), conn(svc.id, db.id), conn(db.id, client.id, "response"),
  ]);
}

function pitchPlanning(): BoardDoc {
  const cols = [["Audience", "info-bg"], ["Pain", "danger-bg"], ["Promise", "success-bg"], ["Proof", "violet-bg"], ["Ask", "warn-bg"]];
  const out: BoardElement[] = [label(0, -80, "Pitch planning", 24, 400)];
  cols.forEach(([t, fill], i) => {
    out.push(frame(i * 300, 0, 270, 420, t));
    out.push(sticky(i * 300 + 50, 60, "…", fill, 170, 140));
    out.push(sticky(i * 300 + 50, 230, "…", fill, 170, 140));
  });
  return doc(out);
}

function accountPlanning(): BoardDoc {
  return doc([
    label(0, -80, "Account planning", 24, 400),
    frame(0, 0, 320, 460, "Stakeholders"), sticky(65, 60, "Name — role — attitude", "info-bg"), sticky(65, 200, "Name — role — attitude", "info-bg"),
    frame(360, 0, 320, 460, "Their goals"), sticky(425, 60, "Goal…", "success-bg"),
    frame(720, 0, 320, 460, "Risks"), sticky(785, 60, "Risk…", "danger-bg"),
    frame(1080, 0, 320, 460, "Next steps"), sticky(1145, 60, "Action — owner — date", "warn-bg"),
    table(0, 520, 1400, 140, [["Date", "Touchpoint", "Outcome"], ["", "", ""], ["", "", ""]]),
  ]);
}

function objectionMap(): BoardDoc {
  const out: BoardElement[] = [label(0, -80, "Objection map", 24, 380), ...[] as BoardElement[]];
  ["Too expensive", "Not now", "We have a vendor"].forEach((o, i) => {
    const y = i * 220;
    const obj = sticky(0, y, o, "danger-bg", 220, 140);
    const res = sticky(360, y, "Response…", "info-bg", 220, 140);
    const proof = sticky(720, y, "Proof / case study", "success-bg", 220, 140);
    out.push(obj, res, proof, conn(obj.id, res.id), conn(res.id, proof.id));
  });
  return doc(out);
}

function rootCauseAnalysis(): BoardDoc {
  const problem = shape("rect", 900, 200, 260, 110, "Problem statement", "danger-bg", "danger");
  const out: BoardElement[] = [label(0, -80, "Root cause analysis — 5 whys", 24, 560), problem];
  let prev = problem.id;
  for (let i = 0; i < 5; i++) {
    const s = sticky(i * 180, 200 - (i % 2) * 160, `Why ${i + 1}?`, "warn-bg", 160, 120);
    out.push(s, conn(s.id, prev));
    prev = s.id;
  }
  out.push(frame(0, 420, 1160, 260, "Countermeasures (owner + date)"));
  out.push(sticky(60, 480, "Action…", "success-bg"));
  out.push(sticky(260, 480, "Action…", "success-bg"));
  return doc(out);
}

function moodboard(): BoardDoc {
  const out: BoardElement[] = [label(0, -80, "Moodboard", 24, 320)];
  out.push(frame(0, 0, 700, 460, "References — drop images here"));
  out.push(frame(740, 0, 300, 460, "Colour"));
  ["brand", "accent", "violet", "success"].forEach((c, i) => out.push(shape("rect", 780, 60 + i * 100, 220, 80, "", c, c)));
  out.push(frame(1080, 0, 320, 460, "Type + notes"));
  out.push(label(1120, 60, "Heading — 32/1.2", 30, 260));
  out.push(label(1120, 150, "Body — 15/1.5", 15, 260));
  out.push(sticky(1120, 220, "Feeling: calm, institutional, precise", "neutral-bg", 240, 160));
  return doc(out, "plain");
}

function userFlow(): BoardDoc {
  const screens = ["Landing", "Sign in", "Home", "Detail", "Confirm"];
  const boxes = screens.map((s, i) => shape("rect", i * 300, (i % 2) * 180, 220, 140, s, "bg-elev", "line-strong"));
  return doc([
    label(0, -90, "User flow", 24, 320),
    ...boxes,
    ...boxes.slice(0, -1).map((b, i) => conn(b.id, boxes[i + 1].id)),
    sticky(0, 420, "Mark every dead end and every error state.", "warn-bg", 260, 100),
  ]);
}

function onboardingJourney(): BoardDoc {
  const stages = [["Day 1", "info-bg"], ["Week 1", "violet-bg"], ["Month 1", "warn-bg"], ["90 days", "success-bg"]];
  const out: BoardElement[] = [label(0, -80, "Onboarding journey", 24, 420)];
  stages.forEach(([t, fill], i) => {
    const x = i * 340;
    out.push(frame(x, 0, 310, 600, t));
    out.push(sticky(x + 70, 60, "What they do", fill));
    out.push(sticky(x + 70, 200, "Who helps", "neutral-bg"));
    out.push(sticky(x + 70, 340, "What good looks like", "success-bg"));
  });
  return doc(out);
}

const FACTORIES: Record<BoardTemplateKey, () => BoardDoc> = {
  blank: () => doc([]),
  brainstorm,
  project_planning: projectPlanning,
  flowchart,
  org_chart: orgChart,
  customer_journey: customerJourney,
  mind_map: mindMap,
  process_map: processMap,
  sprint_planning: sprintPlanning,
  retrospective,
  incident_analysis: incidentAnalysis,
  architecture_diagram: architectureDiagram,
  incident_timeline: incidentTimeline,
  api_flow: apiFlow,
  pitch_planning: pitchPlanning,
  account_planning: accountPlanning,
  objection_map: objectionMap,
  root_cause_analysis: rootCauseAnalysis,
  moodboard,
  user_flow: userFlow,
  onboarding_journey: onboardingJourney,
};

/** Build the starting document for a template. */
export function templateDoc(key: BoardTemplateKey): BoardDoc {
  const make = FACTORIES[key] || FACTORIES.blank;
  try {
    return make();
  } catch {
    return FACTORIES.blank();
  }
}

/** Elements only — used by "apply template to this page". */
export function templateElements(key: BoardTemplateKey): BoardElement[] {
  return templateDoc(key).pages[0]?.elements ?? [];
}

export const TEMPLATE_GROUPS = ["General", "IT", "Sales", "Support", "Design", "HR"] as const;

/* -------------------------------------------------------------- gallery */
export function BoardTemplateGallery({ value, onPick, compact }: { value?: BoardTemplateKey | null; onPick: (key: BoardTemplateKey) => void; compact?: boolean }) {
  return (
    <div className="space-y-[var(--s4)]">
      {TEMPLATE_GROUPS.map((group) => {
        const items = BOARD_TEMPLATES.filter((t) => t.group === group);
        if (!items.length) return null;
        return (
          <div key={group}>
            <div className="eyebrow mb-2">{group}</div>
            <div className={cn("grid gap-2", compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
              {items.map((t) => (
                <Card
                  key={t.key}
                  hover
                  role="button"
                  tabIndex={0}
                  onClick={() => onPick(t.key)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(t.key); } }}
                  className={cn("cursor-pointer p-[var(--s3)] flex items-start gap-2.5", value === t.key && "border-[var(--brand)]")}
                >
                  <span className="w-8 h-8 rounded-[var(--radius-sm)] sunken flex items-center justify-center shrink-0 text-muted">
                    <LayoutTemplate size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">{t.label}</span>
                    <span className="block text-[11px] text-muted truncate">{t.hint}</span>
                  </span>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
