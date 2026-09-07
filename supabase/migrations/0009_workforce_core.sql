-- Phase 4 wave 1 (part 1): employee master record, attendance, leave, shifts, focus time, activity.

-- ---------------------------------------------------------------------------
-- EMPLOYEE MASTER RECORD
-- ---------------------------------------------------------------------------
create sequence if not exists employee_code_seq start 1;
alter table profiles
  add column if not exists employee_code text,
  add column if not exists employment_type text not null default 'full_time',   -- full_time | part_time | contract | intern | consultant | vendor
  add column if not exists work_mode text not null default 'office',            -- office | remote | hybrid | field
  add column if not exists location text,
  add column if not exists secondary_manager_id uuid references profiles(id) on delete set null,
  add column if not exists languages text[] not null default '{}',
  add column if not exists qualifications text,
  add column if not exists responsibilities text,
  add column if not exists shift_id uuid,
  add column if not exists probation_ends_on date,
  add column if not exists status_until timestamptz;
create unique index if not exists profiles_employee_code_idx on profiles(org_id, employee_code) where employee_code is not null;

create or replace function assign_employee_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.employee_code is null and new.is_active then
    new.employee_code := 'GHL' || lpad(nextval('employee_code_seq')::text, 4, '0');
  end if;
  return new;
end $$;
create trigger profiles_employee_code before insert or update of is_active on profiles for each row execute function assign_employee_code();
update profiles set employee_code = 'GHL' || lpad(nextval('employee_code_seq')::text, 4, '0') where employee_code is null and is_active;

-- ---------------------------------------------------------------------------
-- ADMIN PERMISSIONS (granular admin roles; used by policies below)
-- ---------------------------------------------------------------------------
create table admin_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  permissions text[] not null default '{}',   -- see ADMIN_PERMISSIONS in the app
  is_system boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table admin_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  admin_role_id uuid not null references admin_roles(id) on delete cascade,
  scope_department_id uuid references departments(id) on delete cascade,
  granted_by uuid references profiles(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, admin_role_id, scope_department_id)
);
create index admin_assignments_user_idx on admin_assignments(user_id);

create or replace function is_primary_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (o.settings->>'primary_admin_id')::uuid = auth.uid() from organizations o where o.id = current_org()), false)
      or coalesce((select role = 'super_admin' from profiles where id = auth.uid()), false)
$$;

