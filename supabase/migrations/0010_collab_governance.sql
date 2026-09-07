-- Phase 4 wave 1 (part 2): GHL Common, groups & temporary access, help desk / service catalog,
-- department status, access requests & grants, permission explanation, view-as, feature flags,
-- Company Now, "what changed", collaboration map.

-- ---------------------------------------------------------------------------
-- GROUPS: ownership, purpose, visibility, temporary rooms, temporary access
-- ---------------------------------------------------------------------------
alter table channels
  add column if not exists owner_id uuid references profiles(id) on delete set null,
  add column if not exists co_owner_id uuid references profiles(id) on delete set null,
  add column if not exists purpose text,
  add column if not exists visibility text not null default 'invite_only',   -- company_open | department_open | invite_only | private | confidential | executive_only
  add column if not exists archive_at timestamptz,
  add column if not exists archived boolean not null default false,
  add column if not exists settings jsonb not null default '{}'::jsonb,       -- {post: 'members'|'owners', invite: 'members'|'owners', share_files: bool, guests: bool}
  add column if not exists department_ids uuid[] not null default '{}',
  add column if not exists help_request_id uuid;
update channels set owner_id = coalesce(owner_id, created_by);
update channels set visibility = 'company_open' where type in ('company','announcement') and not is_private;
update channels set visibility = 'department_open' where type = 'department' and not is_private;

alter table channel_members
  add column if not exists expires_at timestamptz,
  add column if not exists invited_by uuid references profiles(id) on delete set null,
  add column if not exists invite_reason text;

-- can_view_channel: respect archived/expired membership and open visibilities
create or replace function is_channel_member(c uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from channel_members where channel_id = c and user_id = auth.uid() and (expires_at is null or expires_at > now()))
$$;

create or replace function can_view_channel(c uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from channels ch
    where ch.id = c and ch.org_id = current_org()
      and (
        is_channel_member(c)
        or (ch.visibility = 'company_open' and is_internal())
        or (ch.visibility = 'department_open' and is_internal() and (ch.department_id = current_department() or ch.department_id is null or current_department() = any(ch.department_ids)))
        or (ch.type = 'project' and ch.project_id is not null and can_view_project(ch.project_id))
        or (ch.visibility = 'executive_only' and is_admin())
        or has_admin_perm('communication.manage')
      )
  )
$$;

/** Bring someone in: add a person to a channel with context; optional expiry; notifies with reason. */
create or replace function bring_in(p_channel uuid, p_user uuid, p_reason text default null, p_expires_at timestamptz default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare ch channels%rowtype; inviter text;
begin
  select * into ch from channels where id = p_channel;
  if ch.id is null or not can_view_channel(p_channel) then raise exception 'channel not accessible'; end if;
  if ch.visibility in ('confidential','executive_only') and not (ch.owner_id = auth.uid() or ch.co_owner_id = auth.uid() or is_admin()) then raise exception 'only owners can invite into this room'; end if;
  insert into channel_members (channel_id, user_id, invited_by, invite_reason, expires_at)
  values (p_channel, p_user, auth.uid(), p_reason, p_expires_at)
  on conflict (channel_id, user_id) do update set expires_at = excluded.expires_at, invited_by = excluded.invited_by, invite_reason = excluded.invite_reason;
  select full_name into inviter from profiles where id = auth.uid();
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
  values (p_user, 'action_required', coalesce(inviter,'Someone') || ' brought you into #' || ch.name, coalesce(p_reason, 'Open the room and use Catch me up.') || case when p_expires_at is not null then ' · access until ' || to_char(p_expires_at at time zone 'Asia/Kolkata','DD Mon HH24:MI') else '' end, '/chat/' || ch.id || '?catchup=1', 'channel', ch.id, auth.uid());
  insert into messages (channel_id, author_id, kind, body) values (p_channel, auth.uid(), 'system', person_name(auth.uid()) || ' brought ' || person_name(p_user) || ' in' || coalesce(': ' || p_reason, ''));
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value)
  values (ch.org_id, auth.uid(), 'channel.member_invited', 'channel', ch.id, '#' || ch.name || ' ← ' || person_name(p_user), jsonb_build_object('reason', p_reason, 'expires_at', p_expires_at));
end $$;

/** Invite a whole department: notifies its head / on-duty person and available members. */
create or replace function invite_department(p_channel uuid, p_department uuid, p_reason text default null) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare ch channels%rowtype; d departments%rowtype; u uuid; n int := 0;
begin
  select * into ch from channels where id = p_channel;
  if ch.id is null or not can_view_channel(p_channel) then raise exception 'channel not accessible'; end if;
  select * into d from departments where id = p_department;
  for u in select distinct x from unnest(array[d.head_id, d.on_duty_user_id]) x where x is not null loop
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (u, 'help_request', d.name || ' invited into #' || ch.name, coalesce(p_reason,''), '/chat/' || ch.id || '?join=1', 'channel', ch.id, auth.uid());
    n := n + 1;
  end loop;
  update channels set department_ids = array(select distinct x from unnest(department_ids || p_department) x) where id = p_channel;
  insert into messages (channel_id, author_id, kind, body) values (p_channel, auth.uid(), 'system', person_name(auth.uid()) || ' invited the ' || d.name || ' department' || coalesce(': ' || p_reason, ''));
  return n;
end $$;

