-- ===========================================================================
-- 0019 — Admin-only attendance, breaks, coverage, work-activity & access events
-- Principles: employees see their own record (Privacy Center); admins see the
-- operational picture; NO mouse/keystroke/screen capture — "idle" is operational
-- (no task/message/attendance/focus activity), never device telemetry.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- SETTINGS (org.settings->'attendance'), read through one RPC with defaults
-- ---------------------------------------------------------------------------
create or replace function attendance_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'grace_minutes', 15, 'not_in_alert_minutes', 45, 'checkout_reminder_minutes', 30, 'auto_checkout', true,
    'auto_checkout_after_minutes', 240, 'short_day_minutes', 360, 'early_leave_minutes', 30, 'max_break_minutes_day', 75,
    'break_alert_manager_multiplier', 2, 'daily_summary', true, 'weekly_summary', true, 'idle_hours', 3,
    'employee_alerts', true, 'show_location_to', 'self_hr', 'access_events_retention_days', 180)
  || coalesce((select settings->'attendance' from organizations where id = current_org()), '{}'::jsonb)
$$;
create or replace function set_attendance_settings(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o uuid := current_org(); before jsonb;
begin
  if not (is_admin() or has_admin_perm('attendance.manage') or has_admin_perm('system.manage')) then raise exception 'forbidden'; end if;
  select coalesce(settings->'attendance', '{}'::jsonb) into before from organizations where id = o;
  update organizations set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{attendance}', before || p_patch, true) where id = o;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, old_value, new_value)
  values (o, auth.uid(), 'attendance.settings_changed', 'organization', o, 'Attendance settings updated', before, before || p_patch);
  return attendance_settings();
end $$;

-- ---------------------------------------------------------------------------
-- BREAK TYPES & POLICIES
-- ---------------------------------------------------------------------------
create table break_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  key text not null,
  name text not null,
  max_minutes int not null default 15,
  paid boolean not null default true,
  requires_note boolean not null default false,
  color text not null default '#f59e0b',
  sort_order int not null default 0,
  active boolean not null default true,
  unique (org_id, key)
);
insert into break_types (org_id, key, name, max_minutes, paid, color, sort_order) values
 ('00000000-0000-0000-0000-000000000001','lunch','Lunch',45,true,'#f59e0b',1),
 ('00000000-0000-0000-0000-000000000001','tea','Tea / coffee',15,true,'#d97706',2),
 ('00000000-0000-0000-0000-000000000001','personal','Personal',15,true,'#6366f1',3),
 ('00000000-0000-0000-0000-000000000001','prayer','Prayer',15,true,'#0891b2',4),
 ('00000000-0000-0000-0000-000000000001','errand','Errand (out of office)',60,false,'#dc2626',5);

create table break_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  department_id uuid references departments(id) on delete cascade,      -- null = company default
  shift_id uuid references shifts(id) on delete cascade,
  max_total_minutes int not null default 75,
  max_count int not null default 4,
  min_available int not null default 1,                                  -- people who must stay available in the department
  block_when_uncovered boolean not null default false,                   -- false = warn, true = block
  lunch_window tstzrange,
  note text,
  unique (org_id, department_id, shift_id)
);
insert into break_policies (org_id) values ('00000000-0000-0000-0000-000000000001');

alter table attendance_events add column if not exists break_type text;
alter table attendance_events add column if not exists coverage_warning boolean not null default false;

create or replace function break_policy_for(p_user uuid) returns break_policies
language sql stable security definer set search_path = public as $$
  select bp.* from break_policies bp join profiles p on p.org_id = bp.org_id
   where p.id = p_user and (bp.department_id = p.department_id or bp.department_id is null) and (bp.shift_id = p.shift_id or bp.shift_id is null)
   order by (bp.department_id is not null) desc, (bp.shift_id is not null) desc limit 1
$$;

/** Coverage check used before a break: who would remain available in the department. */
create or replace function coverage_after_break(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'available_now', (select count(*) from profiles x where x.department_id = p.department_id and x.is_active and x.presence in ('available','remote','field') and x.id <> p_user),
    'on_break', (select count(*) from profiles x where x.department_id = p.department_id and x.is_active and x.presence in ('break','lunch')),
    'min_available', coalesce((break_policy_for(p_user)).min_available, 1),
    'block', coalesce((break_policy_for(p_user)).block_when_uncovered, false))
  from profiles p where p.id = p_user
$$;

