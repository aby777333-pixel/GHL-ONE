-- Phase 4 wave 2: HR & people operations — executable SOP workflows (onboarding/offboarding/transfer/promotion/probation),
-- transfers & role changes, assets, employee documents, GHL Academy, skills & endorsements, goals, 1-on-1s, feedback,
-- recognition, suggestions, internal jobs + ATS, mentorship, shift handover, incidents (war room), urgent assistance.

-- ---------------------------------------------------------------------------
-- WORKFLOWS (SOPs that execute)
-- ---------------------------------------------------------------------------
create table workflow_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  kind text not null default 'custom',      -- onboarding | offboarding | transfer | promotion | probation | incident | custom
  steps jsonb not null default '[]'::jsonb, -- [{key,title,description,owner:'hr'|'it'|'admin'|'manager'|'employee'|'department_head'|'primary_admin'|'department:<slug>'|'user:<id>',depends_on:[key],due_days:int,priority}]
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, key)
);
create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  template_id uuid references workflow_templates(id) on delete set null,
  kind text not null,
  subject_user_id uuid references profiles(id) on delete set null,
  subject_label text not null,
  started_by uuid references profiles(id) on delete set null,
  status text not null default 'running',   -- running | completed | cancelled
  context jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create table workflow_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references workflow_runs(id) on delete cascade,
  key text not null,
  title text not null,
  description text,
  department_id uuid references departments(id) on delete set null,
  owner_id uuid references profiles(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  status text not null default 'pending',   -- pending | ready | in_progress | done | skipped
  depends_on text[] not null default '{}',
  due_date timestamptz,
  position int not null default 0,
  completed_at timestamptz,
  unique (run_id, key)
);
create index workflow_steps_task_idx on workflow_steps(task_id);

