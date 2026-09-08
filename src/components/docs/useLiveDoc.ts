"use client";

/**
 * Live document plumbing.
 *
 *  · `useLiveDoc` — simultaneous editing over the Supabase Realtime channel `doc:<id>`:
 *    broadcast patches (last write wins on the whole body, which is what a shared page actually is),
 *    presence (who is here, with a colour), debounced persistence (~700ms) with a version counter,
 *    and a Postgres subscription so a restore from version history lands on every screen.
 *  · `mdToHtml` / `htmlToMd` — the markdown-ish serialisation used by the contentEditable surface.
 *    `live_docs.body` always holds markdown, so search, AI and notifications can read it as text.
 */

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { docChannelName } from "@/lib/live/types";

export type DocPeer = { id: string; name: string; avatar: string | null; color: string; at: number };

const PEER_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#9333ea", "#e11d48"];
export function peerColor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PEER_COLORS[h % PEER_COLORS.length];
}

const SAVE_MS = 700;
const BROADCAST_MS = 220;

export function useLiveDoc({ docId, initialBody, initialVersion, me }: {
  docId: string;
  initialBody: string;
  initialVersion: number;
  me: { id: string; name: string; avatar: string | null };
}) {
  const [body, setBodyState] = React.useState(initialBody);
  const [version, setVersion] = React.useState(initialVersion);
  const [peers, setPeers] = React.useState<DocPeer[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  /** Bumped whenever the body changed because of somebody else — the editor re-renders its DOM on this. */
  const [remoteNonce, setRemoteNonce] = React.useState(0);

  const chanRef = React.useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const bodyRef = React.useRef(initialBody);
  const versionRef = React.useRef(initialVersion);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const castTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = React.useRef(false);

  const persist = React.useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    const next = bodyRef.current;
    const nextVersion = versionRef.current + 1;
    setSaving(true);
    const { error: e } = await createClient().from("live_docs").update({ body: next, version: nextVersion }).eq("id", docId);
    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    versionRef.current = nextVersion;
    setVersion(nextVersion);
    setSavedAt(Date.now());
    setError(null);
  }, [docId]);

  /** Local edit: optimistic, broadcast quickly, persist lazily. */
  const setBody = React.useCallback(
    (next: string) => {
      bodyRef.current = next;
      setBodyState(next);
      dirty.current = true;
      if (castTimer.current) clearTimeout(castTimer.current);
      castTimer.current = setTimeout(() => {
        void chanRef.current?.send({ type: "broadcast", event: "patch", payload: { body: bodyRef.current, by: me.id, version: versionRef.current + 1 } });
      }, BROADCAST_MS);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void persist(), SAVE_MS);
    },
    [me.id, persist]
  );

  /** Force a save now (used before snapshots / on unmount). */
  const flush = React.useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await persist();
  }, [persist]);

  /** Adopt a body written elsewhere (restore, suggestion accepted, remote patch). */
  const adopt = React.useCallback((next: string, nextVersion?: number) => {
    bodyRef.current = next;
    setBodyState(next);
    if (typeof nextVersion === "number") {
      versionRef.current = nextVersion;
      setVersion(nextVersion);
    }
    setRemoteNonce((n) => n + 1);
  }, []);

  React.useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    const channel = supabase.channel(docChannelName(docId), {
      config: { broadcast: { self: false }, presence: { key: me.id } },
    });
    chanRef.current = channel;

    channel
      .on("broadcast", { event: "patch" }, ({ payload }) => {
        const p = payload as { body?: string; by?: string; version?: number };
        if (!p || typeof p.body !== "string" || p.by === me.id) return;
        // A remote patch always wins over what we have not typed yet; our own pending edits are re-broadcast.
        bodyRef.current = p.body;
        setBodyState(p.body);
        if (typeof p.version === "number" && p.version > versionRef.current) {
          versionRef.current = p.version;
          setVersion(p.version);
        }
        setRemoteNonce((n) => n + 1);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, { id?: string; name?: string; avatar?: string | null; color?: string; at?: number }[]>;
        const list: DocPeer[] = [];
        for (const entries of Object.values(state)) {
          const e = entries[0];
          if (!e?.id || e.id === me.id) continue;
          list.push({ id: e.id, name: e.name || "Someone", avatar: e.avatar ?? null, color: e.color || peerColor(e.id), at: e.at || Date.now() });
        }
        setPeers(list);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_docs", filter: `id=eq.${docId}` }, (p) => {
        const row = p.new as { body?: string; version?: number };
        if (typeof row.version !== "number" || row.version <= versionRef.current) return;
        if (typeof row.body === "string" && row.body !== bodyRef.current) {
          bodyRef.current = row.body;
          setBodyState(row.body);
          setRemoteNonce((n) => n + 1);
        }
        versionRef.current = row.version;
        setVersion(row.version);
      });

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ id: me.id, name: me.name, avatar: me.avatar, color: peerColor(me.id), at: Date.now() });
      });
    });

    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (castTimer.current) clearTimeout(castTimer.current);
      if (dirty.current) void persist();
      supabase.removeChannel(channel);
      chanRef.current = null;
    };
  }, [docId, me.id, me.name, me.avatar, persist]);

  // Never lose a keystroke to a closing tab.
  React.useEffect(() => {
    const onHide = () => {
      if (dirty.current) void persist();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [persist]);

  return { body, setBody, adopt, flush, version, peers, saving, savedAt, error, remoteNonce };
}

/* ============================================================ markdown-ish */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Inline markdown → HTML (bold, italic, code, links). */
function inlineToHtml(src: string): string {
  let s = esc(src);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return s || "<br>";
}

const H = { 1: "h1", 2: "h2", 3: "h3" } as const;

/** Markdown-ish → HTML for the contentEditable surface. */
export function mdToHtml(md: string): string {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  const flushList = (tag: "ul" | "ol", check: boolean) => {
    const items: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      const m = check ? l.match(/^[-*]\s+\[( |x|X)\]\s?(.*)$/) : tag === "ul" ? l.match(/^[-*]\s+(?!\[( |x|X)\])(.*)$/) : l.match(/^\d+[.)]\s+(.*)$/);
      if (!m) break;
      if (check) items.push(`<li data-checked="${m[1].toLowerCase() === "x" ? "1" : "0"}">${inlineToHtml(m[2])}</li>`);
      else items.push(`<li>${inlineToHtml(tag === "ul" ? m[2] : m[1])}</li>`);
      i += 1;
    }
    out.push(`<${tag}${check ? ' data-check="1"' : ""}>${items.join("")}</${tag}>`);
  };

  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      i += 1;
      const buf: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      out.push(`<pre data-code="1"><code>${esc(buf.join("\n")) || "<br>"}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const tag = H[h[1].length as 1 | 2 | 3];
      out.push(`<${tag}>${inlineToHtml(h[2])}</${tag}>`);
      i += 1;
      continue;
    }
    if (/^(---|\*\*\*|___)\s*$/.test(line)) {
      out.push("<hr>");
      i += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(inlineToHtml(lines[i].replace(/^>\s?/, "")));
        i += 1;
      }
      out.push(`<blockquote>${buf.join("<br>")}</blockquote>`);
      continue;
    }
    if (/^[-*]\s+\[( |x|X)\]/.test(line)) {
      flushList("ul", true);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flushList("ul", false);
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      flushList("ol", false);
      continue;
    }
    if (/^\|.*\|\s*$/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i += 1;
      }
      if (rows.length) {
        const [head, ...rest] = rows;
        out.push(
          `<table><thead><tr>${head.map((c) => `<th>${inlineToHtml(c)}</th>`).join("")}</tr></thead><tbody>${rest
            .map((r) => `<tr>${r.map((c) => `<td>${inlineToHtml(c)}</td>`).join("")}</tr>`)
            .join("")}</tbody></table>`
        );
      }
      continue;
    }
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,3}\s|[-*]\s|\d+[.)]\s|>\s?|\||```|---)/.test(lines[i])) {
      buf.push(inlineToHtml(lines[i]));
      i += 1;
    }
    out.push(`<p>${buf.join("<br>")}</p>`);
  }
  return out.join("") || "<p><br></p>";
}