-- clock(): add break type + policy checks (single signature, no overload)
drop function if exists clock(text, text, text, jsonb, text);
create or replace function clock(p_kind text, p_mode text default 'office', p_note text default null, p_location jsonb default null, p_source text default 'web', p_break_type text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare last_kind text; o uuid; eid uuid; cov jsonb; warn boolean := false; used int; cnt int; pol break_policies; bt break_types; msg text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select org_id into o from profiles where id = auth.uid() and is_active;
  if o is null then raise exception 'inactive'; end if;
  select kind into last_kind from attendance_events where user_id = auth.uid() and (occurred_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date order by occurred_at desc limit 1;
  if p_kind = 'clock_in' and last_kind in ('clock_in','break_start','break_end') then raise exception 'Already clocked in'; end if;
  if p_kind = 'clock_out' and (last_kind is null or last_kind = 'clock_out') then raise exception 'Not clocked in'; end if;
  if p_kind = 'break_start' and (last_kind is null or last_kind not in ('clock_in','break_end')) then raise exception 'Not clocked in'; end if;
  if p_kind = 'break_end' and (last_kind is null or last_kind <> 'break_start') then raise exception 'Not on a break'; end if;
  if p_kind = 'break_start' then
    pol := break_policy_for(auth.uid());
    select * into bt from break_types where org_id = o and key = coalesce(p_break_type, 'tea') and active;
    if bt.requires_note and coalesce(p_note, '') = '' then raise exception 'This break type needs a short note'; end if;
    select coalesce(minutes_break, 0) into used from attendance_days where user_id = auth.uid() and day = (now() at time zone 'Asia/Kolkata')::date;
    select count(*) into cnt from attendance_events where user_id = auth.uid() and kind = 'break_start' and (occurred_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date;
    if pol.id is not null and cnt >= pol.max_count then raise exception 'Break limit reached for today (% breaks). Talk to your lead if you need more.', pol.max_count; end if;
    if pol.id is not null and used >= pol.max_total_minutes then raise exception 'You have used your break time for today (% min).', pol.max_total_minutes; end if;
    cov := coverage_after_break(auth.uid());
    if (cov->>'available_now')::int < (cov->>'min_available')::int then
      if (cov->>'block')::boolean then raise exception 'Nobody else is available in your department right now. Please coordinate before taking a break.'; end if;
      warn := true;
    end if;
  end if;
  insert into attendance_events (org_id, user_id, kind, mode, note, location, source, break_type, coverage_warning)
  values (o, auth.uid(), p_kind, coalesce(p_mode,'office'), p_note, p_location, coalesce(p_source,'web'), case when p_kind = 'break_start' then coalesce(p_break_type,'tea') end, warn) returning id into eid;
  if warn then
    msg := person_name(auth.uid()) || ' started a break; nobody else is marked available in the department.';
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    select coalesce(d.on_duty_user_id, d.head_id), 'information', 'Coverage gap', msg, '/workforce', 'attendance', eid, auth.uid()
      from departments d join profiles p on p.department_id = d.id where p.id = auth.uid() and coalesce(d.on_duty_user_id, d.head_id) is not null and coalesce(d.on_duty_user_id, d.head_id) <> auth.uid();
  end if;
  return jsonb_build_object('id', eid, 'kind', p_kind, 'at', now(), 'coverage_warning', warn, 'break_max_minutes', bt.max_minutes);
end $$;

-- ---------------------------------------------------------------------------
-- COVERAGE REQUIREMENTS, DEPARTMENT COVERAGE, FORECAST, LEAVE COLLISIONS
-- ---------------------------------------------------------------------------
create table coverage_requirements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  label text,
  days int[] not null default '{1,2,3,4,5}',
  from_time time not null default '09:30',
  to_time time not null default '18:30',
  min_people int not null default 1,
  max_leave_same_day int,
  created_at timestamptz not null default now()
);
insert into coverage_requirements (org_id, department_id, label, min_people, max_leave_same_day)
select d.org_id, d.id, 'Business hours', 1, 1 from departments d where d.org_id = '00000000-0000-0000-0000-000000000001';

create or replace function can_see_workforce(p_department uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select is_manager_plus() or has_admin_perm('attendance.manage') or has_admin_perm('hr.manage') or is_hr()
      or (is_lead_plus() and (p_department is null or p_department = current_department()))
      or exists (select 1 from departments d where d.id = p_department and (d.head_id = auth.uid() or d.on_duty_user_id = auth.uid()))
$$;

create or replace function department_coverage(p_at timestamptz default now())
returns table(department_id uuid, name text, color text, required int, available int, on_break int, in_meeting int, on_leave int, remote int, field int, not_in int, shortfall int, on_duty text, status text)
language sql stable security definer set search_path = public as $$
  with d as (select (p_at at time zone 'Asia/Kolkata')::date as day, (p_at at time zone 'Asia/Kolkata')::time as t, extract(isodow from p_at at time zone 'Asia/Kolkata')::int as dow)
  select dp.id, dp.name, dp.color,
    coalesce((select max(cr.min_people) from coverage_requirements cr, d where cr.department_id = dp.id and cr.team_id is null and d.dow = any(cr.days) and d.t between cr.from_time and cr.to_time), 0),
    (select count(*)::int from profiles p where p.department_id = dp.id and p.is_active and p.presence in ('available','busy','focus','on_call')),
    (select count(*)::int from profiles p where p.department_id = dp.id and p.is_active and p.presence in ('break','lunch')),
    (select count(*)::int from profiles p where p.department_id = dp.id and p.is_active and p.presence = 'in_meeting'),
    (select count(*)::int from profiles p, d where p.department_id = dp.id and p.is_active and exists (select 1 from leaves l where l.user_id = p.id and l.status = 'approved' and d.day between l.starts_on and l.ends_on)),
    (select count(*)::int from profiles p where p.department_id = dp.id and p.is_active and p.presence = 'remote'),
    (select count(*)::int from profiles p where p.department_id = dp.id and p.is_active and p.presence = 'field'),
    (select count(*)::int from profiles p, d where p.department_id = dp.id and p.is_active and not p.is_external and not exists (select 1 from attendance_days a where a.user_id = p.id and a.day = d.day) and not exists (select 1 from leaves l where l.user_id = p.id and l.status = 'approved' and d.day between l.starts_on and l.ends_on)),
    greatest(coalesce((select max(cr.min_people) from coverage_requirements cr, d where cr.department_id = dp.id and cr.team_id is null and d.dow = any(cr.days) and d.t between cr.from_time and cr.to_time), 0)
      - (select count(*)::int from profiles p where p.department_id = dp.id and p.is_active and p.presence in ('available','busy','focus','on_call','remote','field')), 0),
    person_name(dp.on_duty_user_id),
    dp.status
  from departments dp where dp.org_id = current_org() and can_see_workforce(null) order by dp.position
$$;

create or replace function coverage_forecast(p_from date default current_date, p_to date default current_date + 13, p_department uuid default null)
returns table(day date, department_id uuid, name text, expected int, on_leave int, required int, risk text, absentees text[])
language sql stable security definer set search_path = public as $$
  select d::date, dp.id, dp.name,
    (select count(*)::int from profiles p where p.department_id = dp.id and p.is_active and not p.is_external and p.status in ('active','probation')),
    (select count(*)::int from profiles p where p.department_id = dp.id and p.is_active and exists (select 1 from leaves l where l.user_id = p.id and l.status in ('approved','pending') and d::date between l.starts_on and l.ends_on)),
    coalesce((select max(cr.min_people) from coverage_requirements cr where cr.department_id = dp.id and cr.team_id is null and extract(isodow from d)::int = any(cr.days)), 0),
    case when extract(isodow from d) in (6,7) then 'weekend'
         when (select count(*) from profiles p where p.department_id = dp.id and p.is_active and not p.is_external and p.status in ('active','probation'))
              - (select count(*) from profiles p where p.department_id = dp.id and p.is_active and exists (select 1 from leaves l where l.user_id = p.id and l.status = 'approved' and d::date between l.starts_on and l.ends_on))
              < coalesce((select max(cr.min_people) from coverage_requirements cr where cr.department_id = dp.id and cr.team_id is null and extract(isodow from d)::int = any(cr.days)), 0) then 'uncovered'
         when (select count(*) from profiles p where p.department_id = dp.id and p.is_active and exists (select 1 from leaves l where l.user_id = p.id and l.status in ('approved','pending') and d::date between l.starts_on and l.ends_on))
              > coalesce((select max(cr.max_leave_same_day) from coverage_requirements cr where cr.department_id = dp.id), 1) then 'thin'
         else 'ok' end,
    (select coalesce(array_agg(p.full_name), '{}') from profiles p where p.department_id = dp.id and p.is_active and exists (select 1 from leaves l where l.user_id = p.id and l.status in ('approved','pending') and d::date between l.starts_on and l.ends_on))
  from generate_series(p_from, p_to, interval '1 day') d cross join departments dp
  where dp.org_id = current_org() and (p_department is null or dp.id = p_department) and can_see_workforce(dp.id)
  order by d, dp.position
$$;

/** Leave collisions for an approval decision: same team/department already away on those days. */
create or replace function leave_collisions(p_leave uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date,
              'also_away', (select coalesce(jsonb_agg(person_name(x.user_id)), '[]') from leaves x join profiles px on px.id = x.user_id where x.id <> l.id and x.status in ('approved','pending') and d::date between x.starts_on and x.ends_on and px.department_id = p.department_id),
              'same_team', (select count(*) from leaves x join profiles px on px.id = x.user_id where x.id <> l.id and x.status = 'approved' and d::date between x.starts_on and x.ends_on and px.team_id = p.team_id and p.team_id is not null),
              'coverage', (select cf.risk from coverage_forecast(d::date, d::date, p.department_id) cf limit 1)) order by d), '[]')
             from generate_series(l.starts_on, l.ends_on, interval '1 day') d),
    'max_leave_same_day', coalesce((select max(max_leave_same_day) from coverage_requirements where department_id = p.department_id), 1),
    'backup_away', exists (select 1 from responsibilities r join leaves x on x.user_id = r.backup_id where r.owner_id = l.user_id and x.status = 'approved' and x.starts_on <= l.ends_on and x.ends_on >= l.starts_on)
  ) from leaves l join profiles p on p.id = l.user_id where l.id = p_leave and (l.user_id = auth.uid() or l.manager_id = auth.uid() or is_manager_of(l.user_id) or is_hr() or has_admin_perm('leave.approve'))
