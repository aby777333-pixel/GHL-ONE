-- 0050 — `user_roles` and `permission_overrides` become tenant-scoped rows.
--
-- Both tables decide authority and neither carried `org_id`, so neither had a policy that could
-- mention `current_org()`. Their predicates are row-independent — `is_admin() or is_hr() or
-- has_admin_perm('security.manage')` says nothing about which row is being touched — so once one
-- branch is true it is true for EVERY row in the table, in every company.
--
-- Demonstrated before writing this, against a company-B person created inside a rolled-back
-- transaction: a company-A director read their role grant, read their individual override, and
-- DELETED the override. That override was a deny, so deleting it grants that person access in a
-- company the actor has nothing to do with. §4 of the brief: company permissions must never leak
-- into another company.
--
-- The guards did not close it either. `guard_permission_override` does check the target's company,
-- but it is BEFORE INSERT OR UPDATE — DELETE never reaches it. `guard_user_role` had no company
-- check at all. A guard that skips an operation is why the tenant boundary belongs in RLS, on a
-- column, rather than in a trigger.

-- ---------------------------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------------------------
alter table public.user_roles           add column if not exists org_id uuid references public.organizations(id) on delete cascade;
alter table public.permission_overrides add column if not exists org_id uuid references public.organizations(id) on delete cascade;

update public.user_roles ur
   set org_id = p.org_id
  from public.profiles p
 where p.id = ur.user_id and ur.org_id is null;

update public.permission_overrides po
   set org_id = p.org_id
  from public.profiles p
 where p.id = po.user_id and po.org_id is null;

-- The company on an authority row is a FACT about the subject, not a field a caller picks. The
-- trigger derives it from the subject's profile and overrides whatever was supplied, so a caller
-- cannot file somebody else's grant under the wrong company by passing an org_id. The supplied
-- value and then current_org() remain as fallbacks only for a subject with no profile.
--
-- The DEFAULT exists for a second reason worth stating: `NOT NULL` with no default makes the
-- generated TypeScript Insert type demand the column at every call site, which would have turned a
-- database improvement into five compile errors in code that has no business knowing the value.
create or replace function public.authority_row_org_default()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid;
begin
  select org_id into v_org from profiles where id = new.user_id;
  new.org_id := coalesce(v_org, new.org_id, current_org());
  return new;
end $$;

drop trigger if exists trg_user_roles_org on public.user_roles;
create trigger trg_user_roles_org before insert or update on public.user_roles
  for each row execute function public.authority_row_org_default();

drop trigger if exists trg_permission_overrides_org on public.permission_overrides;
create trigger trg_permission_overrides_org before insert or update on public.permission_overrides
  for each row execute function public.authority_row_org_default();

alter table public.user_roles           alter column org_id set default current_org();
alter table public.permission_overrides alter column org_id set default current_org();

-- An authority row with no company is precisely what this migration exists to prevent, so it must
-- fail loudly rather than be written and then be invisible to every policy.
alter table public.user_roles           alter column org_id set not null;
alter table public.permission_overrides alter column org_id set not null;

create index if not exists user_roles_org_idx           on public.user_roles(org_id);
create index if not exists permission_overrides_org_idx on public.permission_overrides(org_id);

-- ---------------------------------------------------------------------------------------------
-- Policies. The company test is ANDed in front of what was already there, so nothing that was
-- allowed within a company changes. Both tables keep FOR ALL — splitting them per command belongs
-- with the delegation work (§15), not with closing a leak.
-- ---------------------------------------------------------------------------------------------
drop policy if exists ur_read on public.user_roles;
create policy ur_read on public.user_roles for select using (
  org_id = current_org()
  and (user_id = auth.uid() or is_manager_plus() or is_hr() or has_admin_perm('security.manage'))
);

drop policy if exists ur_write on public.user_roles;
create policy ur_write on public.user_roles for all using (
  org_id = current_org()
  and (is_admin() or is_hr() or has_admin_perm('security.manage')
       or (is_manager_of(user_id) and exists (
             select 1 from system_roles s
              where s.id = user_roles.system_role_id
                and role_rank(s.base_level) >= role_rank(effective_level(auth.uid())))))
) with check (
  org_id = current_org()
  and (is_admin() or is_hr() or has_admin_perm('security.manage')
       or (is_manager_of(user_id) and exists (
             select 1 from system_roles s
              where s.id = user_roles.system_role_id
                and role_rank(s.base_level) >= role_rank(effective_level(auth.uid())))))
);