create or replace function resolve_step_owner(p_owner text, p_subject uuid, p_org uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare d departments%rowtype; r uuid; v_slug text;
begin
  if p_owner is null then return null; end if;
  if p_owner like 'user:%' then return substr(p_owner, 6)::uuid; end if;
  if p_owner = 'employee' then return p_subject; end if;
  if p_owner = 'manager' then select manager_id into r from profiles where id = p_subject; return coalesce(r, (select (settings->>'primary_admin_id')::uuid from organizations where id = p_org)); end if;
  if p_owner = 'department_head' then select d2.head_id into r from profiles p join departments d2 on d2.id = p.department_id where p.id = p_subject; return r; end if;
  if p_owner = 'primary_admin' then return (select (settings->>'primary_admin_id')::uuid from organizations where id = p_org); end if;
  v_slug := case p_owner when 'hr' then 'hr' when 'it' then 'technology' when 'admin' then 'admin' else replace(p_owner, 'department:', '') end;
  select * into d from departments where org_id = p_org and departments.slug = v_slug;
  if d.id is null then return (select (settings->>'primary_admin_id')::uuid from organizations where id = p_org); end if;
  r := coalesce(d.on_duty_user_id, d.head_id, (select id from profiles where department_id = d.id and is_active order by role_rank(role) limit 1), (select (settings->>'primary_admin_id')::uuid from organizations where id = p_org));
  return r;
end $$;

create or replace function resolve_step_department(p_owner text, p_subject uuid, p_org uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case
    when p_owner in ('employee','manager','department_head') then (select department_id from profiles where id = p_subject)
    when p_owner = 'hr' then (select id from departments where org_id = p_org and slug = 'hr')
    when p_owner = 'it' then (select id from departments where org_id = p_org and slug = 'technology')
    when p_owner = 'admin' then (select id from departments where org_id = p_org and slug = 'admin')
    when p_owner like 'department:%' then (select id from departments where org_id = p_org and slug = replace(p_owner, 'department:', ''))
    else null end
$$;

/** Create the task for a ready step and mark it ready. */
create or replace function workflow_release_step(p_step uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s workflow_steps%rowtype; r workflow_runs%rowtype; tid uuid;
begin
  select * into s from workflow_steps where id = p_step;
  select * into r from workflow_runs where id = s.run_id;
  if s.status <> 'pending' then return; end if;
  insert into tasks (org_id, title, description, department_id, assignee_id, owner_id, created_by, status, priority, due_date, tags)
  values (r.org_id, s.title || ' — ' || r.subject_label, coalesce(s.description, '') || E'\n\nWorkflow: ' || r.kind || ' for ' || r.subject_label || ' [/admin?tab=workflows&run=' || r.id || ']',
          s.department_id, s.owner_id, coalesce(r.started_by, s.owner_id), coalesce(r.started_by, s.owner_id), 'todo', 'high', s.due_date, array['workflow', r.kind])
  returning id into tid;
  update workflow_steps set task_id = tid, status = 'ready' where id = p_step;
end $$;

create or replace function start_workflow(p_template_key text, p_subject uuid, p_context jsonb default '{}'::jsonb, p_label text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare t workflow_templates%rowtype; v_run uuid; st jsonb; i int := 0; o uuid := current_org(); lbl text; deps text[];
begin
  select * into t from workflow_templates where org_id = o and key = p_template_key and active;
  if t.id is null then raise exception 'workflow template % not found', p_template_key; end if;
  if not (is_manager_plus() or has_admin_perm('hr.manage') or has_admin_perm('people.manage')) then raise exception 'forbidden'; end if;
  lbl := coalesce(p_label, person_name(p_subject), 'Unnamed');
  insert into workflow_runs (org_id, template_id, kind, subject_user_id, subject_label, started_by, context) values (o, t.id, t.kind, p_subject, lbl, auth.uid(), p_context) returning id into v_run;
  for st in select * from jsonb_array_elements(t.steps) loop
    i := i + 1;
    deps := coalesce(array(select jsonb_array_elements_text(coalesce(st->'depends_on', '[]'::jsonb))), '{}');
    insert into workflow_steps (run_id, key, title, description, department_id, owner_id, status, depends_on, due_date, position)
    values (v_run, st->>'key', st->>'title', st->>'description', resolve_step_department(st->>'owner', p_subject, o), resolve_step_owner(st->>'owner', p_subject, o), 'pending', deps,
            now() + (coalesce((st->>'due_days')::int, 3) * interval '1 day'), i);
  end loop;
  perform workflow_release_step(w.id) from workflow_steps w where w.run_id = v_run and cardinality(w.depends_on) = 0;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value) values (o, auth.uid(), 'workflow.started', 'workflow_run', v_run, t.name || ': ' || lbl, p_context);
  return v_run;
end $$;

/** When a workflow task completes → step done → dependents released; run completes when all steps are done/skipped. */
create or replace function workflow_task_done() returns trigger
language plpgsql security definer set search_path = public as $$
declare s workflow_steps%rowtype; nxt record;
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    select * into s from workflow_steps where task_id = new.id;
    if s.id is null then return null; end if;
    update workflow_steps set status = 'done', completed_at = now() where id = s.id;
    for nxt in select w.* from workflow_steps w where w.run_id = s.run_id and w.status = 'pending'
                 and not exists (select 1 from unnest(w.depends_on) d where d not in (select key from workflow_steps where run_id = s.run_id and status in ('done','skipped'))) loop
      perform workflow_release_step(nxt.id);
    end loop;
    if not exists (select 1 from workflow_steps where run_id = s.run_id and status not in ('done','skipped')) then
      update workflow_runs set status = 'completed', completed_at = now() where id = s.run_id;
    end if;
  end if;
  return null;
end $$;
create trigger tasks_workflow_done after update on tasks for each row execute function workflow_task_done();

create or replace function skip_workflow_step(p_step uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s workflow_steps%rowtype; nxt record;
begin
  select * into s from workflow_steps where id = p_step;
  if not (is_manager_plus() or has_admin_perm('hr.manage') or s.owner_id = auth.uid()) then raise exception 'forbidden'; end if;
  update workflow_steps set status = 'skipped', completed_at = now() where id = p_step;
  if s.task_id is not null then update tasks set status = 'cancelled' where id = s.task_id and status not in ('done','cancelled'); end if;
  for nxt in select w.* from workflow_steps w where w.run_id = s.run_id and w.status = 'pending'
               and not exists (select 1 from unnest(w.depends_on) d where d not in (select key from workflow_steps where run_id = s.run_id and status in ('done','skipped'))) loop
    perform workflow_release_step(nxt.id);
  end loop;
  if not exists (select 1 from workflow_steps where run_id = s.run_id and status not in ('done','skipped')) then
    update workflow_runs set status = 'completed', completed_at = now() where id = s.run_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- TRANSFERS, ROLE CHANGES, PROBATION, OFFBOARDING
-- ---------------------------------------------------------------------------
create table employee_transfers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  from_department_id uuid references departments(id) on delete set null,
  to_department_id uuid not null references departments(id) on delete cascade,
  from_manager_id uuid references profiles(id) on delete set null,
  to_manager_id uuid references profiles(id) on delete set null,
  to_team_id uuid references teams(id) on delete set null,
  effective_on date not null default current_date,
  reason text,
  status text not null default 'proposed',  -- proposed | approved | applied | cancelled
  requested_by uuid references profiles(id) on delete set null,
  approved_by uuid references profiles(id) on delete set null,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
create table role_changes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  old_role role_level, new_role role_level not null,
  old_designation text, new_designation text,
  new_manager_id uuid references profiles(id) on delete set null,
  effective_on date not null default current_date,
  reason text,
  status text not null default 'proposed',  -- proposed | applied | cancelled
  requested_by uuid references profiles(id) on delete set null,
  applied_by uuid references profiles(id) on delete set null,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);
create table probation_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  review_date date not null,
  reviewer_id uuid references profiles(id) on delete set null,
  goals jsonb not null default '[]'::jsonb,   -- [{title, met: bool|null, note}]
  notes text,
  status text not null default 'pending',     -- pending | confirmed | extended | not_confirmed
  extended_to date,
  decided_at timestamptz,
  decided_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function apply_transfer(p_transfer uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t employee_transfers%rowtype; o uuid;
begin
  select * into t from employee_transfers where id = p_transfer;
  if t.id is null then raise exception 'not found'; end if;
  if not (is_admin() or has_admin_perm('hr.manage') or has_admin_perm('people.manage')) then raise exception 'forbidden'; end if;
  o := t.org_id;
  update profiles set department_id = t.to_department_id, manager_id = coalesce(t.to_manager_id, manager_id), team_id = t.to_team_id where id = t.user_id;
  -- old department-open rooms out, new department rooms in; department-scoped grants revoked (permission review)
  delete from channel_members cm using channels c where cm.channel_id = c.id and cm.user_id = t.user_id and c.type = 'department' and c.department_id = t.from_department_id;
  insert into channel_members (channel_id, user_id) select c.id, t.user_id from channels c where c.type = 'department' and c.department_id = t.to_department_id and not c.archived on conflict do nothing;
  update access_grants set revoked_at = now(), revoked_by = auth.uid() where user_id = t.user_id and resource_type = 'department' and resource_id = t.from_department_id and revoked_at is null;
  update employee_transfers set status = 'applied', applied_at = now(), approved_by = coalesce(approved_by, auth.uid()) where id = p_transfer;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, old_value, new_value)
  values (o, auth.uid(), 'people.transferred', 'profile', t.user_id, person_name(t.user_id) || ' → ' || (select name from departments where id = t.to_department_id), jsonb_build_object('department_id', t.from_department_id, 'manager_id', t.from_manager_id), jsonb_build_object('department_id', t.to_department_id, 'manager_id', t.to_manager_id));
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
  values (t.user_id, 'information', 'You have moved to ' || (select name from departments where id = t.to_department_id), coalesce(t.reason, ''), '/people/' || t.user_id, 'profile', t.user_id, auth.uid());
  if exists (select 1 from workflow_templates where org_id = o and key = 'transfer' and active) then perform start_workflow('transfer', t.user_id, jsonb_build_object('transfer_id', t.id)); end if;
end $$;

create or replace function apply_role_change(p_change uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c role_changes%rowtype;
begin
  select * into c from role_changes where id = p_change;
  if c.id is null then raise exception 'not found'; end if;
  if not (is_admin() or has_admin_perm('hr.manage')) then raise exception 'forbidden'; end if;
  if c.new_role = 'super_admin' and not is_primary_admin() then raise exception 'only the primary admin can grant super_admin'; end if;
  update profiles set role = c.new_role, designation = coalesce(c.new_designation, designation), manager_id = coalesce(c.new_manager_id, manager_id) where id = c.user_id;
  update role_changes set status = 'applied', applied_at = now(), applied_by = auth.uid() where id = p_change;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, old_value, new_value)
  values (c.org_id, auth.uid(), 'people.role_changed', 'profile', c.user_id, person_name(c.user_id) || ': ' || coalesce(c.old_role::text,'?') || ' → ' || c.new_role::text, jsonb_build_object('role', c.old_role, 'designation', c.old_designation), jsonb_build_object('role', c.new_role, 'designation', c.new_designation));
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
  values (c.user_id, 'information', 'Your role is now ' || coalesce(c.new_designation, c.new_role::text), coalesce(c.reason, ''), '/people/' || c.user_id, 'profile', c.user_id, auth.uid());
end $$;

/** Move all open work from one person to another (used by offboarding and long leave). */
create or replace function transfer_work(p_from uuid, p_to uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_tasks int; n_projects int; n_files int; n_approvals int; n_requests int;
begin
  if not (is_manager_plus() or has_admin_perm('hr.manage') or has_admin_perm('people.manage')) then raise exception 'forbidden'; end if;
  update tasks set assignee_id = p_to where assignee_id = p_from and status not in ('done','cancelled'); get diagnostics n_tasks = row_count;
  update projects set owner_id = p_to where owner_id = p_from and not archived and status not in ('completed','cancelled'); get diagnostics n_projects = row_count;
  update files set owner_id = p_to where owner_id = p_from; get diagnostics n_files = row_count;
  update approvals set approver_id = p_to, delegated_from = p_from where approver_id = p_from and status = 'pending'; get diagnostics n_approvals = row_count;
  update help_requests set owner_id = p_to where owner_id = p_from and status in ('new','accepted','working','waiting'); get diagnostics n_requests = row_count;
  update channels set owner_id = p_to where owner_id = p_from and not archived;
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
  values (p_to, 'action_required', 'Work transferred to you from ' || person_name(p_from), n_tasks || ' tasks, ' || n_projects || ' projects, ' || n_approvals || ' approvals, ' || n_requests || ' requests' || coalesce(' · ' || p_reason, ''), '/my-work', 'profile', p_from, auth.uid());
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value)
  values (current_org(), auth.uid(), 'people.work_transferred', 'profile', p_from, person_name(p_from) || ' → ' || person_name(p_to), jsonb_build_object('tasks', n_tasks, 'projects', n_projects, 'files', n_files, 'approvals', n_approvals, 'requests', n_requests, 'reason', p_reason));
  return jsonb_build_object('tasks', n_tasks, 'projects', n_projects, 'files', n_files, 'approvals', n_approvals, 'requests', n_requests);
end $$;

/** One-click structured exit: transfer work, revoke everywhere (disables the account), start the offboarding workflow for the human steps. */
create or replace function offboard_user(p_user uuid, p_transfer_to uuid, p_reason text, p_last_day date default current_date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare moved jsonb; revoked jsonb; run uuid; mgr uuid;
begin
  if not (is_primary_admin() or has_admin_perm('hr.manage') or has_admin_perm('security.manage')) then raise exception 'forbidden'; end if;
  select manager_id into mgr from profiles where id = p_user;
  moved := transfer_work(p_user, coalesce(p_transfer_to, mgr, auth.uid()), 'Offboarding');
  run := start_workflow('offboarding', p_user, jsonb_build_object('reason', p_reason, 'last_day', p_last_day, 'transfer_to', coalesce(p_transfer_to, mgr)));
  if p_last_day <= current_date then revoked := revoke_everywhere(p_user, 'Offboarding: ' || coalesce(p_reason, '')); end if;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value)
  values (current_org(), auth.uid(), 'people.offboarded', 'profile', p_user, person_name(p_user), jsonb_build_object('reason', p_reason, 'last_day', p_last_day, 'moved', moved, 'revoked', revoked));
  return jsonb_build_object('run_id', run, 'moved', moved, 'revoked', revoked);
end $$;

/** Probation reminders (cron daily): 7 days before probation ends, create the review + notify manager and HR. */
create or replace function probation_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare p record; n int := 0; hr uuid;
begin
  for p in select * from profiles where is_active and probation_ends_on is not null and probation_ends_on between current_date and current_date + 7
             and not exists (select 1 from probation_reviews r where r.user_id = profiles.id and r.status = 'pending') loop
    insert into probation_reviews (org_id, user_id, review_date, reviewer_id) values (p.org_id, p.id, p.probation_ends_on, p.manager_id);
    if p.manager_id is not null then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id)
      values (p.manager_id, 'action_required', 'Probation review due: ' || p.full_name, 'Probation ends ' || to_char(p.probation_ends_on, 'DD Mon') || '. Complete the review.', '/admin?tab=hr&view=probation', 'profile', p.id);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- ASSETS & DOCUMENTS
-- ---------------------------------------------------------------------------
create table assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  tag text not null,
  kind text not null default 'other',       -- laptop | phone | sim | monitor | access_card | camera | license | peripheral | other
  name text not null,
  serial text,
  status text not null default 'available', -- available | assigned | repair | retired
  notes text,
  purchased_on date,
  created_at timestamptz not null default now(),
  unique (org_id, tag)
);
create table asset_assignments (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  assigned_by uuid references profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  returned_at timestamptz,
  condition_note text
);
create index asset_assignments_user_idx on asset_assignments(user_id) where returned_at is null;
create table asset_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  details text not null,
  justification text,
  status text not null default 'pending',   -- pending | approved | rejected | fulfilled
  approver_id uuid references profiles(id) on delete set null,
  decision_note text,
  asset_id uuid references assets(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create or replace function asset_assignment_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update assets set status = 'assigned' where id = new.asset_id;
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (new.user_id, 'information', 'Asset assigned to you: ' || (select name from assets where id = new.asset_id), coalesce(new.condition_note, ''), '/people/' || new.user_id || '?tab=assets', 'asset', new.asset_id, new.assigned_by);
  elsif new.returned_at is not null and old.returned_at is null then
    update assets set status = 'available' where id = new.asset_id;
  end if;
  return null;
end $$;
create trigger asset_assignments_sync after insert or update on asset_assignments for each row execute function asset_assignment_sync();
create or replace function asset_request_route() returns trigger
language plpgsql security definer set search_path = public as $$
declare mgr uuid; it uuid;
begin
  if tg_op = 'INSERT' then
    select manager_id into mgr from profiles where id = new.user_id;
    select coalesce(on_duty_user_id, head_id) into it from departments where org_id = new.org_id and slug = 'technology';
    new.approver_id := coalesce(new.approver_id, mgr, it, (select (settings->>'primary_admin_id')::uuid from organizations where id = new.org_id));
    if new.approver_id is not null then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (new.approver_id, 'approval', 'Equipment request: ' || new.kind || ' — ' || person_name(new.user_id), left(new.details, 140), '/admin?tab=hr&view=assets', 'asset_request', new.id, new.user_id);
    end if;
  elsif new.status is distinct from old.status then
    new.decided_at := coalesce(new.decided_at, now());
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (new.user_id, 'information', 'Equipment request ' || new.status || ': ' || new.kind, coalesce(new.decision_note, ''), '/people/' || new.user_id || '?tab=assets', 'asset_request', new.id, auth.uid());
  end if;
  return new;
end $$;
create trigger asset_requests_route before insert or update on asset_requests for each row execute function asset_request_route();

create table employee_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'other',       -- offer_letter | contract | id_proof | certificate | policy_ack | payslip | letter | other
  name text not null,
  storage_path text not null,               -- bucket 'hr'
  size_bytes bigint,
  mime_type text,
  uploaded_by uuid references profiles(id) on delete set null,
  visible_to_employee boolean not null default true,
  created_at timestamptz not null default now()
);
insert into storage.buckets (id, name, public) values ('hr', 'hr', false) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- GHL ACADEMY
-- ---------------------------------------------------------------------------
create table courses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  description text,
  department_ids uuid[],                    -- null = everyone
  level text not null default 'basic',      -- basic | intermediate | advanced
  duration_minutes int,
  cover_url text,
  status text not null default 'draft',     -- draft | published | archived
  mandatory boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger courses_updated_at before update on courses for each row execute function set_updated_at();
create table lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  position int not null default 0,
  title text not null,
  kind text not null default 'text',        -- text | video | document | sop | quiz
  content text,                             -- markdown (text/sop) or video/document URL
  quiz jsonb,                               -- [{q, options:[..], answer:int}] pass_mark in course? use 70%
  wiki_page_id uuid references wiki_pages(id) on delete set null,
  file_id uuid references files(id) on delete set null,
  duration_minutes int
);
create table enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  assigned_by uuid references profiles(id) on delete set null,
  due_on date,
  status text not null default 'assigned',  -- assigned | in_progress | completed
  progress int not null default 0,
  score int,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (course_id, user_id)
);
create table lesson_progress (
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  score int,
  primary key (enrollment_id, lesson_id)
);
create or replace function lesson_progress_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare total int; done int; e enrollments%rowtype; avg_score int;
begin
  select * into e from enrollments where id = new.enrollment_id;
  select count(*) into total from lessons where course_id = e.course_id;
  select count(*), avg(score)::int into done, avg_score from lesson_progress where enrollment_id = e.id;
  update enrollments set progress = case when total = 0 then 100 else (done * 100 / total) end,
                         status = case when total > 0 and done >= total then 'completed' else 'in_progress' end,
                         score = avg_score,
                         completed_at = case when total > 0 and done >= total then coalesce(completed_at, now()) else completed_at end
   where id = e.id;
  if total > 0 and done >= total and e.completed_at is null then
    insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary) values (current_org(), e.user_id, 'training.completed', 'course', e.course_id, (select title from courses where id = e.course_id));
    if e.assigned_by is not null and e.assigned_by <> e.user_id then
      insert into notifications (user_id, kind, title, link, entity_type, entity_id, actor_id) values (e.assigned_by, 'information', person_name(e.user_id) || ' completed ' || (select title from courses where id = e.course_id), '/academy/' || e.course_id, 'course', e.course_id, e.user_id);
    end if;
  end if;
  return null;
