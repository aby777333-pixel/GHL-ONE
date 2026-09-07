-- Phase 4 wave 2 fixes: gaps reported by the UI waves.

create or replace function workflow_release_step(p_step uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s workflow_steps%rowtype; r workflow_runs%rowtype; tid uuid;
begin
  select * into s from workflow_steps where id = p_step;
  select * into r from workflow_runs where id = s.run_id;
  if s.status <> 'pending' then return; end if;
  insert into tasks (org_id, title, description, department_id, assignee_id, owner_id, created_by, status, priority, due_date, tags)
  values (r.org_id, s.title || ' — ' || r.subject_label, coalesce(s.description, '') || E'\n\nWorkflow: ' || r.kind || ' for ' || r.subject_label || ' [/admin?tab=workflows&run=' || r.id || ']',
          s.department_id, s.owner_id, coalesce(r.started_by, s.owner_id), coalesce(r.started_by, s.owner_id), 'todo', 'high', s.due_date, array['workflow', r.kind])
  returning id into tid;
  update workflow_steps set task_id = tid, status = 'ready' where id = p_step;
end $$;

create or replace function company_now() returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare o uuid := current_org(); today date := (now() at time zone 'Asia/Kolkata')::date; r jsonb;
begin
  if not (is_manager_plus() or has_admin_perm('audit.read')) then return jsonb_build_object('error','forbidden'); end if;
  r := jsonb_build_object(
    'people', jsonb_build_object(
      'total', (select count(*) from profiles where org_id = o and is_active and not is_external),
      'present', (select count(*) from attendance_days where org_id = o and day = today and status in ('present','late','half_day')),
      'remote', (select count(*) from attendance_days where org_id = o and day = today and status in ('remote','field','travel','training')),
      'late', (select count(*) from attendance_days where org_id = o and day = today and late),
      'on_leave', (select count(*) from leaves where org_id = o and status = 'approved' and today between starts_on and ends_on),
      'not_checked_in', (select count(*) from profiles p where p.org_id = o and p.is_active and not p.is_external and not exists (select 1 from attendance_days a where a.user_id = p.id and a.day = today) and not exists (select 1 from leaves l where l.user_id = p.id and l.status = 'approved' and today between l.starts_on and l.ends_on)),
      'in_meeting', (select count(distinct mp.user_id) from meetings m join meeting_participants mp on mp.meeting_id = m.id where m.org_id = o and now() between m.starts_at and coalesce(m.ends_at, m.starts_at + interval '1 hour')),
      'available', (select count(*) from profiles where org_id = o and is_active and presence in ('available','remote')),
      'focus', (select count(*) from profiles where org_id = o and is_active and presence = 'focus'),
      'missing_checkout', (select count(*) from attendance_days where org_id = o and day = today - 1 and missing_checkout)
    ),
    'work', jsonb_build_object(
      'active', (select count(*) from tasks where org_id = o and status = 'in_progress' and parent_id is null),
      'overdue', (select count(*) from tasks where org_id = o and status not in ('done','cancelled') and due_date < now() and parent_id is null),
      'blocked', (select count(*) from tasks where org_id = o and status = 'blocked'),
      'waiting', (select count(*) from tasks where org_id = o and status = 'waiting'),
      'critical', (select count(*) from tasks where org_id = o and status not in ('done','cancelled') and priority in ('critical','urgent') and parent_id is null),
      'done_today', (select count(*) from tasks where org_id = o and status = 'done' and (completed_at at time zone 'Asia/Kolkata')::date = today)
    ),
    'projects', jsonb_build_object(
      'active', (select count(*) from projects where org_id = o and not archived and status in ('active','planning')),
      'at_risk', (select count(*) from projects where org_id = o and not archived and (status in ('at_risk','delayed') or (status='active' and due_date < today)))
    ),
    'collaboration', jsonb_build_object(
      'help_open', (select count(*) from help_requests where org_id = o and status in ('new','accepted','working','waiting')),
      'help_unanswered', (select count(*) from help_requests where org_id = o and status = 'new'),
      'help_over_sla', (select count(*) from help_requests where org_id = o and status = 'new' and ack_due_at < now()),
      'rooms_active', (select count(*) from channels where org_id = o and type in ('temporary','help','group','team') and not archived and last_message_at > now() - interval '3 days'),
      'groups_this_week', (select count(*) from channels where org_id = o and type <> 'dm' and created_at > now() - interval '7 days'),
      'handoffs_pending', (select count(*) from handoffs where org_id = o and status = 'pending'),
      'cross_dept_rooms', (select count(*) from channels where org_id = o and not archived and array_length(department_ids,1) > 1)
    ),
    'approvals', jsonb_build_object(
      'pending', (select count(*) from approvals where org_id = o and status = 'pending'),
      'mine', (select count(*) from approvals where org_id = o and status = 'pending' and approver_id = auth.uid()),
      'access_requests', (select count(*) from access_requests where org_id = o and status = 'pending'),
      'leave_requests', (select count(*) from leaves where org_id = o and status = 'pending'),
      'stale', (select count(*) from approvals where org_id = o and status = 'pending' and created_at < now() - interval '48 hours')
    ),
    'security', jsonb_build_object(
      'high_risk_requests', (select count(*) from access_requests where org_id = o and status = 'pending' and risk = 'high'),
      'temporary_grants', (select count(*) from access_grants where org_id = o and revoked_at is null and expires_at is not null and expires_at > now()),
      'events_24h', (select count(*) from security_events where org_id = o and created_at > now() - interval '24 hours'),
      'external_guests', (select count(*) from profiles where org_id = o and is_active and is_external)
    ),
    'departments', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'slug', d.slug, 'color', d.color, 'status', d.status,
        'present', (select count(*) from attendance_days a join profiles p on p.id = a.user_id where p.department_id = d.id and a.day = today and a.status not in ('leave','absent')),
        'people', (select count(*) from profiles p where p.department_id = d.id and p.is_active),
        'open', (select count(*) from tasks t where t.department_id = d.id and t.status not in ('done','cancelled')),
        'overdue', (select count(*) from tasks t where t.department_id = d.id and t.status not in ('done','cancelled') and t.due_date < now()),
        'blocked', (select count(*) from tasks t where t.department_id = d.id and t.status in ('blocked','waiting')),
        'help_open', (select count(*) from help_requests h where h.department_id = d.id and h.status in ('new','accepted','working','waiting'))
      ) order by d.position), '[]') from departments d where d.org_id = o)
  );
  return r;
