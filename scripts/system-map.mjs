/*
  Generates `docs/system-map.md` — a factual map of this codebase, produced from the codebase.

  Why this exists (§7): Buddy has no access to the repository. Asked "where is attendance handled?"
  or "which RPC decides whether somebody can see a task?", it could previously only guess from the
  error text somebody pasted. Guessing about your own product is worse than saying you do not know.

  This is not repository access and does not pretend to be: it is a structural index — routes, API
  endpoints, tables, database functions, component areas, environment variables — with no source
  code in it. It ships as `src/lib/ai/systemMap.ts` and Buddy reads it through the `system_map`
  tool, so its answers about GHL ONE itself are grounded in what is actually there.

  Run `npm run system-map` after adding routes or migrations, and commit both outputs.
*/
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));

function walk(dir, out = []) {
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

/** `src/app/(app)/people/[id]/page.tsx` → `/people/[id]` (route groups in brackets are not path segments). */
function routeOf(file) {
  const seg = file
    .replace(/^src\/app/, "")
    .replace(/\/page\.tsx$/, "")
    .split("/")
    .filter((s) => s && !(s.startsWith("(") && s.endsWith(")")));
  return "/" + seg.join("/");
}

const appFiles = walk("src/app");
const pages = appFiles.filter((f) => f.endsWith("/page.tsx")).map(routeOf).sort();
const apis = appFiles
  .filter((f) => f.endsWith("/route.ts"))
  .map((f) => f.replace(/^src\/app/, "").replace(/\/route\.ts$/, ""))
  .sort();

const migrations = walk("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
const sql = migrations.map((f) => read(f)).join("\n");

const tables = [...new Set([...sql.matchAll(/create table (?:if not exists )?([a-z_]+)/gi)].map((m) => m[1]))].sort();
const functions = [...new Set([...sql.matchAll(/create or replace function ([a-z_]+)\s*\(/gi)].map((m) => m[1]))].sort();
const crons = [...new Set([...sql.matchAll(/cron\.schedule\(\s*'([a-z_]+)'\s*,\s*'([^']+)'/gi)].map((m) => `${m[1]} (${m[2]})`))].sort();

const componentAreas = exists("src/components")
  ? fs.readdirSync(path.join(root, "src/components"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  : [];

const libs = walk("src/lib").filter((f) => f.endsWith(".ts")).map((f) => f.replace("src/lib/", "")).sort();

const envVars = [...new Set([...walk("src").filter((f) => /\.(ts|tsx|mjs)$/.test(f)).map(read).join("\n").matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]))].sort();

// The H2 headings of CLAUDE.md are the project's own record of how each area works.
const conventions = exists("CLAUDE.md")
  ? [...read("CLAUDE.md").matchAll(/^## (.+)$/gm)].map((m) => m[1]).filter((h) => !h.startsWith("This is NOT"))
  : [];

const list = (xs, n = 400) => (xs.length > n ? `${xs.slice(0, n).join(", ")} … and ${xs.length - n} more` : xs.join(", "));

const md = `# GHL ONE system map

Generated from the codebase by \`npm run system-map\`. Structure only — no source code. Use it to say
*where* something lives and *what* exists; never quote it as a description of how a rule behaves,
because a name is not an implementation.

Stack: Next.js 16 (App Router, \`src/\`), React 19, Tailwind v4, Supabase/Postgres with RLS.
Counted at generation: ${pages.length} pages, ${apis.length} API endpoints, ${tables.length} tables, ${functions.length} database functions, ${migrations.length} migrations.

## Screens (${pages.length})
${pages.map((p) => `- ${p}`).join("\n")}

## API endpoints (${apis.length})
${apis.map((p) => `- ${p}`).join("\n")}

## Database tables (${tables.length})
${list(tables)}

## Database functions (${functions.length})
${list(functions)}

## Scheduled jobs (${crons.length})
${crons.map((c) => `- ${c}`).join("\n")}

## Front-end areas
Components by area: ${componentAreas.join(", ")}
Shared libraries: ${list(libs, 60)}

## Environment variables read by the app
${envVars.join(", ")}

## How each area works
The project's own engineering record is \`CLAUDE.md\`, whose sections are:
${conventions.map((c) => `- ${c}`).join("\n")}
`;

fs.mkdirSync(path.join(root, "docs"), { recursive: true });
fs.writeFileSync(path.join(root, "docs/system-map.md"), md);

/*
  Also emitted as a TypeScript constant, which is what Buddy's `system_map` tool reads.

  Deliberately not stored in `ai_knowledge`: that table holds what people wrote and approved, and
  mixing a machine-generated index into it would put a document nobody owns in front of reviewers
  who are supposed to be maintaining company knowledge. Shipping it with the build also means it can
  never disagree with the code it was generated from — it is regenerated by the same commit.
*/
const ts = `/* GENERATED by \`npm run system-map\` — do not edit. Structure of this codebase, read by
   Buddy's \`system_map\` tool so it can say where something lives instead of guessing. */
export const SYSTEM_MAP = ${JSON.stringify(md)};
`;
fs.writeFileSync(path.join(root, "src/lib/ai/systemMap.ts"), ts);

console.log(`docs/system-map.md + src/lib/ai/systemMap.ts written — ${md.length} characters`);
console.log(`${pages.length} pages · ${apis.length} endpoints · ${tables.length} tables · ${functions.length} functions · ${crons.length} cron jobs`);
