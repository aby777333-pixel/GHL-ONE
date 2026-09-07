"use client";

import { Blink } from "@/components/providers/ActivityProvider";

import * as React from "react";
import Link from "next/link";
import { Users, LayoutGrid, Network, X } from "lucide-react";
import { Avatar, EmptyState, PageHeader, SearchInput, Select } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, ROLE_LABEL, type RoleLevel } from "@/lib/utils";
import type { DirectoryPerson } from "./types";
import { AssignTaskButton, ChatButton, RolePill } from "./PeopleBits";
import { OrgChart } from "./OrgChart";

const ROLES: RoleLevel[] = ["super_admin", "director", "executive", "department_head", "manager", "team_lead", "employee", "intern", "consultant", "vendor", "guest"];

export function Directory({ people, initial }: { people: DirectoryPerson[]; initial?: { q?: string; department?: string; view?: "grid" | "org" } }) {
  const { departments, profile } = useSession();
  const [q, setQ] = React.useState(initial?.q || "");
  const [dept, setDept] = React.useState(initial?.department || "");
  const [role, setRole] = React.useState("");
  const [view, setView] = React.useState<"grid" | "org">(initial?.view || "grid");

  const visible = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people.filter((p) => {
      if (dept && p.department_id !== dept) return false;
      if (role && p.role !== role) return false;
      if (!needle) return true;
      return (
        p.full_name.toLowerCase().includes(needle) ||
        (p.designation || "").toLowerCase().includes(needle) ||
        p.email.toLowerCase().includes(needle) ||
        p.skills.some((s) => s.toLowerCase().includes(needle))
      );
    });
  }, [people, q, dept, role]);

  const byDept = React.useMemo(() => {
    const m = new Map<string, DirectoryPerson[]>();
    for (const p of visible) {
      const k = p.department_id || "";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    const order = [...departments.map((d) => d.id), ""];
    return order.filter((k) => m.has(k)).map((k) => ({ id: k, name: departments.find((d) => d.id === k)?.name || "No department", color: departments.find((d) => d.id === k)?.color, people: m.get(k)! }));
  }, [visible, departments]);

  return (
    <div className="page page-wide">
      <PageHeader
        eyebrow="Company"
        title="People"
        subtitle={`${people.length} active member${people.length === 1 ? "" : "s"} across ${departments.length} departments`}
        actions={
          <div className="inline-flex rounded-[var(--radius-sm)] border overflow-hidden">
            <button className={cn("btn btn-ghost btn-sm rounded-none", view === "grid" && "bg-[var(--neutral-bg)]")} onClick={() => setView("grid")}><LayoutGrid size={14} /> Directory</button>
            <button className={cn("btn btn-ghost btn-sm rounded-none", view === "org" && "bg-[var(--neutral-bg)]")} onClick={() => setView("org")}><Network size={14} /> Org chart</button>
          </div>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2 mb-[var(--s4)]">
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, designation, email or skill…" className="flex-1" />
        <div className="grid grid-cols-2 sm:flex gap-2">
          <Select value={dept} onChange={(e) => setDept(e.target.value)} className="sm:w-[200px]">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="sm:w-[180px]">
            <option value="">All roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
        </div>
        {(dept || role || q) && (
          <button className="text-xs text-muted hover:underline inline-flex items-center gap-1 self-start sm:self-center" onClick={() => { setQ(""); setDept(""); setRole(""); }}><X size={12} /> Clear</button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="card"><EmptyState icon={<Users size={20} />} title="Nobody matches" hint="Try a different name, skill or department." /></div>
      ) : view === "org" ? (
        <OrgChart people={visible} />
      ) : (
        <div className="space-y-[var(--s4)]">
          {byDept.map((g) => (
            <section key={g.id || "none"}>
              <div className="flex items-center gap-2 mb-2">
                {g.color && <span className="w-2 h-2 rounded-full" style={{ background: g.color }} />}
                <h2 className="h3">{g.name}</h2>
                <span className="text-xs text-muted num">{g.people.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-[var(--s3)] stagger">
                {g.people.map((p) => (
                  <PersonCard key={p.id} p={p} me={p.id === profile.id} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonCard({ p, me }: { p: DirectoryPerson; me: boolean }) {
  const { departments } = useSession();
  const dept = departments.find((d) => d.id === p.department_id);
  return (
    <div className="card card-hover p-[var(--s3)] flex flex-col gap-2 min-w-0">
      <Link href={`/people/${p.id}`} className="flex items-start gap-3 min-w-0">
        <Avatar name={p.full_name} src={p.avatar_url} size={44} presence={p.presence} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate flex items-center gap-2"><span className="truncate">{p.full_name}{me && <span className="text-muted font-normal"> (you)</span>}</span><Blink zone={`user:${p.id}`} /></div>
          <div className="text-xs text-muted truncate">{p.designation || "—"}</div>
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            {dept && <span className="pill tone-neutral"><span className="w-1.5 h-1.5 rounded-full" style={{ background: dept.color }} />{dept.name}</span>}
            <RolePill role={p.role} />
          </div>
        </div>
      </Link>
      {p.status_text && <div className="text-xs text-2 truncate">“{p.status_text}”</div>}
      {p.skills.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {p.skills.slice(0, 5).map((s) => <span key={s} className="pill tone-muted">{s}</span>)}
          {p.skills.length > 5 && <span className="pill tone-muted">+{p.skills.length - 5}</span>}
        </div>
      )}
      {!me && (
        <div className="flex items-center gap-1.5 mt-auto pt-1">
          <ChatButton userId={p.id} />
          <AssignTaskButton userId={p.id} />
        </div>
      )}
    </div>
  );
}