end $$;
create trigger lesson_progress_sync after insert on lesson_progress for each row execute function lesson_progress_sync();
create or replace function enrollment_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_by is not null and new.assigned_by <> new.user_id then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (new.user_id, 'action_required', 'Training assigned: ' || (select title from courses where id = new.course_id), case when new.due_on is not null then 'Complete by ' || to_char(new.due_on, 'DD Mon') else null end, '/academy/' || new.course_id, 'course', new.course_id, new.assigned_by);
  end if;
  return null;
end $$;
create trigger enrollments_notify after insert on enrollments for each row execute function enrollment_notify();

-- ---------------------------------------------------------------------------
-- SKILLS, GOALS, 1-ON-1s, FEEDBACK, RECOGNITION, SUGGESTIONS, JOBS/ATS, MENTORSHIP
-- ---------------------------------------------------------------------------
create table skill_endorsements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  skill text not null,
  endorsed_by uuid not null references profiles(id) on delete cascade,
  level int check (level between 1 and 5),
  verified boolean not null default false,  -- true when endorsed by manager/lead
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, skill, endorsed_by)
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  level text not null,                      -- company | department | team | employee
  parent_id uuid references goals(id) on delete set null,
  title text not null,
  description text,
  owner_id uuid references profiles(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  team_id uuid references teams(id) on delete set null,
  period text,                              -- e.g. Q4 2026
  status text not null default 'active',    -- active | done | dropped
  progress int not null default 0,
  due_on date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger goals_updated_at before update on goals for each row execute function set_updated_at();
create table goal_tasks (goal_id uuid references goals(id) on delete cascade, task_id uuid references tasks(id) on delete cascade, primary key (goal_id, task_id));

create table one_on_ones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  manager_id uuid not null references profiles(id) on delete cascade,
  employee_id uuid not null references profiles(id) on delete cascade,
  scheduled_at timestamptz not null,
  recurrence text,                          -- weekly | biweekly | monthly | null
  agenda jsonb not null default '[]'::jsonb,        -- [{text, by, done}]
  notes text,
  action_items jsonb not null default '[]'::jsonb,  -- [{text, owner_id, done}]
  status text not null default 'scheduled', -- scheduled | done | skipped
  meeting_id uuid references meetings(id) on delete set null,
  created_at timestamptz not null default now()
);

