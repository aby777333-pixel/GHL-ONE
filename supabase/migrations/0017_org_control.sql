-- Phase 5 (a): Total employee control — status & lifecycle, reporting lines with history, system roles (multiple, temporary),
-- permission profiles, screen governance with precedence, responsibilities register, delegations, access reviews & findings,
-- org health, freeze/suspend, sessions, policies with acknowledgement, assignment rules, bulk import, nav layouts, config history.

create extension if not exists pg_trgm;
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- EMPLOYEE STATUS, EXTRA REPORTING LINES, HISTORY
-- ---------------------------------------------------------------------------
alter table profiles
  add column if not exists status text not null default 'active',            -- active | probation | contract | intern | notice_period | suspended | inactive | exited
  add column if not exists frozen boolean not null default false,
  add column if not exists frozen_reason text,
  add column if not exists functional_manager_id uuid references profiles(id) on delete set null,
  add column if not exists contract_ends_on date,
  add column if not exists notice_ends_on date,
  add column if not exists job_scope text,
  add column if not exists jd_file_id uuid references files(id) on delete set null,
  add column if not exists config_incomplete boolean not null default false;
alter table departments add column if not exists frozen boolean not null default false, add column if not exists charter jsonb not null default '{}'::jsonb;
alter table teams add column if not exists charter jsonb not null default '{}'::jsonb, add column if not exists wip_limit int, add column if not exists purpose text;
alter table feature_flags add column if not exists locked boolean not null default false, add column if not exists user_ids uuid[], add column if not exists team_ids uuid[];

update profiles set status = 'probation' where probation_ends_on is not null and probation_ends_on >= current_date and status = 'active';
update profiles set status = 'intern' where role = 'intern' and status = 'active';
update profiles set status = 'contract' where employment_type in ('contract','contractor') and status = 'active';
update profiles set status = 'inactive' where not is_active and status = 'active';

create or replace function is_active_member() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((select p.is_active and not p.frozen and not coalesce((select d.frozen from departments d where d.id = p.department_id), false) from profiles p where p.id = auth.uid()), false)
$$;

create table manager_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'primary',        -- primary | secondary | functional
  old_manager_id uuid references profiles(id) on delete set null,
  new_manager_id uuid references profiles(id) on delete set null,
  changed_by uuid references profiles(id) on delete set null,
  reason text,
  changed_at timestamptz not null default now()
);
create table role_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  old_role role_level, new_role role_level,
  old_designation text, new_designation text,
  old_status text, new_status text,
  old_department_id uuid, new_department_id uuid,
  changed_by uuid references profiles(id) on delete set null,
  reason text,
  changed_at timestamptz not null default now()
);
create index role_history_user_idx on role_history(user_id, changed_at desc);
create index manager_history_user_idx on manager_history(user_id, changed_at desc);

create or replace function profile_change_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare rsn text := nullif(current_setting('ghl.change_reason', true), '');
begin
  if new.manager_id is distinct from old.manager_id then
    insert into manager_history (user_id, kind, old_manager_id, new_manager_id, changed_by, reason) values (new.id, 'primary', old.manager_id, new.manager_id, auth.uid(), rsn);
  end if;
  if new.secondary_manager_id is distinct from old.secondary_manager_id then
    insert into manager_history (user_id, kind, old_manager_id, new_manager_id, changed_by, reason) values (new.id, 'secondary', old.secondary_manager_id, new.secondary_manager_id, auth.uid(), rsn);
  end if;
  if new.functional_manager_id is distinct from old.functional_manager_id then
    insert into manager_history (user_id, kind, old_manager_id, new_manager_id, changed_by, reason) values (new.id, 'functional', old.functional_manager_id, new.functional_manager_id, auth.uid(), rsn);
  end if;
  if new.role is distinct from old.role or new.designation is distinct from old.designation or new.status is distinct from old.status or new.department_id is distinct from old.department_id then
    insert into role_history (user_id, old_role, new_role, old_designation, new_designation, old_status, new_status, old_department_id, new_department_id, changed_by, reason)
    values (new.id, old.role, new.role, old.designation, new.designation, old.status, new.status, old.department_id, new.department_id, auth.uid(), rsn);
  end if;
  return null;
end $$;
create trigger profiles_change_history after update on profiles for each row execute function profile_change_history();

-- status ↔ is_active; "organizational configuration incomplete" flag
create or replace function profile_status_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('suspended','inactive','exited') then new.is_active := false;
  elsif old.status in ('suspended','inactive','exited') and new.status not in ('suspended','inactive','exited') and not new.is_active then new.is_active := true; end if;
  if new.role in ('intern') and new.status = 'active' then new.status := 'intern'; end if;
  new.config_incomplete := new.is_active and not new.is_external and (
    new.department_id is null or new.designation is null or new.designation = ''
    or (new.manager_id is null and new.role not in ('super_admin','director'))
  );
  return new;
end $$;
create trigger profiles_status_sync before update on profiles for each row execute function profile_status_sync();
update profiles set config_incomplete = is_active and not is_external and (department_id is null or designation is null or designation = '' or (manager_id is null and role not in ('super_admin','director')));

-- ---------------------------------------------------------------------------
-- SYSTEM ROLES (separate from designation), MULTIPLE + TEMPORARY, PERMISSION PROFILES
-- ---------------------------------------------------------------------------
create table system_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  base_level role_level not null default 'employee',      -- the hierarchy level this role behaves like
  permissions text[] not null default '{}',                -- view, comment, create, edit, delete, download, share_internal, share_external, approve, invite, create_group, create_project, assign_task, view_reports, export, broadcast_department, broadcast_company, manage_team, review_recordings, record_calls
  screens text[] not null default '{}',                    -- screen keys this role adds
  denied_screens text[] not null default '{}',
  is_system boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, key)
);
create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  system_role_id uuid not null references system_roles(id) on delete cascade,
  acting boolean not null default false,                   -- "Acting Manager" style temporary authority
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  granted_by uuid references profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  unique (user_id, system_role_id)
);
create index user_roles_user_idx on user_roles(user_id);

-- baseline permissions by hierarchy level
create table role_defaults (
  org_id uuid not null references organizations(id) on delete cascade,
  level role_level not null,
  permissions text[] not null default '{}',
  primary key (org_id, level)
);
-- department baseline permissions
alter table departments add column if not exists default_permissions text[] not null default '{}', add column if not exists default_screens text[] not null default '{}';

create table permission_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  perm text not null,
  allowed boolean not null default true,
  expires_at timestamptz,
  reason text,
  set_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, perm)
);

/** Effective permission: user override → active system roles → department default → level default; probation/intern lose download/share_external unless overridden. */
create or replace function has_perm(p_perm text, p_user uuid default auth.uid()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare p profiles%rowtype; o boolean; r boolean;
begin
  select * into p from profiles where id = p_user;
  if p.id is null or not p.is_active then return false; end if;
  if p.role = 'super_admin' then return true; end if;
  select allowed into o from permission_overrides where user_id = p_user and perm = p_perm and (expires_at is null or expires_at > now());
  if found then return o; end if;
  if p.status in ('probation','intern') and p_perm in ('download','share_external','export') then return false; end if;
  if p.status in ('suspended','notice_period') and p_perm in ('share_external','export','delete') then return false; end if;
  select bool_or(p_perm = any(sr.permissions)) into r from user_roles ur join system_roles sr on sr.id = ur.system_role_id
   where ur.user_id = p_user and ur.starts_at <= now() and (ur.expires_at is null or ur.expires_at > now());
  if r then return true; end if;
  if exists (select 1 from departments d where d.id = p.department_id and p_perm = any(d.default_permissions)) then return true; end if;
  return exists (select 1 from role_defaults rd where rd.org_id = p.org_id and rd.level = p.role and p_perm = any(rd.permissions));
end $$;

/** Highest hierarchy level a person holds through system roles (acting roles count while active). */
create or replace function effective_level(p_user uuid default auth.uid()) returns role_level
language sql stable security definer set search_path = public as $$
  select coalesce((select sr.base_level from user_roles ur join system_roles sr on sr.id = ur.system_role_id
                    where ur.user_id = p_user and ur.starts_at <= now() and (ur.expires_at is null or ur.expires_at > now())
                    order by role_rank(sr.base_level) limit 1), (select role from profiles where id = p_user))
$$;

-- ---------------------------------------------------------------------------
-- SCREEN GOVERNANCE: catalogue + rules + precedence (user → role → department → default)
-- ---------------------------------------------------------------------------
create table screens (
  key text primary key,
  label text not null,
  path text not null,                 -- route prefix
  grp text not null default 'work',   -- core | work | me | company | admin
  default_min_level role_level not null default 'employee',   -- who gets it by default (rank <= this)
  external_ok boolean not null default false,                  -- guests/vendors/consultants may have it by default
  admin_only boolean not null default false,
  description text,
  position int not null default 0
);
insert into screens (key, label, path, grp, default_min_level, external_ok, admin_only, description, position) values
 ('home','Home','/','core','guest',true,false,'Personal dashboard',0),
 ('my-work','My Work','/my-work','core','guest',true,false,'My tasks and queue',1),
 ('inbox','Inbox','/inbox','core','guest',true,false,'Notifications',2),
 ('chat','Chat','/chat','core','guest',true,false,'Messaging',3),
 ('approvals','Approvals','/approvals','core','employee',false,false,'Approval center',4),
 ('projects','Projects','/projects','work','guest',true,false,'Projects',10),
 ('tasks','Tasks','/tasks','work','guest',true,false,'Tasks',11),
 ('delegate','Delegate','/delegate','work','team_lead',false,false,'Natural-language delegation',12),
 ('help','Help Desk','/help','work','employee',false,false,'Internal service desk',13),
 ('meetings','Meetings','/meetings','work','guest',true,false,'Meetings',14),
 ('calendar','Calendar','/calendar','work','guest',true,false,'Calendar',15),
 ('decisions','Decisions','/decisions','work','employee',false,false,'Decision register',16),
 ('automations','Automations','/automations','work','team_lead',false,false,'Workflow builder',17),
 ('connect','GHL Connect','/connect','work','employee',false,false,'Customer email, calls and messages',18),
 ('attendance','Attendance','/attendance','me','employee',false,false,'Clock, board, roster, timesheet',20),
 ('leave','Leave','/leave','me','employee',false,false,'Leave requests',21),
 ('academy','Academy','/academy','me','employee',false,false,'Training',22),
 ('goals','Goals','/goals','me','employee',false,false,'Goals and OKRs',23),
 ('jobs','Jobs','/jobs','me','employee',false,false,'Internal job board',24),
 ('one-on-ones','1-on-1s','/one-on-ones','me','employee',false,false,'Manager ↔ employee sessions',25),
 ('requests','Requests','/requests','me','employee',false,false,'Self-service request center',26),
 ('common','GHL Common','/common','me','employee',false,false,'Company common room',27),
 ('command','Command Center','/command','company','manager',false,false,'Management cockpit',30),
 ('workforce','Workforce Live','/workforce','company','manager',false,true,'Live attendance, breaks, coverage — hierarchy scoped',31),
 ('departments','Departments','/departments','company','employee',false,false,'Department portals',32),
 ('people','People','/people','company','employee',false,false,'Directory and org chart',33),
 ('files','Files','/files','company','guest',true,false,'Files',34),
 ('wiki','Wiki & Knowledge','/wiki','company','employee',false,false,'Wiki and approved knowledge',35),
 ('announcements','Announcements','/announcements','company','employee',false,false,'Announcements',36),
 ('ideas','Ideas','/ideas','company','employee',false,false,'Ideas and suggestions',37),
 ('search','Search','/search','company','guest',true,false,'Search',38),
 ('reports','Reports','/reports','company','manager',false,false,'Operational reports and exports',39),
 ('admin','Admin','/admin','admin','team_lead',false,true,'Administration console',40),
 ('people-intelligence','People Intelligence','/admin/people-intelligence','admin','super_admin',false,true,'Owner-only workforce intelligence',41),
 ('org-control','Organization Control','/admin/organization','admin','director',false,true,'Master control surface',42);

create table screen_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  scope text not null,                  -- user | role | department | default
  scope_id uuid,                        -- profile id / system_role id / department id / null
  screen_key text not null references screens(key) on delete cascade,
  allowed boolean not null default true,
  expires_at timestamptz,
  reason text,
  set_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, scope, scope_id, screen_key)
);

