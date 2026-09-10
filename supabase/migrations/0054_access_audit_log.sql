-- 0054 — §18: Access Control → Audit Log.
--
-- Everything §18 asks to track was already being written, across four tables that nothing read:
-- `permission_changes` (what a role, a level or a person may do), `config_history` (roles assigned
-- and revoked, roles created and deleted, screen rules), `role_history` (level, title, status and
-- department moves) and `audit_logs`. Not one of them was referenced anywhere in `src/`.
--
-- Two defects had to be fixed before a read side was worth building, because a log that cannot
-- answer "who did this" or that can be edited is not an audit trail.

-- ---------------------------------------------------------------------------------------------
-- 1. The actor has to outlive the person.
--
-- `permission_changes.actor_id`, `config_history.actor_id` and `role_history.changed_by` were all
-- `REFERENCES profiles(id) ON DELETE SET NULL`. Delete a person and every authority change they
-- ever made loses its actor: the record survives, the accountability does not.
--
-- Same defect 0044 fixed on `audit_logs`, and worse here than it was there. On `audit_logs` the
-- append-only trigger turned it into a loud failure — nobody could be deleted at all. These three
-- have no such trigger, so the deletion succeeds and the trail is silently hollowed out.
-- ---------------------------------------------------------------------------------------------
alter table public.permission_changes add column if not exists actor_label text;
alter table public.config_history     add column if not exists actor_label text;
alter table public.role_history       add column if not exists actor_label text;

update public.permission_changes h set actor_label = person_name(h.actor_id)
 where h.actor_label is null and h.actor_id is not null;
update public.config_history h set actor_label = person_name(h.actor_id)
 where h.actor_label is null and h.actor_id is not null;
update public.role_history h set actor_label = person_name(h.changed_by)
 where h.actor_label is null and h.changed_by is not null;

-- The branches read their own table's column. Writing this as
--   `case when tg_table_name = 'role_history' then new.changed_by else new.actor_id end`
-- raises `record "new" has no field "changed_by"` on the other two tables however the condition
-- evaluates: plpgsql resolves a record field against the row's REAL composite type before the CASE
-- picks a branch. Exactly the trap 0041 documented for `log_permission_change()`, and it broke
-- every authority write until the round-trip probe caught it.
create or replace function public.history_actor_label()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_actor uuid;
begin
  if tg_table_name = 'role_history' then
    v_actor := new.changed_by;
  else
    v_actor := new.actor_id;
  end if;

  if new.actor_label is null and v_actor is not null then
    new.actor_label := person_name(v_actor);
  end if;
  if new.actor_label is null then
    new.actor_label := 'System';
  end if;
  return new;
end $$;

drop trigger if exists trg_permission_changes_actor on public.permission_changes;
create trigger trg_permission_changes_actor before insert on public.permission_changes
  for each row execute function public.history_actor_label();

drop trigger if exists trg_config_history_actor on public.config_history;
create trigger trg_config_history_actor before insert on public.config_history
  for each row execute function public.history_actor_label();

drop trigger if exists trg_role_history_actor on public.role_history;
create trigger trg_role_history_actor before insert on public.role_history
  for each row execute function public.history_actor_label();

-- The pointer goes; `actor_id` stays as a plain uuid so a live person can still be linked to, but
-- the record no longer depends on that person continuing to exist.
alter table public.permission_changes drop constraint if exists permission_changes_actor_id_fkey;
alter table public.config_history     drop constraint if exists config_history_actor_id_fkey;
alter table public.role_history       drop constraint if exists role_history_changed_by_fkey;

revoke all on function public.history_actor_label() from public, anon;

-- ---------------------------------------------------------------------------------------------
-- 2. `role_history` had the same shape as the hole 0050 closed.
--
-- No `org_id`, and `rh_read` was `user_id = auth.uid() OR is_hr() OR is_manager_of(user_id)`. The
-- middle branch is row-independent — `is_hr()` asks nothing about the row being read — so once it
-- is true it is true for every row in the table, in every company. An HR person in one company
-- could read another company's promotions, demotions, department moves and the reasons given.
-- ---------------------------------------------------------------------------------------------
alter table public.role_history add column if not exists org_id uuid references public.organizations(id) on delete cascade;

update public.role_history h set org_id = p.org_id
  from public.profiles p where p.id = h.user_id and h.org_id is null;