end $$;

create or replace function since_last_visit(p_since timestamptz) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select case when not (is_manager_plus() or has_admin_perm('audit.read')) then jsonb_build_object('error','forbidden') else jsonb_build_object(
    'since', p_since,
    'checked_in', (select count(*) from attendance_events where org_id = current_org() and kind = 'clock_in' and occurred_at > p_since),
    'tasks_completed', (select count(*) from tasks where org_id = current_org() and status = 'done' and completed_at > p_since),
    'tasks_created', (select count(*) from tasks where org_id = current_org() and created_at > p_since),
    'requests_completed', (select count(*) from help_requests where org_id = current_org() and completed_at > p_since),
    'requests_new', (select count(*) from help_requests where org_id = current_org() and created_at > p_since),
    'projects_changed', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status)), '[]') from projects p where p.org_id = current_org() and p.updated_at > p_since and p.status in ('at_risk','delayed','completed')),
    'decisions', (select count(*) from decisions where org_id = current_org() and created_at > p_since),
    'approvals_pending', (select count(*) from approvals where org_id = current_org() and status = 'pending'),
    'access_requests_pending', (select count(*) from access_requests where org_id = current_org() and status = 'pending'),
    'critical_unresolved', (select count(*) from help_requests where org_id = current_org() and priority = 'critical' and status in ('new','accepted','working','waiting')),
    'escalations', (select count(*) from audit_logs where org_id = current_org() and action in ('escalation.sent','help.escalated') and created_at > p_since),
    'new_groups', (select count(*) from channels where org_id = current_org() and type <> 'dm' and created_at > p_since),
    'handoffs', (select count(*) from handoffs where org_id = current_org() and created_at > p_since)
  ) end
