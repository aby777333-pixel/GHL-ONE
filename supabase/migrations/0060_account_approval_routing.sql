-- 0060 — A sign-up reaches the people who can admit it (§12, §20)
--
-- What was wrong: `handle_new_user()` creates the profile inactive and told nobody. The person
-- saw "Account awaiting activation" and waited; no department head, HR person or Super Admin ever
-- learnt that somebody was waiting. Three accounts had been sitting unseen. There was also nowhere
-- for the person to say which department they belong to, so even an administrator who stumbled on
-- the row had no idea whose colleague this was.
--
-- Two halves, and both were missing:
--   1. The request. `join_requests` records who is asking, which department they say they belong
--      to, what they do and a note. It is the person's own statement, never authority: it grants
--      nothing until somebody approves it.
--   2. The routing. `account_approvers()` names who may admit somebody into a given department —
--      the department's head and its department-head-level people, plus the company's HR and its
--      Super Admins, who bypass the hierarchy entirely and may admit anybody anywhere. Those are
--      the people the notifications go to.
--
-- The delegation is the point. Activation was only ever possible for `is_admin()` (director and
-- above) because `profile_guard()` silently reverts `is_active` for everybody else — and silently,
-- so a department head clicking Activate saw a success toast and nothing happened. `approve_account()`
-- is the sanctioned path: it checks the authority itself, then names the person it is admitting in
-- `ghl.account_approval` so the guard stands down for that row only (the idiom `apply_transfer`
-- already uses with `ghl.transfer_notified`). Nothing else about the guard changes, so no existing
-- update path gains anything.

-- ---------------------------------------------------------------------------
-- 1. The request
-- ---------------------------------------------------------------------------

create table if not exists join_requests (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default current_org() references organizations(id) on delete cascade,
  user_id        uuid not null references profiles(id) on delete cascade,
  department_id  uuid references departments(id) on delete set null,
  designation    text,
  note           text,
  status         text not null default 'pending',
  decided_by     uuid,
  decided_label  text,
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint join_requests_status_ck check (status in ('pending', 'approved', 'declined'))
);

create unique index if not exists join_requests_open_idx on join_requests (user_id) where status = 'pending';
create index if not exists join_requests_org_idx on join_requests (org_id, status);
create index if not exists join_requests_dept_idx on join_requests (department_id) where status = 'pending';