/** Convert a channel discussion into a project (keeps the conversation as the project channel). */
create or replace function convert_channel_to_project(p_channel uuid, p_name text, p_due date default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare ch channels%rowtype; pid uuid;
begin
  select * into ch from channels where id = p_channel;
  if ch.id is null or not can_view_channel(p_channel) then raise exception 'channel not accessible'; end if;
  if ch.project_id is not null then return ch.project_id; end if;
  insert into projects (org_id, name, description, department_id, owner_id, status, due_date, created_by)
  values (ch.org_id, p_name, 'Started from #' || ch.name, ch.department_id, auth.uid(), 'planning', p_due, auth.uid()) returning id into pid;
  -- the trigger created a fresh project channel; replace it with the existing conversation
  delete from channels where project_id = pid and type = 'project' and id <> p_channel;
  update channels set project_id = pid, type = 'project', name = p_name where id = p_channel;
  insert into project_members (project_id, user_id, role)
  select pid, user_id, 'member' from channel_members where channel_id = p_channel on conflict do nothing;
  insert into messages (channel_id, author_id, kind, body) values (p_channel, auth.uid(), 'system', 'This conversation is now the project room for ' || p_name || ' [/projects/' || pid || ']');
  return pid;
end $$;

-- cron: archive temporary rooms, expire temporary access
create or replace function expire_collaboration() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; m int;
begin
  update channels set archived = true where archive_at is not null and archive_at <= now() and not archived;
  get diagnostics m = row_count; n := n + m;
  delete from channel_members where expires_at is not null and expires_at <= now();
  get diagnostics m = row_count; n := n + m;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- DEPARTMENT STATUS, ON-DUTY, ESCALATION MATRIX, SERVICE CATALOG, HELP REQUESTS
-- ---------------------------------------------------------------------------
alter table departments
  add column if not exists status text not null default 'available',        -- available | busy | limited | emergency_only | offline
  add column if not exists on_duty_user_id uuid references profiles(id) on delete set null,
  add column if not exists escalation_matrix uuid[] not null default '{}',   -- ordered user ids after the owner: team lead → manager → head → admin
  add column if not exists services_intro text,
  add column if not exists settings jsonb not null default '{}'::jsonb;

create table service_catalog (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  name text not null,
  description text,
  form_schema jsonb not null default '[]'::jsonb,        -- [{key,label,type:text|textarea|select|date|number|file,options[],required}]
  sla_ack_minutes int not null default 480,
  sla_resolve_minutes int,
  default_priority task_priority not null default 'normal',
  default_owner_id uuid references profiles(id) on delete set null,
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index service_catalog_dept_idx on service_catalog(department_id) where active;

create type help_status as enum ('new','accepted','working','waiting','completed','declined');
create table help_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  service_id uuid references service_catalog(id) on delete set null,
  requester_id uuid not null references profiles(id) on delete cascade,
  requester_department_id uuid references departments(id) on delete set null,
  title text not null,
  details text,
  priority task_priority not null default 'normal',
  form_data jsonb not null default '{}'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  status help_status not null default 'new',
  owner_id uuid references profiles(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  channel_id uuid references channels(id) on delete set null,
  deadline timestamptz,
  ack_due_at timestamptz,
  acknowledged_at timestamptz,
  completed_at timestamptz,
  escalation_level int not null default 0,
  visible_on_board boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index help_requests_dept_idx on help_requests(department_id, status, created_at desc);
create index help_requests_requester_idx on help_requests(requester_id);
create trigger help_requests_updated_at before update on help_requests for each row execute function set_updated_at();

create or replace function help_request_after_change() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare d departments%rowtype; svc service_catalog%rowtype; u uuid; cid uuid; rname text;
begin
  select * into d from departments where id = new.department_id;
  rname := person_name(new.requester_id);
  if tg_op = 'INSERT' then
    if new.service_id is not null then select * into svc from service_catalog where id = new.service_id; end if;
    update help_requests set ack_due_at = now() + (coalesce(svc.sla_ack_minutes, 480) * interval '1 minute'),
                             requester_department_id = coalesce(new.requester_department_id, (select department_id from profiles where id = new.requester_id)),
                             owner_id = coalesce(new.owner_id, svc.default_owner_id)
      where id = new.id;
    for u in select distinct x from unnest(array[coalesce(new.owner_id, svc.default_owner_id), d.on_duty_user_id, d.head_id]) x where x is not null loop
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (u, 'help_request', d.name || ' request from ' || rname || ': ' || new.title, left(coalesce(new.details,''), 140) || case when new.deadline is not null then ' · needed by ' || to_char(new.deadline at time zone 'Asia/Kolkata','DD Mon HH24:MI') else '' end, '/help/' || new.id, 'help_request', new.id, new.requester_id);
    end loop;
    insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value)
    values (new.org_id, new.requester_id, 'help.requested', 'help_request', new.id, d.name || ': ' || new.title, jsonb_build_object('priority', new.priority));
    perform fire_automations('help.requested', 'help_request', to_jsonb(new) || jsonb_build_object('title', new.title, 'assignee_id', new.owner_id, 'owner_id', new.requester_id, 'link', '/help/' || new.id));
    return null;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'accepted' and old.status = 'new' then
      -- dedicated conversation room: requester + owner (+ department head can join)
      if new.channel_id is null then
        insert into channels (org_id, type, name, purpose, visibility, owner_id, department_id, help_request_id, created_by, archive_at)
        values (new.org_id, 'help', left(new.title, 60), 'Help request from ' || rname, 'invite_only', coalesce(new.owner_id, auth.uid()), new.department_id, new.id, coalesce(new.owner_id, auth.uid()), null)
        returning id into cid;
        insert into channel_members (channel_id, user_id) values (cid, new.requester_id) on conflict do nothing;
        if new.owner_id is not null then insert into channel_members (channel_id, user_id) values (cid, new.owner_id) on conflict do nothing; end if;
        update help_requests set channel_id = cid, acknowledged_at = coalesce(acknowledged_at, now()) where id = new.id;
        insert into messages (channel_id, author_id, kind, body) values (cid, coalesce(new.owner_id, auth.uid()), 'system', 'Request accepted: ' || new.title || E'\n' || coalesce(new.details,''));
      end if;
    end if;
    if new.status in ('accepted','working','waiting','completed','declined') then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (new.requester_id, case when new.status = 'completed' then 'information'::notification_kind else 'help_request'::notification_kind end,
              d.name || ' ' || replace(new.status::text,'_',' ') || ': ' || new.title, case when new.owner_id is not null then 'Owner: ' || person_name(new.owner_id) else null end, '/help/' || new.id, 'help_request', new.id, auth.uid());
    end if;
    if new.status = 'completed' then update help_requests set completed_at = coalesce(completed_at, now()) where id = new.id; end if;
    if new.status = 'completed' and new.channel_id is not null then update channels set archive_at = now() + interval '7 days' where id = new.channel_id; end if;
    insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary)
    values (new.org_id, auth.uid(), 'help.' || new.status::text, 'help_request', new.id, d.name || ': ' || new.title);
  end if;
  if new.owner_id is distinct from old.owner_id and new.owner_id is not null and new.owner_id is distinct from auth.uid() then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (new.owner_id, 'action_required', 'You own the request: ' || new.title, 'From ' || rname, '/help/' || new.id, 'help_request', new.id, auth.uid());
    if new.channel_id is not null then insert into channel_members (channel_id, user_id) values (new.channel_id, new.owner_id) on conflict do nothing; end if;
  end if;
  return null;
end $$;
create trigger help_requests_after_insert after insert on help_requests for each row execute function help_request_after_change();
create trigger help_requests_after_update after update on help_requests for each row execute function help_request_after_change();

/** SLA escalation for unacknowledged requests (cron every 15 min). */
create or replace function escalate_help_requests() returns int
language plpgsql security definer set search_path = public, extensions as $$
declare r record; d departments%rowtype; target uuid; lvl int; n int := 0;
begin
  for r in select * from help_requests where status = 'new' and ack_due_at is not null and ack_due_at <= now() loop
    select * into d from departments where id = r.department_id;
    lvl := r.escalation_level + 1;
    target := case when lvl <= coalesce(array_length(d.escalation_matrix,1),0) then d.escalation_matrix[lvl]
                   when lvl = coalesce(array_length(d.escalation_matrix,1),0) + 1 then d.head_id
                   else null end;
    if target is null then
      -- last resort: executives, once
      if lvl = coalesce(array_length(d.escalation_matrix,1),0) + 2 then
        insert into notifications (user_id, kind, title, body, link, entity_type, entity_id)
        select id, 'critical', 'Unanswered ' || d.name || ' request: ' || r.title, 'No one accepted within SLA', '/help/' || r.id, 'help_request', r.id
          from profiles where org_id = r.org_id and is_active and role in ('super_admin','director','executive');
        update help_requests set escalation_level = lvl, ack_due_at = null where id = r.id;
      else
        update help_requests set ack_due_at = null where id = r.id;
      end if;
      continue;
    end if;
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id)
    values (target, 'critical', 'Escalated: ' || d.name || ' request not acknowledged — ' || r.title, 'From ' || person_name(r.requester_id) || ' · level ' || lvl, '/help/' || r.id, 'help_request', r.id);
    update help_requests set escalation_level = lvl, ack_due_at = now() + interval '2 hours' where id = r.id;
    insert into audit_logs (org_id, action, entity_type, entity_id, summary, new_value) values (r.org_id, 'help.escalated', 'help_request', r.id, r.title, jsonb_build_object('level', lvl, 'to', target));
    n := n + 1;
  end loop;
  return n;
