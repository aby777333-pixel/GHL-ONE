-- 0056 — the last two gaps: who may preview another person's menu, and telling someone their
-- department changed.
--
-- PART 1. `effective_screens(uuid)` answered for anybody, to anybody.
--
-- It is SECURITY DEFINER, granted to `authenticated`, and had no check of its own. Any signed-in
-- person could pass someone else's id and read their entire menu — every screen, whether it is
-- allowed, and the REASON for each ("individual override", "role rule", "department default").
-- That is a map of how a company governs its people, and it did not test the company either, so
-- the id could belong to a different tenant entirely.
--
-- Found while wiring the View As preview (§13), which needs exactly this call for another person —
-- so the question "who may ask this about whom" had to be answered before using it.
--
-- Self stays open and unconditional: `can_view_screen()` and `proxy.ts` call it for the caller on
-- every governed request, and that path must not acquire a new way to fail. Verified: self works
-- for every active person, an administrator may still inspect a colleague (the HR employee record
-- and the screen-governance admin both need it), and an ordinary employee is refused for anybody
-- but themselves.
create or replace function public.effective_screens(p_user uuid default auth.uid())
returns table(key text, label text, path text, grp text, allowed boolean, source text, sort_order integer)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare p profiles%rowtype; lvl role_level;
begin
  select * into p from profiles where id = p_user;
  if p.id is null then return; end if;

  -- Asking about yourself is always allowed. Asking about somebody else is an administrative act:
  -- it must be inside your own company, and you must be one of the people who administers them.
  if p_user is distinct from auth.uid() and not is_platform_owner() then
    if p.org_id is distinct from current_org()
       or not (is_hr() or is_manager_of(p_user)
               or has_admin_perm('security.manage') or has_admin_perm('access_control.view')
               or has_admin_perm('system.manage') or is_primary_admin())
    then
      raise exception 'You are not allowed to see which screens % can open.', person_name(p_user)
        using errcode = 'insufficient_privilege';
    end if;
  end if;

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
    )
    -- §25: entitlement AND permission. Never a tier of its own.
    and (s.feature_key is null or org_feature_enabled(s.feature_key, p.org_id))
    as allowed,
    case
      when s.feature_key is not null and not org_feature_enabled(s.feature_key, p.org_id)
        then 'feature_disabled'
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
end $function$;

-- ---------------------------------------------------------------------------------------------
-- PART 2. A department change made outside the transfer flow told nobody.
--
-- 0052 covered role grants, individual permissions and accounts, and deliberately left department
-- changes alone: `apply_transfer` already notifies the subject, and a trigger could not tell
-- whether that RPC was driving the update, so adding one would have double-notified the sanctioned
-- path. The consequence was that a department changed through bulk import or straight on the
-- employee record — both ordinary things to do — reached the person not at all.
--
-- Reconciled by making `apply_transfer` say so rather than by guessing: it sets a
-- transaction-local flag naming the person it is about to notify itself, and the trigger stands
-- down for that person only. Verified: a direct edit sends exactly one notice, and a transfer
-- still sends exactly one (its own, carrying the stated reason).
-- ---------------------------------------------------------------------------------------------
create or replace function public.apply_transfer(p_transfer uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare t employee_transfers%rowtype; o uuid;
begin
  select * into t from employee_transfers where id = p_transfer;
  if t.id is null then raise exception 'not found'; end if;
  if not (is_admin() or has_admin_perm('hr.manage') or has_admin_perm('people.manage')) then raise exception 'forbidden'; end if;
  o := t.org_id;
  -- Tell the profiles trigger to stand down: this function sends its own, better message below,
  -- with the reason the transfer recorded. Transaction-local, so it cannot leak into another
  -- statement or another session.
  perform set_config('ghl.transfer_notified', t.user_id::text, true);
  update profiles set department_id = t.to_department_id, manager_id = coalesce(t.to_manager_id, manager_id), team_id = t.to_team_id where id = t.user_id;
  delete from channel_members cm using channels c where cm.channel_id = c.id and cm.user_id = t.user_id and c.type = 'department' and c.department_id = t.from_department_id;
  insert into channel_members (channel_id, user_id) select c.id, t.user_id from channels c where c.type = 'department' and c.department_id = t.to_department_id and not c.archived on conflict do nothing;
  update access_grants set revoked_at = now(), revoked_by = auth.uid() where user_id = t.user_id and resource_type = 'department' and resource_id = t.from_department_id and revoked_at is null;
  update employee_transfers set status = 'applied', applied_at = now(), approved_by = coalesce(approved_by, auth.uid()) where id = p_transfer;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, old_value, new_value)
  values (o, auth.uid(), 'people.transferred', 'profile', t.user_id, person_name(t.user_id) || ' → ' || (select name from departments where id = t.to_department_id), jsonb_build_object('department_id', t.from_department_id, 'manager_id', t.from_manager_id), jsonb_build_object('department_id', t.to_department_id, 'manager_id', t.to_manager_id));
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
  values (t.user_id, 'information', 'You have moved to ' || (select name from departments where id = t.to_department_id), coalesce(t.reason, ''), '/people/' || t.user_id, 'profile', t.user_id, auth.uid());
  if exists (select 1 from workflow_templates where org_id = o and key = 'transfer' and active) then perform start_workflow('transfer', t.user_id, jsonb_build_object('transfer_id', t.id)); end if;
end $function$;

create or replace function public.notify_account_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor  uuid := auth.uid();
  admin_id uuid;
  became   boolean;
  ceased   boolean;
  from_dep text;
  to_dep   text;
begin
  if new.is_active is distinct from old.is_active then
    if new.id is distinct from v_actor then
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (new.id, new.org_id, 'security',
              case when new.is_active then 'Your account has been reactivated' else 'Your account has been deactivated' end,
              case when new.is_active
                   then 'You can sign in again.'
                   else 'You will not be able to sign in. If this is unexpected, contact your manager or HR.' end,
              '/profile', 'profile', new.id, v_actor);
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

  -- §20: a department move changes who you work with, what you see and who approves for you, so
  -- the person it happens to is told — unless `apply_transfer` has already claimed this one.
  if new.department_id is distinct from old.department_id
     and new.id is distinct from v_actor
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
end $function$;

-- The WHEN clause has to admit department changes now, or the function is never entered for them.
drop trigger if exists trg_notify_account_change on public.profiles;
create trigger trg_notify_account_change
  after update on public.profiles
  for each row
  when (old.is_active is distinct from new.is_active
        or old.role is distinct from new.role
        or old.department_id is distinct from new.department_id)
  execute function public.notify_account_change();