create table feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  from_user_id uuid not null references profiles(id) on delete cascade,
  to_user_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'peer',        -- manager | peer | project | self
  project_id uuid references projects(id) on delete set null,
  body text not null,
  visibility text not null default 'recipient',   -- recipient | manager | hr
  created_at timestamptz not null default now()
);

create table kudos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  from_user_id uuid not null references profiles(id) on delete cascade,
  to_user_id uuid not null references profiles(id) on delete cascade,
  category text not null default 'great_work',    -- great_work | team_contribution | problem_solving | project_delivery | cross_department_help
  message text not null,
  public boolean not null default true,
  created_at timestamptz not null default now()
);
create or replace function kudos_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare wins uuid;
begin
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
  values (new.to_user_id, 'information', person_name(new.from_user_id) || ' recognised you: ' || replace(new.category, '_', ' '), new.message, '/people/' || new.to_user_id, 'kudos', new.id, new.from_user_id);
  if new.public then
    select id into wins from channels where org_id = new.org_id and slug = 'wins' limit 1;
    if wins is not null then
      insert into messages (channel_id, author_id, kind, body) values (wins, new.from_user_id, 'text', '🏆 **' || replace(new.category, '_', ' ') || '** — ' || person_name(new.to_user_id) || E'\n' || new.message);
    end if;
  end if;
  return null;
end $$;
create trigger kudos_after_insert after insert on kudos for each row execute function kudos_after_insert();

create table suggestions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  anonymous boolean not null default false,
  kind text not null default 'process',     -- process | tool | workplace | other
  title text not null,
  body text,
  status text not null default 'new',       -- new | reviewing | accepted | declined
  response text,
  responded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table job_openings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  department_id uuid references departments(id) on delete set null,
  description text,
  internal boolean not null default true,   -- internal job board vs external hiring
  external boolean not null default false,
  status text not null default 'open',      -- open | closed
  hiring_manager_id uuid references profiles(id) on delete set null,
  closes_on date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table internal_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references job_openings(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  note text,
  status text not null default 'applied',   -- applied | shortlisted | interview | selected | rejected | withdrawn
  created_at timestamptz not null default now(),
  unique (job_id, user_id)
);
create table candidates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  job_id uuid references job_openings(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  resume_path text,                         -- bucket 'hr'
  source text,
  stage text not null default 'applicant',  -- applicant | screening | interview | practical_test | offer | hired | rejected
  rating int check (rating between 1 and 5),
  notes text,
  owner_id uuid references profiles(id) on delete set null,
  hired_profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger candidates_updated_at before update on candidates for each row execute function set_updated_at();
create table interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references candidates(id) on delete cascade,
  kind text not null default 'interview',   -- screening | interview | practical_test | final
  scheduled_at timestamptz not null,
  panel uuid[] not null default '{}',
  meeting_link text,
  notes text,
  scores jsonb not null default '{}'::jsonb,        -- {user_id: {score, note}}
  decision text,                            -- advance | hold | reject
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
/** Hire: candidate → employee. Creates the invite (pre-activated account on signup) — no duplicate data entry. */
create or replace function hire_candidate(p_candidate uuid, p_role role_level default 'employee', p_designation text default null, p_manager uuid default null, p_department uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare c candidates%rowtype; inv uuid; dept uuid;
begin
  if not (is_admin() or has_admin_perm('hr.manage') or has_admin_perm('people.manage')) then raise exception 'forbidden'; end if;
  select * into c from candidates where id = p_candidate;
  if c.email is null then raise exception 'candidate has no email'; end if;
  dept := coalesce(p_department, (select department_id from job_openings where id = c.job_id));
  insert into invites (org_id, email, full_name, role, department_id, designation, manager_id, invited_by)
  values (c.org_id, lower(c.email), c.full_name, p_role, dept, coalesce(p_designation, (select title from job_openings where id = c.job_id)), p_manager, auth.uid())
  returning id into inv;
  update candidates set stage = 'hired' where id = p_candidate;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary) values (c.org_id, auth.uid(), 'hr.hired', 'candidate', c.id, c.full_name || ' → invite ' || lower(c.email));
  return inv;
end $$;

create table mentorships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  mentor_id uuid not null references profiles(id) on delete cascade,
  mentee_id uuid not null references profiles(id) on delete cascade,
  topic text not null,
  status text not null default 'requested', -- requested | active | ended | declined
  requested_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create or replace function mentorship_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'requested' then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (new.mentor_id, 'action_required', person_name(new.mentee_id) || ' asked you to mentor: ' || new.topic, null, '/people/' || new.mentor_id || '?tab=mentoring', 'mentorship', new.id, new.requested_by);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into notifications (user_id, kind, title, link, entity_type, entity_id, actor_id)
    values (new.mentee_id, 'information', 'Mentorship ' || new.status || ': ' || new.topic, '/people/' || new.mentee_id || '?tab=mentoring', 'mentorship', new.id, auth.uid());
  end if;
  return null;
end $$;
create trigger mentorships_notify after insert or update on mentorships for each row execute function mentorship_notify();

-- ---------------------------------------------------------------------------
-- SHIFT HANDOVER, INCIDENTS (WAR ROOM), URGENT ASSISTANCE
-- ---------------------------------------------------------------------------
create table shift_handovers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  shift_id uuid references shifts(id) on delete set null,
  from_user_id uuid not null references profiles(id) on delete cascade,
  to_user_id uuid references profiles(id) on delete set null,
  open_issues text,
  critical_tasks jsonb not null default '[]'::jsonb,
  pending_requests jsonb not null default '[]'::jsonb,
  notes text,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create or replace function prepare_shift_handover(p_department uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'critical_tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'status', status, 'assignee', person_name(assignee_id), 'due', due_date)), '[]') from tasks where department_id = p_department and status not in ('done','cancelled') and (priority in ('critical','urgent') or status in ('blocked','waiting')) ),
    'pending_requests', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'status', status, 'priority', priority, 'owner', person_name(owner_id), 'requester', person_name(requester_id))), '[]') from help_requests where department_id = p_department and status in ('new','accepted','working','waiting')),
    'next_on_shift', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'shift', s.name)), '[]') from shift_assignments a join profiles p on p.id = a.user_id join shifts s on s.id = a.shift_id where p.department_id = p_department and a.starts_on <= current_date + 1 and (a.ends_on is null or a.ends_on >= current_date) and a.user_id <> auth.uid())
  ) where is_active_member()