$$;

create or replace function collaboration_map()
returns table(from_department_id uuid, to_department_id uuid, from_name text, to_name text, handoffs int, help_requests int, avg_ack_minutes int, shared_rooms int)
language sql stable security definer set search_path = public as $$
  with pairs as (
    select h.from_department_id as a, h.to_department_id as b, count(*) as handoffs, 0 as reqs, null::numeric as ack from handoffs h where h.org_id = current_org() and h.from_department_id is not null group by 1,2
    union all
    select r.requester_department_id, r.department_id, 0, count(*), avg(extract(epoch from (r.acknowledged_at - r.created_at))/60) from help_requests r where r.org_id = current_org() and r.requester_department_id is not null and r.requester_department_id <> r.department_id group by 1,2
    union all
    select c.department_ids[1], c.department_ids[2], 0, 0, null from channels c where c.org_id = current_org() and array_length(c.department_ids,1) >= 2
  )
  select p.a, p.b, da.name, db.name, sum(p.handoffs)::int, sum(p.reqs)::int, avg(p.ack)::int, (select count(*)::int from channels c where c.org_id = current_org() and p.a = any(c.department_ids) and p.b = any(c.department_ids))
    from pairs p join departments da on da.id = p.a join departments db on db.id = p.b
   where (is_manager_plus() or has_admin_perm('audit.read'))
   group by p.a, p.b, da.name, db.name
   order by 5 desc, 6 desc
$$;

create or replace function who_can_see(p_type text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare out jsonb := '[]'::jsonb; p record; e jsonb;
begin
  if not (is_manager_plus() or has_admin_perm('security.manage') or has_admin_perm('access.approve')) then raise exception 'forbidden'; end if;
  for p in select id, full_name from profiles where org_id = current_org() and is_active loop
    e := explain_access(p.id, p_type, p_id);
    if (e->>'has_access')::boolean then out := out || jsonb_build_object('user_id', p.id, 'name', p.full_name, 'reasons', e->'reasons'); end if;
  end loop;
  return out;
end $$;

create or replace function view_as(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare prev text; res jsonb;
begin
  if not (is_primary_admin() or has_admin_perm('security.manage') or has_admin_perm('access.approve')) then raise exception 'forbidden'; end if;
  prev := current_setting('request.jwt.claims', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  res := jsonb_build_object(
    'user', person_name(p_user),
    'role', (select role from profiles where id = p_user),
    'department', (select d.name from profiles p join departments d on d.id = p.department_id where p.id = p_user),
    'projects', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'classification', classification)), '[]') from projects where org_id = current_org() and not archived and can_view_project(id)),
    'channels', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'visibility', visibility)), '[]') from channels where org_id = current_org() and not archived and type <> 'dm' and can_view_channel(id)),
    'files_visible', (select count(*) from files f where f.org_id = current_org() and (has_grant('file', f.id) or (can_view_classification(f.classification) and (f.project_id is null or can_view_project(f.project_id))))),
    'tasks_visible', (select count(*) from tasks t where t.org_id = current_org() and t.status not in ('done','cancelled') and can_view_task(t.id)),
    'is_manager', is_manager_plus(),
    'admin_perms', (select coalesce(jsonb_agg(r.name), '[]') from admin_assignments a join admin_roles r on r.id = a.admin_role_id where a.user_id = p_user)
  );
  perform set_config('request.jwt.claims', coalesce(prev, ''), true);
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary) values (current_org(), auth.uid(), 'security.view_as', 'profile', p_user, 'Viewed permissions as ' || person_name(p_user));
  return res;
end $$;

