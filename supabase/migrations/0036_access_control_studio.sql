-- 0036_access_control_studio.sql
--
-- The read side of access governance, plus role history. Everything here is inspection and
-- explanation: who can do what, why, what a proposed change would do, and how to undo one.
-- Nothing in this file grants anything.
--
-- Applied remotely as 0036a (reads) → 0036b (fail-closed fix) → 0036c (versions, diff, review)
-- → 0036d (revoke from anon). The definitions below are the final state.

-- ---------------------------------------------------------------------------
-- Who may inspect somebody's access.
--
-- Deny by default has to mean deny when the answer is *unknown* as well. The first draft read
-- `p_user = auth.uid()`, which is NULL rather than false for an unauthenticated caller — and
-- `if not NULL then raise` never fires, so the guard fell open. Hence the coalesce.
-- ---------------------------------------------------------------------------
create or replace function public.can_review_access(p_user uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce(
    is_platform_owner()
    or (auth.uid() is not null and p_user = auth.uid())
    or (
      auth.uid() is not null
      and exists (select 1 from profiles t where t.id = p_user and t.org_id = current_org())
      and (has_perm('security.manage') or has_perm('audit.read') or has_perm('people.manage'))
    ), false)
$$;

grant execute on function public.can_review_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- WHY does this person have (or not have) this? (§43, §44)
--
-- Returns the whole precedence chain, so the answer is explainable instead of a bare yes/no.
-- ---------------------------------------------------------------------------
create or replace function public.explain_permission(p_user uuid, p_perm text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  p profiles%rowtype;
  chain jsonb := '[]'::jsonb;
  o boolean;
  hit text;
  ceiling text[];
  decided boolean := false;
  result boolean := false;
begin
  if not can_review_access(p_user) then
    raise exception 'You are not allowed to review this person''s access.' using errcode = 'insufficient_privilege';
  end if;

  if is_platform_owner_user(p_user) then
    return jsonb_build_object(
      'allowed', true, 'perm', p_perm, 'user_id', p_user,
      'chain', jsonb_build_array(jsonb_build_object('step', 'platform_owner', 'effect', 'allow',
        'detail', 'Platform owner — reserved platform authority.')));
  end if;

  select * into p from profiles where id = p_user;
  if p.id is null then return jsonb_build_object('allowed', false, 'chain', '[]'::jsonb, 'reason', 'No such person.'); end if;

  if not p.is_active then
    chain := chain || jsonb_build_object('step','account','effect','deny','detail','The account is not active.');
    decided := true;
  end if;

  if not decided and p_perm like 'platform.%' then
    chain := chain || jsonb_build_object('step','platform_only','effect','deny','detail','Platform-only permissions never apply inside a company.');
    decided := true;
  end if;

  if not decided then
    select allowed into o from permission_overrides
      where user_id = p_user and perm = p_perm and (expires_at is null or expires_at > now())
      order by allowed limit 1;
    if found then
      chain := chain || jsonb_build_object('step','individual_override','effect', case when o then 'allow' else 'deny' end,
        'detail', case when o then 'Granted to this person directly.' else 'Explicitly denied for this person. An individual deny outranks every company-level grant.' end);
      decided := true; result := o;
    end if;
  end if;

  if not decided and p.status in ('probation','intern') and p_perm in ('download','share_external','export') then
    chain := chain || jsonb_build_object('step','employment_status','effect','deny','detail','Withheld while on ' || p.status || '.');
    decided := true;
  end if;
  if not decided and p.status in ('suspended','notice_period') and p_perm in ('share_external','export','delete') then
    chain := chain || jsonb_build_object('step','employment_status','effect','deny','detail','Withheld while on ' || p.status || '.');
    decided := true;
  end if;

  if not decided then
    select sr.name into hit from user_roles ur join system_roles sr on sr.id = ur.system_role_id
      where ur.user_id = p_user and ur.starts_at <= now() and (ur.expires_at is null or ur.expires_at > now())
        and p_perm = any(sr.permissions) limit 1;
    if hit is not null then
      chain := chain || jsonb_build_object('step','role','effect','allow','detail','Comes with the role “' || hit || '”.');
      decided := true; result := true;
    end if;
  end if;

  if not decided then
    select d.name into hit from departments d where d.id = p.department_id and p_perm = any(d.default_permissions);
    if hit is not null then
      chain := chain || jsonb_build_object('step','department','effect','allow','detail','Default for the ' || hit || ' department.');
      decided := true; result := true;
    end if;
  end if;

  if not decided and exists (select 1 from role_defaults rd where rd.org_id = p.org_id and rd.level = p.role and p_perm = any(rd.permissions)) then
    chain := chain || jsonb_build_object('step','level_default','effect','allow','detail','Default for everyone at level ' || p.role || '.');
    decided := true; result := true;
  end if;

  if not decided and p.role = 'super_admin' then
    ceiling := admin_ceiling(p.org_id);
    if ceiling is null then
      chain := chain || jsonb_build_object('step','company_admin','effect','allow','detail','Company super admin, and the platform owner has set no limit for this company.');
      result := true;
    elsif p_perm = any(ceiling) then
      chain := chain || jsonb_build_object('step','company_admin','effect','allow','detail','Company super admin, and this key is inside the limit the platform owner set.');
      result := true;
    else
      chain := chain || jsonb_build_object('step','company_admin','effect','deny','detail','Company super admin, but the platform owner did not include this key in this company''s limit.');
    end if;
    decided := true;
  end if;

  if not decided then
    chain := chain || jsonb_build_object('step','default','effect','deny','detail','Nothing grants this. Access is denied unless it is granted.');
  end if;

  return jsonb_build_object('allowed', result, 'perm', p_perm, 'user_id', p_user, 'chain', chain);
end $$;

grant execute on function public.explain_permission(uuid, text) to authenticated;

-- Every key in the catalogue, with whether this person effectively holds it (§124).
create or replace function public.effective_permissions(p_user uuid default auth.uid())
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', pm.key, 'label', pm.label, 'grp', pm.grp, 'risk', pm.risk,
           'platform_only', pm.platform_only,
           'allowed', has_perm(pm.key, p_user)
         ) order by pm.position), '[]'::jsonb)
  from permissions pm
  where can_review_access(p_user)
