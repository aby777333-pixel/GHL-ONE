/**
 * Replays real Web Speech API event streams against `src/lib/speech.ts`.
 *
 * Why this exists: both surfaces that listen used to read every entry of `event.results`, which is
 * correct on desktop Chrome and catastrophically wrong on Chrome for Android, where each new
 * hypothesis of the SAME sentence arrives as a NEW entry. Reading the code cannot tell you that —
 * only replaying both shapes can, so the reader lives apart from React and is replayed here.
 *
 *   Buddy dictation — concatenated the entries, so one sentence became a paragraph of itself.
 *   Live transcript — committed one LINE per hypothesis once more than one came back final.
 *
 *   node --conditions=react-server scripts/speech-cases.mjs
 *
 * Exits non-zero on any mismatch. No API key, no browser, no network.
 */
import { dictationText, endSession, newDictation, readResult, utteranceText } from "../src/lib/speech.ts";

/** One entry of `event.results`: a list of alternatives, plus `isFinal`. */
function result(transcript, isFinal) {
  const r = [{ transcript }];
  r.isFinal = isFinal;
  return r;
}

/** An engine that REPLACES the interim result in place — the spec, and desktop Chrome. */
function replacingEngine(hypotheses) {
  return hypotheses.map((h, i) => ({ resultIndex: 0, results: [result(h, i === hypotheses.length - 1)] }));
}

/** An engine that APPENDS a new entry per hypothesis — Chrome on Android. */
function appendingEngine(hypotheses) {
  const events = [];
  for (let n = 1; n <= hypotheses.length; n++) {
    events.push({ resultIndex: n - 1, results: hypotheses.slice(0, n).map((h, i) => result(h, n === hypotheses.length && i === n - 1)) });
  }
  return events;
}

/** The same, but every appended entry is reported FINAL — the variant that duplicated lines. */
function appendingFinalEngine(hypotheses) {
  const events = [];
  for (let n = 1; n <= hypotheses.length; n++) {
    events.push({ resultIndex: n - 1, results: hypotheses.slice(0, n).map((h) => result(h, true)) });
  }
  return events;
}

// The Tamil and Malayalam streams are the ones from the bug report, hypothesis by hypothesis.
const TAMIL = ["எனக்கு", "னக்கு ஒரு", "னக்கு ஒரு ஆன்லைன்", "என்னக்கு ஒரு ஆன்லைன்", "எனக்கு ஒரு ஆன்லைன் பிசினஸ்", "எனக்கு ஒரு ஆன்லைன் பிசினஸ் வேணும்"];
const MALAYALAM = ["എനിക്ക്", "എനിക്ക് ഒരു", "എനിക്ക് ഒരു ഓൺലൈൻ", "എനിക്ക് ഒരു ഓൺലൈൻ ബിസിനസ്", "എനിക്ക് ഒരു ഓൺലൈൻ ബിസിനസ് തുടങ്ങണം"];
const ENGLISH = ["how", "how do i", "how do i book", "how do i book leave"];

const TAMIL_SAID = "எனக்கு ஒரு ஆன்லைன் பிசினஸ் வேணும்";
const MALAYALAM_SAID = "എനിക്ക് ഒരു ഓൺലൈൻ ബിസിനസ് തുടങ്ങണം";
const ENGLISH_SAID = "how do i book leave";

/* ---------------------------------------------------------------- Buddy dictation ---- */

/** Drive one dictation: a list of sentences, each a list of hypotheses, through one engine. */
function dictate(engine, existing, sentences) {
  let state = newDictation(existing);
  for (const hypotheses of sentences) {
    for (const e of engine(hypotheses)) state = readResult(state, e);
    state = endSession(state); // `continuous` is off: the engine ends after every sentence
  }
  return dictationText(state);
}

const DICTATION_CASES = [
  { name: "android · one sentence (the reported bug)", engine: appendingEngine, existing: "", sentences: [TAMIL], want: TAMIL_SAID },
  { name: "android, every entry final · one sentence", engine: appendingFinalEngine, existing: "", sentences: [TAMIL], want: TAMIL_SAID },
  { name: "desktop · one sentence", engine: replacingEngine, existing: "", sentences: [TAMIL], want: TAMIL_SAID },
  { name: "android · malayalam", engine: appendingEngine, existing: "", sentences: [MALAYALAM], want: MALAYALAM_SAID },
  { name: "desktop · malayalam", engine: replacingEngine, existing: "", sentences: [MALAYALAM], want: MALAYALAM_SAID },
  { name: "android · two sentences join, not duplicate", engine: appendingEngine, existing: "", sentences: [ENGLISH, ["thanks"]], want: `${ENGLISH_SAID} thanks` },
  { name: "desktop · two sentences join, not duplicate", engine: replacingEngine, existing: "", sentences: [ENGLISH, ["thanks"]], want: `${ENGLISH_SAID} thanks` },
  { name: "dictation appends to what was already typed", engine: appendingEngine, existing: "Hi —", sentences: [ENGLISH], want: `Hi — ${ENGLISH_SAID}` },
  { name: "a silent session adds nothing", engine: appendingEngine, existing: "", sentences: [ENGLISH, [""], ["thanks"]], want: `${ENGLISH_SAID} thanks` },
  { name: "nothing said at all leaves the box as it was", engine: appendingEngine, existing: "draft", sentences: [[""]], want: "draft " },
];

/* ------------------------------------------------------------- live meeting transcript ---- */

/*
  The recorder commits one LINE per session: the same reader, a different output shape. Its own
  code adds a timestamp and a speaker to each line; neither affects what is read.
*/
function transcribe(engine, sentences) {
  const lines = [];
  for (const hypotheses of sentences) {
    let heard = "";
    for (const e of engine(hypotheses)) heard = utteranceText(e);
    if (heard) lines.push(heard);
  }
  return lines;
}

const TRANSCRIPT_CASES = [
  { name: "android · one sentence is one line", engine: appendingEngine, sentences: [TAMIL], want: [TAMIL_SAID] },
  { name: "android, every entry final · still one line", engine: appendingFinalEngine, sentences: [TAMIL], want: [TAMIL_SAID] },
  { name: "desktop · one sentence is one line", engine: replacingEngine, sentences: [TAMIL], want: [TAMIL_SAID] },
  { name: "three sentences · three lines, in order", engine: appendingFinalEngine, sentences: [ENGLISH, ["thanks"], MALAYALAM], want: [ENGLISH_SAID, "thanks", MALAYALAM_SAID] },
  { name: "a silent session commits no line", engine: appendingEngine, sentences: [ENGLISH, [""], ["thanks"]], want: [ENGLISH_SAID, "thanks"] },
];

/* ------------------------------------------------------------------------------ run ---- */

let failed = 0;

function report(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  const detail = ok ? (Array.isArray(got) ? `${got.length} line(s)` : got) : `\n        want: ${JSON.stringify(want)}\n        got:  ${JSON.stringify(got)}`;
  console.log(`  ${ok ? "ok " : "FAIL"}  ${name.padEnd(46)} ${detail}`);
}

console.log("Buddy dictation");
for (const c of DICTATION_CASES) report(c.name, dictate(c.engine, c.existing, c.sentences), c.want);

console.log("\nLive meeting transcript");
for (const c of TRANSCRIPT_CASES) report(c.name, transcribe(c.engine, c.sentences), c.want);

const total = DICTATION_CASES.length + TRANSCRIPT_CASES.length;
console.log(`\n${total - failed}/${total} speech streams read correctly`);
if (failed) process.exit(1);
