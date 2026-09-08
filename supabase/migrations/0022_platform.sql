-- ============================================================================
-- 0022_platform.sql — GHL ONE becomes a multi-company platform.
-- ONE PLATFORM. MANY COMPANIES. ZERO DATA LEAKAGE.
--
-- Design notes (read before changing anything):
--  * A tenant IS an `organizations` row. Every tenant-bearing table already carries
--    org_id and every policy is scoped through current_org() — this migration closes
--    the gaps that only bite once a second company exists, and adds the layer above.
--  * `current_org()` becomes membership-aware: it resolves to the explicitly selected
--    active workspace when the caller has a membership there, otherwise to their
--    profile's org. With one membership per person (the state after backfill) the
--    result is identical to before, so nothing changes for the existing company.
--  * Platform staff are NOT tenant members. They see administrative metadata by
--    default; reading tenant *content* requires a break-glass session with a reason,
--    a scope, an expiry and an audit trail.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tenant record: lifecycle, identity, branding, limits
-- ----------------------------------------------------------------------------
alter table organizations
  add column if not exists tenant_code text,
  add column if not exists legal_name text,
  add column if not exists status text not null default 'active' check (status in ('trial','onboarding','active','suspended','read_only','archived','closed','pending')),
  add column if not exists plan text not null default 'custom',
  add column if not exists industry text,
  add column if not exists country text,
  add column if not exists timezone text not null default 'Asia/Kolkata',
  add column if not exists locale text not null default 'en',
  add column if not exists work_week int[] not null default '{1,2,3,4,5}',
  add column if not exists address text,
  add column if not exists website text,
  add column if not exists primary_contact text,
  add column if not exists email_domain text,
  add column if not exists restrict_to_domain boolean not null default false,
  add column if not exists custom_domain text,
  add column if not exists domain_verified boolean not null default false,
  add column if not exists domain_verify_token text,
  add column if not exists logo_url text,
  add column if not exists favicon_url text,
  add column if not exists accent_color text,
  add column if not exists login_bg_url text,
  add column if not exists welcome_message text,
  add column if not exists terminology jsonb not null default '{}'::jsonb,
  add column if not exists limits jsonb not null default '{}'::jsonb,
  add column if not exists onboarding_stage text not null default 'live' check (onboarding_stage in ('invited','setup_started','admin_verified','employees_imported','configuration_review','training','ready','live')),
  add column if not exists mfa_required boolean not null default false,
  add column if not exists retention_days int,
  add column if not exists created_by uuid references profiles(id) on delete set null,
  add column if not exists activated_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists maintenance_until timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists organizations_tenant_code_uq on organizations(tenant_code) where tenant_code is not null;
create unique index if not exists organizations_custom_domain_uq on organizations(lower(custom_domain)) where custom_domain is not null;
create index if not exists organizations_status_idx on organizations(status);
create index if not exists organizations_email_domain_idx on organizations(lower(email_domain)) where email_domain is not null;

update organizations set tenant_code = 'GHL-001', status = 'active', onboarding_stage = 'live', industry = coalesce(industry,'Diversified'),
       country = coalesce(country,'India'), activated_at = coalesce(activated_at, created_at)
 where slug = 'ghl' and tenant_code is null;

