-- Phase 5 (b): Organizational intelligence — commitments, delegation receipts (in 0017), async standups, meeting hygiene,
-- decision reversals, internal Q&A + office hours, self-service requests, bookings, visitors, events, service status,
-- emergency broadcasts + check-ins, allocations/capacity, surveys/retros/experiments, what-if, waiting-on-me, who-has-the-ball,
-- duplicate detection, knowledge transfer.

-- ---------------------------------------------------------------------------
-- COMMITMENTS (promises) — "I'll send it by Friday"
-- ---------------------------------------------------------------------------
create table commitments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  promised_by uuid not null references profiles(id) on delete cascade,
  promised_to_user uuid references profiles(id) on delete set null,
  promised_to_contact uuid,                       -- GHL Connect contact (FK added in 0020)
  promised_to_label text,
  text text not null,
  due_at timestamptz,
  source_type text not null default 'manual',     -- chat | meeting | call | comment | voice | buddy | manual | connect
  source_id uuid,
  source_link text,
  status text not null default 'open',            -- open | done | missed | cancelled
  task_id uuid references tasks(id) on delete set null,
  reminded_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index commitments_by_idx on commitments(promised_by, status, due_at);
create index commitments_to_idx on commitments(promised_to_user, status);

create or replace function commitment_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare c record; n int := 0; mgr uuid;
begin
  for c in select * from commitments where status = 'open' and due_at is not null and due_at::date <= (now() at time zone 'Asia/Kolkata')::date and (reminded_at is null or reminded_at::date < (now() at time zone 'Asia/Kolkata')::date) loop
    if c.due_at < now() - interval '1 day' then
      update commitments set status = 'missed' where id = c.id;
      select manager_id into mgr from profiles where id = c.promised_by;
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id) values (c.promised_by, 'critical', 'Missed commitment: ' || left(c.text, 80), 'Promised to ' || coalesce(person_name(c.promised_to_user), c.promised_to_label, 'someone') || ' for ' || to_char(c.due_at at time zone 'Asia/Kolkata', 'DD Mon'), coalesce(c.source_link, '/my-work?tab=commitments'), 'commitment', c.id);
      if mgr is not null then insert into notifications (user_id, kind, title, body, link, entity_type, entity_id) values (mgr, 'information', person_name(c.promised_by) || ' missed a commitment', left(c.text, 120), '/my-work?tab=commitments', 'commitment', c.id); end if;
    else
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id) values (c.promised_by, 'deadline', 'You promised ' || coalesce(person_name(c.promised_to_user), c.promised_to_label, 'someone') || ': ' || left(c.text, 80), 'Due ' || to_char(c.due_at at time zone 'Asia/Kolkata', 'DD Mon HH24:MI'), coalesce(c.source_link, '/my-work?tab=commitments'), 'commitment', c.id);
    end if;
    update commitments set reminded_at = now() where id = c.id;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function my_commitments() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'i_promised', (select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('to_name', coalesce(person_name(c.promised_to_user), c.promised_to_label)) order by c.due_at nulls last), '[]') from commitments c where c.promised_by = auth.uid() and c.status in ('open','missed')),
    'promised_to_me', (select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('by_name', person_name(c.promised_by)) order by c.due_at nulls last), '[]') from commitments c where c.promised_to_user = auth.uid() and c.status in ('open','missed')),
    'due_today', (select count(*) from commitments c where c.promised_by = auth.uid() and c.status = 'open' and c.due_at::date = (now() at time zone 'Asia/Kolkata')::date),
    'overdue', (select count(*) from commitments c where c.promised_by = auth.uid() and c.status in ('open','missed') and c.due_at < now()),
    'completed_30d', (select count(*) from commitments c where c.promised_by = auth.uid() and c.status = 'done' and c.done_at > now() - interval '30 days')
  )
$$;

-- ---------------------------------------------------------------------------
-- ASYNC STANDUPS + TEAM DIGEST
-- ---------------------------------------------------------------------------
create table standups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null default (now() at time zone 'Asia/Kolkata')::date,
  done text,
  next text,
  blockers text,
  audio_path text,
  transcript text,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