end $$;

/** Department availability now: people available, on-duty, avg first-response minutes (30d). */
create or replace function department_availability()
returns table(department_id uuid, name text, slug text, color text, status text, on_duty_user_id uuid, available int, busy int, on_leave int, open_requests int, avg_ack_minutes int, services int)
language sql stable security definer set search_path = public as $$
  select d.id, d.name, d.slug, d.color, d.status, d.on_duty_user_id,
    (select count(*)::int from profiles p where p.department_id = d.id and p.is_active and p.presence in ('available','remote')),
    (select count(*)::int from profiles p where p.department_id = d.id and p.is_active and p.presence in ('busy','in_meeting','focus','on_call','dnd')),
    (select count(*)::int from profiles p where p.department_id = d.id and p.is_active and p.presence = 'leave'),
    (select count(*)::int from help_requests h where h.department_id = d.id and h.status in ('new','accepted','working','waiting')),
    (select coalesce(avg(extract(epoch from (h.acknowledged_at - h.created_at))/60), 0)::int from help_requests h where h.department_id = d.id and h.acknowledged_at is not null and h.created_at > now() - interval '30 days'),
    (select count(*)::int from service_catalog s where s.department_id = d.id and s.active)
  from departments d where d.org_id = current_org() and is_active_member() order by d.position
$$;

alter table service_catalog enable row level security;
alter table help_requests enable row level security;
create policy sc_read on service_catalog for select to authenticated using (org_id = current_org() and is_active_member());
create policy sc_write on service_catalog for all to authenticated
  using (org_id = current_org() and (is_admin() or has_admin_perm('department.manage') or (department_id = current_department() and is_lead_plus())))
  with check (org_id = current_org() and (is_admin() or has_admin_perm('department.manage') or (department_id = current_department() and is_lead_plus())));
create policy hr_read on help_requests for select to authenticated using (
  org_id = current_org() and (requester_id = auth.uid() or owner_id = auth.uid() or department_id = current_department() or is_manager_plus()
    or (visible_on_board and status in ('new','waiting') and is_internal()))
);
create policy hr_insert on help_requests for insert to authenticated with check (org_id = current_org() and requester_id = auth.uid() and is_active_member());
create policy hr_update on help_requests for update to authenticated using (
  org_id = current_org() and (owner_id = auth.uid() or department_id = current_department() or is_manager_plus() or has_admin_perm('department.manage') or (requester_id = auth.uid() and status = 'new'))
);
drop policy if exists dept_write on departments;
create policy dept_write on departments for all to authenticated
  using (org_id = current_org() and (is_admin() or has_admin_perm('department.manage') or (id = current_department() and is_lead_plus())))
  with check (org_id = current_org() and (is_admin() or has_admin_perm('department.manage') or (id = current_department() and is_lead_plus())));

-- department heads can only change status/on_duty/escalation/services text; role/name changes stay with admins
create or replace function department_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() or has_admin_perm('department.manage')) then
    new.name := old.name; new.slug := old.slug; new.color := old.color; new.position := old.position; new.org_id := old.org_id; new.head_id := old.head_id;
  end if;
  return new;
end $$;
create trigger departments_guard before update on departments for each row execute function department_guard();