$$;
create or replace function shift_handover_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.to_user_id is not null then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (new.to_user_id, 'action_required', 'Shift handover from ' || person_name(new.from_user_id), coalesce(left(new.open_issues, 140), 'Please acknowledge.'), '/attendance?tab=handover&id=' || new.id, 'shift_handover', new.id, new.from_user_id);
  elsif tg_op = 'UPDATE' and new.acknowledged_at is not null and old.acknowledged_at is null then
    insert into notifications (user_id, kind, title, link, entity_type, entity_id, actor_id)
    values (new.from_user_id, 'information', person_name(new.to_user_id) || ' acknowledged your handover', '/attendance?tab=handover&id=' || new.id, 'shift_handover', new.id, new.to_user_id);
  end if;
  return null;
end $$;
create trigger shift_handovers_notify after insert or update on shift_handovers for each row execute function shift_handover_notify();

create table incidents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  severity text not null default 'high',    -- critical | high | medium
  department_id uuid references departments(id) on delete set null,
  status text not null default 'open',      -- open | mitigated | resolved
  owner_id uuid references profiles(id) on delete set null,
  channel_id uuid references channels(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  timeline jsonb not null default '[]'::jsonb,      -- [{at, by, text}]
  started_by uuid references profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  postmortem text
);
/** Start a war room: emergency channel with the department escalation chain + on-duty, a critical task, an incident record, executive alerts. */
create or replace function start_war_room(p_title text, p_severity text default 'high', p_department uuid default null, p_summary text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare o uuid := current_org(); d departments%rowtype; cid uuid; tid uuid; iid uuid; u uuid; members uuid[];
begin
  if not is_active_member() then raise exception 'forbidden'; end if;
  if p_department is not null then select * into d from departments where id = p_department; end if;
  insert into channels (org_id, type, name, purpose, visibility, owner_id, department_id, created_by)
  values (o, 'emergency', left('🚨 ' || p_title, 60), 'War room · ' || p_severity || coalesce(' · ' || d.name, ''), 'invite_only', auth.uid(), p_department, auth.uid()) returning id into cid;
  members := array_remove(array[auth.uid(), d.on_duty_user_id, d.head_id] || coalesce(d.escalation_matrix, '{}'), null);
  insert into channel_members (channel_id, user_id, role) select distinct cid, x, case when x = auth.uid() then 'owner' else 'member' end from unnest(members) x on conflict do nothing;
  insert into tasks (org_id, title, description, department_id, assignee_id, owner_id, created_by, status, priority, tags)
  values (o, 'Incident: ' || p_title, coalesce(p_summary, ''), p_department, coalesce(d.on_duty_user_id, d.head_id, auth.uid()), auth.uid(), auth.uid(), 'in_progress', 'critical', array['incident']) returning id into tid;
  insert into incidents (org_id, title, severity, department_id, owner_id, channel_id, task_id, started_by, timeline)
  values (o, p_title, p_severity, p_department, coalesce(d.on_duty_user_id, d.head_id, auth.uid()), cid, tid, auth.uid(), jsonb_build_array(jsonb_build_object('at', now(), 'by', person_name(auth.uid()), 'text', 'War room started' || coalesce(': ' || p_summary, '')))) returning id into iid;
  insert into messages (channel_id, author_id, kind, body) values (cid, auth.uid(), 'system', 'War room opened for **' || p_title || '** (' || p_severity || ').' || coalesce(E'\n' || p_summary, '') || E'\nIncident task: /tasks/' || tid || E'\nRecord the timeline here; the owner closes the incident from /help/incidents/' || iid);
  for u in select distinct x from unnest(members) x where x <> auth.uid() loop
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (u, 'critical', 'War room: ' || p_title, coalesce(p_summary, 'Join the room now.'), '/chat/' || cid, 'incident', iid, auth.uid());
  end loop;
  if p_severity = 'critical' then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    select id, 'critical', 'Critical incident: ' || p_title, coalesce(p_summary, ''), '/chat/' || cid, 'incident', iid, auth.uid() from profiles where org_id = o and is_active and role in ('super_admin','director','executive') and id <> all(members);
  end if;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value) values (o, auth.uid(), 'incident.started', 'incident', iid, p_title, jsonb_build_object('severity', p_severity, 'department_id', p_department));
  return iid;
end $$;

/** Urgent assistance: route to the right department's on-duty/head and escalation chain, create a critical help request. */
create or replace function urgent_assistance(p_kind text, p_message text) returns uuid
language plpgsql security definer set search_path = public as $$
declare o uuid := current_org(); d departments%rowtype; rid uuid; u uuid; v_slug text;
begin
  v_slug := case p_kind when 'it' then 'technology' when 'hr' then 'hr' when 'management' then 'management' when 'security' then 'technology' when 'operations' then 'operations' else 'admin' end;
  select * into d from departments where org_id = o and departments.slug = v_slug;
  if d.id is null then select * into d from departments where org_id = o order by position limit 1; end if;
  insert into help_requests (org_id, department_id, requester_id, title, details, priority, owner_id)
  values (o, d.id, auth.uid(), 'URGENT (' || p_kind || '): ' || left(p_message, 80), p_message, 'critical', coalesce(d.on_duty_user_id, d.head_id)) returning id into rid;
  for u in select distinct x from unnest(array_remove(array[d.on_duty_user_id, d.head_id] || coalesce(d.escalation_matrix, '{}'), null)) x loop
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (u, 'critical', 'Urgent assistance (' || p_kind || ') from ' || person_name(auth.uid()), left(p_message, 200), '/help/' || rid, 'help_request', rid, auth.uid());
  end loop;
  if p_kind in ('management','security') then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    select id, 'critical', 'Urgent assistance (' || p_kind || ') from ' || person_name(auth.uid()), left(p_message, 200), '/help/' || rid, 'help_request', rid, auth.uid() from profiles where org_id = o and is_active and role in ('super_admin','director','executive');
  end if;
  return rid;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table workflow_templates enable row level security;
alter table workflow_runs enable row level security;
alter table workflow_steps enable row level security;
alter table employee_transfers enable row level security;
alter table role_changes enable row level security;
alter table probation_reviews enable row level security;
alter table assets enable row level security;
alter table asset_assignments enable row level security;
alter table asset_requests enable row level security;
alter table employee_documents enable row level security;
alter table courses enable row level security;
alter table lessons enable row level security;
alter table enrollments enable row level security;
alter table lesson_progress enable row level security;
alter table skill_endorsements enable row level security;
alter table goals enable row level security;
alter table goal_tasks enable row level security;
alter table one_on_ones enable row level security;
alter table feedback enable row level security;
alter table kudos enable row level security;
alter table suggestions enable row level security;
alter table job_openings enable row level security;
alter table internal_applications enable row level security;
alter table candidates enable row level security;
alter table interviews enable row level security;
alter table mentorships enable row level security;
alter table shift_handovers enable row level security;
alter table incidents enable row level security;

create or replace function is_hr() returns boolean language sql stable security definer set search_path = public as $$
  select is_admin() or has_admin_perm('hr.manage') or has_admin_perm('people.manage')
$$;
create or replace function is_manager_of(u uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = u and (p.manager_id = auth.uid() or p.secondary_manager_id = auth.uid()))
      or exists (select 1 from profiles p join departments d on d.id = p.department_id where p.id = u and d.head_id = auth.uid())