$$;

-- ---------------------------------------------------------------------------
-- WORKFORCE LIVE (admin command center) + EXCEPTIONS + OPERATIONAL INACTIVITY
-- ---------------------------------------------------------------------------
create or replace function workforce_live() returns jsonb
language sql stable security definer set search_path = public as $$
  with d as (select (now() at time zone 'Asia/Kolkata')::date as day),
  scope as (select p.* from profiles p where p.org_id = current_org() and p.is_active and not p.is_external and (can_see_workforce(null) and (is_manager_plus() or has_admin_perm('attendance.manage') or is_hr() or p.department_id = current_department())))
  select case when not can_see_workforce(null) then jsonb_build_object('error','forbidden') else jsonb_build_object(
    'day', (select day from d),
    'counts', (select jsonb_build_object(
        'headcount', count(*),
        'present', count(*) filter (where a.first_in is not null and a.last_out is null),
        'checked_out', count(*) filter (where a.last_out is not null),
        'remote', count(*) filter (where s.presence = 'remote'),
        'field', count(*) filter (where s.presence = 'field'),
        'on_break', count(*) filter (where s.presence in ('break','lunch')),
        'in_meeting', count(*) filter (where s.presence = 'in_meeting'),
        'focus', count(*) filter (where s.presence = 'focus'),
        'late', count(*) filter (where a.late),
        'on_leave', count(*) filter (where l.id is not null),
        'not_in', count(*) filter (where a.first_in is null and l.id is null))
      from scope s, d left join attendance_days a on a.user_id = s.id and a.day = d.day left join leaves l on l.user_id = s.id and l.status = 'approved' and d.day between l.starts_on and l.ends_on),
    'departments', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from department_coverage() c),
    'open_breaks', (select coalesce(jsonb_agg(jsonb_build_object('user_id', e.user_id, 'name', person_name(e.user_id), 'department_id', s.department_id, 'type', e.break_type, 'since', e.occurred_at,
          'minutes', extract(epoch from (now() - e.occurred_at))::int / 60, 'max', bt.max_minutes, 'over', extract(epoch from (now() - e.occurred_at))/60 > coalesce(bt.max_minutes, 15)) order by e.occurred_at), '[]')
        from attendance_events e join scope s on s.id = e.user_id left join break_types bt on bt.org_id = e.org_id and bt.key = e.break_type
        where e.kind = 'break_start' and (e.occurred_at at time zone 'Asia/Kolkata')::date = (select day from d)
          and not exists (select 1 from attendance_events x where x.user_id = e.user_id and x.kind in ('break_end','clock_out') and x.occurred_at > e.occurred_at)),
    'not_in', (select coalesce(jsonb_agg(jsonb_build_object('user_id', s.id, 'name', s.full_name, 'department_id', s.department_id, 'shift_start', sh.start_time,
          'minutes_late', greatest(0, extract(epoch from ((now() at time zone 'Asia/Kolkata')::time - coalesce(sh.start_time, time '09:30')))::int / 60)) order by s.full_name), '[]')
        from scope s, d left join shifts sh on sh.id = s.shift_id
        where not exists (select 1 from attendance_days a where a.user_id = s.id and a.day = d.day)
          and not exists (select 1 from leaves l where l.user_id = s.id and l.status = 'approved' and d.day between l.starts_on and l.ends_on)
          and (now() at time zone 'Asia/Kolkata')::time > coalesce(sh.start_time, time '09:30') and extract(isodow from d.day)::int = any(coalesce(sh.days, '{1,2,3,4,5}'))),
    'missing_checkout', (select coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'name', person_name(a.user_id), 'day', a.day, 'first_in', a.first_in)), '[]')
        from attendance_days a join scope s on s.id = a.user_id, d where a.missing_checkout and a.day < d.day and a.day >= d.day - 3),
    'inactive', operational_inactivity((attendance_settings()->>'idle_hours')::int),
    'exceptions_today', (select count(*) from attendance_exceptions((select day from d), (select day from d), null)),
    'coverage_alerts', (select coalesce(jsonb_agg(jsonb_build_object('department', c.name, 'shortfall', c.shortfall)), '[]') from department_coverage() c where c.shortfall > 0)
  ) end
$$;