-- Seed service catalog (IT / Design / Content / HR / Finance / Admin)
insert into service_catalog (org_id, department_id, name, description, form_schema, sla_ack_minutes, default_priority, position)
select '00000000-0000-0000-0000-000000000001', d.id, s.name, s.description, s.form::jsonb, s.sla, s.prio::task_priority, s.pos
from departments d
join (values
  ('technology','Laptop / device problem','Hardware, performance or peripherals.','[{"key":"device","label":"Device","type":"text","required":true},{"key":"issue","label":"What is wrong?","type":"textarea","required":true}]',60,'high',0),
  ('technology','Software / system access','Accounts, tools, folders, VPN.','[{"key":"system","label":"System or tool","type":"text","required":true},{"key":"level","label":"Access level","type":"select","options":["View","Edit","Admin"],"required":true},{"key":"reason","label":"Why do you need it?","type":"textarea","required":true}]',480,'normal',1),
  ('technology','Website / app bug','Something is broken for users.','[{"key":"where","label":"Where (URL / screen)","type":"text","required":true},{"key":"steps","label":"Steps to reproduce","type":"textarea","required":true},{"key":"impact","label":"Who is affected?","type":"select","options":["Only me","Some users","All users / production down"],"required":true}]',15,'critical',2),
  ('technology','Development request','New feature, integration or change.','[{"key":"what","label":"What do you need?","type":"textarea","required":true},{"key":"why","label":"Business reason","type":"textarea"},{"key":"by","label":"Needed by","type":"date"}]',480,'normal',3),
  ('technology','Password reset','Reset or unlock an account.','[{"key":"account","label":"Account / system","type":"text","required":true}]',30,'high',4),
  ('design','Poster / creative','Print or social creative.','[{"key":"size","label":"Size / platform","type":"text","required":true},{"key":"copy","label":"Final copy / headline","type":"textarea","required":true},{"key":"refs","label":"References (links)","type":"textarea"},{"key":"by","label":"Deadline","type":"date","required":true}]',240,'normal',0),
  ('design','Presentation','Deck design or polish.','[{"key":"slides","label":"Approx. slides","type":"number"},{"key":"purpose","label":"Audience & purpose","type":"textarea","required":true},{"key":"by","label":"Deadline","type":"date","required":true}]',240,'normal',1),
  ('design','Video','Edit, motion or animation.','[{"key":"length","label":"Length","type":"text"},{"key":"brief","label":"Brief","type":"textarea","required":true},{"key":"by","label":"Deadline","type":"date","required":true}]',480,'normal',2),
  ('design','Website / UI graphic','Banners, icons, UI assets.','[{"key":"where","label":"Where will it be used?","type":"text","required":true},{"key":"dimensions","label":"Dimensions","type":"text","required":true},{"key":"brief","label":"Brief","type":"textarea","required":true}]',240,'normal',3),
  ('content','Copywriting','Website, ads, brochure copy.','[{"key":"audience","label":"Audience","type":"text","required":true},{"key":"objective","label":"Objective / CTA","type":"textarea","required":true},{"key":"length","label":"Length","type":"text"},{"key":"by","label":"Deadline","type":"date","required":true}]',240,'normal',0),
  ('content','Proofreading','Review and correct a draft.','[{"key":"link","label":"Document link","type":"text","required":true},{"key":"by","label":"Deadline","type":"date"}]',120,'normal',1),
  ('content','Article / blog','Long-form content.','[{"key":"topic","label":"Topic","type":"text","required":true},{"key":"angle","label":"Angle / key points","type":"textarea"},{"key":"by","label":"Deadline","type":"date"}]',480,'normal',2),
  ('content','Script','Video or presentation script.','[{"key":"purpose","label":"Purpose","type":"textarea","required":true},{"key":"length","label":"Length","type":"text"},{"key":"by","label":"Deadline","type":"date"}]',480,'normal',3),
  ('hr','Document request','Letters, certificates, payslip copies.','[{"key":"doc","label":"Document","type":"select","options":["Employment letter","Address proof","Experience letter","Salary certificate","Other"],"required":true},{"key":"note","label":"Details","type":"textarea"}]',480,'normal',0),
  ('hr','Policy question','Ask about a policy or process.','[{"key":"question","label":"Your question","type":"textarea","required":true}]',480,'normal',1),
  ('hr','Attendance correction','Missed clock-in/out or wrong status.','[{"key":"day","label":"Date","type":"date","required":true},{"key":"what","label":"What should it be?","type":"textarea","required":true}]',480,'normal',2),
  ('finance','Reimbursement','Claim an expense.','[{"key":"amount","label":"Amount (₹)","type":"number","required":true},{"key":"purpose","label":"Purpose","type":"textarea","required":true},{"key":"date","label":"Expense date","type":"date","required":true}]',480,'normal',0),
  ('finance','Purchase request','Buy something for work.','[{"key":"item","label":"Item","type":"text","required":true},{"key":"cost","label":"Estimated cost (₹)","type":"number","required":true},{"key":"vendor","label":"Vendor","type":"text"},{"key":"reason","label":"Reason","type":"textarea","required":true}]',480,'normal',1),
  ('admin','Equipment / stationery','Office supplies and equipment.','[{"key":"item","label":"What do you need?","type":"text","required":true},{"key":"qty","label":"Quantity","type":"number"}]',480,'low',0),
  ('admin','Meeting room / visitor','Book a room or register a visitor.','[{"key":"when","label":"When","type":"text","required":true},{"key":"details","label":"Details","type":"textarea"}]',120,'normal',1)
) as s(slug, name, description, form, sla, prio, pos) on s.slug = d.slug
where d.org_id = '00000000-0000-0000-0000-000000000001';

-- GHL COMMON channels
insert into channels (org_id, type, name, slug, description, visibility, is_readonly)
select '00000000-0000-0000-0000-000000000001', 'company', v.name, v.slug, v.description, 'company_open', false
from (values
  ('ideas','ideas','Ideas, suggestions and what-ifs'),
  ('help','help','Ask the company for help — anyone can answer'),
  ('creative','creative','Design, content and brand conversations'),
  ('events','events','Company events and celebrations'),
  ('random','random','Water-cooler talk'),
  ('learning','learning','Courses, articles, things worth knowing'),
  ('wins','wins','Client wins, launches and thank-yous'),
  ('important-updates','important-updates','Important operational updates')
) as v(name, slug, description)
where not exists (select 1 from channels c where c.org_id = '00000000-0000-0000-0000-000000000001' and c.slug = v.slug);
update channels set type = 'social' where slug in ('random','events','wins');
-- everyone joins company-open channels automatically
insert into channel_members (channel_id, user_id)
select c.id, p.id from channels c join profiles p on p.org_id = c.org_id and p.is_active
 where c.visibility = 'company_open' on conflict do nothing;

-- new users auto-join company-open channels (replaces the older join in handle_new_user for future signups)
create or replace function autojoin_common() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_active and (tg_op = 'INSERT' or not old.is_active) then
    insert into channel_members (channel_id, user_id) select c.id, new.id from channels c where c.org_id = new.org_id and c.visibility = 'company_open' and not c.archived on conflict do nothing;
  end if;
  return null;
end $$;
create trigger profiles_autojoin_common after insert or update of is_active on profiles for each row execute function autojoin_common();

-- ---------------------------------------------------------------------------
-- ACCESS REQUESTS & GRANTS (Request Access instead of Access Denied)
-- ---------------------------------------------------------------------------
create table access_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  requester_id uuid not null references profiles(id) on delete cascade,
  resource_type text not null,          -- project | file | channel | department | task | wiki | folder | dataset
  resource_id uuid,
  resource_label text not null,
  level text not null default 'view',   -- view | comment | edit | download
  reason text not null,
  duration text not null default 'until_date',   -- once | until_date | project_active | permanent
  until_at timestamptz,
  project_id uuid references projects(id) on delete set null,
  status approval_status not null default 'pending',
  approver_id uuid references profiles(id) on delete set null,
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  granted_level text,
  granted_until timestamptz,
  risk text not null default 'normal',  -- low | normal | high
  created_at timestamptz not null default now()
);
create index access_requests_status_idx on access_requests(org_id, status, created_at desc);

create table access_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  resource_type text not null,
  resource_id uuid not null,
  level text not null default 'view',
  expires_at timestamptz,
  granted_by uuid references profiles(id) on delete set null,
  source_request_id uuid references access_requests(id) on delete set null,
  reason text,
  revoked_at timestamptz,
  revoked_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index access_grants_user_idx on access_grants(user_id, resource_type, resource_id) where revoked_at is null;

create or replace function has_grant(p_type text, p_id uuid, p_level text default 'view') returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from access_grants g where g.user_id = auth.uid() and g.resource_type = p_type and g.resource_id = p_id and g.revoked_at is null
                   and (g.expires_at is null or g.expires_at > now())
                   and (p_level = 'view' or g.level = p_level or g.level = 'edit' or (p_level = 'comment' and g.level in ('edit','download'))))