create or replace function team_digest(p_day date default null, p_department uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with d as (select coalesce(p_day, (now() at time zone 'Asia/Kolkata')::date) as day)
  select jsonb_build_object(
    'day', (select day from d),
    'standups', (select coalesce(jsonb_agg(jsonb_build_object('user_id', s.user_id, 'name', person_name(s.user_id), 'done', s.done, 'next', s.next, 'blockers', s.blockers) order by person_name(s.user_id)), '[]')
                  from standups s join profiles p on p.id = s.user_id, d
                 where s.day = d.day and (p_department is null or p.department_id = p_department)
                   and (is_manager_plus() or is_manager_of(s.user_id) or p.department_id = current_department())),
    'missing', (select coalesce(jsonb_agg(p.full_name), '[]') from profiles p, d where p.org_id = current_org() and p.is_active and not p.is_external and (p_department is null or p.department_id = p_department)
                 and (is_manager_plus() or is_manager_of(p.id) or p.department_id = current_department()) and not exists (select 1 from standups s where s.user_id = p.id and s.day = d.day)
                 and not exists (select 1 from leaves l where l.user_id = p.id and l.status = 'approved' and d.day between l.starts_on and l.ends_on)),
    'blockers', (select count(*) from standups s join profiles p on p.id = s.user_id, d where s.day = d.day and coalesce(s.blockers,'') <> '' and (p_department is null or p.department_id = p_department))
  )
$$;

-- ---------------------------------------------------------------------------
-- MEETING HYGIENE + DECISION REVERSALS
-- ---------------------------------------------------------------------------
alter table meetings add column if not exists recurrence text, add column if not exists review_due_on date, add column if not exists outcome_recorded boolean not null default false, add column if not exists async_suggested boolean not null default false;
alter table decisions add column if not exists superseded_by uuid references decisions(id) on delete set null, add column if not exists reversal_reason text, add column if not exists status text not null default 'active';   -- active | superseded | reversed

create or replace function meeting_load(p_user uuid default auth.uid(), p_day date default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with d as (select coalesce(p_day, (now() at time zone 'Asia/Kolkata')::date) as day)
  select jsonb_build_object(
    'meetings', (select count(*) from meetings m join meeting_participants mp on mp.meeting_id = m.id, d where mp.user_id = p_user and (m.starts_at at time zone 'Asia/Kolkata')::date = d.day),
    'hours', (select coalesce(round(sum(extract(epoch from (coalesce(m.ends_at, m.starts_at + interval '1 hour') - m.starts_at))/3600)::numeric, 1), 0) from meetings m join meeting_participants mp on mp.meeting_id = m.id, d where mp.user_id = p_user and (m.starts_at at time zone 'Asia/Kolkata')::date = d.day),
    'focus_hours_left', greatest(0, 8 - (select coalesce(sum(extract(epoch from (coalesce(m.ends_at, m.starts_at + interval '1 hour') - m.starts_at))/3600), 0) from meetings m join meeting_participants mp on mp.meeting_id = m.id, d where mp.user_id = p_user and (m.starts_at at time zone 'Asia/Kolkata')::date = d.day))
  )
$$;
create or replace function meeting_cost(p_meeting uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('participants', (select count(*) from meeting_participants where meeting_id = p_meeting),
    'hours', (select round((extract(epoch from (coalesce(m.ends_at, m.starts_at + interval '1 hour') - m.starts_at))/3600)::numeric, 2) from meetings m where m.id = p_meeting),
    'person_hours', (select round(((select count(*) from meeting_participants where meeting_id = p_meeting) * extract(epoch from (coalesce(m.ends_at, m.starts_at + interval '1 hour') - m.starts_at))/3600)::numeric, 1) from meetings m where m.id = p_meeting),
    'overloaded', (select coalesce(jsonb_agg(person_name(mp.user_id)), '[]') from meeting_participants mp join meetings m on m.id = mp.meeting_id where mp.meeting_id = p_meeting and (meeting_load(mp.user_id, (m.starts_at at time zone 'Asia/Kolkata')::date)->>'hours')::numeric > 5))
$$;
/** Focus windows: departments/teams protect periods; settings live in departments.settings->'focus_windows' [{dow,start,end}]. */
create or replace function in_focus_window(p_department uuid, p_at timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from departments d, jsonb_array_elements(coalesce(d.settings->'focus_windows', '[]'::jsonb)) w
                  where d.id = p_department and (w->>'dow')::int = extract(isodow from p_at at time zone 'Asia/Kolkata')::int
                    and (p_at at time zone 'Asia/Kolkata')::time between (w->>'start')::time and (w->>'end')::time)
$$;
create or replace function meeting_hygiene() returns trigger
language plpgsql security definer set search_path = public as $$
declare load jsonb; heavy text[];
begin
  if tg_op = 'INSERT' then
    if coalesce(new.agenda, '') = '' and new.organizer_id is not null then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id) values (new.organizer_id, 'information', 'Add an agenda to "' || new.title || '"', 'Meetings without an agenda tend to run long. Could this be an async thread instead?', '/meetings/' || new.id, 'meeting', new.id);
    end if;
    if new.department_id is not null and in_focus_window(new.department_id, new.starts_at) and new.organizer_id is not null then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id) values (new.organizer_id, 'information', '"' || new.title || '" falls inside a protected focus window', 'Move it unless it is urgent.', '/meetings/' || new.id, 'meeting', new.id);
    end if;
    if new.recurrence is not null and new.review_due_on is null then new.review_due_on := (new.starts_at at time zone 'Asia/Kolkata')::date + 90; end if;
  end if;
  return new;
end $$;
create trigger meetings_hygiene before insert on meetings for each row execute function meeting_hygiene();

-- ---------------------------------------------------------------------------
-- INTERNAL Q&A, OFFICE HOURS, EXPERT SLOTS
-- ---------------------------------------------------------------------------
create table questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text,
  department_id uuid references departments(id) on delete set null,
  tags text[] not null default '{}',
  status text not null default 'open',     -- open | answered | closed
  accepted_answer_id uuid,
  views int not null default 0,
  created_at timestamptz not null default now()
);
create table answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  votes int not null default 0,
  is_accepted boolean not null default false,
  knowledge_id uuid references ai_knowledge(id) on delete set null,
  created_at timestamptz not null default now()
);
create table answer_votes (answer_id uuid references answers(id) on delete cascade, user_id uuid references profiles(id) on delete cascade, primary key (answer_id, user_id));
create or replace function answer_vote_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update answers set votes = (select count(*) from answer_votes where answer_id = coalesce(new.answer_id, old.answer_id)) where id = coalesce(new.answer_id, old.answer_id);
  return null;
end $$;
create trigger answer_votes_sync after insert or delete on answer_votes for each row execute function answer_vote_sync();
create or replace function answers_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare q questions%rowtype;
begin
  select * into q from questions where id = new.question_id;
  if q.author_id <> new.author_id then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id) values (q.author_id, 'information', person_name(new.author_id) || ' answered: ' || q.title, left(new.body, 140), '/wiki/questions/' || q.id, 'question', q.id, new.author_id);
  end if;
  return null;
end $$;
create trigger answers_notify after insert on answers for each row execute function answers_notify();