/** Operational inactivity: clocked in but no task / message / attendance / focus activity for N hours. Never device telemetry. */
create or replace function operational_inactivity(p_hours int default 3) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', p.id, 'name', p.full_name, 'department_id', p.department_id, 'last_activity', la.at, 'last_kind', la.kind, 'hours', round(extract(epoch from (now() - la.at))/3600, 1)) order by la.at), '[]')
    from profiles p
    join attendance_days a on a.user_id = p.id and a.day = (now() at time zone 'Asia/Kolkata')::date and a.first_in is not null and a.last_out is null
    cross join lateral (
      select max(at) as at, (array_agg(kind order by at desc))[1] as kind from (
        select max(created_at) as at, 'task' as kind from task_history where actor_id = p.id
        union all select max(created_at), 'message' from messages where author_id = p.id
        union all select max(occurred_at), 'attendance' from attendance_events where user_id = p.id
        union all select max(coalesce(ended_at, started_at)), 'focus' from time_entries where user_id = p.id
        union all select max(created_at), 'help' from help_requests where requester_id = p.id or owner_id = p.id
        union all select max(created_at), 'standup' from standups where user_id = p.id
      ) x where at is not null) la
   where p.org_id = current_org() and p.is_active and not p.is_external and p.presence not in ('in_meeting','break','lunch','field')
     and la.at < now() - make_interval(hours => greatest(p_hours, 1))
     and can_see_workforce(p.department_id) and (is_manager_plus() or has_admin_perm('attendance.manage') or is_hr() or p.department_id = current_department())
$$;

create or replace function attendance_exceptions(p_from date, p_to date, p_department uuid default null)
returns table(user_id uuid, full_name text, department_id uuid, day date, kind text, detail text, minutes int)
language sql stable security definer set search_path = public as $$
  with s as (select (attendance_settings()) as j),
  people as (select p.* from profiles p where p.org_id = current_org() and p.is_active and not p.is_external and (p_department is null or p.department_id = p_department)
              and (can_see_workforce(p.department_id) and (is_manager_plus() or has_admin_perm('attendance.manage') or is_hr() or p.department_id = current_department() or p.id = auth.uid()) or p.id = auth.uid()))
  select * from (
    select a.user_id, p.full_name, p.department_id, a.day, 'late', 'Arrived ' || to_char(a.first_in at time zone 'Asia/Kolkata', 'HH24:MI'), extract(epoch from ((a.first_in at time zone 'Asia/Kolkata')::time - coalesce(sh.start_time, time '09:30')))::int / 60
      from attendance_days a join people p on p.id = a.user_id left join shifts sh on sh.id = p.shift_id where a.day between p_from and p_to and a.late
    union all
    select a.user_id, p.full_name, p.department_id, a.day, 'early_leave', 'Left ' || to_char(a.last_out at time zone 'Asia/Kolkata', 'HH24:MI'), extract(epoch from (coalesce(sh.end_time, time '18:30') - (a.last_out at time zone 'Asia/Kolkata')::time))::int / 60
      from attendance_days a join people p on p.id = a.user_id left join shifts sh on sh.id = p.shift_id, s
     where a.day between p_from and p_to and a.last_out is not null and a.mode not in ('half_day') and (a.last_out at time zone 'Asia/Kolkata')::time < coalesce(sh.end_time, time '18:30') - make_interval(mins => (s.j->>'early_leave_minutes')::int)
    union all
    select a.user_id, p.full_name, p.department_id, a.day, 'missing_checkout', 'No check-out recorded', null
      from attendance_days a join people p on p.id = a.user_id where a.day between p_from and p_to and a.missing_checkout and a.day < (now() at time zone 'Asia/Kolkata')::date
    union all
    select a.user_id, p.full_name, p.department_id, a.day, 'short_day', (a.minutes_worked / 60) || 'h ' || (a.minutes_worked % 60) || 'm worked', a.minutes_worked
      from attendance_days a join people p on p.id = a.user_id, s where a.day between p_from and p_to and a.last_out is not null and a.mode not in ('half_day') and a.status not in ('leave','absent') and a.minutes_worked < (s.j->>'short_day_minutes')::int
    union all
    select a.user_id, p.full_name, p.department_id, a.day, 'excess_break', a.minutes_break || ' min on breaks', a.minutes_break
      from attendance_days a join people p on p.id = a.user_id, s where a.day between p_from and p_to and a.minutes_break > (s.j->>'max_break_minutes_day')::int
    union all
    select p.id, p.full_name, p.department_id, d::date, 'absent', 'No attendance and no approved leave', null
      from people p cross join generate_series(p_from, least(p_to, (now() at time zone 'Asia/Kolkata')::date - 1), interval '1 day') d left join shifts sh on sh.id = p.shift_id
     where extract(isodow from d)::int = any(coalesce(sh.days, '{1,2,3,4,5}'))
       and not exists (select 1 from attendance_days a where a.user_id = p.id and a.day = d::date)
       and not exists (select 1 from leaves l where l.user_id = p.id and l.status = 'approved' and d::date between l.starts_on and l.ends_on)
       and p.created_at < d
  ) x order by day desc, full_name
$$;

/** Patterns over a period (admin/manager): repeated exceptions per person — surfaced to the person too. */
create or replace function attendance_patterns(p_from date, p_to date, p_department uuid default null)
returns table(user_id uuid, full_name text, department_id uuid, late int, early_leave int, missing_checkout int, short_day int, excess_break int, absent int, total int)
language sql stable security definer set search_path = public as $$
  select e.user_id, e.full_name, e.department_id,
    count(*) filter (where kind = 'late')::int, count(*) filter (where kind = 'early_leave')::int, count(*) filter (where kind = 'missing_checkout')::int,
    count(*) filter (where kind = 'short_day')::int, count(*) filter (where kind = 'excess_break')::int, count(*) filter (where kind = 'absent')::int, count(*)::int
  from attendance_exceptions(p_from, p_to, p_department) e group by 1,2,3 order by 10 desc
$$;

/** Employee view of their own attendance exceptions (Privacy Center transparency). */
create or replace function my_attendance_exceptions(p_from date, p_to date)
returns table(day date, kind text, detail text, minutes int)
language sql stable security definer set search_path = public as $$
  select e.day, e.kind, e.detail, e.minutes from attendance_exceptions(p_from, p_to, null) e where e.user_id = auth.uid() order by e.day desc
$$;

