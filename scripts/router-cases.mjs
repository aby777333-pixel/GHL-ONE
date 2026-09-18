/*
  Buddy routing cases — `npm run test:router`.

  Drives the real `routeBuddy()` over representative questions with the model fallback switched off,
  so the run is deterministic, free, and needs no API key. A keyword table is exactly the kind of
  code that looks right and is not: the first run of this file found two genuine misroutes (a word
  boundary that could never match "properties", and a 3-3 tie decided by insertion order).

  **Add a case here whenever you add or change a rule in src/lib/ai/orchestrator.ts.**

  Node strips the types on import; `--conditions=react-server` is what lets `server-only` load
  outside Next.js. Both are in the npm script.
*/
process.env.AI_ROUTER = "off";

const { routeBuddy } = await import("../src/lib/ai/orchestrator.ts");

/** @type {{q: string, want: string, scope?: object, attachments?: object[], explicit?: string}[]} */
const CASES = [
  // The quick actions, typed as sentences instead of pressed as buttons.
  { q: "What should I work on today?", want: "what_next" },
  { q: "What am I waiting for?", want: "what_next" },
  { q: "Who can help me with the investor deck?", want: "who_can_help" },
  { q: "Explain this to me like I'm a beginner", want: "explain_simple" },
  { q: "Break this down into steps for me", want: "breakdown" },
  { q: "Prepare me for the client call tomorrow", want: "prepare" },

  // Intents that had no button at all.
  { q: "Why is this task stuck?", want: "why_blocked", scope: { taskId: "t1" } },
  { q: "Cannot read properties of undefined reading map in the tasks page", want: "debug" },
  { q: "The deployment failed on Netlify, build error", want: "debug" },
  { q: "The whole site is down, nothing is working for anyone", want: "incident" },
  { q: "How many leaves do I have left?", want: "chat" },          // HR persona, chat mode
  { q: "What is our policy on working from home?", want: "chat" }, // knowledge, chat mode
  { q: "Translate this message into Tamil", want: "translate" },
  { q: "Write a reply to the client asking for more time", want: "draft" },
  { q: "Who reports to Bennet?", want: "chat" },                   // org tools, chat mode
  { q: "I'm stressed about this project, help me think clearly", want: "chat" },
  { q: "Teach me React hooks", want: "explain_simple" },

  // Negatives — these must NOT be dragged somewhere clever.
  { q: "hi", want: "chat" },
  { q: "thanks!", want: "chat" },
  { q: "What is the dress code?", want: "chat" },                  // must not read as "coding"
  { q: "Summarise this", want: "chat" },

  // Evidence that is not words.
  { q: "look at this", want: "debug", attachments: [{ kind: "text", name: "log.txt", text: "TypeError: x is not a function\n    at Object.run (/app/x.js:12:9)" }] },
  { q: "what is this?", want: "looking_at", scope: { path: "/workforce" } },

  // A pressed quick action is an instruction, not a hint: the mode must survive untouched.
  { q: "The site is down", want: "explain_simple", explicit: "explain_simple" },
  { q: "What should I do next?", want: "practice", explicit: "practice" },
];

let pass = 0;
const fails = [];
const lines = [];

for (const c of CASES) {
  const r = await routeBuddy({
    message: c.q,
    explicitMode: c.explicit ?? null,
    scope: c.scope || {},
    attachments: c.attachments || [],
  });
  const ok = r.mode === c.want;
  if (ok) pass++;
  else fails.push(`  x "${c.q}"\n      want mode=${c.want}  got mode=${r.mode}  intent=${r.intent}  conf=${r.confidence}  [${r.signals.join(" ")}]`);
  lines.push(`  ${ok ? "ok" : "XX"}  ${c.q.slice(0, 56).padEnd(58)} ${r.intent} -> ${r.mode}${r.assistant ? ` (${r.assistant})` : ""} · ${r.plan.effort} · ${r.source} ${r.confidence}`);
}

console.log(lines.join("\n"));
console.log(`\n${pass}/${CASES.length} routed as intended`);
if (fails.length) {
  console.log("\n--- misroutes ---\n" + fails.join("\n"));
  process.exit(1);
}
