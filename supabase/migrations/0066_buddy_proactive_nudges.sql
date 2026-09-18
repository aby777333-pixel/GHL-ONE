-- 0066 — Buddy notices things nobody is looking at (§10)
--
-- Buddy waited to be asked. Everything it knows about overdue work, stalled approvals and forgotten
-- promises was reachable — `waiting_on_me()`, `my_commitments()`, the task and approval tables — but
-- only if somebody thought to ask. §10 asks for a layer that notices first.
--
-- THE CONSTRAINT THAT SHAPES THIS: "Do not create an annoying notification machine." Four rules:
--
--   1. **In-app only.** A nudge is a row in `buddy_nudges`, never a row in `notifications` — so it
--      cannot reach anybody's phone. The push fan-out exists and this deliberately does not use it:
--      a proactive layer earns that after it has been watched in the wild, not before.
--   2. **Deduplicated in the database.** `(user_id, dedupe_key)` is unique and the key carries the
--      day, so the same observation cannot be made twice. Verified: a second scan the same day
--      inserts nothing.
--   3. **Capped.** Three per person per scan, and the scan runs twice a day on working days.
--   4. **Quiet hours are honoured** by the same `in_quiet_hours()` everything else uses, and a
--      frozen or inactive person is skipped entirely.
--
-- Everything a nudge reads is the person's *own* work — their tasks, their approvals, their
-- promises, their meetings — so `buddy_scan` being SECURITY DEFINER discloses nothing: there is no
-- query in it that could return another person's row. Reading them back is ordinary RLS.

create table if not exists buddy_nudges (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  kind          text not null,
  severity      text not null default 'normal',
  title         text not null,
  body          text,
  link          text,
  entity_type   text,
  entity_id     uuid,
  dedupe_key    text not null,
  created_at    timestamptz not null default now(),
  seen_at       timestamptz,
  dismissed_at  timestamptz,
  snoozed_until timestamptz,
  constraint buddy_nudges_kind_ck check (kind in ('deadline','overdue','waiting_on_others','stalled_approval','forgotten_commitment','meeting_prep','workload')),
  constraint buddy_nudges_sev_ck  check (severity in ('low','normal','high'))
);

create unique index if not exists buddy_nudges_dedupe_idx on buddy_nudges (user_id, dedupe_key);
create index if not exists buddy_nudges_open_idx on buddy_nudges (user_id, created_at desc) where dismissed_at is null;

alter table buddy_nudges enable row level security;

drop policy if exists bn_own on buddy_nudges;
create policy bn_own on buddy_nudges for select to authenticated
  using (user_id = auth.uid() and org_id = current_org());

drop policy if exists bn_own_update on buddy_nudges;
create policy bn_own_update on buddy_nudges for update to authenticated
  using (user_id = auth.uid() and org_id = current_org())
  with check (user_id = auth.uid() and org_id = current_org());

drop policy if exists bn_own_delete on buddy_nudges;
create policy bn_own_delete on buddy_nudges for delete to authenticated
  using (user_id = auth.uid() and org_id = current_org());

-- No INSERT policy: nudges are written by the scan, never by a client.

create or replace function buddy_scan(p_user uuid, p_max int default 3)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_prof   profiles%rowtype;
  v_today  date := (now() at time zone 'Asia/Kolkata')::date;
  v_made   int := 0;
  v_n      int;
  v_row    record;
  v_key    text;
