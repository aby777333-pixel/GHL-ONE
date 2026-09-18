-- 0067 — the organisational brain, as relationships rather than a graph engine (§4)
--
-- §4 asks Buddy to reason across People ↔ Departments ↔ Projects ↔ Tasks ↔ Meetings ↔ Documents ↔
-- Decisions, and names the test: *"Why is this project delayed?"* — it should not search for the
-- word "delayed", it should reason across tasks, dependencies, approvals and deadlines.
--
-- WHAT WAS ACTUALLY THERE: `related_to(entity, eid)` handled exactly one entity, `project`, and
-- returned `{}` for everything else. The traversal the brief describes existed as a stub.
--
-- WHY NOT A GRAPH ENGINE: these relationships are already modelled as foreign keys, and every one
-- of them has a permission predicate attached (`can_view_project`, `can_view_task`, the scope
-- functions from 0047/0049). A separate graph store would be a second copy of the truth with none
-- of those checks — which is the classic way an "organisational brain" becomes a way around RLS.
-- These are typed neighbourhood queries instead: each branch gates first, then reads.
--
-- The `project` branch is byte-identical to what it was. Everything else is new.

create or replace function related_to(entity text, eid uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $function$
declare r jsonb := '{}'::jsonb;
begin
  if entity = 'project' then
    if not can_view_project(eid) then return r; end if;
    r := jsonb_build_object(
      'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'status', status, 'priority', priority, 'due_date', due_date, 'assignee_id', assignee_id)), '[]') from tasks where project_id = eid and parent_id is null),
      'files', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'version', current_version, 'updated_at', updated_at)), '[]') from files where project_id = eid),
      'decisions', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'decided_at', decided_at)), '[]') from decisions where project_id = eid),
      'meetings', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'starts_at', starts_at)), '[]') from meetings where project_id = eid),
      'approvals', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'status', status)), '[]') from approvals where project_id = eid),
      'channel', (select id from channels where project_id = eid and type = 'project' limit 1)
    );

  elsif entity = 'task' then
    if not can_view_task(eid) then return r; end if;
    r := jsonb_build_object(
      'task', (select jsonb_build_object('id', id, 'title', title, 'status', status, 'priority', priority, 'due_date', due_date,
                                         'assignee_id', assignee_id, 'owner_id', owner_id, 'project_id', project_id,
                                         'department_id', department_id, 'waiting_on', waiting_on, 'waiting_on_user_id', waiting_on_user_id)
                 from tasks where id = eid),
      'subtasks', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'status', status)), '[]') from tasks where parent_id = eid),
      'depends_on', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status)), '[]')
                       from task_dependencies d join tasks t on t.id = d.depends_on_id where d.task_id = eid),
      'blocks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status)), '[]')
                   from task_dependencies d join tasks t on t.id = d.task_id where d.depends_on_id = eid),
      'approvals', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'status', status, 'approver_id', approver_id)), '[]') from approvals where task_id = eid),
      'decisions', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title)), '[]') from decisions where id in (select source_decision_id from tasks where id = eid and source_decision_id is not null))
    );

  elsif entity = 'person' then
    if not is_active_member() then return r; end if;
    if not exists (select 1 from profiles p where p.id = eid and p.org_id = current_org()) then return r; end if;
    r := jsonb_build_object(
      'person', (select jsonb_build_object('id', id, 'name', full_name, 'designation', designation, 'department_id', department_id,
                                           'manager_id', manager_id, 'role', role)
                   from profiles where id = eid),
      'manager', (select jsonb_build_object('id', m.id, 'name', m.full_name) from profiles p join profiles m on m.id = p.manager_id where p.id = eid),
      'reports', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', full_name)), '[]') from profiles where manager_id = eid and is_active),
      'department', (select jsonb_build_object('id', d.id, 'name', d.name, 'head_id', d.head_id) from departments d join profiles p on p.department_id = d.id where p.id = eid),
      'projects', (select coalesce(jsonb_agg(distinct jsonb_build_object('id', pr.id, 'name', pr.name)), '[]')
                     from project_members pm join projects pr on pr.id = pm.project_id
                    where pm.user_id = eid and can_view_project(pr.id)),
      -- `responsibilities` names what it tracks in `name`; an earlier draft said `area`, which does
      -- not exist and raised for every caller of this branch.
      'responsibilities', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'critical', critical)), '[]')
                             from responsibilities where owner_id = eid)
    );

  elsif entity = 'department' then
    if not is_active_member() then return r; end if;
    if not exists (select 1 from departments d where d.id = eid and d.org_id = current_org()) then return r; end if;
    r := jsonb_build_object(
      'department', (select jsonb_build_object('id', id, 'name', name, 'slug', slug, 'status', status, 'head_id', head_id, 'on_duty_user_id', on_duty_user_id) from departments where id = eid),
      'people', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'designation', designation)), '[]') from profiles where department_id = eid and is_active),
      'projects', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'status', status)), '[]') from projects where department_id = eid and can_view_project(id)),
      'open_requests', (select count(*) from help_requests where department_id = eid and status not in ('completed','declined')),
      'services', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name)), '[]') from service_catalog where department_id = eid and active)
    );

  elsif entity = 'decision' then
    -- Decisions have no `can_view_decision`; gate through the project that owns one, and require
    -- the caller's own company for a company-wide one.
    if not exists (
      select 1 from decisions d
       where d.id = eid and d.org_id = current_org()
         and (d.project_id is null or can_view_project(d.project_id))
    ) then return r; end if;
    r := jsonb_build_object(
      'decision', (select jsonb_build_object('id', id, 'title', title, 'decision', decision, 'reason', reason, 'decided_at', decided_at,
                                             'decided_by', decided_by, 'project_id', project_id, 'status', status, 'superseded_by', superseded_by)
                     from decisions where id = eid),
      'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'status', status)), '[]') from tasks where source_decision_id = eid),
      'supersedes', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title)), '[]') from decisions where superseded_by = eid)
    );
  end if;
  return r;
