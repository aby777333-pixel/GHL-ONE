/**
 * node scripts/purge-orphan-storage.mjs            # list only (default)
 * node scripts/purge-orphan-storage.mjs --delete   # actually remove them
 *
 * Deletes storage objects whose owning database row no longer exists.
 *
 * Why a script: `storage.protect_delete()` refuses a direct `delete from storage.objects` and
 * rolls the whole statement back, so a blob cannot be cleaned up in the same SQL as the row that
 * referenced it. After the go-live reset that left 12 orphans (~2.5 MB).
 *
 * `avatars` is never touched. Those are the people's own profile pictures and they belong to the
 * account, not to any content row — `profiles.avatar_url` also keeps older versions reachable.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY (Dashboard -> Project Settings -> API Keys -> service_role).
 * That key bypasses RLS: keep it out of the browser, out of any NEXT_PUBLIC_* variable and out of
 * logs. It is read from .env.local, which is gitignored.
 */

import fs from "node:fs";
import path from "node:path";

/* ------------------------------------------------------------------- env */

function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !KEY) {
  console.error("purge-orphan-storage: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  console.error("  Dashboard -> Project Settings -> API Keys -> service_role (secret).");
  console.error("  Add SUPABASE_SERVICE_ROLE_KEY=... to .env.local (gitignored; never commit it).");
  process.exit(1);
}

const DELETE = process.argv.includes("--delete");

/**
 * Each bucket, and every column that can still be holding one of its paths. A bucket is only
 * cleaned when we can positively establish what owns its objects, and **every** referencing
 * column has to be listed — miss one and the script deletes live data.
 *
 * Two that are easy to get wrong: `files` has no path column at all (the path is on
 * `file_versions`, because a file is a stack of versions), and `live_recordings` stores the
 * poster image separately in `thumbnail_path`, so the `.jpg` beside each `.webm` is referenced
 * by a different column of the same row.
 */
const BUCKETS = [
  { bucket: "files", sources: [{ table: "file_versions", column: "storage_path" }] },
  {
    bucket: "chat",
    sources: [
      { table: "messages", column: "attachments", json: true },
      { table: "conversation_messages", column: "attachments", json: true },
    ],
  },
  { bucket: "hr", sources: [{ table: "employee_documents", column: "storage_path" }] },
  {
    bucket: "live",
    sources: [
      { table: "live_recordings", column: "storage_path" },
      { table: "live_recordings", column: "thumbnail_path" },
      { table: "live_recording_replies", column: "storage_path" },
    ],
  },
];

async function api(pathname, init = {}) {
  const res = await fetch(`${URL_BASE}${pathname}`, {
    ...init,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new Error(`${res.status} ${pathname} ${typeof body === "string" ? body : JSON.stringify(body)}`);
  return body;
}

/** Every object in a bucket, walking folders, since the list endpoint is one level at a time. */
async function listAll(bucket, prefix = "") {
  const out = [];
  const page = await api(`/storage/v1/object/list/${bucket}`, {
    method: "POST",
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } }),
  });
  for (const item of page || []) {
    const full = prefix ? `${prefix}/${item.name}` : item.name;
    // A folder comes back with no id and no metadata.
    if (item.id === null || item.metadata === null) out.push(...(await listAll(bucket, full)));
    else out.push({ name: full, size: Number(item.metadata?.size || 0) });
  }
  return out;
}

async function referenced(sources) {
  const set = new Set();
  for (const { table, column, json } of sources) {
    const rows = await api(`/rest/v1/${table}?select=${column}`);
    for (const r of rows || []) {
      const v = r[column];
      if (!v) continue;
      if (json) {
        for (const a of Array.isArray(v) ? v : []) if (a && typeof a.path === "string") set.add(a.path);
      } else if (typeof v === "string") set.add(v);
    }
  }
  return set;
}

async function main() {
  let totalCount = 0;
  let totalBytes = 0;

  for (const spec of BUCKETS) {
    const [objects, keep] = await Promise.all([listAll(spec.bucket), referenced(spec.sources)]);
    const orphans = objects.filter((o) => !keep.has(o.name));
    if (!orphans.length) {
      console.log(`${spec.bucket}: ${objects.length} object(s), none orphaned`);
      continue;
    }
    const bytes = orphans.reduce((a, o) => a + o.size, 0);
    totalCount += orphans.length;
    totalBytes += bytes;
    const owners = [...new Set(spec.sources.map((x) => x.table))].join(", ");
    console.log(`${spec.bucket}: ${orphans.length} orphaned of ${objects.length} (${(bytes / 1024).toFixed(1)} KB) — unreferenced by ${owners}`);
    for (const o of orphans) console.log(`    ${o.name}`);

    if (DELETE) {
      await api(`/storage/v1/object/${spec.bucket}`, { method: "DELETE", body: JSON.stringify({ prefixes: orphans.map((o) => o.name) }) });
      console.log(`    deleted ${orphans.length}`);
    }
  }

  console.log(
    totalCount === 0
      ? "\nNothing to purge."
      : DELETE
        ? `\nDeleted ${totalCount} object(s), ${(totalBytes / 1024 / 1024).toFixed(2)} MB.`
        : `\n${totalCount} object(s), ${(totalBytes / 1024 / 1024).toFixed(2)} MB. Re-run with --delete to remove them.`
  );
  console.log("avatars was not examined — profile pictures belong to the account, not to content.");
}

main().catch((e) => {
  console.error("purge-orphan-storage failed:", e.message);
  process.exit(1);
});