$$;

grant execute on function public.effective_permissions(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- PREVIEW AS (§40-42)
--
-- A simulation, never a session. Nothing here signs anybody in as anybody else: it computes what
-- the target *would* see and hands it back to the reviewer to look at.
-- ---------------------------------------------------------------------------
create or replace function public.preview_user_access(p_user uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare p profiles%rowtype;
begin
  if not can_review_access(p_user) then
    raise exception 'You are not allowed to preview this person''s access.' using errcode = 'insufficient_privilege';
  end if;
  select * into p from profiles where id = p_user;
  if p.id is null then raise exception 'No such person.'; end if;

  return jsonb_build_object(
    'user', jsonb_build_object('id', p.id, 'name', p.full_name, 'role', p.role, 'designation', p.designation,
                               'status', p.status, 'department_id', p.department_id, 'org_id', p.org_id),
    'is_platform_owner', is_platform_owner_user(p_user),
    'permissions', effective_permissions(p_user),
    'screens', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from effective_screens(p_user) s), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('key', sr.key, 'name', sr.name, 'acting', ur.acting, 'expires_at', ur.expires_at))
                       from user_roles ur join system_roles sr on sr.id = ur.system_role_id
                       where ur.user_id = p_user and ur.starts_at <= now() and (ur.expires_at is null or ur.expires_at > now())), '[]'::jsonb),
    'overrides', coalesce((select jsonb_agg(jsonb_build_object('perm', po.perm, 'allowed', po.allowed, 'expires_at', po.expires_at, 'reason', po.reason))
                           from permission_overrides po
                           where po.user_id = p_user and (po.expires_at is null or po.expires_at > now())), '[]'::jsonb)
  );
