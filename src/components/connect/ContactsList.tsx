"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Contact, Mail, MessagesSquare, Phone, Plus, Star, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/components/providers/SessionProvider";
import { Button, EmptyState, Modal, PageHeader, SearchInput, Select, Skeleton, Textarea, useToast } from "@/components/ui";
import { ago, cn } from "@/lib/utils";
import { DncBadge } from "./ConnectBits";
import { ContactFormModal } from "./ContactForm";
import { CONTACT_KINDS, CONTACT_KIND_LABEL, errText, telHref, type ContactRow } from "./lib";

type Row = Pick<ContactRow, "id" | "name" | "company" | "kind" | "emails" | "phones" | "vip" | "do_not_contact" | "owner_id" | "tags" | "last_contact_at" | "updated_at">;
const COLS = "id,name,company,kind,emails,phones,vip,do_not_contact,owner_id,tags,last_contact_at,updated_at";

export function ContactsList() {
  const { people } = useSession();
  const router = useRouter();
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [q, setQ] = React.useState("");
  const [kind, setKind] = React.useState("");
  const [onlyVip, setOnlyVip] = React.useState(false);
  const [newOpen, setNewOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    const supabase = createClient();
    const t = setTimeout(async () => {
      const term = q.trim();
      if (term) {
        const { data: hits } = await supabase.rpc("search_contacts", { p_q: term, p_limit: 100 });
        const ids = (hits || []).map((h) => h.id);
        if (!ids.length) return alive && setRows([]);
        const { data } = await supabase.from("contacts").select(COLS).in("id", ids);
        if (!alive) return;
        const order = new Map(ids.map((id, i) => [id, i]));
        setRows((data || []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)));
      } else {
        const { data } = await supabase.from("contacts").select(COLS).order("last_contact_at", { ascending: false, nullsFirst: false }).limit(300);
        if (alive) setRows(data || []);
      }
    }, q ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, tick]);

  const list = (rows || []).filter((r) => (!kind || r.kind === kind) && (!onlyVip || r.vip));
  const ownerName = (id: string | null) => (id ? people.find((p) => p.id === id)?.full_name.split(" ")[0] : "");

  return (
    <div className="page">
      <PageHeader
        eyebrow="GHL Connect"
        title="Contacts"
        subtitle="Customers, leads and partners we talk to. Work-relevant details only."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/connect" className="btn btn-secondary btn-sm"><MessagesSquare size={14} /> Inbox</Link>
            <Button size="sm" onClick={() => setImportOpen(true)}><Upload size={14} /> Import CSV</Button>
            <Button size="sm" variant="primary" onClick={() => setNewOpen(true)}><Plus size={14} /> New contact</Button>
          </div>
        }
      />
      <div className="flex flex-wrap gap-2 mb-[var(--s3)]">
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, email, phone…" className="flex-1 min-w-[220px]" />
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="!w-auto" aria-label="Type">
          <option value="">All types</option>
          {CONTACT_KINDS.map((k) => <option key={k} value={k}>{CONTACT_KIND_LABEL[k]}</option>)}
        </Select>
        <button className={cn("pill pill-lg", onlyVip ? "tone-orange" : "tone-neutral")} onClick={() => setOnlyVip((v) => !v)}><Star size={11} /> VIP</button>
      </div>
      <div className="card overflow-hidden">
        {!rows ? (
          <div className="p-4 space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : list.length === 0 ? (
          <EmptyState icon={<Contact size={20} />} title={q ? "No contacts match" : "No contacts yet"} hint="Contacts are created automatically from inbound email and messages, or add one by hand." action={<Button variant="primary" onClick={() => setNewOpen(true)}><Plus size={14} /> New contact</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted border-b">
                <tr><th className="px-3 py-2 font-medium">Name</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">Reach</th><th className="px-3 py-2 font-medium">Owner</th><th className="px-3 py-2 font-medium">Last contact</th></tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 row-hover cursor-pointer" onClick={() => router.push(`/connect/contacts/${r.id}`)}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 min-w-0"><span className="truncate font-medium">{r.name}</span>{r.vip && <Star size={12} className="text-[var(--orange)] shrink-0" />}<DncBadge dnc={r.do_not_contact} /></div>
                      <div className="text-xs text-muted truncate">{r.company || ""}{r.tags.length ? ` · ${r.tags.join(", ")}` : ""}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">{CONTACT_KIND_LABEL[r.kind] || r.kind}</td>
                    <td className="px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        {r.emails[0] && <a href={`mailto:${r.emails[0]}`} className="inline-flex items-center gap-1 hover:underline"><Mail size={11} /> <span className="max-w-[160px] truncate">{r.emails[0]}</span></a>}
                        {r.phones[0] && <a href={telHref(r.phones[0])} className="inline-flex items-center gap-1 hover:underline"><Phone size={11} /> {r.phones[0]}</a>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">{ownerName(r.owner_id) || <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">{r.last_contact_at ? ago(r.last_contact_at) : "never"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {newOpen && <ContactFormModal open onClose={() => setNewOpen(false)} onSaved={(c) => { setNewOpen(false); router.push(`/connect/contacts/${c.id}`); }} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); setTick((t) => t + 1); }} />}
    </div>
  );
}

/** Minimal CSV import: name, company, email, phone, kind, tags (header row required). */
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { profile } = useSession();
  const toast = useToast();
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const parsed = React.useMemo(() => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const head = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
    const idx = (k: string) => head.indexOf(k);
    return lines.slice(1).map((l) => {
      const cells = l.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const get = (k: string) => (idx(k) >= 0 ? cells[idx(k)] || "" : "");
      return { name: get("name"), company: get("company") || null, emails: get("email") ? [get("email").toLowerCase()] : [], phones: get("phone") ? [get("phone").replace(/[^0-9+]/g, "")] : [], kind: CONTACT_KINDS.includes(get("kind") as (typeof CONTACT_KINDS)[number]) ? get("kind") : "customer", tags: get("tags") ? get("tags").split(/[;|]/).map((t) => t.trim()).filter(Boolean) : [] };
    }).filter((r) => r.name);
  }, [text]);
  async function go() {
    if (!parsed.length) return;
    setBusy(true);
    const { error } = await createClient().from("contacts").insert(parsed.map((r) => ({ ...r, org_id: profile.org_id!, owner_id: profile.id, department_id: profile.department_id, created_by: profile.id, source: "import" })));
    setBusy(false);
    if (error) return toast.push(errText(error), "danger");
    toast.push(`${parsed.length} contact${parsed.length === 1 ? "" : "s"} imported`, "success");
    onDone();
  }
  return (
    <Modal open onClose={onClose} title="Import contacts (CSV)" width={560} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!parsed.length} onClick={go}><Upload size={14} /> Import {parsed.length || ""}</Button></>}>
      <p className="text-xs text-muted mb-2">Paste CSV with a header row. Recognised columns: <code className="kbd">name</code> <code className="kbd">company</code> <code className="kbd">email</code> <code className="kbd">phone</code> <code className="kbd">kind</code> <code className="kbd">tags</code> (tags separated by ;). You become the owner.</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"name,company,email,phone,kind,tags\nAsha Rao,Acme Ltd,asha@acme.in,+919812345678,customer,renewal;enterprise"} style={{ minHeight: 160, fontFamily: "var(--font-mono, monospace)", fontSize: 12 }} />
      {parsed.length > 0 && <div className="text-xs text-muted mt-2">{parsed.length} row{parsed.length === 1 ? "" : "s"} ready.</div>}
    </Modal>
  );
}
