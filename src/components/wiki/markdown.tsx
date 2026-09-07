import * as React from "react";

/**
 * Small, dependency-free, safe markdown renderer.
 * Everything is emitted as React elements (never raw HTML), so user content is always escaped.
 * Supports: headings, paragraphs, bold/italic/strike, inline code, fenced code, links (http/https/mailto/relative),
 * images, unordered/ordered lists (one nesting level), task lists, blockquotes, tables, horizontal rules.
 */

export type Heading = { level: number; text: string; id: string };

export function headingId(text: string) {
  return text.toLowerCase().replace(/[`*_~\[\]()]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "section";
}

export function extractHeadings(source: string): Heading[] {
  const out: Heading[] = [];
  const seen = new Map<string, number>();
  let inFence = false;
  for (const raw of source.split(/\r?\n/)) {
    if (/^```/.test(raw.trim())) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(raw);
    if (!m) continue;
    const text = m[2].trim();
    let id = headingId(text);
    const n = seen.get(id) || 0;
    seen.set(id, n + 1);
    if (n) id = `${id}-${n}`;
    out.push({ level: m[1].length, text, id });
  }
  return out;
}

export function safeHref(url: string) {
  const u = url.trim();
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  if (u.startsWith("/") || u.startsWith("#")) return u;
  return null;
}

/* ------------------------------------------------------------- inline */
const INLINE_RE = /(`[^`]+`)|(!\[[^\]]*\]\([^)\s]+\))|(\[[^\]]+\]\([^)\s]+\))|(\*\*[^*]+\*\*)|(__[^_]+__)|(~~[^~]+~~)|(\*[^*\s][^*]*\*)|((?<![A-Za-z0-9])_[^_\s][^_]*_(?![A-Za-z0-9]))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/;

export function renderInline(text: string, keyPrefix = "i"): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest.length) {
    const m = INLINE_RE.exec(rest);
    if (!m || m.index === undefined) { nodes.push(rest); break; }
    if (m.index > 0) nodes.push(rest.slice(0, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${k++}`;
    if (m[1]) nodes.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else if (m[2]) {
      const mm = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(tok)!;
      const href = safeHref(mm[2]);
      // eslint-disable-next-line @next/next/no-img-element
      nodes.push(href ? <img key={key} src={href} alt={mm[1]} className="max-w-full rounded-[var(--radius-sm)] border my-2" /> : <span key={key}>{mm[1]}</span>);
    } else if (m[3]) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      const href = safeHref(mm[2]);
      nodes.push(href ? <a key={key} href={href} target={href.startsWith("/") || href.startsWith("#") ? undefined : "_blank"} rel="noreferrer">{renderInline(mm[1], key)}</a> : <span key={key}>{mm[1]}</span>);
    } else if (m[4] || m[5]) nodes.push(<strong key={key}>{renderInline(tok.slice(2, -2), key)}</strong>);
    else if (m[6]) nodes.push(<s key={key}>{renderInline(tok.slice(2, -2), key)}</s>);
    else if (m[7] || m[8]) nodes.push(<em key={key}>{renderInline(tok.slice(1, -1), key)}</em>);
    else if (m[9]) nodes.push(<a key={key} href={tok} target="_blank" rel="noreferrer">{tok}</a>);
    rest = rest.slice(m.index + tok.length);
  }
  return nodes;
}

/* -------------------------------------------------------------- blocks */
type Block =
  | { t: "h"; level: number; text: string; id: string }
  | { t: "p"; text: string }
  | { t: "code"; lang: string; body: string }
  | { t: "quote"; lines: string[] }
  | { t: "ul"; items: ListItem[] }
  | { t: "ol"; items: ListItem[]; start: number }
  | { t: "hr" }
  | { t: "table"; header: string[]; align: ("l" | "c" | "r")[]; rows: string[][] };
type ListItem = { text: string; checked?: boolean; children?: ListItem[] };