-- The company on the row is derived from the subject, never supplied (0050's rule): nobody can
-- file a request under a company they do not belong to.
create or replace function join_request_org_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.org_id := coalesce((select p.org_id from profiles p where p.id = new.user_id), new.org_id);
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists join_requests_org on join_requests;
create trigger join_requests_org before insert or update on join_requests
  for each row execute function join_request_org_default();

alter table join_requests enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Who may admit somebody
-- ---------------------------------------------------------------------------

-- May the caller admit `p_user`, into `p_department` (their own department when null)?
-- Company-wide authority is unchanged from what activation has always required — director and
-- above, HR, or the company Super Admin role — and the new branch is the delegation: the head of
-- the department being joined, and that department's own department-head-level people.
create or replace function can_approve_account(p_user uuid, p_department uuid default null)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_me      uuid := auth.uid();
  v_org     uuid;
  v_dept    uuid;
  v_my_role role_level;
  v_my_dept uuid;
begin
  if v_me is null or p_user is null then return false; end if;

  select p.org_id, coalesce(p_department, p.department_id) into v_org, v_dept
    from profiles p where p.id = p_user;
  if v_org is null then return false; end if;

  -- The approver must be an active member of the same company. Platform staff administer
  -- companies; they do not join them, so they are deliberately not approvers here.
  select p.role, p.department_id into v_my_role, v_my_dept
    from profiles p where p.id = v_me and p.org_id = v_org and p.is_active and not p.frozen;
  if v_my_role is null then return false; end if;

  -- Super Admin bypasses the hierarchy: any person, any department.
  if v_my_role = 'super_admin' or is_company_super_admin(v_me) then return true; end if;
  -- Director and above, and HR — exactly who could activate an account before this migration.
  if is_admin() or is_hr() then return true; end if;
  -- The department they are asking to join.
  if v_dept is not null and (
       exists (select 1 from departments d where d.id = v_dept and d.head_id = v_me)
       or (v_my_dept = v_dept and role_rank(v_my_role) <= role_rank('department_head'::role_level))
     ) then return true; end if;

  return false;
end $$;

-- The people a request for `p_department` should reach. Same rule as can_approve_account, read
-- the other way round, so the notification never goes to somebody who would then be refused.
create or replace function account_approvers(p_org uuid, p_department uuid default null)
returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id
    from profiles p
   where p.org_id = p_org
     and p.is_active and not p.frozen
     and (
       p.role = 'super_admin'
       or is_company_super_admin(p.id)
       or role_rank(p.role) <= role_rank('director'::role_level)
       or has_perm('people.manage', p.id)
       or has_perm('hr.manage', p.id)
       or (p_department is not null and (
             exists (select 1 from departments d where d.id = p_department and d.head_id = p.id)
             or (p.department_id = p_department and role_rank(p.role) <= role_rank('department_head'::role_level))
           ))
     )
$$;

-- Policies come after the helper they call.
drop policy if exists jr_self on join_requests;
create policy jr_self on join_requests for select to authenticated
  using (user_id = auth.uid());

drop policy if exists jr_review on join_requests;
create policy jr_review on join_requests for select to authenticated
  using (org_id = current_org() and can_approve_account(user_id, department_id));

drop policy if exists jr_self_insert on join_requests;
create policy jr_self_insert on join_requests for insert to authenticated
  with check (user_id = auth.uid());

-- No UPDATE or DELETE policy: a decision is taken through approve_account() / decline_account(),
-- which check the authority first. A request nobody can edit is the point of recording it.

-- ---------------------------------------------------------------------------
-- 3. The guard stands down for the sanctioned path
-- ---------------------------------------------------------------------------

-- Unchanged except for the first branch. `profile_guard` reverts `is_active` for every caller who
-- is not `is_admin()`, silently — which is why a department head could never admit anybody and was
-- never told so. `approve_account()` names the person it has just authorised in
-- `ghl.account_approval`; nothing else can set that (`set_config` is not reachable over PostgREST),
-- exactly as with `ghl.transfer_notified` in 0056.
create or replace function profile_guard() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if coalesce(current_setting('ghl.account_approval', true), '') = new.id::text then
    return new;
  end if;
  if auth.uid() = new.id and not is_admin() then
    new.role := old.role;
    new.is_active := old.is_active;
    new.department_id := old.department_id;
    new.manager_id := old.manager_id;
    new.org_id := old.org_id;
    new.is_external := old.is_external;
  elsif auth.uid() <> new.id and not is_admin() then
    new.role := old.role;
    new.is_active := old.is_active;
    new.org_id := old.org_id;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 4. A sign-up is announced
-- ---------------------------------------------------------------------------

-- Fires from inside `handle_new_user()`. A failure here must never fail the sign-up itself — the
-- person would be unable to register at all — so the whole fan-out is wrapped.
create or replace function notify_account_pending() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_target uuid;
  v_who    text;
begin
  -- Self sign-up only. An account created by an administrator (bulk import, employee wizard) has a
  -- session behind it, and the person who created it does not need telling that it exists.
  if auth.uid() is not null then return null; end if;

  v_who := coalesce(nullif(btrim(new.full_name), ''), new.email);
  begin
    for v_target in select approver from account_approvers(new.org_id, new.department_id) approver loop
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id)
      values (v_target, new.org_id, 'action_required',
              'New sign-up awaiting approval: ' || v_who,
              new.email || ' has created an account and cannot sign in until it is approved.',
              '/people/requests', 'signup', new.id);
    end loop;
  exception when others then
    null;
  end;
  return null;
end $$;

drop trigger if exists profiles_notify_pending on profiles;
create trigger profiles_notify_pending after insert on profiles
  for each row when (new.is_active is false) execute function notify_account_pending();

-- §20, unchanged but for the wording of a first approval: "reactivated" is wrong for an account
-- that has never been active, and approve_account() is the only caller that sets the flag.
create or replace function notify_account_change()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor    uuid := auth.uid();
  admin_id   uuid;
  became     boolean;
  ceased     boolean;
  from_dep   text;
  to_dep     text;
  v_approved boolean;