create or replace function public.role_history_org_default()
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

drop trigger if exists trg_role_history_org on public.role_history;
create trigger trg_role_history_org before insert on public.role_history
  for each row execute function public.role_history_org_default();

create index if not exists role_history_org_idx on public.role_history(org_id);

drop policy if exists rh_read on public.role_history;
create policy rh_read on public.role_history for select using (
  org_id = current_org()
  and (user_id = auth.uid() or is_hr() or is_manager_of(user_id)
       or has_admin_perm('audit.read') or has_admin_perm('access_control.view'))
);

revoke all on function public.role_history_org_default() from public, anon;

create or replace function public.authority_tables()
returns text[]
language sql
immutable
as $$
  select array['user_roles','permission_overrides','permission_scopes','system_roles',
               'role_defaults','permission_changes','system_role_versions','role_history'];
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. The feed.
--
-- One log, already put into words, filterable the way §18 lists: user, admin, role, permission,
-- date, action.
--
-- SECURITY DEFINER with ONE explicit gate, rather than SECURITY INVOKER, because the source tables
-- have three different audiences: `pc_read` wants audit.read/security.manage, `ch_read` also
-- admits `is_admin()`, `rh_read` admits HR and a person's own manager. Running under those policies
-- would produce a ragged feed where a manager saw a promotion but not the permission change that
-- came with it. The audience for this log is whoever may review access, so that is asked once,
-- here, and every branch is scoped to the caller's company.
--
-- `person_id` and `role_id` are separate from `target_id` on purpose. The first draft filtered on
-- the display target, which for a role assignment is the `user_roles` ROW id, not the person —
-- filtering by person returned nothing for exactly the events an administrator most wants to
-- trace. Display and filtering are different jobs.
-- ---------------------------------------------------------------------------------------------
drop function if exists public.access_audit(timestamptz, timestamptz, uuid, uuid, uuid, text, text, integer, integer);

