/**
 * Rule-based natural-language delegation parser (Phase 1, no AI key).
 * Turns "Assign the Mauritius deck to Design. Ask Content to proofread it first. Final version Thursday evening. I approve before release."
 * into an ordered, dependent workflow proposal.
 */

export type CtxPerson = { id: string; full_name: string; department_id: string | null };
export type CtxDept = { id: string; name: string; slug: string; head_id?: string | null };
export type CtxProject = { id: string; name: string };
export type DelegationCtx = { people: CtxPerson[]; departments: CtxDept[]; projects: CtxProject[]; now?: Date };

export type DelegationStep = {
  title: string;
  department_id: string | null;
  assignee_id: string | null;
  due_date: Date | null;
  depends_on_previous: boolean;
  final: boolean;
  source: string;
  /** Optional — set by the AI parser; rule-based parsing leaves it undefined (→ "normal"). */
  priority?: "critical" | "urgent" | "high" | "normal" | "low";
};
export type DelegationProposal = {
  project_id: string | null;
  project_name: string | null;
  summary: string;
  deadline: Date | null;
  approver_needed: boolean;
  steps: DelegationStep[];
};

/* ----------------------------------------------------------- dictionaries */
const DEPT_SYNONYMS: Record<string, string[]> = {
  content: ["content", "content team", "writer", "writers", "copy", "copywriter", "copywriting", "editorial", "editor", "proofread", "proofreading", "proofreader"],
  design: ["design", "design team", "designer", "designers", "creative", "creatives", "graphic", "graphics", "ui", "ux", "ui/ux", "visuals"],
  technology: ["dev", "devs", "developer", "developers", "development", "tech", "tech team", "technology", "engineering", "engineer", "engineers", "it team"],
  sales: ["sales", "sales team", "salesperson"],
  marketing: ["marketing", "marketing team", "marketer", "campaign team", "social media"],
  support: ["support", "customer support", "support team", "helpdesk", "service desk"],
  finance: ["finance", "finance team", "accounts", "accounting", "budget team", "invoicing"],
  legal: ["legal", "legal team", "compliance", "compliance team", "contracts team", "lawyer", "regulatory"],
  hr: ["hr", "hr team", "human resources", "recruitment", "recruiting", "hiring", "onboarding"],
  operations: ["operations", "ops", "ops team"],
  "investor-relations": ["investor relations", "ir team", "investor team"],
  management: ["management", "leadership", "exec team", "executive team", "the board"],
  admin: ["administration", "admin team"],
  bizdev: ["bizdev", "business development", "partnerships"],
};