$$;

-- grants extend project & file visibility
create or replace function can_view_project(p uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from projects pr
    where pr.id = p
      and pr.org_id = current_org()
      and (
        is_project_member(p)
        or is_admin()
        or has_admin_perm('projects.manage')
        or has_grant('project', p)
        or (pr.classification in ('public','internal') and is_internal())
        or (pr.classification = 'confidential' and (
              is_manager_plus()
              or (pr.department_id is not null and pr.department_id = current_department()
                  and is_lead_plus())))
      )
  )
$$;
drop policy if exists files_read on files;
create policy files_read on files for select to authenticated using (
  org_id = current_org() and (
    has_grant('file', id)
    or (can_view_classification(classification)
        and (project_id is null or can_view_project(project_id))
        and (task_id is null or can_view_task(task_id)))
  )
);

/** Who approves a request: data owner (project owner / file owner / channel owner / department head), high risk → primary admin. */
create or replace function access_request_route() returns trigger
language plpgsql security definer set search_path = public as $$
declare cls classification; approver uuid; risk text := 'normal';
begin
  if new.resource_type = 'project' then
    select classification, owner_id into cls, approver from projects where id = new.resource_id;
  elsif new.resource_type = 'file' then
    select f.classification, f.owner_id into cls, approver from files f where f.id = new.resource_id;
  elsif new.resource_type = 'channel' then
    select c.classification, c.owner_id into cls, approver from channels c where c.id = new.resource_id;
  elsif new.resource_type = 'department' then
    select head_id into approver from departments where id = new.resource_id; cls := 'confidential';
  end if;
  if cls in ('highly_confidential','board_only') or new.level = 'download' and cls = 'confidential' then
    risk := 'high';
    approver := coalesce((select (settings->>'primary_admin_id')::uuid from organizations where id = new.org_id), approver);
  elsif cls = 'confidential' then risk := 'normal';
  else risk := 'low'; end if;
  new.risk := risk;
  new.approver_id := coalesce(new.approver_id, approver, (select (settings->>'primary_admin_id')::uuid from organizations where id = new.org_id));
  return new;
end $$;
create trigger access_requests_route before insert on access_requests for each row execute function access_request_route();

create or replace function access_request_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare until_ts timestamptz; u uuid;
begin
  if tg_op = 'INSERT' then
    if new.approver_id is not null then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (new.approver_id, 'security', 'Access request: ' || person_name(new.requester_id) || ' → ' || new.resource_label, new.reason || ' · ' || new.level || ' · ' || new.duration || case when new.risk = 'high' then ' · HIGH RISK' else '' end, '/admin?tab=access', 'access_request', new.id, new.requester_id);
    end if;
    -- security admins also see high-risk requests
    if new.risk = 'high' then
      for u in select a.user_id from admin_assignments a join admin_roles r on r.id = a.admin_role_id where ('access.approve' = any(r.permissions) or '*' = any(r.permissions)) and a.user_id <> coalesce(new.approver_id, '00000000-0000-0000-0000-000000000000') loop
        insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
        values (u, 'security', 'High-risk access request: ' || new.resource_label, person_name(new.requester_id) || ' · ' || new.reason, '/admin?tab=access', 'access_request', new.id, new.requester_id);
      end loop;
    end if;
    insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value)
    values (new.org_id, new.requester_id, 'access.requested', new.resource_type, new.resource_id, new.resource_label, jsonb_build_object('level', new.level, 'duration', new.duration, 'reason', new.reason, 'risk', new.risk));
    return null;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'approved' and new.resource_id is not null then
      until_ts := case new.duration when 'once' then now() + interval '1 day' when 'until_date' then coalesce(new.granted_until, new.until_at) when 'permanent' then null when 'project_active' then null else coalesce(new.granted_until, new.until_at) end;
      insert into access_grants (org_id, user_id, resource_type, resource_id, level, expires_at, granted_by, source_request_id, reason)
      values (new.org_id, new.requester_id, new.resource_type, new.resource_id, coalesce(new.granted_level, new.level), until_ts, auth.uid(), new.id, new.reason);
      if new.resource_type = 'channel' then
        insert into channel_members (channel_id, user_id, invited_by, invite_reason, expires_at) values (new.resource_id, new.requester_id, auth.uid(), 'Access request approved', until_ts) on conflict (channel_id, user_id) do update set expires_at = excluded.expires_at;
      end if;
    end if;
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (new.requester_id, case when new.status = 'approved' then 'information'::notification_kind else 'action_required'::notification_kind end,
            'Access ' || replace(new.status::text,'_',' ') || ': ' || new.resource_label, coalesce(new.decision_note, '') || case when new.status = 'approved' and new.granted_until is not null then ' · until ' || to_char(new.granted_until at time zone 'Asia/Kolkata','DD Mon HH24:MI') else '' end,
            case new.resource_type when 'project' then '/projects/' || new.resource_id when 'file' then '/files/' || new.resource_id when 'channel' then '/chat/' || new.resource_id else '/inbox' end, 'access_request', new.id, auth.uid());
    insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, old_value, new_value)
    values (new.org_id, auth.uid(), 'access.' || new.status::text, new.resource_type, new.resource_id, new.resource_label || ' for ' || person_name(new.requester_id), jsonb_build_object('status', old.status), jsonb_build_object('status', new.status, 'level', coalesce(new.granted_level, new.level), 'until', new.granted_until, 'note', new.decision_note));
  end if;
  return null;
end $$;
create trigger access_requests_after_insert after insert on access_requests for each row execute function access_request_after_change();
create trigger access_requests_after_update after update on access_requests for each row execute function access_request_after_change();

create or replace function revoke_grant(p_grant uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare g access_grants%rowtype;
begin
  select * into g from access_grants where id = p_grant;
  if g.id is null then return; end if;
  if not (is_admin() or has_admin_perm('access.approve') or g.granted_by = auth.uid()) then raise exception 'forbidden'; end if;
  update access_grants set revoked_at = now(), revoked_by = auth.uid() where id = p_grant;
  if g.resource_type = 'channel' then delete from channel_members where channel_id = g.resource_id and user_id = g.user_id; end if;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value)
  values (g.org_id, auth.uid(), 'access.revoked', g.resource_type, g.resource_id, 'Revoked for ' || person_name(g.user_id), jsonb_build_object('reason', p_reason));
end $$;