create or replace function start_focus(p_task uuid default null, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare o uuid; eid uuid; t text;
begin
  select org_id into o from profiles where id = auth.uid();
  -- close any open session
  update time_entries set ended_at = now(), minutes = extract(epoch from (now() - started_at))/60 where user_id = auth.uid() and ended_at is null;
  insert into time_entries (org_id, user_id, task_id, source, note) values (o, auth.uid(), p_task, 'focus', p_note) returning id into eid;
  select title into t from tasks where id = p_task;
  update profiles set presence = 'focus', status_text = case when t is not null then 'Working on: ' || left(t, 60) else 'Focus session' end where id = auth.uid();
  return eid;
end $$;


-- help desk: claim from the board, resolution note, audit visibility for requester/owner
alter table help_requests add column if not exists resolution_note text;
create or replace function claim_help_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h help_requests%rowtype;
begin
  select * into h from help_requests where id = p_id;
  if h.id is null or not is_internal() then raise exception 'not accessible'; end if;
  if not (h.status in ('new','waiting') and (h.visible_on_board or h.department_id = current_department() or is_manager_plus())) then raise exception 'This request can no longer be claimed'; end if;
  update help_requests set owner_id = auth.uid(), status = case when status = 'new' then 'accepted'::help_status else status end where id = p_id;
end $$;
grant execute on function claim_help_request(uuid) to authenticated; revoke execute on function claim_help_request(uuid) from anon, public;
drop policy if exists hr_update on help_requests;
create policy hr_update on help_requests for update to authenticated using (
  org_id = current_org() and (owner_id = auth.uid() or department_id = current_department() or is_manager_plus() or has_admin_perm('department.manage') or (requester_id = auth.uid() and status = 'new')
    or (visible_on_board and status in ('new','waiting') and is_internal()))
);
create policy audit_read_help on audit_logs for select to authenticated using (
  entity_type = 'help_request' and exists (select 1 from help_requests h where h.id = entity_id and (h.requester_id = auth.uid() or h.owner_id = auth.uid()))
);

-- admin role changes are audited
create or replace function admin_assignment_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value)
    values (new.org_id, auth.uid(), 'admin.role_assigned', 'profile', new.user_id, person_name(new.user_id) || ' → ' || (select name from admin_roles where id = new.admin_role_id), jsonb_build_object('role_id', new.admin_role_id, 'scope_department_id', new.scope_department_id, 'expires_at', new.expires_at));
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (new.user_id, 'security', 'You are now ' || (select name from admin_roles where id = new.admin_role_id), 'Admin permissions were granted to you. Every admin action is audited.', '/admin', 'admin_assignment', new.id, auth.uid());
    return null;
  end if;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, old_value)
  values (old.org_id, auth.uid(), 'admin.role_removed', 'profile', old.user_id, person_name(old.user_id) || ' ✕ ' || (select name from admin_roles where id = old.admin_role_id), jsonb_build_object('role_id', old.admin_role_id));
  return null;
end $$;
create trigger admin_assignments_audit after insert or delete on admin_assignments for each row execute function admin_assignment_audit();
create or replace function admin_role_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, old_value, new_value)
  values (new.org_id, auth.uid(), case when tg_op = 'INSERT' then 'admin.role_created' else 'admin.role_updated' end, 'admin_role', new.id, new.name, case when tg_op = 'UPDATE' then jsonb_build_object('permissions', old.permissions) else null end, jsonb_build_object('permissions', new.permissions));
  return null;
end $$;
create trigger admin_roles_audit after insert or update on admin_roles for each row execute function admin_role_audit();

-- shift swaps: approval applies one-day assignments for both people
create or replace function shift_swap_apply() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    if new.to_shift_id is not null then
      insert into shift_assignments (org_id, user_id, shift_id, starts_on, ends_on, note, created_by) values (new.org_id, new.requester_id, new.to_shift_id, new.day, new.day, 'Swap', auth.uid());
    end if;
    if new.with_user_id is not null and new.from_shift_id is not null then
      insert into shift_assignments (org_id, user_id, shift_id, starts_on, ends_on, note, created_by) values (new.org_id, new.with_user_id, new.from_shift_id, new.day, new.day, 'Swap', auth.uid());
    end if;
    new.decided_by := coalesce(new.decided_by, auth.uid()); new.decided_at := coalesce(new.decided_at, now());
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    select x, 'information', 'Shift swap approved for ' || to_char(new.day, 'DD Mon'), coalesce(new.reason, ''), '/attendance?tab=roster', 'shift_swap', new.id, auth.uid() from unnest(array_remove(array[new.requester_id, new.with_user_id], null)) x;
  elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
    insert into notifications (user_id, kind, title, link, entity_type, entity_id, actor_id) values (new.requester_id, 'information', 'Shift swap declined for ' || to_char(new.day, 'DD Mon'), '/attendance?tab=roster', 'shift_swap', new.id, auth.uid());
  end if;
  return new;