$$;

create policy wt_read on workflow_templates for select to authenticated using (org_id = current_org() and is_active_member());
create policy wt_write on workflow_templates for all to authenticated using (org_id = current_org() and (is_hr() or has_admin_perm('automations.manage'))) with check (org_id = current_org() and (is_hr() or has_admin_perm('automations.manage')));
create policy wr_read on workflow_runs for select to authenticated using (org_id = current_org() and (is_hr() or is_manager_plus() or subject_user_id = auth.uid() or started_by = auth.uid() or exists (select 1 from workflow_steps s where s.run_id = id and s.owner_id = auth.uid())));
create policy wr_update on workflow_runs for update to authenticated using (org_id = current_org() and (is_hr() or started_by = auth.uid()));
create policy ws_read on workflow_steps for select to authenticated using (exists (select 1 from workflow_runs r where r.id = run_id and (is_hr() or is_manager_plus() or r.subject_user_id = auth.uid() or r.started_by = auth.uid() or owner_id = auth.uid())));
create policy ws_update on workflow_steps for update to authenticated using (owner_id = auth.uid() or is_hr() or exists (select 1 from workflow_runs r where r.id = run_id and r.started_by = auth.uid()));

create policy et_read on employee_transfers for select to authenticated using (org_id = current_org() and (is_hr() or user_id = auth.uid() or requested_by = auth.uid() or is_manager_of(user_id) or to_manager_id = auth.uid()));
create policy et_write on employee_transfers for all to authenticated using (org_id = current_org() and (is_hr() or is_manager_of(user_id))) with check (org_id = current_org() and (is_hr() or is_manager_of(user_id)));
create policy rc_read on role_changes for select to authenticated using (org_id = current_org() and (is_hr() or user_id = auth.uid() or is_manager_of(user_id)));
create policy rc_write on role_changes for all to authenticated using (org_id = current_org() and (is_hr() or is_manager_of(user_id))) with check (org_id = current_org() and (is_hr() or is_manager_of(user_id)));
create policy pr_read on probation_reviews for select to authenticated using (org_id = current_org() and (is_hr() or user_id = auth.uid() or reviewer_id = auth.uid() or is_manager_of(user_id)));
create policy pr_write on probation_reviews for all to authenticated using (org_id = current_org() and (is_hr() or reviewer_id = auth.uid() or is_manager_of(user_id))) with check (org_id = current_org() and (is_hr() or reviewer_id = auth.uid() or is_manager_of(user_id)));

create policy assets_read on assets for select to authenticated using (org_id = current_org() and (is_hr() or has_admin_perm('system.manage') or is_manager_plus() or exists (select 1 from asset_assignments a where a.asset_id = id and a.user_id = auth.uid())));
create policy assets_write on assets for all to authenticated using (org_id = current_org() and (is_hr() or has_admin_perm('system.manage') or current_department() in (select id from departments where slug in ('technology','admin') and org_id = current_org()) and is_lead_plus())) with check (org_id = current_org() and (is_hr() or has_admin_perm('system.manage') or current_department() in (select id from departments where slug in ('technology','admin') and org_id = current_org()) and is_lead_plus()));
create policy aa_read on asset_assignments for select to authenticated using (user_id = auth.uid() or is_hr() or has_admin_perm('system.manage') or is_manager_plus());
create policy aa_write on asset_assignments for all to authenticated using (is_hr() or has_admin_perm('system.manage') or (current_department() in (select id from departments where slug in ('technology','admin') and org_id = current_org()) and is_lead_plus())) with check (is_hr() or has_admin_perm('system.manage') or (current_department() in (select id from departments where slug in ('technology','admin') and org_id = current_org()) and is_lead_plus()));
create policy ar_read on asset_requests for select to authenticated using (org_id = current_org() and (user_id = auth.uid() or approver_id = auth.uid() or is_hr() or has_admin_perm('system.manage') or is_manager_of(user_id)));
create policy ar_insert on asset_requests for insert to authenticated with check (org_id = current_org() and user_id = auth.uid());
create policy ar_update on asset_requests for update to authenticated using (org_id = current_org() and (approver_id = auth.uid() or is_hr() or has_admin_perm('system.manage') or (user_id = auth.uid() and status = 'pending')));
create policy ed_read on employee_documents for select to authenticated using (org_id = current_org() and ((user_id = auth.uid() and visible_to_employee) or is_hr()));
create policy ed_write on employee_documents for all to authenticated using (org_id = current_org() and is_hr()) with check (org_id = current_org() and is_hr());
create policy ed_self_insert on employee_documents for insert to authenticated with check (org_id = current_org() and user_id = auth.uid() and uploaded_by = auth.uid());
create policy hr_bucket_read on storage.objects for select to authenticated using (bucket_id = 'hr' and (is_hr() or (storage.foldername(name))[1] = auth.uid()::text));
create policy hr_bucket_write on storage.objects for insert to authenticated with check (bucket_id = 'hr' and (is_hr() or (storage.foldername(name))[1] = auth.uid()::text));
create policy hr_bucket_delete on storage.objects for delete to authenticated using (bucket_id = 'hr' and is_hr());

create policy courses_read on courses for select to authenticated using (org_id = current_org() and is_active_member() and (status = 'published' or created_by = auth.uid() or is_hr() or is_manager_plus()) and (department_ids is null or current_department() = any(department_ids) or is_hr() or is_manager_plus() or created_by = auth.uid()));
create policy courses_write on courses for all to authenticated using (org_id = current_org() and (is_hr() or is_lead_plus())) with check (org_id = current_org() and (is_hr() or is_lead_plus()));
create policy lessons_read on lessons for select to authenticated using (exists (select 1 from courses c where c.id = course_id));
create policy lessons_write on lessons for all to authenticated using (exists (select 1 from courses c where c.id = course_id and (is_hr() or c.created_by = auth.uid() or is_lead_plus()))) with check (exists (select 1 from courses c where c.id = course_id and (is_hr() or c.created_by = auth.uid() or is_lead_plus())));
create policy enr_read on enrollments for select to authenticated using (user_id = auth.uid() or assigned_by = auth.uid() or is_hr() or is_manager_of(user_id) or is_manager_plus());
create policy enr_insert on enrollments for insert to authenticated with check (user_id = auth.uid() or is_hr() or is_lead_plus());
create policy enr_update on enrollments for update to authenticated using (user_id = auth.uid() or is_hr() or assigned_by = auth.uid());
create policy enr_delete on enrollments for delete to authenticated using (is_hr() or assigned_by = auth.uid());
create policy lp_all on lesson_progress for all to authenticated using (exists (select 1 from enrollments e where e.id = enrollment_id and (e.user_id = auth.uid() or is_hr()))) with check (exists (select 1 from enrollments e where e.id = enrollment_id and e.user_id = auth.uid()));

create policy se_read on skill_endorsements for select to authenticated using (is_active_member());
create policy se_insert on skill_endorsements for insert to authenticated with check (endorsed_by = auth.uid() and user_id <> auth.uid());
create policy se_delete on skill_endorsements for delete to authenticated using (endorsed_by = auth.uid() or is_hr());
create or replace function skill_endorsement_verify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.verified := is_manager_of(new.user_id) or is_hr();
  return new;
end $$;
create trigger skill_endorsements_verify before insert on skill_endorsements for each row execute function skill_endorsement_verify();

create policy goals_read on goals for select to authenticated using (org_id = current_org() and is_active_member() and (level in ('company','department','team') or owner_id = auth.uid() or is_manager_of(owner_id) or is_hr() or is_manager_plus()));
create policy goals_write on goals for all to authenticated using (org_id = current_org() and (owner_id = auth.uid() or created_by = auth.uid() or is_hr() or (level = 'company' and is_admin()) or (level in ('department','team') and is_lead_plus()) or (level = 'employee' and is_manager_of(owner_id))))
  with check (org_id = current_org() and (owner_id = auth.uid() or is_hr() or (level = 'company' and is_admin()) or (level in ('department','team') and is_lead_plus()) or (level = 'employee' and is_manager_of(owner_id))));