begin
  v_approved := coalesce(current_setting('ghl.account_approval', true), '') = new.id::text;

  if new.is_active is distinct from old.is_active then
    if new.id is distinct from v_actor then
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (new.id, new.org_id, 'security',
              case when v_approved then 'Your account has been approved'
                   when new.is_active then 'Your account has been reactivated'
                   else 'Your account has been deactivated' end,
              case when v_approved
                   then coalesce(person_name(v_actor) || ' approved your account. ', '')
                        || 'You can sign in to GHL ONE now.'
                   when new.is_active
                   then 'You can sign in again.'
                   else 'You will not be able to sign in. If this is unexpected, contact your manager or HR.' end,
              '/', 'profile', new.id, v_actor);
    end if;

    if not new.is_active then
      for admin_id in
        select p.id from profiles p
         where p.org_id = new.org_id and p.is_active
           and p.id is distinct from new.id and p.id is distinct from v_actor
           and (p.role = 'super_admin' or is_company_super_admin(p.id))
      loop
        insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
        values (admin_id, new.org_id, 'security',
                person_name(new.id) || '''s account was deactivated',
                case when v_actor is null then 'Deactivated by the system.' else 'Deactivated by ' || person_name(v_actor) || '.' end
                || ' Their work may need reassigning.',
                '/admin?tab=people', 'profile', new.id, v_actor);
      end loop;
    end if;
  end if;

  -- §33: a department move changes who you work with, what you see and who approves for you, so
  -- the person it happens to is told — unless `apply_transfer` has already claimed this one, or it
  -- is the department they were just admitted into (approve_account says so in its own notice).
  if new.department_id is distinct from old.department_id
     and new.id is distinct from v_actor
     and not v_approved
     and coalesce(current_setting('ghl.transfer_notified', true), '') is distinct from new.id::text
  then
    select name into from_dep from departments where id = old.department_id;
    select name into to_dep   from departments where id = new.department_id;
    insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (new.id, new.org_id, 'information',
            case when to_dep is null then 'You are no longer in a department'
                 else 'You have moved to ' || to_dep end,
            case when from_dep is null then '' else 'Previously ' || from_dep || '. ' end
            || case when v_actor is null then 'Changed by the system.' else 'Changed by ' || person_name(v_actor) || '.' end,
            '/people/' || new.id, 'profile', new.id, v_actor);
  end if;

  became := new.role = 'super_admin' and old.role is distinct from 'super_admin';
  ceased := old.role = 'super_admin' and new.role is distinct from 'super_admin';
  if became or ceased then
    for admin_id in
      select p.id from profiles p
       where p.org_id = new.org_id and p.is_active
         and p.id is distinct from new.id and p.id is distinct from v_actor
         and (p.role = 'super_admin' or is_company_super_admin(p.id))
    loop
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (admin_id, new.org_id, 'security',
              person_name(new.id) || (case when became then ' is now a Super Admin' else ' is no longer a Super Admin' end),
              case when v_actor is null then 'Changed by the system.' else 'Changed by ' || person_name(v_actor) || '.' end
              || ' Company-wide authority changed hands.',
              '/platform/access?tab=people', 'profile', new.id, v_actor);
    end loop;
  end if;

  return null;
end $$;

-- An account activated the old way (Admin → People → Activate) closes its open request too, so the
-- request list cannot keep showing somebody who is already inside.
create or replace function close_join_request_on_activation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update join_requests
     set status = 'approved',
         decided_by = coalesce(decided_by, auth.uid()),
         decided_label = coalesce(decided_label, person_name(auth.uid())),
         decided_at = coalesce(decided_at, now()),
         updated_at = now()
   where user_id = new.id and status = 'pending';
  return null;
end $$;

drop trigger if exists profiles_close_join_request on profiles;
create trigger profiles_close_join_request after update of is_active on profiles
  for each row when (old.is_active is false and new.is_active is true)
  execute function close_join_request_on_activation();

-- ---------------------------------------------------------------------------
-- 5. The person asks
-- ---------------------------------------------------------------------------

create or replace function request_account_activation(
  p_department uuid default null,
  p_designation text default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_prof   profiles%rowtype;
  v_dept   departments%rowtype;
  v_id     uuid;
  v_target uuid;
  v_who    text;
  v_n      int := 0;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  select * into v_prof from profiles where id = v_me;
  if v_prof.id is null then raise exception 'Your account is still being created. Try again in a moment.'; end if;
  if v_prof.is_active then return jsonb_build_object('ok', true, 'already_active', true); end if;

  if p_department is not null then
    select * into v_dept from departments where id = p_department and org_id = v_prof.org_id;
    if v_dept.id is null then raise exception 'Choose a department in your company.'; end if;
  end if;

  update join_requests
     set department_id = p_department,
         designation   = nullif(btrim(p_designation), ''),
         note          = nullif(btrim(p_note), ''),
         status        = 'pending',
         updated_at    = now()
   where user_id = v_me and status = 'pending'
   returning id into v_id;

  if v_id is null then
    insert into join_requests (org_id, user_id, department_id, designation, note)
    values (v_prof.org_id, v_me, p_department, nullif(btrim(p_designation), ''), nullif(btrim(p_note), ''))
    returning id into v_id;
  end if;

  v_who := coalesce(nullif(btrim(v_prof.full_name), ''), v_prof.email);
  for v_target in select approver from account_approvers(v_prof.org_id, p_department) approver loop
    if v_target = v_me then continue; end if;
    insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (v_target, v_prof.org_id, 'action_required',
            v_who || ' is asking to join ' || coalesce(v_dept.name, 'the company'),
            v_prof.email
              || coalesce(' · ' || nullif(btrim(p_designation), ''), '')
              || coalesce(' · ' || nullif(btrim(p_note), ''), ''),
            '/people/requests', 'signup', v_me, v_me);
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'request', v_id, 'notified', v_n);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Somebody answers
-- ---------------------------------------------------------------------------

create or replace function approve_account(
  p_user uuid,
  p_department uuid default null,
  p_role role_level default null,
  p_manager uuid default null,
  p_designation text default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me       uuid := auth.uid();
  v_prof     profiles%rowtype;
  v_req      join_requests%rowtype;
  v_dept     uuid;
  v_role     role_level;
  v_my_role  role_level;
  v_unbound  boolean;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  select * into v_prof from profiles where id = p_user;
  if v_prof.id is null then raise exception 'No such person.'; end if;

  select * into v_req from join_requests where user_id = p_user and status = 'pending' order by created_at desc limit 1;
  v_dept := coalesce(p_department, v_req.department_id, v_prof.department_id);

  if not can_approve_account(p_user, v_dept) then
    raise exception 'You are not allowed to approve this account. Ask a Super Admin, HR or the head of that department.';
  end if;
  if v_prof.is_active then return jsonb_build_object('ok', true, 'already_active', true); end if;

  select role into v_my_role from profiles where id = v_me;
  v_unbound := v_my_role = 'super_admin' or is_company_super_admin(v_me);
  v_role := coalesce(p_role, v_prof.role, 'employee'::role_level);

  -- Nobody admits somebody at a level above their own. A Super Admin is unbound, which is what
  -- "a Super Admin can bypass the hierarchy" means here.
  if not v_unbound and role_rank(v_role) < role_rank(v_my_role) then
    raise exception 'You cannot give somebody a level above your own.';
  end if;
  if v_dept is not null and not exists (select 1 from departments d where d.id = v_dept and d.org_id = v_prof.org_id) then
    raise exception 'That department is not in this company.';
  end if;
  if p_manager is not null and not exists (select 1 from profiles m where m.id = p_manager and m.org_id = v_prof.org_id and m.is_active) then
    raise exception 'That manager is not in this company.';
  end if;

  perform set_config('ghl.account_approval', p_user::text, true);
  update profiles
     set is_active     = true,
         department_id = coalesce(v_dept, department_id),
         manager_id    = coalesce(p_manager, manager_id),
         designation   = coalesce(nullif(btrim(p_designation), ''), nullif(btrim(v_req.designation), ''), designation),
         role          = v_role,
         joined_at     = coalesce(joined_at, current_date)
   where id = p_user;
  perform set_config('ghl.account_approval', '', true);

  update join_requests
     set status = 'approved', decided_by = v_me, decided_label = person_name(v_me),
         decided_at = now(), decision_note = nullif(btrim(p_note), ''), updated_at = now()
   where user_id = p_user and status = 'pending';

  return jsonb_build_object('ok', true, 'user', p_user, 'department', v_dept, 'role', v_role);
end $$;

create or replace function decline_account(p_user uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_prof profiles%rowtype;
  v_req  join_requests%rowtype;
  v_dept uuid;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  select * into v_prof from profiles where id = p_user;
  if v_prof.id is null then raise exception 'No such person.'; end if;
  if v_prof.is_active then raise exception 'That account is already active. Deactivate it from the people admin instead.'; end if;

  select * into v_req from join_requests where user_id = p_user and status = 'pending' order by created_at desc limit 1;
  v_dept := coalesce(v_req.department_id, v_prof.department_id);
  if not can_approve_account(p_user, v_dept) then
    raise exception 'You are not allowed to answer this request.';
  end if;

  if v_req.id is not null then
    update join_requests
       set status = 'declined', decided_by = v_me, decided_label = person_name(v_me),
           decided_at = now(), decision_note = nullif(btrim(p_reason), ''), updated_at = now()
     where id = v_req.id;
  end if;

  -- The account stays inactive and the person is told, so they can correct the department they
  -- named and ask again rather than staring at "awaiting activation" forever.
  insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
  values (p_user, v_prof.org_id, 'security',
          'Your access request was not approved',
          coalesce(nullif(btrim(p_reason), ''), 'No reason was given.')
            || ' You can correct the details and ask again.',
          '/pending', 'profile', p_user, v_me);

  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------------
-- 7. The list an approver works from
-- ---------------------------------------------------------------------------

-- Only rows the caller may actually act on: `can_approve_account` is the same gate the RPCs use,
-- so this can never show somebody a person they would then be refused. Accounts that were once
-- active and have since been deactivated are not sign-ups and are not listed (they carry an
-- employee code); those stay in Admin → People.
create or replace function pending_accounts()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by created_at), '[]'::jsonb)
    from (
      select p.created_at,
             jsonb_build_object(
               'id', p.id,
               'full_name', p.full_name,
               'email', p.email,
               'avatar_url', p.avatar_url,
               'role', p.role,
               'created_at', p.created_at,
               'department_id', coalesce(r.department_id, p.department_id),
               'department', d.name,
               'designation', coalesce(nullif(btrim(r.designation), ''), p.designation),
               'note', r.note,
               'requested_at', r.created_at,
               'asked', r.id is not null
             ) as x
        from profiles p
        left join lateral (
          select jr.* from join_requests jr
           where jr.user_id = p.id and jr.status = 'pending'
           order by jr.created_at desc limit 1
        ) r on true
        left join departments d on d.id = coalesce(r.department_id, p.department_id)
       where p.org_id = current_org()
         and not p.is_active
         and p.employee_code is null
         and can_approve_account(p.id, coalesce(r.department_id, p.department_id))
    ) s
$$;

-- `can_approve_accounts()` answers the screen gate: may this person see the requests page at all.
create or replace function can_approve_accounts()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select true from profiles p
     where p.id = auth.uid() and p.is_active and not p.frozen
       and (
         p.role = 'super_admin'
         or is_company_super_admin(p.id)
         or role_rank(p.role) <= role_rank('department_head'::role_level)
         or has_perm('people.manage', p.id)
         or has_perm('hr.manage', p.id)
         or exists (select 1 from departments d where d.org_id = p.org_id and d.head_id = p.id)
       )
  ), false)
$$;

-- 0045/0059: a definer function answers about the caller, and `anon` never reaches it.
revoke all on function can_approve_account(uuid, uuid) from public, anon;
revoke all on function account_approvers(uuid, uuid) from public, anon;
revoke all on function request_account_activation(uuid, text, text) from public, anon;
revoke all on function approve_account(uuid, uuid, role_level, uuid, text, text) from public, anon;
revoke all on function decline_account(uuid, text) from public, anon;
revoke all on function pending_accounts() from public, anon;
revoke all on function can_approve_accounts() from public, anon;

grant execute on function can_approve_account(uuid, uuid) to authenticated;
grant execute on function account_approvers(uuid, uuid) to authenticated;
grant execute on function request_account_activation(uuid, text, text) to authenticated;
grant execute on function approve_account(uuid, uuid, role_level, uuid, text, text) to authenticated;
grant execute on function decline_account(uuid, text) to authenticated;
grant execute on function pending_accounts() to authenticated;
grant execute on function can_approve_accounts() to authenticated;

grant select, insert on join_requests to authenticated;

-- ---------------------------------------------------------------------------
-- 8. The people already waiting
-- ---------------------------------------------------------------------------

-- Accounts that signed up before this migration were never announced. Announce them once, without
-- duplicating if this migration is re-run.
do $$
declare
  v_p profiles%rowtype;
  v_t uuid;
begin
  for v_p in
    select * from profiles
     where not is_active and employee_code is null
  loop
    for v_t in select approver from account_approvers(v_p.org_id, v_p.department_id) approver loop
      if exists (
        select 1 from notifications n
         where n.user_id = v_t and n.entity_type = 'signup' and n.entity_id = v_p.id
      ) then continue; end if;
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id)
      values (v_t, v_p.org_id, 'action_required',
              'Sign-up awaiting approval: ' || coalesce(nullif(btrim(v_p.full_name), ''), v_p.email),
              v_p.email || ' has been waiting since ' || to_char(v_p.created_at at time zone 'Asia/Kolkata', 'DD Mon') || '.',
              '/people/requests', 'signup', v_p.id);
    end loop;
  end loop;
end $$;