create or replace function has_admin_perm(perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' from profiles where id = auth.uid()), false)
      or exists (
        select 1 from admin_assignments a join admin_roles r on r.id = a.admin_role_id
         where a.user_id = auth.uid() and (a.expires_at is null or a.expires_at > now())
           and (perm = any(r.permissions) or '*' = any(r.permissions))
      )
$$;

alter table admin_roles enable row level security;
alter table admin_assignments enable row level security;
create policy ar_read on admin_roles for select to authenticated using (org_id = current_org() and is_manager_plus());
create policy ar_write on admin_roles for all to authenticated using (org_id = current_org() and is_primary_admin()) with check (org_id = current_org() and is_primary_admin());
create policy aa_read on admin_assignments for select to authenticated using (org_id = current_org() and (user_id = auth.uid() or is_manager_plus()));
create policy aa_write on admin_assignments for all to authenticated using (org_id = current_org() and is_primary_admin()) with check (org_id = current_org() and is_primary_admin());

insert into admin_roles (org_id, name, description, permissions, is_system) values
 ('00000000-0000-0000-0000-000000000001', 'Full Super Admin', 'Everything except primary-admin transfer', '{*}', true),
 ('00000000-0000-0000-0000-000000000001', 'HR Admin', 'Employees, attendance, leave, shifts, onboarding, private records', '{people.manage,attendance.manage,leave.approve,shifts.manage,hr.manage}', true),
 ('00000000-0000-0000-0000-000000000001', 'IT Admin', 'Integrations, automations, feature flags, system settings', '{integrations.manage,automations.manage,features.manage,system.manage}', true),
 ('00000000-0000-0000-0000-000000000001', 'Security Admin', 'Access requests, grants, audit, security events', '{access.approve,audit.read,security.manage}', true),
 ('00000000-0000-0000-0000-000000000001', 'Department Admin', 'Manage one department: teams, requests, service catalog, on-duty', '{department.manage}', true),
 ('00000000-0000-0000-0000-000000000001', 'Project Admin', 'All projects', '{projects.manage}', true),
 ('00000000-0000-0000-0000-000000000001', 'Communication Admin', 'Channels, groups, announcements, broadcasts', '{communication.manage}', true),
 ('00000000-0000-0000-0000-000000000001', 'AI Admin', 'AI assistants, knowledge, usage', '{ai.manage}', true);

-- Restricted personal data lives apart from the directory (HR/admin/self only)
create table profiles_private (
  user_id uuid primary key references profiles(id) on delete cascade,
  emergency_contact jsonb,          -- {name, relation, phone}
  personal_email text,
  address text,
  date_of_birth date,
  show_birthday boolean not null default false,
  notes text,
  updated_at timestamptz not null default now()
);
alter table profiles_private enable row level security;
create policy pp_self on profiles_private for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pp_hr on profiles_private for select to authenticated using (is_admin() or has_admin_perm('hr.manage'));

-- ---------------------------------------------------------------------------
-- SHIFTS & ROSTER
-- ---------------------------------------------------------------------------
create table shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  kind text not null default 'fixed',           -- fixed | flexible | rotational | night | weekend | split
  start_time time not null default '09:30',
  end_time time not null default '18:30',
  days int[] not null default '{1,2,3,4,5}',    -- ISO weekdays
  color text not null default '#2563eb',
  department_id uuid references departments(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table profiles add constraint profiles_shift_fk foreign key (shift_id) references shifts(id) on delete set null;
create table shift_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  shift_id uuid not null references shifts(id) on delete cascade,
  starts_on date not null,
  ends_on date,                                  -- null = ongoing
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index shift_assignments_user_idx on shift_assignments(user_id, starts_on desc);
create table shift_swaps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  requester_id uuid not null references profiles(id) on delete cascade,
  with_user_id uuid references profiles(id) on delete set null,
  day date not null,
  from_shift_id uuid references shifts(id) on delete set null,
  to_shift_id uuid references shifts(id) on delete set null,
  reason text,
  status approval_status not null default 'pending',
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
insert into shifts (org_id, name, kind, start_time, end_time, days, color) values
 ('00000000-0000-0000-0000-000000000001','General',' fixed'::text,'09:30','18:30','{1,2,3,4,5}','#2563eb'),
 ('00000000-0000-0000-0000-000000000001','Support early','fixed','07:00','16:00','{1,2,3,4,5,6}','#0891b2'),
 ('00000000-0000-0000-0000-000000000001','Support late','fixed','13:00','22:00','{1,2,3,4,5,6}','#7c3aed'),
 ('00000000-0000-0000-0000-000000000001','Night','night','22:00','07:00','{1,2,3,4,5}','#0f172a'),
 ('00000000-0000-0000-0000-000000000001','Flexible','flexible','10:00','19:00','{1,2,3,4,5}','#059669');

create or replace function roster(p_from date, p_to date, p_department uuid default null)
returns table(day date, user_id uuid, full_name text, department_id uuid, shift_id uuid, shift_name text, start_time time, end_time time, color text, on_leave boolean)
language sql stable security definer set search_path = public as $$
  select d::date, p.id, p.full_name, p.department_id, s.id, s.name, s.start_time, s.end_time, s.color,
         exists (select 1 from leaves l where l.user_id = p.id and l.status = 'approved' and d::date between l.starts_on and l.ends_on)
    from generate_series(p_from, p_to, interval '1 day') d
    cross join profiles p
    left join lateral (
      select s.* from shift_assignments sa join shifts s on s.id = sa.shift_id
       where sa.user_id = p.id and sa.starts_on <= d::date and (sa.ends_on is null or sa.ends_on >= d::date)
       order by sa.starts_on desc limit 1
    ) s on true
   where p.org_id = current_org() and p.is_active and not p.is_external
     and (p_department is null or p.department_id = p_department)
     and (is_lead_plus() or has_admin_perm('shifts.manage') or p.department_id = current_department())
     and s.id is not null and extract(isodow from d)::int = any(s.days)
   order by d, s.start_time, p.full_name
$$;

alter table shifts enable row level security;
alter table shift_assignments enable row level security;
alter table shift_swaps enable row level security;
create policy sh_read on shifts for select to authenticated using (org_id = current_org());
create policy sh_write on shifts for all to authenticated using (org_id = current_org() and (is_manager_plus() or has_admin_perm('shifts.manage'))) with check (org_id = current_org() and (is_manager_plus() or has_admin_perm('shifts.manage')));
create policy sa_read on shift_assignments for select to authenticated using (org_id = current_org() and (user_id = auth.uid() or is_lead_plus() or has_admin_perm('shifts.manage') or exists (select 1 from profiles p where p.id = user_id and p.department_id = current_department())));
create policy sa_write on shift_assignments for all to authenticated using (org_id = current_org() and (is_manager_plus() or has_admin_perm('shifts.manage'))) with check (org_id = current_org() and (is_manager_plus() or has_admin_perm('shifts.manage')));
create policy ss_read on shift_swaps for select to authenticated using (org_id = current_org() and (requester_id = auth.uid() or with_user_id = auth.uid() or is_lead_plus()));
create policy ss_insert on shift_swaps for insert to authenticated with check (org_id = current_org() and requester_id = auth.uid());
create policy ss_update on shift_swaps for update to authenticated using (org_id = current_org() and (is_lead_plus() or has_admin_perm('shifts.manage') or with_user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- ATTENDANCE
-- ---------------------------------------------------------------------------
create table attendance_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('clock_in','clock_out','break_start','break_end')),
  mode text not null default 'office' check (mode in ('office','remote','field','client_visit','travel','training','half_day')),
  occurred_at timestamptz not null default now(),
  source text not null default 'web',          -- web | mobile | kiosk | qr | api
  note text,
  location jsonb,                              -- only when the employee explicitly shared it at check-in
  created_at timestamptz not null default now()
);
create index attendance_events_user_idx on attendance_events(user_id, occurred_at desc);

create table attendance_days (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  first_in timestamptz,
  last_out timestamptz,
  minutes_worked int not null default 0,
  minutes_break int not null default 0,
  mode text,
  status text not null default 'present',      -- present | late | half_day | remote | field | travel | training | leave | absent
  late boolean not null default false,
  missing_checkout boolean not null default false,
  corrected_by uuid references profiles(id) on delete set null,
  correction_note text,
  primary key (user_id, day)
);
create index attendance_days_org_day_idx on attendance_days(org_id, day desc);

create or replace function attendance_recompute(p_user uuid, p_day date) returns void
language plpgsql security definer set search_path = public as $$
declare
  e record; open_in timestamptz; open_break timestamptz; worked int := 0; brk int := 0; fin timestamptz; lout timestamptz; md text; o uuid;
  wstart time; grace int; late_flag boolean := false; st text;
begin
  select org_id into o from profiles where id = p_user;
  select coalesce((settings->'working_hours'->>'start')::time, time '09:30'), coalesce((settings->'attendance'->>'grace_minutes')::int, 15)
    into wstart, grace from organizations where id = o;
  for e in select * from attendance_events where user_id = p_user and (occurred_at at time zone 'Asia/Kolkata')::date = p_day order by occurred_at loop
    if e.kind = 'clock_in' then
      if fin is null then fin := e.occurred_at; md := e.mode; end if;
      open_in := e.occurred_at;
    elsif e.kind = 'clock_out' then
      if open_in is not null then worked := worked + extract(epoch from (e.occurred_at - open_in))/60; open_in := null; end if;
      if open_break is not null then open_break := null; end if;
      lout := e.occurred_at;
    elsif e.kind = 'break_start' then open_break := e.occurred_at;
    elsif e.kind = 'break_end' then
      if open_break is not null then brk := brk + extract(epoch from (e.occurred_at - open_break))/60; open_break := null; end if;
    end if;
  end loop;
  if fin is null then
    delete from attendance_days where user_id = p_user and day = p_day and status not in ('leave','absent');
    return;
  end if;
  late_flag := (fin at time zone 'Asia/Kolkata')::time > (wstart + (grace * interval '1 minute'));
  st := case when md = 'half_day' then 'half_day' when md in ('remote','field','travel','training') then md when late_flag then 'late' else 'present' end;
  insert into attendance_days (org_id, user_id, day, first_in, last_out, minutes_worked, minutes_break, mode, status, late, missing_checkout)
  values (o, p_user, p_day, fin, lout, greatest(worked - brk, 0), brk, md, st, late_flag, lout is null)
  on conflict (user_id, day) do update set first_in = excluded.first_in, last_out = excluded.last_out, minutes_worked = excluded.minutes_worked,
    minutes_break = excluded.minutes_break, mode = excluded.mode, status = excluded.status, late = excluded.late, missing_checkout = excluded.missing_checkout;
end $$;

create or replace function attendance_after_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare pres presence_status; txt text;
begin
  perform attendance_recompute(new.user_id, (new.occurred_at at time zone 'Asia/Kolkata')::date);
  pres := case new.kind
    when 'clock_in' then (case when new.mode = 'remote' then 'remote' when new.mode in ('field','client_visit','travel') then 'field' else 'available' end)::presence_status
    when 'clock_out' then 'offline'::presence_status
    when 'break_start' then 'break'::presence_status
    when 'break_end' then 'available'::presence_status end;
  txt := case new.kind when 'clock_in' then case when new.mode = 'office' then null else initcap(replace(new.mode,'_',' ')) end when 'clock_out' then 'Checked out' when 'break_start' then 'On a break' else null end;
  update profiles set presence = pres, status_text = txt, last_seen_at = now() where id = new.user_id;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value)
  values (new.org_id, new.user_id, 'attendance.' || new.kind, 'attendance', new.id, initcap(replace(new.kind,'_',' ')) || case when new.kind = 'clock_in' then ' (' || new.mode || ')' else '' end, jsonb_build_object('mode', new.mode, 'source', new.source));
  return null;
end $$;
create trigger attendance_events_after_insert after insert on attendance_events for each row execute function attendance_after_event();

/** Employee action: clock in/out or break, with mode. Enforces sensible sequencing. */
create or replace function clock(p_kind text, p_mode text default 'office', p_note text default null, p_location jsonb default null, p_source text default 'web') returns jsonb
language plpgsql security definer set search_path = public as $$
declare last_kind text; o uuid; eid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select org_id into o from profiles where id = auth.uid() and is_active;
  if o is null then raise exception 'inactive'; end if;
  select kind into last_kind from attendance_events where user_id = auth.uid() and (occurred_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date order by occurred_at desc limit 1;
  if p_kind = 'clock_in' and last_kind in ('clock_in','break_start','break_end') then raise exception 'Already clocked in'; end if;
  if p_kind = 'clock_out' and (last_kind is null or last_kind = 'clock_out') then raise exception 'Not clocked in'; end if;
  if p_kind = 'break_start' and (last_kind is null or last_kind not in ('clock_in','break_end')) then raise exception 'Not clocked in'; end if;
  if p_kind = 'break_end' and (last_kind is null or last_kind <> 'break_start') then raise exception 'Not on a break'; end if;
  insert into attendance_events (org_id, user_id, kind, mode, note, location, source) values (o, auth.uid(), p_kind, coalesce(p_mode,'office'), p_note, p_location, coalesce(p_source,'web')) returning id into eid;
  return jsonb_build_object('id', eid, 'kind', p_kind, 'at', now());
end $$;

/** Today's live board (lead+ see everyone; others see their department). */
create or replace function attendance_board(p_day date default null)
returns table(user_id uuid, full_name text, avatar_url text, designation text, department_id uuid, presence presence_status, status_text text,
              att_status text, first_in timestamptz, last_out timestamptz, minutes_worked int, late boolean, on_leave boolean, leave_kind text, shift_name text, in_meeting boolean)
language sql stable security definer set search_path = public as $$
  with d as (select coalesce(p_day, (now() at time zone 'Asia/Kolkata')::date) as day)
  select p.id, p.full_name, p.avatar_url, p.designation, p.department_id, p.presence, p.status_text,
         coalesce(ad.status, case when l.id is not null then 'leave' else 'absent' end),
         ad.first_in, ad.last_out, coalesce(ad.minutes_worked,0), coalesce(ad.late,false), l.id is not null, l.kind, s.name,
         exists (select 1 from meetings m join meeting_participants mp on mp.meeting_id = m.id where mp.user_id = p.id and now() between m.starts_at and coalesce(m.ends_at, m.starts_at + interval '1 hour'))
    from d cross join profiles p
    left join attendance_days ad on ad.user_id = p.id and ad.day = d.day
    left join leaves l on l.user_id = p.id and l.status = 'approved' and d.day between l.starts_on and l.ends_on
    left join shifts s on s.id = p.shift_id
   where p.org_id = current_org() and p.is_active and not p.is_external
     and (is_lead_plus() or has_admin_perm('attendance.manage') or p.department_id = current_department() or p.id = auth.uid())
   order by p.full_name
$$;

create or replace function my_attendance(p_from date, p_to date)
returns setof attendance_days
language sql stable security definer set search_path = public as $$
  select * from attendance_days where user_id = auth.uid() and day between p_from and p_to order by day desc
$$;

/** Manager/HR correction of a day's status (audited). */
create or replace function correct_attendance(p_user uuid, p_day date, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  if not (is_manager_plus() or has_admin_perm('attendance.manage')) then raise exception 'forbidden'; end if;
  select org_id into o from profiles where id = p_user;
  insert into attendance_days (org_id, user_id, day, status, corrected_by, correction_note)
  values (o, p_user, p_day, p_status, auth.uid(), p_note)
  on conflict (user_id, day) do update set status = excluded.status, corrected_by = excluded.corrected_by, correction_note = excluded.correction_note, missing_checkout = false;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value)
  values (o, auth.uid(), 'attendance.corrected', 'profile', p_user, p_day::text || ' → ' || p_status, jsonb_build_object('note', p_note));
end $$;

alter table attendance_events enable row level security;
alter table attendance_days enable row level security;
create policy ae_own on attendance_events for select to authenticated using (user_id = auth.uid() or is_lead_plus() or has_admin_perm('attendance.manage') or exists (select 1 from profiles p where p.id = user_id and p.department_id = current_department() and is_lead_plus()));
create policy ad_read on attendance_days for select to authenticated using (user_id = auth.uid() or is_lead_plus() or has_admin_perm('attendance.manage'));

-- ---------------------------------------------------------------------------
-- LEAVE: types, balances, workflow, impact, handover
-- ---------------------------------------------------------------------------
create table leave_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  name text not null,
  annual_quota numeric(5,1) not null default 0,   -- 0 = unlimited/unpaid
  paid boolean not null default true,
  requires_hr boolean not null default false,
  color text not null default '#6366f1',
  active boolean not null default true,
  position int not null default 0,
  unique (org_id, code)
);
create table leave_balances (
  user_id uuid not null references profiles(id) on delete cascade,
  leave_type_id uuid not null references leave_types(id) on delete cascade,
  year int not null,
  allocated numeric(5,1) not null default 0,
  used numeric(5,1) not null default 0,
  primary key (user_id, leave_type_id, year)
);
alter table leaves
  add column if not exists leave_type_id uuid references leave_types(id) on delete set null,
  add column if not exists days numeric(5,1),
  add column if not exists half_day boolean not null default false,
  add column if not exists manager_decision approval_status,
  add column if not exists manager_id uuid references profiles(id) on delete set null,
  add column if not exists hr_decision approval_status,
  add column if not exists decided_by uuid references profiles(id) on delete set null,
  add column if not exists decided_at timestamptz,
  add column if not exists decision_note text,
  add column if not exists handover jsonb;   -- {backup_user_id, notes, items:[{task_id, from, to}]}

insert into leave_types (org_id, code, name, annual_quota, paid, requires_hr, color, position) values
 ('00000000-0000-0000-0000-000000000001','CL','Casual leave',12,true,false,'#2563eb',0),
 ('00000000-0000-0000-0000-000000000001','SL','Sick leave',10,true,false,'#e11d48',1),
 ('00000000-0000-0000-0000-000000000001','EL','Earned leave',15,true,true,'#059669',2),
 ('00000000-0000-0000-0000-000000000001','CO','Comp-off',0,true,false,'#f59e0b',3),
 ('00000000-0000-0000-0000-000000000001','ML','Maternity / parental',0,true,true,'#9333ea',4),
 ('00000000-0000-0000-0000-000000000001','LWP','Unpaid leave',0,false,true,'#64748b',5),
 ('00000000-0000-0000-0000-000000000001','WFH','Work from home',0,true,false,'#0891b2',6);

create or replace function leave_days(p_from date, p_to date, p_half boolean) returns numeric
language sql immutable as $$
  select case when p_half then 0.5 else (select count(*) from generate_series(p_from, p_to, interval '1 day') d where extract(isodow from d) < 6) end::numeric
$$;

/** Balances for the current year, creating rows from quotas lazily. */
create or replace function my_leave_balances(p_user uuid default null)
returns table(leave_type_id uuid, code text, name text, color text, allocated numeric, used numeric, pending numeric, remaining numeric)
language plpgsql stable security definer set search_path = public as $$
declare u uuid := coalesce(p_user, auth.uid()); y int := extract(year from now() at time zone 'Asia/Kolkata');
begin
  if u <> auth.uid() and not (is_lead_plus() or has_admin_perm('leave.approve') or has_admin_perm('hr.manage')) then raise exception 'forbidden'; end if;
  return query
  select lt.id, lt.code, lt.name, lt.color,
         coalesce(lb.allocated, lt.annual_quota),
         coalesce((select sum(coalesce(l.days, leave_days(l.starts_on, l.ends_on, l.half_day))) from leaves l where l.user_id = u and l.leave_type_id = lt.id and l.status = 'approved' and extract(year from l.starts_on) = y), 0),
         coalesce((select sum(coalesce(l.days, leave_days(l.starts_on, l.ends_on, l.half_day))) from leaves l where l.user_id = u and l.leave_type_id = lt.id and l.status = 'pending' and extract(year from l.starts_on) = y), 0),
         case when lt.annual_quota = 0 then null else coalesce(lb.allocated, lt.annual_quota) - coalesce((select sum(coalesce(l.days, leave_days(l.starts_on, l.ends_on, l.half_day))) from leaves l where l.user_id = u and l.leave_type_id = lt.id and l.status = 'approved' and extract(year from l.starts_on) = y), 0) end
    from leave_types lt
    left join leave_balances lb on lb.leave_type_id = lt.id and lb.user_id = u and lb.year = y
   where lt.org_id = (select org_id from profiles where id = u) and lt.active
   order by lt.position;
end $$;

/** What falls during a leave period: tasks, meetings, approvals — for the manager's handover planning. */
create or replace function leave_impact(p_user uuid, p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'due_date', t.due_date, 'priority', t.priority, 'project', (select name from projects where id = t.project_id))), '[]')
                from tasks t where t.assignee_id = p_user and t.status not in ('done','cancelled') and t.due_date is not null and (t.due_date at time zone 'Asia/Kolkata')::date between p_from and p_to + 1),
    'critical', (select count(*) from tasks t where t.assignee_id = p_user and t.status not in ('done','cancelled') and t.priority in ('critical','urgent') and t.due_date is not null and (t.due_date at time zone 'Asia/Kolkata')::date between p_from and p_to + 1),
    'waiting_on_user', (select count(*) from tasks t where t.waiting_on_user_id = p_user and t.status not in ('done','cancelled')),
    'meetings', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'starts_at', m.starts_at)), '[]') from meetings m join meeting_participants mp on mp.meeting_id = m.id where mp.user_id = p_user and (m.starts_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
    'approvals', (select count(*) from approvals a where a.approver_id = p_user and a.status = 'pending'),
    'team_on_leave', (select coalesce(jsonb_agg(jsonb_build_object('name', p.full_name, 'from', l.starts_on, 'to', l.ends_on)), '[]') from leaves l join profiles p on p.id = l.user_id
                        where l.status = 'approved' and l.user_id <> p_user and p.department_id = (select department_id from profiles where id = p_user) and l.starts_on <= p_to and l.ends_on >= p_from)
  )