create or replace function effective_screens(p_user uuid default auth.uid())
returns table(key text, label text, path text, grp text, allowed boolean, source text, sort_order int)
language plpgsql stable security definer set search_path = public as $$
declare p profiles%rowtype; lvl role_level;
begin
  select * into p from profiles where id = p_user;
  if p.id is null then return; end if;
  lvl := effective_level(p_user);
  return query
  select s.key, s.label, s.path, s.grp,
    coalesce(
      (select r.allowed from screen_rules r where r.org_id = p.org_id and r.scope = 'user' and r.scope_id = p_user and r.screen_key = s.key and (r.expires_at is null or r.expires_at > now())),
      (select bool_or(r.allowed) from screen_rules r join user_roles ur on ur.system_role_id = r.scope_id and ur.user_id = p_user and ur.starts_at <= now() and (ur.expires_at is null or ur.expires_at > now())
         where r.org_id = p.org_id and r.scope = 'role' and r.screen_key = s.key and (r.expires_at is null or r.expires_at > now())),
      (select bool_or(s.key = any(sr.screens)) or not bool_or(s.key = any(sr.denied_screens)) from user_roles ur join system_roles sr on sr.id = ur.system_role_id
         where ur.user_id = p_user and ur.starts_at <= now() and (ur.expires_at is null or ur.expires_at > now()) and (s.key = any(sr.screens) or s.key = any(sr.denied_screens))),
      (select r.allowed from screen_rules r where r.org_id = p.org_id and r.scope = 'department' and r.scope_id = p.department_id and r.screen_key = s.key and (r.expires_at is null or r.expires_at > now())),
      (select true from departments d where d.id = p.department_id and s.key = any(d.default_screens)),
      (select r.allowed from screen_rules r where r.org_id = p.org_id and r.scope = 'default' and r.scope_id is null and r.screen_key = s.key),
      case when p.is_external then s.external_ok and not s.admin_only
           when s.key = 'people-intelligence' then is_primary_admin_user(p_user) or has_admin_perm_user(p_user, 'security.manage')
           when s.key = 'admin' then role_rank(lvl) <= role_rank('team_lead') or exists (select 1 from admin_assignments a where a.user_id = p_user and (a.expires_at is null or a.expires_at > now()))
           else role_rank(lvl) <= role_rank(s.default_min_level) end
    ) as allowed,
    case
      when exists (select 1 from screen_rules r where r.org_id = p.org_id and r.scope = 'user' and r.scope_id = p_user and r.screen_key = s.key and (r.expires_at is null or r.expires_at > now())) then 'individual override'
      when exists (select 1 from screen_rules r join user_roles ur on ur.system_role_id = r.scope_id and ur.user_id = p_user where r.org_id = p.org_id and r.scope = 'role' and r.screen_key = s.key) then 'role rule'
      when exists (select 1 from user_roles ur join system_roles sr on sr.id = ur.system_role_id where ur.user_id = p_user and (s.key = any(sr.screens) or s.key = any(sr.denied_screens))) then 'system role'
      when exists (select 1 from screen_rules r where r.org_id = p.org_id and r.scope = 'department' and r.scope_id = p.department_id and r.screen_key = s.key) then 'department rule'
      when exists (select 1 from departments d where d.id = p.department_id and s.key = any(d.default_screens)) then 'department default'
      when exists (select 1 from screen_rules r where r.org_id = p.org_id and r.scope = 'default' and r.scope_id is null and r.screen_key = s.key) then 'company default'
      else 'system default (' || s.default_min_level::text || '+)' end as source,
    s.position
  from screens s
  where not p.frozen or s.key in ('home','inbox')
  order by s.position;
end $$;

-- helpers usable for arbitrary users (view-as, effective_screens)
create or replace function is_primary_admin_user(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (o.settings->>'primary_admin_id')::uuid = p_user from organizations o join profiles p on p.org_id = o.id where p.id = p_user), false)
      or coalesce((select role = 'super_admin' from profiles where id = p_user), false)
$$;
create or replace function has_admin_perm_user(p_user uuid, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' from profiles where id = p_user), false)
      or exists (select 1 from admin_assignments a join admin_roles r on r.id = a.admin_role_id where a.user_id = p_user and (a.expires_at is null or a.expires_at > now()) and (perm = any(r.permissions) or '*' = any(r.permissions)))
$$;

create or replace function can_view_screen(p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select allowed from effective_screens(auth.uid()) where key = p_key), false)
$$;

-- ---------------------------------------------------------------------------
-- NAV LAYOUTS (screen designer) + MODULE USAGE (adoption)
-- ---------------------------------------------------------------------------
create table nav_layouts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  scope text not null,                 -- default | department | role | user
  scope_id uuid,
  nav jsonb not null default '[]'::jsonb,     -- ordered screen keys (subset of allowed)
  home_cards jsonb not null default '[]'::jsonb,   -- [{key, hidden}]
  quick_actions jsonb not null default '[]'::jsonb,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (org_id, scope, scope_id)
);
create or replace function effective_nav(p_user uuid default auth.uid()) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select to_jsonb(n) from nav_layouts n join profiles p on p.org_id = n.org_id where p.id = p_user and n.scope = 'user' and n.scope_id = p_user),
    (select to_jsonb(n) from nav_layouts n join user_roles ur on ur.user_id = p_user and ur.system_role_id = n.scope_id where n.scope = 'role' and (ur.expires_at is null or ur.expires_at > now()) limit 1),
    (select to_jsonb(n) from nav_layouts n join profiles p on p.org_id = n.org_id and p.department_id = n.scope_id where p.id = p_user and n.scope = 'department'),
    (select to_jsonb(n) from nav_layouts n join profiles p on p.org_id = n.org_id where p.id = p_user and n.scope = 'default' and n.scope_id is null),
    '{}'::jsonb)
$$;

create table module_usage (
  user_id uuid not null references profiles(id) on delete cascade,
  module text not null,
  day date not null default (now() at time zone 'Asia/Kolkata')::date,
  hits int not null default 1,
  primary key (user_id, module, day)
);
create or replace function touch_module(p_module text) returns void
language sql security definer set search_path = public as $$
  insert into module_usage (user_id, module) values (auth.uid(), p_module)
  on conflict (user_id, module, day) do update set hits = module_usage.hits + 1
$$;

-- ---------------------------------------------------------------------------
-- RESPONSIBILITIES (who owns what), BACKUPS, DECISION RIGHTS, GLOSSARY
-- ---------------------------------------------------------------------------
create table responsibilities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  department_id uuid references departments(id) on delete set null,
  team_id uuid references teams(id) on delete set null,
  owner_id uuid references profiles(id) on delete set null,
  backup_id uuid references profiles(id) on delete set null,
  successor_id uuid references profiles(id) on delete set null,
  escalation_owner_id uuid references profiles(id) on delete set null,
  sop_knowledge_id uuid references ai_knowledge(id) on delete set null,
  decision_level text,                 -- recommend | approve_routine | approve_team | approve_department | approve_company
  critical boolean not null default false,
  requires_backup boolean not null default false,
  tags text[] not null default '{}',
  raci jsonb,                          -- {responsible:[ids], accountable:id, consulted:[ids], informed:[ids]}
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger responsibilities_updated_at before update on responsibilities for each row execute function set_updated_at();
create index responsibilities_search_idx on responsibilities using gin ((name || ' ' || coalesce(description,'')) gin_trgm_ops);

create table glossary (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  term text not null,
  definition text not null,
  department_id uuid references departments(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, term)
);

create or replace function who_owns(p_q text) returns table(kind text, id uuid, name text, owner_id uuid, owner_name text, backup_id uuid, backup_name text, department text, critical boolean)
language sql stable security definer set search_path = public as $$
  (select 'responsibility'::text, r.id, r.name, r.owner_id, person_name(r.owner_id), r.backup_id, person_name(r.backup_id), (select d.name from departments d where d.id = r.department_id), r.critical
     from responsibilities r where r.org_id = current_org() and is_active_member() and (r.name ilike '%' || p_q || '%' or r.description ilike '%' || p_q || '%' or p_q = any(r.tags)) limit 10)
  union all
  (select 'project', p.id, p.name, p.owner_id, person_name(p.owner_id), null, null, (select d.name from departments d where d.id = p.department_id), false
     from projects p where p.org_id = current_org() and not p.archived and p.name ilike '%' || p_q || '%' and can_view_project(p.id) limit 5)
  union all
  (select 'department', d.id, d.name, d.head_id, person_name(d.head_id), d.on_duty_user_id, person_name(d.on_duty_user_id), d.name, false
     from departments d where d.org_id = current_org() and d.name ilike '%' || p_q || '%' limit 5)
  union all
  (select 'service', s.id, s.name, coalesce(s.default_owner_id, d.on_duty_user_id, d.head_id), person_name(coalesce(s.default_owner_id, d.on_duty_user_id, d.head_id)), null, null, d.name, false
     from service_catalog s join departments d on d.id = s.department_id where s.org_id = current_org() and s.active and s.name ilike '%' || p_q || '%' limit 5)