create policy gt_all on goal_tasks for all to authenticated using (exists (select 1 from goals g where g.id = goal_id)) with check (exists (select 1 from goals g where g.id = goal_id and (g.owner_id = auth.uid() or is_hr() or is_manager_of(g.owner_id) or is_lead_plus())));

create policy o1_read on one_on_ones for select to authenticated using (org_id = current_org() and (manager_id = auth.uid() or employee_id = auth.uid() or is_hr()));
create policy o1_write on one_on_ones for all to authenticated using (org_id = current_org() and (manager_id = auth.uid() or employee_id = auth.uid())) with check (org_id = current_org() and (manager_id = auth.uid() or employee_id = auth.uid()));

create policy fb_read on feedback for select to authenticated using (org_id = current_org() and (from_user_id = auth.uid() or to_user_id = auth.uid() or (visibility in ('manager','hr') and is_manager_of(to_user_id)) or (visibility = 'hr' and is_hr())));
create policy fb_insert on feedback for insert to authenticated with check (org_id = current_org() and from_user_id = auth.uid());
create policy fb_delete on feedback for delete to authenticated using (from_user_id = auth.uid());

create policy kudos_read on kudos for select to authenticated using (org_id = current_org() and (public or from_user_id = auth.uid() or to_user_id = auth.uid() or is_hr()));
create policy kudos_insert on kudos for insert to authenticated with check (org_id = current_org() and from_user_id = auth.uid() and to_user_id <> auth.uid());

create policy sug_read on suggestions for select to authenticated using (org_id = current_org() and (author_id = auth.uid() or is_manager_plus() or is_hr()));
create policy sug_insert on suggestions for insert to authenticated with check (org_id = current_org() and author_id = auth.uid());
create policy sug_update on suggestions for update to authenticated using (org_id = current_org() and (is_manager_plus() or is_hr() or (author_id = auth.uid() and status = 'new')));
-- anonymous suggestions hide the author from readers other than admins (view)
create or replace view suggestions_view with (security_invoker = true) as
  select id, org_id, case when anonymous and not (is_admin() or has_admin_perm('hr.manage')) then null else author_id end as author_id, anonymous, kind, title, body, status, response, responded_by, created_at from suggestions;
grant select on suggestions_view to authenticated;

create policy jo_read on job_openings for select to authenticated using (org_id = current_org() and is_active_member() and (status = 'open' or is_hr() or hiring_manager_id = auth.uid() or created_by = auth.uid()));
create policy jo_write on job_openings for all to authenticated using (org_id = current_org() and (is_hr() or hiring_manager_id = auth.uid() or is_manager_plus())) with check (org_id = current_org() and (is_hr() or is_manager_plus()));
create policy ia_read on internal_applications for select to authenticated using (user_id = auth.uid() or is_hr() or exists (select 1 from job_openings j where j.id = job_id and (j.hiring_manager_id = auth.uid() or j.created_by = auth.uid())));
create policy ia_insert on internal_applications for insert to authenticated with check (user_id = auth.uid());
create policy ia_update on internal_applications for update to authenticated using (user_id = auth.uid() or is_hr() or exists (select 1 from job_openings j where j.id = job_id and j.hiring_manager_id = auth.uid()));
create policy cand_read on candidates for select to authenticated using (org_id = current_org() and (is_hr() or owner_id = auth.uid() or exists (select 1 from job_openings j where j.id = job_id and j.hiring_manager_id = auth.uid()) or exists (select 1 from interviews i where i.candidate_id = id and auth.uid() = any(i.panel))));
create policy cand_write on candidates for all to authenticated using (org_id = current_org() and (is_hr() or owner_id = auth.uid() or exists (select 1 from job_openings j where j.id = job_id and j.hiring_manager_id = auth.uid()))) with check (org_id = current_org() and (is_hr() or is_manager_plus()));
create policy int_read on interviews for select to authenticated using (auth.uid() = any(panel) or created_by = auth.uid() or is_hr() or exists (select 1 from candidates c where c.id = candidate_id and c.owner_id = auth.uid()));
create policy int_write on interviews for all to authenticated using (auth.uid() = any(panel) or created_by = auth.uid() or is_hr()) with check (created_by = auth.uid() or is_hr());

create policy ment_read on mentorships for select to authenticated using (org_id = current_org() and (mentor_id = auth.uid() or mentee_id = auth.uid() or is_hr() or is_manager_of(mentee_id)));
create policy ment_insert on mentorships for insert to authenticated with check (org_id = current_org() and requested_by = auth.uid() and (mentee_id = auth.uid() or is_manager_of(mentee_id) or is_hr()));
create policy ment_update on mentorships for update to authenticated using (org_id = current_org() and (mentor_id = auth.uid() or mentee_id = auth.uid() or is_hr()));

create policy sh_read on shift_handovers for select to authenticated using (org_id = current_org() and (department_id = current_department() or is_manager_plus() or from_user_id = auth.uid() or to_user_id = auth.uid()));
create policy sh_insert on shift_handovers for insert to authenticated with check (org_id = current_org() and from_user_id = auth.uid());
create policy sh_update on shift_handovers for update to authenticated using (org_id = current_org() and (from_user_id = auth.uid() or to_user_id = auth.uid() or is_manager_plus()));

create policy inc_read on incidents for select to authenticated using (org_id = current_org() and is_internal());
create policy inc_update on incidents for update to authenticated using (org_id = current_org() and (owner_id = auth.uid() or started_by = auth.uid() or is_manager_plus() or exists (select 1 from channel_members m where m.channel_id = channel_id and m.user_id = auth.uid())));

grant execute on function start_workflow(text,uuid,jsonb,text), skip_workflow_step(uuid,text), apply_transfer(uuid), apply_role_change(uuid), transfer_work(uuid,uuid,text), offboard_user(uuid,uuid,text,date), hire_candidate(uuid,role_level,text,uuid,uuid), prepare_shift_handover(uuid), start_war_room(text,text,uuid,text), urgent_assistance(text,text), is_hr(), is_manager_of(uuid) to authenticated;
revoke execute on function start_workflow(text,uuid,jsonb,text), skip_workflow_step(uuid,text), apply_transfer(uuid), apply_role_change(uuid), transfer_work(uuid,uuid,text), offboard_user(uuid,uuid,text,date), hire_candidate(uuid,role_level,text,uuid,uuid), prepare_shift_handover(uuid), start_war_room(text,text,uuid,text), urgent_assistance(text,text), is_hr(), is_manager_of(uuid),
  resolve_step_owner(text,uuid,uuid), resolve_step_department(text,uuid,uuid), workflow_release_step(uuid), workflow_task_done(), probation_reminders(), asset_assignment_sync(), asset_request_route(), lesson_progress_sync(), enrollment_notify(), kudos_after_insert(), mentorship_notify(), shift_handover_notify(), skill_endorsement_verify() from anon, public;
revoke execute on function resolve_step_owner(text,uuid,uuid), resolve_step_department(text,uuid,uuid), workflow_release_step(uuid), probation_reminders() from authenticated;

select cron.schedule('ghl_probation', '15 3 * * *', $$select probation_reminders()$$);
alter publication supabase_realtime add table workflow_steps, incidents, asset_requests;