$$;

/** Prepare handover: temporarily reassign open tasks due in the period to a backup; recorded for restoration. */
create or replace function prepare_handover(p_leave uuid, p_backup uuid, p_notes text default null, p_task_ids uuid[] default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l leaves%rowtype; items jsonb := '[]'::jsonb; t record;
begin
  select * into l from leaves where id = p_leave;
  if l.id is null then raise exception 'leave not found'; end if;
  if not (l.user_id = auth.uid() or is_manager_plus() or has_admin_perm('leave.approve')) then raise exception 'forbidden'; end if;
  for t in select id, title, assignee_id from tasks where assignee_id = l.user_id and status not in ('done','cancelled')
             and (p_task_ids is null or id = any(p_task_ids))
             and (p_task_ids is not null or (due_date is not null and (due_date at time zone 'Asia/Kolkata')::date between l.starts_on and l.ends_on + 1)) loop
    update tasks set assignee_id = p_backup, waiting_note = coalesce(waiting_note,'') || case when waiting_note is null then '' else ' · ' end || 'Covering for ' || person_name(l.user_id) || ' (leave)' where id = t.id;
    items := items || jsonb_build_object('task_id', t.id, 'title', t.title, 'from', t.assignee_id, 'to', p_backup);
  end loop;
  update leaves set handover = jsonb_build_object('backup_user_id', p_backup, 'notes', p_notes, 'items', items, 'prepared_at', now()) where id = p_leave;
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
  values (p_backup, 'action_required', 'You are the backup for ' || person_name(l.user_id) || ' (' || to_char(l.starts_on,'DD Mon') || ' – ' || to_char(l.ends_on,'DD Mon') || ')', coalesce(p_notes,'') || ' · ' || jsonb_array_length(items) || ' task(s) handed over', '/my-work', 'leave', l.id, auth.uid());
  return jsonb_build_object('items', items);
end $$;

/** Return handed-over tasks when leave ends (cron daily). */
create or replace function restore_handovers() returns int
language plpgsql security definer set search_path = public as $$
declare l record; it jsonb; n int := 0;
begin
  for l in select * from leaves where handover is not null and (handover->>'restored_at') is null and ends_on < (now() at time zone 'Asia/Kolkata')::date loop
    for it in select * from jsonb_array_elements(l.handover->'items') loop
      update tasks set assignee_id = (it->>'from')::uuid where id = (it->>'task_id')::uuid and assignee_id = (it->>'to')::uuid and status not in ('done','cancelled');
    end loop;
    update leaves set handover = handover || jsonb_build_object('restored_at', now()) where id = l.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- leave workflow: manager decision then HR where the type requires it
create or replace function leave_before_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare lt leave_types%rowtype;
begin
  if tg_op = 'INSERT' then
    new.manager_id := coalesce(new.manager_id, (select manager_id from profiles where id = new.user_id));
    new.days := coalesce(new.days, leave_days(new.starts_on, new.ends_on, new.half_day));
    return new;
  end if;
  if new.manager_decision is distinct from old.manager_decision and new.manager_decision = 'approved' then
    select * into lt from leave_types where id = new.leave_type_id;
    if lt.requires_hr and new.hr_decision is distinct from 'approved' then
      new.status := 'pending';
      -- notify HR admins
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      select a.user_id, 'approval', 'HR approval needed: leave for ' || person_name(new.user_id), lt.name || ' · ' || to_char(new.starts_on,'DD Mon') || ' – ' || to_char(new.ends_on,'DD Mon'), '/calendar?tab=leave', 'leave', new.id, auth.uid()
        from admin_assignments a join admin_roles r on r.id = a.admin_role_id where 'hr.manage' = any(r.permissions) or 'leave.approve' = any(r.permissions) or '*' = any(r.permissions);
    else
      new.status := 'approved'; new.decided_by := auth.uid(); new.decided_at := now();
    end if;
  elsif new.manager_decision is distinct from old.manager_decision and new.manager_decision in ('rejected','changes_requested') then
    new.status := new.manager_decision; new.decided_by := auth.uid(); new.decided_at := now();
  elsif new.hr_decision is distinct from old.hr_decision and new.hr_decision is not null then
    new.status := new.hr_decision; new.decided_by := auth.uid(); new.decided_at := now();
  end if;
  return new;
end $$;
create trigger leaves_before_insert before insert on leaves for each row execute function leave_before_change();
create trigger leaves_before_update before update on leaves for each row execute function leave_before_change();

alter table leave_types enable row level security;
alter table leave_balances enable row level security;
create policy lt_read on leave_types for select to authenticated using (org_id = current_org());
create policy lt_write on leave_types for all to authenticated using (org_id = current_org() and (is_admin() or has_admin_perm('hr.manage'))) with check (org_id = current_org() and (is_admin() or has_admin_perm('hr.manage')));
create policy lb_read on leave_balances for select to authenticated using (user_id = auth.uid() or is_lead_plus() or has_admin_perm('hr.manage'));
create policy lb_write on leave_balances for all to authenticated using (is_admin() or has_admin_perm('hr.manage')) with check (is_admin() or has_admin_perm('hr.manage'));
drop policy if exists leaves_mgr on leaves;
create policy leaves_mgr on leaves for update to authenticated using (org_id = current_org() and (is_manager_plus() or user_id = auth.uid() or manager_id = auth.uid() or has_admin_perm('leave.approve') or has_admin_perm('hr.manage')));

-- ---------------------------------------------------------------------------
-- FOCUS SESSIONS & TIME ENTRIES (voluntary, work-based)
-- ---------------------------------------------------------------------------
create table time_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  meeting_id uuid references meetings(id) on delete set null,
  source text not null default 'focus',          -- focus | manual | meeting | suggested
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  minutes int,
  note text,
  confirmed boolean not null default true,
  created_at timestamptz not null default now()
);
create index time_entries_user_idx on time_entries(user_id, started_at desc);

