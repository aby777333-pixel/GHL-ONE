-- 0049 — Scope for files, the wiki and chat.
--
-- Completes the resource-scope work started in 0043 (people) and 0047 (tasks, projects). Same rule
-- throughout, and it is the reason this is safe to add to a live system: **scope only ever narrows.**
-- A rule can take reach away from somebody who already had it; it can never hand reach to somebody
-- who did not. Every predicate below returns TRUE when no rule applies, so a company that never
-- opens the Scope tab sees behaviour identical to before this migration.
--
-- Three things had to move together, because two of them bypass the third:
--
--   1. The RLS policies on `files` and `wiki_pages`.
--   2. `can_view_channel`, which every chat read goes through.
--   3. `search_all` — SECURITY DEFINER, so it bypasses RLS entirely and re-implements the checks
--      per branch. Wiring the policies alone would have left global search able to surface the
--      title and folder of a file that scope had just put out of reach. `test_access_control`
--      now asserts search keeps consulting both predicates, so it cannot quietly drift back.
--
-- Membership is the floor for chat. A person who is in a channel stays in it whatever the scope
-- rule says, and a DM is never scoped away from its participants — a narrowed reviewer losing
-- access to their own direct messages would be a bug, not a policy.

-- ---------------------------------------------------------------------------------------------
-- The key. `chat.view` refines the broad `view`, so `legacy_alias` makes has_perm resolve it for
-- everybody who already holds `view` — nobody's chat access changes on deploy.
-- ---------------------------------------------------------------------------------------------
insert into public.permissions (key, label, description, grp, risk, position, module, action, legacy_alias)
values ('chat.view', 'Chat · view', 'See channels and their messages.', 'communication', 'standard', 270, 'chat', 'view', 'view')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------------------------
-- Predicates. Each resolves the scope rule for its own key and answers "is this row within reach".
-- All three are STABLE SECURITY DEFINER so they can read the row they are judging without
-- recursing through the policy that calls them.
-- ---------------------------------------------------------------------------------------------

create or replace function public.file_in_scope(p_file uuid, p_user uuid default auth.uid())
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare sc jsonb; s text; ids uuid[]; me profiles%rowtype; f files%rowtype; v_dept uuid;
begin
  if p_file is null or p_user is null then return true; end if;
  sc := permission_scope('files.view', p_user);
  s  := sc->>'scope';
  if s = 'company' then return true; end if;

  select * into me from profiles where id = p_user;
  select * into f  from files    where id = p_file;
  if me.id is null or f.id is null then return false; end if;

  if f.owner_id = p_user then return true; end if;
  if s = 'own' then return false; end if;

  if s = 'team' then
    return me.team_id is not null and exists (
      select 1 from profiles q where q.id = f.owner_id and q.team_id is not distinct from me.team_id);
  end if;

  -- A file files itself by department, else by its project's, else by its owner's.
  v_dept := coalesce(f.department_id,
                     (select pr.department_id from projects pr where pr.id = f.project_id),
                     (select q.department_id from profiles q where q.id = f.owner_id));
  ids := array(select (jsonb_array_elements_text(sc->'department_ids'))::uuid);
  if array_length(ids, 1) is null then
    return v_dept is not null and v_dept is not distinct from me.department_id;
  end if;
  return v_dept = any(ids);
end $function$;

create or replace function public.wiki_in_scope(p_page uuid, p_user uuid default auth.uid())
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare sc jsonb; s text; ids uuid[]; me profiles%rowtype; w wiki_pages%rowtype; v_dept uuid;
begin
  if p_page is null or p_user is null then return true; end if;
  sc := permission_scope('wiki.view', p_user);
  s  := sc->>'scope';
  if s = 'company' then return true; end if;

  select * into me from profiles where id = p_user;
  select * into w  from wiki_pages where id = p_page;
  if me.id is null or w.id is null then return false; end if;

  if w.author_id = p_user then return true; end if;
  if s = 'own' then return false; end if;

  if s = 'team' then
    return me.team_id is not null and exists (
      select 1 from profiles q where q.id = w.author_id and q.team_id is not distinct from me.team_id);
  end if;

  v_dept := coalesce(w.department_id, (select q.department_id from profiles q where q.id = w.author_id));
  ids := array(select (jsonb_array_elements_text(sc->'department_ids'))::uuid);
  if array_length(ids, 1) is null then
    return v_dept is not null and v_dept is not distinct from me.department_id;
  end if;
  return v_dept = any(ids);