drop policy if exists po_read on public.permission_overrides;
create policy po_read on public.permission_overrides for select using (
  org_id = current_org()
  and (user_id = auth.uid() or is_admin() or has_admin_perm('security.manage') or is_manager_of(user_id))
);

drop policy if exists po_write on public.permission_overrides;
create policy po_write on public.permission_overrides for all
  using      (org_id = current_org() and (is_admin() or has_admin_perm('security.manage')))
  with check (org_id = current_org() and (is_admin() or has_admin_perm('security.manage')));

-- ---------------------------------------------------------------------------------------------
-- The decision path and the assignment guard. Neither goes through RLS, so both had to be closed
-- separately.
--
--   1. `has_perm` is SECURITY DEFINER and joined user_roles to system_roles with no company test.
--      A role belonging to company A, attached to a person in company B, would have granted its
--      permissions inside company B. Verified there are no such rows today (0 cross-company
--      holdings), so this filter changes no live answer — it removes the possibility.
--   2. `guard_user_role` checked that the actor holds what they are handing out, but never that
--      the person receiving it is in the actor's company. `guard_permission_override` already had
--      that check; this brings the two into line.
-- ---------------------------------------------------------------------------------------------
create or replace function public.has_perm(p_perm text, p_user uuid default auth.uid())
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  p profiles%rowtype;
  o boolean;
  r boolean;
  ceiling text[];
  v_alias text;
  keys text[];
begin
  if p_user is null or p_perm is null then return false; end if;

  if is_platform_owner_user(p_user) then return true; end if;

  select * into p from profiles where id = p_user;
  if p.id is null or not p.is_active then return false; end if;

  if p_perm like 'platform.%' then return false; end if;

  select legacy_alias into v_alias from permissions where key = p_perm;
  if v_alias is null or v_alias = p_perm then
    keys := array[p_perm];
    v_alias := null;
  else
    keys := array[p_perm, v_alias];
  end if;

  select allowed into o
    from permission_overrides
   where user_id = p_user and perm = p_perm and (expires_at is null or expires_at > now())
   order by allowed
   limit 1;
  if found then return o; end if;
  if v_alias is not null then
    select allowed into o
      from permission_overrides
     where user_id = p_user and perm = v_alias and (expires_at is null or expires_at > now())
     order by allowed
     limit 1;
    if found then return o; end if;
  end if;

  if p.status in ('probation','intern') and keys && array['download','share_external','export'] then return false; end if;
  if p.status in ('suspended','notice_period') and keys && array['share_external','export','delete'] then return false; end if;

  if is_company_super_admin(p_user) then
    ceiling := admin_ceiling(p.org_id);
    return ceiling is null or ceiling && keys;
  end if;

  -- Role tier, deny first: an explicit deny on any held role outranks an allow on another held
  -- role, the department default and the level default. Placed below the company-super-admin
  -- branch on purpose, so handing a restrictive role to the company's top administrator can never
  -- become a way to lock everybody out.
  --
  -- `sr.org_id = p.org_id` (0050): a role only speaks for the company that owns it. Without it a
  -- role attached across a tenant boundary would grant — or deny — inside a company that never
  -- defined it.
  if exists (
    select 1 from user_roles ur join system_roles sr on sr.id = ur.system_role_id
     where ur.user_id = p_user
       and sr.org_id = p.org_id
       and ur.starts_at <= now() and (ur.expires_at is null or ur.expires_at > now())
       and sr.denied_permissions && keys
  ) then
    return false;
  end if;

  select bool_or(sr.permissions && keys) into r
    from user_roles ur join system_roles sr on sr.id = ur.system_role_id
   where ur.user_id = p_user
     and sr.org_id = p.org_id
     and ur.starts_at <= now() and (ur.expires_at is null or ur.expires_at > now());
  if r then return true; end if;

  if exists (select 1 from departments d where d.id = p.department_id and d.default_permissions && keys) then
    return true;
  end if;

  if exists (select 1 from role_defaults rd where rd.org_id = p.org_id and rd.level = p.role and rd.permissions && keys) then
    return true;
  end if;

  if p.role = 'super_admin' then
    ceiling := admin_ceiling(p.org_id);
    return ceiling is null or ceiling && keys;
  end if;

  return false;
