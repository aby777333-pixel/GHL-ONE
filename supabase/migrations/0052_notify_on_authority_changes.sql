-- 0052 — §20: tell people when their authority changes.
--
-- `user_roles` and `permission_overrides` carried guard, history and org triggers and notified
-- nobody. Somebody could be given — or quietly stripped of — a security role and never be told,
-- and the company's own administrators would not hear that a high-risk permission had been handed
-- out unless they went looking in the audit log. The only table in this area that notified
-- anything was `admin_assignments`, the legacy path, which has no holders at all.
--
-- Two audiences, per §20:
--   * the SUBJECT, always — it is their access that changed, and the standing principle here is
--     that everything an employee's data shows is visible to the employee too.
--   * the company's other super admins, for SENSITIVE changes only — a role granting a high-risk
--     permission, a high-risk individual override, an account switched off, or company-wide
--     authority changing hands. The actor is never notified of their own action, and the subject
--     is never told twice.
--
-- "Sensitive" is not a judgement call: it is whether the catalogue marks the key `risk = 'high'`.
--
-- Deliberately NOT covered: a plain department change. `apply_transfer` already notifies the
-- subject and a trigger cannot tell whether that RPC is driving the update, so adding one here
-- would double-notify the sanctioned path. A department change made outside the transfer flow
-- therefore still notifies nobody — a known gap, recorded rather than papered over.
--
-- Notifications fan out to web push automatically via `notification_push_fanout()`, so inserting
-- the row is the whole delivery mechanism; nothing here calls out to anything.

create or replace function public.notify_role_grant()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r        system_roles%rowtype;
  v_row    user_roles%rowtype;
  v_org    uuid;
  v_sens   boolean;
  v_actor  uuid := auth.uid();
  admin_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  select * into r from system_roles where id = v_row.system_role_id;
  if r.id is null then return null; end if;
  v_org := v_row.org_id;

  -- "Sensitive" is not a judgement call: it is whether the role hands over a key the catalogue
  -- itself marks high risk.
  v_sens := exists (select 1 from permissions pm where pm.key = any(r.permissions) and pm.risk = 'high');

  if tg_op = 'INSERT' then
    if v_row.user_id is distinct from v_actor then
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (v_row.user_id, v_org, 'security',
              'You were given the "' || r.name || '" security role',
              case when v_actor is null then 'Assigned by the system.' else person_name(v_actor) || ' assigned it.' end
                || case when v_row.expires_at is not null
                        then ' It expires on ' || to_char(v_row.expires_at at time zone 'Asia/Kolkata', 'DD Mon YYYY') || '.'
                        else '' end
                || ' A role decides what you can do — open Access Control to see exactly what it grants.',
              '/platform/access?tab=people', 'user_role', v_row.id, v_actor);
    end if;

  elsif tg_op = 'DELETE' then
    if v_row.user_id is distinct from v_actor then
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (v_row.user_id, v_org, 'security',
              'The "' || r.name || '" security role was removed',
              'You may still be able to do some of the same things: the same permission can also come from your department, your level or another role.',
              '/platform/access?tab=people', 'user_role', v_row.id, v_actor);
    end if;

  else
    -- Only an expiry move is worth a message; acting flags and reasons are not the holder's concern.
    if new.expires_at is distinct from old.expires_at and new.user_id is distinct from v_actor then
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (new.user_id, v_org, 'security',
              case when new.expires_at is null
                   then 'Your "' || r.name || '" role no longer expires'
                   else 'Your "' || r.name || '" role now expires ' || to_char(new.expires_at at time zone 'Asia/Kolkata', 'DD Mon YYYY') end,
              null, '/platform/access?tab=people', 'user_role', new.id, v_actor);
    end if;
    return null;
  end if;

  if v_sens then
    for admin_id in
      select p.id from profiles p
       where p.org_id = v_org and p.is_active
         and p.id is distinct from v_row.user_id
         and p.id is distinct from v_actor
         and (p.role = 'super_admin' or is_company_super_admin(p.id))
    loop
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (admin_id, v_org, 'security',
              case when tg_op = 'INSERT'
                   then person_name(v_row.user_id) || ' was given "' || r.name || '"'
                   else person_name(v_row.user_id) || ' lost "' || r.name || '"' end,
              'That role carries a high-risk permission. ' ||
              case when v_actor is null then 'Changed by the system.' else 'Changed by ' || person_name(v_actor) || '.' end,
              '/platform/access?tab=review', 'user_role', v_row.id, v_actor);
    end loop;
  end if;

  return null;
end $function$;

