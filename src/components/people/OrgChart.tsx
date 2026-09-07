"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Avatar } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { cn } from "@/lib/utils";
import type { DirectoryPerson } from "./types";

type Node = { person: DirectoryPerson; children: Node[] };

export function buildTree(people: DirectoryPerson[]): Node[] {
  const ids = new Set(people.map((p) => p.id));
  const byManager = new Map<string, DirectoryPerson[]>();
  const roots: DirectoryPerson[] = [];
  for (const p of people) {
    if (p.manager_id && ids.has(p.manager_id) && p.manager_id !== p.id) {
      if (!byManager.has(p.manager_id)) byManager.set(p.manager_id, []);
      byManager.get(p.manager_id)!.push(p);
    } else roots.push(p);
  }
  const seen = new Set<string>();
  const make = (p: DirectoryPerson): Node => {
    seen.add(p.id);
    return { person: p, children: (byManager.get(p.id) || []).filter((c) => !seen.has(c.id)).map(make) };
  };
  // seniors first
  const rank = (p: DirectoryPerson) => ["super_admin", "director", "executive", "department_head", "manager", "team_lead", "employee", "intern", "consultant", "vendor", "guest"].indexOf(p.role);
  roots.sort((a, b) => rank(a) - rank(b) || a.full_name.localeCompare(b.full_name));
  return roots.map(make);
}

function countDescendants(n: Node): number {
  return n.children.reduce((a, c) => a + 1 + countDescendants(c), 0);
}

function NodeCard({ node, depth }: { node: Node; depth: number }) {
  const { departments } = useSession();
  const [open, setOpen] = React.useState(depth < 2);
  const p = node.person;
  const dept = departments.find((d) => d.id === p.department_id);
  const reports = countDescendants(node);
  return (
    <li className="org-node relative">
      <div className="flex items-center">
        <Link href={`/people/${p.id}`} className="card card-hover flex items-center gap-3 px-3 py-2 min-w-[233px] max-w-[300px]" style={{ borderTopColor: dept?.color, borderTopWidth: 3 }}>
          <Avatar name={p.full_name} src={p.avatar_url} size={34} presence={p.presence} />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{p.full_name}</div>
            <div className="text-[11px] text-muted truncate">{p.designation || "—"}{dept ? ` · ${dept.name}` : ""}</div>
          </div>
        </Link>
        {node.children.length > 0 && (
          <button onClick={() => setOpen((o) => !o)} className="btn btn-ghost btn-xs ml-1 shrink-0" aria-label={open ? "Collapse" : "Expand"}>
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <span className="num">{reports}</span>
          </button>
        )}
      </div>
      {node.children.length > 0 && open && (
        <ul className={cn("org-children ml-[21px] pl-[21px] mt-2 space-y-2 border-l")}>
          {node.children.map((c) => <NodeCard key={c.person.id} node={c} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  );
}

/** Nested, collapsible org chart with CSS connector lines. Scrolls horizontally inside its own container. */
export function OrgChart({ people }: { people: DirectoryPerson[] }) {
  const tree = React.useMemo(() => buildTree(people), [people]);
  return (
    <div className="card p-[var(--s3)] overflow-x-auto">
      <style>{`
        .org-children > .org-node { position: relative; }
        .org-children > .org-node::before { content: ""; position: absolute; left: -21px; top: 22px; width: 18px; height: 1px; background: var(--line-strong); }
      `}</style>
      <ul className="space-y-3 min-w-max">
        {tree.map((n) => <NodeCard key={n.person.id} node={n} depth={0} />)}
      </ul>
    </div>
  );
}