-- ----------------------------------------------------------------------------
-- 2. Platform layer: staff, roles, audit, break-glass
-- ----------------------------------------------------------------------------
create table if not exists platform_admins (
  user_id uuid primary key references profiles(id) on delete cascade,
  role text not null default 'platform_super_admin' check (role in ('platform_super_admin','platform_ops','platform_support','platform_security','platform_billing','platform_developer')),
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Lets the platform owner be recognised before their first login.
create table if not exists platform_admin_invites (
  email text primary key,
  role text not null default 'platform_super_admin',
  created_at timestamptz not null default now()
);
insert into platform_admin_invites (email, role) values ('aby777333@gmail.com','platform_super_admin') on conflict (email) do nothing;

-- Which tenants a support/ops person may touch at all (§113).
create table if not exists platform_assignments (
  user_id uuid not null references profiles(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

create table if not exists platform_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles(id) on delete set null,
  actor_email text,
  org_id uuid references organizations(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  reason text,
  summary text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists platform_audit_idx on platform_audit_logs(created_at desc);
create index if not exists platform_audit_org_idx on platform_audit_logs(org_id, created_at desc);

-- Controlled access to tenant content: reason + scope + expiry + audit (§3).
create table if not exists break_glass_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references profiles(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  reason text not null,
  justification text not null check (justification in ('investigation','legal','security_incident','policy_audit','emergency_admin','customer_support')),
  scope text not null default 'configuration' check (scope in ('configuration','content','full')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  actions int not null default 0
);
create index if not exists break_glass_active_idx on break_glass_sessions(actor_id, org_id) where ended_at is null;

-- A company opening the door for platform support, on its own terms (§115-117).
create table if not exists support_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  granted_by uuid references profiles(id) on delete set null,
  granted_to uuid references profiles(id) on delete set null,
  scope text not null default 'configuration' check (scope in ('configuration','content')),
  reason text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists support_sessions_active_idx on support_sessions(org_id) where revoked_at is null;

-- ----------------------------------------------------------------------------
-- 3. Identity: one person, many company memberships (§21, §140, §141)
-- ----------------------------------------------------------------------------
create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  role role_level not null default 'employee',
  status text not null default 'active' check (status in ('active','invited','suspended','left')),
  is_primary boolean not null default false,
  title text,
  joined_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (user_id, org_id)
);
create index if not exists memberships_user_idx on memberships(user_id) where status = 'active';
create index if not exists memberships_org_idx on memberships(org_id) where status = 'active';

insert into memberships (user_id, org_id, role, status, is_primary, joined_at)
select p.id, p.org_id, p.role, case when p.is_active then 'active' else 'suspended' end, true, coalesce(p.joined_at::timestamptz, p.created_at)
from profiles p on conflict (user_id, org_id) do nothing;

create table if not exists active_workspace (
  user_id uuid primary key references profiles(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  switched_at timestamptz not null default now()
);

-- Keep membership in step with the profile so nothing can drift.
create or replace function membership_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into memberships (user_id, org_id, role, status, is_primary)
  values (new.id, new.org_id, new.role, case when new.is_active then 'active' else 'suspended' end, true)
  on conflict (user_id, org_id) do update set role = excluded.role, status = excluded.status;
  return new;
end $$;
drop trigger if exists profiles_membership_sync on profiles;
create trigger profiles_membership_sync after insert or update of org_id, role, is_active on profiles for each row execute function membership_sync();

-- ----------------------------------------------------------------------------
-- 4. Platform helpers
-- ----------------------------------------------------------------------------
create or replace function is_platform_admin_user(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = p_user)
      or exists (select 1 from platform_admin_invites i join profiles p on lower(p.email) = lower(i.email) where p.id = p_user)
$$;

create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select is_platform_admin_user(auth.uid())
$$;

create or replace function platform_role(p_user uuid default auth.uid()) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from platform_admins where user_id = p_user),
    (select i.role from platform_admin_invites i join profiles p on lower(p.email) = lower(i.email) where p.id = p_user limit 1)
  )
$$;

create or replace function is_platform_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select platform_role(auth.uid()) = 'platform_super_admin'
$$;

/** Can this platform person touch this tenant at all? Owners: yes. Others: only assigned tenants. */
create or replace function platform_can_touch(p_org uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when not is_platform_admin_user(p_user) then false
    when platform_role(p_user) in ('platform_super_admin','platform_ops','platform_security') then true
    else exists (select 1 from platform_assignments a where a.user_id = p_user and a.org_id = p_org)
  end
$$;

/** Content access above configuration level: an open break-glass session, or the company's own support grant. */
create or replace function has_break_glass(p_org uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from break_glass_sessions b
     where b.actor_id = p_user and b.org_id = p_org and b.ended_at is null and b.expires_at > now() and b.scope in ('content','full')
  ) or exists (
    select 1 from support_sessions s
     where s.org_id = p_org and s.revoked_at is null and s.expires_at > now() and s.scope = 'content'
       and (s.granted_to is null or s.granted_to = p_user) and platform_can_touch(p_org, p_user)
  )
$$;

-- ----------------------------------------------------------------------------
-- 5. current_org() becomes membership-aware (identical result for single-membership users)
-- ----------------------------------------------------------------------------
create or replace function current_org() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select a.org_id from active_workspace a
      where a.user_id = auth.uid()
        and (exists (select 1 from memberships m where m.user_id = a.user_id and m.org_id = a.org_id and m.status = 'active')
             or platform_can_touch(a.org_id, a.user_id))),
    (select p.org_id from profiles p where p.id = auth.uid())
  )
$$;

/** Switch workspace (§22, §23). Validates membership or platform authority, and audits every platform entry. */
create or replace function set_active_workspace(p_org uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o organizations%rowtype; is_member boolean; is_staff boolean;
begin
  select * into o from organizations where id = p_org;
  if o.id is null then raise exception 'workspace not found'; end if;
  select exists (select 1 from memberships m where m.user_id = auth.uid() and m.org_id = p_org and m.status = 'active') into is_member;
  is_staff := platform_can_touch(p_org);
  if not (is_member or is_staff) then
    insert into security_events (org_id, kind, user_id, details)
    values (p_org, 'cross_tenant_attempt', auth.uid(), jsonb_build_object('target_org', p_org, 'severity', 'high'));
    raise exception 'You do not have access to this workspace';
  end if;
  if is_member and o.status in ('suspended','archived','closed') then raise exception 'This workspace is % and cannot be opened', o.status; end if;
  insert into active_workspace (user_id, org_id) values (auth.uid(), p_org)
    on conflict (user_id) do update set org_id = excluded.org_id, switched_at = now();
  update memberships set last_used_at = now() where user_id = auth.uid() and org_id = p_org;
  if is_staff and not is_member then
    insert into platform_audit_logs (actor_id, actor_email, org_id, action, entity_type, entity_id, reason, summary)
    values (auth.uid(), (select email from profiles where id = auth.uid()), p_org, 'platform.workspace_entered', 'organization', p_org, p_reason, o.name);
  end if;
  return jsonb_build_object('ok', true, 'org_id', p_org, 'name', o.name, 'mode', case when is_member then 'member' else 'platform_admin' end, 'status', o.status);
end $$;

/** Every workspace this person can open, for the picker (§21, §22). */
create or replace function my_workspaces() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb) from (
    select jsonb_build_object('org_id', o.id, 'name', o.name, 'slug', o.slug, 'tenant_code', o.tenant_code, 'logo_url', o.logo_url,
                              'accent_color', o.accent_color, 'status', o.status, 'role', m.role, 'mode', 'member',
                              'active', (select a.org_id from active_workspace a where a.user_id = auth.uid()) = o.id) as x
      from memberships m join organizations o on o.id = m.org_id
     where m.user_id = auth.uid() and m.status = 'active'
    union all
    select jsonb_build_object('org_id', o.id, 'name', o.name, 'slug', o.slug, 'tenant_code', o.tenant_code, 'logo_url', o.logo_url,
                              'accent_color', o.accent_color, 'status', o.status, 'role', null, 'mode', 'platform_admin',
                              'active', (select a.org_id from active_workspace a where a.user_id = auth.uid()) = o.id) as x
      from organizations o
     where is_platform_admin() and platform_can_touch(o.id)
       and not exists (select 1 from memberships m where m.user_id = auth.uid() and m.org_id = o.id and m.status = 'active')
  ) s
$$;

/** Login routing: which workspaces does this email belong to? Anon-callable by design, returns no private data. */
create or replace function workspaces_for_email(p_email text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', o.name, 'slug', o.slug, 'logo_url', o.logo_url, 'accent_color', o.accent_color) order by o.name), '[]'::jsonb)
    from organizations o
   where o.status in ('active','trial','onboarding','read_only')
     and (exists (select 1 from profiles p join memberships m on m.user_id = p.id and m.org_id = o.id and m.status = 'active' where lower(p.email) = lower(p_email))
          or (o.email_domain is not null and lower(split_part(p_email,'@',2)) = lower(o.email_domain)))
$$;

-- ----------------------------------------------------------------------------
-- 6. CLOSE THE LEAKS — policies that granted by role without a tenant filter.
--    With one company these return the same rows; with two they were a cross-company read.
-- ----------------------------------------------------------------------------
drop policy if exists ad_read on attendance_days;
create policy ad_read on attendance_days for select to authenticated
  using (org_id = current_org() and (user_id = auth.uid() or is_lead_plus() or has_admin_perm('attendance.manage')));

drop policy if exists ae_own on attendance_events;
create policy ae_own on attendance_events for select to authenticated
  using (org_id = current_org() and (user_id = auth.uid() or is_lead_plus() or has_admin_perm('attendance.manage')
         or exists (select 1 from profiles p where p.id = attendance_events.user_id and p.department_id = current_department() and is_lead_plus())));

drop policy if exists te_own on time_entries;
create policy te_own on time_entries for all to authenticated
  using (org_id = current_org() and user_id = auth.uid()) with check (org_id = current_org() and user_id = auth.uid());
drop policy if exists te_mgr on time_entries;
create policy te_mgr on time_entries for select to authenticated
  using (org_id = current_org() and (is_lead_plus() or has_admin_perm('hr.manage')));

drop policy if exists cl_read on calls;
create policy cl_read on calls for select to authenticated
  using (org_id = current_org() and (user_id = auth.uid() or (conversation_id is not null and can_view_conversation(conversation_id)) or is_manager_of(user_id) or has_perm('connect.view_all')));
drop policy if exists cl_update on calls;
create policy cl_update on calls for update to authenticated
  using (org_id = current_org() and (user_id = auth.uid() or is_manager_of(user_id))) with check (org_id = current_org());

-- Templates: platform-wide rows (org_id is null) are shared starting points; a tenant's own rows stay private.
alter table project_templates alter column org_id drop not null;
alter table task_templates alter column org_id drop not null;
drop policy if exists tpl_read on project_templates;
create policy tpl_read on project_templates for select to authenticated
  using (is_active_member() and (org_id is null or org_id = current_org()));
drop policy if exists tpl_write on project_templates;
create policy tpl_write on project_templates for all to authenticated
  using (org_id = current_org() and is_manager_plus()) with check (org_id = current_org() and is_manager_plus());
drop policy if exists ttpl_read on task_templates;
create policy ttpl_read on task_templates for select to authenticated
  using (is_active_member() and (org_id is null or org_id = current_org()));
drop policy if exists ttpl_write on task_templates;
create policy ttpl_write on task_templates for all to authenticated
  using (org_id = current_org() and is_manager_plus()) with check (org_id = current_org() and is_manager_plus());
update project_templates set org_id = null where org_id = '00000000-0000-0000-0000-000000000001';
update task_templates set org_id = null where org_id = '00000000-0000-0000-0000-000000000001';

-- Notifications carry their tenant so a multi-company person never sees two inboxes merged (§83, §186).
alter table notifications add column if not exists org_id uuid references organizations(id) on delete cascade;
update notifications n set org_id = p.org_id from profiles p where p.id = n.user_id and n.org_id is null;
create index if not exists notifications_org_idx on notifications(user_id, org_id, created_at desc);
create or replace function notification_org_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is null then select org_id into new.org_id from profiles where id = new.user_id; end if;
  return new;
end $$;
drop trigger if exists notifications_org on notifications;
create trigger notifications_org before insert on notifications for each row execute function notification_org_default();
drop policy if exists notif_own on notifications;
create policy notif_own on notifications for select to authenticated
  using (user_id = auth.uid() and (org_id is null or org_id = current_org()));

-- Organizations: a tenant sees itself; platform staff see the tenants they may touch.
drop policy if exists org_read on organizations;
create policy org_read on organizations for select to authenticated
  using (id = current_org() or exists (select 1 from memberships m where m.user_id = auth.uid() and m.org_id = organizations.id and m.status = 'active') or platform_can_touch(id));
drop policy if exists org_admin on organizations;
create policy org_admin on organizations for update to authenticated
  using ((id = current_org() and is_admin()) or platform_can_touch(id)) with check (true);

-- ----------------------------------------------------------------------------
-- 7. Features, plans, limits, usage
-- ----------------------------------------------------------------------------
create table if not exists platform_features (
  key text primary key,
  label text not null,
  category text not null default 'core',
  description text,
  default_enabled boolean not null default true,
  deprecated boolean not null default false,
  position int not null default 0
);
insert into platform_features (key, label, category, description, default_enabled, position) values
 ('people','People','core','Employee directory and profiles',true,0),
 ('attendance','Attendance','work','Clock in/out, shifts, breaks',true,1),
 ('leave','Leave','work','Leave types, balances, approvals',true,2),
 ('tasks','Tasks','work','Tasks and delegation',true,3),
 ('projects','Projects','work','Projects and milestones',true,4),
 ('chat','Chat','communication','Channels and direct messages',true,5),
 ('calls','Voice calls','communication','Internal voice calling',true,6),
 ('video','Video meetings','communication','GHL LIVE video rooms',true,7),
 ('screen_share','Screen sharing','communication','Share screen in a live room',true,8),
 ('recording','Recording','communication','Screen and meeting recording',true,9),
 ('whiteboards','Whiteboards','communication','GHL BOARD collaborative canvas',true,10),
 ('live_docs','Live documents','communication','Collaborative documents',true,11),
 ('files','Files','core','File library and versions',true,12),
 ('ai','AI (GHL Buddy)','intelligence','AI assistant and intelligence features',true,13),
 ('knowledge','Knowledge base','intelligence','Company knowledge library',true,14),
 ('academy','Training','people','Courses and certification',true,15),
 ('assets','Assets','people','Asset register and assignments',true,16),
 ('help_desk','Help desk','work','Internal help requests and incidents',true,17),
 ('connect','GHL Connect','communication','Customer conversations, shared inboxes',true,18),
 ('external_guests','External guests','communication','Invite people outside the company',false,19),
 ('federation','Cross-company rooms','communication','Deliberate collaboration with another company',false,20),
 ('integrations','Integrations','platform','Third-party connections',true,21),
 ('api','API access','platform','Tenant API keys and scopes',false,22)
on conflict (key) do nothing;

create table if not exists org_features (
  org_id uuid not null references organizations(id) on delete cascade,
  feature_key text not null references platform_features(key) on delete cascade,
  enabled boolean not null default true,
  limit_value numeric,
  sandbox_user_ids uuid[] not null default '{}',
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (org_id, feature_key)
);

create table if not exists tenant_usage (
  org_id uuid not null references organizations(id) on delete cascade,
  day date not null,
  employees int not null default 0,
  active_users int not null default 0,
  storage_mb numeric not null default 0,
  ai_calls int not null default 0,
  video_minutes int not null default 0,
  recordings int not null default 0,
  messages int not null default 0,
  projects int not null default 0,
  primary key (org_id, day)
);

/** Feature gate: platform catalogue → tenant override → plan limit. */
create or replace function org_feature_enabled(p_key text, p_org uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from platform_features f where f.key = p_key and f.deprecated) then false
    else coalesce(
      (select f.enabled from org_features f where f.org_id = coalesce(p_org, current_org()) and f.feature_key = p_key),
      (select f.default_enabled from platform_features f where f.key = p_key),
      true)
  end
$$;

create or replace function set_org_feature(p_org uuid, p_key text, p_enabled boolean, p_limit numeric default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (platform_can_touch(p_org) or (p_org = current_org() and is_admin())) then raise exception 'forbidden'; end if;
  insert into org_features (org_id, feature_key, enabled, limit_value, updated_by)
  values (p_org, p_key, p_enabled, p_limit, auth.uid())
  on conflict (org_id, feature_key) do update set enabled = excluded.enabled, limit_value = coalesce(excluded.limit_value, org_features.limit_value), updated_by = auth.uid(), updated_at = now();
  insert into platform_audit_logs (actor_id, org_id, action, entity_type, summary, details)
  values (auth.uid(), p_org, 'platform.feature_changed', 'feature', p_key, jsonb_build_object('enabled', p_enabled, 'limit', p_limit));
end $$;

/** Nightly usage snapshot — platform consumption and health only, never employee surveillance (§50). */
create or replace function tenant_usage_snapshot() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; o record;
begin
  for o in select id from organizations where status not in ('archived','closed') loop
    insert into tenant_usage (org_id, day, employees, active_users, storage_mb, ai_calls, video_minutes, recordings, messages, projects)
    select o.id, current_date,
      (select count(*) from profiles where org_id = o.id and is_active),
      (select count(*) from profiles where org_id = o.id and last_seen_at > now() - interval '24 hours'),
      coalesce((select sum(size_bytes)::numeric / 1048576 from live_recordings where org_id = o.id), 0)
        + coalesce((select sum(fv.size_bytes)::numeric / 1048576 from file_versions fv join files f on f.id = fv.file_id where f.org_id = o.id), 0),
      coalesce((select count(*) from ai_usage where org_id = o.id and created_at > now() - interval '24 hours'), 0),
      coalesce((select sum(extract(epoch from (coalesce(ended_at, now()) - started_at))::int / 60) from live_rooms where org_id = o.id and started_at > now() - interval '24 hours'), 0),
      (select count(*) from live_recordings where org_id = o.id),
      (select count(*) from messages m join channels c on c.id = m.channel_id where c.org_id = o.id and m.created_at > now() - interval '24 hours'),
      (select count(*) from projects where org_id = o.id and status in ('planning','active','at_risk','delayed'))
    on conflict (org_id, day) do update set employees = excluded.employees, active_users = excluded.active_users, storage_mb = excluded.storage_mb,
      ai_calls = excluded.ai_calls, video_minutes = excluded.video_minutes, recordings = excluded.recordings, messages = excluded.messages, projects = excluded.projects;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ----------------------------------------------------------------------------
-- 8. Company creation: templates, wizard, onboarding, imports
-- ----------------------------------------------------------------------------
create table if not exists company_templates (
  key text primary key,
  name text not null,
  industry text,
  description text,
  config jsonb not null default '{}'::jsonb,   -- {departments:[{name,slug,color,icon}], roles:[], features:{}, channels:[], leave_types:[], work_week:[]}
  is_system boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
insert into company_templates (key, name, industry, description, config) values
 ('generic','Generic Corporate','General','Management, Operations, HR, Finance, Sales, Support',
  '{"departments":[{"name":"Management","slug":"management","color":"#0f172a","icon":"crown"},{"name":"Operations","slug":"operations","color":"#0891b2","icon":"settings"},{"name":"Sales","slug":"sales","color":"#16a34a","icon":"trending-up"},{"name":"Customer Support","slug":"support","color":"#ea580c","icon":"life-buoy"},{"name":"HR & Recruitment","slug":"hr","color":"#9333ea","icon":"users"},{"name":"Finance & Accounts","slug":"finance","color":"#059669","icon":"wallet"}],"features":{"federation":false}}'),
 ('technology','Technology Company','Technology','Engineering-first structure with IT, QA, Product and Support',
  '{"departments":[{"name":"Management","slug":"management","color":"#0f172a","icon":"crown"},{"name":"Engineering","slug":"engineering","color":"#2563eb","icon":"cpu"},{"name":"Product","slug":"product","color":"#4f46e5","icon":"folder-kanban"},{"name":"Quality Assurance","slug":"qa","color":"#0891b2","icon":"check-circle"},{"name":"IT & Infrastructure","slug":"it","color":"#475569","icon":"server"},{"name":"Customer Support","slug":"support","color":"#ea580c","icon":"life-buoy"},{"name":"HR","slug":"hr","color":"#9333ea","icon":"users"}],"features":{"api":true,"recording":true}}'),
 ('real_estate','Real Estate Company','Real Estate','Sales-heavy structure with Site, Legal and Marketing',
  '{"departments":[{"name":"Management","slug":"management","color":"#0f172a","icon":"crown"},{"name":"Sales","slug":"sales","color":"#16a34a","icon":"trending-up"},{"name":"Marketing","slug":"marketing","color":"#e11d48","icon":"megaphone"},{"name":"Site Operations","slug":"site","color":"#0891b2","icon":"hard-hat"},{"name":"Legal & Compliance","slug":"legal","color":"#475569","icon":"scale"},{"name":"Finance","slug":"finance","color":"#059669","icon":"wallet"}],"features":{"external_guests":true}}'),
 ('sales','Sales Organization','Sales','Pipeline-first structure',
  '{"departments":[{"name":"Management","slug":"management","color":"#0f172a","icon":"crown"},{"name":"Inside Sales","slug":"inside-sales","color":"#16a34a","icon":"phone"},{"name":"Field Sales","slug":"field-sales","color":"#22c55e","icon":"map-pin"},{"name":"Marketing","slug":"marketing","color":"#e11d48","icon":"megaphone"},{"name":"Customer Success","slug":"success","color":"#ea580c","icon":"life-buoy"}],"features":{"connect":true,"external_guests":true}}'),
 ('support','Support Organization','Support','Shift-based support operation',
  '{"departments":[{"name":"Management","slug":"management","color":"#0f172a","icon":"crown"},{"name":"Support L1","slug":"support-l1","color":"#ea580c","icon":"life-buoy"},{"name":"Support L2","slug":"support-l2","color":"#f97316","icon":"life-buoy"},{"name":"Quality","slug":"quality","color":"#0891b2","icon":"check-circle"},{"name":"Workforce Management","slug":"wfm","color":"#4f46e5","icon":"calendar"}],"features":{"connect":true}}')
on conflict (key) do nothing;

create table if not exists company_onboarding (
  org_id uuid primary key references organizations(id) on delete cascade,
  steps jsonb not null default '[]'::jsonb,     -- [{key,label,done,done_at,done_by,blocking}]
  channel_id uuid references channels(id) on delete set null,
  room_id uuid,
  owner_id uuid references profiles(id) on delete set null,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists company_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(20), 'hex'),
  company_name text not null,
  contact_email text not null,
  contact_name text,
  template_key text references company_templates(key) on delete set null,
  status text not null default 'sent' check (status in ('sent','opened','submitted','approved','rejected','expired')),
  submitted jsonb,
  org_id uuid references organizations(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

create table if not exists employee_imports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  uploaded_by uuid references profiles(id) on delete set null,
  rows jsonb not null default '[]'::jsonb,
  report jsonb not null default '{}'::jsonb,
  status text not null default 'preview' check (status in ('preview','approved','applied','discarded')),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

/** The onboarding checklist every new company starts with (§35). */
create or replace function default_onboarding_steps() returns jsonb
language sql immutable as $$
  select '[
    {"key":"created","label":"Company created","done":true,"blocking":false},
    {"key":"admin","label":"Primary admin verified","done":false,"blocking":true},
    {"key":"branding","label":"Logo and branding uploaded","done":false,"blocking":false},
    {"key":"domain","label":"Email domain verified","done":false,"blocking":false},
    {"key":"departments","label":"Departments created","done":false,"blocking":true},
    {"key":"employees","label":"Employees imported","done":false,"blocking":true},
    {"key":"managers","label":"Reporting managers assigned","done":false,"blocking":true},
    {"key":"roles","label":"Roles and permissions reviewed","done":false,"blocking":true},
    {"key":"screens","label":"Screens configured","done":false,"blocking":false},
    {"key":"attendance","label":"Attendance and leave configured","done":false,"blocking":false},
    {"key":"communication","label":"Channels configured","done":false,"blocking":false},
    {"key":"security","label":"Security baseline confirmed","done":false,"blocking":true},
    {"key":"ai","label":"AI configured","done":false,"blocking":false},
    {"key":"training","label":"Admin training completed","done":false,"blocking":false},
    {"key":"golive","label":"Go live","done":false,"blocking":false}
  ]'::jsonb
$$;

/** Create a company. Platform owner/ops only. Returns the new tenant id. (§13, §125, §166, §167) */
create or replace function create_company(
  p_name text, p_slug text default null, p_template text default 'generic', p_admin_email text default null, p_admin_name text default null,
  p_industry text default null, p_country text default 'India', p_timezone text default 'Asia/Kolkata', p_email_domain text default null,
  p_departments jsonb default null, p_status text default 'onboarding', p_clone_from uuid default null
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare oid uuid; tpl company_templates%rowtype; d jsonb; code text; v_slug text; n int; cfg jsonb; cid uuid;
begin
  if not (is_platform_admin() and platform_role() in ('platform_super_admin','platform_ops')) then raise exception 'Only platform administrators can create companies'; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'Company name is required'; end if;

  v_slug := coalesce(nullif(trim(p_slug), ''), regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if exists (select 1 from organizations where slug = v_slug) then v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4); end if;
  select count(*) + 1 into n from organizations;
  code := upper(regexp_replace(left(regexp_replace(p_name, '[^A-Za-z]', '', 'g'), 3), '^$', 'ORG')) || '-' || lpad(n::text, 3, '0');

  select * into tpl from company_templates where key = coalesce(p_template, 'generic');
  cfg := coalesce(tpl.config, '{}'::jsonb);
  if p_clone_from is not null then
    -- Clone configuration only — never employees, messages, files or confidential data (§31).
    select jsonb_build_object('departments', (select jsonb_agg(jsonb_build_object('name', d2.name, 'slug', d2.slug, 'color', d2.color, 'icon', d2.icon)) from departments d2 where d2.org_id = p_clone_from))
      into cfg;
  end if;

  insert into organizations (id, name, slug, tenant_code, legal_name, status, industry, country, timezone, email_domain, onboarding_stage, created_by, tagline)
  values (gen_random_uuid(), trim(p_name), v_slug, code, trim(p_name), coalesce(p_status,'onboarding'), coalesce(p_industry, tpl.industry), p_country, coalesce(p_timezone,'Asia/Kolkata'), lower(nullif(p_email_domain,'')), 'setup_started', auth.uid(), 'Powered by GHL ONE')
  returning id into oid;

  for d in select * from jsonb_array_elements(coalesce(p_departments, cfg->'departments', '[]'::jsonb)) loop
    insert into departments (org_id, name, slug, color, icon, position, description)
    values (oid, d->>'name', coalesce(d->>'slug', regexp_replace(lower(d->>'name'), '[^a-z0-9]+', '-', 'g')), coalesce(d->>'color', '#64748b'), coalesce(d->>'icon','building'),
            coalesce((select count(*) from departments where org_id = oid), 0), d->>'description');
  end loop;

  -- Company-wide channels, one per tenant. There is never a shared global channel (§161, §162).
  insert into channels (org_id, type, name, slug, description, is_readonly, visibility)
  values (oid, 'company', 'general', 'general', 'Company-wide conversation', false, 'company_open'),
         (oid, 'announcement', 'announcements', 'announcements', 'Official announcements', true, 'company_open');
  insert into channels (org_id, type, name, slug, description, department_id, visibility)
  select oid, 'department', d2.slug, d2.slug, d2.name || ' department channel', d2.id, 'department_open' from departments d2 where d2.org_id = oid;

  -- Feature set from the template
  insert into org_features (org_id, feature_key, enabled)
  select oid, k, (v)::boolean from jsonb_each_text(coalesce(cfg->'features', '{}'::jsonb)) as e(k, v)
  where exists (select 1 from platform_features f where f.key = e.k)
  on conflict do nothing;

  insert into company_onboarding (org_id, steps, owner_id) values (oid, default_onboarding_steps(), auth.uid());

  if p_admin_email is not null then
    insert into invites (org_id, email, full_name, role, designation, invited_by)
    values (oid, lower(trim(p_admin_email)), coalesce(p_admin_name, split_part(p_admin_email,'@',1)), 'super_admin', 'Company Administrator', auth.uid());
  end if;

  -- Private onboarding room between the platform team and the new company (§32, §164)
  insert into channels (org_id, type, name, slug, description, visibility, owner_id, created_by)
  values (oid, 'group', 'onboarding', 'onboarding', 'Onboarding — ' || p_name || ' · platform team and company admins', 'invite_only', auth.uid(), auth.uid())
  returning id into cid;
  update company_onboarding set channel_id = cid where org_id = oid;

  insert into platform_audit_logs (actor_id, actor_email, org_id, action, entity_type, entity_id, summary, details)
  values (auth.uid(), (select email from profiles where id = auth.uid()), oid, 'platform.company_created', 'organization', oid, p_name,
          jsonb_build_object('template', p_template, 'slug', v_slug, 'tenant_code', code, 'cloned_from', p_clone_from));
  return oid;
end $$;

/** Suspend / activate / archive a tenant (§51, §52, §54, §170). */
create or replace function set_company_status(p_org uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare o organizations%rowtype; blockers jsonb;
begin
  if not platform_can_touch(p_org) or platform_role() not in ('platform_super_admin','platform_ops') then raise exception 'forbidden'; end if;
  select * into o from organizations where id = p_org;
  if o.id is null then raise exception 'company not found'; end if;
  if p_status = 'active' and o.status <> 'active' then
    blockers := company_go_live_blockers(p_org);
    if jsonb_array_length(blockers) > 0 then raise exception 'Cannot activate: %', (select string_agg(x::text, '; ') from jsonb_array_elements_text(blockers) x); end if;
  end if;
  update organizations set status = p_status,
    activated_at = case when p_status = 'active' then coalesce(activated_at, now()) else activated_at end,
    suspended_at = case when p_status = 'suspended' then now() else null end,
    archived_at = case when p_status in ('archived','closed') then now() else null end,
    onboarding_stage = case when p_status = 'active' then 'live' else onboarding_stage end,
    updated_at = now()
  where id = p_org;
  insert into platform_audit_logs (actor_id, org_id, action, entity_type, entity_id, reason, summary, details)
  values (auth.uid(), p_org, 'platform.company_' || p_status, 'organization', p_org, p_reason, o.name, jsonb_build_object('from', o.status, 'to', p_status));
end $$;

/** What still blocks go-live (§169, §171, §178). */
create or replace function company_go_live_blockers(p_org uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select 'No active company administrator' as x where not exists (
      select 1 from profiles p where p.org_id = p_org and p.is_active and p.role in ('super_admin','director') )
      and not exists (select 1 from invites i where i.org_id = p_org and i.role in ('super_admin','director') and i.accepted_at is null)
    union all select 'No departments created' where not exists (select 1 from departments where org_id = p_org)
    union all select 'No employees yet' where (select count(*) from profiles where org_id = p_org and is_active) = 0
    union all select (select count(*)::text from profiles where org_id = p_org and is_active and manager_id is null and role not in ('super_admin','director','executive')) || ' employees have no reporting manager'
      where (select count(*) from profiles where org_id = p_org and is_active and manager_id is null and role not in ('super_admin','director','executive')) > 0
    union all select 'Company status is suspended or archived' where exists (select 1 from organizations where id = p_org and status in ('suspended','archived','closed'))
  ) s
$$;

/** Setup completeness for the tenant health view (§66, §67, §177). */
create or replace function company_setup_health(p_org uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'org_id', p_org,
    'checks', jsonb_build_object(
      'admin', exists (select 1 from profiles where org_id = p_org and is_active and role in ('super_admin','director')),
      'branding', exists (select 1 from organizations where id = p_org and logo_url is not null),
      'domain', exists (select 1 from organizations where id = p_org and domain_verified),
      'departments', exists (select 1 from departments where org_id = p_org),
      'employees', (select count(*) from profiles where org_id = p_org and is_active) > 0,
      'managers', not exists (select 1 from profiles where org_id = p_org and is_active and manager_id is null and role not in ('super_admin','director','executive')),
      'attendance', exists (select 1 from shifts where org_id = p_org),
      'mfa', exists (select 1 from organizations where id = p_org and mfa_required),
      'screens', exists (select 1 from screen_rules where org_id = p_org)
    ),
    'employees', (select count(*) from profiles where org_id = p_org and is_active),
    'departments', (select count(*) from departments where org_id = p_org),
    'blockers', company_go_live_blockers(p_org)
  )
$$;

-- ----------------------------------------------------------------------------
-- 9. Platform command centre
-- ----------------------------------------------------------------------------
create or replace function platform_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not is_platform_admin() then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'companies', (select count(*) from organizations where platform_can_touch(id)),
    'active', (select count(*) from organizations where status = 'active' and platform_can_touch(id)),
    'onboarding', (select count(*) from organizations where status in ('onboarding','trial','pending') and platform_can_touch(id)),
    'suspended', (select count(*) from organizations where status in ('suspended','read_only') and platform_can_touch(id)),
    'employees', (select count(*) from profiles p where p.is_active and platform_can_touch(p.org_id)),
    'online', (select count(*) from profiles p where p.last_seen_at > now() - interval '10 minutes' and platform_can_touch(p.org_id)),
    'storage_mb', (select coalesce(round(sum(u.storage_mb)), 0) from tenant_usage u where u.day = current_date and platform_can_touch(u.org_id)),
    'ai_calls_today', (select coalesce(sum(u.ai_calls), 0) from tenant_usage u where u.day = current_date and platform_can_touch(u.org_id)),
    'video_minutes_today', (select coalesce(sum(u.video_minutes), 0) from tenant_usage u where u.day = current_date and platform_can_touch(u.org_id)),
    'security_alerts', (select count(*) from security_events se where se.created_at > now() - interval '7 days'
                          and (se.kind in ('cross_tenant_attempt','break_glass') or coalesce(se.details->>'severity','') in ('high','critical'))),
    'break_glass_open', (select count(*) from break_glass_sessions where ended_at is null and expires_at > now()),
    'needs_attention', (select coalesce(jsonb_agg(jsonb_build_object('org_id', o.id, 'name', o.name, 'status', o.status, 'reasons', reasons)), '[]'::jsonb) from (
        select o.id, o.name, o.status, (
          select coalesce(jsonb_agg(t), '[]'::jsonb) from (
            select 'No active administrator' as t where not exists (select 1 from profiles p where p.org_id = o.id and p.is_active and p.role in ('super_admin','director'))
            union all select 'Email domain not verified' where o.email_domain is not null and not o.domain_verified
            union all select 'Onboarding stalled' where o.status = 'onboarding' and o.created_at < now() - interval '14 days'
            union all select 'MFA not enforced' where not o.mfa_required and o.status = 'active'
            union all select 'Storage near limit' where coalesce((select u.storage_mb from tenant_usage u where u.org_id = o.id and u.day = current_date), 0)
                                                        > 0.85 * coalesce(nullif((o.limits->>'storage_mb')::numeric, 0), 1e9)
          ) x(t)) as reasons
        from organizations o where platform_can_touch(o.id)
      ) o where jsonb_array_length(o.reasons) > 0),
    'companies_list', (select coalesce(jsonb_agg(jsonb_build_object(
        'org_id', o.id, 'name', o.name, 'slug', o.slug, 'tenant_code', o.tenant_code, 'status', o.status, 'plan', o.plan,
        'industry', o.industry, 'country', o.country, 'logo_url', o.logo_url, 'created_at', o.created_at,
        'employees', (select count(*) from profiles p where p.org_id = o.id and p.is_active),
        'admin', (select p.full_name from profiles p where p.org_id = o.id and p.role = 'super_admin' and p.is_active order by p.created_at limit 1),
        'storage_mb', coalesce((select u.storage_mb from tenant_usage u where u.org_id = o.id and u.day = current_date), 0),
        'ai', org_feature_enabled('ai', o.id),
        'setup', company_setup_health(o.id)
      ) order by o.created_at), '[]'::jsonb) from organizations o where platform_can_touch(o.id))
  ) into r;
  return r;
end $$;

/** One company, for the platform admin's company page (§70). Administrative metadata only. */
-- VOLATILE on purpose: this function writes a platform.company_viewed audit row.
-- Declaring it STABLE makes Postgres reject the INSERT at runtime on every company page load.
create or replace function platform_company(p_org uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if not platform_can_touch(p_org) then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'company', (select to_jsonb(o) - 'domain_verify_token' from organizations o where o.id = p_org),
    'setup', company_setup_health(p_org),
    'admins', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'email', p.email, 'role', p.role, 'last_seen_at', p.last_seen_at)), '[]'::jsonb)
                 from profiles p where p.org_id = p_org and p.is_active and p.role in ('super_admin','director','executive')),
    'departments', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'people', (select count(*) from profiles p where p.department_id = d.id and p.is_active))), '[]'::jsonb)
                 from departments d where d.org_id = p_org),
    'usage', (select coalesce(jsonb_agg(to_jsonb(u) order by u.day desc), '[]'::jsonb) from (select * from tenant_usage where org_id = p_org order by day desc limit 30) u),
    'features', (select coalesce(jsonb_agg(jsonb_build_object('key', f.key, 'label', f.label, 'category', f.category, 'enabled', org_feature_enabled(f.key, p_org)) order by f.position), '[]'::jsonb) from platform_features f where not f.deprecated),
    'onboarding', (select to_jsonb(c) from company_onboarding c where c.org_id = p_org),
    'audit', (select coalesce(jsonb_agg(jsonb_build_object('at', a.created_at, 'action', a.action, 'actor', person_name(a.actor_id), 'summary', a.summary, 'reason', a.reason) order by a.created_at desc), '[]'::jsonb)
                 from (select * from platform_audit_logs where org_id = p_org order by created_at desc limit 50) a),
    'support_sessions', (select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb) from (select * from support_sessions where org_id = p_org order by created_at desc limit 10) s),
    'break_glass', (select coalesce(jsonb_agg(jsonb_build_object('actor', person_name(b.actor_id), 'reason', b.reason, 'justification', b.justification, 'scope', b.scope, 'started_at', b.started_at, 'expires_at', b.expires_at, 'ended_at', b.ended_at) order by b.started_at desc), '[]'::jsonb)
                 from (select * from break_glass_sessions where org_id = p_org order by started_at desc limit 20) b)
  ) into r;
  insert into platform_audit_logs (actor_id, org_id, action, entity_type, entity_id, summary)
  values (auth.uid(), p_org, 'platform.company_viewed', 'organization', p_org, (select name from organizations where id = p_org));
  return r;