const LEAD_VERBS = "create|prepare|build|make|write|design|develop|draft|produce|deliver|plan|organise|organize|set up|setup|put together|send|review|proofread|finalise|finalize|publish|launch|ship|update|fix|research|record|edit|translate|schedule|book|arrange|compile|collect|gather|check|test|deploy|approve|sign off|coordinate|handle|manage|complete|finish|do";
const META_RE = /^(i need|we need|i want|i expect|final version|deadline|due|by |must be|should be|needs? to be|has to be|make sure|ensure)/i;
const APPROVAL_RE = /\b(i (will |must |need to |have to |want to |should )?(approve|sign[- ]?off|review it|review the final)|(my|need|needs|require|requires) (final )?(approval|sign[- ]?off)|before (release|publishing|it goes out|sending|it is sent|it's sent)|approval before|for my approval)\b/i;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/* -------------------------------------------------------------- helpers */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const clean = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, "").trim();

function at(d: Date, h: number, m = 0) {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/* ------------------------------------------------------------ deadlines */
export type DeadlineHit = { date: Date; matched: string[] };

/** Extract a deadline from free text. Returns the date and the phrases consumed (so titles can be cleaned). */
export function parseDeadline(text: string, now = new Date()): DeadlineHit | null {
  const t = text.toLowerCase();
  const matched: string[] = [];
  let base: Date | null = null;
  let hour: number | null = null;
  let minute = 0;

  // Time of day
  const tod = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (tod) {
    let h = parseInt(tod[1]!, 10) % 12;
    if (tod[3] === "pm") h += 12;
    hour = h; minute = tod[2] ? parseInt(tod[2], 10) : 0; matched.push(tod[0]);
  } else {
    const t24 = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (t24) { hour = parseInt(t24[1]!, 10); minute = parseInt(t24[2]!, 10); matched.push(t24[0]); }
  }
  const words: [RegExp, number][] = [[/\btonight\b/, 21], [/\bthis evening\b|\bevening\b/, 18], [/\bmorning\b/, 10], [/\bnoon\b|\bmidday\b/, 12], [/\bafternoon\b/, 15], [/\b(eod|cob|end of (the )?day|close of business)\b/, 18], [/\bmidnight\b/, 23]];
  for (const [re, h] of words) {
    const m = t.match(re);
    if (m && hour === null) { hour = h; matched.push(m[0]); }
  }

  // Explicit dates
  let m: RegExpMatchArray | null;
  if ((m = t.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/))) {
    const d = parseInt(m[1]!, 10), mo = parseInt(m[2]!, 10) - 1;
    const y = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)) : now.getFullYear();
    if (d >= 1 && d <= 31 && mo >= 0 && mo <= 11) {
      base = new Date(y, mo, d);
      if (!m[3] && base < addDays(now, -1)) base = new Date(y + 1, mo, d);
      matched.push(m[0]);
    }
  }
  if (!base && (m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTHS.join("|")})[a-z]*(?:\\s+(\\d{4}))?\\b`)))) {
    const d = parseInt(m[1]!, 10), mo = MONTHS.indexOf(m[2]!);
    const y = m[3] ? parseInt(m[3], 10) : now.getFullYear();
    base = new Date(y, mo, d);
    if (!m[3] && base < addDays(now, -1)) base = new Date(y + 1, mo, d);
    matched.push(m[0]);
  }
  if (!base && (m = t.match(new RegExp(`\\b(${MONTHS.join("|")})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`)))) {
    const mo = MONTHS.indexOf(m[1]!), d = parseInt(m[2]!, 10);
    const y = m[3] ? parseInt(m[3], 10) : now.getFullYear();
    base = new Date(y, mo, d);
    if (!m[3] && base < addDays(now, -1)) base = new Date(y + 1, mo, d);
    matched.push(m[0]);
  }

  // Relative words
  if (!base && (m = t.match(/\bday after tomorrow\b/))) { base = addDays(now, 2); matched.push(m[0]); }
  if (!base && (m = t.match(/\btomorrow\b/))) { base = addDays(now, 1); matched.push(m[0]); }
  if (!base && (m = t.match(/\btoday\b|\btonight\b/))) { base = now; matched.push(m[0]); }
  if (!base && (m = t.match(/\b(?:in|within)\s+(\d+|a|an|one|two|three|four|five|six|seven|ten)\s+(day|days|week|weeks|hour|hours)\b/))) {
    const nums: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10 };
    const n = nums[m[1]!] ?? parseInt(m[1]!, 10);
    if (m[2]!.startsWith("hour")) { const x = new Date(now.getTime() + n * 3600_000); base = x; hour = x.getHours(); minute = x.getMinutes(); }
    else base = addDays(now, m[2]!.startsWith("week") ? n * 7 : n);
    matched.push(m[0]);
  }
  if (!base && (m = t.match(/\bend of (this |the )?week\b|\bthis week\b|\bby the weekend\b/))) {
    const dow = now.getDay();
    base = addDays(now, ((5 - dow) + 7) % 7 || (dow === 5 ? 0 : 7));
    matched.push(m[0]);
  }
  if (!base && (m = t.match(/\bnext week\b/))) { const dow = now.getDay(); base = addDays(now, ((1 - dow) + 7) % 7 || 7); base = addDays(base, 4); matched.push(m[0]); }
  if (!base && (m = t.match(/\bend of (this |the )?month\b/))) { base = new Date(now.getFullYear(), now.getMonth() + 1, 0); matched.push(m[0]); }
  if (!base && (m = t.match(new RegExp(`\\b(next\\s+|this\\s+|coming\\s+|on\\s+|by\\s+)?(${WEEKDAYS.join("|")})\\b`)))) {
    const target = WEEKDAYS.indexOf(m[2]!);
    const dow = now.getDay();
    let diff = (target - dow + 7) % 7;
    if (diff === 0 && (now.getHours() >= 18 || (m[1] || "").trim() === "next")) diff = 7;
    else if ((m[1] || "").trim() === "next" && diff < 7) diff += 7 * 0; // "next Friday" = the coming Friday in Indian business usage
    base = addDays(now, diff);
    matched.push(m[0]);
  }

  if (!base) {
    if (hour !== null) { base = now; if (at(now, hour, minute) < now) base = addDays(now, 1); }
    else return null;
  }
  const date = at(base, hour ?? 18, minute);
  return { date, matched };
}

/* -------------------------------------------------------------- mentions */
type Mention = { kind: "person" | "dept"; id: string; label: string; pos: number; department_id: string | null; assignee_id: string | null; text: string };

function findMentions(sentence: string, original: string, ctx: DelegationCtx): Mention[] {
  const lower = sentence.toLowerCase();
  const out: Mention[] = [];
  const taken: [number, number][] = [];
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);

  // People: full name, then unique first names
  const firstCounts = new Map<string, number>();
  for (const p of ctx.people) {
    const f = p.full_name.split(/\s+/)[0]?.toLowerCase();
    if (f) firstCounts.set(f, (firstCounts.get(f) || 0) + 1);
  }
  const sortedPeople = [...ctx.people].sort((a, b) => b.full_name.length - a.full_name.length);
  for (const p of sortedPeople) {
    const full = p.full_name.trim().toLowerCase();
    if (full.length < 3) continue;
    const candidates = [full];
    const first = full.split(/\s+/)[0]!;
    if (first.length >= 3 && firstCounts.get(first) === 1) candidates.push(first);
    for (const c of candidates) {
      const re = new RegExp(`\\b${esc(c)}\\b`, "g");
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(lower))) {
        if (overlaps(mm.index, mm.index + c.length)) continue;
        taken.push([mm.index, mm.index + c.length]);
        out.push({ kind: "person", id: p.id, label: p.full_name, pos: mm.index, department_id: p.department_id, assignee_id: p.id, text: sentence.slice(mm.index, mm.index + c.length) });
        break;
      }
    }
  }

  // Departments: real names + synonyms (+ uppercase IT in the original text)
  for (const d of ctx.departments) {
    const syns = new Set<string>([d.name.toLowerCase(), d.slug.toLowerCase(), ...(DEPT_SYNONYMS[d.slug] || [])]);
    for (const s of [...syns].sort((a, b) => b.length - a.length)) {
      if (s.length < 2) continue;
      const re = new RegExp(`\\b${esc(s)}\\b`, "g");
      let mm: RegExpExecArray | null;
      let found = false;
      while ((mm = re.exec(lower))) {
        if (overlaps(mm.index, mm.index + s.length)) continue;
        // "design the deck" (verb) vs "assign to Design" (noun): treat as dept when preceded by to/with/from/by/ask/and/, or followed by team/dept/to
        const before = lower.slice(Math.max(0, mm.index - 12), mm.index);
        const after = lower.slice(mm.index + s.length, mm.index + s.length + 12);
        const nounish = /\b(to|with|from|by|ask|get|have|tell|and|,|&|let|assign|coordinate|loop in|involve|for)\s*$/.test(before) || /^\s*(team|dept|department|to|should|will|must|can|needs?)\b/.test(after) || /^\s*[,.;!]/.test(after) || mm.index === 0;
        if (!nounish && ["design", "review", "research", "support", "content", "copy", "edit", "publish"].includes(s)) continue;
        taken.push([mm.index, mm.index + s.length]);
        out.push({ kind: "dept", id: d.id, label: d.name, pos: mm.index, department_id: d.id, assignee_id: d.head_id || null, text: sentence.slice(mm.index, mm.index + s.length) });
        found = true;
        break;
      }
      if (found) break;
    }
  }
  // Uppercase "IT" in the original sentence (case-sensitive) → technology
  const tech = ctx.departments.find((d) => d.slug === "technology");
  if (tech && !out.some((o) => o.kind === "dept" && o.id === tech.id)) {
    const mm = /\bIT\b/.exec(original);
    if (mm) out.push({ kind: "dept", id: tech.id, label: tech.name, pos: mm.index, department_id: tech.id, assignee_id: tech.head_id || null, text: "IT" });
  }
  return out.sort((a, b) => a.pos - b.pos);
}

/* --------------------------------------------------------------- project */
function findProject(text: string, ctx: DelegationCtx): { id: string | null; name: string | null; matched: string | null } {
  const lower = text.toLowerCase();
  let best: { id: string; name: string; len: number; matched: string } | null = null;
  for (const p of ctx.projects) {
    const name = p.name.toLowerCase().trim();
    if (name.length >= 3 && lower.includes(name)) {
      if (!best || name.length > best.len) best = { id: p.id, name: p.name, len: name.length, matched: name };
      continue;
    }
    // fuzzy: ≥2 significant words of the project name appear
    const words = name.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !["project", "the", "and", "for", "with"].includes(w));
    const hits = words.filter((w) => new RegExp(`\\b${esc(w)}`).test(lower));
    if (words.length >= 2 && hits.length >= Math.min(2, words.length) && (!best || hits.join(" ").length > best.len)) best = { id: p.id, name: p.name, len: hits.join(" ").length, matched: hits.join(" ") };
  }
  if (best) return { id: best.id, name: best.name, matched: best.matched };
  const m = text.match(/\b[Pp]roject\s+([A-Z][\w-]*(?:\s+[A-Z][\w-]*){0,3})/) || text.match(/\b(?:the|for|on)\s+([A-Z][\w-]*(?:\s+[A-Z][\w-]*){0,3})\s+[Pp]roject\b/);
  if (m) return { id: null, name: m[1]!, matched: m[0] };
  return { id: null, name: null, matched: null };
}

/* ------------------------------------------------------------------ core */
function stripDeadline(s: string, hit: DeadlineHit | null) {
  let out = s;
  if (hit) for (const m of hit.matched) out = out.replace(new RegExp(`\\b(by|on|before|until|till|for|at)?\\s*${esc(m)}\\b`, "i"), " ");
  return clean(out.replace(/\b(by|before|until|till)\s*$/i, ""));
}

function objectOf(clause: string): string {
  // "create the investor presentation for Project X" → "investor presentation for Project X"
  let s = clean(clause);
  s = s.replace(new RegExp(`^(?:please\\s+)?(?:${LEAD_VERBS})\\s+`, "i"), "");
  s = s.replace(/^(?:the|a|an|our|my)\s+/i, "");
  return s;
}

function titleFor(clause: string, mention: Mention | null, deadline: DeadlineHit | null): string {
  let s = stripDeadline(clause, deadline);
  s = s.replace(/\b(first|then|after that|afterwards|next|finally|and then|also|please)\b/gi, " ");
  s = s.replace(/\bi approve[^.]*$/i, "");
  let m: RegExpMatchArray | null;
  // "Ask/Have/Let X (to) Y" → "Y"
  if (mention && (m = s.match(new RegExp(`^(?:please\\s+)?(?:ask|get|have|tell|let|make|request)\\s+${esc(mention.text)}\\s+(?:to\\s+)?(.+)$`, "i")))) s = m[1]!;
  else if ((m = s.match(/^(?:ask|get|have|tell|request)\s+(.+?)\s+to\s+(.+)$/i))) s = m[2]!;
  // "Assign Y to X" → "Y"
  else if ((m = s.match(/^(?:assign|give|hand|send|pass)\s+(.+?)\s+to\s+(.+)$/i))) s = m[1]!;
  // "X should/will/must/can Y" → "Y"
  else if (mention && (m = s.match(new RegExp(`^${esc(mention.text)}\\s+(?:should|will|must|can|needs? to|has to|to)\\s+(.+)$`, "i")))) s = m[1]!;
  // "X: Y" → "Y"
  else if (mention && (m = s.match(new RegExp(`^${esc(mention.text)}\\s*[:\\-–]\\s*(.+)$`, "i")))) s = m[1]!;
  // "X writes Y" → "Write Y"
  else if (mention && (m = s.match(new RegExp(`^${esc(mention.text)}\\s+([a-z]+)\\s+(.+)$`, "i")))) {
    const verb = m[1]!.toLowerCase();
    const stem = verb.endsWith("ies") ? verb.slice(0, -3) + "y" : verb.endsWith("es") && new RegExp(`^(?:${LEAD_VERBS})$`).test(verb.slice(0, -2)) ? verb.slice(0, -2) : verb.endsWith("s") ? verb.slice(0, -1) : verb;
    s = `${new RegExp(`^(?:${LEAD_VERBS})$`).test(stem) ? stem : verb} ${m[2]}`;
  }
  // "coordinate with X on Y" → "Y"
  else if ((m = s.match(/^(?:coordinate|work|check|align|sync)\s+with\s+.+?\s+(?:on|for|about)\s+(.+)$/i))) s = m[1]!;
  s = s.replace(/^(?:the|a|an)\s+/i, "");
  s = clean(s);
  if (!s) s = mention ? `${mention.label} input` : "Task";
  return cap(s).slice(0, 140);
}

function splitClauses(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?;])\s+|\n+/)
    .flatMap((s) => s.split(/\s*(?:,\s*then|\bthen\b|\bafter that\b|\bafterwards\b|;)\s*/i))
    .map(clean)
    .filter((s) => s.length > 1);
}

export function parseDelegation(text: string, ctx: DelegationCtx): DelegationProposal {
  const now = ctx.now || new Date();
  const original = text.trim();
  const project = findProject(original, ctx);
  const overall = parseDeadline(original, now);
  const approver_needed = APPROVAL_RE.test(original);

  const clauses = splitClauses(original);
  type Draft = DelegationStep & { first?: boolean; before?: string | null; mentionId?: string | null };
  const drafts: Draft[] = [];

  for (const raw of clauses) {
    const clause = project.matched && !project.id ? raw : raw; // keep project text; it is informative in titles
    const lower = clause.toLowerCase();
    const isApprovalClause = APPROVAL_RE.test(clause) && !/\b(ask|get|have|tell|assign)\b/i.test(clause);
    const deadline = parseDeadline(clause, now);
    const mentions = findMentions(clause, clause, ctx);
    const remaining = stripDeadline(lower, deadline).replace(/\b(final version|the final|final)\b/g, "").trim();
    const meta = isApprovalClause || META_RE.test(lower) || (deadline !== null && mentions.length === 0 && remaining.split(" ").length <= 4);
    if (meta) continue;

    const isFirst = /\bfirst\b/i.test(clause);
    const beforeDept = clause.match(/\bbefore\s+(?:it goes to\s+|sending (?:it )?to\s+|handing (?:it )?to\s+)?([A-Za-z][\w /&-]{1,30}?)(?:\s+(?:starts?|begins?|works?|takes over))?\s*$/i);
    const beforeMention = beforeDept ? findMentions(beforeDept[1]!, beforeDept[1]!, ctx)[0] || null : null;
    const clauseNoBefore = beforeDept ? clean(clause.slice(0, beforeDept.index)) : clause;
    const primaryMentions = mentions.filter((m) => !beforeMention || m.id !== beforeMention.id);

    // "coordinate/work with A and B" → one step per mention, after the head step
    const coord = clauseNoBefore.match(/^(.*?)\b(?:and\s+)?(?:coordinate|work|align|sync|check|loop in|involve|together)\s+with\s+(.+)$/i);
    if (coord && primaryMentions.length >= 1) {
      const head = clean(coord[1]!);
      const tailMentions = findMentions(coord[2]!, coord[2]!, ctx);
      const obj = head ? objectOf(stripDeadline(head, deadline)) : titleFor(clauseNoBefore, null, deadline);
      for (const m of tailMentions) {
        drafts.push({ title: cap(`${m.kind === "dept" ? m.label : m.label.split(" ")[0]}: ${obj}`).slice(0, 140), department_id: m.department_id, assignee_id: m.assignee_id, due_date: deadline?.date || null, depends_on_previous: true, final: false, source: clause, mentionId: m.id });
      }
      if (head && new RegExp(`^(?:please\\s+)?(?:${LEAD_VERBS})\\b`, "i").test(head)) {
        drafts.push({ title: titleFor(head, null, deadline), department_id: null, assignee_id: null, due_date: deadline?.date || null, depends_on_previous: true, final: false, source: clause });
      }
      continue;
    }

    if (primaryMentions.length === 0) {
      // A plain instruction with no owner: infer department from the verb, keep as a step
      const verbDept = /\b(design|mock-?up|creative|visual)/i.test(clause) ? ctx.departments.find((d) => d.slug === "design")
        : /\b(write|draft|proofread|copy|article|blog|content)\b/i.test(clause) ? ctx.departments.find((d) => d.slug === "content")
        : /\b(develop|code|deploy|build the (site|app)|integrat)/i.test(clause) ? ctx.departments.find((d) => d.slug === "technology")
        : null;
      drafts.push({ title: titleFor(clauseNoBefore, null, deadline), department_id: verbDept?.id || null, assignee_id: verbDept?.head_id || null, due_date: deadline?.date || null, depends_on_previous: true, final: false, source: clause, first: isFirst, before: beforeMention?.id || null });
      continue;
    }
    if (primaryMentions.length === 1 || /\b(ask|assign|tell|get|have)\b/i.test(clause)) {
      const m = primaryMentions[0]!;
      drafts.push({ title: titleFor(clauseNoBefore, m, deadline), department_id: m.department_id, assignee_id: m.assignee_id, due_date: deadline?.date || null, depends_on_previous: true, final: false, source: clause, first: isFirst, before: beforeMention?.id || null, mentionId: m.id });
      continue;
    }
    // Several owners in one clause ("Content and Design to prepare…") → one step each, same title
    const t = titleFor(clauseNoBefore, primaryMentions[0]!, deadline);
    for (const m of primaryMentions) drafts.push({ title: cap(`${m.label}: ${t}`).slice(0, 140), department_id: m.department_id, assignee_id: m.assignee_id, due_date: deadline?.date || null, depends_on_previous: true, final: false, source: clause, mentionId: m.id });
  }

  // Ordering: "first" → front; "before X" → just before X's step
  let ordered = [...drafts];
  const firsts = ordered.filter((d) => d.first);
  ordered = [...firsts, ...ordered.filter((d) => !d.first)];
  for (const d of [...ordered]) {
    if (!d.before) continue;
    const idx = ordered.indexOf(d);
    const target = ordered.findIndex((x) => x !== d && x.mentionId === d.before);
    if (target >= 0 && target < idx) { ordered.splice(idx, 1); ordered.splice(target, 0, d); }
  }

  // Fallback: nothing parsed → single step from the whole text
  if (ordered.length === 0 && original) {
    ordered.push({ title: titleFor(clauses[0] || original, null, overall), department_id: null, assignee_id: null, due_date: overall?.date || null, depends_on_previous: false, final: true, source: original });
  }

  // Dates: the overall deadline is the latest date mentioned; the last step gets it,
  // earlier undated steps are spread evenly between now and the deadline.
  const n = ordered.length;
  const latest = [overall?.date, ...ordered.map((s) => s.due_date)].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] || null;
  if (latest && n) {
    const span = latest.getTime() - now.getTime();
    ordered.forEach((s, i) => {
      if (s.due_date) return;
      if (i === n - 1) s.due_date = latest;
      else if (span > 0) s.due_date = at(new Date(now.getTime() + (span * (i + 1)) / n), 18);
    });
  }
  ordered.forEach((s, i) => { s.depends_on_previous = i > 0; s.final = i === n - 1; });

  return {
    project_id: project.id,
    project_name: project.name,
    summary: original.length > 240 ? original.slice(0, 237) + "…" : original,
    deadline: latest,
    approver_needed,
    steps: ordered.map((d) => ({ title: d.title, department_id: d.department_id, assignee_id: d.assignee_id, due_date: d.due_date, depends_on_previous: d.depends_on_previous, final: d.final, source: d.source })),
  };
}