create table office_hours (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  host_id uuid references profiles(id) on delete cascade,
  department_id uuid references departments(id) on delete cascade,
  title text not null,
  weekday int not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  slot_minutes int not null default 15,
  note text,
  active boolean not null default true
);
create table expert_slots (
  id uuid primary key default gen_random_uuid(),
  office_hours_id uuid references office_hours(id) on delete set null,
  host_id uuid not null references profiles(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  topic text,
  status text not null default 'booked',   -- booked | done | cancelled
  created_at timestamptz not null default now(),
  exclude using gist (host_id with =, tstzrange(starts_at, ends_at) with &&) where (status = 'booked')
);
create or replace function expert_slot_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
  values (new.host_id, 'information', person_name(new.user_id) || ' booked your office hours', coalesce(new.topic, '') || ' · ' || to_char(new.starts_at at time zone 'Asia/Kolkata', 'DD Mon HH24:MI'), '/people/' || new.host_id || '?tab=office-hours', 'expert_slot', new.id, new.user_id);
  return null;
end $$;
create trigger expert_slots_notify after insert on expert_slots for each row execute function expert_slot_notify();

-- ---------------------------------------------------------------------------
-- SELF-SERVICE REQUEST CENTER (expense, travel, purchase, WFH, field duty, late explanation, overtime, comp-off, training, other)
-- ---------------------------------------------------------------------------
create table requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,                       -- expense | travel | purchase | wfh | field_duty | late_explanation | overtime | comp_off | training | other
  title text not null,
  details text,
  payload jsonb not null default '{}'::jsonb,   -- kind-specific fields (amount, category, receipt_path, destination, dates, hours…)
  amount numeric,
  starts_on date,
  ends_on date,
  status text not null default 'pending',   -- pending | approved | rejected | cancelled | fulfilled
  approver_id uuid references profiles(id) on delete set null,
  second_approver_id uuid references profiles(id) on delete set null,   -- finance / executive when thresholds apply
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  sla_due_at timestamptz,
  escalated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index requests_user_idx on requests(user_id, created_at desc);
create index requests_approver_idx on requests(approver_id) where status = 'pending';
create trigger requests_updated_at before update on requests for each row execute function set_updated_at();

create or replace function request_route() returns trigger
language plpgsql security definer set search_path = public as $$
declare mgr uuid; o organizations%rowtype; threshold numeric; fin uuid;
begin
  select * into o from organizations where id = new.org_id;
  if tg_op = 'INSERT' then
    select manager_id into mgr from profiles where id = new.user_id;
    new.approver_id := coalesce(new.approver_id, effective_approver(mgr, 'requests'), (o.settings->>'primary_admin_id')::uuid);
    threshold := coalesce((o.settings->>'expense_second_approval_above')::numeric, 25000);
    if new.kind in ('expense','purchase','travel') and coalesce(new.amount, 0) >= threshold then
      select coalesce(d.head_id, d.on_duty_user_id) into fin from departments d where d.org_id = new.org_id and d.slug = 'finance';
      new.second_approver_id := coalesce(fin, (o.settings->>'primary_admin_id')::uuid);
    end if;
    new.sla_due_at := now() + (coalesce((o.settings->>'request_sla_hours')::int, 48) * interval '1 hour');
    if new.approver_id is not null then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (new.approver_id, 'approval', replace(initcap(new.kind), '_', ' ') || ' request from ' || person_name(new.user_id) || ': ' || new.title, left(coalesce(new.details, ''), 140) || case when new.amount is not null then ' · ₹' || new.amount else '' end, '/requests?tab=approvals', 'request', new.id, new.user_id);
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    new.decided_by := coalesce(new.decided_by, auth.uid()); new.decided_at := coalesce(new.decided_at, now());
    if new.status = 'approved' and new.second_approver_id is not null and new.decided_by = new.approver_id and new.second_approver_id <> new.decided_by and coalesce(new.payload->>'second_approved', 'false') <> 'true' then
      new.status := 'pending';
      new.payload := new.payload || jsonb_build_object('first_approved_by', new.decided_by, 'first_approved_at', now());
      new.approver_id := new.second_approver_id;
      new.decided_by := null; new.decided_at := null;
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (new.second_approver_id, 'approval', 'Second approval needed: ' || new.title, person_name(new.user_id) || ' · ₹' || coalesce(new.amount::text, '?') || ' · manager approved', '/requests?tab=approvals', 'request', new.id, auth.uid());
      return new;
    end if;
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (new.user_id, case when new.status = 'approved' then 'information'::notification_kind else 'action_required'::notification_kind end, 'Request ' || new.status || ': ' || new.title, coalesce(new.decision_note, ''), '/requests', 'request', new.id, auth.uid());
    if new.kind = 'wfh' and new.status = 'approved' then
      insert into calendar_events (org_id, kind, title, starts_at, ends_at, all_day, user_id, created_by) values (new.org_id, 'event', 'WFH · ' || person_name(new.user_id), new.starts_on::timestamptz, coalesce(new.ends_on, new.starts_on)::timestamptz + interval '1 day', true, new.user_id, new.user_id);
    end if;
    if new.kind = 'field_duty' and new.status = 'approved' then
      insert into calendar_events (org_id, kind, title, starts_at, ends_at, all_day, user_id, created_by) values (new.org_id, 'event', 'Field duty · ' || person_name(new.user_id), new.starts_on::timestamptz, coalesce(new.ends_on, new.starts_on)::timestamptz + interval '1 day', true, new.user_id, new.user_id);
    end if;
    if new.kind = 'comp_off' and new.status = 'approved' then
      update leave_balances lb set allocated = lb.allocated + coalesce((new.payload->>'days')::numeric, 1) from leave_types lt where lb.leave_type_id = lt.id and lt.code = 'CO' and lb.user_id = new.user_id and lb.year = extract(year from now())::int;
    end if;
  end if;
  return new;
end $$;
create trigger requests_route before insert or update on requests for each row execute function request_route();

create or replace function escalate_requests() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; up uuid;
begin
  for r in select * from requests where status = 'pending' and sla_due_at < now() and escalated_at is null loop
    select manager_id into up from profiles where id = r.approver_id;
    if up is null then up := (select (settings->>'primary_admin_id')::uuid from organizations where id = r.org_id); end if;
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id) values (up, 'action_required', 'Request waiting too long: ' || r.title, person_name(r.user_id) || ' · waiting on ' || person_name(r.approver_id) || ' since ' || to_char(r.created_at at time zone 'Asia/Kolkata', 'DD Mon'), '/requests?tab=approvals', 'request', r.id);
    insert into notifications (user_id, kind, title, link, entity_type, entity_id) values (r.approver_id, 'action_required', 'Overdue: ' || r.title, '/requests?tab=approvals', 'request', r.id);
    update requests set escalated_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- BOOKINGS (desks, rooms, equipment, vehicles), VISITORS, EVENTS, SERVICE STATUS