create or replace function start_focus(p_task uuid, p_note text default null) returns uuid
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

create or replace function stop_focus() returns jsonb
language plpgsql security definer set search_path = public as $$
declare e time_entries%rowtype;
begin
  update time_entries set ended_at = now(), minutes = greatest(1, extract(epoch from (now() - started_at))/60)::int where user_id = auth.uid() and ended_at is null returning * into e;
  if e.id is null then return jsonb_build_object('stopped', false); end if;
  if e.task_id is not null then update tasks set actual_hours = coalesce(actual_hours,0) + round(e.minutes/60.0, 2) where id = e.task_id; end if;
  update profiles set presence = 'available', status_text = null where id = auth.uid();
  return jsonb_build_object('stopped', true, 'minutes', e.minutes, 'task_id', e.task_id);
end $$;

/** Timesheet suggestions for a day: meetings attended and tasks completed without logged time. */
create or replace function timesheet_suggestions(p_day date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'meetings', (select coalesce(jsonb_agg(jsonb_build_object('meeting_id', m.id, 'title', m.title, 'started_at', m.starts_at, 'minutes', greatest(15, extract(epoch from (coalesce(m.ends_at, m.starts_at + interval '1 hour') - m.starts_at))/60))), '[]')
                  from meetings m join meeting_participants mp on mp.meeting_id = m.id
                 where mp.user_id = auth.uid() and (m.starts_at at time zone 'Asia/Kolkata')::date = p_day
                   and not exists (select 1 from time_entries te where te.meeting_id = m.id and te.user_id = auth.uid())),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('task_id', t.id, 'title', t.title, 'estimated_hours', t.estimated_hours)), '[]')
               from tasks t where t.assignee_id = auth.uid() and (t.completed_at at time zone 'Asia/Kolkata')::date = p_day
                 and not exists (select 1 from time_entries te where te.task_id = t.id and te.user_id = auth.uid())),
    'logged', (select coalesce(sum(minutes),0) from time_entries where user_id = auth.uid() and (started_at at time zone 'Asia/Kolkata')::date = p_day)
  )