create or replace function public.notify_override_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row    permission_overrides%rowtype;
  v_label  text;
  v_risk   text;
  v_actor  uuid := auth.uid();
  v_title  text;
  v_body   text;
  admin_id uuid;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  select coalesce(label, v_row.perm), risk into v_label, v_risk from permissions where key = v_row.perm;
  v_label := coalesce(v_label, v_row.perm);

  if tg_op = 'DELETE' then
    v_title := 'The individual rule on "' || v_label || '" was removed';
    v_body  := 'Your access to this now follows your roles, your department and your level again — which may mean you still have it.';
  elsif v_row.allowed then
    v_title := 'You were granted "' || v_label || '"';
    v_body  := 'This was given to you personally, on top of whatever your roles allow.'
               || case when v_row.expires_at is not null
                       then ' It expires on ' || to_char(v_row.expires_at at time zone 'Asia/Kolkata', 'DD Mon YYYY') || '.' else '' end;
  else
    v_title := '"' || v_label || '" was taken away from you';
    v_body  := 'This is set on you personally and beats anything your roles allow.';
  end if;
  if v_row.reason is not null and length(trim(v_row.reason)) > 0 then
    v_body := v_body || ' Reason given: ' || v_row.reason;
  end if;

  if v_row.user_id is distinct from v_actor then
    insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (v_row.user_id, v_row.org_id, 'security', v_title, v_body,
            '/platform/access?tab=people', 'permission_override', v_row.id, v_actor);
  end if;

  -- High-risk keys are the ones the company's administrators should hear about without asking.
  if v_risk = 'high' and tg_op <> 'DELETE' then
    for admin_id in
      select p.id from profiles p
       where p.org_id = v_row.org_id and p.is_active
         and p.id is distinct from v_row.user_id
         and p.id is distinct from v_actor
         and (p.role = 'super_admin' or is_company_super_admin(p.id))
    loop
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (admin_id, v_row.org_id, 'security',
              person_name(v_row.user_id) || (case when v_row.allowed then ' was granted "' else ' was denied "' end) || v_label || '"',
              'A high-risk permission was set on one person. '
              || case when v_actor is null then 'Changed by the system.' else 'Changed by ' || person_name(v_actor) || '.' end,
              '/platform/access?tab=review', 'permission_override', v_row.id, v_actor);
    end loop;
  end if;

  return null;
end $function$;

-- The account switch, and crossing into or out of company-wide authority.
--
-- The subject is told about their own account. The company's OTHER super admins are told when
-- somebody becomes or stops being one — that is §20's "admin access granted / revoked", and it is
-- the change nobody currently hears about. The subject is deliberately not told about their own
-- level change here, because `apply_role_change` already does that and this must not double up.
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

drop trigger if exists trg_notify_role_grant on public.user_roles;
create trigger trg_notify_role_grant
  after insert or update or delete on public.user_roles
  for each row execute function public.notify_role_grant();

drop trigger if exists trg_notify_override_change on public.permission_overrides;
create trigger trg_notify_override_change
  after insert or update or delete on public.permission_overrides
  for each row execute function public.notify_override_change();

-- The WHEN clause keeps this out of the way of ordinary profile edits entirely: the function is
-- not even entered unless one of the two columns actually moved.
drop trigger if exists trg_notify_account_change on public.profiles;
create trigger trg_notify_account_change
  after update on public.profiles
  for each row
  when (old.is_active is distinct from new.is_active or old.role is distinct from new.role)
  execute function public.notify_account_change();

revoke all on function public.notify_role_grant()      from public, anon;
revoke all on function public.notify_override_change() from public, anon;
revoke all on function public.notify_account_change()  from public, anon;

-- §20 has the same failure mode as every other control here: a trigger that quietly stops being
-- attached looks exactly like a system where nothing is happening. Assert the three are on.
create or replace function public.test_delegation()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare checks jsonb := '[]'::jsonb; k text; n int; bad text[] := '{}';
begin
  if not selftest_allowed() then raise exception 'forbidden'; end if;

  foreach k in array delegation_enforced_permissions() loop
    select count(*) into n from pg_policies
     where schemaname = 'public'
       and (coalesce(qual,'') || coalesce(with_check,'')) like '%' || k || '%';
    if n = 0 then bad := bad || k; end if;
  end loop;
  checks := checks || jsonb_build_object('name', 'delegation:keys_enforced', 'ok', cardinality(bad) = 0,
    'detail', case when cardinality(bad) = 0
                   then 'Every administrative key gates a policy: ' || array_to_string(delegation_enforced_permissions(), ', ') || '.'
                   else 'These keys name a capability but gate nothing, so granting or revoking them changes nothing: ' || array_to_string(bad, ', ') end);

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename in ('system_roles','user_roles','permission_overrides')
     and (coalesce(qual,'') || coalesce(with_check,'')) ~ '\mis_admin\(\)';
  checks := checks || jsonb_build_object('name', 'delegation:authority_not_from_rank', 'ok', n = 0,
    'detail', case when n = 0
                   then 'No policy on system_roles, user_roles or permission_overrides grants on is_admin() - authority comes from keys, not rank.'
                   else n || ' policy(ies) on the authority tables still grant on is_admin(), so a job level confers role administration.' end);

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'system_roles' and cmd in ('INSERT','UPDATE','DELETE');
  checks := checks || jsonb_build_object('name', 'delegation:role_commands_separate', 'ok', n >= 3,
    'detail', case when n >= 3 then 'Creating, editing and deleting a role are gated separately.'
                   else 'system_roles has fewer than three write policies - create/edit/delete cannot be delegated apart.' end);

  -- §20: a silent authority change is indistinguishable from no authority change.
  select coalesce(array_agg(x order by x), '{}'::text[]) into bad
    from (values ('user_roles','trg_notify_role_grant'),
                 ('permission_overrides','trg_notify_override_change'),
                 ('profiles','trg_notify_account_change')) as v(tbl, trg),
         lateral (select v.tbl || '.' || v.trg as x) s
   where not exists (
     select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal and c.relname = v.tbl and t.tgname = v.trg);
  checks := checks || jsonb_build_object('name', 'delegation:authority_changes_notify', 'ok', cardinality(bad) = 0,
    'detail', case when cardinality(bad) = 0
                   then 'Being given or losing a role, an individual permission or an account is announced to the person it happens to.'
                   else 'These notification triggers are missing, so the change would happen silently: ' || array_to_string(bad, ', ') end);

  return selftest_result(checks);
end $function$;
