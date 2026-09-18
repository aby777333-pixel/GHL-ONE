/**
 * npm run test:contract
 *
 * Checks every database call site in `src/` against `src/lib/database.types.ts`:
 *   · `.rpc("name", …)` names a function that exists
 *   · every key passed to it is a real parameter of that function
 *   · `.from("name")` names a real table or view
 *
 * Why this exists: PostgREST resolves an RPC by its parameter NAMES. Calling `who_owns` with
 * `{ q }` when the parameter is `p_q` is not a type error the database ever sees — it is a 404
 * `PGRST202` at runtime, and the tool that made the call just answers "not available" forever.
 * TypeScript would normally catch it, but a single `as never` cast silences it completely, and
 * that is exactly how the `who_owns` bug survived. This script reads the call sites as text, so a
 * cast cannot hide anything from it.
 *
 * Top-level keys only. Nested object values (a `p_details` payload, a `p_context` blob) are not
 * parameters and are skipped by brace-matching rather than by regex, which is what stops the
 * false positives a naive `[^}]*` produces.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TYPES = path.join(ROOT, "src", "lib", "database.types.ts");

/* ------------------------------------------------------------------ helpers */

/** Index of the bracket matching the one at `i`, skipping strings, template literals and comments. */
function matchBracket(s, i) {
  const open = s[i];
  const close = open === "{" ? "}" : open === "(" ? ")" : "]";
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      j++;
      while (j < s.length && s[j] !== quote) {
        if (s[j] === "\\") j++;
        j++;
      }
      continue;
    }
    if (c === "/" && s[j + 1] === "/") {
      while (j < s.length && s[j] !== "\n") j++;
      continue;
    }
    if (c === "/" && s[j + 1] === "*") {
      j = s.indexOf("*/", j + 2);
      if (j < 0) return -1;
      j++;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/**
 * Top-level key names inside an object body (the text between its braces) — for both a JS object
 * literal and a TypeScript object type.
 *
 * A name only counts when it is in KEY POSITION: at the start, or just after a top-level `,` or
 * `;`. Scanning for "word followed by a colon" instead would read the middle of a ternary
 * (`p_from: a ? b : c` → a phantom key `b`) and read `p_user?: string` as no key at all, because
 * the colon is behind the optional marker.
 */
function topLevelKeys(body) {
  const keys = [];
  let spread = false;
  let expectKey = true;
  // A multi-line TypeScript object type separates its properties by NEWLINE, with no punctuation
  // at all (`Args: {\n  p_message: string\n  p_ok: boolean\n}`), so a newline has to open a key
  // position too. But a wrapped JS value would then look like one, so a key opened by a newline
  // must be followed by a colon — ES shorthand is only accepted after a real `,` or `;`.
  let allowShorthand = true;

  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\n") {
      if (!expectKey) {
        expectKey = true;
        allowShorthand = false;
      }
      continue;
    }
    if (/\s/.test(c)) continue;
    if (c === "/" && body[i + 1] === "/") {
      while (i < body.length && body[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && body[i + 1] === "*") {
      const e = body.indexOf("*/", i + 2);
      if (e < 0) break;
      i = e + 1;
      continue;
    }
    if (c === "," || c === ";") {
      expectKey = true;
      allowShorthand = true;
      continue;
    }

    if (expectKey) {
      expectKey = false;
      if (body.slice(i, i + 3) === "...") {
        spread = true;
        i += 2;
        continue;
      }
      let name = null;
      if (c === '"' || c === "'" || c === "`") {
        let j = i + 1;
        let s = "";
        while (j < body.length && body[j] !== c) {
          if (body[j] === "\\") j++;
          s += body[j];
          j++;
        }
        name = s;
        i = j;
      } else if (/[A-Za-z_$]/.test(c)) {
        let j = i;
        while (j < body.length && /[\w$]/.test(body[j])) j++;
        name = body.slice(i, j);
        i = j - 1;
      }
      if (name === null) continue;
      let k = i + 1;
      while (k < body.length && /\s/.test(body[k])) k++;
      if (body[k] === "?") {
        k++;
        while (k < body.length && /\s/.test(body[k])) k++;
      }
      // `name:` (a pair), or `name` alone before `,` / `}` (ES shorthand).
      if (body[k] === ":") keys.push(name);
      else if (allowShorthand && (body[k] === "," || body[k] === ";" || k >= body.length)) keys.push(name);
      continue;
    }

    // Value position: step over anything nested so its insides cannot be mistaken for keys.
    if (c === "{" || c === "[" || c === "(") {
      const end = matchBracket(body, i);
      if (end < 0) break;
      i = end;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < body.length && body[i] !== c) {
        if (body[i] === "\\") i++;
        i++;
      }
      continue;
    }
  }
  return { keys, spread };
}