-- ---------------------------------------------------------------------------
-- SEED: workflow templates + a starter course
-- ---------------------------------------------------------------------------
insert into workflow_templates (org_id, key, name, description, kind, steps) values
('00000000-0000-0000-0000-000000000001', 'onboarding', 'New employee onboarding', 'HR → IT → Admin → Manager → Employee. Runs automatically when a new account is activated.', 'onboarding', '[
  {"key":"hr_welcome","title":"Welcome pack, policies and employee record","description":"Confirm employee record (designation, department, manager, shift, joining date), share welcome information and policies, collect documents.","owner":"hr","due_days":1},
  {"key":"it_account","title":"Accounts, tools and access","description":"Email, tools, folders, VPN, required system access. Raise access requests for restricted material.","owner":"it","depends_on":["hr_welcome"],"due_days":2},
  {"key":"admin_assets","title":"Laptop, phone/SIM, access card","description":"Assign assets in Assets and record condition.","owner":"admin","depends_on":["hr_welcome"],"due_days":2},
  {"key":"manager_intro","title":"Team introduction and first-week plan","description":"Introduce to team and department rooms, agree first tasks, schedule the first 1-on-1.","owner":"manager","depends_on":["it_account"],"due_days":3},
  {"key":"employee_setup","title":"Complete your profile, read policies, start training","description":"Add photo, skills and languages; acknowledge mandatory announcements; complete assigned Academy courses.","owner":"employee","depends_on":["it_account"],"due_days":5},
  {"key":"hr_check","title":"Day-30 check-in and probation goals","description":"Set probation goals with the manager; confirm probation review date.","owner":"hr","depends_on":["manager_intro","employee_setup"],"due_days":30}
]'::jsonb),
('00000000-0000-0000-0000-000000000001', 'offboarding', 'Employee exit', 'Structured exit: work transfer is done automatically; these are the human steps.', 'offboarding', '[
  {"key":"manager_handover","title":"Confirm handover of tasks, projects and files","description":"Review the transferred work; reassign where needed; collect knowledge into the wiki.","owner":"manager","due_days":2},
  {"key":"admin_assets","title":"Collect assets","description":"Laptop, phone, SIM, access card, other equipment. Mark returned in Assets.","owner":"admin","due_days":3},
  {"key":"it_revoke","title":"Revoke access and licences","description":"Confirm account disabled, licences reassigned, shared credentials rotated.","owner":"it","depends_on":["manager_handover"],"due_days":3},
  {"key":"hr_exit","title":"Exit interview and final documents","description":"Exit interview, experience letter, final settlement paperwork.","owner":"hr","depends_on":["admin_assets","it_revoke"],"due_days":5},
  {"key":"hr_archive","title":"Archive records","description":"Archive required employee records per retention policy.","owner":"hr","depends_on":["hr_exit"],"due_days":7}
]'::jsonb),
('00000000-0000-0000-0000-000000000001', 'transfer', 'Department transfer', 'Runs after a transfer is applied.', 'transfer', '[
  {"key":"it_review","title":"Permission review after transfer","description":"Old department access should not silently remain: review project memberships, folders, tools.","owner":"it","due_days":2},
  {"key":"manager_intro","title":"Introduction to the new team","description":"Add to team rooms, agree responsibilities and first tasks.","owner":"manager","due_days":2},
  {"key":"hr_record","title":"Update employee record","description":"Designation, shift, working hours, goals.","owner":"hr","due_days":3}
]'::jsonb),
('00000000-0000-0000-0000-000000000001', 'promotion', 'Promotion / role change', 'Runs after a role change is applied.', 'promotion', '[
  {"key":"hr_record","title":"Update record and documents","description":"Designation letter, reporting structure, permission changes.","owner":"hr","due_days":3},
  {"key":"manager_goals","title":"Set new goals","description":"Agree goals for the new role.","owner":"manager","due_days":7}
]'::jsonb),
('00000000-0000-0000-0000-000000000001', 'incident', 'Incident follow-up', 'After a war room is resolved.', 'incident', '[
  {"key":"owner_postmortem","title":"Write the postmortem","description":"Problem, cause, fix, verification, prevention. Save as knowledge.","owner":"it","due_days":2},
  {"key":"head_actions","title":"Prevention actions","description":"Turn prevention items into tasks.","owner":"department_head","depends_on":["owner_postmortem"],"due_days":5}
]'::jsonb);

-- auto-onboarding when an account becomes active for the first time (invite accepted / admin activation)
create or replace function auto_onboarding() returns trigger
language plpgsql security definer set search_path = public as $$
declare prev text; hr uuid;
begin
  if new.is_active and (tg_op = 'INSERT' or not old.is_active) and new.role not in ('vendor','guest','consultant')
     and coalesce((select (settings->>'auto_onboarding')::boolean from organizations where id = new.org_id), true)
     and exists (select 1 from workflow_templates t where t.org_id = new.org_id and t.key = 'onboarding' and t.active)
     and not exists (select 1 from workflow_runs r where r.subject_user_id = new.id and r.kind = 'onboarding') then
    -- run as the primary admin / HR head so RLS-independent creation works
    select coalesce((select (settings->>'primary_admin_id')::uuid from organizations where id = new.org_id), (select head_id from departments where org_id = new.org_id and slug = 'hr')) into hr;
    prev := current_setting('request.jwt.claims', true);
    perform set_config('request.jwt.claims', json_build_object('sub', coalesce(hr, new.id), 'role', 'authenticated')::text, true);
    begin
      perform start_workflow('onboarding', new.id, jsonb_build_object('auto', true));
    exception when others then
      raise notice 'auto onboarding skipped: %', sqlerrm;
    end;
    perform set_config('request.jwt.claims', coalesce(prev, ''), true);
  end if;
  return null;
end $$;
create trigger profiles_auto_onboarding after insert or update of is_active on profiles for each row execute function auto_onboarding();

insert into courses (org_id, title, description, level, duration_minutes, status, mandatory, created_by)
values ('00000000-0000-0000-0000-000000000001', 'Welcome to GHL ONE', 'How work happens here: your day, your team, requests, leave, files and the Buddy. 12 minutes.', 'basic', 12, 'published', true, null);
insert into lessons (course_id, position, title, kind, content, duration_minutes)
select c.id, l.pos, l.title, l.kind, l.content, l.mins from courses c, (values
  (1, 'Your day in GHL ONE', 'text', E'Clock in from the top bar. **Home** shows what needs you first: overdue, waiting on you, approvals, meetings. **My Work** is your list. Press **C** anywhere to capture a task, **Ctrl+K** to search or jump, **Ctrl+J** to ask GHL Buddy.', 3),
  (2, 'Asking for help', 'text', E'Ask another department through **Help Desk** — every request gets an owner and an acknowledgement target. For quick questions use **#help** in GHL Common. If you are stuck, press **I''m stuck** in Buddy: it suggests a fix, finds the SOP or the right person, or raises a request for you.', 3),
  (3, 'Leave, attendance and privacy', 'text', E'Apply for leave from **Leave** (balances, impact preview, handover). Attendance records only your clock in/out, mode and optional note — see **Privacy Center** on your profile for everything recorded about you. There is no keystroke, screen, camera or microphone monitoring.', 3),
  (4, 'Quick check', 'quiz', null, 3)
) as l(pos, title, kind, content, mins) where c.title = 'Welcome to GHL ONE';
update lessons set quiz = '[{"q":"Where do you ask another department for something?","options":["Email the department head","Help Desk — the request gets an owner and an SLA","Post in #random"],"answer":1},{"q":"What does attendance record?","options":["Keystrokes and screenshots","Clock in/out, mode and an optional note","Your location all day"],"answer":1},{"q":"What is the shortcut to ask GHL Buddy?","options":["Ctrl+J","Ctrl+B","Alt+Q"],"answer":0}]'::jsonb where kind = 'quiz' and course_id = (select id from courses where title = 'Welcome to GHL ONE');