end $$;

/** Break-glass: deliberate, reasoned, time-boxed, audited (§3). */
create or replace function start_break_glass(p_org uuid, p_reason text, p_justification text, p_scope text default 'content', p_minutes int default 60) returns uuid
language plpgsql security definer set search_path = public as $$
declare bid uuid;
begin
  if not platform_can_touch(p_org) then raise exception 'forbidden'; end if;
  if p_reason is null or length(trim(p_reason)) < 12 then raise exception 'A specific written reason is required'; end if;
  insert into break_glass_sessions (actor_id, org_id, reason, justification, scope, expires_at)
  values (auth.uid(), p_org, trim(p_reason), p_justification, p_scope, now() + make_interval(mins => least(greatest(p_minutes, 5), 480)))
  returning id into bid;
  insert into platform_audit_logs (actor_id, actor_email, org_id, action, entity_type, entity_id, reason, summary, details)
  values (auth.uid(), (select email from profiles where id = auth.uid()), p_org, 'platform.break_glass_opened', 'organization', p_org, p_reason,
          (select name from organizations where id = p_org), jsonb_build_object('justification', p_justification, 'scope', p_scope, 'minutes', p_minutes));
  insert into security_events (org_id, kind, user_id, details)
  values (p_org, 'break_glass', auth.uid(), jsonb_build_object('reason', p_reason, 'justification', p_justification, 'scope', p_scope, 'severity', 'high'));
  -- The company's own admins are told immediately.
  insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
  select p.id, p_org, 'security', 'Platform administrator opened an authorised access session',
         'Reason: ' || p_reason || ' · Scope: ' || p_scope || ' · Expires ' || to_char(now() + make_interval(mins => p_minutes), 'HH24:MI'),
         '/admin?tab=audit', 'organization', p_org, auth.uid()
    from profiles p where p.org_id = p_org and p.is_active and p.role in ('super_admin','director');
  return bid;