create function public.access_audit(
  p_from    timestamptz default null,
  p_to      timestamptz default null,
  p_actor   uuid    default null,
  p_person  uuid    default null,
  p_role    uuid    default null,
  p_perm    text    default null,
  p_action  text    default null,
  p_limit   integer default 100,
  p_offset  integer default 0
)
returns table(
  at timestamptz, actor text, actor_id uuid, action text,
  target text, target_kind text, person_id uuid, role_id uuid,
  added text[], removed text[], summary text, reason text
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_org uuid := current_org();
begin
  if not (is_platform_owner()
          or has_perm('audit.read') or has_perm('security.manage') or has_perm('access_control.view')) then
    raise exception 'You are not allowed to read the access audit log.' using errcode = 'insufficient_privilege';
  end if;

  return query
  with rows as (
    select
      pc.at,
      coalesce(pc.actor_label, 'System') as actor,
      pc.actor_id,
      case pc.subject
        when 'role'  then 'role_permissions'
        when 'level' then 'level_permissions'
        when 'user'  then 'individual_permission'
        when 'permission_scopes' then 'scope'
        else pc.subject end as action,
      case pc.subject
        when 'role'  then coalesce((select sr.name from system_roles sr where sr.id::text = pc.subject_id), 'a role since deleted')
        when 'level' then replace(coalesce(pc.after->>'level', pc.before->>'level', ''), '_', ' ')
        when 'user'  then coalesce(nullif(person_name(nullif(pc.subject_id,'')::uuid), '—'), 'someone since deleted')
        when 'permission_scopes' then coalesce(pc.after->>'perm', pc.before->>'perm', '')
        else coalesce(pc.subject_id,'') end as target,
      pc.subject as target_kind,
      case when pc.subject = 'user' then nullif(pc.subject_id,'')::uuid end as person_id,
      case when pc.subject = 'role' then nullif(pc.subject_id,'')::uuid end as role_id,
      case when pc.subject in ('role','level')
           then array(select k from jsonb_array_elements_text(coalesce(pc.after->'permissions','[]'::jsonb)) k
                       except select k from jsonb_array_elements_text(coalesce(pc.before->'permissions','[]'::jsonb)) k)
           when pc.subject = 'user' and pc.after::text = 'true' then array[pc.perm]
           else '{}'::text[] end as added,
      case when pc.subject in ('role','level')
           then array(select k from jsonb_array_elements_text(coalesce(pc.before->'permissions','[]'::jsonb)) k
                       except select k from jsonb_array_elements_text(coalesce(pc.after->'permissions','[]'::jsonb)) k)
           when pc.subject = 'user' and pc.after::text = 'false' then array[pc.perm]
           when pc.subject = 'user' and pc.after is null then array[pc.perm]
           else '{}'::text[] end as removed,
      pc.reason,
      pc.perm as one_perm
    from permission_changes pc
    where pc.org_id = v_org

    union all

    select
      ch.at,
      coalesce(ch.actor_label, 'System'),
      ch.actor_id,
      case ch.entity
        when 'user_roles'   then 'role_assignment'
        when 'system_roles' then 'role_definition'
        when 'screen_rules' then 'screen_rule'
        else ch.entity end,
      case ch.entity
        when 'user_roles'   then coalesce(nullif(person_name(nullif(coalesce(ch.after->>'user_id', ch.before->>'user_id'),'')::uuid), '—'), 'someone since deleted')
        when 'system_roles' then coalesce(ch.after->>'name', ch.before->>'name', 'a role')
        when 'screen_rules' then coalesce(ch.after->>'screen_key', ch.before->>'screen_key', '')
        else ch.entity_id end,
      ch.entity,
      case when ch.entity = 'user_roles'
           then nullif(coalesce(ch.after->>'user_id', ch.before->>'user_id'),'')::uuid end,
      case when ch.entity = 'user_roles'
             then nullif(coalesce(ch.after->>'system_role_id', ch.before->>'system_role_id'),'')::uuid
           when ch.entity = 'system_roles' then nullif(ch.entity_id,'')::uuid end,
      case when ch.entity = 'user_roles' and ch.op = 'INSERT'
           then array[coalesce((select sr.name from system_roles sr where sr.id::text = ch.after->>'system_role_id'), 'a role')]
           when ch.entity = 'system_roles' and ch.op = 'INSERT' then array['(role created)']
           else '{}'::text[] end,
      case when ch.entity = 'user_roles' and ch.op = 'DELETE'
           then array[coalesce((select sr.name from system_roles sr where sr.id::text = ch.before->>'system_role_id'), 'a role')]
           when ch.entity = 'system_roles' and ch.op = 'DELETE' then array['(role deleted)']
           else '{}'::text[] end,
      coalesce(ch.after->>'reason', ch.before->>'reason'),
      null::text
    from config_history ch
    where ch.org_id = v_org
      and ch.entity in ('user_roles','system_roles','screen_rules')

    union all

    select
      rh.changed_at,
      coalesce(rh.actor_label, 'System'),
      rh.changed_by,
      'profile_change',
      coalesce(nullif(person_name(rh.user_id), '—'), 'someone since deleted'),
      'user',
      rh.user_id,
      null::uuid,
      '{}'::text[],
      '{}'::text[],
      rh.reason,
      null::text
    from role_history rh
    where rh.org_id = v_org
  ),
  worded as (
    select r.*,
      case r.action
        when 'role_permissions' then r.actor ||
             case when cardinality(r.added) > 0 and cardinality(r.removed) > 0
                    then ' changed "' || r.target || '": added ' || array_to_string(r.added, ', ') || '; removed ' || array_to_string(r.removed, ', ')
                  when cardinality(r.added) > 0
                    then ' granted ' || array_to_string(r.added, ', ') || ' to "' || r.target || '"'
                  when cardinality(r.removed) > 0
                    then ' removed ' || array_to_string(r.removed, ', ') || ' from "' || r.target || '"'
                  else ' saved "' || r.target || '" with no permission change' end
        when 'level_permissions' then r.actor ||
             case when cardinality(r.added) > 0 and cardinality(r.removed) > 0
                    then ' changed what every ' || r.target || ' gets: added ' || array_to_string(r.added, ', ') || '; removed ' || array_to_string(r.removed, ', ')
                  when cardinality(r.added) > 0
                    then ' gave every ' || r.target || ' ' || array_to_string(r.added, ', ')
                  when cardinality(r.removed) > 0
                    then ' took ' || array_to_string(r.removed, ', ') || ' from every ' || r.target
                  else ' saved the ' || r.target || ' defaults with no change' end
        when 'individual_permission' then r.actor ||
             case when cardinality(r.added) > 0   then ' granted ' || array_to_string(r.added, ', ') || ' to ' || r.target || ' personally'
                  when r.removed = array[r.one_perm] then ' set ' || coalesce(r.one_perm,'a permission') || ' on ' || r.target || ' to denied or cleared it'
                  else ' changed ' || coalesce(r.one_perm,'a permission') || ' for ' || r.target end
        when 'scope' then r.actor || ' changed how far "' || r.target || '" reaches'
        when 'role_assignment' then r.actor ||
             case when cardinality(r.added) > 0   then ' gave ' || r.target || ' the "' || r.added[1] || '" role'
                  when cardinality(r.removed) > 0 then ' removed the "' || r.removed[1] || '" role from ' || r.target
                  else ' changed ' || r.target || '''s role grant' end
        when 'role_definition' then r.actor ||
             case when cardinality(r.added) > 0   then ' created the role "' || r.target || '"'
                  when cardinality(r.removed) > 0 then ' deleted the role "' || r.target || '"'
                  else ' changed the role "' || r.target || '"' end
        when 'screen_rule' then r.actor || ' changed who can open "' || r.target || '"'
        when 'profile_change' then r.actor || ' changed ' || r.target || '''s employment record'
        else r.actor || ' changed ' || r.target end as summary
    from rows r
  )
  select w.at, w.actor, w.actor_id, w.action, w.target, w.target_kind, w.person_id, w.role_id,
         w.added, w.removed, w.summary, w.reason
  from worded w
  where (p_from   is null or w.at >= p_from)
    and (p_to     is null or w.at <  p_to)
    and (p_actor  is null or w.actor_id = p_actor)
    and (p_person is null or w.person_id = p_person)
    and (p_role   is null or w.role_id  = p_role)
    and (p_action is null or w.action = p_action)
    and (p_perm   is null or p_perm = any(w.added) or p_perm = any(w.removed) or w.one_perm = p_perm)
  order by w.at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500))
  offset greatest(0, coalesce(p_offset, 0));