end $function$;

create or replace function public.channel_in_scope(p_channel uuid, p_user uuid default auth.uid())
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare sc jsonb; s text; ids uuid[]; me profiles%rowtype; ch channels%rowtype;
begin
  if p_channel is null or p_user is null then return true; end if;
  sc := permission_scope('chat.view', p_user);
  s  := sc->>'scope';
  if s = 'company' then return true; end if;

  select * into me from profiles where id = p_user;
  select * into ch from channels where id = p_channel;
  if me.id is null or ch.id is null then return false; end if;

  -- Membership is the floor. A direct message can never be scoped away from its participants.
  if ch.owner_id = p_user or ch.co_owner_id = p_user or ch.created_by = p_user
     or exists (select 1 from channel_members cm where cm.channel_id = p_channel and cm.user_id = p_user)
  then
    return true;
  end if;
  if ch.type = 'dm' then return false; end if;
  if s = 'own' then return false; end if;

  if s = 'team' then
    return me.team_id is not null and exists (
      select 1 from profiles q where q.id = ch.owner_id and q.team_id is not distinct from me.team_id);
  end if;

  ids := array(select (jsonb_array_elements_text(sc->'department_ids'))::uuid);
  if array_length(ids, 1) is null then
    return ch.department_id is not null and ch.department_id is not distinct from me.department_id;
  end if;
  return ch.department_id = any(ids);
end $function$;

-- ---------------------------------------------------------------------------------------------
-- Policies. The scope predicate is APPENDED to what was already there, so every existing gate —
-- classification, project, task, explicit grant — still applies exactly as before.
--
-- The direct owner branch beside each predicate is not redundant. `test_returning_policies` (see
-- docs/TESTING.md) exists because a SELECT policy that delegates only to a STABLE helper cannot
-- read back a row the same statement just inserted: the helper runs against a snapshot taken
-- before the write and finds nothing, so `.insert().select()` returns empty. The helpers below do
-- return true for the owner, but only the policy text is visible to the planner and the checker.
-- ---------------------------------------------------------------------------------------------

drop policy if exists files_read on public.files;
create policy files_read on public.files for select using (
  org_id = current_org()
  and (
    has_grant('file', id)
    or (
      can_view_classification(classification)
      and (project_id is null or can_view_project(project_id))
      and (task_id is null or can_view_task(task_id))
    )
  )
  and (owner_id = auth.uid() or file_in_scope(id))
);

drop policy if exists wiki_read on public.wiki_pages;
create policy wiki_read on public.wiki_pages for select using (
  org_id = current_org()
  and can_view_classification(classification)
  and (author_id = auth.uid() or wiki_in_scope(id))
);

-- Chat has no per-row policy of its own worth rewriting: everything funnels through this one
-- helper, so scope goes in at the end of it and every reader inherits it.
create or replace function public.can_view_channel(c uuid)
returns boolean
language sql
stable security definer
set search_path to 'public', 'extensions'
as $function$
  select exists (
    select 1 from channels ch
    where ch.id = c and ch.org_id = current_org()
      and (
        is_channel_member(c)
        or (ch.visibility = 'company_open' and is_internal())
        or (ch.visibility = 'department_open' and is_internal() and (ch.department_id = current_department() or ch.department_id is null or current_department() = any(ch.department_ids)))
        or (ch.type = 'project' and ch.project_id is not null and can_view_project(ch.project_id))
        or (ch.visibility = 'executive_only' and is_admin())
        or (ch.type <> 'dm' and has_admin_perm('communication.manage'))
      )
  )
  and channel_in_scope(c)
$function$;