create or replace function attendance_summary(p_from date, p_to date, p_department uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'days', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'present', d.present, 'late', d.late, 'remote', d.remote, 'leave', d.leave, 'absent', d.absent, 'avg_minutes', d.avg_minutes) order by d.day), '[]')
      from (select a.day, count(*) filter (where a.status not in ('leave','absent')) present, count(*) filter (where a.late) late, count(*) filter (where a.mode = 'remote') remote,
                   count(*) filter (where a.status = 'leave') leave, count(*) filter (where a.status = 'absent') absent, avg(a.minutes_worked) filter (where a.minutes_worked > 0)::int avg_minutes
              from attendance_days a join profiles p on p.id = a.user_id
             where a.org_id = current_org() and a.day between p_from and p_to and (p_department is null or p.department_id = p_department) and can_see_workforce(p.department_id) group by a.day) d),
    'departments', (select coalesce(jsonb_agg(jsonb_build_object('department_id', dp.id, 'name', dp.name, 'headcount', (select count(*) from profiles x where x.department_id = dp.id and x.is_active and not x.is_external),
        'present_days', (select count(*) from attendance_days a join profiles p on p.id = a.user_id where p.department_id = dp.id and a.day between p_from and p_to and a.status not in ('leave','absent')),
        'late', (select count(*) from attendance_days a join profiles p on p.id = a.user_id where p.department_id = dp.id and a.day between p_from and p_to and a.late),
        'avg_minutes', (select avg(a.minutes_worked)::int from attendance_days a join profiles p on p.id = a.user_id where p.department_id = dp.id and a.day between p_from and p_to and a.minutes_worked > 0),
        'exceptions', (select count(*) from attendance_exceptions(p_from, p_to, dp.id)))), '[]')
      from departments dp where dp.org_id = current_org() and (p_department is null or dp.id = p_department) and can_see_workforce(dp.id)),
    'patterns', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select * from attendance_patterns(p_from, p_to, p_department) where total >= 3 limit 20) x)
  )
$$;

-- ---------------------------------------------------------------------------
-- ACCESS EVENTS (who opened/exported what) — visible to the person too
-- ---------------------------------------------------------------------------
create table access_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('view','export','download','print','share','view_as','denied','search')),
  entity_type text,
  entity_id uuid,
  path text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index access_events_user_idx on access_events(user_id, created_at desc);
create index access_events_org_idx on access_events(org_id, created_at desc);
create index access_events_entity_idx on access_events(entity_type, entity_id);
alter table access_events enable row level security;
create policy acc_self on access_events for select to authenticated using (user_id = auth.uid());
create policy acc_admin on access_events for select to authenticated using (org_id = current_org() and (is_admin() or has_admin_perm('security.manage') or has_admin_perm('audit.read')));