end $$;
create trigger shift_swaps_apply before update on shift_swaps for each row execute function shift_swap_apply();

-- attendance board: expose mode + missing checkout; roster falls back to the profile's default shift
drop function if exists attendance_board(date);
create function attendance_board(p_day date default null)
returns table(user_id uuid, full_name text, avatar_url text, designation text, department_id uuid, presence presence_status, status_text text, att_status text, first_in timestamptz, last_out timestamptz, minutes_worked int, late boolean, on_leave boolean, leave_kind text, shift_name text, in_meeting boolean, mode text, missing_checkout boolean)
language sql stable security definer set search_path = public as $$
  with d as (select coalesce(p_day, (now() at time zone 'Asia/Kolkata')::date) as day)
  select p.id, p.full_name, p.avatar_url, p.designation, p.department_id, p.presence, p.status_text,
         coalesce(ad.status, case when l.id is not null then 'leave' else 'absent' end),
         ad.first_in, ad.last_out, coalesce(ad.minutes_worked,0), coalesce(ad.late,false), l.id is not null, l.kind, s.name,
         exists (select 1 from meetings m join meeting_participants mp on mp.meeting_id = m.id where mp.user_id = p.id and now() between m.starts_at and coalesce(m.ends_at, m.starts_at + interval '1 hour')),
         ad.mode, coalesce(ad.missing_checkout, false)
    from d cross join profiles p
    left join attendance_days ad on ad.user_id = p.id and ad.day = d.day
    left join leaves l on l.user_id = p.id and l.status = 'approved' and d.day between l.starts_on and l.ends_on
    left join shifts s on s.id = p.shift_id
   where p.org_id = current_org() and p.is_active and not p.is_external
     and (is_lead_plus() or has_admin_perm('attendance.manage') or p.department_id = current_department() or p.id = auth.uid())
   order by p.full_name
$$;
grant execute on function attendance_board(date) to authenticated; revoke execute on function attendance_board(date) from anon, public;
create or replace function roster(p_from date, p_to date, p_department uuid default null)
returns table(day date, user_id uuid, full_name text, department_id uuid, shift_id uuid, shift_name text, start_time time, end_time time, color text, on_leave boolean)
language sql stable security definer set search_path = public as $$
  select d::date, p.id, p.full_name, p.department_id, s.id, s.name, s.start_time, s.end_time, s.color,
         exists (select 1 from leaves l where l.user_id = p.id and l.status = 'approved' and d::date between l.starts_on and l.ends_on)
    from generate_series(p_from, p_to, interval '1 day') d
    cross join profiles p
    left join lateral (
      select sh.* from shift_assignments sa join shifts sh on sh.id = sa.shift_id
       where sa.user_id = p.id and sa.starts_on <= d::date and (sa.ends_on is null or sa.ends_on >= d::date)
       order by sa.starts_on desc limit 1
    ) sa_s on true
    left join shifts ps on ps.id = p.shift_id
    left join lateral (select coalesce(sa_s.id, ps.id) as id, coalesce(sa_s.name, ps.name) as name, coalesce(sa_s.start_time, ps.start_time) as start_time, coalesce(sa_s.end_time, ps.end_time) as end_time, coalesce(sa_s.color, ps.color) as color, coalesce(sa_s.days, ps.days) as days) s on true
   where p.org_id = current_org() and p.is_active and not p.is_external
     and (p_department is null or p.department_id = p_department)
     and (is_lead_plus() or has_admin_perm('shifts.manage') or p.department_id = current_department())
     and s.id is not null and extract(isodow from d)::int = any(s.days)
   order by d, s.start_time, p.full_name
$$;
