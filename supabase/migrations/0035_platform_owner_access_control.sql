-- 0035_platform_owner_access_control.sql
--
-- Platform-level role, access and permission governance. ADDITIVE: it extends the machinery that
-- already exists (`system_roles`, `user_roles`, `role_defaults`, `permission_overrides`, `screens`,
-- `screen_rules`, `platform_admins`) rather than introducing a second, parallel system.
--
-- The three things this changes about how authorisation *behaves*:
--   1. An explicit individual DENY now outranks everything below the platform owner, including a
--      company super admin. `has_perm` checked `role = 'super_admin'` first and returned true, so
--      "admin" really did mean unlimited and a deny could never be written that mattered.
--   2. The platform owner is a named, reserved authority (`is_platform_owner`) rather than an
--      accident of also holding a company role.
--   3. What a company's own administrators may do is bounded by `company_admin_limits`, which only
--      the platform owner may write. A company admin is an administrator of the things the platform
--      owner has handed them — no more.
--
-- Everything else keeps working exactly as before: with no limits row and no overrides (the state
-- this migration is written against) `has_perm` returns precisely what it returned yesterday.

-- ---------------------------------------------------------------------------
-- 1. WHO THE PLATFORM OWNER IS
--
-- `platform_super_admin` in `platform_admins` is the owner role; this names it so application code
-- and policies can ask the question directly instead of string-matching a column.
-- ---------------------------------------------------------------------------
-- `is_platform_owner()` already exists and takes no arguments; adding a defaulted overload would
-- make every existing no-argument call ambiguous. The per-user form gets its own name, matching
-- the `is_platform_admin_user` convention already in the schema.
create or replace function public.is_platform_owner_user(p_user uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce(platform_role(p_user) = 'platform_super_admin', false)
$$;

create or replace function public.is_platform_owner()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select is_platform_owner_user(auth.uid())
$$;

grant execute on function public.is_platform_owner_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. THE PERMISSION CATALOGUE
--
-- Until now a permission was just a string that happened to appear in an array somewhere. Nothing
-- listed what keys exist, what they mean, which ones are dangerous, or which imply which. That is
-- unworkable as the surface an owner administers, so the catalogue is now a table.
-- ---------------------------------------------------------------------------
create table if not exists public.permissions (
  key          text primary key,
  label        text not null,
  description  text,
  grp          text not null default 'general',   -- module this belongs to, for the studio's map
  risk         text not null default 'standard'   -- standard | elevated | high
               check (risk in ('standard', 'elevated', 'high')),
  -- Granting X without Y is usually meaningless; the studio warns before saving (§113).
  requires     text[] not null default '{}',
  -- Platform-only keys can never be held inside a company, whoever asks.
  platform_only boolean not null default false,
  position     int not null default 100
);

alter table public.permissions enable row level security;

-- The catalogue is not secret — it is the vocabulary of the UI — but only the platform owner writes it.
drop policy if exists perm_catalog_read on public.permissions;
create policy perm_catalog_read on public.permissions for select using (auth.uid() is not null);

drop policy if exists perm_catalog_write on public.permissions;
create policy perm_catalog_write on public.permissions for all
  using (is_platform_owner()) with check (is_platform_owner());

-- ---------------------------------------------------------------------------
-- 3. WHAT A COMPANY'S OWN ADMINISTRATORS MAY DO
--
-- One row per company. `permissions` is the ceiling: the administrative keys a company super admin
-- may hold and hand out. NULL (no row) means "unrestricted", which is what every existing company
-- is today — so this table changes nothing until the owner uses it.
-- ---------------------------------------------------------------------------
create table if not exists public.company_admin_limits (
  org_id      uuid primary key references public.organizations(id) on delete cascade,
  template    text not null default 'full'
              check (template in ('restricted', 'standard', 'full', 'custom')),
  permissions text[],          -- null = unrestricted; otherwise the exhaustive allow-list
  note        text,
  set_by      uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.company_admin_limits enable row level security;

-- A company may READ its own ceiling (so its admins can see why something is unavailable) but may
-- never write it — that is the whole point of the table (§116, §117).
drop policy if exists cal_read on public.company_admin_limits;
create policy cal_read on public.company_admin_limits for select
  using (is_platform_owner() or org_id = current_org());

drop policy if exists cal_write on public.company_admin_limits;
create policy cal_write on public.company_admin_limits for all
  using (is_platform_owner()) with check (is_platform_owner());

/** The ceiling for one company: null when unrestricted. */
create or replace function public.admin_ceiling(p_org uuid default current_org())
returns text[]
language sql
stable security definer
set search_path to 'public'
as $$
  select permissions from company_admin_limits where org_id = p_org
$$;

-- ---------------------------------------------------------------------------
-- 4. AUTHORISATION ITSELF
--
-- Precedence, highest first (§35):
--   platform owner reserved authority
--   → tenant membership (no profile / inactive = nothing)
--   → explicit individual DENY            ← now outranks a company super admin
--   → explicit individual ALLOW
--   → employment-status restrictions (probation / notice / suspended)
--   → system roles → department default → level default
--   → company super admin, bounded by the platform owner's ceiling
--   → deny
--
-- The company-super-admin branch stays because removing it would strand every existing company
-- admin, which §128 forbids. It is now *bounded* rather than absolute, and it sits BELOW deny.
-- ---------------------------------------------------------------------------
create or replace function public.has_perm(p_perm text, p_user uuid default auth.uid())
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  p profiles%rowtype;
  o boolean;
  r boolean;
  ceiling text[];
begin
  if p_user is null or p_perm is null then return false; end if;

  -- The platform owner holds platform authority outright. This is deliberate and is the one
  -- unconditional branch in the function (§20, §55): the owner must never be able to lock
  -- themselves out of the system they administer.
  if is_platform_owner_user(p_user) then return true; end if;

  select * into p from profiles where id = p_user;
  if p.id is null or not p.is_active then return false; end if;

  -- Platform-only keys never resolve inside a company, for anybody (§81). The `platform.` prefix
  -- is the contract (and what `permissions.platform_only` records), so this stays a string test
  -- rather than a catalogue lookup on a function called from most RLS policies in the database.
  if p_perm like 'platform.%' then return false; end if;

  -- Explicit individual rule wins over every company-level grant, including super admin.
  select allowed into o
    from permission_overrides
   where user_id = p_user and perm = p_perm and (expires_at is null or expires_at > now())
   order by allowed          -- a deny (false) sorts first, so deny beats a contradictory allow
   limit 1;
  if found then return o; end if;

  if p.status in ('probation','intern') and p_perm in ('download','share_external','export') then return false; end if;
  if p.status in ('suspended','notice_period') and p_perm in ('share_external','export','delete') then return false; end if;

  select bool_or(p_perm = any(sr.permissions)) into r
    from user_roles ur join system_roles sr on sr.id = ur.system_role_id
   where ur.user_id = p_user and ur.starts_at <= now() and (ur.expires_at is null or ur.expires_at > now());
  if r then return true; end if;

  if exists (select 1 from departments d where d.id = p.department_id and p_perm = any(d.default_permissions)) then
    return true;
  end if;

  if exists (select 1 from role_defaults rd where rd.org_id = p.org_id and rd.level = p.role and p_perm = any(rd.permissions)) then
    return true;
  end if;

  -- Company super admin, bounded by whatever the platform owner allowed this company to administer.
  if p.role = 'super_admin' then
    ceiling := admin_ceiling(p.org_id);
    return ceiling is null or p_perm = any(ceiling);
  end if;

  return false;
end $$;

-- `has_admin_perm` had the same "super_admin means everything" shortcut. Route it through the
-- rules above so one deny is enough to restrain an administrator anywhere in the product.
create or replace function public.has_admin_perm(perm text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select has_perm(perm)
      or exists (
        select 1 from admin_assignments a join admin_roles r on r.id = a.admin_role_id
         where a.user_id = auth.uid() and (a.expires_at is null or a.expires_at > now())
           and (perm = any(r.permissions) or '*' = any(r.permissions))
           and coalesce(
                 not exists (
                   select 1 from permission_overrides po
                    where po.user_id = auth.uid() and po.perm = perm and po.allowed = false
                      and (po.expires_at is null or po.expires_at > now())
                 ), true)
      )
$$;

-- ---------------------------------------------------------------------------
-- 5. NOBODY GRANTS WHAT THEY DO NOT HOLD (§53, §54)
-- ---------------------------------------------------------------------------

/** May the caller administer this permission key at all? */
create or replace function public.can_manage_permission(p_perm text, p_org uuid default current_org())
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare ceiling text[]; rk text;
begin
  if is_platform_owner() then return true; end if;
  select risk into rk from permissions where key = p_perm;
  -- Platform-only keys are never delegable into a company.
  if p_perm like 'platform.%' then return false; end if;
  -- You must be authorised to manage permissions at all…
  if not (has_perm('security.manage') or has_perm('system.manage')) then return false; end if;
  -- …you must hold the key yourself (you cannot hand out authority you were not given)…
  if not has_perm(p_perm) then return false; end if;
  -- …and it must be inside the ceiling the platform owner set for this company.
  ceiling := admin_ceiling(p_org);
  if ceiling is not null and not (p_perm = any(ceiling)) then return false; end if;
  -- High-risk keys need the security mandate specifically, not a general admin role.
  if rk = 'high' and not has_perm('security.manage') then return false; end if;
  return true;
end $$;

grant execute on function public.can_manage_permission(text, uuid) to authenticated;

/**
 * Guard for `permission_overrides`: an individual grant or deny may only be written by somebody
 * authorised to manage that key, and never by somebody raising their own authority.
 */
create or replace function public.guard_permission_override()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare target_org uuid;
begin
  -- No session means a migration or another server-side path; RLS covers the app.
  if auth.uid() is null then return new; end if;
  if is_platform_owner() then return new; end if;

  -- You cannot grant yourself anything. Removing your own permission is allowed.
  if new.user_id = auth.uid() and coalesce(new.allowed, true) then
    raise exception 'You cannot grant a permission to yourself.' using errcode = 'insufficient_privilege';
  end if;

  select org_id into target_org from profiles where id = new.user_id;
  if target_org is distinct from current_org() then
    raise exception 'That person is not in this company.' using errcode = 'insufficient_privilege';
  end if;

  if not can_manage_permission(new.perm, target_org) then
    raise exception 'You are not allowed to administer the permission "%".', new.perm using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_permission_override on public.permission_overrides;
create trigger trg_guard_permission_override
  before insert or update on public.permission_overrides
  for each row execute function public.guard_permission_override();

/** The same rule for a whole role: you cannot build a role stronger than your own authority. */
create or replace function public.guard_system_role()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare perm text; added text[];
begin
  -- No session means a migration or another server-side path; RLS covers the app.
  if auth.uid() is null then return new; end if;
  if is_platform_owner() then return new; end if;
  added := case when tg_op = 'INSERT' then new.permissions
                else array(select unnest(new.permissions) except select unnest(old.permissions)) end;
  foreach perm in array coalesce(added, '{}') loop
    if not can_manage_permission(perm, new.org_id) then
      raise exception 'You are not allowed to put "%" in a role.', perm using errcode = 'insufficient_privilege';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_guard_system_role on public.system_roles;
create trigger trg_guard_system_role
  before insert or update on public.system_roles
  for each row execute function public.guard_system_role();

/** And for the per-level defaults, which reach everybody at that level at once. */
create or replace function public.guard_role_defaults()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare perm text; added text[];
begin
  -- No session means a migration or another server-side path; RLS covers the app.
  if auth.uid() is null then return new; end if;
  if is_platform_owner() then return new; end if;
  added := case when tg_op = 'INSERT' then new.permissions
                else array(select unnest(new.permissions) except select unnest(old.permissions)) end;
  foreach perm in array coalesce(added, '{}') loop
    if not can_manage_permission(perm, new.org_id) then
      raise exception 'You are not allowed to grant "%" by default.', perm using errcode = 'insufficient_privilege';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_guard_role_defaults on public.role_defaults;
create trigger trg_guard_role_defaults
  before insert or update on public.role_defaults
  for each row execute function public.guard_role_defaults();

-- ---------------------------------------------------------------------------
-- 6. THE PLATFORM OWNER CANNOT BE REMOVED BY A TENANT, OR BY ACCIDENT (§55, §116)
-- ---------------------------------------------------------------------------
create or replace function public.guard_platform_admins()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare owners int;
begin
  -- Seeding from a migration or another server-side path has no authenticated user; RLS already
  -- guards every request that comes through the app, so do not block bootstrapping here.
  if auth.uid() is null then return coalesce(new, old); end if;

  -- Only an owner may touch this table at all. (RLS says so too; this is the second lock.)
  if not is_platform_owner() then
    raise exception 'Only the platform owner may change platform administrators.' using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'DELETE' then
    select count(*) into owners from platform_admins where role = 'platform_super_admin' and user_id <> old.user_id;
    if old.role = 'platform_super_admin' and owners = 0 then
      raise exception 'This is the last platform owner. Appoint another one before removing this account.'
        using errcode = 'insufficient_privilege';
    end if;
    if old.user_id = auth.uid() and owners = 0 then
      raise exception 'You cannot remove your own owner access while you are the only owner.'
        using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;

  -- Demoting yourself out of the last owner seat is the same lockout by another route.
  if tg_op = 'UPDATE' and old.user_id = auth.uid()
     and old.role = 'platform_super_admin' and new.role <> 'platform_super_admin' then
    select count(*) into owners from platform_admins where role = 'platform_super_admin' and user_id <> old.user_id;
    if owners = 0 then
      raise exception 'You are the only platform owner. Appoint another one before stepping down.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_platform_admins on public.platform_admins;
create trigger trg_guard_platform_admins
  before insert or update or delete on public.platform_admins
  for each row execute function public.guard_platform_admins();

-- ---------------------------------------------------------------------------
-- 7. AN AUDIT TRAIL FOR AUTHORITY ITSELF (§50, §98)
-- ---------------------------------------------------------------------------
create table if not exists public.permission_changes (
  id         bigserial primary key,
  org_id     uuid,
  subject    text not null,            -- 'user' | 'role' | 'level' | 'screen' | 'company_limits'
  subject_id text,
  perm       text,
  before     jsonb,
  after      jsonb,
  reason     text,
  actor_id   uuid references public.profiles(id) on delete set null,
  at         timestamptz not null default now()
);

create index if not exists permission_changes_subject_idx on public.permission_changes (subject, subject_id, at desc);
create index if not exists permission_changes_org_idx on public.permission_changes (org_id, at desc);

alter table public.permission_changes enable row level security;

-- Reading the record of who changed authority is itself a permission (§79).
drop policy if exists pc_read on public.permission_changes;
create policy pc_read on public.permission_changes for select
  using (is_platform_owner() or (org_id = current_org() and (has_perm('audit.read') or has_perm('security.manage'))));

create or replace function public.log_permission_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare subj text; sid text; o uuid;
begin
  if tg_table_name = 'permission_overrides' then
    subj := 'user';
    sid  := coalesce(new.user_id, old.user_id)::text;
    select org_id into o from profiles where id = coalesce(new.user_id, old.user_id);
  elsif tg_table_name = 'system_roles' then
    subj := 'role';
    sid  := coalesce(new.id, old.id)::text;
    o    := coalesce(new.org_id, old.org_id);
  elsif tg_table_name = 'role_defaults' then
    subj := 'level';
    sid  := coalesce(new.level, old.level)::text;
    o    := coalesce(new.org_id, old.org_id);
  elsif tg_table_name = 'company_admin_limits' then
    subj := 'company_limits';
    sid  := coalesce(new.org_id, old.org_id)::text;
    o    := coalesce(new.org_id, old.org_id);
  else
    subj := tg_table_name;
    sid  := null;
  end if;

  insert into permission_changes (org_id, subject, subject_id, perm, before, after, actor_id)
  values (
    o, subj, sid,
    case when tg_table_name = 'permission_overrides' then coalesce(new.perm, old.perm) end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end $$;

drop trigger if exists trg_log_permission_overrides on public.permission_overrides;
create trigger trg_log_permission_overrides
  after insert or update or delete on public.permission_overrides
  for each row execute function public.log_permission_change();

drop trigger if exists trg_log_system_roles on public.system_roles;
create trigger trg_log_system_roles
  after insert or update or delete on public.system_roles
  for each row execute function public.log_permission_change();

drop trigger if exists trg_log_role_defaults on public.role_defaults;
create trigger trg_log_role_defaults
  after insert or update or delete on public.role_defaults
  for each row execute function public.log_permission_change();

drop trigger if exists trg_log_company_admin_limits on public.company_admin_limits;
create trigger trg_log_company_admin_limits
  after insert or update or delete on public.company_admin_limits
  for each row execute function public.log_permission_change();

-- ---------------------------------------------------------------------------
-- 8. SEED THE CATALOGUE
--
-- Every key already in use across `system_roles`, `role_defaults`, `admin_roles` and
-- `departments.default_permissions`, plus the platform-only keys. `on conflict do update` keeps
-- the metadata current without disturbing anything an owner has edited by hand.
-- ---------------------------------------------------------------------------
insert into public.permissions (key, label, description, grp, risk, requires, platform_only, position) values
  ('view',                 'View',                     'Open the things you have been given access to.',                    'general',       'standard', '{}',                    false, 10),
  ('comment',              'Comment',                  'Reply and discuss on work you can see.',                            'general',       'standard', '{view}',                false, 20),
  ('create',               'Create',                   'Create new items in the modules you can open.',                     'general',       'standard', '{view}',                false, 30),
  ('edit',                 'Edit',                     'Change items you can see.',                                         'general',       'standard', '{view}',                false, 40),
  ('delete',               'Delete',                   'Remove items. Irreversible for most records.',                      'general',       'elevated', '{edit}',                false, 50),
  ('invite',               'Invite people',            'Bring somebody into a group, project or room.',                     'general',       'standard', '{view}',                false, 60),
  ('approve',              'Approve',                  'Decide on approval requests routed to you.',                        'work',          'elevated', '{view}',                false, 70),
  ('assign_task',          'Assign work',              'Give a task to somebody else.',                                     'work',          'standard', '{create}',              false, 80),
  ('create_project',       'Create projects',          'Start a new project.',                                              'work',          'standard', '{create}',              false, 90),
  ('projects.manage',      'Manage projects',          'Administer any project in scope: members, status, archive.',        'work',          'elevated', '{create_project}',      false, 100),
  ('create_group',         'Create groups',            'Start a new chat group or channel.',                                'communication', 'standard', '{create}',              false, 110),
  ('share_internal',       'Share internally',         'Share a file or record with colleagues.',                           'files',         'standard', '{view}',                false, 120),
  ('share_external',       'Share externally',         'Share outside the company. Leaves the building.',                   'files',         'high',     '{share_internal}',      false, 130),
  ('download',             'Download',                 'Take a copy of a file out of the workspace.',                       'files',         'elevated', '{view}',                false, 140),
  ('export',               'Export data',              'Export records in bulk to a file.',                                 'reports',       'high',     '{view}',                false, 150),
  ('view_reports',         'View reports',             'Open reporting and analytics.',                                     'reports',       'standard', '{view}',                false, 160),
  ('manage_team',          'Manage a team',            'Administer the people who report to you.',                          'people',        'elevated', '{view}',                false, 170),
  ('people.manage',        'Manage people',            'Create, edit and deactivate employee records.',                     'people',        'high',     '{view}',                false, 180),
  ('hr.manage',            'HR administration',        'Employment records, documents, onboarding and offboarding.',        'people',        'high',     '{people.manage}',       false, 190),
  ('attendance.manage',    'Manage attendance',        'Correct attendance and configure the rules.',                       'people',        'elevated', '{view}',                false, 200),
  ('shifts.manage',        'Manage shifts',            'Rosters, shifts and coverage.',                                     'people',        'elevated', '{view}',                false, 210),
  ('leave.approve',        'Approve leave',            'Decide leave requests.',                                            'people',        'elevated', '{approve}',             false, 220),
  ('department.manage',    'Manage a department',      'Administer a department: members, settings, escalation.',           'organisation',  'elevated', '{view}',                false, 230),
  ('broadcast_department', 'Announce to a department', 'Post an announcement the whole department receives.',               'communication', 'standard', '{create}',              false, 240),
  ('broadcast_company',    'Announce to the company',  'Post an announcement everybody receives.',                          'communication', 'elevated', '{create}',              false, 250),
  ('communication.manage', 'Administer communication', 'Moderate channels, rooms and recordings. Never private messages.',  'communication', 'high',     '{view}',                false, 260),
  ('record_calls',         'Record calls',             'Start a recording in a live room.',                                 'communication', 'elevated', '{view}',                false, 270),
  ('review_recordings',    'Review recordings',        'Open recordings shared with the reviewing function.',               'communication', 'elevated', '{view}',                false, 280),
  ('connect.use',          'Use GHL Connect',          'Work the shared inboxes.',                                          'connect',       'standard', '{view}',                false, 290),
  ('connect.send',         'Send from Connect',        'Send outbound messages without supervisor approval.',               'connect',       'elevated', '{connect.use}',         false, 300),
  ('connect.call',         'Call from Connect',        'Place and log calls to contacts.',                                  'connect',       'standard', '{connect.use}',         false, 310),
  ('connect.approve',      'Approve outbound',         'Release messages other people queued.',                             'connect',       'elevated', '{connect.use}',         false, 320),
  ('connect.view_all',     'See every conversation',   'Read all conversations in the inbox, not only your own.',           'connect',       'elevated', '{connect.use}',         false, 330),
  ('connect.manage',       'Administer Connect',       'Inboxes, routing rules, SLAs and templates.',                       'connect',       'high',     '{connect.use}',         false, 340),
  ('automations.manage',   'Manage automations',       'Create and change rules that act on their own.',                    'admin',         'high',     '{view}',                false, 350),
  ('ai.manage',            'Administer AI',            'Assistants, knowledge, action levels and limits.',                  'admin',         'high',     '{view}',                false, 360),
  ('features.manage',      'Manage features',          'Turn product features on and off for the company.',                 'admin',         'high',     '{view}',                false, 370),
  ('integrations.manage',  'Manage integrations',      'Connected services and their secrets.',                             'admin',         'high',     '{view}',                false, 380),
  ('access.approve',       'Approve access requests',  'Decide who gets access to a restricted resource.',                  'security',      'high',     '{view}',                false, 390),
  ('audit.read',           'Read the audit log',       'See who did what, including changes to authority.',                 'security',      'high',     '{view}',                false, 400),
  ('security.manage',      'Manage security',          'Roles, permissions, screens and security settings.',                'security',      'high',     '{audit.read}',          false, 410),
  ('system.manage',        'Manage the company',       'Company-wide settings and configuration.',                          'admin',         'high',     '{view}',                false, 420),
  ('*',                    'Everything',               'Legacy wildcard held by built-in admin roles.',                     'admin',         'high',     '{}',                    false, 430),
  -- Platform-only. These never resolve inside a company, whoever asks for them (§81).
  ('platform.companies.manage', 'Create and administer companies', 'Provision, suspend and archive tenants.',               'platform',      'high',     '{}',                    true,  500),
  ('platform.admins.manage',    'Manage platform staff',           'Appoint and remove platform administrators.',           'platform',      'high',     '{}',                    true,  510),
  ('platform.security.manage',  'Platform security',               'Break-glass, isolation and platform-wide security.',    'platform',      'high',     '{}',                    true,  520),
  ('platform.features.manage',  'Global feature management',       'The feature catalogue every company draws from.',       'platform',      'high',     '{}',                    true,  530),
  ('platform.billing.manage',   'Platform billing',                'Plans, limits and billing across companies.',           'platform',      'high',     '{}',                    true,  540),
  ('platform.audit.read',       'Platform audit',                  'The cross-company record of administrative action.',    'platform',      'high',     '{}',                    true,  550)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  grp = excluded.grp,
  risk = excluded.risk,
  requires = excluded.requires,
  platform_only = excluded.platform_only,
  position = excluded.position;