end $function$;

create or replace function public.guard_user_role()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r system_roles%rowtype; perm text; rk text; target_org uuid;
begin
  if auth.uid() is null then return new; end if;          -- migrations and trusted server jobs
  if is_platform_owner() then return new; end if;
  if new.user_id = auth.uid() and tg_op = 'INSERT' then
    raise exception 'You cannot give yourself a security role.' using errcode = 'insufficient_privilege';
  end if;

  -- The person receiving the role must be in the company the actor is working in, and the role
  -- must belong to that company too. RLS enforces this as well; a guard that says which of the two
  -- is wrong gives a far better message than a policy that simply refuses.
  select org_id into target_org from profiles where id = new.user_id;
  if target_org is distinct from current_org() then
    raise exception 'That person is not in this company.' using errcode = 'insufficient_privilege';
  end if;

  select * into r from system_roles where id = new.system_role_id;
  if r.id is null then return new; end if;
  if r.org_id is distinct from target_org then
    raise exception 'The role "%" belongs to a different company.', r.name using errcode = 'insufficient_privilege';
  end if;

  foreach perm in array coalesce(r.permissions, '{}') loop
    if not has_perm(perm) then
      raise exception 'You cannot assign "%": it grants "%", which you do not hold yourself.', r.name, perm
        using errcode = 'insufficient_privilege';
    end if;
    select risk into rk from permissions where key = perm;
    if rk = 'high' and not has_perm('security.manage') then
      raise exception 'The "%" role grants the high-risk permission "%". Only someone who administers security may assign it.', r.name, perm
        using errcode = 'insufficient_privilege';
    end if;
  end loop;
  return new;
end $function$;

-- ---------------------------------------------------------------------------------------------
-- Why the self test said this was fine.
--
-- `tenant:no_org_column:review` read `rep->'child_tables_no_org'` and coalesced a missing key to
-- an empty list. `tenant_isolation_report()` never emits that key, so the check reported "every
-- non-global table carries org_id" on every run — while 65 tables did not. A measurement that was
-- never taken rendered as a measurement that passed.
--
-- That is the more general bug: coalescing an absent key to "empty" turns "not measured" into
-- "nothing to report". The report now computes the list itself instead of trusting a key that may
-- not exist.
-- ---------------------------------------------------------------------------------------------

-- `permissions` and `role_templates` are platform-curated catalogues shared by every company —
-- global by design, like `screens`, not tables that lost their org_id.
create or replace function public.selftest_global_tables()
returns text[]
language sql
immutable
as $$
  select array[
    'active_workspace','break_glass_sessions','company_invites','company_onboarding',
    'company_templates','employee_imports','federation_members','federations','memberships',
    'org_features','organizations','permissions','platform_admin_invites','platform_admins',
    'platform_announcements','platform_assignments','platform_audit_logs','platform_features',
    'push_config','role_templates','screens','support_sessions','tenant_usage'
  ];
$$;

create or replace function public.selftest_isolation_report()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rep         jsonb;
  pa          uuid;
  orig_claims text;
  orig_sub    text;
  children    jsonb;