$$;

-- ---------------------------------------------------------------------------
-- DELEGATIONS (approvals / leave / requests / decisions / tasks) + effective approver
-- ---------------------------------------------------------------------------
create table delegations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  from_user_id uuid not null references profiles(id) on delete cascade,
  to_user_id uuid not null references profiles(id) on delete cascade,
  kinds text[] not null default '{approvals}',   -- approvals | leave | requests | decisions | tasks | help
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  reason text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index delegations_from_idx on delegations(from_user_id) where active;

create or replace function delegate_for(p_user uuid, p_kind text) returns uuid
language sql stable security definer set search_path = public as $$
  select to_user_id from delegations where from_user_id = p_user and active and p_kind = any(kinds) and starts_at <= now() and (ends_at is null or ends_at > now()) order by created_at desc limit 1
$$;

/** Who effectively acts for a person today: delegate → the person unless on approved leave/absent → their manager. */
create or replace function effective_approver(p_user uuid, p_kind text default 'approvals') returns uuid
language plpgsql stable security definer set search_path = public as $$
declare d uuid; away boolean; mgr uuid;
begin
  if p_user is null then return null; end if;
  d := delegate_for(p_user, p_kind);
  if d is not null then return d; end if;
  select exists (select 1 from leaves l where l.user_id = p_user and l.status = 'approved' and (now() at time zone 'Asia/Kolkata')::date between l.starts_on and l.ends_on)
      or exists (select 1 from profiles p where p.id = p_user and (not p.is_active or p.frozen)) into away;
  if away then
    select manager_id into mgr from profiles where id = p_user;
    if mgr is not null then return coalesce(delegate_for(mgr, p_kind), mgr); end if;
  end if;
  return p_user;
end $$;

-- approvals route to the effective approver; leaves route to the effective manager
create or replace function approvals_route_delegation() returns trigger
language plpgsql security definer set search_path = public as $$
declare eff uuid;
begin
  if new.approver_id is not null then
    eff := effective_approver(new.approver_id, 'approvals');
    if eff is distinct from new.approver_id then new.delegated_from := new.approver_id; new.approver_id := eff; end if;
  end if;
  return new;
end $$;
create trigger approvals_route_delegation before insert on approvals for each row execute function approvals_route_delegation();

create or replace function leaves_route_delegation() returns trigger
language plpgsql security definer set search_path = public as $$
declare eff uuid;
begin
  if new.manager_id is not null then
    eff := effective_approver(new.manager_id, 'leave');
    if eff is distinct from new.manager_id then new.manager_id := eff; end if;
  end if;
  return new;
end $$;
create trigger leaves_route_delegation before insert on leaves for each row execute function leaves_route_delegation();

create or replace function delegations_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (new.to_user_id, 'action_required', person_name(new.from_user_id) || ' delegated ' || array_to_string(new.kinds, ', ') || ' to you', coalesce(new.reason, '') || case when new.ends_at is not null then ' · until ' || to_char(new.ends_at at time zone 'Asia/Kolkata', 'DD Mon HH24:MI') else '' end, '/approvals', 'delegation', new.id, new.from_user_id);
    insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value) values (new.org_id, auth.uid(), 'delegation.created', 'delegation', new.id, person_name(new.from_user_id) || ' → ' || person_name(new.to_user_id), jsonb_build_object('kinds', new.kinds, 'ends_at', new.ends_at));
  end if;
  return null;
end $$;
create trigger delegations_notify after insert on delegations for each row execute function delegations_notify();

create or replace function expire_delegations_and_roles() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in select * from delegations where active and ends_at is not null and ends_at <= now() loop
    update delegations set active = false where id = r.id;
    insert into notifications (user_id, kind, title, link, entity_type, entity_id) values (r.from_user_id, 'information', 'Your delegation to ' || person_name(r.to_user_id) || ' has ended', '/approvals', 'delegation', r.id);
    n := n + 1;
  end loop;
  for r in select ur.*, sr.name as role_name from user_roles ur join system_roles sr on sr.id = ur.system_role_id where ur.expires_at is not null and ur.expires_at <= now() loop
    insert into audit_logs (org_id, action, entity_type, entity_id, summary) values ((select org_id from profiles where id = r.user_id), 'role.expired', 'profile', r.user_id, person_name(r.user_id) || ' — ' || r.role_name || ' (temporary) reverted');
    insert into notifications (user_id, kind, title, link, entity_type, entity_id) values (r.user_id, 'information', 'Temporary role ended: ' || r.role_name, '/people/' || r.user_id, 'profile', r.user_id);
    delete from user_roles where id = r.id;
    n := n + 1;
  end loop;
  for r in select * from permission_overrides where expires_at is not null and expires_at <= now() loop
    delete from permission_overrides where id = r.id; n := n + 1;
  end loop;
  for r in select * from screen_rules where expires_at is not null and expires_at <= now() loop
    delete from screen_rules where id = r.id; n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- POLICIES: versions, targeting, acknowledgement, quiz; training gate
-- ---------------------------------------------------------------------------
create table policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  title text not null,
  category text not null default 'conduct',   -- attendance | leave | remote | it | security | communication | travel | expense | conduct | data
  body text not null,
  version int not null default 1,
  effective_on date not null default current_date,
  status text not null default 'draft',        -- draft | active | retired
  requires_ack boolean not null default true,
  quiz jsonb,                                  -- [{q, options[], answer}] pass ≥ 70
  pass_mark int not null default 70,
  department_ids uuid[],
  roles role_level[],
  employment_types text[],
  owner_id uuid references profiles(id) on delete set null,
  review_at date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);
create trigger policies_updated_at before update on policies for each row execute function set_updated_at();
create table policy_versions (
  policy_id uuid not null references policies(id) on delete cascade,
  version int not null,
  body text not null,
  effective_on date not null,
  published_by uuid references profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  change_note text,
  primary key (policy_id, version)
);
create table policy_acks (
  policy_id uuid not null references policies(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  version int not null,
  acked_at timestamptz not null default now(),
  quiz_score int,
  primary key (policy_id, user_id, version)
);
create or replace function policy_publish() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' and (old.status is distinct from 'active' or new.body is distinct from old.body) then
    if old.status = 'active' and new.body is distinct from old.body then new.version := old.version + 1; end if;
    insert into policy_versions (policy_id, version, body, effective_on, published_by) values (new.id, new.version, new.body, new.effective_on, auth.uid()) on conflict (policy_id, version) do update set body = excluded.body, effective_on = excluded.effective_on;
    if new.requires_ack then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      select p.id, 'action_required', 'Please read & confirm: ' || new.title, 'Policy v' || new.version || ' effective ' || to_char(new.effective_on, 'DD Mon'), '/policies/' || new.id, 'policy', new.id, auth.uid()
        from profiles p where p.org_id = new.org_id and p.is_active and not p.is_external
         and (new.department_ids is null or p.department_id = any(new.department_ids)) and (new.roles is null or p.role = any(new.roles)) and (new.employment_types is null or p.employment_type = any(new.employment_types));
    end if;
    insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value) values (new.org_id, auth.uid(), 'policy.published', 'policy', new.id, new.title || ' v' || new.version, jsonb_build_object('effective_on', new.effective_on));
  end if;
  return new;
end $$;
create trigger policies_publish before update on policies for each row execute function policy_publish();

create or replace function my_pending_policies() returns table(id uuid, title text, category text, version int, effective_on date, has_quiz boolean)
language sql stable security definer set search_path = public as $$
  select pl.id, pl.title, pl.category, pl.version, pl.effective_on, pl.quiz is not null
    from policies pl join profiles p on p.org_id = pl.org_id and p.id = auth.uid()
   where pl.status = 'active' and pl.requires_ack
     and (pl.department_ids is null or p.department_id = any(pl.department_ids)) and (pl.roles is null or p.role = any(pl.roles)) and (pl.employment_types is null or p.employment_type = any(pl.employment_types))
     and not exists (select 1 from policy_acks a where a.policy_id = pl.id and a.user_id = auth.uid() and a.version = pl.version)
   order by pl.effective_on
$$;