create or replace function log_access_event(p_kind text, p_type text default null, p_id uuid default null, p_path text default null, p_details jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  if auth.uid() is null then return; end if;
  select org_id into o from profiles where id = auth.uid();
  if o is null then return; end if;
  -- de-dup rapid repeated views of the same thing (30s)
  if p_kind = 'view' and exists (select 1 from access_events e where e.user_id = auth.uid() and e.kind = 'view' and e.entity_type is not distinct from p_type and e.entity_id is not distinct from p_id and e.path is not distinct from p_path and e.created_at > now() - interval '30 seconds') then return; end if;
  insert into access_events (org_id, user_id, kind, entity_type, entity_id, path, details) values (o, auth.uid(), p_kind, p_type, p_id, p_path, p_details);
  if p_kind in ('export','download','share','view_as','print') then
    insert into security_events (org_id, user_id, kind, details) values (o, auth.uid(), p_kind, jsonb_build_object('entity_type', p_type, 'entity_id', p_id, 'path', p_path) || coalesce(p_details, '{}'::jsonb));
  end if;
end $$;

create or replace function access_event_summary(p_days int default 7) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not (is_admin() or has_admin_perm('security.manage') or has_admin_perm('audit.read')) then jsonb_build_object('error','forbidden') else jsonb_build_object(
    'by_kind', (select coalesce(jsonb_object_agg(kind, n), '{}') from (select kind, count(*) n from access_events where org_id = current_org() and created_at > now() - make_interval(days => p_days) group by kind) x),
    'exports', (select coalesce(jsonb_agg(jsonb_build_object('user', person_name(user_id), 'user_id', user_id, 'kind', kind, 'entity_type', entity_type, 'entity_id', entity_id, 'path', path, 'at', created_at) order by created_at desc), '[]')
                 from (select * from access_events where org_id = current_org() and kind in ('export','download','print','share') and created_at > now() - make_interval(days => p_days) order by created_at desc limit 50) e),
    'denied', (select coalesce(jsonb_agg(jsonb_build_object('user', person_name(user_id), 'user_id', user_id, 'path', path, 'at', created_at) order by created_at desc), '[]')
                 from (select * from access_events where org_id = current_org() and kind = 'denied' and created_at > now() - make_interval(days => p_days) order by created_at desc limit 50) e),
    'top_viewers', (select coalesce(jsonb_agg(jsonb_build_object('user', person_name(user_id), 'user_id', user_id, 'views', n) order by n desc), '[]')
                 from (select user_id, count(*) n from access_events where org_id = current_org() and kind = 'view' and created_at > now() - make_interval(days => p_days) group by user_id order by n desc limit 10) x),
    'sensitive', (select coalesce(jsonb_agg(jsonb_build_object('user', person_name(user_id), 'user_id', user_id, 'entity_type', entity_type, 'entity_id', entity_id, 'at', created_at) order by created_at desc), '[]')
                 from (select * from access_events where org_id = current_org() and entity_type in ('profile_private','employee_document','people_intelligence','payroll','confidential') and created_at > now() - make_interval(days => p_days) order by created_at desc limit 50) e)
  ) end
$$;

create or replace function purge_access_events() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from access_events e using organizations o where o.id = e.org_id and e.created_at < now() - make_interval(days => coalesce((o.settings->'attendance'->>'access_events_retention_days')::int, 180));
  get diagnostics n = row_count; return n;
end $$;

-- ---------------------------------------------------------------------------
-- PEOPLE INTELLIGENCE (owner / super admin only) — aggregated, explainable, no secret scores
-- ---------------------------------------------------------------------------
create or replace function people_intelligence(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare from_d date := (now() at time zone 'Asia/Kolkata')::date - p_days; to_d date := (now() at time zone 'Asia/Kolkata')::date; o uuid := current_org();
begin
  if not (is_primary_admin() or is_admin() or has_admin_perm('hr.manage')) then return jsonb_build_object('error','forbidden'); end if;
  perform log_access_event('view', 'people_intelligence', null, '/admin/people-intelligence', jsonb_build_object('days', p_days));
  return jsonb_build_object(
    'from', from_d, 'to', to_d,
    'attendance', (select jsonb_build_object(
        'avg_minutes', avg(minutes_worked) filter (where minutes_worked > 0)::int,
        'late_rate', round(100.0 * count(*) filter (where late) / greatest(count(*), 1), 1),
        'remote_rate', round(100.0 * count(*) filter (where mode = 'remote') / greatest(count(*), 1), 1),
        'avg_break', avg(minutes_break)::int,
        'long_days', count(*) filter (where minutes_worked > 600))
       from attendance_days where org_id = o and day between from_d and to_d),
    'departments', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name,
        'headcount', (select count(*) from profiles p where p.department_id = d.id and p.is_active and not p.is_external),
        'avg_minutes', (select avg(a.minutes_worked)::int from attendance_days a join profiles p on p.id = a.user_id where p.department_id = d.id and a.day between from_d and to_d and a.minutes_worked > 0),
        'late_rate', (select round(100.0 * count(*) filter (where a.late) / greatest(count(*), 1), 1) from attendance_days a join profiles p on p.id = a.user_id where p.department_id = d.id and a.day between from_d and to_d),
        'open_tasks', (select count(*) from tasks t where t.department_id = d.id and t.status not in ('done','cancelled')),
        'overdue', (select count(*) from tasks t where t.department_id = d.id and t.status not in ('done','cancelled') and t.due_date < now()),
        'help_over_sla', (select count(*) from help_requests h where h.department_id = d.id and h.status in ('new','accepted','working') and h.ack_due_at < now()),
        'leave_days', (select coalesce(sum(least(l.ends_on, to_d) - greatest(l.starts_on, from_d) + 1), 0) from leaves l join profiles p on p.id = l.user_id where p.department_id = d.id and l.status = 'approved' and l.ends_on >= from_d and l.starts_on <= to_d),
        'exceptions', (select count(*) from attendance_exceptions(from_d, to_d, d.id)),
        'no_backup', (select count(*) from responsibilities r join profiles p on p.id = r.owner_id where p.department_id = d.id and r.critical and r.backup_id is null),
        'workload_spread', (select jsonb_build_object('max', max(n), 'min', min(n), 'avg', round(avg(n), 1)) from (select count(t.id) n from profiles p left join tasks t on t.assignee_id = p.id and t.status not in ('done','cancelled') where p.department_id = d.id and p.is_active and not p.is_external group by p.id) w)
      ) order by d.position), '[]') from departments d where d.org_id = o),
    'key_person_risk', (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.id, 'name', p.full_name, 'department', (select name from departments where id = p.department_id), 'critical_responsibilities', r.n, 'no_backup', r.nb, 'waiting_on', w.n) order by r.nb desc, w.n desc), '[]')
       from profiles p
       join lateral (select count(*) n, count(*) filter (where backup_id is null) nb from responsibilities x where x.owner_id = p.id and x.critical) r on true
       join lateral (select count(*) n from tasks t where t.waiting_on_user_id = p.id and t.status not in ('done','cancelled')) w on true
       where p.org_id = o and p.is_active and (r.nb > 0 or w.n >= 3) limit 15),
    'overload', (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.id, 'name', p.full_name, 'open', x.n, 'urgent', x.u, 'avg_minutes', x.m, 'long_days', x.ld) order by x.u desc, x.n desc), '[]')
       from profiles p join lateral (select count(*) n, count(*) filter (where priority in ('critical','urgent')) u,
           (select avg(minutes_worked)::int from attendance_days a where a.user_id = p.id and a.day between from_d and to_d and a.minutes_worked > 0) m,
           (select count(*) from attendance_days a where a.user_id = p.id and a.day between from_d and to_d and a.minutes_worked > 600) ld
           from tasks t where t.assignee_id = p.id and t.status not in ('done','cancelled')) x on true
       where p.org_id = o and p.is_active and (x.n >= 10 or x.u >= 3 or x.ld >= 5) limit 15),
    'attention', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from (select * from attendance_patterns(from_d, to_d, null) where total >= 4 order by total desc limit 15) x),
    'probation', (select coalesce(jsonb_agg(jsonb_build_object('user_id', id, 'name', full_name, 'ends', probation_ends_on)), '[]') from profiles where org_id = o and is_active and probation_ends_on is not null and probation_ends_on between to_d and to_d + 30),
    'leave_pressure', (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.id, 'name', p.full_name, 'balance', b.balance) order by b.balance desc), '[]')
       from profiles p join lateral (select coalesce(sum(allocated - used), 0) balance from leave_balances lb where lb.user_id = p.id and lb.year = extract(year from now())::int) b on true
       where p.org_id = o and p.is_active and b.balance >= 15 limit 15),
    'access', access_event_summary(p_days) - 'top_viewers',
    'explain', 'Aggregated operational signals only: attendance days, task load, responsibilities, leave. No device telemetry, no inferred traits, no ranking. Each person can see their own underlying data in Privacy Center.'
  );
end $$;