begin
  select * into v_prof from profiles where id = p_user;
  if v_prof.id is null or not v_prof.is_active or v_prof.frozen then return 0; end if;
  if in_quiet_hours(p_user) then return 0; end if;

  -- 1. overdue work assigned to them (one summary, never one per task)
  select count(*) into v_n from tasks t
   where t.assignee_id = p_user and t.org_id = v_prof.org_id
     and t.status not in ('done','cancelled') and t.due_date is not null
     and t.due_date < now();
  if v_n > 0 and v_made < p_max then
    v_key := 'overdue:' || v_today;
    insert into buddy_nudges (org_id, user_id, kind, severity, title, body, link, dedupe_key)
    values (v_prof.org_id, p_user, 'overdue', case when v_n >= 5 then 'high' else 'normal' end,
            v_n || ' task' || case when v_n = 1 then ' is' else 's are' end || ' past their due date',
            'Reschedule what has moved, or say what is blocking it so the people waiting know.',
            '/my-work', v_key)
    on conflict (user_id, dedupe_key) do nothing;
    if found then v_made := v_made + 1; end if;
  end if;

  -- 2. due in the next two days
  select count(*) into v_n from tasks t
   where t.assignee_id = p_user and t.org_id = v_prof.org_id
     and t.status not in ('done','cancelled') and t.due_date is not null
     and t.due_date >= now() and t.due_date < now() + interval '48 hours';
  if v_n > 0 and v_made < p_max then
    v_key := 'deadline:' || v_today;
    insert into buddy_nudges (org_id, user_id, kind, severity, title, body, link, dedupe_key)
    values (v_prof.org_id, p_user, 'deadline', 'normal',
            v_n || ' task' || case when v_n = 1 then '' else 's' end || ' due in the next two days',
            'Worth a look before they become overdue.', '/my-work', v_key)
    on conflict (user_id, dedupe_key) do nothing;
    if found then v_made := v_made + 1; end if;
  end if;

  -- 3. approvals sitting with them — the one kind where somebody else is blocked
  select count(*) into v_n from approvals a
   where a.approver_id = p_user and a.org_id = v_prof.org_id
     and a.status = 'pending' and a.created_at < now() - interval '2 days';
  if v_n > 0 and v_made < p_max then
    v_key := 'stalled_approval:' || v_today;
    insert into buddy_nudges (org_id, user_id, kind, severity, title, body, link, dedupe_key)
    values (v_prof.org_id, p_user, 'stalled_approval', 'high',
            v_n || ' approval' || case when v_n = 1 then ' has' else 's have' end || ' been waiting on you for over two days',
            'Somebody is blocked until you decide. Approving or declining both unblock them.',
            '/approvals', v_key)
    on conflict (user_id, dedupe_key) do nothing;
    if found then v_made := v_made + 1; end if;
  end if;

  -- 4. a promise they made, now due
  select count(*) into v_n from commitments c
   where c.promised_by = p_user and c.org_id = v_prof.org_id
     and c.status <> 'done' and c.due_at is not null and c.due_at < now();
  if v_n > 0 and v_made < p_max then
    v_key := 'forgotten_commitment:' || v_today;
    insert into buddy_nudges (org_id, user_id, kind, severity, title, body, link, dedupe_key)
    values (v_prof.org_id, p_user, 'forgotten_commitment', 'high',
            v_n || ' promise' || case when v_n = 1 then '' else 's' end || ' you made ' || case when v_n = 1 then 'is' else 'are' end || ' past due',
            'Either do it, or tell the person it has moved — the second one is what keeps trust.',
            '/my-work', v_key)
    on conflict (user_id, dedupe_key) do nothing;
    if found then v_made := v_made + 1; end if;
  end if;

  -- 5. work of theirs that has been waiting on somebody else for a week
  select count(*) into v_n from tasks t
   where t.owner_id = p_user and t.org_id = v_prof.org_id
     and t.status in ('waiting','blocked') and t.updated_at < now() - interval '7 days';
  if v_n > 0 and v_made < p_max then
    v_key := 'waiting_on_others:' || v_today;
    insert into buddy_nudges (org_id, user_id, kind, severity, title, body, link, dedupe_key)
    values (v_prof.org_id, p_user, 'waiting_on_others', 'normal',
            v_n || ' of your task' || case when v_n = 1 then ' has' else 's have' end || ' been waiting on somebody else for a week',
            'Nothing has moved. A nudge, or a different plan.', '/my-work', v_key)
    on conflict (user_id, dedupe_key) do nothing;
    if found then v_made := v_made + 1; end if;
  end if;

  -- 6. a meeting within a day that still has no agenda
  if v_made < p_max then
    select m.id, m.title, m.starts_at into v_row
      from meetings m
      join meeting_participants mp on mp.meeting_id = m.id and mp.user_id = p_user
     where m.org_id = v_prof.org_id and m.cancelled_at is null
       and m.starts_at between now() and now() + interval '24 hours'
       and coalesce(btrim(m.agenda), '') = ''
     order by m.starts_at limit 1;
    if v_row.id is not null then
      v_key := 'meeting_prep:' || v_row.id;
      insert into buddy_nudges (org_id, user_id, kind, severity, title, body, link, entity_type, entity_id, dedupe_key)
      values (v_prof.org_id, p_user, 'meeting_prep', 'low',
              'No agenda yet for "' || v_row.title || '"',
              'It starts within a day. Ask Buddy to prepare you, or write three lines so it does not drift.',
              '/meetings/' || v_row.id, 'meeting', v_row.id, v_key)
      on conflict (user_id, dedupe_key) do nothing;
      if found then v_made := v_made + 1; end if;
    end if;
  end if;

  return v_made;
