-- 0041 — The Company Super Admin as a *security role*, and the two guards that were missing.
--
-- Three separate things, all additive:
--
--   a) A bug fix. `log_permission_change()` is attached to four tables but only one of them has a
--      `perm` column, and it read that column outside the branch that knows it exists. plpgsql
--      resolves a record field against the row's real composite type before the surrounding CASE
--      picks a branch, so **creating a security role or saving a level default raised
--      `record "new" has no field "perm"` and failed.** Nobody had created a role since.
--
--   b) `company_super_admin`. Until now "runs this company" was `profiles.role = 'super_admin'` —
--      a *hierarchy level*, which is organisational identity, not authority. That is precisely the
--      conflation the brief forbids: a job title must never grant access. The authority is now a
--      security role a person is given and can be taken, independent of what their level says.
--      Existing level-super-admins are backfilled once so nobody loses access in the changeover;
--      from here the two move independently.
--
--   c) The guards. Assigning a role was unchecked (§16) and a company could be left with no
--      administrator at all (§17).

-- ------------------------------------------------------------------ a) bug fix
create or replace function public.log_permission_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare subj text; sid text; o uuid; v_perm text;
begin
  if tg_table_name = 'permission_overrides' then
    subj := 'user';
    sid  := coalesce(new.user_id, old.user_id)::text;
    v_perm := coalesce(new.perm, old.perm);
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
    o, subj, sid, v_perm,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end $$;

-- --------------------------------------------------- b) the company's own top role
insert into public.system_roles (org_id, key, name, description, base_level, permissions, screens, denied_screens, is_system)
select o.id, 'company_super_admin', 'Company Super Admin',
       'Runs this company: its people, roles, permissions, departments and settings. Bounded by the administrative ceiling the platform owner sets. Never reaches platform controls.',
       'super_admin',
       (select coalesce(array_agg(k.key), '{}') from public.permissions k where not k.platform_only and k.key <> '*'),
       '{}', '{}', true
from public.organizations o
on conflict (org_id, key) do nothing;

/** Holds the company's own top security role. Deliberately NOT `profiles.role = 'super_admin'`. */
create or replace function public.is_company_super_admin(p_user uuid default auth.uid())
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce(exists (
    select 1
      from user_roles ur
      join system_roles sr on sr.id = ur.system_role_id
     where ur.user_id = p_user
       and sr.key = 'company_super_admin'
       and ur.starts_at <= now()
       and (ur.expires_at is null or ur.expires_at > now())
  ), false);
$$;

revoke all on function public.is_company_super_admin(uuid) from public;
revoke all on function public.is_company_super_admin(uuid) from anon;
grant execute on function public.is_company_super_admin(uuid) to authenticated;

-- One-time changeover. Everyone who already runs a company by level gets the role that says so.
insert into public.user_roles (user_id, system_role_id, granted_by)
select p.id, sr.id, null
from public.profiles p
join public.system_roles sr on sr.org_id = p.org_id and sr.key = 'company_super_admin'
where p.role = 'super_admin' and p.is_active
on conflict (user_id, system_role_id) do nothing;

/*
  `has_perm` again, with one branch added.

  The role lists every company permission, so left to the ordinary role branch it would sail past
  `company_admin_limits`. Decide it explicitly and bound it by the ceiling — the same treatment the
  `profiles.role = 'super_admin'` branch already gets. It sits *after* individual overrides and the
  employment-status rules, so an explicit deny still beats it.
*/
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

  select bool_or(sr.permissions && keys) into r
    from user_roles ur join system_roles sr on sr.id = ur.system_role_id
   where ur.user_id = p_user and ur.starts_at <= now() and (ur.expires_at is null or ur.expires_at > now());
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
end $$;

-- ------------------------------------------------------------------- c) guards
/*
  §16 — nobody hands out authority they do not hold.

  `system_roles`, `role_defaults` and `permission_overrides` were each guarded; `user_roles` was
  not, so *assigning* an existing powerful role went unchecked and anyone whose RLS let them write
  the table could give away a permission they had never held. Narrower than
  `can_manage_permission()` on purpose: that asks "may you edit the catalogue", which HR does not
  need in order to make somebody an Employee. This asks only what §16 requires.
*/
create or replace function public.guard_user_role()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare r system_roles%rowtype; perm text; rk text;
begin
  if auth.uid() is null then return new; end if;          -- migrations and trusted server jobs
  if is_platform_owner() then return new; end if;
  if new.user_id = auth.uid() and tg_op = 'INSERT' then
    raise exception 'You cannot give yourself a security role.' using errcode = 'insufficient_privilege';
  end if;

  select * into r from system_roles where id = new.system_role_id;
  if r.id is null then return new; end if;

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
end $$;

drop trigger if exists trg_guard_user_role on public.user_roles;
create trigger trg_guard_user_role
  before insert or update on public.user_roles
  for each row execute function public.guard_user_role();

/*
  §17 — a company is never left without an administrator.

  Counts both routes to the authority, because both still carry it: the `company_super_admin`
  security role and the `profiles.role = 'super_admin'` level. Losing one while the other stands
  is not a removal, so ordinary changeovers are unaffected — only the genuine last one is refused.
*/
create or replace function public.guard_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_org uuid; v_user uuid; remaining int;
begin
  if tg_table_name = 'user_roles' then
    select ur.user_id into v_user from user_roles ur where ur.id = old.id;
    if not exists (select 1 from system_roles sr where sr.id = old.system_role_id and sr.key = 'company_super_admin') then
      return coalesce(new, old);
    end if;
    if tg_op = 'UPDATE' and new.system_role_id = old.system_role_id
       and (new.expires_at is null or new.expires_at > now()) then
      return new;
    end if;
  else
    v_user := old.id;
    if new.role = 'super_admin' and new.is_active then return new; end if;
    if old.role <> 'super_admin' or not old.is_active then return new; end if;
  end if;

  select org_id into v_org from profiles where id = v_user;
  if v_org is null then return coalesce(new, old); end if;

  select count(*) into remaining
    from profiles p
   where p.org_id = v_org
     and p.is_active
     and p.id <> v_user
     and (p.role = 'super_admin' or is_company_super_admin(p.id));

  if remaining = 0 then
    raise exception 'This company must have at least one active Super Admin. Assign another Super Admin before removing this access.'
      using errcode = 'restrict_violation';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_last_super_admin_profile on public.profiles;
create trigger trg_last_super_admin_profile
  before update of role, is_active on public.profiles
  for each row execute function public.guard_last_super_admin();

drop trigger if exists trg_last_super_admin_role on public.user_roles;
create trigger trg_last_super_admin_role
  before delete or update on public.user_roles
  for each row execute function public.guard_last_super_admin();