/** Emergency: revoke a user's access everywhere (grants, channels beyond company-open, sessions are handled by disabling the account). */
create or replace function revoke_everywhere(p_user uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o uuid; g int; c int; pm int;
begin
  if not (is_primary_admin() or has_admin_perm('security.manage')) then raise exception 'forbidden'; end if;
  select org_id into o from profiles where id = p_user;
  update access_grants set revoked_at = now(), revoked_by = auth.uid() where user_id = p_user and revoked_at is null; get diagnostics g = row_count;
  delete from channel_members cm using channels ch where cm.channel_id = ch.id and cm.user_id = p_user and ch.visibility <> 'company_open' and ch.type <> 'dm'; get diagnostics c = row_count;
  delete from project_members where user_id = p_user; get diagnostics pm = row_count;
  update profiles set is_active = false, presence = 'offline' where id = p_user;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value)
  values (o, auth.uid(), 'security.revoke_everywhere', 'profile', p_user, person_name(p_user), jsonb_build_object('reason', p_reason, 'grants', g, 'channels', c, 'projects', pm));
  return jsonb_build_object('grants', g, 'channels', c, 'projects', pm);
end $$;

create or replace function expire_access_grants() returns int
language plpgsql security definer set search_path = public as $$
declare g record; n int := 0;
begin
  for g in select * from access_grants where revoked_at is null and expires_at is not null and expires_at <= now() loop
    update access_grants set revoked_at = now() where id = g.id;
    if g.resource_type = 'channel' then delete from channel_members where channel_id = g.resource_id and user_id = g.user_id; end if;
    insert into audit_logs (org_id, action, entity_type, entity_id, summary) values (g.org_id, 'access.expired', g.resource_type, g.resource_id, 'Temporary access expired for ' || person_name(g.user_id));
    n := n + 1;
  end loop;
  return n;
end $$;

/** Why can this person see this resource? Returns the permission path(s). */
create or replace function explain_access(p_user uuid, p_type text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare reasons jsonb := '[]'::jsonb; p profiles%rowtype; pr projects%rowtype; f files%rowtype; ch channels%rowtype; g record;
begin
  if not (p_user = auth.uid() or is_manager_plus() or has_admin_perm('security.manage')) then raise exception 'forbidden'; end if;
  select * into p from profiles where id = p_user;
  if p.role in ('super_admin','director','executive') then reasons := reasons || jsonb_build_object('path', 'Role: ' || p.role, 'kind', 'role'); end if;
  for g in select r.name from admin_assignments a join admin_roles r on r.id = a.admin_role_id where a.user_id = p_user and (a.expires_at is null or a.expires_at > now()) loop
    reasons := reasons || jsonb_build_object('path', 'Admin role: ' || g.name, 'kind', 'admin');
  end loop;
  for g in select * from access_grants where user_id = p_user and resource_type = p_type and resource_id = p_id and revoked_at is null and (expires_at is null or expires_at > now()) loop
    reasons := reasons || jsonb_build_object('path', 'Approved access request (' || g.level || case when g.expires_at is not null then ', until ' || to_char(g.expires_at at time zone 'Asia/Kolkata','DD Mon') else '' end || ')', 'kind', 'grant', 'granted_by', person_name(g.granted_by));
  end loop;
  if p_type = 'project' then
    select * into pr from projects where id = p_id;
    if pr.owner_id = p_user then reasons := reasons || jsonb_build_object('path', 'Project owner', 'kind', 'owner'); end if;
    if exists (select 1 from project_members where project_id = p_id and user_id = p_user) then reasons := reasons || jsonb_build_object('path', 'Project member', 'kind', 'member'); end if;
    if pr.classification in ('public','internal') and role_rank(p.role) <= 7 then reasons := reasons || jsonb_build_object('path', 'Classification ' || pr.classification || ' → visible to all internal staff', 'kind', 'classification'); end if;
    if pr.classification = 'confidential' and (role_rank(p.role) <= 4 or (pr.department_id = p.department_id and role_rank(p.role) <= 5)) then reasons := reasons || jsonb_build_object('path', 'Confidential → managers / department leads', 'kind', 'classification'); end if;
  elsif p_type = 'file' then
    select * into f from files where id = p_id;
    if f.owner_id = p_user then reasons := reasons || jsonb_build_object('path', 'File owner', 'kind', 'owner'); end if;
    if f.project_id is not null and exists (select 1 from project_members where project_id = f.project_id and user_id = p_user) then reasons := reasons || jsonb_build_object('path', 'Member of project ' || (select name from projects where id = f.project_id), 'kind', 'member'); end if;
    reasons := reasons || jsonb_build_object('path', 'Classification ' || f.classification, 'kind', 'classification');
  elsif p_type = 'channel' then
    select * into ch from channels where id = p_id;
    if exists (select 1 from channel_members where channel_id = p_id and user_id = p_user) then reasons := reasons || jsonb_build_object('path', 'Channel member' || coalesce(' (invited by ' || (select person_name(invited_by) from channel_members where channel_id = p_id and user_id = p_user and invited_by is not null) || ')', ''), 'kind', 'member'); end if;
    if ch.visibility = 'company_open' then reasons := reasons || jsonb_build_object('path', 'Company-open channel', 'kind', 'visibility'); end if;
    if ch.visibility = 'department_open' and ch.department_id = p.department_id then reasons := reasons || jsonb_build_object('path', 'Department-open channel of their department', 'kind', 'visibility'); end if;
  end if;
  return jsonb_build_object('user', p.full_name, 'reasons', reasons, 'has_access', jsonb_array_length(reasons) > 0);
end $$;

/** Who can see this resource (with reason) — management/security only. */
create or replace function who_can_see(p_type text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare out jsonb := '[]'::jsonb; p record; e jsonb;
begin
  if not (is_manager_plus() or has_admin_perm('security.manage')) then raise exception 'forbidden'; end if;
  for p in select id, full_name from profiles where org_id = current_org() and is_active loop
    e := explain_access(p.id, p_type, p_id);
    if (e->>'has_access')::boolean then out := out || jsonb_build_object('user_id', p.id, 'name', p.full_name, 'reasons', e->'reasons'); end if;
  end loop;
  return out;
end $$;

/** View as: simulate what a user would see (counts + names), without impersonating them. Primary/security admin only. */
create or replace function view_as(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare prev text; res jsonb;
begin
  if not (is_primary_admin() or has_admin_perm('security.manage')) then raise exception 'forbidden'; end if;
  prev := current_setting('request.jwt.claims', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  res := jsonb_build_object(
    'user', person_name(p_user),
    'role', (select role from profiles where id = p_user),
    'department', (select d.name from profiles p join departments d on d.id = p.department_id where p.id = p_user),
    'projects', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'classification', classification)), '[]') from projects where org_id = current_org() and not archived and can_view_project(id)),
    'channels', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'visibility', visibility)), '[]') from channels where org_id = current_org() and not archived and type <> 'dm' and can_view_channel(id)),
    'files_visible', (select count(*) from files f where f.org_id = current_org() and (has_grant('file', f.id) or (can_view_classification(f.classification) and (f.project_id is null or can_view_project(f.project_id))))),
    'tasks_visible', (select count(*) from tasks t where t.org_id = current_org() and t.status not in ('done','cancelled') and can_view_task(t.id)),
    'is_manager', is_manager_plus(),
    'admin_perms', (select coalesce(jsonb_agg(r.name), '[]') from admin_assignments a join admin_roles r on r.id = a.admin_role_id where a.user_id = p_user)
  );
  perform set_config('request.jwt.claims', coalesce(prev, ''), true);
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary) values (current_org(), auth.uid(), 'security.view_as', 'profile', p_user, 'Viewed permissions as ' || person_name(p_user));
  return res;