-- ---------------------------------------------------------------------------------------------
-- Search. SECURITY DEFINER, so RLS does not apply and the file and wiki branches have to carry
-- the predicate themselves. Chat comes along free — its branch already calls can_view_channel.
-- ---------------------------------------------------------------------------------------------
create or replace function public.search_all(q text, lim integer default 8)
returns table(kind text, id uuid, title text, subtitle text, link text, rank real)
language plpgsql
stable security definer
set search_path to 'public', 'extensions'
as $function$
declare
  qq text := '%' || q || '%';
begin
  if q is null or length(trim(q)) < 2 or not is_active_member() then return; end if;
  return query
  (select 'person'::text, p.id, p.full_name, coalesce(p.designation,'') || case when d.name is not null then ' · ' || d.name else '' end, '/people/' || p.id, similarity(p.full_name, q)
     from profiles p left join departments d on d.id = p.department_id
    where p.org_id = current_org() and p.is_active and (p.full_name ilike qq or p.email ilike qq or p.designation ilike qq)
    order by 6 desc limit lim)
  union all
  (select 'task', t.id, t.title, coalesce(pr.name, 'No project') || ' · ' || replace(t.status::text,'_',' '), '/tasks/' || t.id, similarity(t.title, q)
     from tasks t left join projects pr on pr.id = t.project_id
    where t.org_id = current_org() and can_view_task(t.id) and (t.title ilike qq or t.description ilike qq or q = any(t.tags))
    order by 6 desc limit lim)
  union all
  (select 'project', p.id, p.name, coalesce(p.description,''), '/projects/' || p.id, similarity(p.name, q)
     from projects p where p.org_id = current_org() and can_view_project(p.id) and (p.name ilike qq or p.description ilike qq or p.code ilike qq or q = any(p.tags))
    order by 6 desc limit lim)
  union all
  (select 'message', m.id, left(m.body, 120), '#' || c.name || ' · ' || coalesce(pf.full_name,''), '/chat/' || c.id || '?m=' || m.id, similarity(m.body, q)
     from messages m join channels c on c.id = m.channel_id left join profiles pf on pf.id = m.author_id
    where c.org_id = current_org() and m.deleted_at is null and can_view_channel(c.id) and m.body ilike qq
    order by m.created_at desc limit lim)
  union all
  (select 'file', f.id, f.name, f.folder || ' · v' || f.current_version, '/files/' || f.id, similarity(f.name, q)
     from files f where f.org_id = current_org() and can_view_classification(f.classification) and (f.project_id is null or can_view_project(f.project_id)) and file_in_scope(f.id) and (f.name ilike qq or q = any(f.tags))
    order by 6 desc limit lim)
  union all
  (select 'decision', d.id, d.title, left(d.decision, 120), '/decisions/' || d.id, similarity(d.title, q)
     from decisions d where d.org_id = current_org() and can_view_classification(d.classification) and (d.project_id is null or can_view_project(d.project_id)) and (d.title ilike qq or d.decision ilike qq or d.reason ilike qq)
    order by 6 desc limit lim)
  union all
  (select 'meeting', m.id, m.title, to_char(m.starts_at at time zone 'Asia/Kolkata', 'DD Mon YYYY HH24:MI'), '/meetings/' || m.id, similarity(m.title, q)
     from meetings m where m.org_id = current_org() and (m.organizer_id = auth.uid() or is_manager_plus() or exists (select 1 from meeting_participants mp where mp.meeting_id = m.id and mp.user_id = auth.uid()))
      and (m.title ilike qq or m.agenda ilike qq or m.notes ilike qq or m.summary ilike qq)
    order by 6 desc limit lim)
  union all
  (select 'wiki', w.id, w.title, w.category, '/wiki/' || w.slug, similarity(w.title, q)
     from wiki_pages w where w.org_id = current_org() and can_view_classification(w.classification) and wiki_in_scope(w.id) and (w.title ilike qq or w.body ilike qq)
    order by 6 desc limit lim)
  union all
  (select 'department', d.id, d.name, coalesce(d.description,''), '/departments/' || d.slug, similarity(d.name, q)
     from departments d where d.org_id = current_org() and d.name ilike qq limit lim)
  union all
  (select 'approval', a.id, a.title, replace(a.type::text,'_',' ') || ' · ' || replace(a.status::text,'_',' '), '/approvals/' || a.id, similarity(a.title, q)
     from approvals a where a.org_id = current_org() and (a.requested_by = auth.uid() or a.approver_id = auth.uid() or is_manager_plus()) and a.title ilike qq
    order by 6 desc limit lim)
  union all
  (select 'live', r.id, r.title, replace(r.kind, '_', ' ') || ' · ' || r.status || ' · ' || to_char(r.started_at at time zone 'Asia/Kolkata', 'DD Mon HH24:MI'), '/live/' || r.id, similarity(r.title, q)
     from live_rooms r where r.org_id = current_org() and can_view_live_room(r.id)
      and (r.title ilike qq or exists (select 1 from live_transcripts t where t.room_id = r.id and t.text ilike qq) or exists (select 1 from live_notes n where n.room_id = r.id and n.body ilike qq))
    order by r.started_at desc limit lim)
  union all
  (select 'board', b.id, b.title, replace(b.kind, '_', ' ') || ' board · ' || person_name(b.owner_id), '/boards/' || b.id, similarity(b.title, q)
     from boards b where b.org_id = current_org() and not b.archived and can_view_board(b.id) and (b.title ilike qq or b.doc::text ilike qq)
    order by 6 desc limit lim)
  union all
  (select 'recording', x.id, x.title, replace(x.kind, '_', ' ') || ' · ' || (x.duration_sec / 60) || ' min · ' || person_name(x.owner_id), '/recordings/' || x.id, similarity(x.title, q)
     from live_recordings x where x.org_id = current_org() and can_view_recording(x.id) and (x.title ilike qq or x.transcript ilike qq or x.summary::text ilike qq)
    order by 6 desc limit lim)
  union all
  (select 'doc', d.id, d.title, replace(d.kind, '_', ' ') || ' · ' || person_name(d.owner_id), '/docs/' || d.id, similarity(d.title, q)
     from live_docs d where d.org_id = current_org() and not d.archived and can_view_live_doc(d.id) and (d.title ilike qq or d.body ilike qq)
    order by 6 desc limit lim);