-- ---------------------------------------------------------------------------
create table resources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null,                     -- desk | room | equipment | vehicle
  name text not null,
  location text,
  capacity int,
  notes text,
  active boolean not null default true
);
create table bookings (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references resources(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  purpose text,
  meeting_id uuid references meetings(id) on delete set null,
  created_at timestamptz not null default now(),
  exclude using gist (resource_id with =, tstzrange(starts_at, ends_at) with &&)
);
create table visitors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  host_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  company text,
  phone text,
  purpose text,
  expected_at timestamptz not null,
  status text not null default 'expected',   -- expected | arrived | left | cancelled
  arrived_at timestamptz,
  left_at timestamptz,
  created_at timestamptz not null default now()
);
create table events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  kind text not null default 'event',        -- training | town_hall | team_meeting | celebration | event
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  department_ids uuid[],
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table event_rsvps (event_id uuid references events(id) on delete cascade, user_id uuid references profiles(id) on delete cascade, status text not null default 'yes', primary key (event_id, user_id));
create or replace function events_calendar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into calendar_events (org_id, kind, title, description, starts_at, ends_at, created_by) values (new.org_id, 'event', new.title, new.description, new.starts_at, new.ends_at, new.created_by);
  return null;
end $$;
create trigger events_calendar after insert on events for each row execute function events_calendar();

create table service_status (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  status text not null default 'ok',         -- ok | degraded | down | maintenance
  note text,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);
insert into service_status (org_id, name) values
 ('00000000-0000-0000-0000-000000000001','GHL ONE'),('00000000-0000-0000-0000-000000000001','Website'),('00000000-0000-0000-0000-000000000001','Email'),('00000000-0000-0000-0000-000000000001','Internet'),('00000000-0000-0000-0000-000000000001','Phones / Call center'),('00000000-0000-0000-0000-000000000001','Internal tools');
create or replace function service_status_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('down','degraded') then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    select id, 'information', new.name || ' is ' || new.status, coalesce(new.note, 'IT is aware; no need to raise separate tickets.'), '/status', 'service_status', new.id, auth.uid() from profiles where org_id = new.org_id and is_active and not is_external;
  end if;
  return null;
end $$;
create trigger service_status_notify after update on service_status for each row execute function service_status_notify();

-- ---------------------------------------------------------------------------
-- EMERGENCY BROADCAST + INCIDENT CHECK-IN
-- ---------------------------------------------------------------------------
create table broadcasts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  body text not null,
  kind text not null default 'urgent',       -- urgent | emergency | office | system
  audience jsonb not null default '{"all":true}'::jsonb,   -- {all} | {department_ids:[]} | {team_ids:[]} | {role:[...]} | {user_ids:[]}
  require_ack boolean not null default false,
  request_checkin boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table broadcast_acks (broadcast_id uuid references broadcasts(id) on delete cascade, user_id uuid references profiles(id) on delete cascade, acked_at timestamptz not null default now(), primary key (broadcast_id, user_id));
create table checkins (broadcast_id uuid references broadcasts(id) on delete cascade, user_id uuid references profiles(id) on delete cascade, status text not null, note text, at timestamptz not null default now(), primary key (broadcast_id, user_id));   -- safe | need_help | not_at_office
create or replace function broadcast_send() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not (has_perm('broadcast_company', new.created_by) or has_admin_perm_user(new.created_by, 'communication.manage') or (has_perm('broadcast_department', new.created_by) and new.audience ? 'department_ids')) then
    raise exception 'You are not allowed to broadcast to this audience';
  end if;
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
  select p.id, 'critical', new.title, left(new.body, 200) || case when new.require_ack then ' · Please acknowledge.' when new.request_checkin then ' · Please check in.' else '' end, '/broadcasts/' || new.id, 'broadcast', new.id, new.created_by
    from profiles p where p.org_id = new.org_id and p.is_active
     and ((new.audience->>'all')::boolean is true
       or (new.audience ? 'department_ids' and p.department_id::text in (select jsonb_array_elements_text(new.audience->'department_ids')))
       or (new.audience ? 'team_ids' and p.team_id::text in (select jsonb_array_elements_text(new.audience->'team_ids')))
       or (new.audience ? 'roles' and p.role::text in (select jsonb_array_elements_text(new.audience->'roles')))
       or (new.audience ? 'user_ids' and p.id::text in (select jsonb_array_elements_text(new.audience->'user_ids'))));
  get diagnostics n = row_count;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value) values (new.org_id, new.created_by, 'broadcast.sent', 'broadcast', new.id, new.title, jsonb_build_object('recipients', n, 'kind', new.kind));
  return null;
end $$;
create trigger broadcasts_send after insert on broadcasts for each row execute function broadcast_send();

-- ---------------------------------------------------------------------------
-- ALLOCATIONS, CAPACITY CALENDAR, ASSIGNMENT WARNINGS, WIP
-- ---------------------------------------------------------------------------
create table allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  department_id uuid references departments(id) on delete cascade,    -- temporary department assignment ("borrowed")
  percent int not null check (percent between 1 and 100),
  starts_on date not null default current_date,
  ends_on date,
  note text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create or replace function capacity_calendar(p_user uuid default auth.uid(), p_days int default 7) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'tasks_due', t.n, 'urgent', t.urgent, 'meeting_hours', (meeting_load(p_user, d::date)->>'hours')::numeric,
           'label', case when t.urgent >= 3 or t.n >= 6 or (meeting_load(p_user, d::date)->>'hours')::numeric >= 5 then 'critical' when t.n >= 4 or (meeting_load(p_user, d::date)->>'hours')::numeric >= 3 then 'heavy' when t.n >= 2 then 'balanced' else 'light' end) order by d), '[]')
    from generate_series((now() at time zone 'Asia/Kolkata')::date, (now() at time zone 'Asia/Kolkata')::date + (p_days - 1), interval '1 day') d
    cross join lateral (select count(*) as n, count(*) filter (where priority in ('critical','urgent')) as urgent from tasks where assignee_id = p_user and status not in ('done','cancelled') and (due_date at time zone 'Asia/Kolkata')::date = d::date) t
   where p_user = auth.uid() or is_manager_of(p_user) or is_manager_plus()