$$;

alter table time_entries enable row level security;
create policy te_own on time_entries for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy te_mgr on time_entries for select to authenticated using (is_lead_plus() or has_admin_perm('hr.manage'));

-- ---------------------------------------------------------------------------
-- ACTIVITY (work events, transparent to the employee)
-- ---------------------------------------------------------------------------
create or replace function activity_timeline(p_user uuid, p_from timestamptz, p_to timestamptz)
returns table(occurred_at timestamptz, kind text, title text, link text)
language sql stable security definer set search_path = public as $$
  select * from (
    select a.created_at, a.action, coalesce(a.summary, a.action),
           case a.entity_type when 'task' then '/tasks/' || a.entity_id when 'project' then '/projects/' || a.entity_id when 'approval' then '/approvals/' || a.entity_id when 'file' then '/files/' || a.entity_id when 'decision' then '/decisions/' || a.entity_id else null end
      from audit_logs a where a.actor_id = p_user and a.created_at between p_from and p_to
    union all
    select te.started_at, 'focus', 'Focus session' || case when t.title is not null then ': ' || t.title else '' end || case when te.minutes is not null then ' (' || te.minutes || ' min)' else '' end, case when te.task_id is not null then '/tasks/' || te.task_id else null end
      from time_entries te left join tasks t on t.id = te.task_id where te.user_id = p_user and te.started_at between p_from and p_to
    union all
    select m.starts_at, 'meeting', 'Meeting: ' || m.title, '/meetings/' || m.id
      from meetings m join meeting_participants mp on mp.meeting_id = m.id where mp.user_id = p_user and m.starts_at between p_from and p_to
  ) x
  where p_user = auth.uid() or is_lead_plus() or has_admin_perm('hr.manage')
  order by 1 desc
  limit 300