function splitRow(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  const seenIds = new Map<string, number>();
  let i = 0;
  const para: string[] = [];
  const flushPara = () => {
    if (para.length) { blocks.push({ t: "p", text: para.join(" ") }); para.length = 0; }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { flushPara(); i++; continue; }

    // fenced code
    if (/^```/.test(trimmed)) {
      flushPara();
      const lang = trimmed.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { body.push(lines[i]); i++; }
      i++;
      blocks.push({ t: "code", lang, body: body.join("\n") });
      continue;
    }
    // heading
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      flushPara();
      let id = headingId(h[2]);
      const n = seenIds.get(id) || 0;
      seenIds.set(id, n + 1);
      if (n) id = `${id}-${n}`;
      blocks.push({ t: "h", level: h[1].length, text: h[2].trim(), id });
      i++; continue;
    }
    // hr
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { flushPara(); blocks.push({ t: "hr" }); i++; continue; }
    // blockquote
    if (/^>\s?/.test(trimmed)) {
      flushPara();
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) { q.push(lines[i].trim().replace(/^>\s?/, "")); i++; }
      blocks.push({ t: "quote", lines: q });
      continue;
    }
    // table
    if (trimmed.includes("|") && i + 1 < lines.length && /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(lines[i + 1].trim())) {
      flushPara();
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c) => (c.startsWith(":") && c.endsWith(":") ? "c" : c.endsWith(":") ? "r" : "l") as "l" | "c" | "r");
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes("|")) { rows.push(splitRow(lines[i])); i++; }
      blocks.push({ t: "table", header, align, rows });
      continue;
    }
    // lists
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      const ordered = /\d/.test(li[2]);
      const start = ordered ? parseInt(li[2], 10) || 1 : 1;
      const items: ListItem[] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!m) {
          // continuation line for the last item
          if (items.length && lines[i].trim() && /^\s{2,}/.test(lines[i])) {
            const last = items[items.length - 1];
            const target = last.children?.length ? last.children[last.children.length - 1] : last;
            target.text += " " + lines[i].trim();
            i++; continue;
          }
          break;
        }
        const indent = m[1].replace(/\t/g, "  ").length;
        const raw = m[3];
        const task = /^\[( |x|X)\]\s+(.*)$/.exec(raw);
        const item: ListItem = task ? { text: task[2], checked: task[1] !== " " } : { text: raw };
        if (indent >= 2 && items.length) {
          const last = items[items.length - 1];
          (last.children ||= []).push(item);
        } else items.push(item);
        i++;
      }
      blocks.push(ordered ? { t: "ol", items, start } : { t: "ul", items });
      continue;
    }
    para.push(trimmed);
    i++;
  }
  flushPara();
  return blocks;
}

/* ------------------------------------------------------------- render */
function List({ items, ordered, start, k }: { items: ListItem[]; ordered?: boolean; start?: number; k: string }) {
  const children = items.map((it, idx) => (
    <li key={`${k}-${idx}`} className={it.checked !== undefined ? "list-none -ml-5 flex items-start gap-2" : undefined}>
      {it.checked !== undefined && <input type="checkbox" checked={it.checked} readOnly className="mt-1 accent-[var(--brand)]" />}
      <span>
        {renderInline(it.text, `${k}-${idx}`)}
        {it.children && <List items={it.children} k={`${k}-${idx}-c`} />}
      </span>
    </li>
  ));
  return ordered ? <ol start={start}>{children}</ol> : <ul>{children}</ul>;
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = React.useMemo(() => parseBlocks(source || ""), [source]);
  return (
    <div className={["md prose-sm", className].filter(Boolean).join(" ")}>
      {blocks.map((b, i) => {
        const k = `b${i}`;
        switch (b.t) {
          case "h": {
            const Tag = (`h${Math.min(6, b.level)}`) as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
            return <Tag key={k} id={b.id} className="scroll-mt-20">{renderInline(b.text, k)}</Tag>;
          }
          case "p": return <p key={k}>{renderInline(b.text, k)}</p>;
          case "code":
            return (
              <pre key={k} className="sunken rounded-[var(--radius-sm)] border p-3 overflow-x-auto text-[13px] leading-relaxed my-3" data-lang={b.lang || undefined}>
                <code className="!bg-transparent !p-0">{b.body}</code>
              </pre>
            );
          case "quote":
            return (
              <blockquote key={k} className="border-l-2 border-[var(--brand)] pl-3 my-3 text-2 italic">
                {b.lines.map((l, j) => <p key={j}>{renderInline(l, `${k}-${j}`)}</p>)}
              </blockquote>
            );
          case "ul": return <List key={k} items={b.items} k={k} />;
          case "ol": return <List key={k} items={b.items} ordered start={b.start} k={k} />;
          case "hr": return <hr key={k} className="my-4 border-[var(--line)]" />;
          case "table":
            return (
              <div key={k} className="overflow-x-auto my-3 -mx-1 px-1">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      {b.header.map((c, j) => (
                        <th key={j} className="text-left font-semibold border-b py-1.5 px-2 whitespace-nowrap" style={{ textAlign: b.align[j] === "c" ? "center" : b.align[j] === "r" ? "right" : "left" }}>{renderInline(c, `${k}-h${j}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, ri) => (
                      <tr key={ri} className="border-b last:border-b-0">
                        {b.header.map((_, j) => (
                          <td key={j} className="py-1.5 px-2 align-top" style={{ textAlign: b.align[j] === "c" ? "center" : b.align[j] === "r" ? "right" : "left" }}>{renderInline(r[j] || "", `${k}-${ri}-${j}`)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}

/** First ~N characters of plain text from markdown, for previews. */
export function excerpt(source: string, n = 160) {
  const txt = (source || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return txt.length > n ? txt.slice(0, n).trimEnd() + "…" : txt;
}