$$;
/** Before assigning: load, urgent collisions, deadline conflicts, WIP, allocation %. */
create or replace function assignment_warnings(p_assignee uuid, p_due timestamptz default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open_tasks', (select count(*) from tasks where assignee_id = p_assignee and status not in ('done','cancelled')),
    'in_progress', (select count(*) from tasks where assignee_id = p_assignee and status = 'in_progress'),
    'urgent_open', (select count(*) from tasks where assignee_id = p_assignee and status not in ('done','cancelled') and priority in ('critical','urgent')),
    'due_same_day', (select count(*) from tasks where assignee_id = p_assignee and status not in ('done','cancelled') and p_due is not null and (due_date at time zone 'Asia/Kolkata')::date = (p_due at time zone 'Asia/Kolkata')::date),
    'other_managers_assigning', (select coalesce(jsonb_agg(distinct person_name(delegated_by)), '[]') from tasks where assignee_id = p_assignee and status not in ('done','cancelled') and delegated_by is not null and delegated_by <> auth.uid()),
    'allocation_percent', (select coalesce(sum(percent), 0) from allocations where user_id = p_assignee and starts_on <= current_date and (ends_on is null or ends_on >= current_date)),
    'wip_limit', (select t.wip_limit from profiles p join teams t on t.id = p.team_id where p.id = p_assignee),
    'on_leave', (select coalesce(jsonb_agg(jsonb_build_object('from', starts_on, 'to', ends_on)), '[]') from leaves where user_id = p_assignee and status = 'approved' and ends_on >= current_date and starts_on <= current_date + 14),
    'workload', (select case when count(*) filter (where priority in ('critical','urgent')) >= 3 or count(*) >= 10 then 'critical' when count(*) >= 6 then 'heavy' when count(*) >= 3 then 'balanced' else 'light' end from tasks where assignee_id = p_assignee and status not in ('done','cancelled')),
    'can_assign', can_assign(p_assignee)
  )
$$;

-- ---------------------------------------------------------------------------
-- SURVEYS (pulse), RETROSPECTIVES, EXPERIMENTS, KNOWLEDGE TRANSFER
-- ---------------------------------------------------------------------------
create table surveys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  questions jsonb not null default '[]'::jsonb,   -- [{key, text, type: scale|text|choice, options[]}]
  audience jsonb not null default '{"all":true}'::jsonb,
  anonymous boolean not null default true,
  open_until date,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,     -- null when anonymous
  answers jsonb not null,
  created_at timestamptz not null default now()
);
create table retrospectives (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  scope text not null default 'team',        -- team | project | department | company
  team_id uuid references teams(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  period text,
  worked text,
  failed text,
  changes text,
  actions jsonb not null default '[]'::jsonb,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table experiments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  idea_id uuid references ideas(id) on delete set null,
  suggestion_id uuid references suggestions(id) on delete set null,
  title text not null,
  hypothesis text,
  owner_id uuid references profiles(id) on delete set null,
  starts_on date,
  ends_on date,
  status text not null default 'proposed',   -- proposed | running | concluded | dropped
  result text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

insert into workflow_templates (org_id, key, name, description, kind, steps) values
('00000000-0000-0000-0000-000000000001', 'knowledge_transfer', 'Knowledge transfer', 'Runs when someone changes role, transfers or leaves — nothing important lives in one head.', 'custom', '[
  {"key":"list","title":"List projects, processes, contacts and pending work","description":"Write the handover: projects, recurring processes, key contacts, known issues, pending work, where files live. Save critical processes as knowledge articles.","owner":"employee","due_days":3},
  {"key":"sop","title":"Document undocumented processes as SOPs","description":"Every critical process needs an approved SOP.","owner":"employee","depends_on":["list"],"due_days":5},
  {"key":"train","title":"Walk the backup through each responsibility","description":"Pair sessions with the backup owner; the backup confirms.","owner":"manager","depends_on":["sop"],"due_days":7},
  {"key":"vault","title":"Rotate shared credentials via the approved vault","description":"No passwords in chat or documents.","owner":"it","depends_on":["list"],"due_days":3},
  {"key":"confirm","title":"Confirm responsibilities reassigned","description":"Every responsibility has a new owner and backup in the register.","owner":"manager","depends_on":["train","vault"],"due_days":8}
]'::jsonb);

-- ---------------------------------------------------------------------------
-- WHAT-IF, WAITING ON ME, WHO HAS THE BALL, DUPLICATES
-- ---------------------------------------------------------------------------
create or replace function what_if_absent(p_user uuid, p_from date default current_date, p_to date default current_date) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not (is_manager_plus() or is_manager_of(p_user) or p_user = auth.uid()) then jsonb_build_object('error','forbidden') else jsonb_build_object(
    'person', person_name(p_user),
    'responsibilities', (select coalesce(jsonb_agg(jsonb_build_object('name', r.name, 'critical', r.critical, 'backup', person_name(r.backup_id), 'backup_id', r.backup_id, 'backup_away', exists (select 1 from leaves l where l.user_id = r.backup_id and l.status = 'approved' and l.starts_on <= p_to and l.ends_on >= p_from))), '[]') from responsibilities r where r.owner_id = p_user),
    'tasks_due', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'due', t.due_date, 'priority', t.priority, 'waiting_by', (select count(*) from tasks x where x.waiting_on_user_id = p_user))), '[]') from tasks t where t.assignee_id = p_user and t.status not in ('done','cancelled') and (t.due_date at time zone 'Asia/Kolkata')::date between p_from and p_to + 2),
    'blocked_others', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'assignee', person_name(t.assignee_id))), '[]') from tasks t where t.waiting_on_user_id = p_user and t.status not in ('done','cancelled')),
    'dependencies', (select count(*) from task_dependencies d join tasks a on a.id = d.depends_on_id join tasks b on b.id = d.task_id where a.assignee_id = p_user and a.status not in ('done','cancelled') and b.status not in ('done','cancelled')),
    'meetings_organized', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'at', m.starts_at)), '[]') from meetings m where m.organizer_id = p_user and (m.starts_at at time zone 'Asia/Kolkata')::date between p_from and p_to),
    'approvals_pending', (select count(*) from approvals a where a.approver_id = p_user and a.status = 'pending'),
    'leaves_to_approve', (select count(*) from leaves l where l.manager_id = p_user and l.status = 'pending'),
    'help_requests_owned', (select count(*) from help_requests h where h.owner_id = p_user and h.status in ('new','accepted','working','waiting')),
    'direct_reports', (select count(*) from profiles where manager_id = p_user and is_active),
    'on_duty', (select coalesce(jsonb_agg(d.name), '[]') from departments d where d.on_duty_user_id = p_user),
    'projects_owned', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name)), '[]') from projects p where p.owner_id = p_user and not p.archived and p.status not in ('completed','cancelled')),
    'commitments_due', (select count(*) from commitments c where c.promised_by = p_user and c.status = 'open' and c.due_at::date between p_from and p_to),
    'delegation', (select jsonb_build_object('to', person_name(d.to_user_id), 'kinds', d.kinds) from delegations d where d.from_user_id = p_user and d.active limit 1),
    'suggested_backup', (select jsonb_build_object('id', b.id, 'name', b.full_name) from profiles p join profiles b on b.department_id = p.department_id and b.id <> p.id and b.is_active and role_rank(b.role) <= role_rank(p.role) where p.id = p_user order by (b.manager_id = p.manager_id) desc, role_rank(b.role) limit 1)
  ) end