$$;

-- grants
revoke execute on function attendance_recompute(uuid,date), attendance_after_event(), leave_before_change(), restore_handovers(), leave_days(date,date,boolean) from anon, public, authenticated;
grant execute on function leave_days(date,date,boolean) to authenticated;
grant execute on function clock(text,text,text,jsonb,text), attendance_board(date), my_attendance(date,date), correct_attendance(uuid,date,text,text),
  my_leave_balances(uuid), leave_impact(uuid,date,date), prepare_handover(uuid,uuid,text,uuid[]), roster(date,date,uuid),
  start_focus(uuid,text), stop_focus(), timesheet_suggestions(date), activity_timeline(uuid,timestamptz,timestamptz), has_admin_perm(text), is_primary_admin() to authenticated;
revoke execute on function clock(text,text,text,jsonb,text), attendance_board(date), my_attendance(date,date), correct_attendance(uuid,date,text,text),
  my_leave_balances(uuid), leave_impact(uuid,date,date), prepare_handover(uuid,uuid,text,uuid[]), roster(date,date,uuid),
  start_focus(uuid,text), stop_focus(), timesheet_suggestions(date), activity_timeline(uuid,timestamptz,timestamptz), has_admin_perm(text), is_primary_admin() from anon, public;

select cron.schedule('ghl_restore_handovers', '30 0 * * *', $$select restore_handovers()$$);

-- primary admin = the owner account (pre-invited super_admin); set when it exists
update organizations set settings = settings || jsonb_build_object('primary_admin_id', (select id from profiles where email = 'aby777333@gmail.com' limit 1)) where id = '00000000-0000-0000-0000-000000000001' and exists (select 1 from profiles where email = 'aby777333@gmail.com');
