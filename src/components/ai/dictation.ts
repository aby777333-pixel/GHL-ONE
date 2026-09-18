/**
 * Reading the Web Speech API without duplicating what was said.
 *
 * The transcript logic lives here, apart from React and from any timer, because it cannot be
 * verified by reading it: two browsers deliver the same sentence in two different shapes and only
 * replaying both proves the reader handles them. `scripts/dictation-cases.mjs` does exactly that.
 *
 * THE DEFECT THIS EXISTS TO PREVENT. The composer used to set `continuous = true` and build the
 * text by concatenating every entry of `event.results` — which is what the spec implies, since a
 * result is one utterance and an interim result replaces its entry in place. Chrome on Android
 * does not do that: each new hypothesis of the SAME sentence arrives as a NEW entry and none is
 * marked final until the end. Concatenating therefore glued every hypothesis of one sentence
 * together, and dictating "எனக்கு ஒரு ஆன்லைன் பிசினஸ் வேணும்" produced
 * "எனக்கு" + "னக்கு ஒரு" + "னக்கு ஒரு ஆன்லைன்" + … — a paragraph of the sentence eating itself.
 * It then went to the model as the question, which is what returned 504.
 *
 * THE RULE. One session is one sentence (`continuous` is off, which is also the only thing that
 * works on Android), and only the LAST entry is read. That is correct under both behaviours: an
 * engine that replaces in place has exactly one entry, and an engine that appends puts its most
 * complete hypothesis last. Nothing accumulates inside a session, so no engine quirk can duplicate
 * anything; sentences accumulate across sessions in `done`, which we control.
 */

export type SpeechResultEvent = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };

export type Recognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export function recognizerCtor(): (new () => Recognizer) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function speechSupported() {
  return !!recognizerCtor();
}

export function synthesisSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

/**
 * `base` is whatever was already typed when the mic was switched on, `done` is the sentences this
 * dictation has completed, `live` is the sentence being spoken right now.
 */
export type Dictation = { base: string; done: string; live: string };

export function newDictation(existing: string): Dictation {
  return { base: existing ? `${existing.replace(/\s+$/, "")} ` : "", done: "", live: "" };
}

/** The sentence currently being spoken — the last entry, never the concatenation. */
export function readResult(state: Dictation, e: SpeechResultEvent): Dictation {
  const last = e.results[e.results.length - 1];
  return { ...state, live: (last?.[0]?.transcript || "").trim() };
}

/** The engine ended the session: fold the sentence it heard into the accumulated text. */
export function endSession(state: Dictation): Dictation {
  const heard = state.live.trim();
  if (!heard) return { ...state, live: "" };
  return { ...state, done: `${state.done}${state.done ? " " : ""}${heard}`, live: "" };
}

/** What belongs in the composer right now. Collapses runs of spaces, never newlines. */
export function dictationText(state: Dictation): string {
  const spoken = [state.done, state.live].filter(Boolean).join(" ");
  return `${state.base}${spoken}`.replace(/[^\S\n]{2,}/g, " ");
}
