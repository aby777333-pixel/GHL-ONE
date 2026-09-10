-- 0046 — A role can now take a permission away, and "why?" stops disagreeing with "may I?".
--
-- Two things, both in the role tier.
--
-- 1. ROLE-LEVEL DENY. Until now a role could only add. A "Restricted Contractor" role could not
--    remove `export` from someone whose department default grants it — you had to write an
--    individual override on every holder, one at a time, and remember to add one for each new
--    hire. `system_roles.denied_permissions` mirrors the `screens` / `denied_screens` pair the
--    same table already uses, so this is the schema's own idiom rather than a new mechanism.
--
--    Deny beats allow, as it does everywhere else here: an explicit deny on any held role
--    outranks an allow on another held role, the department default and the level default.
--
--    It sits BELOW the company-super-admin branch on purpose. If a role could bind the company's
--    top administrator, handing them a restrictive role would be a way to neuter the only person
--    who can fix it — and the last-Super-Admin guard would not catch it, because they would still
--    hold the role while being unable to use it. To bind a company super admin, use an individual
--    override or the platform owner's `company_admin_limits` ceiling. Both are deliberate acts.
--
--    Aliases resolve the way they must: denying the broad `delete` also denies `tasks.delete`
--    (`denied_permissions && keys` overlaps on the alias), while denying `tasks.delete` leaves the
--    broad `delete` alone, because the broad key's `keys` array does not contain the narrow one.
--
-- 2. A DRIFT FIX I CAUSED. 0040 taught `has_perm` to resolve a granular key through the broad key
--    it refines, and 0041 gave it the company-super-admin branch — but `explain_permission` was
--    left on exact-key matching and never learned either. It therefore answered "nothing grants
--    this" for all 76 granular keys while `has_perm` allowed them: `has_perm('people.view')` true,
--    `explain_permission(..., 'people.view')` false. The "why can/why not" answer is the thing
--    administrators trust when they are deciding whether access is correct, so a chain that
--    contradicts the decision is worse than no chain.
--
--    The fix is structural, not another copy of the logic: `explain_permission` now takes its
--    verdict straight from `has_perm`. The chain explains; `has_perm` decides. They cannot
--    disagree about the answer again, whatever happens to the narrative.

-- ------------------------------------------------------------------- storage
alter table public.system_roles
  add column if not exists denied_permissions text[] not null default '{}';
alter table public.system_role_versions
  add column if not exists denied_permissions text[] not null default '{}';

comment on column public.system_roles.denied_permissions is
  'Permissions this role takes away from its holders. Beats an allow on any other role, the department default and the level default. Does not bind a company super admin — use an individual override or company_admin_limits.';

-- ------------------------------------------------------------------ decision
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

  -- Role tier: deny first.
  if exists (
    select 1 from user_roles ur join system_roles sr on sr.id = ur.system_role_id
     where ur.user_id = p_user
       and ur.starts_at <= now() and (ur.expires_at is null or ur.expires_at > now())
       and sr.denied_permissions && keys
  ) then
    return false;
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

