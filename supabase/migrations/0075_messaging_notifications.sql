-- 0075_messaging_notifications.sql
--
-- A message sent to a channel was never a notification.
--
-- `message_after_insert()` (0001) wrote a `notifications` row for two cases only: a person named in
-- `mentions`, and every member of a DM. A message posted to #techy, #general, a department room or
-- an announcement channel wrote nothing. Everything downstream of a notification row — the pop-up
-- toaster, the bell badge, the push fan-out to a phone, the Inbox — therefore had nothing to react
-- to. The sidebar count and the activity dot moved (they read `messages` directly) and that was the
-- whole signal. Management sent a message to #techy and nobody noticed. This is the fix.
--
-- What this migration adds, all additive:
--   * notifications.priority (normal|important|urgent|critical), .meta (channel, sender, message,
--     batch count) and .snoozed_until. Existing rows get 'normal' / '{}' / null.
--   * messages.priority, .ack_required, .remind_after_minutes, .escalate, .ack_requested_at — who
--     may raise a message's priority is enforced by a BEFORE trigger, not by hiding a picker.
--   * notification_prefs: sound, sound_volume, desktop, dm_alerts, group_alerts, previews,
--     batching, working_start/end, timezone, shared_device. Every default reproduces today's
--     behaviour for someone who never opens the settings page.
--   * message_receipts: notified / seen / acknowledged, separately and with timestamps, for
--     messages that ask for acknowledgement (ack_required, or urgent/critical). Delivery of a
--     notification, reading the message and acknowledging it are three different facts.
--   * message_after_insert() rewritten: channel messages notify every eligible member (muted
--     channels, "mentions only", DM alerts off and inactive people are respected; urgent/critical
--     and ack-required messages get through a mute, because an explicit priority rule is exactly
--     the exception §Scenario F allows); @everyone / @here for authorised senders; thread replies
--     notify the thread, not the room; bursts within two minutes fold into one notification
--     ("3 new messages in #techy") so a fast conversation is one alert, not ten.
--   * mark_channel_read() also stamps receipts as seen and marks that channel's message
--     notifications read, so the bell and the chat count agree.
--   * ack_message / message_ack_report / request_acks, and a cron (`message_followups`, every
--     10 min) that reminds once, in quiet hours never, and escalates only when the sender asked.
--   * in_quiet_hours() honours a per-person time zone when one is set.
--   * push_notification() exposes priority and meta so the push payload can group by channel.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table notifications add column if not exists priority text not null default 'normal';
alter table notifications add column if not exists meta jsonb not null default '{}'::jsonb;
alter table notifications add column if not exists snoozed_until timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_priority_chk') then
    alter table notifications add constraint notifications_priority_chk check (priority in ('normal','important','urgent','critical'));
  end if;
end $$;
-- The batching lookup: "does this person already have an unread notification for this channel?"
create index if not exists notifications_unread_channel_idx on notifications (user_id, (meta->>'channel_id')) where read_at is null;