-- ---------------------------------------------------------------------------
-- CRON JOBS: not-clocked-in nudges, break exceeded, coverage, checkout reminders, auto checkout, summaries, purge
-- ---------------------------------------------------------------------------
create or replace function attendance_cron_tick() returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; b record; s jsonb; n_notin int := 0; n_break int := 0; n_cov int := 0; n_out int := 0; t_local time := (now() at time zone 'Asia/Kolkata')::time; d_local date := (now() at time zone 'Asia/Kolkata')::date;
begin
  for r in select o.id as org_id from organizations o loop
    s := jsonb_build_object('not_in_alert_minutes', 45, 'checkout_reminder_minutes', 30, 'employee_alerts', true, 'break_alert_manager_multiplier', 2) || coalesce((select settings->'attendance' from organizations where id = r.org_id), '{}'::jsonb);
    -- 1) not clocked in after shift start + N minutes (weekdays of their shift), once per day, to the person and their manager
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id)
    select p.id, 'information', 'Forgot to check in?', 'You have not checked in today. If you are working, check in from the clock in the top bar; if you are on leave, apply so your team knows.', '/attendance', 'attendance_missing', p.id
      from profiles p left join shifts sh on sh.id = p.shift_id
     where p.org_id = r.org_id and p.is_active and not p.is_external and p.status in ('active','probation') and (s->>'employee_alerts')::boolean
       and extract(isodow from d_local)::int = any(coalesce(sh.days, '{1,2,3,4,5}'))
       and t_local > coalesce(sh.start_time, time '09:30') + make_interval(mins => (s->>'not_in_alert_minutes')::int)
       and t_local < coalesce(sh.start_time, time '09:30') + interval '4 hours'
       and not exists (select 1 from attendance_days a where a.user_id = p.id and a.day = d_local)
       and not exists (select 1 from leaves l where l.user_id = p.id and l.status = 'approved' and d_local between l.starts_on and l.ends_on)
       and not exists (select 1 from notifications n where n.user_id = p.id and n.entity_type = 'attendance_missing' and n.created_at::date = current_date);
    get diagnostics n_notin = row_count;
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    select p.manager_id, 'information', person_name(p.id) || ' has not checked in', 'No check-in and no approved leave today.', '/workforce', 'attendance_missing_mgr', p.id, p.id
      from profiles p where p.org_id = r.org_id and p.manager_id is not null
       and exists (select 1 from notifications n where n.user_id = p.id and n.entity_type = 'attendance_missing' and n.created_at > now() - interval '90 minutes' and n.created_at < now() - interval '60 minutes')
       and not exists (select 1 from attendance_days a where a.user_id = p.id and a.day = d_local)
       and not exists (select 1 from notifications n where n.user_id = p.manager_id and n.entity_type = 'attendance_missing_mgr' and n.entity_id = p.id and n.created_at::date = current_date);
    -- 2) break exceeded: person at max, manager at multiplier
    for b in select e.id, e.user_id, e.org_id, e.occurred_at, coalesce(bt.max_minutes, 15) as mx, p.manager_id, extract(epoch from (now() - e.occurred_at))::int / 60 as mins
               from attendance_events e join profiles p on p.id = e.user_id left join break_types bt on bt.org_id = e.org_id and bt.key = e.break_type
              where e.org_id = r.org_id and e.kind = 'break_start' and e.occurred_at > now() - interval '12 hours'
                and not exists (select 1 from attendance_events x where x.user_id = e.user_id and x.kind in ('break_end','clock_out') and x.occurred_at > e.occurred_at) loop
      if b.mins >= b.mx and not exists (select 1 from notifications n where n.user_id = b.user_id and n.entity_type = 'break_over' and n.entity_id = b.id) then
        insert into notifications (user_id, kind, title, body, link, entity_type, entity_id) values (b.user_id, 'information', 'Break time is up', 'Your break has passed ' || b.mx || ' minutes. Tap "End break" when you are back.', '/attendance', 'break_over', b.id);
        n_break := n_break + 1;
      end if;
      if b.manager_id is not null and b.mins >= b.mx * (s->>'break_alert_manager_multiplier')::int and not exists (select 1 from notifications n where n.user_id = b.manager_id and n.entity_type = 'break_over_mgr' and n.entity_id = b.id) then
        insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id) values (b.manager_id, 'information', person_name(b.user_id) || ' is still on a break', b.mins || ' minutes so far (limit ' || b.mx || '). They may have forgotten to end it.', '/workforce', 'break_over_mgr', b.id, b.user_id);
      end if;
    end loop;
    -- 3) coverage shortfall now → on-duty / head (once per hour)
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id)
    select coalesce(d.on_duty_user_id, d.head_id), 'action_required', d.name || ' is under-covered', 'Fewer people available than the coverage requirement right now.', '/workforce', 'coverage_gap', d.id
      from departments d
     where d.org_id = r.org_id and coalesce(d.on_duty_user_id, d.head_id) is not null and t_local between time '08:00' and time '21:00' and extract(isodow from d_local) between 1 and 6
       and exists (select 1 from coverage_requirements cr where cr.department_id = d.id and cr.team_id is null and extract(isodow from d_local)::int = any(cr.days) and t_local between cr.from_time and cr.to_time
                     and cr.min_people > (select count(*) from profiles p where p.department_id = d.id and p.is_active and p.presence in ('available','busy','focus','on_call','remote','field')))
       and not exists (select 1 from notifications n where n.user_id = coalesce(d.on_duty_user_id, d.head_id) and n.entity_type = 'coverage_gap' and n.entity_id = d.id and n.created_at > now() - interval '1 hour');
    get diagnostics n_cov = row_count;
    -- 4) checkout reminder after shift end + N minutes
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id)
    select a.user_id, 'information', 'Still working?', 'Your shift ended a while ago and you are still checked in. Check out when you finish so your day is recorded correctly.', '/attendance', 'checkout_reminder', a.user_id
      from attendance_days a join profiles p on p.id = a.user_id left join shifts sh on sh.id = p.shift_id
     where a.org_id = r.org_id and a.day = d_local and a.first_in is not null and a.last_out is null and (s->>'employee_alerts')::boolean
       and t_local > coalesce(sh.end_time, time '18:30') + make_interval(mins => (s->>'checkout_reminder_minutes')::int)
       and coalesce(sh.end_time, time '18:30') > coalesce(sh.start_time, time '09:30')
       and not exists (select 1 from notifications n where n.user_id = a.user_id and n.entity_type = 'checkout_reminder' and n.created_at::date = current_date);
    get diagnostics n_out = row_count;
  end loop;
  return jsonb_build_object('not_in', n_notin, 'breaks', n_break, 'coverage', n_cov, 'checkout', n_out);
end $$;

/** Nightly: close days left open. Adds a system clock_out at shift end (or last activity) and keeps the day flagged missing_checkout. */
create or replace function attendance_auto_checkout() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; when_out timestamptz;
begin
  for r in select a.user_id, a.org_id, a.day, a.first_in, coalesce(sh.end_time, time '18:30') as end_time, p.last_seen_at
             from attendance_days a join profiles p on p.id = a.user_id left join shifts sh on sh.id = p.shift_id
            where a.first_in is not null and a.last_out is null and a.day < (now() at time zone 'Asia/Kolkata')::date
              and coalesce((select (settings->'attendance'->>'auto_checkout')::boolean from organizations o where o.id = a.org_id), true) loop
    when_out := greatest(r.first_in + interval '1 minute', least(coalesce(r.last_seen_at, r.first_in), (r.day::timestamp + r.end_time) at time zone 'Asia/Kolkata'));
    if when_out < r.first_in then when_out := r.first_in + interval '1 minute'; end if;
    insert into attendance_events (org_id, user_id, kind, mode, occurred_at, source, note) values (r.org_id, r.user_id, 'clock_out', 'office', when_out, 'auto', 'Auto check-out: no check-out was recorded');
    update attendance_days set missing_checkout = true where user_id = r.user_id and day = r.day;
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id)
    values (r.user_id, 'information', 'We closed your day for ' || to_char(r.day, 'DD Mon'), 'No check-out was recorded, so the day was closed automatically at ' || to_char(when_out at time zone 'Asia/Kolkata', 'HH24:MI') || '. Ask your manager for a correction if that is wrong.', '/attendance', 'auto_checkout', r.user_id);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function attendance_daily_summary() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; y date := (now() at time zone 'Asia/Kolkata')::date - 1; body text; cnt record;
