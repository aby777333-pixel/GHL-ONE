"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Pin, ShieldAlert, CheckCircle2, Plus, Users, Archive } from "lucide-react";
import { Avatar, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Pill, Select, Textarea, useToast } from "@/components/ui";
import { PersonChip } from "@/components/tasks/TaskBits";
import { DepartmentChips } from "@/components/meetings/PeopleMultiSelect";
import { useSession } from "@/components/providers/SessionProvider";
import { createClient } from "@/lib/supabase/client";
import { ago, cn, fmtDate, isManagerPlus, type Tables } from "@/lib/utils";

type Announcement = Tables<"announcements">;
type Ack = Pick<Tables<"announcement_acks">, "announcement_id" | "user_id" | "acked_at">;

const KINDS = ["update", "policy", "celebration", "new-employee", "notice", "emergency"] as const;
const KIND_LABEL: Record<string, string> = { update: "Update", policy: "Policy", celebration: "Celebration", "new-employee": "New employee", notice: "Notice", emergency: "Emergency" };
const KIND_TONE: Record<string, string> = { update: "tone-info", policy: "tone-violet", celebration: "tone-success", "new-employee": "tone-brand", notice: "tone-neutral", emergency: "tone-danger" };

/* --------------------------------------------------------- mini markdown */
function inline(text: string, key: number): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <React.Fragment key={key}>
      {parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <React.Fragment key={i}>{p}</React.Fragment>))}
    </React.Fragment>
  );
}
export function RichBody({ body, className }: { body: string; className?: string }) {
  const lines = body.replace(/\r/g, "").split("\n");
  const out: React.ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let k = 0;
  const flushPara = () => {
    if (para.length) {
      out.push(<p key={k++}>{para.map((l, i) => <React.Fragment key={i}>{i > 0 && <br />}{inline(l, i)}</React.Fragment>)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      out.push(<ul key={k++}>{list.map((l, i) => <li key={i}>{inline(l, i)}</li>)}</ul>);
      list = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); flushList(); continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { flushPara(); flushList(); const lvl = h[1]!.length; out.push(lvl === 1 ? <h2 key={k++}>{inline(h[2]!, 0)}</h2> : <h3 key={k++}>{inline(h[2]!, 0)}</h3>); continue; }
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li) { flushPara(); list.push(li[1]!); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return <div className={cn("prose-sm text-sm leading-relaxed", className)}>{out}</div>;
}

/* ------------------------------------------------------------------ page */
export function AnnouncementsClient({ announcements, acks, openNew }: { announcements: Announcement[]; acks: Ack[]; openNew: boolean }) {
  const { profile, people, departments } = useSession();
  const router = useRouter();
  const toast = useToast();
  const manager = isManagerPlus(profile.role);
  const [now] = React.useState(() => Date.now());
  const [showExpired, setShowExpired] = React.useState(false);
  const [showNew, setShowNew] = React.useState(openNew && manager);
  const [ackFor, setAckFor] = React.useState<Announcement | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const myAcks = React.useMemo(() => new Map(acks.filter((a) => a.user_id === profile.id).map((a) => [a.announcement_id, a.acked_at])), [acks, profile.id]);
  const deptName = (id: string) => departments.find((d) => d.id === id)?.name || "Department";
  const targets = (a: Announcement) => (a.department_ids.length ? people.filter((p) => p.department_id && a.department_ids.includes(p.department_id)) : people);
  const ackCount = (a: Announcement) => acks.filter((x) => x.announcement_id === a.id).length;

  const list = announcements
    .filter((a) => showExpired || !a.expires_at || Date.parse(a.expires_at) > now)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.published_at.localeCompare(a.published_at));
  const expiredCount = announcements.filter((a) => a.expires_at && Date.parse(a.expires_at) <= now).length;
  const pendingMandatory = list.filter((a) => a.mandatory && !myAcks.has(a.id)).length;

  async function confirm(a: Announcement) {
    setBusy(a.id);
    const { error } = await createClient().from("announcement_acks").insert({ announcement_id: a.id, user_id: profile.id });
    setBusy(null);
    if (error) return toast.push(error.message, "danger");
    toast.push("Confirmed — thank you", "success");
    router.refresh();
  }

  return (
    <div className="page page-narrow">
      <PageHeader
        eyebrow="Company"
        title="Announcements"
        subtitle={pendingMandatory ? `${pendingMandatory} mandatory announcement${pendingMandatory === 1 ? "" : "s"} need your confirmation` : "Official updates from management — pinned first."}
        actions={
          <>
            {expiredCount > 0 && <Button variant="ghost" size="sm" onClick={() => setShowExpired((s) => !s)}><Archive size={14} /> {showExpired ? "Hide expired" : `Expired (${expiredCount})`}</Button>}
            {manager && <Button variant="primary" onClick={() => setShowNew(true)}><Plus size={15} /> New announcement</Button>}
          </>
        }
      />

      {list.length === 0 ? (
        <Card>
          <EmptyState icon={<Megaphone size={18} />} title="No announcements yet" hint={manager ? "Publish the first one — it also lands in the #announcements channel." : "Company updates, policies and celebrations will appear here."} action={manager ? <Button variant="primary" onClick={() => setShowNew(true)}><Plus size={15} /> New announcement</Button> : undefined} />
        </Card>
      ) : (
        <div className="space-y-[var(--s3)] stagger">
          {list.map((a) => {
            const expired = !!a.expires_at && Date.parse(a.expires_at) <= now;
            const acked = myAcks.get(a.id);
            const author = people.find((p) => p.id === a.author_id);
            const total = targets(a).length;
            const count = ackCount(a);
            return (
              <Card key={a.id} className={cn("px-[var(--s4)] py-[var(--s4)]", a.pinned && !expired && "border-[var(--accent)]", expired && "opacity-70")}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {a.pinned && <Pill tone="tone-warn"><Pin size={10} /> Pinned</Pill>}
                  <Pill tone={KIND_TONE[a.kind] || "tone-neutral"}>{KIND_LABEL[a.kind] || a.kind}</Pill>
                  {a.mandatory && <Pill tone="tone-danger"><ShieldAlert size={10} /> Mandatory</Pill>}
                  {expired && <Pill tone="tone-muted">Expired</Pill>}
                  {a.department_ids.map((id) => (
                    <span key={id} className="pill tone-neutral">{deptName(id)}</span>
                  ))}
                  {a.department_ids.length === 0 && <span className="text-[11px] text-muted">Everyone</span>}
                </div>
                <h2 className="h2 mt-2.5">{a.title}</h2>
                <div className="flex items-center gap-2 mt-1.5 text-xs text-muted">
                  {author && <span className="inline-flex items-center gap-1.5"><Avatar name={author.full_name} src={author.avatar_url} size={18} /> {author.full_name}</span>}
                  <span className="num" title={fmtDate(a.published_at, true)}>{ago(a.published_at)}</span>
                  {a.expires_at && !expired && <span className="num">· until {fmtDate(a.expires_at)}</span>}
                </div>
                <RichBody body={a.body} className="mt-4" />
                {(a.mandatory || manager) && (
                  <div className="flex items-center gap-2 flex-wrap mt-4 pt-3 border-t">
                    {a.mandatory && (acked ? (
                      <span className="inline-flex items-center gap-1.5 text-sm text-success"><CheckCircle2 size={15} /> Confirmed on {fmtDate(acked, true)}</span>
                    ) : (
                      <Button variant="primary" size="sm" loading={busy === a.id} onClick={() => confirm(a)}><CheckCircle2 size={14} /> Read &amp; confirmed</Button>
                    ))}
                    {manager && a.mandatory && (
                      <button className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted hover:text-[var(--fg)]" onClick={() => setAckFor(a)}>
                        <Users size={13} /> <span className="num">{count}/{total}</span> confirmed
                        <span className="w-20 h-1.5 rounded-full sunken overflow-hidden"><span className="block h-full rounded-full bg-[var(--success)]" style={{ width: `${total ? Math.round((count / total) * 100) : 0}%` }} /></span>
                      </button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {ackFor && (
        <Modal open onClose={() => setAckFor(null)} title="Acknowledgements" width={480}>
          <div className="text-sm font-medium mb-3">{ackFor.title}</div>
          <AckList announcement={ackFor} acks={acks} targets={targets(ackFor)} />
        </Modal>
      )}
      {showNew && <NewAnnouncementModal onClose={() => { setShowNew(false); if (openNew) router.replace("/announcements"); }} />}
    </div>
  );
}

function AckList({ announcement, acks, targets }: { announcement: Announcement; acks: Ack[]; targets: { id: string; full_name: string; avatar_url: string | null }[] }) {
  const done = new Map(acks.filter((a) => a.announcement_id === announcement.id).map((a) => [a.user_id, a.acked_at]));
  const confirmed = targets.filter((p) => done.has(p.id));
  const pending = targets.filter((p) => !done.has(p.id));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <div className="eyebrow mb-2">Confirmed · {confirmed.length}</div>
        <div className="space-y-1">
          {confirmed.length === 0 && <div className="text-xs text-muted">Nobody yet.</div>}
          {confirmed.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-sm"><Avatar name={p.full_name} src={p.avatar_url} size={20} /> <span className="truncate flex-1">{p.full_name}</span><span className="text-[11px] text-muted num">{ago(done.get(p.id)!)}</span></div>
          ))}
        </div>
      </div>
      <div>
        <div className="eyebrow mb-2">Not yet · {pending.length}</div>
        <div className="space-y-1">
          {pending.length === 0 && <div className="text-xs text-muted">Everyone has confirmed.</div>}
          {pending.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-sm"><PersonChip id={p.id} size={20} /></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NewAnnouncementModal({ onClose }: { onClose: () => void }) {
  const { profile } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [kind, setKind] = React.useState<string>("update");
  const [mandatory, setMandatory] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const [depts, setDepts] = React.useState<string[]>([]);
  const [expires, setExpires] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("announcements").insert({
      org_id: profile.org_id!,
      title: title.trim(),
      body: body.trim(),
      kind,
      mandatory,
      pinned,
      department_ids: depts,
      expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
      author_id: profile.id,
    });
    if (error) {
      setLoading(false);
      return toast.push(error.message, "danger");
    }
    // Echo into #announcements so it reaches people in chat as well. Best effort.
    try {
      const { data: ch } = await supabase.from("channels").select("id").eq("slug", "announcements").maybeSingle();
      if (ch) {
        const excerpt = body.trim().replace(/\s+/g, " ").slice(0, 300);
        await supabase.from("messages").insert({ channel_id: ch.id, author_id: profile.id, body: `📣 ${title.trim()}\n${excerpt}${body.trim().length > 300 ? "…" : ""}` });
      }
    } catch {
      /* channel post is optional */
    }
    setLoading(false);
    toast.push("Announcement published", "success");
    router.refresh();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="New announcement" width={640}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Title">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Office closed on 2 October" required />
        </Field>
        <Field label="Body" hint="Supports # headings, - bullets and **bold**.">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What people need to know…" style={{ minHeight: 144 }} required />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Kind">
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Expires">
            <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none"><input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} className="accent-[var(--brand)]" /> Mandatory — requires confirmation</label>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="accent-[var(--brand)]" /> Pin to top</label>
        </div>
        <div>
          <span className="label">Target departments <span className="text-muted font-normal">(none = everyone)</span></span>
          <DepartmentChips value={depts} onChange={setDepts} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={loading}><Megaphone size={14} /> Publish</Button>
        </div>
      </form>
    </Modal>
  );
}