/** Security-training gate: confidential material needs the configured course completed (managers exempt). */
create or replace function training_gate_ok(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when (select (o.settings->>'security_training_course_id') from organizations o join profiles p on p.org_id = o.id where p.id = p_user) is null then true
    when role_rank((select role from profiles where id = p_user)) <= 4 then true
    else exists (select 1 from enrollments e where e.user_id = p_user and e.status = 'completed' and e.course_id = (select (o.settings->>'security_training_course_id')::uuid from organizations o join profiles p on p.org_id = o.id where p.id = p_user))
  end
$$;
create or replace function can_view_classification(c classification) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select case c
    when 'public' then true
    when 'internal' then is_internal()
    when 'confidential' then role_rank(current_role_level()) <= 4 and training_gate_ok()
    when 'highly_confidential' then role_rank(current_role_level()) <= 2 and training_gate_ok()
    when 'board_only' then role_rank(current_role_level()) <= 1
  end
$$;

-- ---------------------------------------------------------------------------
-- ACCESS REVIEWS (recertification) + FINDINGS (excess, dormant, conflicts)
-- ---------------------------------------------------------------------------
create table access_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  department_id uuid references departments(id) on delete cascade,     -- null = company-wide
  due_on date not null,
  status text not null default 'open',   -- open | completed
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table access_review_items (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references access_reviews(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  item_type text not null,            -- admin_assignment | user_role | access_grant | permission_override | screen_rule | project_member
  item_id uuid,
  label text not null,
  reviewer_id uuid references profiles(id) on delete set null,
  decision text,                      -- keep | remove | extend
  extend_to timestamptz,
  note text,
  decided_at timestamptz
);
create index access_review_items_review_idx on access_review_items(review_id);

create or replace function start_access_review(p_name text, p_department uuid default null, p_due date default current_date + 14) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid; o uuid := current_org();
begin
  if not (is_admin() or has_admin_perm('security.manage') or has_admin_perm('access.approve') or (p_department is not null and exists (select 1 from departments d where d.id = p_department and d.head_id = auth.uid()))) then raise exception 'forbidden'; end if;
  insert into access_reviews (org_id, name, department_id, due_on, created_by) values (o, p_name, p_department, p_due, auth.uid()) returning id into rid;
  insert into access_review_items (review_id, user_id, item_type, item_id, label, reviewer_id)
  select rid, a.user_id, 'admin_assignment', a.id, 'Admin role: ' || r.name || coalesce(' (scope ' || (select name from departments where id = a.scope_department_id) || ')', ''), coalesce((select head_id from departments d join profiles p on p.department_id = d.id where p.id = a.user_id), (select (settings->>'primary_admin_id')::uuid from organizations where id = o))
    from admin_assignments a join admin_roles r on r.id = a.admin_role_id join profiles p on p.id = a.user_id where p.org_id = o and p.is_active and (p_department is null or p.department_id = p_department);
  insert into access_review_items (review_id, user_id, item_type, item_id, label, reviewer_id)
  select rid, ur.user_id, 'user_role', ur.id, 'System role: ' || sr.name || case when ur.expires_at is not null then ' (until ' || to_char(ur.expires_at, 'DD Mon') || ')' else '' end, coalesce(p.manager_id, (select (settings->>'primary_admin_id')::uuid from organizations where id = o))
    from user_roles ur join system_roles sr on sr.id = ur.system_role_id join profiles p on p.id = ur.user_id where p.org_id = o and p.is_active and (p_department is null or p.department_id = p_department) and role_rank(sr.base_level) <= role_rank('team_lead');
  insert into access_review_items (review_id, user_id, item_type, item_id, label, reviewer_id)
  select rid, g.user_id, 'access_grant', g.id, 'Access grant: ' || g.resource_type || ' ' || g.level || case when g.expires_at is not null then ' (until ' || to_char(g.expires_at, 'DD Mon') || ')' else ' (no expiry)' end, coalesce(g.granted_by, (select (settings->>'primary_admin_id')::uuid from organizations where id = o))
    from access_grants g join profiles p on p.id = g.user_id where g.org_id = o and g.revoked_at is null and (g.expires_at is null or g.expires_at > now()) and (p_department is null or p.department_id = p_department);
  insert into access_review_items (review_id, user_id, item_type, item_id, label, reviewer_id)
  select rid, po.user_id, 'permission_override', po.id, 'Permission override: ' || po.perm || case when po.allowed then ' allowed' else ' denied' end, coalesce(po.set_by, (select (settings->>'primary_admin_id')::uuid from organizations where id = o))
    from permission_overrides po join profiles p on p.id = po.user_id where p.org_id = o and (p_department is null or p.department_id = p_department);
  insert into access_review_items (review_id, user_id, item_type, item_id, label, reviewer_id)
  select rid, pm.user_id, 'project_member', pm.project_id, 'Cross-department project: ' || pr.name, coalesce(pr.owner_id, (select (settings->>'primary_admin_id')::uuid from organizations where id = o))
    from project_members pm join projects pr on pr.id = pm.project_id join profiles p on p.id = pm.user_id
   where pr.org_id = o and not pr.archived and pr.department_id is not null and pr.department_id <> p.department_id and pr.classification in ('confidential','highly_confidential','board_only') and (p_department is null or p.department_id = p_department);
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
  select distinct reviewer_id, 'security', 'Access review: ' || p_name, 'Please review the access items assigned to you by ' || to_char(p_due, 'DD Mon') || '.', '/admin?tab=access&review=' || rid, 'access_review', rid, auth.uid() from access_review_items where review_id = rid and reviewer_id is not null;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary) values (o, auth.uid(), 'access.review_started', 'access_review', rid, p_name);
  return rid;
end $$;

create or replace function apply_access_review(p_review uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare it record; removed int := 0; extended int := 0;
begin
  if not (is_admin() or has_admin_perm('security.manage') or has_admin_perm('access.approve')) then raise exception 'forbidden'; end if;
  for it in select * from access_review_items where review_id = p_review and decision in ('remove','extend') loop
    if it.decision = 'remove' then
      if it.item_type = 'admin_assignment' then delete from admin_assignments where id = it.item_id;
      elsif it.item_type = 'user_role' then delete from user_roles where id = it.item_id;
      elsif it.item_type = 'access_grant' then update access_grants set revoked_at = now(), revoked_by = auth.uid() where id = it.item_id;
      elsif it.item_type = 'permission_override' then delete from permission_overrides where id = it.item_id;
      elsif it.item_type = 'project_member' then delete from project_members where project_id = it.item_id and user_id = it.user_id;
      end if;
      removed := removed + 1;
    elsif it.decision = 'extend' and it.extend_to is not null then
      if it.item_type = 'user_role' then update user_roles set expires_at = it.extend_to where id = it.item_id;
      elsif it.item_type = 'access_grant' then update access_grants set expires_at = it.extend_to where id = it.item_id;
      elsif it.item_type = 'admin_assignment' then update admin_assignments set expires_at = it.extend_to where id = it.item_id;
      end if;
      extended := extended + 1;
    end if;
  end loop;
  update access_reviews set status = 'completed', completed_at = now() where id = p_review;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value) values (current_org(), auth.uid(), 'access.review_applied', 'access_review', p_review, 'Access review applied', jsonb_build_object('removed', removed, 'extended', extended));
  return jsonb_build_object('removed', removed, 'extended', extended);
end $$;

/** Findings: excess access after transfer, dormant elevated access, role conflicts (requester = approver), expired temporary roles, orphaned admins. */
create or replace function access_findings() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not (is_admin() or has_admin_perm('security.manage') or has_admin_perm('access.approve') or has_admin_perm('audit.read')) then jsonb_build_object('error','forbidden') else jsonb_build_object(
    'excess_after_transfer', (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.id, 'name', p.full_name, 'channel', c.name, 'old_department', d.name)), '[]')
        from channel_members cm join channels c on c.id = cm.channel_id join profiles p on p.id = cm.user_id join departments d on d.id = c.department_id
       where c.org_id = current_org() and c.type = 'department' and p.department_id is distinct from c.department_id and p.is_active),
    'stale_grants', (select coalesce(jsonb_agg(jsonb_build_object('grant_id', g.id, 'user_id', g.user_id, 'name', person_name(g.user_id), 'resource_type', g.resource_type, 'level', g.level, 'age_days', extract(day from now() - g.created_at)::int)), '[]')
        from access_grants g where g.org_id = current_org() and g.revoked_at is null and g.expires_at is null and g.created_at < now() - interval '90 days'),
    'role_conflicts', (select coalesce(jsonb_agg(jsonb_build_object('approval_id', a.id, 'title', a.title, 'user_id', a.requested_by, 'name', person_name(a.requested_by))), '[]')
        from approvals a where a.org_id = current_org() and a.status = 'pending' and a.requested_by = a.approver_id),
    'self_approved_recent', (select coalesce(jsonb_agg(jsonb_build_object('approval_id', a.id, 'title', a.title, 'name', person_name(a.requested_by), 'at', a.decided_at)), '[]')
        from approvals a where a.org_id = current_org() and a.status = 'approved' and a.requested_by = a.approver_id and a.decided_at > now() - interval '30 days'),
    'expiring_soon', (select coalesce(jsonb_agg(jsonb_build_object('kind', k.kind, 'user_id', k.user_id, 'name', person_name(k.user_id), 'label', k.label, 'expires_at', k.expires_at)), '[]') from (
        select 'user_role' as kind, ur.user_id, sr.name as label, ur.expires_at from user_roles ur join system_roles sr on sr.id = ur.system_role_id where ur.expires_at between now() and now() + interval '7 days'
        union all select 'access_grant', g.user_id, g.resource_type || ' ' || g.level, g.expires_at from access_grants g where g.org_id = current_org() and g.revoked_at is null and g.expires_at between now() and now() + interval '7 days'
        union all select 'delegation', dl.from_user_id, 'delegation to ' || person_name(dl.to_user_id), dl.ends_at from delegations dl where dl.org_id = current_org() and dl.active and dl.ends_at between now() and now() + interval '7 days'
        union all select 'admin_assignment', a.user_id, r.name, a.expires_at from admin_assignments a join admin_roles r on r.id = a.admin_role_id where a.expires_at between now() and now() + interval '7 days') k),
    'admins_without_manager', (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.id, 'name', p.full_name)), '[]') from profiles p where p.org_id = current_org() and p.is_active and p.manager_id is null and p.role not in ('super_admin','director') and exists (select 1 from admin_assignments a where a.user_id = p.id)),
    'inactive_with_access', (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.id, 'name', p.full_name, 'grants', (select count(*) from access_grants g where g.user_id = p.id and g.revoked_at is null))), '[]') from profiles p where p.org_id = current_org() and not p.is_active and exists (select 1 from access_grants g where g.user_id = p.id and g.revoked_at is null)),
    'dormant_accounts', (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.id, 'name', p.full_name, 'last_seen', p.last_seen_at)), '[]') from profiles p where p.org_id = current_org() and p.is_active and (p.last_seen_at is null or p.last_seen_at < now() - interval '30 days'))
  ) end
$$;

-- ---------------------------------------------------------------------------
-- ORGANIZATION HEALTH (nightly completeness audit) + FREEZE / SUSPEND / LOCK FEATURE
-- ---------------------------------------------------------------------------
create or replace function org_health() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not (is_manager_plus() or has_admin_perm('people.manage') or has_admin_perm('audit.read')) then jsonb_build_object('error','forbidden') else jsonb_build_object(
    'people', jsonb_build_object('employees', (select count(*) from profiles where org_id = current_org() and is_active and not is_external), 'departments', (select count(*) from departments where org_id = current_org()), 'teams', (select count(*) from teams where org_id = current_org()), 'external', (select count(*) from profiles where org_id = current_org() and is_active and is_external)),
    'missing_manager', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', full_name)), '[]') from profiles where org_id = current_org() and is_active and not is_external and manager_id is null and role not in ('super_admin','director')),
    'missing_department', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', full_name)), '[]') from profiles where org_id = current_org() and is_active and department_id is null),
    'missing_designation', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', full_name)), '[]') from profiles where org_id = current_org() and is_active and not is_external and (designation is null or designation = '')),
    'no_responsibility', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name)), '[]') from profiles p where p.org_id = current_org() and p.is_active and not p.is_external and (p.responsibilities is null or p.responsibilities = '') and not exists (select 1 from responsibilities r where r.owner_id = p.id or r.backup_id = p.id)),
    'teams_without_lead', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name)), '[]') from teams where org_id = current_org() and lead_id is null),
    'departments_without_head', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name)), '[]') from departments d where d.org_id = current_org() and d.head_id is null and exists (select 1 from profiles p where p.department_id = d.id and p.is_active)),
    'projects_without_owner', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name)), '[]') from projects where org_id = current_org() and not archived and status not in ('completed','cancelled') and (owner_id is null or owner_id in (select id from profiles where not is_active))),
    'tasks_without_owner', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title)), '[]') from (select id, title from tasks where org_id = current_org() and status not in ('done','cancelled') and (assignee_id is null or assignee_id in (select id from profiles where not is_active)) limit 50) t),
    'groups_without_owner', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name)), '[]') from channels where org_id = current_org() and not archived and type not in ('dm') and (owner_id is null or owner_id in (select id from profiles where not is_active))),
    'files_of_exited_owners', (select count(*) from files f where f.org_id = current_org() and f.owner_id in (select id from profiles where not is_active)),
    'critical_without_backup', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'owner', person_name(owner_id))), '[]') from responsibilities where org_id = current_org() and (critical or requires_backup) and (backup_id is null or backup_id = owner_id)),
    'expired_temp_roles', (select count(*) from user_roles ur where ur.expires_at is not null and ur.expires_at <= now()),
    'temp_expiring_7d', (select count(*) from access_grants g where g.org_id = current_org() and g.revoked_at is null and g.expires_at between now() and now() + interval '7 days'),
    'probation_overdue', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'ended', probation_ends_on)), '[]') from profiles where org_id = current_org() and is_active and probation_ends_on is not null and probation_ends_on < current_date and status = 'probation'),
    'contracts_ending_30d', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'ends', contract_ends_on)), '[]') from profiles where org_id = current_org() and is_active and contract_ends_on between current_date and current_date + 30),
    'config_incomplete', (select count(*) from profiles where org_id = current_org() and config_incomplete),
    'frozen', (select count(*) from profiles where org_id = current_org() and frozen),
    'unacked_mandatory_policies', (select count(*) from policies pl where pl.org_id = current_org() and pl.status = 'active' and pl.requires_ack and (select count(*) from profiles p where p.org_id = current_org() and p.is_active and not p.is_external and not exists (select 1 from policy_acks a where a.policy_id = pl.id and a.user_id = p.id and a.version = pl.version)) > 0),
    'pending_access_requests', (select count(*) from access_requests where org_id = current_org() and status = 'pending'),
    'overdue_tasks', (select count(*) from tasks where org_id = current_org() and status not in ('done','cancelled') and due_date < now()),
    'blocked_projects', (select count(*) from projects where org_id = current_org() and not archived and status in ('at_risk','delayed','on_hold'))
  ) end