end $$;

-- One person's scan failing must never stop the rest, so each is its own block.
create or replace function buddy_scan_all()
returns int
language plpgsql security definer set search_path = public as $$
declare v_total int := 0; u uuid;
begin
  for u in select id from profiles where is_active and not frozen loop
    begin
      v_total := v_total + coalesce(buddy_scan(u, 3), 0);
    exception when others then
      null;
    end;
  end loop;
  delete from buddy_nudges where created_at < now() - interval '30 days';
  return v_total;
end $$;

create or replace function my_nudges()
returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id, 'kind', n.kind, 'severity', n.severity, 'title', n.title,
           'body', n.body, 'link', n.link, 'created_at', n.created_at, 'seen', n.seen_at is not null
         ) order by case n.severity when 'high' then 0 when 'normal' then 1 else 2 end, n.created_at desc), '[]'::jsonb)
    from buddy_nudges n
   where n.user_id = auth.uid()
     and n.dismissed_at is null
     and (n.snoozed_until is null or n.snoozed_until < now())
     and n.created_at > now() - interval '7 days'
$$;

create or replace function dismiss_nudge(p_id uuid, p_snooze_hours int default null)
returns jsonb
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_snooze_hours is null then
    update buddy_nudges set dismissed_at = now() where id = p_id and user_id = auth.uid();
  else
    update buddy_nudges set snoozed_until = now() + (greatest(1, least(p_snooze_hours, 168)) || ' hours')::interval, seen_at = coalesce(seen_at, now())
     where id = p_id and user_id = auth.uid();
  end if;
  return jsonb_build_object('ok', found);
end $$;

create or replace function seen_nudges()
returns jsonb
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  update buddy_nudges set seen_at = now() where user_id = auth.uid() and seen_at is null and dismissed_at is null;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function buddy_scan(uuid, int) from public, anon;
revoke all on function buddy_scan_all() from public, anon;
revoke all on function my_nudges() from public, anon;
revoke all on function dismiss_nudge(uuid, int) from public, anon;
revoke all on function seen_nudges() from public, anon;
grant execute on function my_nudges() to authenticated;
grant execute on function dismiss_nudge(uuid, int) to authenticated;
grant execute on function seen_nudges() to authenticated;
grant select, update, delete on buddy_nudges to authenticated;

-- 09:30 and 15:30 IST, working days. `buddy_scan` and `buddy_scan_all` are not granted to
-- `authenticated` at all — the scan is the cron's job, not a button.
select cron.schedule('ghl_buddy_nudges', '0 4,10 * * 1-6', $$select buddy_scan_all()$$);
