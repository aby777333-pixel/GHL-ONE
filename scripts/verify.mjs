#!/usr/bin/env node
// ---------------------------------------------------------------------------
// GHL ONE — release verifier.
//
// Calls platform_self_test() (supabase/migrations/0026_selftest.sql) over the
// PostgREST RPC endpoint and prints a pass/fail table. Exits non-zero on any
// failed check, so it is usable as a git hook or a CI gate.
//
// The self test is READ-ONLY, so this is safe to run against production.
//
//   NEXT_PUBLIC_SUPABASE_URL   https://<project>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  service_role key (secret — never commit it)
//
// Both are read from the environment only. For convenience .env.local / .env
// are loaded first if they exist; both are gitignored.
// ---------------------------------------------------------------------------

import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const f of [".env.local", ".env"]) {
  const p = resolve(ROOT, f);
  if (existsSync(p) && typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(p);
    } catch {
      /* a malformed env file is not this script's problem */
    }
  }
}

const C = process.stdout.isTTY && !process.env.NO_COLOR;
const red = (s) => (C ? `\x1b[31m${s}\x1b[0m` : s);
const green = (s) => (C ? `\x1b[32m${s}\x1b[0m` : s);
const dim = (s) => (C ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s) => (C ? `\x1b[1m${s}\x1b[0m` : s);

function die(message, help) {
  console.error("");
  console.error(red(`verify: ${message}`));
  if (help) console.error(help);
  console.error("");
  process.exit(1);
}

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!url) {
  die(
    "NEXT_PUBLIC_SUPABASE_URL is not set.",
    [
      "  Set it to your project URL, e.g. https://rarlrohsybktcheyrhiv.supabase.co",
      "  Local:  put it in .env.local (gitignored).",
      "  CI:     add it as the repository secret NEXT_PUBLIC_SUPABASE_URL.",
    ].join("\n"),
  );
}

if (!key) {
  die(
    "SUPABASE_SERVICE_ROLE_KEY is not set — refusing to report a pass without running anything.",
    [
      "  The self test runs as the service role because it impersonates every role in turn.",
      "",
      "  Where to get it:",
      "    Supabase dashboard -> Project Settings -> API Keys -> service_role (secret).",
      "",
      "  Local:  add SUPABASE_SERVICE_ROLE_KEY=... to .env.local (gitignored; never commit it).",
      "  CI:     add it as the repository secret SUPABASE_SERVICE_ROLE_KEY.",
      "",
      "  This key bypasses row level security. Never expose it to the browser,",
      "  never put it in a NEXT_PUBLIC_* variable, and never paste it into a log.",
    ].join("\n"),
  );
}

const endpoint = `${url}/rest/v1/rpc/platform_self_test`;

console.log("");
console.log(bold("GHL ONE — platform self test"));
console.log(dim(`  ${endpoint}`));
console.log("");

let res;
try {
  res = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: "{}",
  });
} catch (e) {
  die(`could not reach ${endpoint}`, `  ${e?.message ?? e}`);
}

const text = await res.text();

if (!res.ok) {
  let detail = text;
  try {
    const j = JSON.parse(text);
    detail = [j.message, j.details, j.hint].filter(Boolean).join(" — ") || text;
  } catch {
    /* keep the raw body */
  }
  if (res.status === 404 || /Could not find the function/i.test(detail)) {
    die(
      "platform_self_test() does not exist on this project.",
      "  Apply supabase/migrations/0026_selftest.sql, then run npm run verify again.",
    );
  }
  die(`RPC failed with HTTP ${res.status}`, `  ${detail}`);
}

let report;
try {
  report = JSON.parse(text);
} catch {
  die("the RPC returned something that is not JSON", `  ${text.slice(0, 400)}`);
}

const checks = Array.isArray(report?.checks) ? report.checks : [];
if (checks.length === 0) {
  die(
    "the self test returned no checks at all — treating that as a failure.",
    "  Confirm 0026_selftest.sql is applied and that the project has at least one active profile.",
  );
}

// ---- suite summary -------------------------------------------------------
const suites = new Map();
for (const c of checks) {
  const s = c.suite ?? "other";
  const row = suites.get(s) ?? { passed: 0, failed: 0 };
  if (c.ok) row.passed += 1;
  else row.failed += 1;
  suites.set(s, row);
}

const nameWidth = Math.max(...[...suites.keys()].map((s) => s.length), 20);
console.log(`  ${"SUITE".padEnd(nameWidth)}   PASS   FAIL`);
console.log(`  ${"-".repeat(nameWidth)}   ----   ----`);
for (const [suite, row] of suites) {
  const status = row.failed === 0 ? green("ok  ") : red("FAIL");
  console.log(
    `  ${suite.padEnd(nameWidth)}   ${String(row.passed).padStart(4)}   ${String(row.failed).padStart(4)}  ${status}`,
  );
}
console.log("");

// ---- failures ------------------------------------------------------------
const failures = checks.filter((c) => !c.ok);
if (failures.length) {
  console.log(bold(red(`${failures.length} failed check${failures.length === 1 ? "" : "s"}:`)));
  console.log("");
  for (const f of failures) {
    console.log(`  ${red("x")} ${bold(`${f.suite ?? "?"} / ${f.name}`)}`);
    if (f.detail) console.log(`      ${dim(f.detail)}`);
  }
  console.log("");
}

// ---- review notes (passing checks that still carry a list) ---------------
for (const c of checks) {
  if (c.ok && typeof c.name === "string" && c.name.endsWith(":review") && c.detail) {
    console.log(dim(`  note  ${c.suite ?? "?"} / ${c.name}: ${c.detail}`));
    console.log("");
  }
}

const passed = Number(report.passed ?? checks.filter((c) => c.ok).length);
const failed = Number(report.failed ?? failures.length);
const ok = report.ok === true && failed === 0;

console.log(
  ok
    ? green(`PASS — ${passed} checks, 0 failures  ${dim(`(${report.ran_at ?? ""})`)}`)
    : red(`FAIL — ${passed} passed, ${failed} failed  ${dim(`(${report.ran_at ?? ""})`)}`),
);
console.log("");

process.exit(ok ? 0 : 1);