alter table messages add column if not exists priority text not null default 'normal';
alter table messages add column if not exists ack_required boolean not null default false;
alter table messages add column if not exists remind_after_minutes int;
alter table messages add column if not exists escalate boolean not null default false;
alter table messages add column if not exists ack_requested_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'messages_priority_chk') then
    alter table messages add constraint messages_priority_chk check (priority in ('normal','important','urgent','critical'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'messages_remind_chk') then
    alter table messages add constraint messages_remind_chk check (remind_after_minutes is null or (remind_after_minutes between 5 and 10080));
  end if;
end $$;

alter table notification_prefs add column if not exists sound boolean not null default true;
alter table notification_prefs add column if not exists sound_volume int not null default 70;
alter table notification_prefs add column if not exists desktop boolean not null default true;
alter table notification_prefs add column if not exists dm_alerts boolean not null default true;
alter table notification_prefs add column if not exists group_alerts text not null default 'all';
alter table notification_prefs add column if not exists previews boolean not null default true;
alter table notification_prefs add column if not exists batching boolean not null default true;
alter table notification_prefs add column if not exists working_start time;
alter table notification_prefs add column if not exists working_end time;
alter table notification_prefs add column if not exists timezone text;
alter table notification_prefs add column if not exists shared_device boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notification_prefs_group_alerts_chk') then
    alter table notification_prefs add constraint notification_prefs_group_alerts_chk check (group_alerts in ('all','mentions','none'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notification_prefs_volume_chk') then
    alter table notification_prefs add constraint notification_prefs_volume_chk check (sound_volume between 0 and 100);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. message_receipts — notified, seen, acknowledged: three facts, three columns
-- ---------------------------------------------------------------------------
create table if not exists message_receipts (
  message_id   uuid not null references messages(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  org_id       uuid not null references organizations(id) on delete cascade,
  channel_id   uuid not null references channels(id) on delete cascade,
  notified_at  timestamptz not null default now(),
  seen_at      timestamptz,
  ack_status   text check (ack_status in ('seen','acknowledged','will_respond','need_clarification')),
  acked_at     timestamptz,
  reminded_at  timestamptz,
  escalated_at timestamptz,
  primary key (message_id, user_id)
);
create index if not exists message_receipts_user_idx on message_receipts (user_id, channel_id) where seen_at is null;
create index if not exists message_receipts_followup_idx on message_receipts (notified_at) where ack_status is null;
create index if not exists message_receipts_org_idx on message_receipts (org_id);
create index if not exists message_receipts_channel_idx on message_receipts (channel_id);

alter table message_receipts enable row level security;
drop policy if exists mr_read on message_receipts;
-- Your own receipt, or you wrote the message, or you run communication for this company. Always
-- bounded to the company and to a channel you can open; never a route around chat visibility.
create policy mr_read on message_receipts for select to authenticated using (
  org_id = current_org() and can_view_channel(channel_id) and (
    user_id = auth.uid()
    or exists (select 1 from messages m where m.id = message_receipts.message_id and m.author_id = auth.uid())
    or is_manager_plus()
    or has_admin_perm('communication.manage')
  )
);
-- No insert/update/delete policy: the trigger writes receipts, ack_message() updates them.

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------
create or replace function priority_rank(p text) returns int
language sql immutable set search_path = public as $$
  select case p when 'critical' then 3 when 'urgent' then 2 when 'important' then 1 else 0 end
$$;

create or replace function max_priority(a text, b text) returns text
language sql immutable set search_path = public as $$
  select case when priority_rank(b) > priority_rank(a) then b else coalesce(a, 'normal') end
$$;

-- Who may send at which priority, read off the author's profile (never the session) so the same
-- rule applies to a trigger firing for an automation as to a person typing.
create or replace function message_priority_allowed_for(p_user uuid, p_channel uuid, p_priority text) returns boolean
language sql stable security definer set search_path = public as $$
  select case coalesce(p_priority, 'normal')
    when 'normal' then true
    when 'important' then exists (select 1 from profiles p where p.id = p_user and role_rank(p.role) <= 5)
                       or exists (select 1 from channels c where c.id = p_channel and (c.owner_id = p_user or c.co_owner_id = p_user))
                       or has_perm('communication.manage', p_user)
    when 'urgent'    then exists (select 1 from profiles p where p.id = p_user and role_rank(p.role) <= 4)
                       or has_perm('communication.manage', p_user)
    when 'critical'  then exists (select 1 from profiles p where p.id = p_user and role_rank(p.role) <= 2)
                       or has_perm('communication.manage', p_user)
                       or has_perm('security.manage', p_user)
    else false end
$$;

-- The caller's own answer, for the composer to decide which options to show. The trigger is the control.
create or replace function message_priority_allowed(p_channel uuid, p_priority text) returns boolean
language sql stable security definer set search_path = public as $$
  select message_priority_allowed_for(auth.uid(), p_channel, p_priority)
$$;

-- May this person address @everyone / @here, ask for acknowledgement, set reminders?
create or replace function can_broadcast_in(p_user uuid, p_channel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = p_user and role_rank(p.role) <= 5)
      or exists (select 1 from channels c where c.id = p_channel and (c.owner_id = p_user or c.co_owner_id = p_user))
      or has_perm('communication.manage', p_user)
$$;

-- ---------------------------------------------------------------------------
-- 4. BEFORE INSERT guard on messages: priority, @everyone, acknowledgement, escalation
-- ---------------------------------------------------------------------------
create or replace function message_priority_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare ch channels%rowtype;
begin
  if new.kind = 'system' then return new; end if;
  select * into ch from channels where id = new.channel_id;
  new.priority := coalesce(new.priority, 'normal');

  -- An announcement channel is important by construction (§2: "announcement channels where
  -- important messages receive higher priority"). Floor, never ceiling.
  if ch.type = 'announcement' and priority_rank(new.priority) < 1 then new.priority := 'important'; end if;

  -- A trigger with no session (automation, import) stands down — 0058 convention.
  if auth.uid() is null then return new; end if;

  if not message_priority_allowed_for(new.author_id, new.channel_id, new.priority) then
    raise exception 'You are not allowed to send % messages here', new.priority using errcode = '42501';
  end if;
  if new.ack_required and not can_broadcast_in(new.author_id, new.channel_id) then
    raise exception 'Only a team lead, manager or channel owner can ask for acknowledgement' using errcode = '42501';
  end if;
  if new.remind_after_minutes is not null and not new.ack_required then new.remind_after_minutes := null; end if;
  if new.escalate and (not new.ack_required or new.remind_after_minutes is null) then new.escalate := false; end if;
  if new.escalate and not exists (select 1 from profiles p where p.id = new.author_id and role_rank(p.role) <= 4) and not has_perm('communication.manage', new.author_id) then
    raise exception 'Only a manager can escalate an unanswered message to a department head' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists messages_priority_guard on messages;
create trigger messages_priority_guard before insert on messages for each row execute function message_priority_guard();

-- ---------------------------------------------------------------------------
-- 5. The fan-out
-- ---------------------------------------------------------------------------
create or replace function message_after_insert() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  ch channels%rowtype;
  sender_name text;
  sender_first text;
  m uuid;
  preview text;
  base_kind notification_kind;
  broadcast text;            -- 'everyone' | 'here' | null
  authorised boolean;
  is_reply boolean := new.parent_id is not null;
  track_ack boolean;
  recip record;
  existing notifications%rowtype;
  n_kind notification_kind;
  n_priority text;
  n_title text;
  n_link text;
  n_meta jsonb;
  cnt int;
  prio_person boolean;
  bypass_mute boolean;
begin
  select * into ch from channels where id = new.channel_id;
  update channels set last_message_at = new.created_at where id = new.channel_id;
  select full_name into sender_name from profiles where id = new.author_id;
  sender_name := coalesce(sender_name, 'Someone');
  sender_first := split_part(sender_name, ' ', 1);
  -- the sender has read their own message
  update channel_members set last_read_at = new.created_at where channel_id = new.channel_id and user_id = new.author_id;

  if ch.id is null or new.kind = 'system' or coalesce(ch.archived, false) then return new; end if;

  preview := left(regexp_replace(coalesce(new.body, ''), '\[@([^\]]+)\]', '@\1', 'g'), 140);
  if preview = '' then
    preview := case when new.kind = 'voice' then '🎤 Voice message'
                    when (case when jsonb_typeof(new.attachments) = 'array' then jsonb_array_length(new.attachments) else 0 end) > 0 then '📎 Attachment'
                    else '' end;
  end if;
  base_kind := case new.priority when 'critical' then 'critical'::notification_kind
                                 when 'urgent' then 'action_required'::notification_kind
                                 else 'information'::notification_kind end;
  n_link := '/chat/' || ch.id || '?m=' || new.id;
  n_meta := jsonb_build_object(
    'channel_id', ch.id, 'channel_type', ch.type::text, 'channel_name', ch.name,
    'message_id', new.id, 'sender_id', new.author_id, 'sender_name', sender_name,
    'parent_id', new.parent_id, 'ack_required', new.ack_required, 'message_priority', new.priority, 'count', 1);
  track_ack := new.ack_required or priority_rank(new.priority) >= 2;
  bypass_mute := track_ack;   -- an explicit priority rule is the one thing that gets past a mute

  authorised := can_broadcast_in(new.author_id, ch.id);
  broadcast := case when new.body ~ '\[@everyone\]' then 'everyone' when new.body ~ '\[@here\]' then 'here' else null end;
  if broadcast is not null and (not authorised or ch.type = 'dm') then broadcast := null; end if;
  if broadcast is not null then n_meta := n_meta || jsonb_build_object('broadcast', broadcast); end if;

  -- 5a. Named mentions (the pre-existing behaviour, now carrying meta and an elevated priority).
  foreach m in array new.mentions loop
    if m <> new.author_id and exists (select 1 from profiles p where p.id = m and p.is_active) then
      insert into notifications (user_id, org_id, kind, priority, title, body, link, entity_type, entity_id, actor_id, meta)
      values (m, ch.org_id, 'mention'::notification_kind, max_priority(new.priority, 'important'),
              sender_name || ' mentioned you in ' || case when ch.type = 'dm' then 'a message' else '#' || ch.name end,
              preview, n_link, 'message', new.id, new.author_id, n_meta || '{"mention": true}'::jsonb);
      if track_ack then
        insert into message_receipts (message_id, user_id, org_id, channel_id) values (new.id, m, ch.org_id, ch.id) on conflict do nothing;
      end if;
    end if;
  end loop;

  -- 5b. Everyone else who should hear about it.
  for recip in
    select cm.user_id, cm.muted, p.presence, p.department_id,
           coalesce(np.dm_alerts, true) as dm_alerts, coalesce(np.group_alerts, 'all') as group_alerts,
           coalesce(np.muted_channels, '{}'::uuid[]) as muted_channels, coalesce(np.priority_people, '{}'::uuid[]) as priority_people,
           coalesce(np.batching, true) as batching
      from channel_members cm
      join profiles p on p.id = cm.user_id
      left join notification_prefs np on np.user_id = cm.user_id
     where cm.channel_id = ch.id
       and cm.user_id <> new.author_id
       and p.is_active
       and (cm.expires_at is null or cm.expires_at > now())
       and not (cm.user_id = any(new.mentions))
       and (
         -- a thread reply reaches the thread, not the room (DMs are small enough to be the thread)
         not is_reply or ch.type = 'dm'
         or cm.user_id = (select author_id from messages where id = new.parent_id)
         or cm.user_id in (select author_id from messages where parent_id = new.parent_id and author_id is not null)
       )
  loop
    prio_person := new.author_id = any(recip.priority_people);
    n_kind := base_kind;
    n_priority := new.priority;
    if prio_person then n_priority := max_priority(n_priority, 'important'); end if;

    if broadcast = 'everyone' or (broadcast = 'here' and coalesce(recip.presence::text, 'offline') not in ('offline', 'away', 'leave')) then
      n_kind := 'mention'::notification_kind;
      n_priority := max_priority(n_priority, 'important');
      n_title := sender_name || ' mentioned @' || broadcast || ' in #' || ch.name;
    else
      -- Preferences. A person who muted a channel, or who only wants mentions, is left alone —
      -- unless the sender was authorised to say this one matters (urgent/critical/ack), or the
      -- recipient marked the sender as a priority person.
      if not bypass_mute and not prio_person then
        if ch.type = 'dm' then
          if not recip.dm_alerts or recip.muted then continue; end if;
        else
          if recip.muted or ch.id = any(recip.muted_channels) then continue; end if;
          if recip.group_alerts = 'none' then continue; end if;
          if recip.group_alerts = 'mentions' and priority_rank(n_priority) < 1 then continue; end if;
        end if;
      end if;
      n_title := case
        when ch.type = 'dm' and is_reply then sender_name || ' replied in your thread'
        when ch.type = 'dm' then sender_name || ' sent you a message'
        when is_reply then sender_name || ' replied in a thread in #' || ch.name
        else sender_name || ' in #' || ch.name end;
    end if;

    -- Batching: a burst from the same room within two minutes becomes one notification that
    -- grows, instead of one row (and one pop-up, and one push) per sentence. Only for ordinary
    -- and important traffic; urgent, critical, acknowledgement and broadcast mentions are always their own row.
    existing := null;
    if recip.batching and not track_ack and priority_rank(n_priority) < 2 and n_kind <> 'mention'::notification_kind then
      select * into existing from notifications n
       where n.user_id = recip.user_id and n.read_at is null and n.entity_type = 'message'
         and n.meta->>'channel_id' = ch.id::text and n.kind = n_kind
         and n.created_at > now() - interval '2 minutes'
       order by n.created_at desc limit 1;
    end if;

    if existing.id is not null then
      cnt := coalesce((existing.meta->>'count')::int, 1) + 1;
      update notifications
         set title = cnt || ' new messages ' || case when ch.type = 'dm' then 'from ' || sender_name else 'in #' || ch.name end,
             body = case when ch.type = 'dm' then preview else sender_first || ': ' || preview end,
             priority = max_priority(priority, n_priority),
             actor_id = new.author_id,
             meta = existing.meta || jsonb_build_object('count', cnt, 'message_id', new.id, 'sender_id', new.author_id, 'sender_name', sender_name, 'bumped_at', now())
       where id = existing.id;
    else
      insert into notifications (user_id, org_id, kind, priority, title, body, link, entity_type, entity_id, actor_id, meta)
      values (recip.user_id, ch.org_id, n_kind, n_priority, n_title, preview, n_link, 'message', new.id, new.author_id, n_meta);
    end if;

    if track_ack then
      insert into message_receipts (message_id, user_id, org_id, channel_id) values (new.id, recip.user_id, ch.org_id, ch.id) on conflict do nothing;
    end if;
  end loop;

  return new;
end $$;
-- The trigger `messages_after_insert` (0001) stays attached; create or replace does not detach it.

-- ---------------------------------------------------------------------------
-- 6. Reading a channel reads its notifications too
-- ---------------------------------------------------------------------------
create or replace function mark_channel_read(c uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update channel_members set last_read_at = now() where channel_id = c and user_id = auth.uid();
  update message_receipts set seen_at = now() where channel_id = c and user_id = auth.uid() and seen_at is null;
  update notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and entity_type = 'message' and meta->>'channel_id' = c::text;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Acknowledgement
-- ---------------------------------------------------------------------------
create or replace function ack_message(p_message uuid, p_status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare msg messages%rowtype; ch channels%rowtype; me uuid := auth.uid(); r message_receipts%rowtype; who text;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_status not in ('seen', 'acknowledged', 'will_respond', 'need_clarification') then
    raise exception 'unknown acknowledgement %', p_status;
  end if;
  select * into msg from messages where id = p_message;
  if msg.id is null or not can_view_channel(msg.channel_id) then raise exception 'message not found' using errcode = '42501'; end if;
  if not (msg.ack_required or priority_rank(msg.priority) >= 2) then
    raise exception 'This message does not ask for acknowledgement';
  end if;
  if msg.author_id = me then raise exception 'You wrote this message'; end if;
  select * into ch from channels where id = msg.channel_id;

  insert into message_receipts (message_id, user_id, org_id, channel_id, notified_at, seen_at)
  values (msg.id, me, ch.org_id, ch.id, msg.created_at, now())
  on conflict (message_id, user_id) do update set seen_at = coalesce(message_receipts.seen_at, now());

  if p_status <> 'seen' then
    update message_receipts set ack_status = p_status, acked_at = now() where message_id = msg.id and user_id = me;
    -- "Need clarification" is a question for the sender; the other answers are read off the report.
    if p_status = 'need_clarification' and msg.author_id is not null then
      select full_name into who from profiles where id = me;
      insert into notifications (user_id, org_id, kind, priority, title, body, link, entity_type, entity_id, actor_id, meta)
      values (msg.author_id, ch.org_id, 'information'::notification_kind, 'important',
              coalesce(who, 'Someone') || ' needs clarification on your message', left(msg.body, 140),
              '/chat/' || ch.id || '?m=' || msg.id, 'message', msg.id, me,
              jsonb_build_object('channel_id', ch.id, 'channel_type', ch.type::text, 'channel_name', ch.name, 'message_id', msg.id, 'ack', p_status));
    end if;
  end if;
  select * into r from message_receipts where message_id = msg.id and user_id = me;
  return to_jsonb(r);
end $$;

-- Who received, saw and acknowledged: for the author and for communication administrators.
create or replace function message_ack_report(p_message uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare msg messages%rowtype; ch channels%rowtype; me uuid := auth.uid(); out jsonb;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into msg from messages where id = p_message;
  if msg.id is null or not can_view_channel(msg.channel_id) then raise exception 'message not found' using errcode = '42501'; end if;
  select * into ch from channels where id = msg.channel_id;
  if not (msg.author_id = me or is_manager_plus() or has_admin_perm('communication.manage')) then
    raise exception 'Only the sender or a communication administrator can see acknowledgements' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'message_id', msg.id, 'priority', msg.priority, 'ack_required', msg.ack_required,
    'remind_after_minutes', msg.remind_after_minutes, 'escalate', msg.escalate, 'ack_requested_at', msg.ack_requested_at,
    'tracked', msg.ack_required or priority_rank(msg.priority) >= 2,
    'recipients', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', r.user_id, 'full_name', p.full_name, 'avatar_url', p.avatar_url,
               'notified_at', r.notified_at, 'seen_at', r.seen_at, 'ack_status', r.ack_status, 'acked_at', r.acked_at,
               'reminded_at', r.reminded_at, 'escalated_at', r.escalated_at)
             order by r.ack_status is null, r.seen_at is null, p.full_name)
        from message_receipts r join profiles p on p.id = r.user_id
       where r.message_id = msg.id), '[]'::jsonb),
    'members', (select count(*) from channel_members cm join profiles p on p.id = cm.user_id where cm.channel_id = ch.id and cm.user_id <> msg.author_id and p.is_active)
  ) into out;
  return out;
end $$;

-- One nudge to everybody who has not answered, at most once an hour per message.
create or replace function request_acks(p_message uuid) returns int
language plpgsql security definer set search_path = public as $$
declare msg messages%rowtype; ch channels%rowtype; me uuid := auth.uid(); who text; n int := 0; r record;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into msg from messages where id = p_message;
  if msg.id is null or not can_view_channel(msg.channel_id) then raise exception 'message not found' using errcode = '42501'; end if;
  if not (msg.author_id = me or is_manager_plus() or has_admin_perm('communication.manage')) then
    raise exception 'Only the sender or a communication administrator can request acknowledgement' using errcode = '42501';
  end if;
  if not (msg.ack_required or priority_rank(msg.priority) >= 2) then raise exception 'This message does not ask for acknowledgement'; end if;
  if msg.ack_requested_at is not null and msg.ack_requested_at > now() - interval '1 hour' then
    raise exception 'A reminder was already sent less than an hour ago';
  end if;
  select * into ch from channels where id = msg.channel_id;
  select full_name into who from profiles where id = me;
  for r in select mr.user_id from message_receipts mr where mr.message_id = msg.id and mr.ack_status is null loop
    insert into notifications (user_id, org_id, kind, priority, title, body, link, entity_type, entity_id, actor_id, meta)
    values (r.user_id, ch.org_id, 'action_required'::notification_kind, 'important',
            coalesce(who, 'Someone') || ' is asking you to acknowledge a message in #' || ch.name, left(msg.body, 140),
            '/chat/' || ch.id || '?m=' || msg.id, 'message', msg.id, me,
            jsonb_build_object('channel_id', ch.id, 'channel_type', ch.type::text, 'channel_name', ch.name, 'message_id', msg.id, 'ack_request', true, 'sender_id', me, 'sender_name', who));
    n := n + 1;
  end loop;
  update messages set ack_requested_at = now() where id = msg.id;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Follow-up and escalation (cron, every 10 minutes)
-- ---------------------------------------------------------------------------
create or replace function message_followups() returns int
language plpgsql security definer set search_path = public, extensions as $$
declare r record; n int := 0; head uuid; mgr uuid; who text;
begin
  -- One reminder, to someone who has not even seen it, after the interval the sender chose.
  -- Quiet hours are honoured by waiting, not by skipping: the row stays eligible for the next tick.
  for r in
    select mr.message_id, mr.user_id, m.author_id, m.body, m.remind_after_minutes, c.id as channel_id, c.name, c.org_id, c.type
      from message_receipts mr
      join messages m on m.id = mr.message_id
      join channels c on c.id = m.channel_id
     where m.remind_after_minutes is not null and mr.ack_status is null and mr.seen_at is null and mr.reminded_at is null
       and m.deleted_at is null
       and mr.notified_at + make_interval(mins => m.remind_after_minutes) < now()
  loop
    if coalesce(in_quiet_hours(r.user_id), false) then continue; end if;
    select full_name into who from profiles where id = r.author_id;
    insert into notifications (user_id, org_id, kind, priority, title, body, link, entity_type, entity_id, actor_id, meta)
    values (r.user_id, r.org_id, 'action_required'::notification_kind, 'important',
            'Reminder: ' || coalesce(who, 'a message') || ' is waiting for your acknowledgement in #' || r.name, left(r.body, 140),
            '/chat/' || r.channel_id || '?m=' || r.message_id, 'message', r.message_id, r.author_id,
            jsonb_build_object('channel_id', r.channel_id, 'channel_type', r.type::text, 'channel_name', r.name, 'message_id', r.message_id, 'reminder', true, 'sender_id', r.author_id, 'sender_name', who));
    update message_receipts set reminded_at = now() where message_id = r.message_id and user_id = r.user_id;
    n := n + 1;
  end loop;

  -- Escalation only where the sender asked for it, only after twice the interval, only once.
  for r in
    select mr.message_id, mr.user_id, m.author_id, m.body, m.remind_after_minutes, c.id as channel_id, c.name, c.org_id, c.type,
           p.full_name as recipient_name, p.department_id, p.manager_id
      from message_receipts mr
      join messages m on m.id = mr.message_id
      join channels c on c.id = m.channel_id
      join profiles p on p.id = mr.user_id
     where m.escalate and m.remind_after_minutes is not null and mr.ack_status is null and mr.escalated_at is null
       and m.deleted_at is null
       and mr.notified_at + make_interval(mins => 2 * m.remind_after_minutes) < now()
  loop
    select head_id into head from departments where id = r.department_id;
    mgr := coalesce(head, r.manager_id);
    if mgr is not null and mgr <> r.user_id and mgr <> r.author_id then
      select full_name into who from profiles where id = r.author_id;
      insert into notifications (user_id, org_id, kind, priority, title, body, link, entity_type, entity_id, actor_id, meta)
      values (mgr, r.org_id, 'action_required'::notification_kind, 'important',
              coalesce(r.recipient_name, 'Someone') || ' has not acknowledged a message from ' || coalesce(who, 'a colleague') || ' in #' || r.name, left(r.body, 140),
              '/chat/' || r.channel_id || '?m=' || r.message_id, 'message', r.message_id, r.author_id,
              jsonb_build_object('channel_id', r.channel_id, 'channel_type', r.type::text, 'channel_name', r.name, 'message_id', r.message_id, 'escalation', true, 'about_user', r.user_id, 'sender_id', r.author_id, 'sender_name', who));
    end if;
    update message_receipts set escalated_at = now() where message_id = r.message_id and user_id = r.user_id;
    n := n + 1;
  end loop;
  return n;
end $$;

do $$ begin
  if not exists (select 1 from cron.job where jobname = 'ghl_message_followups') then
    perform cron.schedule('ghl_message_followups', '*/10 * * * *', 'select message_followups()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Quiet hours in the person's own time zone when they set one
-- ---------------------------------------------------------------------------
create or replace function in_quiet_hours(uid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare p notification_prefs%rowtype; t time;
begin
  select * into p from notification_prefs where user_id = uid;
  begin
    t := (now() at time zone coalesce(nullif(p.timezone, ''), 'Asia/Kolkata'))::time;
  exception when others then
    t := (now() at time zone 'Asia/Kolkata')::time;
  end;
  if p.user_id is null then return t < time '08:00' or t >= time '21:00'; end if;
  if p.dnd_until is not null and p.dnd_until > now() then return true; end if;
  if p.quiet_start is null or p.quiet_end is null then return false; end if;
  if p.quiet_start < p.quiet_end then return t >= p.quiet_start and t < p.quiet_end;
  else return t >= p.quiet_start or t < p.quiet_end; end if;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Push payload carries priority and meta (same secret gate as before)
-- ---------------------------------------------------------------------------
create or replace function push_notification(p_secret text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare secret_ok boolean; out_row jsonb;
begin
  select (c.hook_secret is not null and c.hook_secret <> '' and p_secret is not null and c.hook_secret = p_secret)
    into secret_ok from push_config c where c.id = 1;
  if not coalesce(secret_ok, false) or p_id is null then return null; end if;
  select jsonb_build_object(
           'id', n.id, 'user_id', n.user_id, 'org_id', n.org_id, 'kind', n.kind,
           'title', n.title, 'body', n.body, 'link', n.link,
           'entity_type', n.entity_type, 'entity_id', n.entity_id,
           'priority', n.priority, 'meta', n.meta)
    into out_row
    from notifications n where n.id = p_id;
  return out_row;
end $$;

-- ---------------------------------------------------------------------------
-- 11. Grants — a new function arrives granted to anon and authenticated (0068); take it back first.
-- ---------------------------------------------------------------------------
revoke execute on function priority_rank(text), max_priority(text, text), message_priority_allowed_for(uuid, uuid, text),
  message_priority_allowed(uuid, text), can_broadcast_in(uuid, uuid), message_priority_guard(), message_after_insert(),
  mark_channel_read(uuid), ack_message(uuid, text), message_ack_report(uuid), request_acks(uuid), message_followups(),
  in_quiet_hours(uuid), push_notification(text, uuid)
  from public, anon, authenticated;
grant execute on function priority_rank(text), max_priority(text, text), message_priority_allowed(uuid, text),
  mark_channel_read(uuid), ack_message(uuid, text), message_ack_report(uuid), request_acks(uuid), in_quiet_hours(uuid)
  to authenticated;
-- push_notification is called by the push hook with the anon key and proves itself with the secret (0025).
grant execute on function push_notification(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. Self-test: a channel message must keep producing notifications
-- ---------------------------------------------------------------------------
create or replace function test_messaging() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare checks jsonb := '[]'::jsonb; src text; n int;
begin
  if not selftest_allowed() then raise exception 'forbidden'; end if;

  select count(*) into n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'messages' and t.tgname = 'messages_after_insert' and not t.tgisinternal;
  checks := checks || jsonb_build_object('name', 'messaging:fanout_trigger_attached', 'ok', n = 1,
    'detail', case when n = 1 then 'messages_after_insert fires after every message.' else 'The message fan-out trigger is missing: no message notifies anyone.' end);

  src := pg_get_functiondef('message_after_insert()'::regprocedure);
  checks := checks || jsonb_build_object('name', 'messaging:channels_notify_members', 'ok', src like '%group_alerts%' and src like '%channel_members cm%',
    'detail', case when src like '%group_alerts%' then 'Channel messages notify every eligible member, honouring mutes and preferences (0075).'
                   else 'message_after_insert only notifies mentions and DMs again - a channel message would be silent (the pre-0075 defect).' end);

  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'message_receipts' and (coalesce(qual,'') like '%current_org()%');
  checks := checks || jsonb_build_object('name', 'messaging:receipts_tenanted', 'ok', n >= 1,
    'detail', case when n >= 1 then 'message_receipts is read through an org-scoped policy.' else 'message_receipts has no org-scoped policy.' end);

  select count(*) into n from cron.job where jobname = 'ghl_message_followups' and active;
  checks := checks || jsonb_build_object('name', 'messaging:followups_scheduled', 'ok', n = 1,
    'detail', case when n = 1 then 'ghl_message_followups runs every 10 minutes.' else 'The follow-up cron is not scheduled - reminders and escalations never fire.' end);

  return selftest_result(checks);
end $$;
revoke execute on function test_messaging() from public, anon;

create or replace function platform_self_test() returns jsonb
language plpgsql set search_path = public as $$
declare
  suites  jsonb := '{}'::jsonb;
  checks  jsonb := '[]'::jsonb;
  one     jsonb;
  err_msg text;
  names   text[] := array['rls_role_sweep','tenant_scoping','policy_recursion','returning_policies',
                          'function_volatility','enum_casts','access_control','delegation','entitlements','runtime_health','messaging'];
  nm      text;
begin
  if not selftest_allowed() then
    raise exception 'forbidden: platform_self_test() requires platform admin, company admin, or the service role';
  end if;

  foreach nm in array names loop
    begin
      case nm
        when 'rls_role_sweep'      then one := test_rls_role_sweep();
        when 'tenant_scoping'      then one := test_tenant_scoping();
        when 'policy_recursion'    then one := test_policy_recursion();
        when 'returning_policies'  then one := test_returning_policies();
        when 'function_volatility' then one := test_function_volatility();
        when 'enum_casts'          then one := test_enum_casts();
        when 'access_control'      then one := test_access_control();
        when 'delegation'          then one := test_delegation();
        when 'entitlements'        then one := test_entitlements();
        when 'runtime_health'      then one := test_runtime_health();
        when 'messaging'           then one := test_messaging();
        else raise exception 'unknown check %', nm;
      end case;
    exception when others then
      get stacked diagnostics err_msg = message_text;
      one := selftest_result(jsonb_build_array(jsonb_build_object(
        'name', nm || ':crashed', 'ok', false,
        'detail', 'the check itself raised: ' || err_msg)));
    end;

    suites := suites || jsonb_build_object(nm, one);
    checks := checks || (
      select coalesce(jsonb_agg(jsonb_build_object(
               'suite', nm, 'name', e->>'name', 'ok', (e->>'ok')::boolean, 'detail', e->>'detail')), '[]'::jsonb)
        from jsonb_array_elements(coalesce(one->'checks', '[]'::jsonb)) e);
  end loop;

  return jsonb_build_object(
    'ok',     (select count(*) from jsonb_array_elements(checks) e where not (e->>'ok')::boolean) = 0,
    'passed', (select count(*) from jsonb_array_elements(checks) e where (e->>'ok')::boolean),
    'failed', (select count(*) from jsonb_array_elements(checks) e where not (e->>'ok')::boolean),
    'checks', checks,
    'suites', suites,
    'ran_at', now()
  );
end $$;

-- ---------------------------------------------------------------------------
-- 13. Receipts are live: the acknowledgement bar under a message updates as people answer.
--     RLS (mr_read) applies to the realtime stream exactly as to a query.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'message_receipts') then
    alter publication supabase_realtime add table message_receipts;
  end if;
end $$;