begin
  if extract(isodow from y) = 7 then return 0; end if;
  for r in select d.id, d.name, d.org_id, coalesce(d.head_id, d.on_duty_user_id) as to_user from departments d where coalesce(d.head_id, d.on_duty_user_id) is not null loop
    select count(*) filter (where a.status not in ('leave','absent')) present, count(*) filter (where a.late) late, count(*) filter (where a.missing_checkout) mc,
           (select count(*) from profiles p where p.department_id = r.id and p.is_active and not p.is_external and p.status in ('active','probation')) head,
           (select count(*) from profiles p where p.department_id = r.id and p.is_active and exists (select 1 from leaves l where l.user_id = p.id and l.status = 'approved' and y between l.starts_on and l.ends_on)) lv
      into cnt from attendance_days a join profiles p on p.id = a.user_id where p.department_id = r.id and a.day = y;
    if cnt.head = 0 then continue; end if;
    body := format('%s of %s present · %s late · %s on leave · %s without check-out · %s absent', cnt.present, cnt.head, cnt.late, cnt.lv, cnt.mc, greatest(cnt.head - cnt.present - cnt.lv, 0));
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id) values (r.to_user, 'information', r.name || ' — attendance ' || to_char(y, 'DD Mon'), body, '/workforce?tab=exceptions', 'attendance_summary', r.id);
    n := n + 1;
  end loop;
  -- HR / attendance admins get the company line
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id)
  select distinct aa.user_id, 'information', 'Company attendance ' || to_char(y, 'DD Mon'),
         (select format('%s present · %s late · %s remote · %s missing check-out', count(*) filter (where status not in ('leave','absent')), count(*) filter (where late), count(*) filter (where mode = 'remote'), count(*) filter (where missing_checkout)) from attendance_days where day = y),
         '/workforce', 'attendance_summary_hr', null
    from admin_assignments aa join admin_roles ar on ar.id = aa.admin_role_id where ('attendance.manage' = any(ar.permissions) or 'hr.manage' = any(ar.permissions) or '*' = any(ar.permissions)) and (aa.expires_at is null or aa.expires_at > now());
  return n;
end $$;

select cron.schedule('ghl_attendance_tick', '*/10 * * * *', $$select attendance_cron_tick()$$);
select cron.schedule('ghl_auto_checkout', '30 20 * * *', $$select attendance_auto_checkout()$$);
select cron.schedule('ghl_attendance_daily', '35 3 * * 1-6', $$select attendance_daily_summary()$$);
select cron.schedule('ghl_access_purge', '15 21 * * *', $$select purge_access_events()$$);

-- ---------------------------------------------------------------------------
-- RLS + GRANTS
-- ---------------------------------------------------------------------------
alter table break_types enable row level security;
alter table break_policies enable row level security;
alter table coverage_requirements enable row level security;
create policy bt_read on break_types for select to authenticated using (org_id = current_org());
create policy bt_write on break_types for all to authenticated using (org_id = current_org() and (is_admin() or has_admin_perm('attendance.manage') or is_hr())) with check (org_id = current_org() and (is_admin() or has_admin_perm('attendance.manage') or is_hr()));
create policy bp_read on break_policies for select to authenticated using (org_id = current_org());
create policy bp_write on break_policies for all to authenticated using (org_id = current_org() and (is_admin() or has_admin_perm('attendance.manage') or is_hr())) with check (org_id = current_org() and (is_admin() or has_admin_perm('attendance.manage') or is_hr()));
create policy cr_read on coverage_requirements for select to authenticated using (org_id = current_org() and is_active_member());
create policy cr_write on coverage_requirements for all to authenticated using (org_id = current_org() and (is_admin() or has_admin_perm('attendance.manage') or has_admin_perm('shifts.manage') or is_hr() or exists (select 1 from departments d where d.id = department_id and d.head_id = auth.uid()))) with check (org_id = current_org() and (is_admin() or has_admin_perm('attendance.manage') or has_admin_perm('shifts.manage') or is_hr() or exists (select 1 from departments d where d.id = department_id and d.head_id = auth.uid())));

grant execute on function attendance_settings(), set_attendance_settings(jsonb), break_policy_for(uuid), coverage_after_break(uuid), clock(text,text,text,jsonb,text,text), can_see_workforce(uuid),
  department_coverage(timestamptz), coverage_forecast(date,date,uuid), leave_collisions(uuid), workforce_live(), operational_inactivity(int), attendance_exceptions(date,date,uuid), attendance_patterns(date,date,uuid),
  my_attendance_exceptions(date,date), attendance_summary(date,date,uuid), log_access_event(text,text,uuid,text,jsonb), access_event_summary(int), people_intelligence(int) to authenticated;
revoke execute on function attendance_settings(), set_attendance_settings(jsonb), break_policy_for(uuid), coverage_after_break(uuid), clock(text,text,text,jsonb,text,text), can_see_workforce(uuid),
  department_coverage(timestamptz), coverage_forecast(date,date,uuid), leave_collisions(uuid), workforce_live(), operational_inactivity(int), attendance_exceptions(date,date,uuid), attendance_patterns(date,date,uuid),
  my_attendance_exceptions(date,date), attendance_summary(date,date,uuid), log_access_event(text,text,uuid,text,jsonb), access_event_summary(int), people_intelligence(int),
  attendance_cron_tick(), attendance_auto_checkout(), attendance_daily_summary(), purge_access_events() from anon, public;
revoke execute on function attendance_cron_tick(), attendance_auto_checkout(), attendance_daily_summary(), purge_access_events() from authenticated;