end $function$;

revoke all on function public.access_audit(timestamptz, timestamptz, uuid, uuid, uuid, text, text, integer, integer) from public, anon;
grant execute on function public.access_audit(timestamptz, timestamptz, uuid, uuid, uuid, text, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Two things an audit trail must not quietly lose. Added to the `delegation` suite.
-- ---------------------------------------------------------------------------------------------
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

  -- §18 opens with "Who made the change". A history table whose actor is a live foreign key loses
  -- that answer the moment the person is deleted (0044, 0054).
  select coalesce(array_agg(c.relname order by c.relname), '{}'::text[]) into bad
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public'
     and c.relname in ('permission_changes','config_history','role_history','audit_logs')
     and (not exists (select 1 from pg_attribute a
                       where a.attrelid = c.oid and a.attname = 'actor_label' and not a.attisdropped)
       or exists (select 1 from pg_constraint k
                   where k.conrelid = c.oid and k.contype = 'f'
                     and pg_get_constraintdef(k.oid) ~ 'REFERENCES profiles'
                     and pg_get_constraintdef(k.oid) ~ '\m(actor_id|changed_by)\M'));
  checks := checks || jsonb_build_object('name', 'audit:actor_survives_deletion', 'ok', cardinality(bad) = 0,
    'detail', case when cardinality(bad) = 0
                   then 'Every authority history table records the actor as text, so deleting a person cannot erase who acted.'
                   else 'These history tables would lose their actor if the person were deleted: ' || array_to_string(bad, ', ') end);

  -- Append-only is achieved here by having no write policy at all. A future UPDATE or DELETE
  -- policy on one of these would make the record editable without anybody noticing.
  select coalesce(array_agg(distinct p.tablename || '.' || p.policyname order by p.tablename || '.' || p.policyname), '{}'::text[]) into bad
    from pg_policies p
   where p.schemaname = 'public'
     and p.tablename in ('permission_changes','config_history','role_history')
     and p.cmd in ('UPDATE','DELETE','ALL');
  checks := checks || jsonb_build_object('name', 'audit:history_is_append_only', 'ok', cardinality(bad) = 0,
    'detail', case when cardinality(bad) = 0
                   then 'The authority history tables have no update or delete policy, so entries cannot be rewritten.'
                   else 'These policies would let audit history be edited or deleted: ' || array_to_string(bad, ', ') end);

  return selftest_result(checks);
end $function$;
