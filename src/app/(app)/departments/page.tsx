import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { Building2 } from "lucide-react";
import { DepartmentCard, type DepartmentHealth } from "@/components/departments/DepartmentCard";

export const metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  await getSession();
  const supabase = await createClient();
  const [{ data: health }, { data: departments }] = await Promise.all([
    supabase.rpc("department_health"),
    supabase.from("departments").select("id,head_id,description,icon,position").order("position"),
  ]);
  const meta = new Map((departments || []).map((d) => [d.id, d]));
  const rows: DepartmentHealth[] = (health || []).map((h) => ({ ...h, head_id: meta.get(h.department_id)?.head_id || null, description: meta.get(h.department_id)?.description || null }));
  const totals = rows.reduce((a, r) => ({ people: a.people + r.people, open: a.open + r.open_tasks, overdue: a.overdue + r.overdue }), { people: 0, open: 0, overdue: 0 });

  return (
    <div className="page">
      <PageHeader eyebrow="Company" title="Departments" subtitle={`${rows.length} departments · ${totals.people} people · ${totals.open} open tasks${totals.overdue ? ` · ${totals.overdue} overdue` : ""}`} />
      {rows.length === 0 ? (
        <div className="card"><EmptyState icon={<Building2 size={18} />} title="No departments" hint="Departments are set up by an admin under Admin → Organisation." /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 stagger">
          {rows.map((r) => <DepartmentCard key={r.department_id} d={r} />)}
        </div>
      )}
    </div>
  );
}