$$;

create or replace function waiting_on_me(p_user uuid default auth.uid()) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not (p_user = auth.uid() or is_manager_of(p_user) or is_manager_plus()) then jsonb_build_object('error','forbidden') else jsonb_build_object(
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'by', person_name(t.assignee_id), 'since', t.updated_at, 'note', t.waiting_note) order by t.updated_at), '[]') from tasks t where t.waiting_on_user_id = p_user and t.status not in ('done','cancelled')),
    'approvals', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'by', person_name(a.requested_by), 'since', a.created_at, 'blocks', (select count(*) from tasks x where x.approver_id = p_user and x.status in ('in_review','waiting'))) order by a.created_at), '[]') from approvals a where a.approver_id = p_user and a.status = 'pending'),
    'leaves', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'by', person_name(l.user_id), 'from', l.starts_on, 'to', l.ends_on)), '[]') from leaves l where l.manager_id = p_user and l.status = 'pending'),
    'help_requests', (select coalesce(jsonb_agg(jsonb_build_object('id', h.id, 'title', h.title, 'by', person_name(h.requester_id), 'since', h.created_at, 'over_sla', h.ack_due_at < now())), '[]') from help_requests h where (h.owner_id = p_user or (h.owner_id is null and h.department_id = (select department_id from profiles where id = p_user) and is_lead_plus())) and h.status in ('new','accepted','working')),
    'access_requests', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'label', r.resource_label, 'by', person_name(r.requester_id), 'since', r.created_at)), '[]') from access_requests r where r.approver_id = p_user and r.status = 'pending'),
    'requests', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'kind', r.kind, 'by', person_name(r.user_id), 'since', r.created_at)), '[]') from requests r where r.approver_id = p_user and r.status = 'pending'),
    'commitments', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'text', c.text, 'to', coalesce(person_name(c.promised_to_user), c.promised_to_label), 'due', c.due_at)), '[]') from commitments c where c.promised_by = p_user and c.status = 'open'),
    'mentions', (select count(*) from notifications n where n.user_id = p_user and n.kind = 'mention' and n.read_at is null),
    'acks', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'from', person_name(coalesce(t.delegated_by, t.created_by)))), '[]') from tasks t where t.assignee_id = p_user and t.status not in ('done','cancelled') and t.ack_status is null and coalesce(t.delegated_by, t.created_by) <> p_user and t.created_at > now() - interval '14 days'),
    'workflow_steps', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'run', r.subject_label, 'due', s.due_date)), '[]') from workflow_steps s join workflow_runs r on r.id = s.run_id where s.owner_id = p_user and s.status in ('ready','in_progress'))
  ) end
$$;

