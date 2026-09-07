"use client";

import * as React from "react";
import { CalendarRange } from "lucide-react";
import { TaskListView, type TaskLite } from "@/components/tasks/TaskListView";
import { Gantt } from "@/components/projects/Gantt";
import type { Project, Tables } from "@/lib/utils";

/** Project tasks with list / kanban / timeline views. New tasks are pre-filled with the project. */
export function ProjectTaskBoard({ project, tasks, milestones, departmentId, initialView }: { project: Project; tasks: TaskLite[]; milestones?: Tables<"milestones">[]; departmentId?: string | null; initialView?: string }) {
  const list = React.useMemo(() => {
    const counts = new Map<string, { total: number; done: number }>();
    for (const t of tasks) {
      if (!t.parent_id) continue;
      const c = counts.get(t.parent_id) || { total: 0, done: 0 };
      c.total++;
      if (t.status === "done") c.done++;
      counts.set(t.parent_id, c);
    }
    return tasks.filter((t) => !t.parent_id).map((t) => ({ ...t, subtask_count: counts.get(t.id)?.total, done_count: counts.get(t.id)?.done }));
  }, [tasks]);

  return (
    <TaskListView
      tasks={list}
      showProject={false}
      initialView={initialView || "list"}
      defaults={{ project_id: project.id, department_id: departmentId ?? project.department_id }}
      emptyHint="Break the project into tasks with one responsible person each. Templates can do this for you."
      extraViews={[
        {
          key: "timeline",
          label: "Timeline",
          icon: <CalendarRange size={14} />,
          render: (ts) => <Gantt tasks={ts} milestones={milestones} projectStart={project.start_date} projectDue={project.due_date} />,
        },
      ]}
    />
  );
}
