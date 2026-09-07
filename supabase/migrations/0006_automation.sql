-- Phase 3: Automation — WHEN/IF/THEN engine, escalation engine, recurring tasks,
-- cross-department handoffs, notification preferences + digests, integration framework.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------------
create table automations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  enabled boolean not null default true,
  trigger_type text not null,              -- task.created | task.status_changed | task.assigned | task.priority_changed | approval.requested | approval.decided | project.status_changed | file.version_approved | decision.recorded | handoff.accepted | message.posted | schedule
  trigger_config jsonb not null default '{}'::jsonb,   -- e.g. {"to_status":"done"} or {"every":"day","at":"09:00"}
  conditions jsonb not null default '[]'::jsonb,       -- [{"field":"priority","op":"eq","value":"critical"}]
  actions jsonb not null default '[]'::jsonb,          -- [{"type":"notify","to":"manager","title":"..."}]
  scope_project_id uuid references projects(id) on delete cascade,
  scope_department_id uuid references departments(id) on delete cascade,
  next_run_at timestamptz,
  run_count int not null default 0,
  last_run_at timestamptz,
  last_error text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index automations_trigger_idx on automations(org_id, trigger_type) where enabled;
create trigger automations_updated_at before update on automations for each row execute function set_updated_at();

create table automation_runs (
  id bigint generated always as identity primary key,
  automation_id uuid not null references automations(id) on delete cascade,
  org_id uuid not null,
  event text not null,
  entity_type text,
  entity_id uuid,
  status text not null default 'ok',          -- ok | error | skipped
  details jsonb,
  created_at timestamptz not null default now()
);
create index automation_runs_aut_idx on automation_runs(automation_id, created_at desc);