-- ----------------------------------------------------------------- the "why"
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
  v_alias text;
  keys text[];
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

  select legacy_alias into v_alias from permissions where key = p_perm;
  if v_alias is null or v_alias = p_perm then
    keys := array[p_perm];
    v_alias := null;
  else
    keys := array[p_perm, v_alias];
    chain := chain || jsonb_build_object('step','key','effect','allow',
      'detail', 'This key refines “' || v_alias || '”, so anything granting “' || v_alias || '” also grants it.');
  end if;

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
      decided := true;
    elsif v_alias is not null then
      select allowed into o from permission_overrides
        where user_id = p_user and perm = v_alias and (expires_at is null or expires_at > now())
        order by allowed limit 1;
      if found then
        chain := chain || jsonb_build_object('step','individual_override','effect', case when o then 'allow' else 'deny' end,
          'detail', (case when o then 'Granted to this person directly on “' else 'Explicitly denied for this person on “' end) || v_alias || '”.');
        decided := true;
      end if;
    end if;
  end if;

  if not decided and p.status in ('probation','intern') and keys && array['download','share_external','export'] then
    chain := chain || jsonb_build_object('step','employment_status','effect','deny','detail','Withheld while on ' || p.status || '.');
    decided := true;
  end if;
  if not decided and p.status in ('suspended','notice_period') and keys && array['share_external','export','delete'] then
    chain := chain || jsonb_build_object('step','employment_status','effect','deny','detail','Withheld while on ' || p.status || '.');
    decided := true;
  end if;

  if not decided and is_company_super_admin(p_user) then
    ceiling := admin_ceiling(p.org_id);
    if ceiling is null then
      chain := chain || jsonb_build_object('step','company_super_admin','effect','allow','detail','Holds the Company Super Admin role, and the platform owner has set no limit for this company.');
    elsif ceiling && keys then
      chain := chain || jsonb_build_object('step','company_super_admin','effect','allow','detail','Holds the Company Super Admin role, and this key is inside the limit the platform owner set.');
    else
      chain := chain || jsonb_build_object('step','company_super_admin','effect','deny','detail','Holds the Company Super Admin role, but the platform owner did not include this key in this company''s limit.');
    end if;
    decided := true;
  end if;

  if not decided then
    select sr.name into hit from user_roles ur join system_roles sr on sr.id = ur.system_role_id
      where ur.user_id = p_user and ur.starts_at <= now() and (ur.expires_at is null or ur.expires_at > now())
        and sr.denied_permissions && keys limit 1;
    if hit is not null then
      chain := chain || jsonb_build_object('step','role_deny','effect','deny',
        'detail','Taken away by the role “' || hit || '”. A deny on a role outranks an allow on any other role, the department default and the level default.');
      decided := true;
    end if;
  end if;

  if not decided then
    select sr.name into hit from user_roles ur join system_roles sr on sr.id = ur.system_role_id
      where ur.user_id = p_user and ur.starts_at <= now() and (ur.expires_at is null or ur.expires_at > now())
        and sr.permissions && keys limit 1;
    if hit is not null then
      chain := chain || jsonb_build_object('step','role','effect','allow','detail','Comes with the role “' || hit || '”.');
      decided := true;
    end if;
  end if;

  if not decided then
    select d.name into hit from departments d where d.id = p.department_id and d.default_permissions && keys;
    if hit is not null then
      chain := chain || jsonb_build_object('step','department','effect','allow','detail','Default for the ' || hit || ' department.');
      decided := true;
    end if;
  end if;

  if not decided and exists (select 1 from role_defaults rd where rd.org_id = p.org_id and rd.level = p.role and rd.permissions && keys) then
    chain := chain || jsonb_build_object('step','level_default','effect','allow','detail','Default for everyone at level ' || p.role || '.');
    decided := true;
  end if;

  if not decided and p.role = 'super_admin' then
    ceiling := admin_ceiling(p.org_id);
    if ceiling is null then
      chain := chain || jsonb_build_object('step','company_admin','effect','allow','detail','Super Admin level, and the platform owner has set no limit for this company.');
    elsif ceiling && keys then
      chain := chain || jsonb_build_object('step','company_admin','effect','allow','detail','Super Admin level, and this key is inside the limit the platform owner set.');
    else
      chain := chain || jsonb_build_object('step','company_admin','effect','deny','detail','Super Admin level, but the platform owner did not include this key in this company''s limit.');
    end if;
    decided := true;
  end if;

  if not decided then
    chain := chain || jsonb_build_object('step','default','effect','deny','detail','Nothing grants this. Access is denied unless it is granted.');
  end if;

  -- The verdict comes from the decision function itself, never from this narrative. They drifted
  -- apart once (0040 taught has_perm about aliases and left this behind); this makes that
  -- impossible to repeat — the worst a future change can do is leave the wording behind.
  return jsonb_build_object('allowed', has_perm(p_perm, p_user), 'perm', p_perm, 'user_id', p_user, 'chain', chain);
end $$;

-- ------------------------------------------------------------ role read/write
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
                                'allowed', pm.key = any(r.permissions),
                                'denied', pm.key = any(r.denied_permissions)) order by pm.position)
                             from permissions pm where not pm.platform_only), '[]'::jsonb),
    'screens', to_jsonb(coalesce(r.screens, '{}')),
    'denied_screens', to_jsonb(coalesce(r.denied_screens, '{}')),
    'denied_permissions', to_jsonb(coalesce(r.denied_permissions, '{}')),
    'holders', coalesce((select jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.full_name, 'designation', pr.designation))
                         from user_roles ur join profiles pr on pr.id = ur.user_id
                         where ur.system_role_id = p_role and (ur.expires_at is null or ur.expires_at > now())), '[]'::jsonb)
  );
end $$;

-- Version history has to carry the denies, or restoring a version would silently drop them.
create or replace function public.snapshot_system_role()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v int;
begin
  if old.permissions is not distinct from new.permissions
     and old.denied_permissions is not distinct from new.denied_permissions
     and old.screens is not distinct from new.screens
     and old.denied_screens is not distinct from new.denied_screens
     and old.name is not distinct from new.name then
    return new;
  end if;
  select coalesce(max(version), 0) + 1 into v from system_role_versions where system_role_id = old.id;
  insert into system_role_versions (system_role_id, org_id, version, name, description, permissions, denied_permissions, screens, denied_screens, created_by)
  values (old.id, old.org_id, v, old.name, old.description,
          coalesce(old.permissions, '{}'), coalesce(old.denied_permissions, '{}'),
          coalesce(old.screens, '{}'), coalesce(old.denied_screens, '{}'), auth.uid());
  return new;
end $$;

create or replace function public.restore_system_role(p_role uuid, p_version integer, p_reason text default null::text)
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

  -- Restoring must not become a way around the grant-authority rules. Only what the version ADDS
  -- is checked: restoring a version that denies more than today takes authority away, which needs
  -- no grant-authority of its own.
  if not is_platform_owner() then
    foreach perm in array coalesce(v.permissions, '{}') loop
      if not (perm = any(coalesce(r.permissions, '{}'))) and not can_manage_permission(perm, r.org_id) then
        raise exception 'That version contains "%", which you are not allowed to grant.', perm using errcode = 'insufficient_privilege';
      end if;
    end loop;
  end if;

  update system_roles
     set permissions = v.permissions, denied_permissions = coalesce(v.denied_permissions, '{}'),
         screens = v.screens, denied_screens = v.denied_screens,
         name = coalesce(v.name, name), description = coalesce(v.description, description)
   where id = p_role;

  insert into permission_changes (org_id, subject, subject_id, before, after, reason, actor_id)
  values (r.org_id, 'role_restore', p_role::text, to_jsonb(r), to_jsonb(v),
          coalesce(p_reason, 'Restored version ' || p_version), auth.uid());

  return jsonb_build_object('ok', true, 'restored_version', p_version);
end $$;
