-- 0047 — Resource scope: how far `tasks.view` and `projects.view` reach.
--
-- Same contract as people scope (0043): these only ever NARROW. With no rule configured
-- `permission_scope` answers `company`, both predicates return true, and `can_view_task` /
-- `can_view_project` behave exactly as they did. Nothing here grants visibility to anybody.
-- Verified by counting what all 16 active people could see before and after: 332 task views and
-- 15 project views, unchanged, 0 people affected.
--
-- Scope levels, mapped onto what these tables actually record. Neither has a `team_id`, so "team"
-- resolves through the team of the people involved:
--
--   own         a task you are named on in any capacity — assignee, owner, creator, delegator,
--               approver, waiting-on, collaborator; a project you own or are a member of. This is
--               the brief's "own records" and "assigned projects".
--   team        own, plus anything whose assignee or owner shares your team.
--   department  own, plus the task's or project's own department (or the named departments on the
--               rule). A task with no department falls back to its assignee's department, so
--               unfiled work does not silently escape a department-scoped reviewer.
--   company     everything — the default, and the historical behaviour.
--
-- "Own" is the floor for every narrower scope on purpose: work addressed to you personally never
-- falls out of your reach because a reviewer narrowed your department. So `department` returns
-- own ∪ department, not department alone.

-- ---------------------------------------------------------------- the fast path
-- These predicates run once per row inside RLS. Walking all five precedence sources for every row
-- would be five index probes per task on a table that usually has no rule for the key at all.
-- One probe answers that case and returns the historical answer immediately.
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
  if is_platform_owner_user(p_user) then
    return jsonb_build_object('scope','company','department_ids','[]'::jsonb,'source','platform_owner');
  end if;

  if not exists (
    select 1 from permission_scopes s
     where s.org_id = p.org_id and s.perm = p_perm
       and (s.expires_at is null or s.expires_at > now())
  ) then
    return jsonb_build_object('scope','company','department_ids','[]'::jsonb,'source','default');
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

-- ------------------------------------------------------------------ predicates
create or replace function public.task_in_scope(p_task uuid, p_user uuid default auth.uid())
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare sc jsonb; s text; ids uuid[]; me profiles%rowtype; t tasks%rowtype;
begin
  if p_task is null or p_user is null then return true; end if;
  sc := permission_scope('tasks.view', p_user);
  s  := sc->>'scope';
  if s = 'company' then return true; end if;

  select * into me from profiles where id = p_user;
  select * into t  from tasks    where id = p_task;
  if me.id is null or t.id is null then return false; end if;

  if t.assignee_id = p_user or t.owner_id = p_user or t.created_by = p_user
     or t.delegated_by = p_user or t.approver_id = p_user or t.waiting_on_user_id = p_user
     or exists (select 1 from task_collaborators tc where tc.task_id = p_task and tc.user_id = p_user)
  then
    return true;
  end if;
  if s = 'own' then return false; end if;

  if s = 'team' then
    return me.team_id is not null and exists (
      select 1 from profiles q
       where q.id in (t.assignee_id, t.owner_id)
         and q.team_id is not distinct from me.team_id);
  end if;

  ids := array(select (jsonb_array_elements_text(sc->'department_ids'))::uuid);
  if array_length(ids, 1) is null then
    return coalesce(t.department_id, (select q.department_id from profiles q where q.id = t.assignee_id))
             is not distinct from me.department_id
           and me.department_id is not null;
  end if;
  return coalesce(t.department_id, (select q.department_id from profiles q where q.id = t.assignee_id)) = any(ids);
end $$;

create or replace function public.project_in_scope(p_project uuid, p_user uuid default auth.uid())
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare sc jsonb; s text; ids uuid[]; me profiles%rowtype; pr projects%rowtype;
begin
  if p_project is null or p_user is null then return true; end if;
  sc := permission_scope('projects.view', p_user);
  s  := sc->>'scope';
  if s = 'company' then return true; end if;

  select * into me from profiles where id = p_user;
  select * into pr from projects where id = p_project;
  if me.id is null or pr.id is null then return false; end if;

  if pr.owner_id = p_user or pr.created_by = p_user or is_project_member(p_project) then
    return true;
  end if;
  if s = 'own' then return false; end if;

  if s = 'team' then
    return me.team_id is not null and exists (
      select 1 from profiles q
       where q.id = pr.owner_id and q.team_id is not distinct from me.team_id);
  end if;

  ids := array(select (jsonb_array_elements_text(sc->'department_ids'))::uuid);
  if array_length(ids, 1) is null then
    return pr.department_id is not null and pr.department_id is not distinct from me.department_id;
  end if;
  return pr.department_id = any(ids);
end $$;

revoke execute on function public.task_in_scope(uuid, uuid) from public, anon;
revoke execute on function public.project_in_scope(uuid, uuid) from public, anon;
grant execute on function public.task_in_scope(uuid, uuid) to authenticated;
grant execute on function public.project_in_scope(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------- enforcement
-- Into the controls themselves. These are RLS and they also govern `search_all`, so a narrowed
-- reviewer cannot reach a task by typing its id or by searching for its title.
create or replace function public.can_view_project(p uuid)
returns boolean
language sql
stable security definer
set search_path to 'public', 'extensions'
as $function$
  select exists (
    select 1 from projects pr
    where pr.id = p
      and pr.org_id = current_org()
      and (
        is_project_member(p)
        or is_admin()
        or has_admin_perm('projects.manage')
        or has_grant('project', p)
        or (pr.classification in ('public','internal') and is_internal())
        or (pr.classification = 'confidential' and (
              is_manager_plus()
              or (pr.department_id is not null and pr.department_id = current_department()
                  and is_lead_plus())))
      )
  )
  and project_in_scope(p)
$function$;

create or replace function public.can_view_task(t uuid)
returns boolean
language sql
stable security definer
set search_path to 'public', 'extensions'
as $function$
  select exists (
    select 1 from tasks tk
    where tk.id = t and tk.org_id = current_org()
      and (
        tk.assignee_id = auth.uid() or tk.owner_id = auth.uid()
        or tk.created_by = auth.uid() or tk.delegated_by = auth.uid()
        or tk.approver_id = auth.uid() or tk.waiting_on_user_id = auth.uid()
        or exists (select 1 from task_collaborators tc where tc.task_id = t and tc.user_id = auth.uid())
        or (tk.project_id is not null and can_view_project(tk.project_id))
        or (tk.project_id is null and is_internal() and (
              is_manager_plus() or tk.department_id is null or tk.department_id = current_department()))
      )
  )
  and task_in_scope(t)
$function$;
