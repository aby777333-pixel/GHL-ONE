-- 0076_coverage_alert_noise.sql
--
-- "X is under-covered", 1,738 times.
--
-- attendance_cron_tick() (0019) raised a coverage alert whenever a department had fewer people
-- present than its coverage_requirements row asks for, de-duplicated only against the last hour.
-- Thirteen of the sixteen requirements ask for one person on duty in a department that has NO
-- active people at all, so they can never be met; and one person (Abe) is head of all of them.
-- Result: ~13 "action required" alerts an hour, 09:00–21:00, every working day — 1,726 rows for
-- Abe alone, each one pushed past quiet hours because the kind was action_required.
--
-- Three changes, all in the coverage block of the same function (nothing else is touched):
--   1. A requirement larger than the department's active headcount is configuration, not a gap:
--      it is skipped. Nobody can act on "need 1, have 0 staff" from a notification.
--   2. One alert per department per day, and none while an earlier one is still unread.
--   3. kind = information, priority = important: it stays visible and sounds, but it no longer
--      bypasses quiet hours or claims the person must act.
-- The existing coverage_gap rows are removed; the fixed rule re-creates what is still true.

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
    -- 3) coverage shortfall now → on-duty / head. Once per department per day, never while an
    --    earlier alert is still unread, and never for a requirement the department cannot meet
    --    with the people it has (that is a configuration problem, not a gap on the floor).
    insert into notifications (user_id, kind, priority, title, body, link, entity_type, entity_id)
    select coalesce(d.on_duty_user_id, d.head_id), 'information'::notification_kind, 'important', d.name || ' is under-covered', 'Fewer people available than the coverage requirement right now.', '/workforce', 'coverage_gap', d.id
      from departments d
     where d.org_id = r.org_id and coalesce(d.on_duty_user_id, d.head_id) is not null and t_local between time '08:00' and time '21:00' and extract(isodow from d_local) between 1 and 6
       and exists (select 1 from coverage_requirements cr where cr.department_id = d.id and cr.team_id is null and extract(isodow from d_local)::int = any(cr.days) and t_local between cr.from_time and cr.to_time
                     and cr.min_people <= (select count(*) from profiles p where p.department_id = d.id and p.is_active)
                     and cr.min_people > (select count(*) from profiles p where p.department_id = d.id and p.is_active and p.presence in ('available','busy','focus','on_call','remote','field')))
       and not exists (select 1 from notifications n where n.user_id = coalesce(d.on_duty_user_id, d.head_id) and n.entity_type = 'coverage_gap' and n.entity_id = d.id
                         and (n.read_at is null or (n.created_at at time zone 'Asia/Kolkata')::date = d_local));
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
revoke execute on function attendance_cron_tick() from public, anon, authenticated;

-- The backlog the old rule produced. The fixed rule re-creates one per department per day if a
-- gap is real.
delete from notifications where entity_type = 'coverage_gap';
