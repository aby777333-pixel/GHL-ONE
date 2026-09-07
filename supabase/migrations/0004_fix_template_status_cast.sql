-- plpgsql: CASE with two text literals resolves to text, not the enum. Cast the whole CASE.
-- (Full function body re-declared; only the status expression changed.)
create or replace function create_project_from_template(tpl_key text, p_name text, p_owner uuid, p_due date, p_department uuid default null)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  t project_templates%rowtype;
  pid uuid;
  item jsonb;
  i int := 0;
  prev uuid;
  cur uuid;
  offset_days int;
begin
  select * into t from project_templates where key = tpl_key;
  if t.id is null then raise exception 'template % not found', tpl_key; end if;
  insert into projects (org_id, name, description, department_id, owner_id, status, due_date, template_key, created_by)
  values (current_org(), p_name, t.description, coalesce(p_department, (select id from departments where org_id = current_org() and slug = t.department_slug)), p_owner, 'planning', p_due, tpl_key, auth.uid())
  returning id into pid;

  for item in select * from jsonb_array_elements(t.milestones) loop
    insert into milestones (project_id, title, due_date, position)
    values (pid, item->>'title', case when p_due is not null and (item->>'offset_pct') is not null then current_date + ((p_due - current_date) * (item->>'offset_pct')::numeric / 100)::int else null end, i);
    i := i + 1;
  end loop;

  i := 0; prev := null;
  for item in select * from jsonb_array_elements(t.tasks) loop
    offset_days := coalesce((item->>'due_offset_days')::int, null);
    insert into tasks (org_id, project_id, department_id, title, description, owner_id, assignee_id, priority, status, position, created_by, due_date, estimated_hours)
    values (current_org(), pid, (select department_id from projects where id = pid), item->>'title', item->>'description', p_owner, null,
            coalesce((item->>'priority')::task_priority, 'normal'), (case when i = 0 then 'todo' else 'backlog' end)::task_status, i, auth.uid(),
            case when offset_days is not null then (current_date + offset_days)::timestamptz else null end,
            (item->>'estimated_hours')::numeric)
    returning id into cur;
    if coalesce((item->>'depends_on_previous')::boolean, false) and prev is not null then
      insert into task_dependencies (task_id, depends_on_id) values (cur, prev);
      update tasks set status = 'waiting', waiting_on = 'employee', waiting_note = 'Waiting on previous stage' where id = cur;
    end if;
    prev := cur; i := i + 1;
  end loop;
  return pid;
end $$;