create or replace function who_has_ball(p_type text, p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case p_type
    when 'task' then (select case
        when t.status in ('done','cancelled') then jsonb_build_object('with', null, 'state', t.status)
        when exists (select 1 from approvals a where a.task_id = t.id and a.status = 'pending') then (select jsonb_build_object('with', person_name(a.approver_id), 'with_id', a.approver_id, 'state', 'Approval', 'since', a.created_at) from approvals a where a.task_id = t.id and a.status = 'pending' order by a.created_at limit 1)
        when t.waiting_on_user_id is not null then jsonb_build_object('with', person_name(t.waiting_on_user_id), 'with_id', t.waiting_on_user_id, 'state', 'Waiting — ' || coalesce(t.waiting_note, t.waiting_on::text), 'since', t.updated_at)
        when exists (select 1 from handoffs h where h.task_id = t.id and h.status = 'pending') then (select jsonb_build_object('with', coalesce(person_name(h.to_user_id), (select name from departments where id = h.to_department_id)), 'with_id', h.to_user_id, 'state', 'Handoff pending', 'since', h.created_at) from handoffs h where h.task_id = t.id and h.status = 'pending' limit 1)
        when exists (select 1 from task_dependencies d join tasks x on x.id = d.depends_on_id where d.task_id = t.id and x.status not in ('done','cancelled')) then (select jsonb_build_object('with', person_name(x.assignee_id), 'with_id', x.assignee_id, 'state', 'Dependency: ' || x.title, 'since', x.updated_at) from task_dependencies d join tasks x on x.id = d.depends_on_id where d.task_id = t.id and x.status not in ('done','cancelled') limit 1)
        else jsonb_build_object('with', person_name(t.assignee_id), 'with_id', t.assignee_id, 'state', t.status::text, 'since', t.updated_at) end from tasks t where t.id = p_id and can_view_task(t.id))
    when 'help_request' then (select jsonb_build_object('with', coalesce(person_name(h.owner_id), (select name from departments where id = h.department_id) || ' (unassigned)'), 'with_id', h.owner_id, 'state', h.status::text, 'since', h.updated_at) from help_requests h where h.id = p_id)
    when 'approval' then (select jsonb_build_object('with', person_name(a.approver_id), 'with_id', a.approver_id, 'state', a.status::text, 'since', a.created_at) from approvals a where a.id = p_id)
    when 'project' then (select jsonb_build_object('with', person_name(p.owner_id), 'with_id', p.owner_id, 'state', p.status::text, 'blocked_by', (select count(*) from tasks t where t.project_id = p.id and t.status in ('blocked','waiting'))) from projects p where p.id = p_id and can_view_project(p.id))
    when 'request' then (select jsonb_build_object('with', person_name(r.approver_id), 'with_id', r.approver_id, 'state', r.status, 'since', r.created_at) from requests r where r.id = p_id)
    else null end
$$;

create or replace function similar_tasks(p_title text, p_limit int default 5) returns table(id uuid, title text, status task_status, assignee text, similarity real)
language sql stable security definer set search_path = public, extensions as $$
  select t.id, t.title, t.status, person_name(t.assignee_id), similarity(t.title, p_title)
    from tasks t where t.org_id = current_org() and t.status not in ('done','cancelled') and similarity(t.title, p_title) > 0.45 and can_view_task(t.id)
   order by similarity(t.title, p_title) desc limit p_limit
$$;
create or replace function similar_knowledge(p_title text, p_limit int default 5) returns table(id uuid, title text, kind text, similarity real)
language sql stable security definer set search_path = public, extensions as $$
  select k.id, k.title, k.kind, similarity(k.title, p_title) from ai_knowledge k where k.org_id = current_org() and k.status = 'approved' and similarity(k.title, p_title) > 0.4 order by 4 desc limit p_limit
$$;
create or replace function similar_help_requests(p_title text, p_department uuid, p_limit int default 5) returns table(id uuid, title text, status help_status, similarity real)
language sql stable security definer set search_path = public, extensions as $$
  select h.id, h.title, h.status, similarity(h.title, p_title) from help_requests h where h.org_id = current_org() and h.department_id = p_department and h.status in ('new','accepted','working','waiting') and similarity(h.title, p_title) > 0.45 order by 4 desc limit p_limit
$$;

-- return-from-leave catch-up
create or replace function while_you_were_away(p_since timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'since', p_since,
    'tasks_assigned', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'due', due_date)), '[]') from tasks where assignee_id = auth.uid() and created_at > p_since and status not in ('done','cancelled')),
    'tasks_changed', (select count(*) from task_history h join tasks t on t.id = h.task_id where t.assignee_id = auth.uid() and h.created_at > p_since),
    'decisions', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title)), '[]') from (select id, title from decisions where org_id = current_org() and created_at > p_since and (department_id = current_department() or project_id in (select project_id from project_members where user_id = auth.uid())) limit 10) x),
    'mentions', (select count(*) from notifications where user_id = auth.uid() and kind = 'mention' and created_at > p_since),
    'unread', (select count(*) from notifications where user_id = auth.uid() and read_at is null),
    'approvals_waiting', (select count(*) from approvals where approver_id = auth.uid() and status = 'pending'),
    'projects_updated', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status)), '[]') from projects p join project_members m on m.project_id = p.id where m.user_id = auth.uid() and p.updated_at > p_since),
    'announcements', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title)), '[]') from announcements where org_id = current_org() and published_at > p_since),
    'commitments_due', (select count(*) from commitments where promised_by = auth.uid() and status = 'open' and due_at < now() + interval '3 days')
  )
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table commitments enable row level security;
alter table standups enable row level security;
alter table questions enable row level security;
alter table answers enable row level security;
alter table answer_votes enable row level security;
alter table office_hours enable row level security;
alter table expert_slots enable row level security;
alter table requests enable row level security;
alter table resources enable row level security;
alter table bookings enable row level security;
alter table visitors enable row level security;
alter table events enable row level security;
alter table event_rsvps enable row level security;
alter table service_status enable row level security;
alter table broadcasts enable row level security;
alter table broadcast_acks enable row level security;
alter table checkins enable row level security;
alter table allocations enable row level security;
alter table surveys enable row level security;
alter table survey_responses enable row level security;
alter table retrospectives enable row level security;
alter table experiments enable row level security;