end $function$;

-- "Why is this project delayed?" — the question §4 names.
--
-- It returns **evidence, never a verdict**: what is late and by how many days, what is waiting and
-- on whom, which approvals have been sitting and for how long, what is unassigned, when anything
-- last moved. Buddy narrates the cause from these facts and must mark the causal part as inference
-- — which is the honest division of labour, because the database knows that a task is eleven days
-- late and cannot know why.
create or replace function why_delayed(p_project uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_res jsonb;
begin
  if not can_view_project(p_project) then
    return jsonb_build_object('allowed', false);
  end if;

  select jsonb_build_object(
    'allowed', true,
    'project', (select jsonb_build_object('id', id, 'name', name, 'status', status, 'due_date', due_date, 'progress', progress, 'owner_id', owner_id) from projects where id = p_project),
    'last_movement', (select max(greatest(coalesce(updated_at, created_at), created_at)) from tasks where project_id = p_project),
    'counts', (select jsonb_build_object(
                 'open', count(*) filter (where status not in ('done','cancelled')),
                 'overdue', count(*) filter (where status not in ('done','cancelled') and due_date is not null and due_date < now()),
                 'blocked', count(*) filter (where status in ('blocked','waiting')),
                 'unassigned', count(*) filter (where status not in ('done','cancelled') and assignee_id is null),
                 'done', count(*) filter (where status = 'done'))
               from tasks where project_id = p_project),
    'overdue_tasks', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'assignee', person_name(assignee_id),
                                          'days_late', extract(day from now() - due_date)::int, 'priority', priority)
             order by due_date)
        from (select * from tasks where project_id = p_project and status not in ('done','cancelled')
                and due_date is not null and due_date < now() order by due_date limit 8) a), '[]'::jsonb),
    'stuck_tasks', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'status', status,
                                          'waiting_on', person_name(waiting_on_user_id), 'note', waiting_note,
                                          'days_still', extract(day from now() - updated_at)::int)
             order by updated_at)
        from (select * from tasks where project_id = p_project and status in ('blocked','waiting')
              order by updated_at limit 8) b), '[]'::jsonb),
    'pending_approvals', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'approver', person_name(approver_id),
                                          'days_waiting', extract(day from now() - created_at)::int)
             order by created_at)
        from (select * from approvals where project_id = p_project and status = 'pending'
              order by created_at limit 8) c), '[]'::jsonb),
    'milestones_late', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'due_date', due_date))
        from milestones where project_id = p_project and completed_at is null and due_date is not null and due_date < current_date), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;

revoke all on function why_delayed(uuid) from public, anon;
grant execute on function why_delayed(uuid) to authenticated;