begin
  begin
    rep := tenant_isolation_report();
  exception when others then
    rep := null;
  end;

  if rep is null then
    select user_id into pa from platform_admins limit 1;
    if pa is not null then
      orig_claims := current_setting('request.jwt.claims', true);
      orig_sub    := current_setting('request.jwt.claim.sub', true);
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', pa::text, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', pa::text, true);
        rep := tenant_isolation_report();
      exception when others then
        rep := null;
      end;
      perform set_config('request.jwt.claims', coalesce(orig_claims, ''), true);
      perform set_config('request.jwt.claim.sub', coalesce(orig_sub, ''), true);
    end if;
  end if;

  if rep is null then
    with t as (
      select c.oid, c.relname, c.relrowsecurity,
             exists (select 1 from pg_attribute a
                      where a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped) as has_org,
             (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
             (select count(*) from pg_policy p
               where p.polrelid = c.oid
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
      'checked_at', now(),
      'source', 'selftest_fallback'
    ) into rep;
  end if;

  -- Computed here, always, whatever the primary report did or did not return. This is the line
  -- that was silently empty.
  select coalesce(jsonb_agg(c.relname order by c.relname), '[]'::jsonb) into children
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not exists (select 1 from pg_attribute a
                      where a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped)
     and not (c.relname = any (selftest_global_tables()));

  return jsonb_set(coalesce(rep, '{}'::jsonb), '{child_tables_no_org}', children);
end $function$;

-- 61 entries would drown the line it is printed on, so the review names the first few and counts
-- the rest. It stays informational: most of these legitimately reach their tenant through a
-- parent whose own policy is org-scoped.
create or replace function public.test_tenant_scoping()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  checks   jsonb := '[]'::jsonb;
  rep      jsonb;
  globals  text[] := selftest_global_tables();
  offend   text[];
begin
  if not selftest_allowed() then raise exception 'forbidden'; end if;

  rep := selftest_isolation_report();

  select coalesce(array_agg(v order by v), '{}'::text[]) into offend
    from jsonb_array_elements_text(coalesce(rep->'org_column_but_unscoped', '[]'::jsonb)) v
   where not (v = any (globals));
  checks := checks || jsonb_build_object(
    'name', 'tenant:org_column_but_unscoped',
    'ok', cardinality(offend) = 0,
    'detail', case when cardinality(offend) = 0
                   then 'every table with an org_id column has at least one policy referencing current_org()'
                   else 'tables carry org_id but no current_org() policy (cross-company leak): ' || array_to_string(offend, ', ') end);

  select coalesce(array_agg(v order by v), '{}'::text[]) into offend
    from jsonb_array_elements_text(coalesce(rep->'rls_disabled', '[]'::jsonb)) v
   where not (v = any (globals));
  checks := checks || jsonb_build_object(
    'name', 'tenant:rls_disabled',
    'ok', cardinality(offend) = 0,
    'detail', case when cardinality(offend) = 0
                   then 'row level security is enabled on every non-global table'
                   else 'RLS is disabled on: ' || array_to_string(offend, ', ') end);

  select coalesce(array_agg(v order by v), '{}'::text[]) into offend
    from jsonb_array_elements_text(coalesce(rep->'no_policies', '[]'::jsonb)) v
   where not (v = any (globals));
  checks := checks || jsonb_build_object(
    'name', 'tenant:rls_without_policies',
    'ok', cardinality(offend) = 0,
    'detail', case when cardinality(offend) = 0
                   then 'every RLS-enabled non-global table has at least one policy'
                   else 'RLS enabled but no policies on: ' || array_to_string(offend, ', ') end);

  select coalesce(array_agg(v order by v), '{}'::text[]) into offend
    from jsonb_array_elements_text(coalesce(rep->'child_tables_no_org', '[]'::jsonb)) v
   where not (v = any (globals));
  checks := checks || jsonb_build_object(
    'name', 'tenant:no_org_column:review',
    'ok', true,
    'detail', case when cardinality(offend) = 0
                   then 'every non-global table carries org_id'
                   else format('%s tables reach their tenant through a parent — review that each really does: %s%s',
                               cardinality(offend),
                               array_to_string(offend[1:12], ', '),
                               case when cardinality(offend) > 12 then format(' … and %s more', cardinality(offend) - 12) else '' end) end);

  return selftest_result(checks) || jsonb_build_object('report', rep);
end $function$;

-- ---------------------------------------------------------------------------------------------
-- A named check for the tables that decide authority.
--
-- The review line above is informational by design: most tables without `org_id` legitimately
-- reach their tenant through a parent. That is exactly why it could not have caught this — it is
-- not allowed to fail. The tables that decide *who may do what* are a short, nameable list, and
-- for those "reaches its tenant somehow" is not good enough: each one must carry `org_id` and be
-- scoped in its own policies, so no future policy edit can quietly drop the boundary.
-- ---------------------------------------------------------------------------------------------
create or replace function public.authority_tables()
returns text[]
language sql
immutable
as $$
  select array['user_roles','permission_overrides','permission_scopes','system_roles',
               'role_defaults','permission_changes','system_role_versions'];
$$;

create or replace function public.test_access_control()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare checks jsonb := '[]'::jsonb; r record; n int; bad text[];
begin
  if not selftest_allowed() then raise exception 'forbidden'; end if;

  for r in
    select o.id, o.name from organizations o
     where o.status in ('active','trial','onboarding')
       and exists (select 1 from profiles p where p.org_id = o.id and p.is_active)
       and not exists (select 1 from profiles p where p.org_id = o.id and p.is_active
                         and (p.role = 'super_admin' or is_company_super_admin(p.id)))
  loop
    checks := checks || jsonb_build_object('name', 'access:no_admin:' || r.name, 'ok', false,
      'detail', 'This company has active people and no Super Admin. Assign one in Access Control -> People.');
  end loop;

  for r in
    select p.key, p.legacy_alias from permissions p
     where p.legacy_alias is not null
       and not exists (select 1 from permissions a where a.key = p.legacy_alias)
  loop
    checks := checks || jsonb_build_object('name', 'access:dangling_alias:' || r.key, 'ok', false,
      'detail', 'legacy_alias "' || r.legacy_alias || '" is not in the catalogue. Add it, or clear the alias.');
  end loop;

  for r in
    select p.key from permissions p join permissions q on q.key = p.legacy_alias
     where q.legacy_alias = p.key
  loop
    checks := checks || jsonb_build_object('name', 'access:alias_loop:' || r.key, 'ok', false,
      'detail', 'Two keys alias each other. An alias must point at a broader key, never back.');
  end loop;

  for r in
    select sr.name from system_roles sr
     where exists (select 1 from unnest(sr.permissions) k where k like 'platform.%')
  loop
    checks := checks || jsonb_build_object('name', 'access:platform_key_in_role:' || r.name, 'ok', false,
      'detail', 'A company role lists a platform.* permission. Remove it - platform authority is not a tenant role.');
  end loop;

  for r in
    select sr.name, k as perm from system_roles sr, unnest(sr.permissions) k
     where k = any(sr.denied_permissions)
  loop
    checks := checks || jsonb_build_object('name', 'access:role_allows_and_denies:' || r.name || ':' || r.perm, 'ok', false,
      'detail', 'The role "' || r.name || '" both grants and denies "' || r.perm || '". Deny wins; remove whichever one is wrong.');
  end loop;

  for r in
    select distinct s.perm from permission_scopes s
     where not (s.perm = any(scope_enforced_permissions()))
       and (s.expires_at is null or s.expires_at > now())
  loop
    checks := checks || jsonb_build_object('name', 'access:scope_not_enforced:' || r.perm, 'ok', false,
      'detail', 'A scope rule is set on "' || r.perm || '", but nothing enforces scope for that key yet, so it narrows nothing. Enforced today: ' || array_to_string(scope_enforced_permissions(), ', ') || '.');
  end loop;

  for r in
    select t.key as tkey, k as perm from role_templates t, unnest(t.permissions) k
     where not exists (select 1 from permissions p where p.key = k)
  loop
    checks := checks || jsonb_build_object('name', 'access:template_unknown_key:' || r.tkey || ':' || r.perm, 'ok', false,
      'detail', 'Role template "' || r.tkey || '" names "' || r.perm || '", which is no longer in the catalogue.');
  end loop;

  -- A role attached to somebody in another company would grant or deny inside a company that never
  -- defined it. RLS and guard_user_role both refuse to create one; this catches any that predate
  -- them or arrive through a definer path.
  select coalesce(array_agg(distinct p.full_name), '{}'::text[]) into bad
    from user_roles ur
    join system_roles sr on sr.id = ur.system_role_id
    join profiles p on p.id = ur.user_id
   where sr.org_id is distinct from p.org_id;
  checks := checks || jsonb_build_object('name', 'access:no_cross_company_roles', 'ok', cardinality(bad) = 0,
    'detail', case when cardinality(bad) = 0 then 'No person holds a security role belonging to another company.'
                   else 'These people hold a role from another company: ' || array_to_string(bad, ', ') end);

  -- Every table that decides authority must carry org_id AND scope its own policies by it.
  select coalesce(array_agg(t order by t), '{}'::text[]) into bad
    from unnest(authority_tables()) t
   where not exists (select 1 from information_schema.columns c
                      where c.table_schema = 'public' and c.table_name = t and c.column_name = 'org_id')
      or not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = t
                        and (coalesce(p.qual,'') || coalesce(p.with_check,'')) like '%current_org%');
  checks := checks || jsonb_build_object('name', 'access:authority_tables_tenanted', 'ok', cardinality(bad) = 0,
    'detail', case when cardinality(bad) = 0
                   then 'Every table that decides authority carries org_id and scopes its policies by current_org().'
                   else 'These authority tables are not tenant-scoped, so one company can reach another''s: ' || array_to_string(bad, ', ') end);

  select count(*) into n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal and c.relname = 'user_roles' and t.tgname = 'trg_guard_user_role';
  checks := checks || jsonb_build_object('name', 'access:assignment_guard_present', 'ok', n = 1,
    'detail', case when n = 1 then 'trg_guard_user_role is attached to user_roles.'
                   else 'trg_guard_user_role is MISSING - roles can be assigned by people who do not hold what they grant.' end);

  select count(*) into n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal and c.relname in ('profiles','user_roles')
     and t.tgname in ('trg_last_super_admin_profile','trg_last_super_admin_role');
  checks := checks || jsonb_build_object('name', 'access:last_admin_guard_present', 'ok', n = 2,
    'detail', case when n = 2 then 'Both last-Super-Admin guards are attached.'
                   else 'A last-Super-Admin guard is MISSING - a company can be left with nobody who can administer it.' end);

  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'has_perm'
     and pg_get_functiondef(p.oid) ~ '\mdesignation\M';
  checks := checks || jsonb_build_object('name', 'access:authz_ignores_job_title', 'ok', n = 0,
    'detail', case when n = 0 then 'has_perm does not read designation. Job title is organisational identity, never authority.'
                   else 'has_perm references `designation`. A job title must never grant access.' end);

  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'explain_permission'
     and pg_get_functiondef(p.oid) ~ '''allowed'', has_perm\(';
  checks := checks || jsonb_build_object('name', 'access:explain_matches_decision', 'ok', n = 1,
    'detail', case when n = 1 then 'explain_permission takes its verdict from has_perm, so the two cannot disagree.'
                   else 'explain_permission computes its own verdict. It will drift - return has_perm(p_perm, p_user) instead.' end);

  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname in ('can_view_task','can_view_project','can_view_channel')
     and pg_get_functiondef(p.oid) ~ '_in_scope\(';
  checks := checks || jsonb_build_object('name', 'access:resource_scope_wired', 'ok', n = 3,
    'detail', case when n = 3 then 'can_view_task, can_view_project and can_view_channel all consult their scope predicate.'
                   else 'A resource control no longer calls its *_in_scope predicate - scope rules on it are being ignored.' end);

  select count(*) into n from pg_policies
   where schemaname = 'public'
     and ((tablename = 'files' and policyname = 'files_read' and qual like '%file\_in\_scope%')
       or (tablename = 'wiki_pages' and policyname = 'wiki_read' and qual like '%wiki\_in\_scope%'));
  checks := checks || jsonb_build_object('name', 'access:file_wiki_policies_scoped', 'ok', n = 2,
    'detail', case when n = 2 then 'The files and wiki read policies both consult their scope predicate.'
                   else 'A files or wiki_pages read policy no longer consults its scope predicate.' end);

  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'search_all'
     and pg_get_functiondef(p.oid) ~ 'file_in_scope\('
     and pg_get_functiondef(p.oid) ~ 'wiki_in_scope\(';
  checks := checks || jsonb_build_object('name', 'access:search_respects_scope', 'ok', n = 1,
    'detail', case when n = 1 then 'search_all applies file and wiki scope, so a narrowed reviewer cannot find them by searching.'
                   else 'search_all bypasses RLS and no longer applies file/wiki scope - narrowed content is findable by search.' end);

  if jsonb_array_length(checks) = 0 then
    checks := jsonb_build_array(jsonb_build_object('name','access:none','ok',true,'detail','No access-control problems found.'));
  end if;
  return selftest_result(checks);
end $function$;

-- Same rule as 0045 and 0049: a new SECURITY DEFINER function inherits EXECUTE for PUBLIC, which
-- includes `anon`. A trigger function is not usefully callable over PostgREST, but leaving the
-- grant means the anon surface grows by one every time somebody adds a trigger, which is how the
-- ten entry points 0045 had to close accumulated in the first place.
revoke all on function public.authority_row_org_default() from public, anon;