create policy cm_read on commitments for select to authenticated using (org_id = current_org() and (promised_by = auth.uid() or promised_to_user = auth.uid() or is_manager_of(promised_by) or is_manager_plus()));
create policy cm_insert on commitments for insert to authenticated with check (org_id = current_org() and (promised_by = auth.uid() or is_manager_of(promised_by)));
create policy cm_update on commitments for update to authenticated using (org_id = current_org() and (promised_by = auth.uid() or promised_to_user = auth.uid() or is_manager_of(promised_by)));
create policy su_read on standups for select to authenticated using (org_id = current_org() and (user_id = auth.uid() or is_manager_of(user_id) or is_manager_plus() or (select department_id from profiles where id = user_id) = current_department()));
create policy su_write on standups for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and org_id = current_org());
create policy q_read on questions for select to authenticated using (org_id = current_org() and is_active_member());
create policy q_insert on questions for insert to authenticated with check (org_id = current_org() and author_id = auth.uid());
create policy q_update on questions for update to authenticated using (org_id = current_org() and (author_id = auth.uid() or is_lead_plus()));
create policy a_read on answers for select to authenticated using (exists (select 1 from questions q where q.id = question_id));
create policy a_insert on answers for insert to authenticated with check (author_id = auth.uid());
create policy a_update on answers for update to authenticated using (author_id = auth.uid() or exists (select 1 from questions q where q.id = question_id and q.author_id = auth.uid()) or is_lead_plus());
create policy av_all on answer_votes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy av_read on answer_votes for select to authenticated using (true);
create policy oh_read on office_hours for select to authenticated using (org_id = current_org() and is_active_member());
create policy oh_write on office_hours for all to authenticated using (org_id = current_org() and (host_id = auth.uid() or is_lead_plus())) with check (org_id = current_org() and (host_id = auth.uid() or is_lead_plus()));
create policy es_read on expert_slots for select to authenticated using (host_id = auth.uid() or user_id = auth.uid() or is_manager_plus());
create policy es_insert on expert_slots for insert to authenticated with check (user_id = auth.uid());
create policy es_update on expert_slots for update to authenticated using (host_id = auth.uid() or user_id = auth.uid());
create policy rq_read on requests for select to authenticated using (org_id = current_org() and (user_id = auth.uid() or approver_id = auth.uid() or second_approver_id = auth.uid() or is_manager_of(user_id) or is_hr() or has_admin_perm('audit.read')));
create policy rq_insert on requests for insert to authenticated with check (org_id = current_org() and user_id = auth.uid());
create policy rq_update on requests for update to authenticated using (org_id = current_org() and (approver_id = auth.uid() or second_approver_id = auth.uid() or is_hr() or (user_id = auth.uid() and status = 'pending')));
create policy res_read on resources for select to authenticated using (org_id = current_org() and is_active_member());
create policy res_write on resources for all to authenticated using (org_id = current_org() and (is_admin() or is_hr() or has_admin_perm('system.manage'))) with check (org_id = current_org() and (is_admin() or is_hr() or has_admin_perm('system.manage')));
create policy bk_read on bookings for select to authenticated using (is_active_member());
create policy bk_write on bookings for all to authenticated using (user_id = auth.uid() or is_hr() or is_manager_plus()) with check (user_id = auth.uid() or is_hr());
create policy vis_read on visitors for select to authenticated using (org_id = current_org() and (host_id = auth.uid() or is_hr() or has_admin_perm('system.manage') or current_department() in (select id from departments where slug = 'admin' and org_id = current_org())));
create policy vis_write on visitors for all to authenticated using (org_id = current_org() and (host_id = auth.uid() or is_hr() or current_department() in (select id from departments where slug = 'admin' and org_id = current_org()))) with check (org_id = current_org() and is_active_member());
create policy ev_read on events for select to authenticated using (org_id = current_org() and is_active_member() and (department_ids is null or current_department() = any(department_ids) or is_manager_plus()));
create policy ev_write on events for all to authenticated using (org_id = current_org() and (created_by = auth.uid() or is_lead_plus() or is_hr())) with check (org_id = current_org() and (is_lead_plus() or is_hr()));
create policy rsvp_all on event_rsvps for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy rsvp_read on event_rsvps for select to authenticated using (true);
create policy ss_read on service_status for select to authenticated using (org_id = current_org());
create policy ss_write on service_status for all to authenticated using (org_id = current_org() and (is_admin() or has_admin_perm('system.manage') or current_department() in (select id from departments where slug = 'technology' and org_id = current_org()) and is_lead_plus())) with check (org_id = current_org());
create policy bc_read on broadcasts for select to authenticated using (org_id = current_org());
create policy bc_insert on broadcasts for insert to authenticated with check (org_id = current_org() and created_by = auth.uid());
create policy bca_all on broadcast_acks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy bca_read on broadcast_acks for select to authenticated using (is_manager_plus() or has_admin_perm('communication.manage'));
create policy ci_all on checkins for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ci_read on checkins for select to authenticated using (is_manager_plus() or is_hr() or has_admin_perm('security.manage'));
create policy al_read on allocations for select to authenticated using (user_id = auth.uid() or is_manager_of(user_id) or is_manager_plus() or is_hr());
create policy al_write on allocations for all to authenticated using (is_manager_of(user_id) or is_manager_plus() or is_hr()) with check (is_manager_of(user_id) or is_manager_plus() or is_hr());
create policy sv_read on surveys for select to authenticated using (org_id = current_org() and is_active_member());
create policy sv_write on surveys for all to authenticated using (org_id = current_org() and (is_hr() or is_manager_plus())) with check (org_id = current_org() and (is_hr() or is_manager_plus()));
create policy svr_insert on survey_responses for insert to authenticated with check (user_id is null or user_id = auth.uid());
create policy svr_read on survey_responses for select to authenticated using (is_hr() or is_manager_plus() or user_id = auth.uid());
create policy retro_read on retrospectives for select to authenticated using (org_id = current_org() and is_active_member());
create policy retro_write on retrospectives for all to authenticated using (org_id = current_org() and (created_by = auth.uid() or is_lead_plus())) with check (org_id = current_org() and is_active_member());
create policy exp_read on experiments for select to authenticated using (org_id = current_org() and is_active_member());
create policy exp_write on experiments for all to authenticated using (org_id = current_org() and (owner_id = auth.uid() or created_by = auth.uid() or is_manager_plus())) with check (org_id = current_org() and is_active_member());

grant execute on function my_commitments(), team_digest(date,uuid), meeting_load(uuid,date), meeting_cost(uuid), in_focus_window(uuid,timestamptz), capacity_calendar(uuid,int), assignment_warnings(uuid,timestamptz), what_if_absent(uuid,date,date), waiting_on_me(uuid), who_has_ball(text,uuid), similar_tasks(text,int), similar_knowledge(text,int), similar_help_requests(text,uuid,int), while_you_were_away(timestamptz) to authenticated;
revoke execute on function my_commitments(), team_digest(date,uuid), meeting_load(uuid,date), meeting_cost(uuid), in_focus_window(uuid,timestamptz), capacity_calendar(uuid,int), assignment_warnings(uuid,timestamptz), what_if_absent(uuid,date,date), waiting_on_me(uuid), who_has_ball(text,uuid), similar_tasks(text,int), similar_knowledge(text,int), similar_help_requests(text,uuid,int), while_you_were_away(timestamptz),
  commitment_reminders(), escalate_requests(), answer_vote_sync(), answers_notify(), expert_slot_notify(), request_route(), events_calendar(), service_status_notify(), broadcast_send(), meeting_hygiene() from anon, public;
revoke execute on function commitment_reminders(), escalate_requests() from authenticated;

select cron.schedule('ghl_commitments', '30 3 * * *', $$select commitment_reminders()$$);
select cron.schedule('ghl_request_sla', '*/30 * * * *', $$select escalate_requests()$$);
alter publication supabase_realtime add table requests, commitments, broadcasts, service_status, checkins;
