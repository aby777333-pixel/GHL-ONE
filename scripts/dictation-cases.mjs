/**
 * Replays real Web Speech API event streams against `src/components/ai/dictation.ts`.
 *
 * Why this exists: the composer used to concatenate every entry of `event.results`, which is
 * correct on desktop Chrome and catastrophically wrong on Chrome for Android, where each new
 * hypothesis of the SAME sentence arrives as a NEW entry. Reading the code cannot tell you that —
 * only replaying both shapes can. The reported bug is case "android · one sentence": it must come
 * back as the sentence, not as a paragraph of the sentence eating itself.
 *
 *   node --conditions=react-server scripts/dictation-cases.mjs
 *
 * Exits non-zero on any mismatch. No API key, no browser, no network.
 */
import { dictationText, endSession, newDictation, readResult } from "../src/components/ai/dictation.ts";

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

/** Drive one dictation: a list of sentences, each a list of hypotheses, through one engine. */
function dictate(engine, existing, sentences) {
  let state = newDictation(existing);
  for (const hypotheses of sentences) {
    for (const e of engine(hypotheses)) state = readResult(state, e);
    state = endSession(state); // `continuous` is off: the engine ends after every sentence
  }
  return dictationText(state);
}

// The Tamil and Malayalam streams are the ones from the bug report, hypothesis by hypothesis.
const TAMIL = ["எனக்கு", "னக்கு ஒரு", "னக்கு ஒரு ஆன்லைன்", "என்னக்கு ஒரு ஆன்லைன்", "எனக்கு ஒரு ஆன்லைன் பிசினஸ்", "எனக்கு ஒரு ஆன்லைன் பிசினஸ் வேணும்"];
const MALAYALAM = ["എനിക്ക്", "എനിക്ക് ഒരു", "എനിക്ക് ഒരു ഓൺലൈൻ", "എനിക്ക് ഒരു ഓൺലൈൻ ബിസിനസ്", "എനിക്ക് ഒരു ഓൺലൈൻ ബിസിനസ് തുടങ്ങണം"];
const ENGLISH = ["how", "how do i", "how do i book", "how do i book leave"];

const CASES = [
  { name: "android · one sentence (the reported bug)", engine: appendingEngine, existing: "", sentences: [TAMIL], want: "எனக்கு ஒரு ஆன்லைன் பிசினஸ் வேணும்" },
  { name: "desktop · one sentence", engine: replacingEngine, existing: "", sentences: [TAMIL], want: "எனக்கு ஒரு ஆன்லைன் பிசினஸ் வேணும்" },
  { name: "android · malayalam", engine: appendingEngine, existing: "", sentences: [MALAYALAM], want: "എനിക്ക് ഒരു ഓൺലൈൻ ബിസിനസ് തുടങ്ങണം" },
  { name: "desktop · malayalam", engine: replacingEngine, existing: "", sentences: [MALAYALAM], want: "എനിക്ക് ഒരു ഓൺലൈൻ ബിസിനസ് തുടങ്ങണം" },
  { name: "android · two sentences join, not duplicate", engine: appendingEngine, existing: "", sentences: [ENGLISH, ["thanks"]], want: "how do i book leave thanks" },
  { name: "desktop · two sentences join, not duplicate", engine: replacingEngine, existing: "", sentences: [ENGLISH, ["thanks"]], want: "how do i book leave thanks" },
  { name: "dictation appends to what was already typed", engine: appendingEngine, existing: "Hi —", sentences: [ENGLISH], want: "Hi — how do i book leave" },
  { name: "a silent session adds nothing", engine: appendingEngine, existing: "", sentences: [ENGLISH, [""], ["thanks"]], want: "how do i book leave thanks" },
  { name: "nothing said at all leaves the box as it was", engine: appendingEngine, existing: "draft", sentences: [[""]], want: "draft " },
];

let failed = 0;
for (const c of CASES) {
  const got = dictate(c.engine, c.existing, c.sentences);
  const ok = got === c.want;
  if (!ok) failed++;
  console.log(`  ${ok ? "ok " : "FAIL"}  ${c.name.padEnd(46)} ${ok ? got : `\n        want: ${JSON.stringify(c.want)}\n        got:  ${JSON.stringify(got)}`}`);
}

console.log(`\n${CASES.length - failed}/${CASES.length} dictation streams read correctly`);
if (failed) process.exit(1);