end $$;

alter table access_requests enable row level security;
alter table access_grants enable row level security;
create policy acr_read on access_requests for select to authenticated using (org_id = current_org() and (requester_id = auth.uid() or approver_id = auth.uid() or is_admin() or has_admin_perm('access.approve')));
create policy acr_insert on access_requests for insert to authenticated with check (org_id = current_org() and requester_id = auth.uid() and is_active_member());
create policy acr_update on access_requests for update to authenticated using (org_id = current_org() and (approver_id = auth.uid() or is_admin() or has_admin_perm('access.approve') or (requester_id = auth.uid() and status = 'pending')));
create policy acg_read on access_grants for select to authenticated using (org_id = current_org() and (user_id = auth.uid() or is_manager_plus() or has_admin_perm('access.approve')));

-- ---------------------------------------------------------------------------
-- FEATURE FLAGS (per department) & DEPARTMENT PORTALS
-- ---------------------------------------------------------------------------
create table feature_flags (
  org_id uuid not null references organizations(id) on delete cascade,
  feature text not null,                   -- automations | attendance | help_desk | ai | files | wiki | ideas | shifts | timesheets | common | announcements
  enabled boolean not null default true,
  department_ids uuid[],                   -- null = all departments
  beta boolean not null default false,
  primary key (org_id, feature)
);
alter table feature_flags enable row level security;
create policy ff_read on feature_flags for select to authenticated using (org_id = current_org());
create policy ff_write on feature_flags for all to authenticated using (org_id = current_org() and (is_admin() or has_admin_perm('features.manage'))) with check (org_id = current_org() and (is_admin() or has_admin_perm('features.manage')));
insert into feature_flags (org_id, feature) values
 ('00000000-0000-0000-0000-000000000001','attendance'),('00000000-0000-0000-0000-000000000001','shifts'),('00000000-0000-0000-0000-000000000001','timesheets'),
 ('00000000-0000-0000-0000-000000000001','help_desk'),('00000000-0000-0000-0000-000000000001','automations'),('00000000-0000-0000-0000-000000000001','ai'),
 ('00000000-0000-0000-0000-000000000001','common'),('00000000-0000-0000-0000-000000000001','ideas'),('00000000-0000-0000-0000-000000000001','wiki'),('00000000-0000-0000-0000-000000000001','files');

-- ---------------------------------------------------------------------------
-- COMPANY NOW, WHAT CHANGED, COLLABORATION MAP, SECURITY EVENTS
-- ---------------------------------------------------------------------------
create table security_events (
  id bigint generated always as identity primary key,
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  kind text not null,       -- login | failed_login | export | external_share | break_glass | permission_change | view_as | revoke
  details jsonb,
  ip text,
  created_at timestamptz not null default now()
);
alter table security_events enable row level security;
create policy se_read on security_events for select to authenticated using (org_id = current_org() and (is_admin() or has_admin_perm('security.manage')));
create policy se_insert on security_events for insert to authenticated with check (org_id = current_org() and user_id = auth.uid());

create or replace function company_now() returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare o uuid := current_org(); today date := (now() at time zone 'Asia/Kolkata')::date; r jsonb;
begin
  if not is_manager_plus() then return jsonb_build_object('error','forbidden'); end if;
  r := jsonb_build_object(
    'people', jsonb_build_object(
      'total', (select count(*) from profiles where org_id = o and is_active and not is_external),
      'present', (select count(*) from attendance_days where org_id = o and day = today and status in ('present','late','half_day')),
      'remote', (select count(*) from attendance_days where org_id = o and day = today and status in ('remote','field','travel','training')),
      'late', (select count(*) from attendance_days where org_id = o and day = today and late),
      'on_leave', (select count(*) from leaves where org_id = o and status = 'approved' and today between starts_on and ends_on),
      'not_checked_in', (select count(*) from profiles p where p.org_id = o and p.is_active and not p.is_external and not exists (select 1 from attendance_days a where a.user_id = p.id and a.day = today) and not exists (select 1 from leaves l where l.user_id = p.id and l.status = 'approved' and today between l.starts_on and l.ends_on)),
      'in_meeting', (select count(distinct mp.user_id) from meetings m join meeting_participants mp on mp.meeting_id = m.id where m.org_id = o and now() between m.starts_at and coalesce(m.ends_at, m.starts_at + interval '1 hour')),
      'available', (select count(*) from profiles where org_id = o and is_active and presence in ('available','remote')),
      'focus', (select count(*) from profiles where org_id = o and is_active and presence = 'focus'),
      'missing_checkout', (select count(*) from attendance_days where org_id = o and day = today - 1 and missing_checkout)
    ),
    'work', jsonb_build_object(
      'active', (select count(*) from tasks where org_id = o and status = 'in_progress' and parent_id is null),
      'overdue', (select count(*) from tasks where org_id = o and status not in ('done','cancelled') and due_date < now() and parent_id is null),
      'blocked', (select count(*) from tasks where org_id = o and status = 'blocked'),
      'waiting', (select count(*) from tasks where org_id = o and status = 'waiting'),
      'critical', (select count(*) from tasks where org_id = o and status not in ('done','cancelled') and priority in ('critical','urgent') and parent_id is null),
      'done_today', (select count(*) from tasks where org_id = o and status = 'done' and (completed_at at time zone 'Asia/Kolkata')::date = today)
    ),
    'projects', jsonb_build_object(
      'active', (select count(*) from projects where org_id = o and not archived and status in ('active','planning')),
      'at_risk', (select count(*) from projects where org_id = o and not archived and (status in ('at_risk','delayed') or (status='active' and due_date < today)))
    ),
    'collaboration', jsonb_build_object(
      'help_open', (select count(*) from help_requests where org_id = o and status in ('new','accepted','working','waiting')),
      'help_unanswered', (select count(*) from help_requests where org_id = o and status = 'new'),
      'help_over_sla', (select count(*) from help_requests where org_id = o and status = 'new' and ack_due_at < now()),
      'rooms_active', (select count(*) from channels where org_id = o and type in ('temporary','help','group','team') and not archived and last_message_at > now() - interval '3 days'),
      'groups_this_week', (select count(*) from channels where org_id = o and type <> 'dm' and created_at > now() - interval '7 days'),
      'handoffs_pending', (select count(*) from handoffs where org_id = o and status = 'pending'),
      'cross_dept_rooms', (select count(*) from channels where org_id = o and not archived and array_length(department_ids,1) > 1)
    ),
    'approvals', jsonb_build_object(
      'pending', (select count(*) from approvals where org_id = o and status = 'pending'),
      'mine', (select count(*) from approvals where org_id = o and status = 'pending' and approver_id = auth.uid()),
      'access_requests', (select count(*) from access_requests where org_id = o and status = 'pending'),
      'leave_requests', (select count(*) from leaves where org_id = o and status = 'pending'),
      'stale', (select count(*) from approvals where org_id = o and status = 'pending' and created_at < now() - interval '48 hours')
    ),
    'security', jsonb_build_object(
      'high_risk_requests', (select count(*) from access_requests where org_id = o and status = 'pending' and risk = 'high'),
      'temporary_grants', (select count(*) from access_grants where org_id = o and revoked_at is null and expires_at is not null and expires_at > now()),
      'events_24h', (select count(*) from security_events where org_id = o and created_at > now() - interval '24 hours'),
      'external_guests', (select count(*) from profiles where org_id = o and is_active and is_external)
    ),
    'departments', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'slug', d.slug, 'color', d.color, 'status', d.status,
        'present', (select count(*) from attendance_days a join profiles p on p.id = a.user_id where p.department_id = d.id and a.day = today and a.status not in ('leave','absent')),
        'people', (select count(*) from profiles p where p.department_id = d.id and p.is_active),
        'open', (select count(*) from tasks t where t.department_id = d.id and t.status not in ('done','cancelled')),
        'overdue', (select count(*) from tasks t where t.department_id = d.id and t.status not in ('done','cancelled') and t.due_date < now()),
        'blocked', (select count(*) from tasks t where t.department_id = d.id and t.status in ('blocked','waiting')),
        'help_open', (select count(*) from help_requests h where h.department_id = d.id and h.status in ('new','accepted','working','waiting'))
      ) order by d.position), '[]') from departments d where d.org_id = o)
  );
  return r;