/* -------------------------------------------------- the generated type file */

function readCatalog() {
  const src = fs.readFileSync(TYPES, "utf8");
  const out = { functions: new Map(), relations: new Set() };

  for (const section of ["Tables", "Views"]) {
    const at = src.indexOf(`\n    ${section}: {`);
    if (at < 0) continue;
    const open = src.indexOf("{", at);
    const block = src.slice(open + 1, matchBracket(src, open));
    for (const m of block.matchAll(/\n      (\w+): \{/g)) out.relations.add(m[1]);
  }

  const at = src.indexOf("\n    Functions: {");
  if (at < 0) throw new Error("no Functions block in database.types.ts");
  const open = src.indexOf("{", at);
  const block = src.slice(open + 1, matchBracket(src, open));

  const entry = /\n      (\w+): \{/g;
  let m;
  while ((m = entry.exec(block))) {
    const name = m[1];
    const bodyStart = block.indexOf("{", m.index + m[0].length - 1);
    const bodyEnd = matchBracket(block, bodyStart);
    const body = block.slice(bodyStart + 1, bodyEnd);
    const argsAt = body.indexOf("Args:");
    let params = new Set();
    if (argsAt >= 0) {
      const brace = body.indexOf("{", argsAt);
      const lineEnd = body.indexOf("\n", argsAt);
      // `Args: Record<string, never>` — a function that takes nothing.
      if (brace >= 0 && (lineEnd < 0 || brace < lineEnd)) {
        const end = matchBracket(body, brace);
        for (const k of topLevelKeys(body.slice(brace + 1, end)).keys) params.add(k.replace(/\?$/, ""));
      }
    }
    // Overloads reuse the name; union the parameters rather than letting the last one win.
    if (out.functions.has(name)) for (const p of out.functions.get(name)) params.add(p);
    out.functions.set(name, params);
    entry.lastIndex = bodyEnd;
  }
  return out;
}

/* ------------------------------------------------------------- call sites */

function sourceFiles(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name) && p !== TYPES) acc.push(p);
  }
  return acc;
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length;
}

function check() {
  const cat = readCatalog();
  const problems = [];
  let rpcCalls = 0;
  let fromCalls = 0;

  for (const file of sourceFiles(path.join(ROOT, "src"))) {
    const src = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");

    for (const m of src.matchAll(/\.rpc\(\s*["'`]([A-Za-z_]\w*)["'`]/g)) {
      rpcCalls++;
      const name = m[1];
      const where = `${rel}:${lineOf(src, m.index)}`;
      if (!cat.functions.has(name)) {
        problems.push({ kind: "unknown function", where, detail: name });
        continue;
      }
      let i = m.index + m[0].length;
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src[i] !== ",") continue; // no argument object
      i++;
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src[i] !== "{") continue; // a variable, not a literal — nothing to read
      const end = matchBracket(src, i);
      if (end < 0) continue;
      const { keys, spread } = topLevelKeys(src.slice(i + 1, end));
      if (spread) continue; // keys come from elsewhere; not checkable here
      const params = cat.functions.get(name);
      for (const k of keys) {
        if (!params.has(k)) {
          problems.push({ kind: "unknown parameter", where, detail: `${name}({ ${k} }) — expects: ${[...params].join(", ") || "(none)"}` });
        }
      }
    }

    // `supabase.storage.from("bucket")` is a storage bucket, not a relation.
    for (const m of src.matchAll(/(\.storage)?\.from\(\s*["'`]([A-Za-z_]\w*)["'`]/g)) {
      if (m[1]) continue;
      fromCalls++;
      if (!cat.relations.has(m[2])) {
        problems.push({ kind: "unknown table", where: `${rel}:${lineOf(src, m.index)}`, detail: m[2] });
      }
    }
  }

  if (problems.length) {
    for (const p of problems) console.error(`  ${p.kind}: ${p.detail}\n    at ${p.where}`);
    console.error(`\n${problems.length} contract problem(s) across ${rpcCalls} rpc and ${fromCalls} table call sites`);
    process.exit(1);
  }
  console.log(`${rpcCalls} rpc call sites and ${fromCalls} table call sites all match database.types.ts`);
}

check();