end $$;

create or replace function end_break_glass(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b break_glass_sessions%rowtype;
begin
  select * into b from break_glass_sessions where id = p_id;
  if b.id is null or (b.actor_id <> auth.uid() and not is_platform_owner()) then raise exception 'forbidden'; end if;
  update break_glass_sessions set ended_at = now() where id = p_id;
  insert into platform_audit_logs (actor_id, org_id, action, entity_type, entity_id, summary)
  values (auth.uid(), b.org_id, 'platform.break_glass_closed', 'organization', b.org_id, b.reason);
end $$;

/** A company grants (or revokes) platform support access on its own terms (§115-117). */
create or replace function grant_support_access(p_hours int default 2, p_scope text default 'configuration', p_reason text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; o uuid := current_org();
begin
  if not is_admin() then raise exception 'Only a company administrator can grant support access'; end if;
  insert into support_sessions (org_id, granted_by, scope, reason, expires_at)
  values (o, auth.uid(), p_scope, p_reason, now() + make_interval(hours => least(greatest(p_hours, 1), 168))) returning id into sid;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value)
  values (o, auth.uid(), 'support.access_granted', 'organization', o, coalesce(p_reason, 'Support access granted'), jsonb_build_object('scope', p_scope, 'hours', p_hours));
  return sid;
end $$;

create or replace function revoke_support_access(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update support_sessions set revoked_at = now() where id = p_id and org_id = current_org() and is_admin();
end $$;

-- ----------------------------------------------------------------------------
-- 10. Platform announcements (§80-82)
-- ----------------------------------------------------------------------------
create table if not exists platform_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in ('info','maintenance','security','feature','incident')),
  audience text not null default 'all' check (audience in ('all','selected','admins_only')),
  target_orgs uuid[] not null default '{}',
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function publish_platform_announcement(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare a platform_announcements%rowtype; n int := 0;
begin
  if not (is_platform_admin() and platform_role() in ('platform_super_admin','platform_ops','platform_security')) then raise exception 'forbidden'; end if;
  select * into a from platform_announcements where id = p_id;
  if a.id is null then raise exception 'announcement not found'; end if;
  insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
  select p.id, p.org_id, (case when a.severity = 'security' then 'security' else 'information' end)::notification_kind,
         '[GHL ONE] ' || a.title, left(a.body, 400), '/status', 'platform_announcement', a.id, a.created_by
    from profiles p
   where p.is_active
     and (a.audience = 'all' or (a.audience = 'selected' and p.org_id = any(a.target_orgs)) or (a.audience = 'admins_only' and p.role in ('super_admin','director')))
     and (a.audience <> 'selected' or p.org_id = any(a.target_orgs));
  get diagnostics n = row_count;
  insert into platform_audit_logs (actor_id, action, entity_type, entity_id, summary, details)
  values (auth.uid(), 'platform.announcement_published', 'announcement', a.id, a.title, jsonb_build_object('recipients', n, 'audience', a.audience));
  return n;
end $$;

-- ----------------------------------------------------------------------------
-- 11. Federated (cross-company) collaboration — off by default (§72-79)
-- ----------------------------------------------------------------------------
create table if not exists federations (
  id uuid primary key default gen_random_uuid(),
  org_a uuid not null references organizations(id) on delete cascade,
  org_b uuid not null references organizations(id) on delete cascade,
  purpose text not null,
  status text not null default 'pending' check (status in ('pending','active','declined','expired','revoked')),
  requested_by uuid references profiles(id) on delete set null,
  approved_by_a uuid references profiles(id) on delete set null,
  approved_by_b uuid references profiles(id) on delete set null,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now(),
  check (org_a <> org_b)
);
create unique index if not exists federations_pair_uq on federations(least(org_a, org_b), greatest(org_a, org_b)) where status in ('pending','active');

create table if not exists federation_members (
  federation_id uuid not null references federations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  added_by uuid references profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (federation_id, user_id)
);

alter table live_rooms add column if not exists federation_id uuid references federations(id) on delete set null;
alter table channels add column if not exists federation_id uuid references federations(id) on delete set null;

create or replace function in_federation(p_federation uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from federation_members fm join federations f on f.id = fm.federation_id
                  where fm.federation_id = p_federation and fm.user_id = p_user and f.status = 'active' and f.expires_at > now())
$$;

create or replace function request_federation(p_other_org uuid, p_purpose text, p_days int default 30) returns uuid
language plpgsql security definer set search_path = public as $$
declare fid uuid; o uuid := current_org();
begin
  if not is_admin() then raise exception 'Only a company administrator can request cross-company collaboration'; end if;
  if not org_feature_enabled('federation') then raise exception 'Cross-company collaboration is not enabled for your company'; end if;
  insert into federations (org_a, org_b, purpose, requested_by, approved_by_a, expires_at)
  values (o, p_other_org, p_purpose, auth.uid(), auth.uid(), now() + make_interval(days => least(greatest(p_days,1), 365))) returning id into fid;
  insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
  select p.id, p_other_org, 'approval', 'Cross-company collaboration requested',
         (select name from organizations where id = o) || ' asks to collaborate: ' || p_purpose, '/admin?tab=federation', 'federation', fid, auth.uid()
    from profiles p where p.org_id = p_other_org and p.is_active and p.role in ('super_admin','director');
  insert into platform_audit_logs (actor_id, org_id, action, entity_type, entity_id, summary, details)
  values (auth.uid(), o, 'federation.requested', 'federation', fid, p_purpose, jsonb_build_object('other_org', p_other_org));
  return fid;
end $$;

create or replace function respond_federation(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare f federations%rowtype;
begin
  select * into f from federations where id = p_id;
  if f.id is null then raise exception 'not found'; end if;
  if not (is_admin() and current_org() in (f.org_a, f.org_b)) then raise exception 'forbidden'; end if;
  if not p_approve then update federations set status = 'declined' where id = p_id; return; end if;
  if current_org() = f.org_b then update federations set approved_by_b = auth.uid() where id = p_id;
  else update federations set approved_by_a = auth.uid() where id = p_id; end if;
  update federations set status = 'active' where id = p_id and approved_by_a is not null and approved_by_b is not null;
  insert into platform_audit_logs (actor_id, org_id, action, entity_type, entity_id, summary)
  values (auth.uid(), current_org(), 'federation.' || case when p_approve then 'approved' else 'declined' end, 'federation', p_id, f.purpose);
end $$;

-- ----------------------------------------------------------------------------
-- 12. Tenant isolation self-test (§145, §146, §148)
-- ----------------------------------------------------------------------------
create or replace function tenant_isolation_report() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not is_platform_admin() then raise exception 'forbidden'; end if;
  with t as (
    select c.oid, c.relname, c.relrowsecurity,
           exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped) as has_org,
           (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
           (select count(*) from pg_policy p where p.polrelid = c.oid
              and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%current_org()%'
                or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%current_org()%')) as org_scoped
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  )
  select jsonb_build_object(
    'tables', (select count(*) from t),
    'rls_disabled', (select coalesce(jsonb_agg(relname order by relname), '[]'::jsonb) from t where not relrowsecurity),
    'no_policies', (select coalesce(jsonb_agg(relname order by relname), '[]'::jsonb) from t where relrowsecurity and policies = 0),
    'org_column_but_unscoped', (select coalesce(jsonb_agg(relname order by relname), '[]'::jsonb) from t where has_org and org_scoped = 0),
    'child_tables_no_org', (select coalesce(jsonb_agg(relname order by relname), '[]'::jsonb) from t where not has_org and relname not in (
        'organizations','screens','platform_features','company_templates','platform_admins','platform_admin_invites','platform_assignments','platform_audit_logs','platform_announcements','memberships','active_workspace','break_glass_sessions','support_sessions','federations','federation_members','tenant_usage','org_features','employee_imports','company_invites','company_onboarding')),
    'checked_at', now()
  ) into r;
  return r;
end $$;

/** Deliberate cross-tenant probe used by the release test (§146). Returns true only if isolation holds. */
-- SECURITY INVOKER on purpose: the probe must run with the CALLER's row-level security,
-- otherwise it bypasses the very policies it is meant to test and always reports "isolated".
create or replace function tenant_isolation_probe(p_other_org uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare mine uuid := current_org(); leaked jsonb;
begin
  if p_other_org = mine then return jsonb_build_object('skipped', 'same org'); end if;
  select jsonb_build_object(
    'profiles', (select count(*) from profiles where org_id = p_other_org),
    'channels', (select count(*) from channels where org_id = p_other_org),
    'messages', (select count(*) from messages m join channels c on c.id = m.channel_id where c.org_id = p_other_org),
    'tasks', (select count(*) from tasks where org_id = p_other_org),
    'files', (select count(*) from files where org_id = p_other_org),
    'live_rooms', (select count(*) from live_rooms where org_id = p_other_org),
    'boards', (select count(*) from boards where org_id = p_other_org),
    'recordings', (select count(*) from live_recordings where org_id = p_other_org),
    'attendance', (select count(*) from attendance_days where org_id = p_other_org),
    'notifications', (select count(*) from notifications where org_id = p_other_org),
    'knowledge', (select count(*) from ai_knowledge where org_id = p_other_org)
  ) into leaked;
  return jsonb_build_object('caller_org', mine, 'target_org', p_other_org, 'visible_rows', leaked,
    'isolated', (select bool_and((v)::int = 0) from jsonb_each_text(leaked) as e(k, v)));
end $$;

-- ----------------------------------------------------------------------------
-- 13. RLS for the new tables
-- ----------------------------------------------------------------------------
alter table platform_admins enable row level security;
alter table platform_admin_invites enable row level security;
alter table platform_assignments enable row level security;
alter table platform_audit_logs enable row level security;
alter table break_glass_sessions enable row level security;
alter table support_sessions enable row level security;
alter table memberships enable row level security;
alter table active_workspace enable row level security;
alter table platform_features enable row level security;
alter table org_features enable row level security;
alter table tenant_usage enable row level security;
alter table company_templates enable row level security;
alter table company_onboarding enable row level security;
alter table company_invites enable row level security;
alter table employee_imports enable row level security;
alter table platform_announcements enable row level security;
alter table federations enable row level security;
alter table federation_members enable row level security;

drop policy if exists pa_read on platform_admins;
create policy pa_read on platform_admins for select to authenticated using (is_platform_admin() or user_id = auth.uid());
drop policy if exists pa_write on platform_admins;
create policy pa_write on platform_admins for all to authenticated using (is_platform_owner()) with check (is_platform_owner());

drop policy if exists pai_all on platform_admin_invites;
create policy pai_all on platform_admin_invites for all to authenticated using (is_platform_owner()) with check (is_platform_owner());

drop policy if exists pasg_read on platform_assignments;
create policy pasg_read on platform_assignments for select to authenticated using (is_platform_admin());
drop policy if exists pasg_write on platform_assignments;
create policy pasg_write on platform_assignments for all to authenticated using (is_platform_owner()) with check (is_platform_owner());

-- A company sees the platform actions taken on itself; platform staff see their tenants (§59, §60, §117).
drop policy if exists pal_read on platform_audit_logs;
create policy pal_read on platform_audit_logs for select to authenticated
  using ((org_id is not null and org_id = current_org() and is_admin()) or (is_platform_admin() and (org_id is null or platform_can_touch(org_id))));

drop policy if exists bg_read on break_glass_sessions;
create policy bg_read on break_glass_sessions for select to authenticated
  using ((org_id = current_org() and is_admin()) or actor_id = auth.uid() or is_platform_owner());

drop policy if exists ss_read on support_sessions;
create policy ss_read on support_sessions for select to authenticated
  using ((org_id = current_org() and is_admin()) or (is_platform_admin() and platform_can_touch(org_id)));
drop policy if exists ss_write on support_sessions;
create policy ss_write on support_sessions for all to authenticated
  using (org_id = current_org() and is_admin()) with check (org_id = current_org() and is_admin());

drop policy if exists mem_read on memberships;
create policy mem_read on memberships for select to authenticated
  using (user_id = auth.uid() or (org_id = current_org() and is_manager_plus()) or platform_can_touch(org_id));
drop policy if exists mem_write on memberships;
create policy mem_write on memberships for all to authenticated
  using ((org_id = current_org() and is_admin()) or platform_can_touch(org_id)) with check ((org_id = current_org() and is_admin()) or platform_can_touch(org_id));

drop policy if exists aw_self on active_workspace;
create policy aw_self on active_workspace for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists pf_read on platform_features;
create policy pf_read on platform_features for select to authenticated using (true);
drop policy if exists pf_write on platform_features;
create policy pf_write on platform_features for all to authenticated using (is_platform_owner()) with check (is_platform_owner());

drop policy if exists of_read on org_features;
create policy of_read on org_features for select to authenticated using (org_id = current_org() or platform_can_touch(org_id));
drop policy if exists of_write on org_features;
create policy of_write on org_features for all to authenticated using (platform_can_touch(org_id)) with check (platform_can_touch(org_id));

drop policy if exists tu_read on tenant_usage;
create policy tu_read on tenant_usage for select to authenticated using ((org_id = current_org() and is_admin()) or platform_can_touch(org_id));

drop policy if exists ct_read on company_templates;
create policy ct_read on company_templates for select to authenticated using (is_platform_admin());
drop policy if exists ct_write on company_templates;
create policy ct_write on company_templates for all to authenticated using (is_platform_admin() and platform_role() in ('platform_super_admin','platform_ops')) with check (is_platform_admin());

drop policy if exists co_read on company_onboarding;
create policy co_read on company_onboarding for select to authenticated using (org_id = current_org() or platform_can_touch(org_id));
drop policy if exists co_write on company_onboarding;
create policy co_write on company_onboarding for all to authenticated
  using ((org_id = current_org() and is_admin()) or platform_can_touch(org_id)) with check ((org_id = current_org() and is_admin()) or platform_can_touch(org_id));

drop policy if exists ci_all on company_invites;
create policy ci_all on company_invites for all to authenticated using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists ei_all on employee_imports;
create policy ei_all on employee_imports for all to authenticated
  using ((org_id = current_org() and (is_admin() or is_hr())) or platform_can_touch(org_id))
  with check ((org_id = current_org() and (is_admin() or is_hr())) or platform_can_touch(org_id));

drop policy if exists pann_read on platform_announcements;
create policy pann_read on platform_announcements for select to authenticated
  using (is_platform_admin() or (publish_at <= now() and (audience = 'all' or current_org() = any(target_orgs))));
drop policy if exists pann_write on platform_announcements;
create policy pann_write on platform_announcements for all to authenticated
  using (is_platform_admin() and platform_role() in ('platform_super_admin','platform_ops','platform_security'))
  with check (is_platform_admin());

drop policy if exists fed_read on federations;
create policy fed_read on federations for select to authenticated
  using (org_a = current_org() or org_b = current_org() or is_platform_admin());
drop policy if exists fed_write on federations;
create policy fed_write on federations for all to authenticated
  using ((org_a = current_org() or org_b = current_org()) and is_admin()) with check ((org_a = current_org() or org_b = current_org()) and is_admin());

drop policy if exists fedm_read on federation_members;
create policy fedm_read on federation_members for select to authenticated
  using (in_federation(federation_id) or (org_id = current_org() and is_admin()) or is_platform_admin());
drop policy if exists fedm_write on federation_members;
create policy fedm_write on federation_members for all to authenticated
  using (org_id = current_org() and is_admin()) with check (org_id = current_org() and is_admin());

-- ----------------------------------------------------------------------------
-- 14. Tenant-aware storage: one prefix per company, verified on read (§8)
-- ----------------------------------------------------------------------------
create or replace function storage_org_ok(p_name text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  -- Legacy objects (no tenant prefix) stay readable by their own company's members;
  -- new objects are written under <org_id>/… and must match the caller's active tenant.
  select case
    when p_name is null then false
    -- Only enforce when the first segment is genuinely a tenant id. Chat attachments are stored
    -- under <channel_id>/… which is also a uuid, so a blind uuid test would lock the company out
    -- of its own existing files.
    when exists (select 1 from organizations o where o.id::text = (storage.foldername(p_name))[1])
      then (storage.foldername(p_name))[1]::uuid = current_org()
    else true
  end
$$;

drop policy if exists "files_bucket_read" on storage.objects;
create policy "files_bucket_read" on storage.objects for select to authenticated
  using (bucket_id in ('files','chat') and is_active_member() and storage_org_ok(name));
drop policy if exists "files_bucket_write" on storage.objects;
create policy "files_bucket_write" on storage.objects for insert to authenticated
  with check (bucket_id in ('files','chat') and is_active_member() and storage_org_ok(name));
drop policy if exists live_bucket_read on storage.objects;
create policy live_bucket_read on storage.objects for select to authenticated
  using (bucket_id = 'live' and is_active_member() and storage_org_ok(name));
drop policy if exists live_bucket_write on storage.objects;
create policy live_bucket_write on storage.objects for insert to authenticated
  with check (bucket_id = 'live' and is_active_member() and storage_org_ok(name));

-- ----------------------------------------------------------------------------
-- 15. Grants
-- ----------------------------------------------------------------------------
grant execute on function is_platform_admin(), is_platform_admin_user(uuid), platform_role(uuid), is_platform_owner(), platform_can_touch(uuid, uuid),
  has_break_glass(uuid, uuid), set_active_workspace(uuid, text), my_workspaces(), org_feature_enabled(text, uuid), set_org_feature(uuid, text, boolean, numeric),
  create_company(text, text, text, text, text, text, text, text, text, jsonb, text, uuid), set_company_status(uuid, text, text),
  company_go_live_blockers(uuid), company_setup_health(uuid), platform_overview(), platform_company(uuid),
  start_break_glass(uuid, text, text, text, int), end_break_glass(uuid), grant_support_access(int, text, text), revoke_support_access(uuid),
  publish_platform_announcement(uuid), request_federation(uuid, text, int), respond_federation(uuid, boolean), in_federation(uuid, uuid),
  tenant_isolation_report(), tenant_isolation_probe(uuid), tenant_usage_snapshot(), storage_org_ok(text), default_onboarding_steps()
  to authenticated;
grant execute on function workspaces_for_email(text) to anon, authenticated;
revoke execute on function create_company(text, text, text, text, text, text, text, text, text, jsonb, text, uuid), set_company_status(uuid, text, text),
  platform_overview(), platform_company(uuid), start_break_glass(uuid, text, text, text, int), tenant_isolation_report(), tenant_usage_snapshot() from anon;

-- Realtime + cron
do $$ begin
  alter publication supabase_realtime add table memberships, active_workspace, platform_announcements, federations;
exception when duplicate_object then null; end $$;

do $$ begin perform cron.unschedule('ghl_tenant_usage'); exception when others then null; end $$;
select cron.schedule('ghl_tenant_usage', '20 1 * * *', $$select tenant_usage_snapshot()$$);

-- Seed today's usage so the platform dashboard is not empty on first load.
select tenant_usage_snapshot();