/** Inline DOM → markdown. */
function inlineToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent || "").replace(/ /g, " ");
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const inner = Array.from(el.childNodes).map(inlineToMd).join("");
  switch (el.tagName) {
    case "BR":
      return "\n";
    case "STRONG":
    case "B":
      return inner.trim() ? `**${inner}**` : "";
    case "EM":
    case "I":
      return inner.trim() ? `*${inner}*` : "";
    case "CODE":
      return inner.trim() ? `\`${inner}\`` : "";
    case "A": {
      const href = el.getAttribute("href") || "";
      return href ? `[${inner}](${href})` : inner;
    }
    default:
      return inner;
  }
}

const blockLines = (s: string) => s.split("\n").map((l) => l.trimEnd());

/** HTML from the contentEditable surface → markdown-ish for `live_docs.body`. */
export function htmlToMd(root: HTMLElement): string {
  const out: string[] = [];
  const push = (s: string) => {
    out.push(s);
  };

  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || "").trim();
      if (t) push(t);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    switch (el.tagName) {
      case "H1":
      case "H2":
      case "H3": {
        const n = Number(el.tagName[1]);
        push(`${"#".repeat(n)} ${inlineToMd(el).trim()}`);
        break;
      }
      case "HR":
        push("---");
        break;
      case "BLOCKQUOTE":
        for (const l of blockLines(inlineToMd(el))) push(`> ${l}`);
        break;
      case "PRE": {
        push("```");
        for (const l of blockLines(el.textContent || "")) push(l);
        push("```");
        break;
      }
      case "UL": {
        const check = el.hasAttribute("data-check");
        for (const li of Array.from(el.children)) {
          const text = inlineToMd(li).replace(/\n+/g, " ").trim();
          push(check ? `- [${(li as HTMLElement).getAttribute("data-checked") === "1" ? "x" : " "}] ${text}` : `- ${text}`);
        }
        break;
      }
      case "OL": {
        let n = 1;
        for (const li of Array.from(el.children)) {
          push(`${n}. ${inlineToMd(li).replace(/\n+/g, " ").trim()}`);
          n += 1;
        }
        break;
      }
      case "TABLE": {
        const rows = Array.from(el.querySelectorAll("tr"));
        rows.forEach((tr, idx) => {
          const cells = Array.from(tr.children).map((c) => inlineToMd(c).replace(/\|/g, "\\|").replace(/\n+/g, " ").trim());
          push(`| ${cells.join(" | ")} |`);
          if (idx === 0) push(`| ${cells.map(() => "---").join(" | ")} |`);
        });
        break;
      }
      default: {
        const md = inlineToMd(el).replace(/\s+$/, "");
        if (md.trim()) for (const l of blockLines(md)) push(l);
        else push("");
      }
    }
    push("");
  }

  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain text of a document (for AI, previews and task titles). */
export function mdToText(md: string): string {
  return (md || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`|]/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