$$;

create or replace function org_completeness_audit() returns int
language plpgsql security definer set search_path = public as $$
declare o record; h jsonb; issues int; admin uuid; prev text;
begin
  for o in select * from organizations loop
    admin := (o.settings->>'primary_admin_id')::uuid;
    if admin is null then continue; end if;
    prev := current_setting('request.jwt.claims', true);
    perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
    h := org_health();
    perform set_config('request.jwt.claims', coalesce(prev, ''), true);
    issues := jsonb_array_length(h->'missing_manager') + jsonb_array_length(h->'missing_department') + jsonb_array_length(h->'teams_without_lead') + jsonb_array_length(h->'projects_without_owner') + jsonb_array_length(h->'tasks_without_owner') + jsonb_array_length(h->'groups_without_owner') + jsonb_array_length(h->'critical_without_backup') + (h->>'expired_temp_roles')::int + jsonb_array_length(h->'probation_overdue');
    -- expire temporary things first
    perform expire_delegations_and_roles();
    if issues > 0 then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id)
      values (admin, 'action_required', 'Organization health: ' || issues || ' item' || case when issues = 1 then '' else 's' end || ' need attention',
        jsonb_array_length(h->'missing_manager') || ' without manager · ' || jsonb_array_length(h->'tasks_without_owner') || ' unowned tasks · ' || jsonb_array_length(h->'groups_without_owner') || ' unowned groups · ' || jsonb_array_length(h->'critical_without_backup') || ' critical without backup · ' || jsonb_array_length(h->'probation_overdue') || ' probation reviews overdue',
        '/admin/organization?tab=health', 'org', o.id);
    end if;
    -- contract expiry notices (14 days)
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id)
    select coalesce(p.manager_id, admin), 'deadline', 'Contract ends ' || to_char(p.contract_ends_on, 'DD Mon') || ': ' || p.full_name, 'Decide on renewal, extension or exit.', '/admin?tab=hr&view=people&user=' || p.id, 'profile', p.id
      from profiles p where p.org_id = o.id and p.is_active and p.contract_ends_on = current_date + 14;
  end loop;
  return 1;
end $$;

create or replace function freeze_user(p_user uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_primary_admin() or has_admin_perm('security.manage')) then raise exception 'forbidden'; end if;
  update profiles set frozen = true, frozen_reason = p_reason where id = p_user;
  begin delete from auth.sessions where user_id = p_user; exception when others then null; end;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value) values (current_org(), auth.uid(), 'security.freeze_user', 'profile', p_user, person_name(p_user), jsonb_build_object('reason', p_reason));
  insert into security_events (org_id, user_id, kind, details) values (current_org(), auth.uid(), 'freeze', jsonb_build_object('target', p_user, 'reason', p_reason));
end $$;
create or replace function unfreeze_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_primary_admin() or has_admin_perm('security.manage')) then raise exception 'forbidden'; end if;
  update profiles set frozen = false, frozen_reason = null where id = p_user;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary) values (current_org(), auth.uid(), 'security.unfreeze_user', 'profile', p_user, person_name(p_user));
end $$;
create or replace function set_employee_status(p_user uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_hr() or has_admin_perm('security.manage')) then raise exception 'forbidden'; end if;
  if p_status not in ('active','probation','contract','intern','notice_period','suspended','inactive','exited') then raise exception 'bad status'; end if;
  perform set_config('ghl.change_reason', coalesce(p_reason, ''), true);
  update profiles set status = p_status where id = p_user;
  if p_status in ('suspended','inactive','exited') then begin delete from auth.sessions where user_id = p_user; exception when others then null; end; end if;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value) values (current_org(), auth.uid(), 'people.status_changed', 'profile', p_user, person_name(p_user) || ' → ' || p_status, jsonb_build_object('reason', p_reason));
end $$;
create or replace function freeze_department(p_department uuid, p_frozen boolean, p_reason text default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_primary_admin() then raise exception 'only the primary admin can freeze a department'; end if;
  update departments set frozen = p_frozen where id = p_department;
  select count(*) into n from profiles where department_id = p_department and is_active;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value) values (current_org(), auth.uid(), case when p_frozen then 'security.freeze_department' else 'security.unfreeze_department' end, 'department', p_department, (select name from departments where id = p_department), jsonb_build_object('reason', p_reason, 'people', n));
  return n;
end $$;
create or replace function lock_feature(p_feature text, p_locked boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_primary_admin() or has_admin_perm('security.manage')) then raise exception 'forbidden'; end if;
  insert into feature_flags (org_id, feature, enabled, locked) values (current_org(), p_feature, not p_locked, p_locked)
  on conflict (org_id, feature) do update set locked = p_locked, enabled = case when p_locked then false else feature_flags.enabled end;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value) values (current_org(), auth.uid(), case when p_locked then 'security.lock_feature' else 'security.unlock_feature' end, 'feature', null, p_feature, jsonb_build_object('reason', p_reason));
end $$;
create or replace function feature_enabled(p_feature text, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select f.enabled and not f.locked and (f.department_ids is null or (select department_id from profiles where id = p_user) = any(f.department_ids) or (f.user_ids is not null and p_user = any(f.user_ids)) or (f.team_ids is not null and (select team_id from profiles where id = p_user) = any(f.team_ids)))
                    from feature_flags f join profiles p on p.org_id = f.org_id where p.id = p_user and f.feature = p_feature), true)
$$;

-- sessions & devices (admin) + login alerts
create or replace function admin_sessions(p_user uuid default null)
returns table(session_id uuid, user_id uuid, full_name text, created_at timestamptz, updated_at timestamptz, user_agent text, ip text, current boolean)
language sql stable security definer set search_path = public, auth as $$
  select s.id, s.user_id, p.full_name, s.created_at, s.updated_at, s.user_agent, host(s.ip)::text, s.id = (select nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'session_id')::uuid
    from auth.sessions s join profiles p on p.id = s.user_id
   where p.org_id = current_org() and (p_user is null or s.user_id = p_user)
     and (s.user_id = auth.uid() or is_admin() or has_admin_perm('security.manage') or has_admin_perm('system.manage'))
   order by s.updated_at desc nulls last
$$;
create or replace function revoke_session(p_session uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
declare u uuid;
begin
  select user_id into u from auth.sessions where id = p_session;
  if u is null then return; end if;
  if not (u = auth.uid() or is_admin() or has_admin_perm('security.manage') or has_admin_perm('system.manage')) then raise exception 'forbidden'; end if;
  begin delete from auth.sessions where id = p_session; exception when others then raise exception 'could not revoke session: %', sqlerrm; end;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary) values (current_org(), auth.uid(), 'security.session_revoked', 'profile', u, person_name(u));
end $$;
create or replace function session_login_alert() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare o uuid; seen boolean; ua text := left(coalesce(new.user_agent, ''), 200);
begin
  select org_id into o from profiles where id = new.user_id;
  if o is null then return null; end if;
  insert into security_events (org_id, user_id, kind, details, ip) values (o, new.user_id, 'login', jsonb_build_object('user_agent', ua, 'session_id', new.id), host(new.ip)::text);
  select exists (select 1 from security_events e where e.user_id = new.user_id and e.kind = 'login' and e.details->>'user_agent' = ua and e.created_at > now() - interval '30 days' and e.id < currval('security_events_id_seq')) into seen;
  if not seen then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id)
    values (new.user_id, 'security', 'New sign-in on an unfamiliar device', 'If this was not you, sign out everywhere from your profile → Sessions and tell IT.', '/people/' || new.user_id || '?tab=sessions', 'session', new.id);
  end if;
  return null;
end $$;
do $do$ begin
  execute 'drop trigger if exists sessions_login_alert on auth.sessions';
  execute 'create trigger sessions_login_alert after insert on auth.sessions for each row execute function session_login_alert()';
exception when others then raise notice 'login alert trigger skipped: %', sqlerrm; end $do$;