end $$;

grant execute on function public.preview_user_access(uuid) to authenticated;

create or replace function public.preview_role_access(p_role uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare r system_roles%rowtype;
begin
  select * into r from system_roles where id = p_role;
  if r.id is null then raise exception 'No such role.'; end if;
  if not coalesce(
       is_platform_owner()
       or (auth.uid() is not null and r.org_id = current_org()
           and (has_perm('security.manage') or has_perm('people.manage') or has_perm('audit.read'))), false) then
    raise exception 'You are not allowed to review roles here.' using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'role', jsonb_build_object('id', r.id, 'key', r.key, 'name', r.name, 'base_level', r.base_level, 'description', r.description),
    'permissions', coalesce((select jsonb_agg(jsonb_build_object(
                                'key', pm.key, 'label', pm.label, 'grp', pm.grp, 'risk', pm.risk,
                                'allowed', pm.key = any(r.permissions)) order by pm.position)
                             from permissions pm where not pm.platform_only), '[]'::jsonb),
    'screens', to_jsonb(coalesce(r.screens, '{}')),
    'denied_screens', to_jsonb(coalesce(r.denied_screens, '{}')),
    'holders', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.full_name, 'designation', pr.designation))
                         from user_roles ur join profiles pr on pr.id = ur.user_id
                         where ur.system_role_id = p_role and (ur.expires_at is null or ur.expires_at > now())), '[]'::jsonb)
  );
end $$;

grant execute on function public.preview_role_access(uuid) to authenticated;

-- WHO CAN SEE THIS? — who holds a permission, and the reason each of them does (§64, §103).
create or replace function public.permission_holders(p_perm text)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'name', p.full_name, 'role', p.role, 'designation', p.designation,
           'department_id', p.department_id,
           'why', explain_permission(p.id, p_perm) -> 'chain' -> -1 ->> 'detail'
         ) order by p.full_name), '[]'::jsonb)
  from profiles p
  where p.org_id = current_org() and p.is_active
    and (is_platform_owner() or has_perm('security.manage') or has_perm('audit.read'))
    and has_perm(p_perm, p.id)
$$;

grant execute on function public.permission_holders(text) to authenticated;

-- ---------------------------------------------------------------------------
-- ROLE HISTORY (§49-51)
-- ---------------------------------------------------------------------------
create table if not exists public.system_role_versions (
  id             uuid primary key default gen_random_uuid(),
  system_role_id uuid not null references public.system_roles(id) on delete cascade,
  org_id         uuid,
  version        int not null,
  name           text,
  description    text,
  permissions    text[] not null default '{}',
  screens        text[] not null default '{}',
  denied_screens text[] not null default '{}',
  note           text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (system_role_id, version)
);

create index if not exists srv_role_idx on public.system_role_versions (system_role_id, version desc);

alter table public.system_role_versions enable row level security;

drop policy if exists srv_read on public.system_role_versions;
create policy srv_read on public.system_role_versions for select
  using (is_platform_owner() or (org_id = current_org() and (has_perm('security.manage') or has_perm('people.manage') or has_perm('audit.read'))));

-- Snapshot the configuration as it was *before* each change, so version N is what you roll back to.
create or replace function public.snapshot_system_role()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v int;
begin
  if old.permissions is not distinct from new.permissions
     and old.screens is not distinct from new.screens
     and old.denied_screens is not distinct from new.denied_screens
     and old.name is not distinct from new.name then
    return new;
  end if;
  select coalesce(max(version), 0) + 1 into v from system_role_versions where system_role_id = old.id;
  insert into system_role_versions (system_role_id, org_id, version, name, description, permissions, screens, denied_screens, created_by)
  values (old.id, old.org_id, v, old.name, old.description,
          coalesce(old.permissions, '{}'), coalesce(old.screens, '{}'), coalesce(old.denied_screens, '{}'), auth.uid());
  return new;