end $function$;

-- ---------------------------------------------------------------------------------------------
-- The catalogue of keys scope actually enforces. A rule set on anything not in this list narrows
-- nothing, so the Scope tab greys those keys out and the self test flags any rule that slipped in.
-- ---------------------------------------------------------------------------------------------
create or replace function public.scope_enforced_permissions()
returns text[]
language sql
immutable
as $function$
  select array['people.edit','tasks.view','projects.view','files.view','wiki.view','chat.view'];
$function$;

-- ---------------------------------------------------------------------------------------------
-- Self test: two new checks, and the resource-scope check widened to three functions.
-- ---------------------------------------------------------------------------------------------
create or replace function public.test_access_control()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare checks jsonb := '[]'::jsonb; r record; n int;
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

  -- Every control that scope reaches must still consult its predicate.
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

  -- search_all is SECURITY DEFINER and re-implements the file and wiki checks itself, so wiring the
  -- policies alone would leave search able to surface something scope had just put out of reach.
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

-- Definer functions default to EXECUTE for PUBLIC, which includes `anon`. 0045 closed that surface;
-- keep the new predicates closed the same way. can_view_channel and search_all keep the grants they
-- already had — both are called by signed-in users and both check membership themselves.
revoke all on function public.file_in_scope(uuid, uuid)    from public, anon;
revoke all on function public.wiki_in_scope(uuid, uuid)    from public, anon;
revoke all on function public.channel_in_scope(uuid, uuid) from public, anon;
grant execute on function public.file_in_scope(uuid, uuid)    to authenticated;
grant execute on function public.wiki_in_scope(uuid, uuid)    to authenticated;
grant execute on function public.channel_in_scope(uuid, uuid) to authenticated;