-- ---------------------------------------------------------------------------
-- ASSIGNMENT RULES (who may assign whom) + DELEGATION RECEIPTS
-- ---------------------------------------------------------------------------
create or replace function can_assign(p_assignee uuid, p_assigner uuid default auth.uid()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare a profiles%rowtype; t profiles%rowtype; alvl role_level;
begin
  if p_assignee is null or p_assignee = p_assigner then return true; end if;
  select * into a from profiles where id = p_assigner;
  select * into t from profiles where id = p_assignee;
  if a.id is null or t.id is null then return false; end if;
  if a.role = 'super_admin' or is_hr() then return true; end if;
  alvl := effective_level(p_assigner);
  if role_rank(alvl) <= 2 then return true; end if;                                    -- directors/executives: anyone
  if role_rank(alvl) <= 3 and t.department_id = a.department_id then return true; end if; -- department head: own department
  if is_manager_of(p_assignee) then return true; end if;                                -- direct/indirect reports
  if exists (select 1 from delegations d where d.to_user_id = p_assigner and d.active and 'tasks' = any(d.kinds) and d.starts_at <= now() and (d.ends_at is null or d.ends_at > now()) and is_manager_of_user(d.from_user_id, p_assignee)) then return true; end if;
  if role_rank(alvl) <= 4 and t.department_id = a.department_id then return true; end if; -- manager: own department
  if role_rank(alvl) <= 5 and (t.team_id = a.team_id or t.manager_id = p_assigner) then return true; end if; -- team lead: own team
  -- peers: same department or shared project, and not more senior
  if role_rank(t.role) >= role_rank(a.role) and (t.department_id = a.department_id or exists (select 1 from project_members m1 join project_members m2 on m1.project_id = m2.project_id where m1.user_id = p_assigner and m2.user_id = p_assignee)) then return true; end if;
  return false;
end $$;
create or replace function is_manager_of_user(p_manager uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = p_user and (p.manager_id = p_manager or p.secondary_manager_id = p_manager or p.functional_manager_id = p_manager))
      or exists (select 1 from profiles p join departments d on d.id = p.department_id where p.id = p_user and d.head_id = p_manager)
$$;

create or replace function task_assignment_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;                                       -- system / triggers
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) and new.assignee_id <> auth.uid() then
    if not can_assign(new.assignee_id) then
      raise exception 'You cannot assign work to % directly. Use Request Help so their manager can route it.', person_name(new.assignee_id) using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger tasks_assignment_guard before insert or update of assignee_id on tasks for each row execute function task_assignment_guard();

alter table tasks
  add column if not exists definition_of_done text,
  add column if not exists quality_gates jsonb,          -- [{label, done, by, at}]
  add column if not exists reopen_reason text,
  add column if not exists revision_count int not null default 0,
  add column if not exists ack_status text,              -- accepted | clarify | conflict (delegation receipt)
  add column if not exists ack_note text,
  add column if not exists ack_at timestamptz;

create or replace function task_quality_gate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' and new.quality_gates is not null and jsonb_typeof(new.quality_gates) = 'array' then
    if exists (select 1 from jsonb_array_elements(new.quality_gates) g where coalesce((g->>'done')::boolean, false) = false) then
      raise exception 'Quality gates incomplete: % — tick every gate before marking done.', (select string_agg(g->>'label', ', ') from jsonb_array_elements(new.quality_gates) g where coalesce((g->>'done')::boolean, false) = false) using errcode = '23514';
    end if;
  end if;
  if old.status = 'done' and new.status is distinct from 'done' then
    new.revision_count := coalesce(old.revision_count, 0) + 1;
  end if;
  if new.assignee_id is distinct from old.assignee_id then new.ack_status := null; new.ack_note := null; new.ack_at := null; end if;
  return new;
end $$;
create trigger tasks_quality_gate before update on tasks for each row execute function task_quality_gate();

create or replace function ack_task(p_task uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare t tasks%rowtype;
begin
  select * into t from tasks where id = p_task;
  if t.assignee_id <> auth.uid() then raise exception 'only the assignee can acknowledge'; end if;
  update tasks set ack_status = p_status, ack_note = p_note, ack_at = now() where id = p_task;
  if coalesce(t.delegated_by, t.created_by) is not null and coalesce(t.delegated_by, t.created_by) <> auth.uid() then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (coalesce(t.delegated_by, t.created_by), case when p_status = 'accepted' then 'information'::notification_kind else 'action_required'::notification_kind end,
            person_name(auth.uid()) || case p_status when 'accepted' then ' accepted: ' when 'clarify' then ' needs clarification: ' else ' flagged a deadline conflict: ' end || t.title, p_note, '/tasks/' || t.id, 'task', t.id, auth.uid());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- BULK IMPORT (preview in UI) + CONFIG HISTORY (undo)
-- ---------------------------------------------------------------------------
create or replace function import_people(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; skipped int := 0; errs jsonb := '[]'::jsonb; dept uuid; mgr uuid; o uuid := current_org();
begin
  if not (is_hr() or has_admin_perm('people.manage')) then raise exception 'forbidden'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      if coalesce(r->>'email','') = '' or coalesce(r->>'full_name','') = '' then skipped := skipped + 1; errs := errs || jsonb_build_object('row', r, 'error', 'missing email or name'); continue; end if;
      if exists (select 1 from profiles where org_id = o and lower(email) = lower(r->>'email')) or exists (select 1 from invites where org_id = o and lower(email) = lower(r->>'email') and accepted_at is null) then skipped := skipped + 1; errs := errs || jsonb_build_object('row', r, 'error', 'already exists'); continue; end if;
      select id into dept from departments where org_id = o and (slug = lower(r->>'department') or lower(name) = lower(r->>'department')) limit 1;
      select id into mgr from profiles where org_id = o and (lower(email) = lower(r->>'manager_email') or lower(full_name) = lower(r->>'manager')) limit 1;
      insert into invites (org_id, email, full_name, role, department_id, designation, manager_id, invited_by)
      values (o, lower(r->>'email'), r->>'full_name', coalesce(nullif(r->>'role','')::role_level, 'employee'), dept, r->>'designation', mgr, auth.uid());
      n := n + 1;
    exception when others then
      skipped := skipped + 1; errs := errs || jsonb_build_object('row', r, 'error', sqlerrm);
    end;
  end loop;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value) values (o, auth.uid(), 'people.bulk_import', 'org', o, n || ' invites created', jsonb_build_object('created', n, 'skipped', skipped));
  return jsonb_build_object('created', n, 'skipped', skipped, 'errors', errs);
end $$;

create table config_history (
  id bigint generated always as identity primary key,
  org_id uuid references organizations(id) on delete cascade,
  entity text not null,
  entity_id text,
  op text not null,
  before jsonb,
  after jsonb,
  actor_id uuid references profiles(id) on delete set null,
  at timestamptz not null default now(),
  undone_at timestamptz
);
create or replace function config_history_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  o := coalesce((to_jsonb(coalesce(new, old))->>'org_id')::uuid, (select org_id from profiles where id = auth.uid()));
  insert into config_history (org_id, entity, entity_id, op, before, after, actor_id)
  values (o, tg_table_name, coalesce(to_jsonb(coalesce(new, old))->>'id', (to_jsonb(coalesce(new, old))->>'user_id') || ':' || coalesce(to_jsonb(coalesce(new, old))->>'perm', to_jsonb(coalesce(new, old))->>'feature', '')), tg_op, case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end, auth.uid());
  return null;
end $$;
create trigger system_roles_history after insert or update or delete on system_roles for each row execute function config_history_log();
create trigger user_roles_history after insert or update or delete on user_roles for each row execute function config_history_log();
create trigger screen_rules_history after insert or update or delete on screen_rules for each row execute function config_history_log();
create trigger permission_overrides_history after insert or update or delete on permission_overrides for each row execute function config_history_log();
create trigger feature_flags_history after insert or update or delete on feature_flags for each row execute function config_history_log();
create trigger delegations_history after insert or update or delete on delegations for each row execute function config_history_log();
create trigger admin_assignments_history after insert or update or delete on admin_assignments for each row execute function config_history_log();
create trigger nav_layouts_history after insert or update or delete on nav_layouts for each row execute function config_history_log();

create or replace function undo_config(p_history bigint) returns void
language plpgsql security definer set search_path = public as $$
declare h config_history%rowtype;
begin
  if not (is_admin() or has_admin_perm('security.manage') or has_admin_perm('system.manage')) then raise exception 'forbidden'; end if;
  select * into h from config_history where id = p_history and org_id = current_org() and undone_at is null;
  if h.id is null then raise exception 'not found'; end if;
  if h.entity not in ('screen_rules','permission_overrides','user_roles','delegations','system_roles','nav_layouts') then raise exception 'undo not supported for %', h.entity; end if;
  if h.op = 'INSERT' then
    execute format('delete from %I where id = $1', h.entity) using (h.after->>'id')::uuid;
  elsif h.op = 'DELETE' then
    execute format('insert into %I select * from jsonb_populate_record(null::%I, $1)', h.entity, h.entity) using h.before;
  else
    execute format('update %I set (%s) = (select %s from jsonb_populate_record(null::%I, $1)) where id = $2', h.entity,
      (select string_agg(quote_ident(key), ',') from jsonb_object_keys(h.before) key where key <> 'id'),
      (select string_agg(quote_ident(key), ',') from jsonb_object_keys(h.before) key where key <> 'id'), h.entity) using h.before, (h.before->>'id')::uuid;
  end if;
  update config_history set undone_at = now() where id = p_history;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary) values (h.org_id, auth.uid(), 'config.undone', h.entity, null, h.entity || ' ' || h.op || ' reverted');
end $$;

-- ---------------------------------------------------------------------------
-- MY TEAM / REPORTING TREE / CHANGE-IMPACT PREVIEW
-- ---------------------------------------------------------------------------
create or replace function reports_of(p_user uuid default auth.uid(), p_depth int default 6)
returns table(id uuid, full_name text, designation text, department_id uuid, manager_id uuid, role role_level, presence presence_status, status text, depth int)
language sql stable security definer set search_path = public as $$
  with recursive tree as (
    select p.id, p.full_name, p.designation, p.department_id, p.manager_id, p.role, p.presence, p.status, 1 as depth from profiles p where p.manager_id = p_user and p.is_active
    union all
    select p.id, p.full_name, p.designation, p.department_id, p.manager_id, p.role, p.presence, p.status, t.depth + 1 from profiles p join tree t on p.manager_id = t.id where p.is_active and t.depth < p_depth
  )
  select * from tree where is_active_member() and (p_user = auth.uid() or is_manager_plus() or is_hr())
$$;