end $$;

drop trigger if exists trg_snapshot_system_role on public.system_roles;
create trigger trg_snapshot_system_role
  before update on public.system_roles
  for each row execute function public.snapshot_system_role();

-- ---------------------------------------------------------------------------
-- BEFORE / AFTER, AND WHO IT REACHES (§45, §46, §57, §113)
-- ---------------------------------------------------------------------------
create or replace function public.role_change_impact(p_role uuid, p_permissions text[])
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare r system_roles%rowtype; added text[]; removed text[];
begin
  select * into r from system_roles where id = p_role;
  if r.id is null then raise exception 'No such role.'; end if;
  if not coalesce(
       is_platform_owner()
       or (auth.uid() is not null and r.org_id = current_org()
           and (has_perm('security.manage') or has_perm('people.manage'))), false) then
    raise exception 'You are not allowed to review roles here.' using errcode = 'insufficient_privilege';
  end if;

  added   := array(select unnest(coalesce(p_permissions, '{}')) except select unnest(coalesce(r.permissions, '{}')));
  removed := array(select unnest(coalesce(r.permissions, '{}')) except select unnest(coalesce(p_permissions, '{}')));

  return jsonb_build_object(
    'role', jsonb_build_object('id', r.id, 'name', r.name),
    'granted', coalesce((select jsonb_agg(jsonb_build_object('key', pm.key, 'label', pm.label, 'risk', pm.risk) order by pm.position)
                         from permissions pm where pm.key = any(added)), '[]'::jsonb),
    'removed', coalesce((select jsonb_agg(jsonb_build_object('key', pm.key, 'label', pm.label, 'risk', pm.risk) order by pm.position)
                         from permissions pm where pm.key = any(removed)), '[]'::jsonb),
    'high_risk', coalesce((select jsonb_agg(pm.label) from permissions pm where pm.key = any(added) and pm.risk = 'high'), '[]'::jsonb),
    'missing_dependencies', coalesce((
       select jsonb_agg(distinct jsonb_build_object('permission', pm.label, 'needs', dep))
       from permissions pm cross join lateral unnest(pm.requires) dep
       where pm.key = any(coalesce(p_permissions, '{}')) and not (dep = any(coalesce(p_permissions, '{}')))
    ), '[]'::jsonb),
    'affected_count', (select count(*) from user_roles ur where ur.system_role_id = p_role and (ur.expires_at is null or ur.expires_at > now())),
    'affected', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.full_name, 'designation', pr.designation) order by pr.full_name)
                          from user_roles ur join profiles pr on pr.id = ur.user_id
                          where ur.system_role_id = p_role and (ur.expires_at is null or ur.expires_at > now())), '[]'::jsonb)
  );
end $$;

grant execute on function public.role_change_impact(uuid, text[]) to authenticated;

