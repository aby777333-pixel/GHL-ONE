-- 0043 — Permission scope: own / team / department / company.
--
-- `has_perm` answers *may you*. Scope answers *over whom*. They are separate questions and this
-- keeps them separate: nothing here grants a permission, and nothing here takes one away.
--
-- THE RULE THAT MAKES THIS SAFE: scope only ever NARROWS. With no rule configured the answer is
-- `company`, which is what the system does today, so adding this changes nothing until somebody
-- deliberately narrows something. That matters because authority in this codebase does not all
-- come from `has_perm`: `profiles`' update policy grants on `is_manager_plus() OR is_hr()`, and
-- managers do not hold `people.edit` at all. A scope check that returned false for "you hold no
-- such permission" would have taken profile editing away from every manager and director on
-- deploy. It returns `company` for them instead — no opinion — and the existing gate stands.
--
-- Resolution mirrors `has_perm`'s own precedence, most specific first:
--     user → role → department → level → company default → (nothing configured) company
-- The first source that has a rule decides. Within one source the WIDEST rule wins, because
-- holding two roles should give you the union of their reach, not the intersection.

create table if not exists public.permission_scopes (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  -- Who the rule is about. `subject_id` is a user id, a system_role id, a department id,
  -- a hierarchy level (`manager`), or '*' for the company default.
  subject        text not null check (subject in ('user','role','department','level','default')),
  subject_id     text not null,
  perm           text not null references public.permissions(key) on delete cascade,
  scope          text not null check (scope in ('own','team','department','company')),
  -- Only meaningful with scope = 'department'. Empty = "their own department"; non-empty =
  -- "these named departments", which is the brief's SELECTED DEPARTMENTS.
  department_ids uuid[] not null default '{}',
  reason         text,
  set_by         uuid references public.profiles(id) on delete set null,
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  unique (org_id, subject, subject_id, perm)
);

comment on table public.permission_scopes is
  'Narrows how far a permission reaches. Never grants and never denies — absence means company-wide, which is the historical behaviour.';

create index if not exists permission_scopes_lookup_idx
  on public.permission_scopes (org_id, perm, subject, subject_id);

alter table public.permission_scopes enable row level security;

-- Reading your own company's scope rules is part of understanding your own access.
create policy scope_read on public.permission_scopes
  for select using (org_id = current_org() and is_active_member());

-- Writing them is administering authority.
create policy scope_write on public.permission_scopes
  for all using (org_id = current_org() and (has_perm('access_control.manage') or has_perm('security.manage')))
        with check (org_id = current_org() and (has_perm('access_control.manage') or has_perm('security.manage')));

-- Same audit trail as every other authority change.
drop trigger if exists trg_log_permission_scopes on public.permission_scopes;
create trigger trg_log_permission_scopes
  after insert or delete or update on public.permission_scopes
  for each row execute function public.log_permission_change();

-- ------------------------------------------------------------------ resolution
create or replace function public.scope_rank(p_scope text)
returns int language sql immutable as $$
  select case p_scope when 'own' then 0 when 'team' then 1 when 'department' then 2 else 3 end;
$$;

/**
 * The reach of `p_perm` for `p_user`, as {scope, department_ids, source}.
 * `company` with source `default` means nothing narrows it — the historical answer.
 */
create or replace function public.permission_scope(p_perm text, p_user uuid default auth.uid())
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  p profiles%rowtype;
  r record;
  src text;