create or replace function change_impact(p_user uuid, p_new_manager uuid default null, p_new_department uuid default null, p_new_role role_level default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not (is_hr() or is_manager_of(p_user) or is_admin()) then jsonb_build_object('error','forbidden') else jsonb_build_object(
    'person', person_name(p_user),
    'direct_reports', (select count(*) from profiles where manager_id = p_user and is_active),
    'reports_change_manager', (select coalesce(jsonb_agg(full_name), '[]') from profiles where manager_id = p_user and is_active),
    'pending_approvals_as_approver', (select count(*) from approvals where approver_id = p_user and status = 'pending'),
    'pending_leaves_as_manager', (select count(*) from leaves where manager_id = p_user and status = 'pending'),
    'department_rooms_to_leave', (select coalesce(jsonb_agg(c.name), '[]') from channel_members cm join channels c on c.id = cm.channel_id join profiles p on p.id = cm.user_id where cm.user_id = p_user and c.type = 'department' and p_new_department is not null and c.department_id = p.department_id and p.department_id is distinct from p_new_department),
    'department_rooms_to_join', (select coalesce(jsonb_agg(c.name), '[]') from channels c where p_new_department is not null and c.type = 'department' and c.department_id = p_new_department and not c.archived),
    'projects', (select coalesce(jsonb_agg(pr.name), '[]') from project_members pm join projects pr on pr.id = pm.project_id where pm.user_id = p_user and not pr.archived),
    'department_grants_revoked', (select count(*) from access_grants g join profiles p on p.id = g.user_id where g.user_id = p_user and g.revoked_at is null and g.resource_type = 'department' and p_new_department is not null and g.resource_id = p.department_id),
    'responsibilities', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'critical', critical, 'backup', person_name(backup_id))), '[]') from responsibilities where owner_id = p_user),
    'screens_lost', (select coalesce(jsonb_agg(s.key), '[]') from screens s where p_new_role is not null and role_rank((select role from profiles where id = p_user)) <= role_rank(s.default_min_level) and role_rank(p_new_role) > role_rank(s.default_min_level)),
    'screens_gained', (select coalesce(jsonb_agg(s.key), '[]') from screens s where p_new_role is not null and role_rank((select role from profiles where id = p_user)) > role_rank(s.default_min_level) and role_rank(p_new_role) <= role_rank(s.default_min_level)),
    'approval_routes_affected', (select count(*) from delegations d where (d.from_user_id = p_user or d.to_user_id = p_user) and d.active),
    'new_manager', person_name(p_new_manager),
    'new_department', (select name from departments where id = p_new_department)
  ) end
$$;

create or replace function change_manager(p_user uuid, p_new_manager uuid, p_kind text default 'primary', p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_hr() or is_manager_of(p_user) or is_admin()) then raise exception 'forbidden'; end if;
  if p_new_manager = p_user then raise exception 'a person cannot report to themselves'; end if;
  if exists (select 1 from reports_of(p_user) r where r.id = p_new_manager) then raise exception 'that would create a reporting loop'; end if;
  perform set_config('ghl.change_reason', coalesce(p_reason, ''), true);
  if p_kind = 'primary' then update profiles set manager_id = p_new_manager where id = p_user;
  elsif p_kind = 'secondary' then update profiles set secondary_manager_id = p_new_manager where id = p_user;
  else update profiles set functional_manager_id = p_new_manager where id = p_user; end if;
  update approvals set approver_id = p_new_manager, delegated_from = (select manager_id from profiles where id = p_user) where approver_id = (select manager_id from profiles where id = p_user) and requested_by = p_user and status = 'pending' and p_kind = 'primary';
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id) values (p_user, 'information', 'You now report to ' || person_name(p_new_manager) || case when p_kind <> 'primary' then ' (' || p_kind || ')' else '' end, coalesce(p_reason, ''), '/people/' || p_user, 'profile', p_user, auth.uid());
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id) values (p_new_manager, 'information', person_name(p_user) || ' now reports to you' || case when p_kind <> 'primary' then ' (' || p_kind || ')' else '' end, coalesce(p_reason, ''), '/people/' || p_user, 'profile', p_user, auth.uid());
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table manager_history enable row level security;
alter table role_history enable row level security;
alter table system_roles enable row level security;
alter table user_roles enable row level security;
alter table role_defaults enable row level security;
alter table permission_overrides enable row level security;
alter table screens enable row level security;
alter table screen_rules enable row level security;
alter table nav_layouts enable row level security;
alter table module_usage enable row level security;
alter table responsibilities enable row level security;
alter table glossary enable row level security;
alter table delegations enable row level security;
alter table access_reviews enable row level security;
alter table access_review_items enable row level security;
alter table policies enable row level security;
alter table policy_versions enable row level security;
alter table policy_acks enable row level security;
alter table config_history enable row level security;

create policy mh_read on manager_history for select to authenticated using (user_id = auth.uid() or is_hr() or is_manager_of(user_id));
create policy rh_read on role_history for select to authenticated using (user_id = auth.uid() or is_hr() or is_manager_of(user_id));
create policy sr_read on system_roles for select to authenticated using (org_id = current_org());
create policy sr_write on system_roles for all to authenticated using (org_id = current_org() and (is_admin() or has_admin_perm('people.manage') or has_admin_perm('security.manage'))) with check (org_id = current_org() and (is_admin() or has_admin_perm('people.manage') or has_admin_perm('security.manage')));
create policy ur_read on user_roles for select to authenticated using (user_id = auth.uid() or is_manager_plus() or is_hr() or has_admin_perm('security.manage'));
create policy ur_write on user_roles for all to authenticated using (is_admin() or is_hr() or has_admin_perm('security.manage') or (is_manager_of(user_id) and exists (select 1 from system_roles s where s.id = system_role_id and role_rank(s.base_level) >= role_rank(effective_level(auth.uid())))))
  with check (is_admin() or is_hr() or has_admin_perm('security.manage') or (is_manager_of(user_id) and exists (select 1 from system_roles s where s.id = system_role_id and role_rank(s.base_level) >= role_rank(effective_level(auth.uid())))));
create policy rd_read on role_defaults for select to authenticated using (org_id = current_org());
create policy rd_write on role_defaults for all to authenticated using (org_id = current_org() and is_primary_admin()) with check (org_id = current_org() and is_primary_admin());
create policy po_read on permission_overrides for select to authenticated using (user_id = auth.uid() or is_admin() or has_admin_perm('security.manage') or is_manager_of(user_id));
create policy po_write on permission_overrides for all to authenticated using (is_admin() or has_admin_perm('security.manage')) with check (is_admin() or has_admin_perm('security.manage'));
create policy screens_read on screens for select to authenticated using (true);
create policy screen_rules_read on screen_rules for select to authenticated using (org_id = current_org() and (is_admin() or has_admin_perm('security.manage') or has_admin_perm('features.manage') or (scope = 'user' and scope_id = auth.uid()) or (scope = 'department' and scope_id = current_department())));
create policy screen_rules_write on screen_rules for all to authenticated using (org_id = current_org() and (is_admin() or has_admin_perm('security.manage') or has_admin_perm('features.manage') or (scope in ('user','department') and has_admin_perm('department.manage') and coalesce(scope_id = current_department() or (select department_id from profiles where id = scope_id) = current_department(), false))))
  with check (org_id = current_org() and (is_admin() or has_admin_perm('security.manage') or has_admin_perm('features.manage') or (scope in ('user','department') and has_admin_perm('department.manage'))));
create policy nav_read on nav_layouts for select to authenticated using (org_id = current_org());
create policy nav_write on nav_layouts for all to authenticated using (org_id = current_org() and (is_admin() or has_admin_perm('features.manage'))) with check (org_id = current_org() and (is_admin() or has_admin_perm('features.manage')));
create policy mu_self on module_usage for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy mu_admin on module_usage for select to authenticated using (is_admin() or has_admin_perm('system.manage'));
create policy resp_read on responsibilities for select to authenticated using (org_id = current_org() and is_active_member());
create policy resp_write on responsibilities for all to authenticated using (org_id = current_org() and (is_manager_plus() or is_hr() or owner_id = auth.uid() or (department_id = current_department() and is_lead_plus()))) with check (org_id = current_org() and (is_manager_plus() or is_hr() or (department_id = current_department() and is_lead_plus())));
create policy gl_read on glossary for select to authenticated using (org_id = current_org() and is_active_member());
create policy gl_write on glossary for all to authenticated using (org_id = current_org() and (is_lead_plus() or created_by = auth.uid())) with check (org_id = current_org() and is_active_member());
create policy dl_read on delegations for select to authenticated using (org_id = current_org() and (from_user_id = auth.uid() or to_user_id = auth.uid() or is_manager_plus() or is_hr()));
create policy dl_write on delegations for all to authenticated using (org_id = current_org() and (from_user_id = auth.uid() or is_admin() or is_hr() or is_manager_of(from_user_id))) with check (org_id = current_org() and (from_user_id = auth.uid() or is_admin() or is_hr() or is_manager_of(from_user_id)));
create policy ar_read on access_reviews for select to authenticated using (org_id = current_org() and (is_admin() or has_admin_perm('security.manage') or has_admin_perm('access.approve') or created_by = auth.uid() or exists (select 1 from access_review_items i where i.review_id = id and i.reviewer_id = auth.uid())));
create policy ari_read on access_review_items for select to authenticated using (reviewer_id = auth.uid() or user_id = auth.uid() or is_admin() or has_admin_perm('security.manage') or has_admin_perm('access.approve'));
create policy ari_update on access_review_items for update to authenticated using (reviewer_id = auth.uid() or is_admin() or has_admin_perm('security.manage') or has_admin_perm('access.approve'));
create policy pol_read on policies for select to authenticated using (org_id = current_org() and (status = 'active' or is_hr() or owner_id = auth.uid() or created_by = auth.uid() or is_admin()));
create policy pol_write on policies for all to authenticated using (org_id = current_org() and (is_hr() or has_admin_perm('security.manage') or owner_id = auth.uid())) with check (org_id = current_org() and (is_hr() or has_admin_perm('security.manage') or is_lead_plus()));
create policy pv_read on policy_versions for select to authenticated using (exists (select 1 from policies p where p.id = policy_id));
create policy pa_read on policy_acks for select to authenticated using (user_id = auth.uid() or is_hr() or is_manager_of(user_id) or is_admin());
create policy pa_insert on policy_acks for insert to authenticated with check (user_id = auth.uid());
create policy ch_read on config_history for select to authenticated using (org_id = current_org() and (is_admin() or has_admin_perm('security.manage') or has_admin_perm('system.manage') or has_admin_perm('audit.read')));

grant execute on function has_perm(text,uuid), effective_level(uuid), effective_screens(uuid), can_view_screen(text), effective_nav(uuid), touch_module(text), who_owns(text), delegate_for(uuid,text), effective_approver(uuid,text),
  start_access_review(text,uuid,date), apply_access_review(uuid), access_findings(), org_health(), freeze_user(uuid,text), unfreeze_user(uuid), set_employee_status(uuid,text,text), freeze_department(uuid,boolean,text), lock_feature(text,boolean,text), feature_enabled(text,uuid),
  admin_sessions(uuid), revoke_session(uuid), my_pending_policies(), training_gate_ok(uuid), can_assign(uuid,uuid), is_manager_of_user(uuid,uuid), ack_task(uuid,text,text), import_people(jsonb), undo_config(bigint), reports_of(uuid,int), change_impact(uuid,uuid,uuid,role_level), change_manager(uuid,uuid,text,text), is_primary_admin_user(uuid), has_admin_perm_user(uuid,text) to authenticated;