-- Put a role back to an earlier version — without it becoming a way around grant authority (§51).
create or replace function public.restore_system_role(p_role uuid, p_version int, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare r system_roles%rowtype; v system_role_versions%rowtype; perm text;
begin
  select * into r from system_roles where id = p_role;
  if r.id is null then raise exception 'No such role.'; end if;
  if not coalesce(is_platform_owner() or (r.org_id = current_org() and has_perm('security.manage')), false) then
    raise exception 'You are not allowed to restore a role configuration.' using errcode = 'insufficient_privilege';
  end if;
  select * into v from system_role_versions where system_role_id = p_role and version = p_version;
  if v.id is null then raise exception 'That version does not exist.'; end if;

  if not is_platform_owner() then
    foreach perm in array coalesce(v.permissions, '{}') loop
      if not (perm = any(coalesce(r.permissions, '{}'))) and not can_manage_permission(perm, r.org_id) then
        raise exception 'That version contains "%", which you are not allowed to grant.', perm using errcode = 'insufficient_privilege';
      end if;
    end loop;
  end if;

  update system_roles
     set permissions = v.permissions, screens = v.screens, denied_screens = v.denied_screens,
         name = coalesce(v.name, name), description = coalesce(v.description, description)
   where id = p_role;

  insert into permission_changes (org_id, subject, subject_id, before, after, reason, actor_id)
  values (r.org_id, 'role_restore', p_role::text, to_jsonb(r), to_jsonb(v),
          coalesce(p_reason, 'Restored version ' || p_version), auth.uid());

  return jsonb_build_object('ok', true, 'restored_version', p_version);
end $$;

grant execute on function public.restore_system_role(uuid, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- ACCESS REVIEW (§99-102)
-- ---------------------------------------------------------------------------
create or replace function public.access_review_board(p_org uuid default current_org())
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
begin
  if not coalesce(is_platform_owner() or (p_org = current_org() and (has_perm('security.manage') or has_perm('audit.read'))), false) then
    raise exception 'You are not allowed to review access here.' using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'high_risk', coalesce((
      select jsonb_agg(jsonb_build_object('permission', pm.key, 'label', pm.label,
               'holders', (select count(*) from profiles p where p.org_id = p_org and p.is_active and has_perm(pm.key, p.id)))
             order by pm.position)
      from permissions pm where pm.risk = 'high' and not pm.platform_only), '[]'::jsonb),
    'temporary', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', po.user_id, 'name', pr.full_name, 'permission', po.perm,
               'allowed', po.allowed, 'expires_at', po.expires_at, 'reason', po.reason) order by po.expires_at)
      from permission_overrides po join profiles pr on pr.id = po.user_id
      where pr.org_id = p_org and po.expires_at is not null and po.expires_at > now()), '[]'::jsonb),
    'acting_roles', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', ur.user_id, 'name', pr.full_name, 'role', sr.name, 'expires_at', ur.expires_at) order by ur.expires_at)
      from user_roles ur join profiles pr on pr.id = ur.user_id join system_roles sr on sr.id = ur.system_role_id
      where pr.org_id = p_org and (ur.acting or ur.expires_at is not null) and (ur.expires_at is null or ur.expires_at > now())), '[]'::jsonb),
    'orphaned', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', pr.id, 'name', pr.full_name, 'status', pr.status,
               'permissions', (select count(*) from permission_overrides po where po.user_id = pr.id and po.allowed)) order by pr.full_name)
      from profiles pr
      where pr.org_id = p_org and (not pr.is_active or pr.status in ('exited','suspended'))
        and exists (select 1 from permission_overrides po where po.user_id = pr.id and po.allowed
                      and (po.expires_at is null or po.expires_at > now()))), '[]'::jsonb),
    'company_limit', (select to_jsonb(c) from company_admin_limits c where c.org_id = p_org)
  );
end $$;

grant execute on function public.access_review_board(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Administrative reads are not anonymous reads.
--
-- Revoking from `anon` alone does nothing here: the privilege comes from the PUBLIC grant a new
-- function receives by default, not from a grant made to `anon`. Both have to go, and then
-- `authenticated` is granted back explicitly — the same shape `has_perm` already had.
-- ---------------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.can_review_access(uuid)',
    'public.explain_permission(uuid, text)',
    'public.effective_permissions(uuid)',
    'public.preview_user_access(uuid)',
    'public.preview_role_access(uuid)',
    'public.permission_holders(text)',
    'public.role_change_impact(uuid, text[])',
    'public.restore_system_role(uuid, integer, text)',
    'public.access_review_board(uuid)',
    'public.can_manage_permission(text, uuid)',
    'public.is_platform_owner_user(uuid)',
    'public.is_platform_owner()',
    'public.admin_ceiling(uuid)'
  ] loop
    execute format('revoke execute on function %s from public', fn);
    execute format('revoke execute on function %s from anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