begin
  if p_user is null or p_perm is null then
    return jsonb_build_object('scope','company','department_ids','[]'::jsonb,'source','default');
  end if;
  select * into p from profiles where id = p_user;
  if p.id is null then
    return jsonb_build_object('scope','company','department_ids','[]'::jsonb,'source','default');
  end if;
  -- Platform owners are not inside any company's scope rules.
  if is_platform_owner_user(p_user) then
    return jsonb_build_object('scope','company','department_ids','[]'::jsonb,'source','platform_owner');
  end if;

  foreach src in array array['user','role','department','level','default'] loop
    select s.scope, s.department_ids into r
      from permission_scopes s
     where s.org_id = p.org_id
       and s.perm = p_perm
       and s.subject = src
       and (s.expires_at is null or s.expires_at > now())
       and (
         case src
           when 'user'       then s.subject_id = p_user::text
           when 'role'       then exists (
                                    select 1 from user_roles ur
                                     where ur.user_id = p_user
                                       and ur.system_role_id::text = s.subject_id
                                       and ur.starts_at <= now()
                                       and (ur.expires_at is null or ur.expires_at > now()))
           when 'department' then s.subject_id = p.department_id::text
           when 'level'      then s.subject_id = p.role::text
           else                   s.subject_id = '*'
         end
       )
     -- Within one source the widest rule wins: two roles should union, not intersect.
     order by scope_rank(s.scope) desc
     limit 1;
    if found then
      return jsonb_build_object(
        'scope', r.scope,
        'department_ids', to_jsonb(coalesce(r.department_ids, '{}'::uuid[])),
        'source', src);
    end if;
  end loop;

  return jsonb_build_object('scope','company','department_ids','[]'::jsonb,'source','default');
end $$;

/**
 * Is `p_target` (a person) within the caller's reach for `p_perm`?
 *
 * TRUE whenever nothing narrows the permission, which is why this is safe to add to an existing
 * policy: it can only ever turn a yes into a no once somebody configures a narrower scope.
 */
create or replace function public.in_scope_user(p_perm text, p_target uuid, p_user uuid default auth.uid())
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare sc jsonb; s text; ids uuid[]; me profiles%rowtype; t profiles%rowtype;
begin
  if p_target is null then return true; end if;
  sc := permission_scope(p_perm, p_user);
  s  := sc->>'scope';
  if s = 'company' then return true; end if;

  if p_user = p_target then return true; end if;      -- your own record is always within reach
  select * into me from profiles where id = p_user;
  select * into t  from profiles where id = p_target;
  if me.id is null or t.id is null then return false; end if;

  if s = 'own' then return false; end if;
  if s = 'team' then
    return me.team_id is not null and t.team_id is not distinct from me.team_id;
  end if;

  -- department
  ids := array(select (jsonb_array_elements_text(sc->'department_ids'))::uuid);
  if array_length(ids, 1) is null then
    return t.department_id is not null and t.department_id is not distinct from me.department_id;
  end if;
  return t.department_id = any(ids);
end $$;

/** The same question about a department rather than a person — for wiring resource scope later. */
create or replace function public.in_scope_department(p_perm text, p_dept uuid, p_user uuid default auth.uid())
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare sc jsonb; s text; ids uuid[]; me profiles%rowtype;
begin
  if p_dept is null then return true; end if;
  sc := permission_scope(p_perm, p_user);
  s  := sc->>'scope';
  if s = 'company' then return true; end if;
  select * into me from profiles where id = p_user;
  if me.id is null then return false; end if;
  if s in ('own','team') then return p_dept is not distinct from me.department_id; end if;
  ids := array(select (jsonb_array_elements_text(sc->'department_ids'))::uuid);
  if array_length(ids, 1) is null then return p_dept is not distinct from me.department_id; end if;
  return p_dept = any(ids);
end $$;

revoke all on function public.permission_scope(text, uuid) from public, anon;
revoke all on function public.in_scope_user(text, uuid, uuid) from public, anon;
revoke all on function public.in_scope_department(text, uuid, uuid) from public, anon;
grant execute on function public.permission_scope(text, uuid) to authenticated;
grant execute on function public.in_scope_user(text, uuid, uuid) to authenticated;
grant execute on function public.in_scope_department(text, uuid, uuid) to authenticated;

-- ----------------------------------------------------------------- enforcement
/*
  The one place scope actually bites today, and the reason it was worth building: a Design manager
  could edit an IT employee's record, because the policy asks only "are you a manager or HR". It
  now also asks whether that person is within your reach for `people.edit`. With no scope rule
  configured that is company-wide and the policy behaves exactly as before.

  This is RLS, not a hidden button — typing the id into a request is checked by the same rule.
*/
drop policy if exists profile_admin_update on public.profiles;
create policy profile_admin_update on public.profiles
  for update using (
    org_id = current_org()
    and (is_manager_plus() or is_hr())
    and in_scope_user('people.edit', id)
  );