end $$;

create or replace function since_last_visit(p_since timestamptz) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select case when not is_manager_plus() then jsonb_build_object('error','forbidden') else jsonb_build_object(
    'since', p_since,
    'checked_in', (select count(*) from attendance_events where org_id = current_org() and kind = 'clock_in' and occurred_at > p_since),
    'tasks_completed', (select count(*) from tasks where org_id = current_org() and status = 'done' and completed_at > p_since),
    'tasks_created', (select count(*) from tasks where org_id = current_org() and created_at > p_since),
    'requests_completed', (select count(*) from help_requests where org_id = current_org() and completed_at > p_since),
    'requests_new', (select count(*) from help_requests where org_id = current_org() and created_at > p_since),
    'projects_changed', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status)), '[]') from projects p where p.org_id = current_org() and p.updated_at > p_since and p.status in ('at_risk','delayed','completed')),
    'decisions', (select count(*) from decisions where org_id = current_org() and created_at > p_since),
    'approvals_pending', (select count(*) from approvals where org_id = current_org() and status = 'pending'),
    'access_requests_pending', (select count(*) from access_requests where org_id = current_org() and status = 'pending'),
    'critical_unresolved', (select count(*) from help_requests where org_id = current_org() and priority = 'critical' and status in ('new','accepted','working','waiting')),
    'escalations', (select count(*) from audit_logs where org_id = current_org() and action in ('escalation.sent','help.escalated') and created_at > p_since),
    'new_groups', (select count(*) from channels where org_id = current_org() and type <> 'dm' and created_at > p_since),
    'handoffs', (select count(*) from handoffs where org_id = current_org() and created_at > p_since)
  ) end
$$;

create or replace function collaboration_map()
returns table(from_department_id uuid, to_department_id uuid, from_name text, to_name text, handoffs int, help_requests int, avg_ack_minutes int, shared_rooms int)
language sql stable security definer set search_path = public as $$
  with pairs as (
    select h.from_department_id as a, h.to_department_id as b, count(*) as handoffs, 0 as reqs, null::numeric as ack from handoffs h where h.org_id = current_org() and h.from_department_id is not null group by 1,2
    union all
    select r.requester_department_id, r.department_id, 0, count(*), avg(extract(epoch from (r.acknowledged_at - r.created_at))/60) from help_requests r where r.org_id = current_org() and r.requester_department_id is not null and r.requester_department_id <> r.department_id group by 1,2
    union all
    select c.department_ids[1], c.department_ids[2], 0, 0, null from channels c where c.org_id = current_org() and array_length(c.department_ids,1) >= 2
  )
  select p.a, p.b, da.name, db.name, sum(p.handoffs)::int, sum(p.reqs)::int, avg(p.ack)::int, (select count(*)::int from channels c where c.org_id = current_org() and p.a = any(c.department_ids) and p.b = any(c.department_ids))
    from pairs p join departments da on da.id = p.a join departments db on db.id = p.b
   where is_manager_plus()
   group by p.a, p.b, da.name, db.name
   order by 5 desc, 6 desc
$$;

-- grants
revoke execute on function help_request_after_change(), access_request_route(), access_request_after_change(), department_guard(), autojoin_common(), expire_collaboration(), escalate_help_requests(), expire_access_grants() from anon, public, authenticated;
grant execute on function bring_in(uuid,uuid,text,timestamptz), invite_department(uuid,uuid,text), convert_channel_to_project(uuid,text,date), department_availability(), has_grant(text,uuid,text),
  revoke_grant(uuid,text), revoke_everywhere(uuid,text), explain_access(uuid,text,uuid), who_can_see(text,uuid), view_as(uuid), company_now(), since_last_visit(timestamptz), collaboration_map() to authenticated;
revoke execute on function bring_in(uuid,uuid,text,timestamptz), invite_department(uuid,uuid,text), convert_channel_to_project(uuid,text,date), department_availability(), has_grant(text,uuid,text),
  revoke_grant(uuid,text), revoke_everywhere(uuid,text), explain_access(uuid,text,uuid), who_can_see(text,uuid), view_as(uuid), company_now(), since_last_visit(timestamptz), collaboration_map() from anon, public;

select cron.schedule('ghl_expire_collab', '*/10 * * * *', $$select expire_collaboration()$$);
select cron.schedule('ghl_help_sla', '*/15 * * * *', $$select escalate_help_requests()$$);
select cron.schedule('ghl_expire_grants', '*/10 * * * *', $$select expire_access_grants()$$);
alter publication supabase_realtime add table help_requests, access_requests, attendance_events;

-- activity lights: the client subscribes to RLS-filtered Postgres changes on these tables
alter publication supabase_realtime add table handoffs, leaves, announcements, decisions, projects, channels, profiles;