revoke execute on function has_perm(text,uuid), effective_level(uuid), effective_screens(uuid), can_view_screen(text), effective_nav(uuid), touch_module(text), who_owns(text), delegate_for(uuid,text), effective_approver(uuid,text),
  start_access_review(text,uuid,date), apply_access_review(uuid), access_findings(), org_health(), freeze_user(uuid,text), unfreeze_user(uuid), set_employee_status(uuid,text,text), freeze_department(uuid,boolean,text), lock_feature(text,boolean,text), feature_enabled(text,uuid),
  admin_sessions(uuid), revoke_session(uuid), my_pending_policies(), training_gate_ok(uuid), can_assign(uuid,uuid), is_manager_of_user(uuid,uuid), ack_task(uuid,text,text), import_people(jsonb), undo_config(bigint), reports_of(uuid,int), change_impact(uuid,uuid,uuid,role_level), change_manager(uuid,uuid,text,text), is_primary_admin_user(uuid), has_admin_perm_user(uuid,text),
  profile_change_history(), profile_status_sync(), approvals_route_delegation(), leaves_route_delegation(), delegations_notify(), expire_delegations_and_roles(), org_completeness_audit(), session_login_alert(), policy_publish(), task_assignment_guard(), task_quality_gate(), config_history_log() from anon, public;
revoke execute on function expire_delegations_and_roles(), org_completeness_audit() from authenticated;

select cron.schedule('ghl_org_audit', '45 3 * * *', $$select org_completeness_audit()$$);
select cron.schedule('ghl_expire_roles', '*/15 * * * *', $$select expire_delegations_and_roles()$$);

-- ---------------------------------------------------------------------------
-- SEED: system roles, level defaults
-- ---------------------------------------------------------------------------
insert into role_defaults (org_id, level, permissions) values
 ('00000000-0000-0000-0000-000000000001','super_admin','{view,comment,create,edit,delete,download,share_internal,share_external,approve,invite,create_group,create_project,assign_task,view_reports,export,broadcast_department,broadcast_company,manage_team,review_recordings,record_calls}'),
 ('00000000-0000-0000-0000-000000000001','director','{view,comment,create,edit,delete,download,share_internal,share_external,approve,invite,create_group,create_project,assign_task,view_reports,export,broadcast_department,broadcast_company,manage_team,review_recordings}'),
 ('00000000-0000-0000-0000-000000000001','executive','{view,comment,create,edit,delete,download,share_internal,share_external,approve,invite,create_group,create_project,assign_task,view_reports,export,broadcast_department,broadcast_company,manage_team,review_recordings}'),
 ('00000000-0000-0000-0000-000000000001','department_head','{view,comment,create,edit,delete,download,share_internal,approve,invite,create_group,create_project,assign_task,view_reports,export,broadcast_department,manage_team,review_recordings}'),
 ('00000000-0000-0000-0000-000000000001','manager','{view,comment,create,edit,download,share_internal,approve,invite,create_group,create_project,assign_task,view_reports,manage_team}'),
 ('00000000-0000-0000-0000-000000000001','team_lead','{view,comment,create,edit,download,share_internal,invite,create_group,assign_task,manage_team}'),
 ('00000000-0000-0000-0000-000000000001','employee','{view,comment,create,edit,download,share_internal,create_group}'),
 ('00000000-0000-0000-0000-000000000001','intern','{view,comment,create,edit}'),
 ('00000000-0000-0000-0000-000000000001','consultant','{view,comment,create,edit}'),
 ('00000000-0000-0000-0000-000000000001','vendor','{view,comment}'),
 ('00000000-0000-0000-0000-000000000001','guest','{view}');

insert into system_roles (org_id, key, name, description, base_level, permissions, screens, denied_screens, is_system) values
 ('00000000-0000-0000-0000-000000000001','employee','Employee','Standard employee','employee','{view,comment,create,edit,download,share_internal,create_group}','{}','{}',true),
 ('00000000-0000-0000-0000-000000000001','senior_employee','Senior Employee','Experienced individual contributor; may review peers','employee','{view,comment,create,edit,download,share_internal,create_group,approve}','{}','{}',true),
 ('00000000-0000-0000-0000-000000000001','team_lead','Team Lead','Leads a team','team_lead','{view,comment,create,edit,download,share_internal,invite,create_group,assign_task,manage_team}','{delegate,automations}','{}',true),
 ('00000000-0000-0000-0000-000000000001','manager','Manager','Manages people and approves team work','manager','{view,comment,create,edit,download,share_internal,approve,invite,create_group,create_project,assign_task,view_reports,manage_team}','{command,workforce,reports}','{}',true),
 ('00000000-0000-0000-0000-000000000001','department_head','Department Head','Runs a department','department_head','{view,comment,create,edit,delete,download,share_internal,approve,invite,create_group,create_project,assign_task,view_reports,export,broadcast_department,manage_team,review_recordings}','{command,workforce,reports}','{}',true),
 ('00000000-0000-0000-0000-000000000001','executive','Executive','Company leadership','executive','{view,comment,create,edit,delete,download,share_internal,share_external,approve,invite,create_group,create_project,assign_task,view_reports,export,broadcast_department,broadcast_company,manage_team,review_recordings}','{command,workforce,reports,org-control}','{}',true),
 ('00000000-0000-0000-0000-000000000001','hr_staff','HR Staff','HR operations without admin rights','employee','{view,comment,create,edit,download,share_internal,view_reports}','{attendance,leave,people}','{}',true),
 ('00000000-0000-0000-0000-000000000001','it_support','IT Support','Handles IT requests and assets','employee','{view,comment,create,edit,download,share_internal,assign_task}','{help}','{}',true),
 ('00000000-0000-0000-0000-000000000001','developer','Developer','Builds software','employee','{view,comment,create,edit,download,share_internal,create_group}','{projects,tasks,help,wiki}','{}',true),
 ('00000000-0000-0000-0000-000000000001','designer','Designer','Design and creative work','employee','{view,comment,create,edit,download,share_internal,create_group}','{projects,tasks,help,files}','{}',true),
 ('00000000-0000-0000-0000-000000000001','writer','Writer','Content and copy','employee','{view,comment,create,edit,download,share_internal,create_group}','{projects,tasks,help,files,wiki}','{}',true),
 ('00000000-0000-0000-0000-000000000001','sales_executive','Sales Executive','External customer communication','employee','{view,comment,create,edit,download,share_internal,share_external,create_group,record_calls}','{connect,meetings}','{}',true),
 ('00000000-0000-0000-0000-000000000001','support_executive','Support Executive','Customer support communication','employee','{view,comment,create,edit,download,share_internal,share_external,create_group,record_calls}','{connect,help}','{}',true),
 ('00000000-0000-0000-0000-000000000001','design_reviewer','Design Reviewer','May approve design work','employee','{view,comment,approve}','{}','{}',true),
 ('00000000-0000-0000-0000-000000000001','intern','Intern','Assigned projects and necessary files only','intern','{view,comment,create,edit}','{}','{files,decisions,departments,ideas}',true),
 ('00000000-0000-0000-0000-000000000001','limited_admin','Limited Admin','Admin console access without organization-wide power','manager','{view,comment,create,edit,download,share_internal,approve,invite,create_group,create_project,assign_task,view_reports}','{admin}','{}',true),
 ('00000000-0000-0000-0000-000000000001','acting_manager','Acting Manager','Temporary manager authority (assign with an expiry)','manager','{view,comment,create,edit,download,share_internal,approve,invite,create_group,assign_task,view_reports,manage_team}','{command,workforce}','{}',true);

update departments set default_screens = (case slug when 'sales' then '{connect}' when 'support' then '{connect}' when 'bizdev' then '{connect}' when 'investor-relations' then '{connect}' else '{}' end)::text[] where org_id = '00000000-0000-0000-0000-000000000001';

insert into responsibilities (org_id, name, description, department_id, owner_id, critical, requires_backup, decision_level)
select '00000000-0000-0000-0000-000000000001', v.name, v.description, d.id, d.head_id, true, true, v.lvl from departments d join (values
  ('technology','Website & app deployment','Production deployments and rollbacks','approve_department'),
  ('technology','IT emergencies & on-call','First response for outages and security incidents','approve_department'),
  ('hr','Attendance & leave approvals','Final leave approvals, attendance corrections','approve_department'),
  ('hr','Recruitment','Hiring pipeline and offers','approve_department'),
  ('design','Brand assets','Logo, templates, brand rules','approve_department'),
  ('content','Website copy approvals','Final copy for public pages','approve_department'),
  ('finance','Expense approvals','Reimbursements and purchase approvals','approve_department')
) as v(slug, name, description, lvl) on v.slug = d.slug where d.org_id = '00000000-0000-0000-0000-000000000001';

alter publication supabase_realtime add table delegations, policies;

-- fixes after smoke test: can_assign must evaluate the assigner (not auth.uid()); executives get Organization Control; seeded rooms get owners
create or replace function can_assign(p_assignee uuid, p_assigner uuid default auth.uid()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare a profiles%rowtype; t profiles%rowtype; alvl role_level;
begin
  if p_assignee is null or p_assignee = p_assigner then return true; end if;
  select * into a from profiles where id = p_assigner;
  select * into t from profiles where id = p_assignee;
  if a.id is null or t.id is null then return false; end if;
  if a.role = 'super_admin' or has_admin_perm_user(p_assigner, 'hr.manage') or has_admin_perm_user(p_assigner, 'people.manage') then return true; end if;
  alvl := effective_level(p_assigner);
  if role_rank(alvl) <= 2 then return true; end if;
  if role_rank(alvl) <= 3 and t.department_id = a.department_id then return true; end if;
  if is_manager_of_user(p_assigner, p_assignee) then return true; end if;
  if exists (select 1 from delegations d where d.to_user_id = p_assigner and d.active and 'tasks' = any(d.kinds) and d.starts_at <= now() and (d.ends_at is null or d.ends_at > now()) and is_manager_of_user(d.from_user_id, p_assignee)) then return true; end if;
  if role_rank(alvl) <= 4 and t.department_id = a.department_id then return true; end if;
  if role_rank(alvl) <= 5 and (t.team_id = a.team_id or t.manager_id = p_assigner) then return true; end if;
  if role_rank(t.role) >= role_rank(a.role) and (t.department_id = a.department_id or exists (select 1 from project_members m1 join project_members m2 on m1.project_id = m2.project_id where m1.user_id = p_assigner and m2.user_id = p_assignee)) then return true; end if;
  return false;
end $$;
update screens set default_min_level = 'executive' where key = 'org-control';
update channels c set owner_id = coalesce((select d.head_id from departments d where d.id = c.department_id), (select (o.settings->>'primary_admin_id')::uuid from organizations o where o.id = c.org_id)) where c.owner_id is null and c.type <> 'dm';
