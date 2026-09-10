"use client";

import * as React from "react";
import { Select } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { PRIORITIES, PRIORITY_LABEL, TASK_STATUSES, STATUS_LABEL, CLASSIFICATIONS, CLASSIFICATION_LABEL, ROLE_RANK, type RoleLevel, type TaskPriority, type TaskStatus, type Classification } from "@/lib/utils";

type SelProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & {
  value?: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
};

/**
 * Pick a person from the directory.
 *
 * `excludeIds` removes people who must not be choosable at all — an approver cannot be the
 * requester, a mentor cannot be the mentee. Leaving an invalid name in the list and rejecting it
 * on submit only teaches people that the form is broken; the option should not be there.
 *
 * `minRole` keeps the list to people senior enough for the job — a hiring manager or a reporting
 * manager is not an intern, and offering every intern and consultant as "New manager" made the
 * choice look arbitrary. It is a *rank* floor (see `ROLE_RANK`), so `team_lead` also admits
 * managers, department heads, executives and directors — it removes the people who manage nobody
 * (employees, interns, consultants, vendors, guests) without narrowing a legitimate reporting line.
 *
 * `preferDepartmentId` sorts that department's group to the top rather than hiding the rest, because
 * cross-department hiring managers are legitimate — they just should not be the first thing you see.
 */
export function PersonPicker({ value, onChange, placeholder = "Unassigned", allowEmpty = true, departmentId, preferDepartmentId, minRole, excludeIds, ...rest }: SelProps & { departmentId?: string | null; preferDepartmentId?: string | null; minRole?: RoleLevel; excludeIds?: string[] }) {
  const { people, departments } = useSession();
  const byDeptFilter = departmentId ? people.filter((p) => p.department_id === departmentId) : people;
  const ceiling = minRole ? ROLE_RANK[minRole] : null;
  // Never hide the value already selected, or the Select would silently show a blank row.
  const base = ceiling === null ? byDeptFilter : byDeptFilter.filter((p) => p.id === value || ROLE_RANK[p.role] <= ceiling);
  const list = excludeIds?.length ? base.filter((p) => p.id === value || !excludeIds.includes(p.id)) : base;
  const grouped = React.useMemo(() => {
    const byDept = new Map<string, typeof list>();
    for (const p of list) {
      const k = p.department_id || "none";
      if (!byDept.has(k)) byDept.set(k, []);
      byDept.get(k)!.push(p);
    }
    const groups = [...byDept.entries()].map(([k, ps]) => ({ key: k, name: departments.find((d) => d.id === k)?.name || "No department", people: ps }));
    if (preferDepartmentId) groups.sort((a, b) => Number(b.key === preferDepartmentId) - Number(a.key === preferDepartmentId));
    return groups;
  }, [list, departments, preferDepartmentId]);
  return (
    <Select value={value || ""} onChange={(e) => onChange(e.target.value)} {...rest}>
      {allowEmpty && <option value="">{placeholder}</option>}
      {grouped.map((g) => (
        <optgroup key={g.key} label={g.name}>
          {g.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}{p.designation ? ` — ${p.designation}` : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

export function DepartmentPicker({ value, onChange, placeholder = "No department", allowEmpty = true, ...rest }: SelProps) {
  const { departments } = useSession();
  return (
    <Select value={value || ""} onChange={(e) => onChange(e.target.value)} {...rest}>
      {allowEmpty && <option value="">{placeholder}</option>}
      {departments.map((d) => (
        <option key={d.id} value={d.id}>{d.name}</option>
      ))}
    </Select>
  );
}

export function PriorityPicker({ value, onChange, ...rest }: Omit<SelProps, "value" | "onChange"> & { value: TaskPriority; onChange: (v: TaskPriority) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as TaskPriority)} {...rest}>
      {PRIORITIES.map((p) => (
        <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
      ))}
    </Select>
  );
}

export function StatusPicker({ value, onChange, ...rest }: Omit<SelProps, "value" | "onChange"> & { value: TaskStatus; onChange: (v: TaskStatus) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as TaskStatus)} {...rest}>
      {TASK_STATUSES.map((s) => (
        <option key={s} value={s}>{STATUS_LABEL[s]}</option>
      ))}
    </Select>
  );
}

export function ClassificationPicker({ value, onChange, ...rest }: Omit<SelProps, "value" | "onChange"> & { value: Classification; onChange: (v: Classification) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as Classification)} {...rest}>
      {CLASSIFICATIONS.map((c) => (
        <option key={c} value={c}>{CLASSIFICATION_LABEL[c]}</option>
      ))}
    </Select>
  );
}

/** Project picker loads visible projects lazily. */
export function ProjectPicker({ value, onChange, placeholder = "No project", allowEmpty = true, projects, ...rest }: SelProps & { projects?: { id: string; name: string }[] }) {
  const [list, setList] = React.useState<{ id: string; name: string }[]>(projects || []);
  React.useEffect(() => {
    if (projects) return;
    let alive = true;
    import("@/lib/supabase/client").then(({ createClient }) =>
      createClient().from("projects").select("id,name").eq("archived", false).order("name").then(({ data }) => alive && setList(data || []))
    );
    return () => {
      alive = false;
    };
  }, [projects]);
  return (
    <Select value={value || ""} onChange={(e) => onChange(e.target.value)} {...rest}>
      {allowEmpty && <option value="">{placeholder}</option>}
      {list.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </Select>
  );
}