create table escalation_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  priority task_priority,                     -- null = any priority
  hours_after_due int not null,               -- negative = reminder before due
  notify text[] not null,                     -- assignee | owner | delegator | manager | department_head | executives | approver
  kind notification_kind not null default 'deadline',
  respect_quiet_hours boolean not null default true,
  enabled boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table escalation_log (
  task_id uuid not null references tasks(id) on delete cascade,
  rule_id uuid not null references escalation_rules(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (task_id, rule_id)
);

create type handoff_status as enum ('pending','accepted','rejected');
create table handoffs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  from_department_id uuid references departments(id) on delete set null,
  to_department_id uuid not null references departments(id) on delete cascade,
  from_user_id uuid references profiles(id) on delete set null,
  to_user_id uuid references profiles(id) on delete set null,
  package jsonb not null default '{}'::jsonb,   -- {brief, copy, assets:[{name,link}], deadline, approver_id}
  status handoff_status not null default 'pending',
  note text,
  responded_by uuid references profiles(id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
create index handoffs_to_idx on handoffs(to_department_id, status);
create index handoffs_task_idx on handoffs(task_id);

create table notification_prefs (
  user_id uuid primary key references profiles(id) on delete cascade,
  mode text not null default 'immediate',      -- immediate | daily | weekly
  digest_kinds text[] not null default '{information}',
  quiet_start time,                            -- IST wall clock
  quiet_end time,
  dnd_until timestamptz,
  muted_channels uuid[] not null default '{}',
  priority_people uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  provider text not null,                      -- slack | webhook_out | webhook_in | github | google_calendar | whatsapp | zoom | generic
  name text not null,
  config jsonb not null default '{}'::jsonb,   -- webhook_out: {url, secret, events[]}; slack: {url}; webhook_in: {token, target:'task'|'message', department_id, project_id, channel_id, assignee_id}
  enabled boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index integrations_org_idx on integrations(org_id, provider);

create table integration_deliveries (
  id bigint generated always as identity primary key,
  integration_id uuid not null references integrations(id) on delete cascade,
  event text not null,
  payload jsonb,
  status text not null default 'queued',
  request_id bigint,
  error text,
  created_at timestamptz not null default now()
);
create index integration_deliveries_idx on integration_deliveries(integration_id, created_at desc);

create table calendar_feed_tokens (
  user_id uuid primary key references profiles(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- HELPERS
-- ---------------------------------------------------------------------------
create or replace function render_tpl(tpl text, ctx jsonb) returns text
language plpgsql immutable as $$
declare k text; out text := coalesce(tpl, '');
begin
  for k in select jsonb_object_keys(ctx) loop
    out := replace(out, '{{' || k || '}}', coalesce(ctx->>k, ''));
  end loop;
  return out;
end $$;

create or replace function person_name(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select full_name from profiles where id = uid), '—')
$$;

/** Resolve a target expression to user ids for a task-like context. */
create or replace function resolve_targets(target text, ctx jsonb) returns uuid[]
language plpgsql stable security definer set search_path = public as $$
declare ids uuid[] := '{}'; u uuid; d uuid; o uuid := (ctx->>'org_id')::uuid;
begin
  if target is null then return ids; end if;
  if target = 'assignee' then u := nullif(ctx->>'assignee_id','')::uuid; if u is not null then ids := ids || u; end if;
  elsif target = 'owner' then u := nullif(ctx->>'owner_id','')::uuid; if u is not null then ids := ids || u; end if;
  elsif target = 'delegator' then u := nullif(ctx->>'delegated_by','')::uuid; if u is not null then ids := ids || u; end if;
  elsif target = 'approver' then u := nullif(ctx->>'approver_id','')::uuid; if u is not null then ids := ids || u; end if;
  elsif target = 'requester' then u := nullif(ctx->>'requested_by','')::uuid; if u is not null then ids := ids || u; end if;
  elsif target = 'manager' then
    select manager_id into u from profiles where id = coalesce(nullif(ctx->>'assignee_id','')::uuid, nullif(ctx->>'requested_by','')::uuid, nullif(ctx->>'owner_id','')::uuid);
    if u is not null then ids := ids || u; end if;
  elsif target = 'department_head' then
    d := coalesce(nullif(ctx->>'department_id','')::uuid, (select department_id from profiles where id = nullif(ctx->>'assignee_id','')::uuid));
    select head_id into u from departments where id = d;
    if u is not null then ids := ids || u; end if;
  elsif target = 'executives' then
    ids := array(select id from profiles where org_id = o and is_active and role in ('super_admin','director','executive'));
  elsif target = 'project_owner' then
    select owner_id into u from projects where id = nullif(ctx->>'project_id','')::uuid; if u is not null then ids := ids || u; end if;
  elsif target like 'user:%' then ids := ids || substr(target, 6)::uuid;
  elsif target like 'department:%' then ids := array(select id from profiles where org_id = o and is_active and department_id = substr(target, 12)::uuid);
  elsif target like 'department_head:%' then select head_id into u from departments where id = substr(target, 17)::uuid; if u is not null then ids := ids || u; end if;
  elsif target like 'role:%' then ids := array(select id from profiles where org_id = o and is_active and role = substr(target, 6)::role_level);
  end if;
  return array(select distinct x from unnest(ids) as x where x is not null);
end $$;

/** Build a template/condition context from a task-like row. */
create or replace function automation_ctx(p_entity text, p_row jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ctx jsonb := p_row; pid uuid; did uuid; base text := '';
begin
  pid := nullif(p_row->>'project_id','')::uuid;
  did := nullif(p_row->>'department_id','')::uuid;
  if p_entity = 'task' then base := '/tasks/' || (p_row->>'id');
  elsif p_entity = 'approval' then base := '/approvals/' || (p_row->>'id');
  elsif p_entity = 'project' then base := '/projects/' || (p_row->>'id'); pid := (p_row->>'id')::uuid;
  elsif p_entity = 'decision' then base := '/decisions/' || (p_row->>'id');
  elsif p_entity = 'message' then base := '/chat/' || (p_row->>'channel_id') || '?m=' || (p_row->>'id');
  elsif p_entity = 'file' then base := '/files/' || (p_row->>'id');
  elsif p_entity = 'handoff' then base := '/tasks/' || (p_row->>'task_id');
  end if;
  ctx := ctx || jsonb_build_object(
    'link', base,
    'title', coalesce(p_row->>'title', p_row->>'name', ''),
    'assignee_name', person_name(nullif(p_row->>'assignee_id','')::uuid),
    'owner_name', person_name(nullif(p_row->>'owner_id','')::uuid),
    'approver_name', person_name(nullif(p_row->>'approver_id','')::uuid),
    'requester_name', person_name(nullif(p_row->>'requested_by','')::uuid),
    'actor_name', person_name(auth.uid()),
    'project_name', coalesce((select name from projects where id = pid), ''),
    'department_name', coalesce((select name from departments where id = did), ''),
    'department_slug', coalesce((select slug from departments where id = did), ''),
    'due', coalesce(to_char((p_row->>'due_date')::timestamptz at time zone 'Asia/Kolkata', 'DD Mon HH24:MI'), ''),
    'is_overdue', ((p_row->>'due_date') is not null and (p_row->>'due_date')::timestamptz < now())::text
  );
  return ctx;
end $$;

create or replace function eval_condition(cond jsonb, ctx jsonb) returns boolean
language plpgsql immutable as $$
declare f text := cond->>'field'; op text := coalesce(cond->>'op','eq'); v text := cond->>'value'; actual text;
begin
  actual := ctx->>f;
  return case op
    when 'eq' then actual is not distinct from v
    when 'neq' then actual is distinct from v
    when 'in' then actual = any(string_to_array(coalesce(v,''), ','))
    when 'not_in' then not (actual = any(string_to_array(coalesce(v,''), ',')))
    when 'contains' then actual ilike '%' || coalesce(v,'') || '%'
    when 'gt' then actual is not null and actual::numeric > v::numeric
    when 'lt' then actual is not null and actual::numeric < v::numeric
    when 'is_null' then actual is null or actual = ''
    when 'not_null' then actual is not null and actual <> ''
    when 'true' then actual = 'true'
    when 'false' then actual = 'false'
    else true end;
exception when others then return false;
end $$;

-- ---------------------------------------------------------------------------
-- ACTION RUNNER
-- ---------------------------------------------------------------------------
create or replace function run_automation_action(aut automations, act jsonb, p_entity text, ctx jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  t text := act->>'type';
  targets uuid[]; u uuid; tid uuid; cid uuid; integ integrations%rowtype; req bigint; did bigint;
  src_task tasks%rowtype;
  new_assignee uuid; new_dept uuid; new_project uuid; due timestamptz;
  body text; title text;
begin
  if p_entity = 'task' then select * into src_task from tasks where id = (ctx->>'id')::uuid; end if;

  if t = 'notify' then
    targets := resolve_targets(act->>'to', ctx);
    title := render_tpl(coalesce(act->>'title', 'Automation: ' || aut.name), ctx);
    body := render_tpl(act->>'body', ctx);
    foreach u in array targets loop
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (u, coalesce((act->>'kind')::notification_kind, 'action_required'), title, nullif(body,''), ctx->>'link', p_entity, nullif(ctx->>'id','')::uuid, aut.created_by);
    end loop;
    return jsonb_build_object('notified', coalesce(array_length(targets,1),0));

  elsif t = 'create_task' then
    new_assignee := case
      when act->>'assignee' = 'same' then nullif(ctx->>'assignee_id','')::uuid
      when act->>'assignee' = 'owner' then nullif(ctx->>'owner_id','')::uuid
      when act->>'assignee' like 'user:%' then substr(act->>'assignee', 6)::uuid
      when act->>'assignee' like 'department_head:%' then (select head_id from departments where id = substr(act->>'assignee', 17)::uuid)
      when act->>'assignee' = 'manager' then (select manager_id from profiles where id = nullif(ctx->>'assignee_id','')::uuid)
      else null end;
    new_dept := case when act->>'department_id' = 'same' then nullif(ctx->>'department_id','')::uuid else nullif(act->>'department_id','')::uuid end;
    new_project := case when coalesce(act->>'project','same') = 'same' then nullif(ctx->>'project_id','')::uuid when act->>'project' = 'none' then null else nullif(act->>'project','')::uuid end;
    due := case when (act->>'due_in_hours') is not null then now() + ((act->>'due_in_hours')::numeric * interval '1 hour') else null end;
    insert into tasks (org_id, project_id, department_id, title, description, owner_id, assignee_id, delegated_by, priority, due_date, status, created_by, tags)
    values (aut.org_id, new_project, new_dept, render_tpl(coalesce(act->>'title','Follow-up: {{title}}'), ctx), render_tpl(act->>'description', ctx),
            coalesce(nullif(ctx->>'owner_id','')::uuid, aut.created_by), new_assignee, aut.created_by,
            coalesce((act->>'priority')::task_priority, 'normal'), due, 'todo', aut.created_by, array['automation'])
    returning id into tid;
    if coalesce((act->>'depends_on_source')::boolean, false) and p_entity = 'task' and src_task.id is not null and src_task.status <> 'done' then
      insert into task_dependencies (task_id, depends_on_id) values (tid, src_task.id) on conflict do nothing;
      update tasks set status = 'waiting', waiting_on = 'employee', waiting_on_user_id = src_task.assignee_id, waiting_note = 'Waiting on: ' || src_task.title where id = tid;
    end if;
    return jsonb_build_object('task_id', tid);

  elsif t = 'update_task' then
    if p_entity <> 'task' or src_task.id is null then return jsonb_build_object('skipped', 'not a task'); end if;
    update tasks set
      status = coalesce((act->>'status')::task_status, status),
      priority = coalesce((act->>'priority')::task_priority, priority),
      waiting_on = coalesce((act->>'waiting_on')::waiting_on, waiting_on),
      waiting_note = coalesce(render_tpl(act->>'waiting_note', ctx), waiting_note),
      assignee_id = case when act->>'assignee' like 'user:%' then substr(act->>'assignee',6)::uuid when act->>'assignee' = 'manager' then coalesce((select manager_id from profiles where id = assignee_id), assignee_id) else assignee_id end,
      tags = case when (act->>'add_tag') is not null then array(select distinct x from unnest(tags || (act->>'add_tag')) x) else tags end,
      due_date = case when (act->>'due_in_hours') is not null then now() + ((act->>'due_in_hours')::numeric * interval '1 hour') else due_date end
    where id = src_task.id;
    return jsonb_build_object('updated', src_task.id);

  elsif t = 'post_message' then
    cid := case
      when act->>'channel' = 'project' then (select id from channels where project_id = nullif(ctx->>'project_id','')::uuid and type = 'project' limit 1)
      when act->>'channel' like 'slug:%' then (select id from channels where org_id = aut.org_id and slug = substr(act->>'channel', 6) limit 1)
      when act->>'channel' like 'department:%' then (select id from channels where department_id = substr(act->>'channel', 12)::uuid and type = 'department' limit 1)
      when act->>'channel' like 'channel:%' then substr(act->>'channel', 9)::uuid
      else null end;
    if cid is null then return jsonb_build_object('skipped', 'no channel'); end if;
    insert into messages (channel_id, author_id, kind, body)
    values (cid, aut.created_by, 'system', render_tpl(coalesce(act->>'body', '🤖 {{title}}'), ctx) || case when ctx->>'link' is not null then ' [' || (ctx->>'link') || ']' else '' end);
    return jsonb_build_object('channel_id', cid);

  elsif t = 'create_approval' then
    targets := resolve_targets(coalesce(act->>'approver','manager'), ctx);
    u := targets[1];
    insert into approvals (org_id, type, title, description, requested_by, approver_id, priority, task_id, project_id)
    values (aut.org_id, coalesce((act->>'approval_type')::approval_type, 'other'), render_tpl(coalesce(act->>'title','Approve: {{title}}'), ctx), render_tpl(act->>'description', ctx),
            coalesce(nullif(ctx->>'owner_id','')::uuid, aut.created_by), u, coalesce((act->>'priority')::task_priority,'normal'),
            case when p_entity = 'task' then nullif(ctx->>'id','')::uuid else null end, nullif(ctx->>'project_id','')::uuid)
    returning id into tid;
    if p_entity = 'task' and src_task.id is not null then update tasks set waiting_on = 'approval', status = case when status in ('done','cancelled') then status else 'waiting' end where id = src_task.id; end if;
    return jsonb_build_object('approval_id', tid, 'approver', u);

  elsif t in ('webhook', 'slack') then
    select * into integ from integrations where id = nullif(act->>'integration_id','')::uuid and org_id = aut.org_id and enabled;
    if integ.id is null then return jsonb_build_object('skipped', 'integration missing'); end if;
    if integ.provider = 'slack' or t = 'slack' then
      body := jsonb_build_object('text', render_tpl(coalesce(act->>'body', '*{{title}}* — ' || aut.name || ' ({{link}})'), ctx))::text;
    else
      body := jsonb_build_object('event', aut.trigger_type, 'automation', aut.name, 'entity', p_entity, 'data', ctx - 'actor_name', 'sent_at', now())::text;
    end if;
    insert into integration_deliveries (integration_id, event, payload, status) values (integ.id, aut.trigger_type, body::jsonb, 'queued') returning id into did;
    select net.http_post(url := integ.config->>'url', body := body::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','X-GHL-Event', aut.trigger_type, 'X-GHL-Signature', encode(extensions.hmac(body, coalesce(integ.config->>'secret',''), 'sha256'), 'hex')))
    into req;
    update integration_deliveries set request_id = req, status = 'sent' where id = did;
    update integrations set last_used_at = now() where id = integ.id;
    return jsonb_build_object('delivery', did);

  elsif t = 'create_project_from_template' then
    if auth.uid() is null then perform set_config('request.jwt.claims', json_build_object('sub', aut.created_by, 'role', 'authenticated')::text, true); end if;
    tid := create_project_from_template(act->>'template_key', render_tpl(coalesce(act->>'name','{{title}}'), ctx), coalesce(nullif(act->>'owner','')::uuid, aut.created_by), (current_date + coalesce((act->>'due_in_days')::int, 30))::date, nullif(act->>'department_id','')::uuid);
    return jsonb_build_object('project_id', tid);
  end if;
  return jsonb_build_object('skipped', 'unknown action ' || coalesce(t,'?'));
end $$;

-- ---------------------------------------------------------------------------
-- ENGINE
-- ---------------------------------------------------------------------------
create or replace function fire_automations(p_event text, p_entity text, p_row jsonb, p_old jsonb default null) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare
  aut automations%rowtype; ctx jsonb; cond jsonb; act jsonb; ok boolean; fired int := 0; depth int;
  res jsonb; results jsonb;
  o uuid := nullif(p_row->>'org_id','')::uuid;
begin
  depth := coalesce(nullif(current_setting('ghl.automation_depth', true), '')::int, 0);
  if depth >= 2 then return 0; end if;
  if o is null then return 0; end if;
  if not exists (select 1 from automations where org_id = o and enabled and trigger_type = p_event) then return 0; end if;
  perform set_config('ghl.automation_depth', (depth + 1)::text, true);

  ctx := automation_ctx(p_entity, p_row) || jsonb_build_object('event', p_event, 'old_status', p_old->>'status', 'old_assignee_id', p_old->>'assignee_id', 'old_priority', p_old->>'priority');

  for aut in select * from automations where org_id = o and enabled and trigger_type = p_event order by created_at loop
    ok := true;
    -- scope
    if aut.scope_project_id is not null and (ctx->>'project_id') is distinct from aut.scope_project_id::text then ok := false; end if;
    if aut.scope_department_id is not null and (ctx->>'department_id') is distinct from aut.scope_department_id::text then ok := false; end if;
    -- trigger config
    if ok and (aut.trigger_config->>'to_status') is not null and (ctx->>'status') is distinct from (aut.trigger_config->>'to_status') then ok := false; end if;
    if ok and (aut.trigger_config->>'from_status') is not null and (ctx->>'old_status') is distinct from (aut.trigger_config->>'from_status') then ok := false; end if;
    if ok and (aut.trigger_config->>'to_priority') is not null and (ctx->>'priority') is distinct from (aut.trigger_config->>'to_priority') then ok := false; end if;
    -- conditions
    if ok then
      for cond in select * from jsonb_array_elements(aut.conditions) loop
        if not eval_condition(cond, ctx) then ok := false; exit; end if;
      end loop;
    end if;
    if not ok then continue; end if;

    results := '[]'::jsonb;
    begin
      for act in select * from jsonb_array_elements(aut.actions) loop
        res := run_automation_action(aut, act, p_entity, ctx);
        results := results || jsonb_build_array(jsonb_build_object('type', act->>'type') || coalesce(res, '{}'::jsonb));
      end loop;
      insert into automation_runs (automation_id, org_id, event, entity_type, entity_id, status, details)
      values (aut.id, o, p_event, p_entity, nullif(ctx->>'id','')::uuid, 'ok', results);
      update automations set run_count = run_count + 1, last_run_at = now(), last_error = null where id = aut.id;
      fired := fired + 1;
    exception when others then
      insert into automation_runs (automation_id, org_id, event, entity_type, entity_id, status, details)
      values (aut.id, o, p_event, p_entity, nullif(ctx->>'id','')::uuid, 'error', jsonb_build_object('error', sqlerrm, 'partial', results));
      update automations set last_error = sqlerrm, last_run_at = now() where id = aut.id;
    end;
  end loop;
  perform set_config('ghl.automation_depth', depth::text, true);
  return fired;
end $$;

-- Event triggers ------------------------------------------------------------
create or replace function tasks_automation_events() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    perform fire_automations('task.created', 'task', to_jsonb(new));
  else
    if new.status is distinct from old.status then perform fire_automations('task.status_changed', 'task', to_jsonb(new), to_jsonb(old)); end if;
    if new.assignee_id is distinct from old.assignee_id then perform fire_automations('task.assigned', 'task', to_jsonb(new), to_jsonb(old)); end if;
    if new.priority is distinct from old.priority then perform fire_automations('task.priority_changed', 'task', to_jsonb(new), to_jsonb(old)); end if;
  end if;
  return null;
end $$;
create trigger tasks_automation_events after insert or update on tasks for each row execute function tasks_automation_events();

create or replace function approvals_automation_events() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then perform fire_automations('approval.requested', 'approval', to_jsonb(new));
  elsif new.status is distinct from old.status then perform fire_automations('approval.decided', 'approval', to_jsonb(new), to_jsonb(old)); end if;
  return null;
end $$;
create trigger approvals_automation_events after insert or update on approvals for each row execute function approvals_automation_events();

create or replace function projects_automation_events() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then perform fire_automations('project.created', 'project', to_jsonb(new));
  elsif new.status is distinct from old.status then perform fire_automations('project.status_changed', 'project', to_jsonb(new), to_jsonb(old)); end if;
  return null;
end $$;
create trigger projects_automation_events after insert or update on projects for each row execute function projects_automation_events();

create or replace function file_versions_automation_events() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare f files%rowtype;
begin
  if new.approval_status = 'approved' and old.approval_status is distinct from 'approved' then
    select * into f from files where id = new.file_id;
    perform fire_automations('file.version_approved', 'file', to_jsonb(f) || jsonb_build_object('version', new.version, 'title', f.name));
  end if;
  return null;
end $$;
create trigger file_versions_automation_events after update on file_versions for each row execute function file_versions_automation_events();

create or replace function decisions_automation_events() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform fire_automations('decision.recorded', 'decision', to_jsonb(new));
  return null;
end $$;
create trigger decisions_automation_events after insert on decisions for each row execute function decisions_automation_events();

create or replace function messages_automation_events() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare ch channels%rowtype;
begin
  if new.kind = 'system' then return null; end if;
  select * into ch from channels where id = new.channel_id;
  perform fire_automations('message.posted', 'message', to_jsonb(new) || jsonb_build_object('org_id', ch.org_id, 'channel_name', ch.name, 'project_id', ch.project_id, 'department_id', ch.department_id, 'title', left(new.body, 80)));
  return null;
end $$;
create trigger messages_automation_events after insert on messages for each row execute function messages_automation_events();

-- ---------------------------------------------------------------------------
-- RECURRING TASKS: when a recurring task is completed, the next occurrence is created
-- recurrence: {"every":"day"|"week"|"month", "interval":1, "weekdays":[1,3,5]?}
-- ---------------------------------------------------------------------------
create or replace function task_recurrence_next(base timestamptz, rec jsonb) returns timestamptz
language plpgsql immutable as $$
declare n int := greatest(coalesce((rec->>'interval')::int, 1), 1); e text := coalesce(rec->>'every','week'); nxt timestamptz := coalesce(base, now());
begin
  if e = 'day' then nxt := nxt + (n * interval '1 day');
  elsif e = 'week' then nxt := nxt + (n * interval '1 week');
  elsif e = 'month' then nxt := nxt + (n * interval '1 month');
  elsif e = 'quarter' then nxt := nxt + (n * interval '3 month');
  elsif e = 'year' then nxt := nxt + (n * interval '1 year');
  else nxt := nxt + interval '1 week'; end if;
  if nxt < now() then nxt := now() + interval '1 day'; end if;
  return nxt;
end $$;

create or replace function task_recurrence_spawn() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare nid uuid; nxt timestamptz;
begin
  if new.status = 'done' and old.status is distinct from 'done' and new.recurrence is not null and coalesce((new.recurrence->>'until')::date, '2999-01-01') >= current_date then
    nxt := task_recurrence_next(coalesce(new.due_date, now()), new.recurrence);
    insert into tasks (org_id, project_id, department_id, milestone_id, title, description, owner_id, assignee_id, delegated_by, approver_id, priority, due_date, estimated_hours, tags, requires_approval, recurrence, created_by, status)
    values (new.org_id, new.project_id, new.department_id, new.milestone_id, new.title, new.description, new.owner_id, new.assignee_id, new.delegated_by, new.approver_id, new.priority, nxt, new.estimated_hours, new.tags, new.requires_approval, new.recurrence, new.created_by, 'todo')
    returning id into nid;
    insert into task_checklist (task_id, label, position) select nid, label, position from task_checklist where task_id = new.id;
    update tasks set recurrence = null where id = new.id;   -- the completed instance stops recurring; the new one carries it on
  end if;
  return null;
end $$;
create trigger tasks_recurrence_spawn after update on tasks for each row execute function task_recurrence_spawn();

-- ---------------------------------------------------------------------------
-- HANDOFFS: department → department with an explicit package and acceptance
-- ---------------------------------------------------------------------------
create or replace function handoff_after_change() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare t tasks%rowtype; from_name text; to_name text; head uuid; u uuid;
begin
  select * into t from tasks where id = new.task_id;
  select name into from_name from departments where id = new.from_department_id;
  select name, head_id into to_name, head from departments where id = new.to_department_id;
  if tg_op = 'INSERT' then
    update tasks set department_id = new.to_department_id, waiting_on = 'employee', waiting_on_user_id = coalesce(new.to_user_id, head),
                     waiting_note = 'Handoff to ' || to_name || ' awaiting acceptance', status = case when status in ('done','cancelled') then status else 'waiting' end
      where id = new.task_id;
    for u in select distinct x from unnest(array[new.to_user_id, head] || array(select id from profiles where department_id = new.to_department_id and is_active and role in ('department_head','manager','team_lead'))) x where x is not null and x is distinct from new.from_user_id loop
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (u, 'action_required', 'Handoff from ' || coalesce(from_name,'a department') || ': ' || t.title, coalesce(new.package->>'brief', ''), '/tasks/' || t.id || '#handoff', 'handoff', new.id, new.from_user_id);
    end loop;
    insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, project_id, task_id, summary, new_value)
    values (new.org_id, new.from_user_id, 'handoff.created', 'handoff', new.id, t.project_id, t.id, from_name || ' → ' || to_name || ': ' || t.title, new.package);
  elsif new.status is distinct from old.status then
    if new.status = 'accepted' then
      update tasks set assignee_id = coalesce(new.to_user_id, new.responded_by), waiting_on = 'none', waiting_on_user_id = null, waiting_note = null,
                       status = case when status in ('done','cancelled') then status else 'in_progress' end,
                       approver_id = coalesce(nullif(new.package->>'approver_id','')::uuid, approver_id),
                       due_date = coalesce(nullif(new.package->>'deadline','')::timestamptz, due_date)
        where id = new.task_id;
      perform fire_automations('handoff.accepted', 'handoff', to_jsonb(new) || jsonb_build_object('title', t.title, 'project_id', t.project_id, 'department_id', new.to_department_id, 'assignee_id', coalesce(new.to_user_id, new.responded_by), 'owner_id', t.owner_id));
    elsif new.status = 'rejected' then
      update tasks set department_id = coalesce(new.from_department_id, department_id), waiting_on = 'none', waiting_on_user_id = null, waiting_note = null, status = case when status = 'waiting' then 'todo' else status end where id = new.task_id;
    end if;
    if new.from_user_id is not null then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (new.from_user_id, case when new.status = 'accepted' then 'information'::notification_kind else 'action_required'::notification_kind end,
              'Handoff ' || new.status::text || ' by ' || to_name || ': ' || t.title, new.note, '/tasks/' || t.id || '#handoff', 'handoff', new.id, new.responded_by);
    end if;
    insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, project_id, task_id, summary, new_value)
    values (new.org_id, new.responded_by, 'handoff.' || new.status::text, 'handoff', new.id, t.project_id, t.id, t.title, jsonb_build_object('note', new.note));
  end if;
  return null;
end $$;
create trigger handoffs_after_insert after insert on handoffs for each row execute function handoff_after_change();
create trigger handoffs_after_update after update on handoffs for each row execute function handoff_after_change();

-- ---------------------------------------------------------------------------
-- ESCALATION ENGINE (pg_cron every 15 minutes)
-- ---------------------------------------------------------------------------
create or replace function in_quiet_hours(uid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare p notification_prefs%rowtype; t time := (now() at time zone 'Asia/Kolkata')::time;
begin
  select * into p from notification_prefs where user_id = uid;
  if p.user_id is null then return t < time '08:00' or t >= time '21:00'; end if;
  if p.dnd_until is not null and p.dnd_until > now() then return true; end if;
  if p.quiet_start is null or p.quiet_end is null then return false; end if;
  if p.quiet_start < p.quiet_end then return t >= p.quiet_start and t < p.quiet_end;
  else return t >= p.quiet_start or t < p.quiet_end; end if;
end $$;

create or replace function run_escalations() returns int
language plpgsql security definer set search_path = public, extensions as $$
declare r escalation_rules%rowtype; t record; ctx jsonb; targets uuid[]; u uuid; tg text; sent int := 0; title text; body text; skipped boolean;
begin
  for r in select * from escalation_rules where enabled order by position loop
    for t in
      select tk.* from tasks tk
       where tk.org_id = r.org_id and tk.status not in ('done','cancelled') and tk.due_date is not null and tk.parent_id is null
         and (r.priority is null or tk.priority = r.priority)
         and now() >= tk.due_date + (r.hours_after_due * interval '1 hour')
         and (r.hours_after_due >= 0 or now() < tk.due_date)          -- reminders only before the deadline
         and not exists (select 1 from escalation_log l where l.task_id = tk.id and l.rule_id = r.id)
       limit 200
    loop
      ctx := automation_ctx('task', to_jsonb(t));
      targets := '{}';
      foreach tg in array r.notify loop targets := targets || resolve_targets(tg, ctx); end loop;
      targets := array(select distinct x from unnest(targets) x);
      skipped := false;
      if r.respect_quiet_hours and t.priority not in ('critical') then
        -- hold until quiet hours end (re-evaluated next run)
        if exists (select 1 from unnest(targets) x where in_quiet_hours(x)) then skipped := true; end if;
      end if;
      if skipped then continue; end if;
      title := case when r.hours_after_due < 0 then 'Due soon: ' || t.title else 'Overdue ' || (case when r.hours_after_due = 0 then 'now' else r.hours_after_due || 'h' end) || ': ' || t.title end;
      body := r.name || ' · ' || coalesce(ctx->>'project_name','') || ' · assignee ' || (ctx->>'assignee_name') || ' · due ' || (ctx->>'due');
      foreach u in array targets loop
        insert into notifications (user_id, kind, title, body, link, entity_type, entity_id)
        values (u, case when t.priority in ('critical','urgent') and r.hours_after_due >= 0 then 'critical'::notification_kind else r.kind end, title, body, '/tasks/' || t.id, 'task', t.id);
      end loop;
      insert into escalation_log (task_id, rule_id) values (t.id, r.id) on conflict do nothing;
      insert into audit_logs (org_id, action, entity_type, entity_id, project_id, task_id, summary, new_value)
      values (t.org_id, 'escalation.sent', 'task', t.id, t.project_id, t.id, r.name || ': ' || t.title, jsonb_build_object('rule', r.name, 'targets', targets));
      sent := sent + 1;
    end loop;
  end loop;
  return sent;
end $$;

-- ---------------------------------------------------------------------------
-- SCHEDULED AUTOMATIONS (trigger_type = 'schedule'; pg_cron every 5 minutes)
-- trigger_config: {"every":"hour"|"day"|"week"|"month","at":"09:00","weekday":1,"day":1}
-- ---------------------------------------------------------------------------
create or replace function schedule_next_run(cfg jsonb, from_ts timestamptz) returns timestamptz
language plpgsql immutable as $$
declare
  e text := coalesce(cfg->>'every','day');
  at_t time := coalesce((cfg->>'at')::time, time '09:00');
  wd int := coalesce((cfg->>'weekday')::int, 1);   -- 1 = Monday
  dom int := coalesce((cfg->>'day')::int, 1);
  local_now timestamp := from_ts at time zone 'Asia/Kolkata';
  cand timestamp;
begin
  if e = 'hour' then return from_ts + interval '1 hour'; end if;
  if e = 'day' then
    cand := date_trunc('day', local_now) + at_t;
    if cand <= local_now then cand := cand + interval '1 day'; end if;
  elsif e = 'week' then
    cand := date_trunc('week', local_now) + ((wd - 1) * interval '1 day') + at_t;
    if cand <= local_now then cand := cand + interval '1 week'; end if;
  elsif e = 'month' then
    cand := date_trunc('month', local_now) + ((least(dom, 28) - 1) * interval '1 day') + at_t;
    if cand <= local_now then cand := cand + interval '1 month'; end if;
  else
    cand := local_now + interval '1 day';
  end if;
  return cand at time zone 'Asia/Kolkata';
end $$;

create or replace function run_scheduled_automations() returns int
language plpgsql security definer set search_path = public, extensions as $$
declare aut automations%rowtype; act jsonb; ctx jsonb; res jsonb; results jsonb; fired int := 0;
begin
  for aut in select * from automations where enabled and trigger_type = 'schedule' and (next_run_at is null or next_run_at <= now()) loop
    if aut.next_run_at is null then
      update automations set next_run_at = schedule_next_run(aut.trigger_config, now()) where id = aut.id;
      continue;
    end if;
    ctx := jsonb_build_object('org_id', aut.org_id, 'id', aut.id, 'title', aut.name, 'link', '/automations', 'event', 'schedule',
                              'today', to_char(now() at time zone 'Asia/Kolkata', 'DD Mon YYYY'), 'project_id', aut.scope_project_id, 'department_id', aut.scope_department_id,
                              'owner_id', aut.created_by, 'assignee_id', aut.created_by);
    results := '[]'::jsonb;
    begin
      for act in select * from jsonb_array_elements(aut.actions) loop
        res := run_automation_action(aut, act, 'schedule', ctx);
        results := results || jsonb_build_array(jsonb_build_object('type', act->>'type') || coalesce(res, '{}'::jsonb));
      end loop;
      insert into automation_runs (automation_id, org_id, event, entity_type, status, details) values (aut.id, aut.org_id, 'schedule', 'schedule', 'ok', results);
      update automations set run_count = run_count + 1, last_run_at = now(), last_error = null, next_run_at = schedule_next_run(aut.trigger_config, now()) where id = aut.id;
      fired := fired + 1;
    exception when others then
      insert into automation_runs (automation_id, org_id, event, entity_type, status, details) values (aut.id, aut.org_id, 'schedule', 'schedule', 'error', jsonb_build_object('error', sqlerrm));
      update automations set last_error = sqlerrm, last_run_at = now(), next_run_at = schedule_next_run(aut.trigger_config, now()) where id = aut.id;
    end;
  end loop;
  return fired;
end $$;

-- keep next_run_at fresh when a schedule is edited
create or replace function automations_schedule_touch() returns trigger
language plpgsql as $$
begin
  if new.trigger_type = 'schedule' then
    if tg_op = 'INSERT' then
      new.next_run_at := schedule_next_run(new.trigger_config, now());
    elsif new.trigger_config is distinct from old.trigger_config or (new.enabled and not old.enabled) then
      new.next_run_at := schedule_next_run(new.trigger_config, now());
    end if;
  end if;
  return new;
end $$;
create trigger automations_schedule_touch before insert or update on automations for each row execute function automations_schedule_touch();

-- ---------------------------------------------------------------------------
-- DIGESTS (pg_cron daily 08:30 IST, weekly Monday 08:30 IST)
-- ---------------------------------------------------------------------------
create or replace function run_digests(p_mode text) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare p record; n int; kinds text; since timestamptz; made int := 0;
begin
  since := case when p_mode = 'weekly' then now() - interval '7 days' else now() - interval '1 day' end;
  for p in select np.*, pr.org_id from notification_prefs np join profiles pr on pr.id = np.user_id where np.mode = p_mode and pr.is_active loop
    select count(*), string_agg(kind::text || ':' || c, ', ') into n, kinds
      from (select kind, count(*) c from notifications where user_id = p.user_id and read_at is null and created_at >= since and kind::text = any(p.digest_kinds) group by kind) s;
    if coalesce(n,0) = 0 then continue; end if;
    insert into notifications (user_id, kind, title, body, link, entity_type)
    values (p.user_id, 'information', initcap(p_mode) || ' digest: ' || n || ' update' || case when n > 1 then 's' else '' end, 'Grouped: ' || kinds || '. Open your Inbox to review.', '/inbox', 'digest');
    made := made + 1;
  end loop;
  return made;
end $$;

-- ---------------------------------------------------------------------------
-- PUBLIC FEEDS / INGEST (anon-callable by token)
-- ---------------------------------------------------------------------------
create or replace function calendar_feed(p_token text)
returns table(uid text, summary text, description text, starts_at timestamptz, ends_at timestamptz, all_day boolean, url text)
language sql stable security definer set search_path = public, extensions as $$
  with me as (select user_id from calendar_feed_tokens where token = p_token)
  select 'evt-' || e.id::text, e.title, e.description, e.starts_at, coalesce(e.ends_at, e.starts_at + interval '1 hour'), e.all_day,
         case when e.meeting_id is not null then '/meetings/' || e.meeting_id when e.project_id is not null then '/projects/' || e.project_id when e.task_id is not null then '/tasks/' || e.task_id else '/calendar' end
    from calendar_events e, me
   where e.org_id = (select org_id from profiles where id = me.user_id)
     and e.starts_at > now() - interval '30 days'
     and (e.user_id is null or e.user_id = me.user_id)
     and (e.meeting_id is null or exists (select 1 from meeting_participants mp where mp.meeting_id = e.meeting_id and mp.user_id = me.user_id)
          or exists (select 1 from meetings m where m.id = e.meeting_id and m.organizer_id = me.user_id))
  union all
  select 'task-' || t.id::text, 'Due: ' || t.title, coalesce(t.description,''), t.due_date, t.due_date + interval '30 minutes', false, '/tasks/' || t.id
    from tasks t, me
   where t.assignee_id = me.user_id and t.status not in ('done','cancelled') and t.due_date is not null and t.due_date > now() - interval '7 days'
$$;

create or replace function ingest_webhook(p_token text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare integ integrations%rowtype; cfg jsonb; tid uuid; cid uuid; title text; body text;
begin
  select * into integ from integrations where provider = 'webhook_in' and enabled and config->>'token' = p_token;
  if integ.id is null then return jsonb_build_object('error', 'unknown token'); end if;
  cfg := integ.config;
  title := coalesce(p_payload->>'title', p_payload->'issue'->>'title', p_payload->'pull_request'->>'title', p_payload->>'subject', p_payload->>'text', 'Incoming: ' || integ.name);
  body := coalesce(p_payload->>'description', p_payload->>'body', p_payload->'issue'->>'body', p_payload->'pull_request'->>'body', p_payload->>'message', left(p_payload::text, 1000));
  update integrations set last_used_at = now() where id = integ.id;
  if coalesce(cfg->>'target','task') = 'message' then
    cid := nullif(cfg->>'channel_id','')::uuid;
    if cid is null then return jsonb_build_object('error', 'no channel configured'); end if;
    insert into messages (channel_id, author_id, kind, body) values (cid, integ.created_by, 'system', '🔗 ' || integ.name || ': ' || left(title, 200) || case when body is not null then E'\n' || left(body, 600) else '' end);
    insert into integration_deliveries (integration_id, event, payload, status) values (integ.id, 'inbound', p_payload, 'received');
    return jsonb_build_object('ok', true, 'channel_id', cid);
  end if;
  insert into tasks (org_id, project_id, department_id, title, description, owner_id, assignee_id, priority, status, created_by, tags)
  values (integ.org_id, nullif(cfg->>'project_id','')::uuid, nullif(cfg->>'department_id','')::uuid, left(title, 200), left(body, 4000), integ.created_by,
          nullif(cfg->>'assignee_id','')::uuid, coalesce((cfg->>'priority')::task_priority, 'normal'), 'todo', integ.created_by, array['integration', integ.provider])
  returning id into tid;
  insert into integration_deliveries (integration_id, event, payload, status) values (integ.id, 'inbound', p_payload, 'received');
  return jsonb_build_object('ok', true, 'task_id', tid);
end $$;

create or replace function my_calendar_token() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into calendar_feed_tokens (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select token into t from calendar_feed_tokens where user_id = auth.uid();
  return t;
end $$;

create or replace function rotate_calendar_token() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into calendar_feed_tokens (user_id) values (auth.uid()) on conflict (user_id) do update set token = encode(extensions.gen_random_bytes(24), 'hex'), created_at = now();
  select token into t from calendar_feed_tokens where user_id = auth.uid();
  return t;
end $$;

-- Test an automation against a sample task (manager+) without side effects beyond logging
create or replace function test_automation(p_id uuid, p_task uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare aut automations%rowtype; t tasks%rowtype; ctx jsonb; cond jsonb; failed jsonb := '[]'::jsonb;
begin
  if not is_manager_plus() then raise exception 'forbidden'; end if;
  select * into aut from automations where id = p_id and org_id = current_org();
  select * into t from tasks where id = p_task;
  if aut.id is null or t.id is null then raise exception 'not found'; end if;
  ctx := automation_ctx('task', to_jsonb(t));
  for cond in select * from jsonb_array_elements(aut.conditions) loop
    if not eval_condition(cond, ctx) then failed := failed || cond; end if;
  end loop;
  return jsonb_build_object('matches', jsonb_array_length(failed) = 0, 'failed_conditions', failed, 'context', ctx - 'description');
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table automations enable row level security;
alter table automation_runs enable row level security;
alter table escalation_rules enable row level security;
alter table escalation_log enable row level security;
alter table handoffs enable row level security;
alter table notification_prefs enable row level security;
alter table integrations enable row level security;
alter table integration_deliveries enable row level security;
alter table calendar_feed_tokens enable row level security;

create policy aut_read on automations for select to authenticated using (org_id = current_org() and (is_lead_plus() or created_by = auth.uid()));
create policy aut_write on automations for all to authenticated using (org_id = current_org() and is_manager_plus()) with check (org_id = current_org() and is_manager_plus());
create policy autr_read on automation_runs for select to authenticated using (org_id = current_org() and is_lead_plus());
create policy esc_read on escalation_rules for select to authenticated using (org_id = current_org() and is_active_member());
create policy esc_write on escalation_rules for all to authenticated using (org_id = current_org() and is_admin()) with check (org_id = current_org() and is_admin());
create policy escl_read on escalation_log for select to authenticated using (can_view_task(task_id));
create policy ho_read on handoffs for select to authenticated using (
  org_id = current_org() and (from_user_id = auth.uid() or to_user_id = auth.uid() or is_manager_plus()
    or to_department_id = current_department() or from_department_id = current_department() or can_view_task(task_id))
);
create policy ho_insert on handoffs for insert to authenticated with check (org_id = current_org() and from_user_id = auth.uid() and can_edit_task(task_id));
create policy ho_update on handoffs for update to authenticated using (
  org_id = current_org() and (is_manager_plus() or to_user_id = auth.uid() or (to_department_id = current_department() and is_lead_plus()) or from_user_id = auth.uid())
);
create policy np_own on notification_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy integ_admin on integrations for all to authenticated using (org_id = current_org() and is_admin()) with check (org_id = current_org() and is_admin());
create policy integ_names on integrations for select to authenticated using (org_id = current_org() and is_manager_plus());
create policy integd_admin on integration_deliveries for select to authenticated using (exists (select 1 from integrations i where i.id = integration_id and i.org_id = current_org() and is_admin()));
create policy cft_own on calendar_feed_tokens for select to authenticated using (user_id = auth.uid());

-- function grants
revoke execute on function fire_automations(text,text,jsonb,jsonb), run_automation_action(automations,jsonb,text,jsonb), run_escalations(), run_scheduled_automations(), run_digests(text),
  resolve_targets(text,jsonb), automation_ctx(text,jsonb), render_tpl(text,jsonb), eval_condition(jsonb,jsonb), person_name(uuid), in_quiet_hours(uuid),
  task_recurrence_next(timestamptz,jsonb), schedule_next_run(jsonb,timestamptz), calendar_feed(text), ingest_webhook(text,jsonb), my_calendar_token(), rotate_calendar_token(), test_automation(uuid,uuid)
  from anon, public, authenticated;
grant execute on function my_calendar_token(), rotate_calendar_token(), test_automation(uuid,uuid), task_recurrence_next(timestamptz,jsonb), schedule_next_run(jsonb,timestamptz), render_tpl(text,jsonb) to authenticated;
grant execute on function calendar_feed(text), ingest_webhook(text,jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- CRON
-- ---------------------------------------------------------------------------
select cron.schedule('ghl_escalations', '*/15 * * * *', $$select run_escalations()$$);
select cron.schedule('ghl_scheduled_automations', '*/5 * * * *', $$select run_scheduled_automations()$$);
select cron.schedule('ghl_daily_digest', '0 3 * * *', $$select run_digests('daily')$$);      -- 08:30 IST
select cron.schedule('ghl_weekly_digest', '0 3 * * 1', $$select run_digests('weekly')$$);

-- ---------------------------------------------------------------------------
-- SEED: default escalation ladder (section 22 of the brief)
-- ---------------------------------------------------------------------------
insert into escalation_rules (org_id, name, priority, hours_after_due, notify, kind, position) values
 ('00000000-0000-0000-0000-000000000001', 'Reminder: due within 24 hours', null, -24, '{assignee}', 'deadline', 0),
 ('00000000-0000-0000-0000-000000000001', 'Overdue: notify employee', null, 0, '{assignee}', 'deadline', 1),
 ('00000000-0000-0000-0000-000000000001', 'Overdue 24h: notify manager & owner', null, 24, '{manager,owner,delegator}', 'action_required', 2),
 ('00000000-0000-0000-0000-000000000001', 'Critical overdue 4h: notify department head', 'critical', 4, '{department_head,manager}', 'critical', 3),
 ('00000000-0000-0000-0000-000000000001', 'Urgent overdue 8h: notify department head', 'urgent', 8, '{department_head,manager}', 'critical', 4),
 ('00000000-0000-0000-0000-000000000001', 'Overdue 72h: management alert', null, 72, '{executives,department_head}', 'critical', 5);
