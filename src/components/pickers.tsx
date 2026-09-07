"use client";

import * as React from "react";
import { Select } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { PRIORITIES, PRIORITY_LABEL, TASK_STATUSES, STATUS_LABEL, CLASSIFICATIONS, CLASSIFICATION_LABEL, type TaskPriority, type TaskStatus, type Classification } from "@/lib/utils";

type SelProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & {
  value?: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
};

/** Pick a person from the directory. */
export function PersonPicker({ value, onChange, placeholder = "Unassigned", allowEmpty = true, departmentId, ...rest }: SelProps & { departmentId?: string | null }) {
  const { people, departments } = useSession();
  const list = departmentId ? people.filter((p) => p.department_id === departmentId) : people;
  const grouped = React.useMemo(() => {
    const byDept = new Map<string, typeof list>();
    for (const p of list) {
      const k = p.department_id || "none";
      if (!byDept.has(k)) byDept.set(k, []);
      byDept.get(k)!.push(p);
    }
    return [...byDept.entries()].map(([k, ps]) => ({ name: departments.find((d) => d.id === k)?.name || "No department", people: ps }));
  }, [list, departments]);
  return (
    <Select value={value || ""} onChange={(e) => onChange(e.target.value)} {...rest}>
      {allowEmpty && <option value="">{placeholder}</option>}
      {grouped.map((g) => (
        <optgroup key={g.name} label={g.name}>
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
