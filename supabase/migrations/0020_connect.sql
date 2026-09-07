-- ===========================================================================
-- 0020 — GHL CONNECT: smart communication hub (email, calls, messages) for Sales & Support
-- Rules: no invented prices/guarantees (AI drafts are proposals only); no creepy profiling —
-- contacts hold work-relevant fields only; do-not-contact is enforced in the database;
-- nothing leaves the company without permission (send permission + approval flow).
-- ===========================================================================

create table contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  company text,
  kind text not null default 'customer' check (kind in ('customer','lead','investor_contact','vendor','partner','candidate','other')),
  emails text[] not null default '{}',
  phones text[] not null default '{}',
  owner_id uuid references profiles(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  tags text[] not null default '{}',
  vip boolean not null default false,
  do_not_contact boolean not null default false,
  dnc_reason text,
  preferred_channel text,
  language text,
  notes text,
  source text,
  last_contact_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_org_idx on contacts(org_id, updated_at desc);
create index contacts_emails_idx on contacts using gin (emails);
create index contacts_phones_idx on contacts using gin (phones);
create index contacts_name_trgm on contacts using gin (name extensions.gin_trgm_ops);
alter table commitments add constraint commitments_contact_fk foreign key (promised_to_contact) references contacts(id) on delete set null;

create table inboxes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  kind text not null default 'email' check (kind in ('email','phone','whatsapp','sms','chat')),
  address text,                                   -- shared email address / phone number
  department_id uuid references departments(id) on delete set null,
  visibility text not null default 'members' check (visibility in ('members','department','company')),
  assignment text not null default 'claim' check (assignment in ('claim','round_robin','manual')),
  sla_first_reply_minutes int not null default 120,
  sla_resolve_hours int not null default 48,
  signature text,
  provider text,                                  -- resend | gmail | outlook | twilio | exotel | whatsapp_cloud | manual
  webhook_token text unique default encode(gen_random_bytes(18), 'hex'),
  settings jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table inbox_members (
  inbox_id uuid references inboxes(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text not null default 'agent' check (role in ('agent','supervisor')),
  added_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (inbox_id, user_id)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  inbox_id uuid references inboxes(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  channel text not null default 'email' check (channel in ('email','call','whatsapp','sms','chat','note')),
  subject text,
  status text not null default 'open' check (status in ('open','pending','snoozed','resolved','spam')),
  priority task_priority not null default 'normal',
  vip boolean not null default false,
  assigned_to uuid references profiles(id) on delete set null,
  claimed_at timestamptz,
  snoozed_until timestamptz,
  thread_key text,
  external_id text,
  tags text[] not null default '{}',
  disposition text,
  last_message_at timestamptz not null default now(),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  first_reply_at timestamptz,
  sla_due_at timestamptz,
  sla_breached boolean not null default false,
  unread boolean not null default true,
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null,
  linked_task_id uuid references tasks(id) on delete set null,
  linked_help_request_id uuid references help_requests(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_inbox_idx on conversations(inbox_id, status, last_message_at desc);
create index conversations_contact_idx on conversations(contact_id, last_message_at desc);
create index conversations_assignee_idx on conversations(assigned_to, status);
create index conversations_thread_idx on conversations(thread_key);

create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound','internal')),
  kind text not null default 'email' check (kind in ('email','call','whatsapp','sms','chat','note','system')),
  author_id uuid references profiles(id) on delete set null,
  from_address text,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  subject text,
  body text,
  html text,
  attachments jsonb not null default '[]'::jsonb,
  mentions uuid[] not null default '{}',
  external_id text,
  status text not null default 'received' check (status in ('draft','pending_approval','queued','sent','delivered','failed','received','rejected')),
  approved_by uuid references profiles(id) on delete set null,
  error text,
  ai_drafted boolean not null default false,
  template_id uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index conversation_messages_conv_idx on conversation_messages(conversation_id, created_at);
create index conversation_messages_status_idx on conversation_messages(status) where status in ('queued','pending_approval');

create table calls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  user_id uuid not null references profiles(id) on delete cascade,
  direction text not null default 'outbound' check (direction in ('inbound','outbound','missed')),
  phone text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int,
  disposition text,                               -- connected | no_answer | busy | voicemail | wrong_number | callback | interested | not_interested | resolved | escalated | complaint
  notes text,
  next_action text,
  next_action_at timestamptz,
  recording_url text,                             -- only when provider integration + consent
  provider text,
  external_id text,
  created_at timestamptz not null default now()
);
create index calls_user_idx on calls(user_id, started_at desc);
create index calls_contact_idx on calls(contact_id, started_at desc);

create table callbacks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  user_id uuid not null references profiles(id) on delete cascade,
  due_at timestamptz not null,
  note text,
  status text not null default 'pending' check (status in ('pending','done','missed','cancelled')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index callbacks_user_idx on callbacks(user_id, status, due_at);

create table follow_ups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  note text,
  due_at timestamptz not null,
  priority task_priority not null default 'normal',
  status text not null default 'open' check (status in ('open','done','snoozed','cancelled')),
  source text not null default 'manual' check (source in ('manual','promise','call','ai','rule')),
  commitment_id uuid references commitments(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index follow_ups_user_idx on follow_ups(user_id, status, due_at);

create table comm_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null default 'email' check (kind in ('email','whatsapp','sms','call_script','note')),
  name text not null,
  category text,
  subject text,
  body text not null,
  scope text not null default 'personal' check (scope in ('personal','department','company')),
  department_id uuid references departments(id) on delete set null,
  owner_id uuid references profiles(id) on delete set null,
  approved boolean not null default false,
  approved_by uuid references profiles(id) on delete set null,
  usage_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table conversation_messages add constraint conversation_messages_template_fk foreign key (template_id) references comm_templates(id) on delete set null;

create table signatures (
  user_id uuid references profiles(id) on delete cascade,
  inbox_id uuid references inboxes(id) on delete cascade,
  body text not null,
  primary key (user_id, inbox_id)
);

create table inbox_rules (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null references inboxes(id) on delete cascade,
  name text not null,
  conditions jsonb not null default '{}'::jsonb,   -- {from_contains, subject_contains, body_contains, contact_kind, vip, channel}
  actions jsonb not null default '{}'::jsonb,      -- {assign_to, department_id, priority, tags[], status, vip, notify_user}
  enabled boolean not null default true,
  sort_order int not null default 0,
  created_by uuid references profiles(id) on delete set null
);

-- ---------------------------------------------------------------------------
-- PERMISSIONS: connect.use / connect.send / connect.call / connect.manage / connect.approve / connect.view_all
-- ---------------------------------------------------------------------------
update role_defaults set permissions = array(select distinct unnest(permissions || '{connect.use,connect.send,connect.call,connect.manage,connect.approve,connect.view_all}'::text[]))
 where level in ('super_admin','director','executive','department_head');
update role_defaults set permissions = array(select distinct unnest(permissions || '{connect.use,connect.send,connect.call,connect.approve}'::text[])) where level in ('manager','team_lead');
update role_defaults set permissions = array(select distinct unnest(permissions || '{connect.use,connect.send,connect.call}'::text[])) where level = 'employee';
update role_defaults set permissions = array(select distinct unnest(permissions || '{connect.use}'::text[])) where level = 'intern';

create or replace function connect_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('approval_statuses', '["probation","intern"]'::jsonb, 'approval_roles', '["intern"]'::jsonb, 'blocked_domains', '[]'::jsonb,
                            'unclaimed_alert_minutes', 30, 'max_open_per_agent', 25, 'callback_reminder_minutes', 15, 'quiet_hours', jsonb_build_object('from', '21:00', 'to', '08:00'))
  || coalesce((select settings->'connect' from organizations where id = current_org()), '{}'::jsonb)
$$;
create or replace function set_connect_settings(p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o uuid := current_org(); before jsonb;
begin
  if not (is_admin() or has_admin_perm('communication.manage') or has_perm('connect.manage')) then raise exception 'forbidden'; end if;
  select coalesce(settings->'connect', '{}'::jsonb) into before from organizations where id = o;
  update organizations set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{connect}', before || p_patch, true) where id = o;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, old_value, new_value) values (o, auth.uid(), 'connect.settings_changed', 'organization', o, 'GHL Connect settings updated', before, before || p_patch);
  return connect_settings();
end $$;

create or replace function is_inbox_member(p_inbox uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from inbox_members m where m.inbox_id = p_inbox and m.user_id = p_user)
      or exists (select 1 from inboxes i join profiles p on p.id = p_user where i.id = p_inbox and i.visibility = 'department' and i.department_id = p.department_id)
      or exists (select 1 from inboxes i where i.id = p_inbox and i.visibility = 'company')
      or has_perm('connect.view_all', p_user) or has_admin_perm_user(p_user, 'communication.manage')
$$;
create or replace function is_inbox_supervisor(p_inbox uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from inbox_members m where m.inbox_id = p_inbox and m.user_id = p_user and m.role = 'supervisor')
      or exists (select 1 from inboxes i join departments d on d.id = i.department_id where i.id = p_inbox and d.head_id = p_user)
      or has_perm('connect.manage', p_user) or has_admin_perm_user(p_user, 'communication.manage')
$$;
create or replace function can_view_conversation(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversations c where c.id = p_id and c.org_id = current_org()
                   and (c.assigned_to = auth.uid() or c.created_by = auth.uid() or (c.inbox_id is not null and is_inbox_member(c.inbox_id))
                        or (c.inbox_id is null and (c.department_id = current_department() or is_manager_of(c.assigned_to)))
                        or has_perm('connect.view_all') or has_admin_perm('communication.manage')))
$$;
create or replace function can_view_contact(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from contacts c where c.id = p_id and c.org_id = current_org() and has_perm('connect.use')
                   and (c.owner_id = auth.uid() or c.department_id is null or c.department_id = current_department() or has_perm('connect.view_all') or has_admin_perm('communication.manage')
                        or exists (select 1 from conversations x where x.contact_id = c.id and can_view_conversation(x.id))))
$$;
/** Does this person's outbound message need a supervisor's approval before it leaves? */
create or replace function needs_send_approval(p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select case when has_perm('connect.approve', p_user) then false
              when not has_perm('connect.send', p_user) then true
              else exists (select 1 from profiles p where p.id = p_user and (p.status::text in (select jsonb_array_elements_text(connect_settings()->'approval_statuses')) or p.role::text in (select jsonb_array_elements_text(connect_settings()->'approval_roles')))) end
$$;

-- ---------------------------------------------------------------------------
-- CONTACT HELPERS: find-or-create by email/phone, timeline
-- ---------------------------------------------------------------------------
create or replace function find_or_create_contact(p_org uuid, p_email text default null, p_phone text default null, p_name text default null, p_department uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; e text := lower(trim(p_email)); ph text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
begin
  if e <> '' then select id into cid from contacts where org_id = p_org and e = any(emails) limit 1; end if;
  if cid is null and ph <> '' then select id into cid from contacts where org_id = p_org and ph = any(phones) limit 1; end if;
  if cid is null then
    insert into contacts (org_id, name, emails, phones, department_id, source, created_by)
    values (p_org, coalesce(nullif(trim(p_name), ''), nullif(split_part(e, '@', 1), ''), ph, 'Unknown'), case when e <> '' then array[e] else '{}' end, case when ph <> '' then array[ph] else '{}' end, p_department, 'inbound', auth.uid())
    returning id into cid;
  end if;
  return cid;
end $$;

create or replace function contact_timeline(p_contact uuid, p_limit int default 100) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not can_view_contact(p_contact) then jsonb_build_object('error','forbidden') else jsonb_build_object(
    'contact', (select to_jsonb(c) - 'notes' || jsonb_build_object('owner', person_name(c.owner_id), 'notes', case when c.owner_id = auth.uid() or is_manager_plus() or has_perm('connect.view_all') then c.notes end) from contacts c where c.id = p_contact),
    'items', (select coalesce(jsonb_agg(x order by x->>'at' desc), '[]') from (
        select jsonb_build_object('type', 'message', 'id', m.id, 'conversation_id', m.conversation_id, 'at', m.created_at, 'direction', m.direction, 'kind', m.kind, 'subject', coalesce(m.subject, c.subject), 'preview', left(coalesce(m.body, ''), 240), 'by', person_name(m.author_id), 'status', m.status) x
          from conversation_messages m join conversations c on c.id = m.conversation_id where c.contact_id = p_contact and m.direction <> 'internal' and can_view_conversation(c.id)
        union all
        select jsonb_build_object('type', 'call', 'id', k.id, 'conversation_id', k.conversation_id, 'at', k.started_at, 'direction', k.direction, 'kind', 'call', 'subject', coalesce(k.disposition, 'Call'), 'preview', left(coalesce(k.notes, ''), 240), 'by', person_name(k.user_id), 'duration', k.duration_seconds)
          from calls k where k.contact_id = p_contact and (k.user_id = auth.uid() or k.conversation_id is null or can_view_conversation(k.conversation_id))
        union all
        select jsonb_build_object('type', 'follow_up', 'id', f.id, 'conversation_id', f.conversation_id, 'at', f.due_at, 'kind', 'follow_up', 'subject', f.title, 'preview', coalesce(f.note, ''), 'by', person_name(f.user_id), 'status', f.status)
          from follow_ups f where f.contact_id = p_contact
        union all
        select jsonb_build_object('type', 'commitment', 'id', cm.id, 'at', coalesce(cm.due_at, cm.created_at), 'kind', 'promise', 'subject', cm.text, 'preview', '', 'by', person_name(cm.promised_by), 'status', cm.status)
          from commitments cm where cm.promised_to_contact = p_contact
        union all
        select jsonb_build_object('type', 'note', 'id', m.id, 'conversation_id', m.conversation_id, 'at', m.created_at, 'kind', 'note', 'subject', 'Internal note', 'preview', left(coalesce(m.body, ''), 240), 'by', person_name(m.author_id))
          from conversation_messages m join conversations c on c.id = m.conversation_id where c.contact_id = p_contact and m.direction = 'internal' and can_view_conversation(c.id)
      ) t limit p_limit),
    'open_conversations', (select count(*) from conversations c where c.contact_id = p_contact and c.status in ('open','pending','snoozed')),
    'open_promises', (select count(*) from commitments cm where cm.promised_to_contact = p_contact and cm.status = 'open'),
    'last_contact', (select max(last_message_at) from conversations where contact_id = p_contact)
  ) end
$$;

-- ---------------------------------------------------------------------------
-- CONVERSATION LIFECYCLE
-- ---------------------------------------------------------------------------
create or replace function conversations_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.contact_id is not null then select vip into new.vip from contacts where id = new.contact_id; end if;
  if new.vip and new.priority in ('low','normal') then new.priority := 'high'; end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    if new.sla_due_at is null and new.inbox_id is not null then select now() + make_interval(mins => sla_first_reply_minutes) into new.sla_due_at from inboxes where id = new.inbox_id; end if;
    if new.department_id is null and new.inbox_id is not null then select department_id into new.department_id from inboxes where id = new.inbox_id; end if;
  end if;
  if new.status = 'resolved' and (tg_op = 'INSERT' or old.status <> 'resolved') then new.resolved_at := now(); new.resolved_by := coalesce(new.resolved_by, auth.uid()); end if;
  if new.status <> 'resolved' then new.resolved_at := null; end if;
  if new.assigned_to is not null and (tg_op = 'INSERT' or old.assigned_to is distinct from new.assigned_to) then new.claimed_at := now(); end if;
  return new;
end $$;
create trigger conversations_before before insert or update on conversations for each row execute function conversations_before();

create or replace function conversations_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null and (tg_op = 'INSERT' or old.assigned_to is distinct from new.assigned_to) and new.assigned_to <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000') then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (new.assigned_to, 'action_required', 'Conversation assigned to you', coalesce(new.subject, initcap(new.channel)) || coalesce(' · ' || (select name from contacts where id = new.contact_id), ''), '/connect/' || new.id, 'conversation', new.id, auth.uid());
  end if;
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into conversation_messages (conversation_id, direction, kind, author_id, body, status) values (new.id, 'internal', 'system', auth.uid(), 'Status: ' || old.status || ' → ' || new.status || coalesce(' (' || new.disposition || ')', ''), 'received');
  end if;
  if tg_op = 'UPDATE' and old.assigned_to is distinct from new.assigned_to then
    insert into conversation_messages (conversation_id, direction, kind, author_id, body, status) values (new.id, 'internal', 'system', auth.uid(), 'Assigned to ' || coalesce(person_name(new.assigned_to), 'nobody'), 'received');
  end if;
  return null;
end $$;
create trigger conversations_after after insert or update on conversations for each row execute function conversations_after();

create or replace function messages_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare c conversations%rowtype; m uuid;
begin
  select * into c from conversations where id = new.conversation_id;
  if new.direction = 'inbound' then
    update conversations set last_message_at = new.created_at, last_inbound_at = new.created_at, unread = true,
           status = case when status in ('resolved','snoozed','pending') then 'open' else status end,
           sla_due_at = case when first_reply_at is null then sla_due_at else coalesce(last_outbound_at, now()) + make_interval(mins => coalesce((select sla_first_reply_minutes from inboxes where id = c.inbox_id), 120)) end,
           sla_breached = false
     where id = new.conversation_id;
    update contacts set last_contact_at = new.created_at, updated_at = now() where id = c.contact_id;
    if c.assigned_to is not null then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id)
      values (c.assigned_to, 'information', 'New reply' || coalesce(' from ' || (select name from contacts where id = c.contact_id), ''), left(coalesce(new.body, new.subject, ''), 160), '/connect/' || c.id, 'conversation', c.id);
    end if;
  elsif new.direction = 'outbound' and new.status in ('sent','delivered') then
    update conversations set last_message_at = coalesce(new.sent_at, now()), last_outbound_at = coalesce(new.sent_at, now()), first_reply_at = coalesce(first_reply_at, now()), unread = false,
           status = case when status = 'open' then 'pending' else status end, sla_breached = false
     where id = new.conversation_id;
    update contacts set last_contact_at = now(), updated_at = now() where id = c.contact_id;
    if new.template_id is not null then update comm_templates set usage_count = usage_count + 1 where id = new.template_id; end if;
  elsif new.direction = 'internal' and new.kind = 'note' then
    foreach m in array new.mentions loop
      if m <> new.author_id then
        insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
        values (m, 'mention', person_name(new.author_id) || ' mentioned you on a conversation', left(coalesce(new.body, ''), 160), '/connect/' || c.id, 'conversation', c.id, new.author_id);
      end if;
    end loop;
  end if;
  if new.status = 'pending_approval' then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    select distinct u, 'approval', person_name(new.author_id) || ' needs approval to send', coalesce(new.subject, left(new.body, 120)), '/connect/' || c.id, 'conversation_message', new.id, new.author_id
      from (select user_id u from inbox_members where inbox_id = c.inbox_id and role = 'supervisor' union select p.manager_id from profiles p where p.id = new.author_id and p.manager_id is not null) s where u is not null;
  end if;
  return null;
end $$;
create trigger conversation_messages_after after insert or update of status on conversation_messages for each row execute function messages_after();

/** Compose an outbound message. Enforces send permission, do-not-contact, blocked domains and approval. Returns the message row (status queued|pending_approval). */
create or replace function queue_message(p_conversation uuid, p_body text, p_html text default null, p_to text[] default null, p_cc text[] default '{}', p_subject text default null, p_kind text default 'email', p_template uuid default null, p_ai boolean default false, p_attachments jsonb default '[]'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c conversations%rowtype; ct contacts%rowtype; mid uuid; st text; dom text; tos text[]; blocked jsonb := connect_settings()->'blocked_domains';
begin
  if not can_view_conversation(p_conversation) then raise exception 'forbidden'; end if;
  if not has_perm('connect.use') then raise exception 'You do not have GHL Connect access. Ask your manager for the connect.use permission.'; end if;
  select * into c from conversations where id = p_conversation;
  if c.contact_id is not null then select * into ct from contacts where id = c.contact_id; end if;
  if ct.do_not_contact then raise exception 'This contact is marked Do Not Contact (%). A manager must clear the flag first.', coalesce(ct.dnc_reason, 'no reason recorded'); end if;
  tos := coalesce(p_to, case when p_kind = 'email' then ct.emails[1:1] else ct.phones[1:1] end);
  if tos is null or array_length(tos, 1) is null then raise exception 'No recipient address'; end if;
  foreach dom in array tos loop
    if p_kind = 'email' and blocked ? lower(split_part(dom, '@', 2)) then raise exception 'Sending to % is blocked by company policy', split_part(dom, '@', 2); end if;
  end loop;
  st := case when needs_send_approval() then 'pending_approval' else 'queued' end;
  insert into conversation_messages (conversation_id, direction, kind, author_id, to_addresses, cc_addresses, subject, body, html, attachments, status, template_id, ai_drafted, from_address)
  values (p_conversation, 'outbound', p_kind, auth.uid(), tos, coalesce(p_cc, '{}'), coalesce(p_subject, c.subject), p_body, p_html, coalesce(p_attachments, '[]'::jsonb), st, p_template, p_ai, (select address from inboxes where id = c.inbox_id))
  returning id into mid;
  if c.assigned_to is null then update conversations set assigned_to = auth.uid() where id = p_conversation; end if;
  return jsonb_build_object('id', mid, 'status', st, 'to', tos);
end $$;

create or replace function approve_message(p_message uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare m conversation_messages%rowtype; c conversations%rowtype;
begin
  select * into m from conversation_messages where id = p_message and status = 'pending_approval';
  if m.id is null then raise exception 'Nothing to approve'; end if;
  select * into c from conversations where id = m.conversation_id;
  if not (is_inbox_supervisor(c.inbox_id) or is_manager_of(m.author_id) or has_perm('connect.approve')) then raise exception 'forbidden'; end if;
  update conversation_messages set status = case when p_approve then 'queued' else 'rejected' end, approved_by = auth.uid(), error = case when p_approve then null else p_note end where id = p_message;
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
  values (m.author_id, 'information', case when p_approve then 'Message approved — sending' else 'Message not approved' end, coalesce(p_note, coalesce(m.subject, left(m.body, 120))), '/connect/' || c.id, 'conversation', c.id, auth.uid());
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary) values (c.org_id, auth.uid(), case when p_approve then 'connect.message_approved' else 'connect.message_rejected' end, 'conversation_message', p_message, coalesce(m.subject, left(m.body, 80)));
end $$;

/** Called by the server route after the provider accepted/failed the message. */
create or replace function mark_message_sent(p_message uuid, p_ok boolean, p_external_id text default null, p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
declare m conversation_messages%rowtype;
begin
  select * into m from conversation_messages where id = p_message;
  if m.id is null or not can_view_conversation(m.conversation_id) then raise exception 'forbidden'; end if;
  if m.status <> 'queued' then raise exception 'Message is % — not queued', m.status; end if;
  update conversation_messages set status = case when p_ok then 'sent' else 'failed' end, sent_at = case when p_ok then now() end, external_id = coalesce(p_external_id, external_id), error = p_error where id = p_message;
end $$;

create or replace function claim_conversation(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c conversations%rowtype; n int; mx int := (connect_settings()->>'max_open_per_agent')::int;
begin
  select * into c from conversations where id = p_id;
  if c.id is null or not can_view_conversation(p_id) then raise exception 'forbidden'; end if;
  if c.assigned_to is not null and c.assigned_to <> auth.uid() and not is_inbox_supervisor(c.inbox_id) then raise exception 'Already claimed by %', person_name(c.assigned_to); end if;
  select count(*) into n from conversations where assigned_to = auth.uid() and status in ('open','pending');
  if n >= mx then raise exception 'You already have % open conversations. Resolve or hand some over first.', n; end if;
  update conversations set assigned_to = auth.uid(), status = case when status = 'snoozed' then 'open' else status end where id = p_id;
end $$;

create or replace function assign_conversation(p_id uuid, p_user uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare c conversations%rowtype;
begin
  select * into c from conversations where id = p_id;
  if c.id is null or not (c.assigned_to = auth.uid() or is_inbox_supervisor(c.inbox_id) or has_perm('connect.manage')) then raise exception 'forbidden'; end if;
  if p_user is not null and c.inbox_id is not null and not is_inbox_member(c.inbox_id, p_user) then raise exception '% is not a member of this inbox', person_name(p_user); end if;
  if p_user is not null and not has_perm('connect.use', p_user) then raise exception '% does not have GHL Connect access', person_name(p_user); end if;
  update conversations set assigned_to = p_user where id = p_id;
  if p_note is not null then insert into conversation_messages (conversation_id, direction, kind, author_id, body, status) values (p_id, 'internal', 'note', auth.uid(), p_note, 'received'); end if;
end $$;

create or replace function snooze_conversation(p_id uuid, p_until timestamptz, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_view_conversation(p_id) then raise exception 'forbidden'; end if;
  update conversations set status = 'snoozed', snoozed_until = p_until where id = p_id;
  if p_note is not null then insert into conversation_messages (conversation_id, direction, kind, author_id, body, status) values (p_id, 'internal', 'note', auth.uid(), 'Snoozed until ' || to_char(p_until at time zone 'Asia/Kolkata', 'DD Mon HH24:MI') || ': ' || p_note, 'received'); end if;
end $$;

create or replace function resolve_conversation(p_id uuid, p_disposition text default null, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_view_conversation(p_id) then raise exception 'forbidden'; end if;
  update conversations set status = 'resolved', disposition = coalesce(p_disposition, disposition) where id = p_id;
  if p_note is not null then insert into conversation_messages (conversation_id, direction, kind, author_id, body, status) values (p_id, 'internal', 'note', auth.uid(), p_note, 'received'); end if;
  update callbacks set status = 'cancelled' where conversation_id = p_id and status = 'pending';
end $$;

/** Start a conversation from inside GHL ONE (new outbound email / call thread / note). */
create or replace function start_conversation(p_contact uuid, p_channel text default 'email', p_subject text default null, p_inbox uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; ib uuid := p_inbox; o uuid := current_org();
begin
  if not has_perm('connect.use') then raise exception 'You do not have GHL Connect access'; end if;
  if p_contact is not null and not can_view_contact(p_contact) then raise exception 'forbidden'; end if;
  if ib is null then select i.id into ib from inboxes i where i.org_id = o and i.active and i.kind = case when p_channel = 'call' then 'phone' else p_channel end and is_inbox_member(i.id) order by (i.department_id = current_department()) desc limit 1; end if;
  insert into conversations (org_id, inbox_id, contact_id, channel, subject, status, assigned_to, department_id, unread)
  values (o, ib, p_contact, p_channel, p_subject, 'open', auth.uid(), current_department(), false) returning id into cid;
  return cid;
end $$;

-- ---------------------------------------------------------------------------
-- CALLS, CALLBACKS, FOLLOW-UPS, PROMISES
-- ---------------------------------------------------------------------------
create or replace function log_call(p_contact uuid, p_direction text, p_phone text default null, p_started timestamptz default now(), p_ended timestamptz default null, p_disposition text default null, p_notes text default null, p_next_action text default null, p_next_at timestamptz default null, p_conversation uuid default null, p_promise text default null, p_promise_due timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o uuid := current_org(); cid uuid := p_conversation; kid uuid; fid uuid; cbid uuid; cmid uuid; ct contacts%rowtype;
begin
  if not has_perm('connect.call') and not has_perm('connect.use') then raise exception 'You do not have calling access'; end if;
  if p_contact is not null then
    if not can_view_contact(p_contact) then raise exception 'forbidden'; end if;
    select * into ct from contacts where id = p_contact;
    if ct.do_not_contact and p_direction = 'outbound' then raise exception 'This contact is marked Do Not Contact (%).', coalesce(ct.dnc_reason, 'no reason recorded'); end if;
  end if;
  if cid is null then cid := start_conversation(p_contact, 'call', coalesce(p_disposition, 'Call') || coalesce(' · ' || ct.name, ''), null); end if;
  insert into calls (org_id, contact_id, conversation_id, user_id, direction, phone, started_at, ended_at, duration_seconds, disposition, notes, next_action, next_action_at)
  values (o, p_contact, cid, auth.uid(), p_direction, coalesce(p_phone, ct.phones[1]), p_started, p_ended, case when p_ended is not null then extract(epoch from (p_ended - p_started))::int end, p_disposition, p_notes, p_next_action, p_next_at)
  returning id into kid;
  insert into conversation_messages (conversation_id, direction, kind, author_id, subject, body, status, external_id)
  values (cid, case when p_direction = 'inbound' then 'inbound' else 'outbound' end, 'call', auth.uid(), initcap(p_direction) || ' call' || coalesce(' · ' || p_disposition, ''), coalesce(p_notes, ''), 'sent', kid::text);
  update contacts set last_contact_at = now(), updated_at = now() where id = p_contact;
  if p_disposition = 'callback' or (p_next_action = 'callback' and p_next_at is not null) then
    insert into callbacks (org_id, contact_id, conversation_id, user_id, due_at, note, created_by) values (o, p_contact, cid, auth.uid(), coalesce(p_next_at, now() + interval '1 day'), coalesce(p_next_action, 'Call back'), auth.uid()) returning id into cbid;
  elsif p_next_action is not null and p_next_at is not null then
    insert into follow_ups (org_id, contact_id, conversation_id, user_id, title, due_at, source, created_by) values (o, p_contact, cid, auth.uid(), p_next_action, p_next_at, 'call', auth.uid()) returning id into fid;
  end if;
  if p_promise is not null then
    insert into commitments (org_id, promised_by, promised_to_contact, promised_to_label, text, due_at, source_type, source_id, source_link)
    values (o, auth.uid(), p_contact, ct.name, p_promise, coalesce(p_promise_due, now() + interval '2 days'), 'call', kid, '/connect/' || cid) returning id into cmid;
    insert into follow_ups (org_id, contact_id, conversation_id, user_id, title, due_at, source, commitment_id, created_by) values (o, p_contact, cid, auth.uid(), 'Promise: ' || p_promise, coalesce(p_promise_due, now() + interval '2 days'), 'promise', cmid, auth.uid());
  end if;
  if p_disposition in ('complaint','escalated') then
    update conversations set priority = 'urgent', status = 'open' where id = cid;
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    select coalesce(d.head_id, p.manager_id), 'action_required', 'Escalated call: ' || coalesce(ct.name, 'unknown contact'), coalesce(p_notes, ''), '/connect/' || cid, 'conversation', cid, auth.uid()
      from profiles p left join departments d on d.id = p.department_id where p.id = auth.uid() and coalesce(d.head_id, p.manager_id) is not null;
  end if;
  return jsonb_build_object('call_id', kid, 'conversation_id', cid, 'callback_id', cbid, 'follow_up_id', fid, 'commitment_id', cmid);
end $$;

create or replace function add_promise(p_conversation uuid, p_text text, p_due timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare c conversations%rowtype; cmid uuid;
begin
  if not can_view_conversation(p_conversation) then raise exception 'forbidden'; end if;
  select * into c from conversations where id = p_conversation;
  insert into commitments (org_id, promised_by, promised_to_contact, promised_to_label, text, due_at, source_type, source_id, source_link)
  values (c.org_id, auth.uid(), c.contact_id, (select name from contacts where id = c.contact_id), p_text, p_due, 'connect', p_conversation, '/connect/' || p_conversation) returning id into cmid;
  insert into follow_ups (org_id, contact_id, conversation_id, user_id, title, due_at, source, commitment_id, created_by) values (c.org_id, c.contact_id, p_conversation, auth.uid(), 'Promise: ' || p_text, p_due, 'promise', cmid, auth.uid());
  return cmid;
end $$;

create or replace function complete_follow_up(p_id uuid, p_outcome text default null) returns void
language plpgsql security definer set search_path = public as $$
declare f follow_ups%rowtype;
begin
  select * into f from follow_ups where id = p_id;
  if f.id is null or not (f.user_id = auth.uid() or is_manager_of(f.user_id) or has_perm('connect.manage')) then raise exception 'forbidden'; end if;
  update follow_ups set status = 'done', done_at = now() where id = p_id;
  if f.commitment_id is not null then update commitments set status = 'done', done_at = now() where id = f.commitment_id; end if;
  if f.conversation_id is not null and p_outcome is not null then insert into conversation_messages (conversation_id, direction, kind, author_id, body, status) values (f.conversation_id, 'internal', 'note', auth.uid(), 'Follow-up done: ' || p_outcome, 'received'); end if;
end $$;

-- ---------------------------------------------------------------------------
-- INBOUND INGEST (webhook token per inbox) + ROUTING RULES
-- ---------------------------------------------------------------------------
create or replace function apply_inbox_rules(p_conversation uuid, p_from text, p_subject text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare c conversations%rowtype; r inbox_rules%rowtype; cond jsonb; act jsonb; ok boolean;
begin
  select * into c from conversations where id = p_conversation;
  for r in select * from inbox_rules where inbox_id = c.inbox_id and enabled order by sort_order loop
    cond := r.conditions; act := r.actions; ok := true;
    if cond ? 'from_contains' and position(lower(cond->>'from_contains') in lower(coalesce(p_from, ''))) = 0 then ok := false; end if;
    if cond ? 'subject_contains' and position(lower(cond->>'subject_contains') in lower(coalesce(p_subject, ''))) = 0 then ok := false; end if;
    if cond ? 'body_contains' and position(lower(cond->>'body_contains') in lower(coalesce(p_body, ''))) = 0 then ok := false; end if;
    if cond ? 'vip' and (cond->>'vip')::boolean <> c.vip then ok := false; end if;
    if cond ? 'contact_kind' and not exists (select 1 from contacts x where x.id = c.contact_id and x.kind = cond->>'contact_kind') then ok := false; end if;
    if ok then
      update conversations set
        assigned_to = coalesce((act->>'assign_to')::uuid, assigned_to),
        department_id = coalesce((act->>'department_id')::uuid, department_id),
        priority = coalesce((act->>'priority')::task_priority, priority),
        tags = array(select distinct unnest(tags || coalesce(array(select jsonb_array_elements_text(act->'tags')), '{}'))),
        status = coalesce(act->>'status', status),
        vip = coalesce((act->>'vip')::boolean, vip)
      where id = p_conversation;
      if act ? 'notify_user' then
        insert into notifications (user_id, kind, title, body, link, entity_type, entity_id) values ((act->>'notify_user')::uuid, 'information', 'Rule "' || r.name || '" matched', coalesce(p_subject, ''), '/connect/' || p_conversation, 'conversation', p_conversation);
      end if;
    end if;
  end loop;
end $$;

/** Round-robin among inbox agents who are available and under their cap. */
create or replace function pick_agent(p_inbox uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select m.user_id from inbox_members m join profiles p on p.id = m.user_id
   where m.inbox_id = p_inbox and m.role = 'agent' and p.is_active and p.presence in ('available','remote','busy')
     and (select count(*) from conversations c where c.assigned_to = m.user_id and c.status in ('open','pending')) < (connect_settings()->>'max_open_per_agent')::int
   order by (select coalesce(max(claimed_at), 'epoch'::timestamptz) from conversations c where c.assigned_to = m.user_id) limit 1
$$;

create or replace function ingest_email(p_token text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ib inboxes%rowtype; cid uuid; conv uuid; from_addr text; from_name text; subj text; body text; html text; thread text; ext text; tos text[]; ccs text[];
begin
  select * into ib from inboxes where webhook_token = p_token and active;
  if ib.id is null then return jsonb_build_object('error', 'unknown token'); end if;
  from_addr := lower(coalesce(p_payload->>'from_email', p_payload->'from'->>'email', p_payload->>'from', p_payload->>'sender', ''));
  from_name := coalesce(p_payload->>'from_name', p_payload->'from'->>'name', p_payload->>'sender_name');
  subj := coalesce(p_payload->>'subject', '(no subject)');
  body := coalesce(p_payload->>'text', p_payload->>'body', p_payload->>'plain', '');
  html := p_payload->>'html';
  thread := coalesce(p_payload->>'thread_id', p_payload->>'in_reply_to', p_payload->>'references', p_payload->>'message_id');
  ext := coalesce(p_payload->>'message_id', p_payload->>'id');
  tos := coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(p_payload->'to') = 'array' then p_payload->'to' else '[]'::jsonb end)), array[coalesce(p_payload->>'to', ib.address)]);
  ccs := coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(p_payload->'cc') = 'array' then p_payload->'cc' else '[]'::jsonb end)), '{}');
  if from_addr = '' then return jsonb_build_object('error', 'missing from'); end if;
  if ext is not null and exists (select 1 from conversation_messages where external_id = ext) then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  cid := find_or_create_contact(ib.org_id, from_addr, null, from_name, ib.department_id);
  -- thread match: same thread key, else same contact + same subject (stripped of Re:/Fwd:) still open within 14 days
  select id into conv from conversations where inbox_id = ib.id and thread_key is not null and thread_key = thread limit 1;
  if conv is null then
    select id into conv from conversations where inbox_id = ib.id and contact_id = cid and status <> 'spam' and last_message_at > now() - interval '14 days'
      and lower(regexp_replace(coalesce(subject, ''), '^\s*((re|fwd?|fw)\s*:\s*)+', '', 'i')) = lower(regexp_replace(subj, '^\s*((re|fwd?|fw)\s*:\s*)+', '', 'i')) order by last_message_at desc limit 1;
  end if;
  if conv is null then
    insert into conversations (org_id, inbox_id, contact_id, channel, subject, thread_key, external_id, status, assigned_to, created_by)
    values (ib.org_id, ib.id, cid, 'email', subj, thread, ext, 'open', case when ib.assignment = 'round_robin' then pick_agent(ib.id) end, null) returning id into conv;
    perform apply_inbox_rules(conv, from_addr, subj, body);
  end if;
  insert into conversation_messages (conversation_id, direction, kind, from_address, to_addresses, cc_addresses, subject, body, html, attachments, external_id, status)
  values (conv, 'inbound', 'email', from_addr, tos, ccs, subj, body, html, coalesce(p_payload->'attachments', '[]'::jsonb), ext, 'received');
  -- unassigned + claim inbox → tell agents there is something to claim
  if (select assigned_to from conversations where id = conv) is null then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id)
    select m.user_id, 'information', 'New in ' || ib.name || ': ' || subj, left(body, 140), '/connect?inbox=' || ib.id, 'conversation', conv from inbox_members m where m.inbox_id = ib.id;
  end if;
  return jsonb_build_object('ok', true, 'conversation_id', conv, 'contact_id', cid);
end $$;

/** Generic inbound message for phone/WhatsApp/SMS bridges. payload: {from, name, text, external_id, direction?} */
create or replace function ingest_message(p_token text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ib inboxes%rowtype; cid uuid; conv uuid; ph text; txt text; ext text; kind text;
begin
  select * into ib from inboxes where webhook_token = p_token and active;
  if ib.id is null then return jsonb_build_object('error', 'unknown token'); end if;
  ph := regexp_replace(coalesce(p_payload->>'from', p_payload->>'phone', ''), '[^0-9+]', '', 'g');
  txt := coalesce(p_payload->>'text', p_payload->>'body', '');
  ext := p_payload->>'external_id';
  kind := case ib.kind when 'phone' then 'call' when 'whatsapp' then 'whatsapp' when 'sms' then 'sms' else 'chat' end;
  if ph = '' then return jsonb_build_object('error', 'missing from'); end if;
  if ext is not null and exists (select 1 from conversation_messages where external_id = ext) then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  cid := find_or_create_contact(ib.org_id, null, ph, p_payload->>'name', ib.department_id);
  select id into conv from conversations where inbox_id = ib.id and contact_id = cid and status <> 'spam' and last_message_at > now() - interval '7 days' order by last_message_at desc limit 1;
  if conv is null then
    insert into conversations (org_id, inbox_id, contact_id, channel, subject, external_id, status, assigned_to)
    values (ib.org_id, ib.id, cid, kind, left(txt, 80), ext, 'open', case when ib.assignment = 'round_robin' then pick_agent(ib.id) end) returning id into conv;
    perform apply_inbox_rules(conv, ph, left(txt, 80), txt);
  end if;
  if kind = 'call' then
    insert into calls (org_id, contact_id, conversation_id, user_id, direction, phone, started_at, ended_at, duration_seconds, disposition, provider, external_id, recording_url)
    values (ib.org_id, cid, conv, coalesce((select assigned_to from conversations where id = conv), (select user_id from inbox_members where inbox_id = ib.id limit 1)), coalesce(p_payload->>'direction', 'inbound'), ph, coalesce((p_payload->>'started_at')::timestamptz, now()), (p_payload->>'ended_at')::timestamptz, (p_payload->>'duration')::int, coalesce(p_payload->>'disposition', 'missed'), ib.provider, ext, p_payload->>'recording_url');
  end if;
  insert into conversation_messages (conversation_id, direction, kind, from_address, body, external_id, status)
  values (conv, 'inbound', kind, ph, txt, ext, 'received');
  return jsonb_build_object('ok', true, 'conversation_id', conv, 'contact_id', cid);
end $$;

-- ---------------------------------------------------------------------------
-- QUEUES & DASHBOARDS
-- ---------------------------------------------------------------------------
create or replace function my_connect_queue() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'mine', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'subject', c.subject, 'channel', c.channel, 'status', c.status, 'priority', c.priority, 'vip', c.vip, 'contact', (select name from contacts where id = c.contact_id), 'last', c.last_message_at, 'unread', c.unread, 'sla_due', c.sla_due_at, 'breached', c.sla_breached) order by c.vip desc, c.sla_due_at nulls last, c.last_message_at desc), '[]')
             from conversations c where c.assigned_to = auth.uid() and c.status in ('open','pending')),
    'unclaimed', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'subject', c.subject, 'channel', c.channel, 'inbox', i.name, 'inbox_id', i.id, 'priority', c.priority, 'vip', c.vip, 'contact', (select name from contacts where id = c.contact_id), 'waiting_minutes', extract(epoch from (now() - c.created_at))::int / 60) order by c.vip desc, c.created_at), '[]')
             from conversations c join inboxes i on i.id = c.inbox_id where c.assigned_to is null and c.status = 'open' and is_inbox_member(i.id)),
    'callbacks', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'contact', (select name from contacts where id = b.contact_id), 'contact_id', b.contact_id, 'phone', (select phones[1] from contacts where id = b.contact_id), 'due', b.due_at, 'note', b.note, 'overdue', b.due_at < now(), 'conversation_id', b.conversation_id) order by b.due_at), '[]')
             from callbacks b where b.user_id = auth.uid() and b.status = 'pending' and b.due_at < now() + interval '2 days'),
    'follow_ups', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'title', f.title, 'contact', (select name from contacts where id = f.contact_id), 'contact_id', f.contact_id, 'due', f.due_at, 'priority', f.priority, 'source', f.source, 'overdue', f.due_at < now(), 'conversation_id', f.conversation_id) order by f.due_at), '[]')
             from follow_ups f where f.user_id = auth.uid() and f.status = 'open' and f.due_at < now() + interval '3 days'),
    'promises', (select coalesce(jsonb_agg(jsonb_build_object('id', cm.id, 'text', cm.text, 'to', cm.promised_to_label, 'due', cm.due_at, 'overdue', cm.due_at < now()) order by cm.due_at), '[]')
             from commitments cm where cm.promised_by = auth.uid() and cm.status = 'open' and cm.promised_to_contact is not null),
    'awaiting_approval', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'conversation_id', m.conversation_id, 'subject', m.subject, 'by', person_name(m.author_id), 'at', m.created_at)), '[]')
             from conversation_messages m join conversations c on c.id = m.conversation_id where m.status = 'pending_approval' and (is_inbox_supervisor(c.inbox_id) or is_manager_of(m.author_id))),
    'my_pending_approval', (select count(*) from conversation_messages m where m.author_id = auth.uid() and m.status = 'pending_approval'),
    'snoozed', (select count(*) from conversations c where c.assigned_to = auth.uid() and c.status = 'snoozed'),
    'resolved_today', (select count(*) from conversations c where c.resolved_by = auth.uid() and c.resolved_at::date = current_date),
    'calls_today', (select count(*) from calls k where k.user_id = auth.uid() and k.started_at::date = current_date)
  )
$$;

create or replace function connect_dashboard(p_inbox uuid default null, p_days int default 7) returns jsonb
language sql stable security definer set search_path = public as $$
  with scope as (select c.* from conversations c where c.org_id = current_org() and (p_inbox is null or c.inbox_id = p_inbox) and (is_inbox_supervisor(c.inbox_id) or has_perm('connect.manage') or has_perm('connect.view_all') or is_manager_of(c.assigned_to)))
  select case when not (has_perm('connect.manage') or has_perm('connect.view_all') or has_admin_perm('communication.manage') or exists (select 1 from inbox_members m where m.user_id = auth.uid() and m.role = 'supervisor') or is_manager_plus()) then jsonb_build_object('error','forbidden') else jsonb_build_object(
    'open', (select count(*) from scope where status = 'open'),
    'pending', (select count(*) from scope where status = 'pending'),
    'snoozed', (select count(*) from scope where status = 'snoozed'),
    'unassigned', (select count(*) from scope where status = 'open' and assigned_to is null),
    'breached', (select count(*) from scope where status in ('open','pending') and sla_breached),
    'vip_waiting', (select count(*) from scope where status = 'open' and vip and unread),
    'oldest_waiting_minutes', (select extract(epoch from (now() - min(coalesce(last_inbound_at, created_at))))::int / 60 from scope where status = 'open' and unread),
    'new_in_period', (select count(*) from scope where created_at > now() - make_interval(days => p_days)),
    'resolved_in_period', (select count(*) from scope where resolved_at > now() - make_interval(days => p_days)),
    'avg_first_reply_minutes', (select avg(extract(epoch from (first_reply_at - created_at)) / 60)::int from scope where first_reply_at is not null and created_at > now() - make_interval(days => p_days)),
    'by_channel', (select coalesce(jsonb_object_agg(channel, n), '{}') from (select channel, count(*) n from scope where created_at > now() - make_interval(days => p_days) group by channel) x),
    'dispositions', (select coalesce(jsonb_object_agg(coalesce(disposition, 'none'), n), '{}') from (select disposition, count(*) n from scope where resolved_at > now() - make_interval(days => p_days) group by disposition) x),
    'agents', (select coalesce(jsonb_agg(jsonb_build_object('user_id', p.id, 'name', p.full_name, 'presence', p.presence,
                 'open', (select count(*) from scope s where s.assigned_to = p.id and s.status in ('open','pending')),
                 'resolved', (select count(*) from scope s where s.assigned_to = p.id and s.resolved_at > now() - make_interval(days => p_days)),
                 'replies', (select count(*) from conversation_messages m join scope s on s.id = m.conversation_id where m.author_id = p.id and m.direction = 'outbound' and m.status in ('sent','delivered') and m.created_at > now() - make_interval(days => p_days)),
                 'calls', (select count(*) from calls k where k.user_id = p.id and k.started_at > now() - make_interval(days => p_days)),
                 'breached', (select count(*) from scope s where s.assigned_to = p.id and s.status in ('open','pending') and s.sla_breached),
                 'overdue_follow_ups', (select count(*) from follow_ups f where f.user_id = p.id and f.status = 'open' and f.due_at < now()),
                 'overdue_callbacks', (select count(*) from callbacks b where b.user_id = p.id and b.status = 'pending' and b.due_at < now())) order by p.full_name), '[]')
               from profiles p where p.org_id = current_org() and p.is_active and (p_inbox is null and exists (select 1 from inbox_members m where m.user_id = p.id) or exists (select 1 from inbox_members m where m.user_id = p.id and m.inbox_id = p_inbox))),
    'inboxes', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'kind', i.kind, 'open', (select count(*) from conversations c where c.inbox_id = i.id and c.status = 'open'), 'unassigned', (select count(*) from conversations c where c.inbox_id = i.id and c.status = 'open' and c.assigned_to is null), 'breached', (select count(*) from conversations c where c.inbox_id = i.id and c.status in ('open','pending') and c.sla_breached), 'members', (select count(*) from inbox_members m where m.inbox_id = i.id), 'provider', i.provider) order by i.name), '[]')
               from inboxes i where i.org_id = current_org() and i.active and (p_inbox is null or i.id = p_inbox) and is_inbox_member(i.id)),
    'promises_overdue', (select count(*) from commitments cm where cm.org_id = current_org() and cm.status = 'open' and cm.promised_to_contact is not null and cm.due_at < now())
  ) end
$$;

create or replace function connect_sla_tick() returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_sla int := 0; n_unclaimed int := 0; n_cb int := 0; n_fu int := 0; n_wake int := 0; mins int;
begin
  -- wake snoozed
  update conversations set status = 'open', snoozed_until = null where status = 'snoozed' and snoozed_until <= now();
  get diagnostics n_wake = row_count;
  -- first-reply / re-reply SLA breaches
  with b as (update conversations c set sla_breached = true where c.status = 'open' and not c.sla_breached and c.sla_due_at is not null and c.sla_due_at < now() and c.unread returning c.*)
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id)
  select u, 'critical', 'SLA breached: ' || coalesce(b.subject, b.channel), coalesce((select name from contacts where id = b.contact_id), '') || ' has been waiting since ' || to_char(coalesce(b.last_inbound_at, b.created_at) at time zone 'Asia/Kolkata', 'DD Mon HH24:MI'), '/connect/' || b.id, 'conversation', b.id
    from b cross join lateral (select b.assigned_to u union select m.user_id from inbox_members m where m.inbox_id = b.inbox_id and m.role = 'supervisor') s where u is not null;
  get diagnostics n_sla = row_count;
  -- unclaimed for too long → supervisors
  mins := coalesce((select (settings->'connect'->>'unclaimed_alert_minutes')::int from organizations limit 1), 30);
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id)
  select m.user_id, 'action_required', 'Unclaimed for ' || (extract(epoch from (now() - c.created_at))::int / 60) || ' min: ' || coalesce(c.subject, c.channel), 'Nobody has claimed this conversation in ' || i.name || '.', '/connect/' || c.id, 'conversation_unclaimed', c.id
    from conversations c join inboxes i on i.id = c.inbox_id join inbox_members m on m.inbox_id = i.id and m.role = 'supervisor'
   where c.status = 'open' and c.assigned_to is null and c.created_at < now() - make_interval(mins => mins)
     and not exists (select 1 from notifications n where n.entity_type = 'conversation_unclaimed' and n.entity_id = c.id and n.user_id = m.user_id and n.created_at > now() - interval '2 hours');
  get diagnostics n_unclaimed = row_count;
  -- callbacks due
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id)
  select b.user_id, 'action_required', 'Call back ' || coalesce((select name from contacts where id = b.contact_id), 'contact'), coalesce(b.note, '') || ' · ' || coalesce((select phones[1] from contacts where id = b.contact_id), ''), '/connect/follow-ups', 'callback_due', b.id
    from callbacks b where b.status = 'pending' and b.due_at between now() - interval '1 hour' and now() + interval '15 minutes'
     and not exists (select 1 from notifications n where n.entity_type = 'callback_due' and n.entity_id = b.id);
  get diagnostics n_cb = row_count;
  update callbacks set status = 'missed' where status = 'pending' and due_at < now() - interval '1 day';
  -- follow-ups due / promises due
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id)
  select f.user_id, (case when f.source = 'promise' then 'critical' else 'action_required' end)::notification_kind, case when f.source = 'promise' then 'Promise due: ' else 'Follow up: ' end || f.title, coalesce((select name from contacts where id = f.contact_id), ''), coalesce('/connect/' || f.conversation_id, '/connect/follow-ups'), 'follow_up_due', f.id
    from follow_ups f where f.status = 'open' and f.due_at between now() - interval '1 hour' and now() + interval '30 minutes'
     and not exists (select 1 from notifications n where n.entity_type = 'follow_up_due' and n.entity_id = f.id);
  get diagnostics n_fu = row_count;
  -- overdue promises → manager once
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
  select p.manager_id, 'information', person_name(cm.promised_by) || ' has an overdue promise to ' || coalesce(cm.promised_to_label, 'a contact'), cm.text, coalesce(cm.source_link, '/connect'), 'promise_overdue_mgr', cm.id, cm.promised_by
    from commitments cm join profiles p on p.id = cm.promised_by
   where cm.status = 'open' and cm.promised_to_contact is not null and cm.due_at < now() - interval '1 day' and p.manager_id is not null
     and not exists (select 1 from notifications n where n.entity_type = 'promise_overdue_mgr' and n.entity_id = cm.id);
  return jsonb_build_object('woken', n_wake, 'sla', n_sla, 'unclaimed', n_unclaimed, 'callbacks', n_cb, 'follow_ups', n_fu);
end $$;
select cron.schedule('ghl_connect_sla', '*/10 * * * *', $$select connect_sla_tick()$$);

-- contact search (trigram) — permission-scoped
create or replace function search_contacts(p_q text, p_limit int default 20)
returns table(id uuid, name text, company text, kind text, emails text[], phones text[], vip boolean, do_not_contact boolean, owner text, last_contact_at timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select c.id, c.name, c.company, c.kind, c.emails, c.phones, c.vip, c.do_not_contact, person_name(c.owner_id), c.last_contact_at
    from contacts c where c.org_id = current_org() and has_perm('connect.use')
     and (c.name ilike '%' || p_q || '%' or coalesce(c.company, '') ilike '%' || p_q || '%' or exists (select 1 from unnest(c.emails) e where e ilike '%' || p_q || '%') or exists (select 1 from unnest(c.phones) ph where ph like '%' || regexp_replace(p_q, '[^0-9+]', '', 'g') || '%' and length(regexp_replace(p_q, '[^0-9+]', '', 'g')) >= 4) or similarity(c.name, p_q) > 0.3)
     and can_view_contact(c.id)
   order by similarity(c.name, p_q) desc, c.last_contact_at desc nulls last limit p_limit
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table contacts enable row level security;
alter table inboxes enable row level security;
alter table inbox_members enable row level security;
alter table conversations enable row level security;
alter table conversation_messages enable row level security;
alter table calls enable row level security;
alter table callbacks enable row level security;
alter table follow_ups enable row level security;
alter table comm_templates enable row level security;
alter table signatures enable row level security;
alter table inbox_rules enable row level security;

create policy ct_read on contacts for select to authenticated using (can_view_contact(id));
create policy ct_insert on contacts for insert to authenticated with check (org_id = current_org() and has_perm('connect.use'));
create policy ct_update on contacts for update to authenticated using (org_id = current_org() and (owner_id = auth.uid() or has_perm('connect.manage') or is_manager_plus() or (can_view_contact(id) and has_perm('connect.send'))));
create policy ct_delete on contacts for delete to authenticated using (org_id = current_org() and (has_perm('connect.manage') or has_admin_perm('communication.manage')));
create policy ib_read on inboxes for select to authenticated using (org_id = current_org() and (is_inbox_member(id) or has_perm('connect.manage')));
create policy ib_write on inboxes for all to authenticated using (org_id = current_org() and (has_perm('connect.manage') or has_admin_perm('communication.manage') or is_admin())) with check (org_id = current_org() and (has_perm('connect.manage') or has_admin_perm('communication.manage') or is_admin()));
create policy im_read on inbox_members for select to authenticated using (is_inbox_member(inbox_id) or has_perm('connect.manage'));
create policy im_write on inbox_members for all to authenticated using (is_inbox_supervisor(inbox_id)) with check (is_inbox_supervisor(inbox_id));
create policy cv_read on conversations for select to authenticated using (can_view_conversation(id));
create policy cv_insert on conversations for insert to authenticated with check (org_id = current_org() and has_perm('connect.use') and (inbox_id is null or is_inbox_member(inbox_id)));
create policy cv_update on conversations for update to authenticated using (can_view_conversation(id));
create policy cm_read on conversation_messages for select to authenticated using (can_view_conversation(conversation_id));
create policy cm_insert on conversation_messages for insert to authenticated with check (can_view_conversation(conversation_id) and author_id = auth.uid() and direction = 'internal');
create policy cm_update on conversation_messages for update to authenticated using (author_id = auth.uid() and status in ('draft','failed'));
create policy cl_read on calls for select to authenticated using (user_id = auth.uid() or (conversation_id is not null and can_view_conversation(conversation_id)) or is_manager_of(user_id) or has_perm('connect.view_all'));
create policy cl_update on calls for update to authenticated using (user_id = auth.uid() or is_manager_of(user_id));
create policy cb_all on callbacks for all to authenticated using (user_id = auth.uid() or is_manager_of(user_id) or has_perm('connect.manage')) with check (org_id = current_org() and (user_id = auth.uid() or is_manager_of(user_id)));
create policy fu_all on follow_ups for all to authenticated using (user_id = auth.uid() or is_manager_of(user_id) or has_perm('connect.manage')) with check (org_id = current_org() and (user_id = auth.uid() or is_manager_of(user_id) or has_perm('connect.manage')));
create policy tp_read on comm_templates for select to authenticated using (org_id = current_org() and (scope = 'company' or owner_id = auth.uid() or (scope = 'department' and department_id = current_department()) or has_perm('connect.manage')));
create policy tp_write on comm_templates for all to authenticated using (org_id = current_org() and (owner_id = auth.uid() or has_perm('connect.manage') or (scope = 'department' and department_id = current_department() and is_lead_plus()))) with check (org_id = current_org() and has_perm('connect.use'));
create policy sg_all on signatures for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ir_read on inbox_rules for select to authenticated using (is_inbox_member(inbox_id));
create policy ir_write on inbox_rules for all to authenticated using (is_inbox_supervisor(inbox_id)) with check (is_inbox_supervisor(inbox_id));

grant execute on function connect_settings(), set_connect_settings(jsonb), is_inbox_member(uuid,uuid), is_inbox_supervisor(uuid,uuid), can_view_conversation(uuid), can_view_contact(uuid), needs_send_approval(uuid),
  contact_timeline(uuid,int), queue_message(uuid,text,text,text[],text[],text,text,uuid,boolean,jsonb), approve_message(uuid,boolean,text), mark_message_sent(uuid,boolean,text,text), claim_conversation(uuid), assign_conversation(uuid,uuid,text),
  snooze_conversation(uuid,timestamptz,text), resolve_conversation(uuid,text,text), start_conversation(uuid,text,text,uuid), log_call(uuid,text,text,timestamptz,timestamptz,text,text,text,timestamptz,uuid,text,timestamptz), add_promise(uuid,text,timestamptz),
  complete_follow_up(uuid,text), my_connect_queue(), connect_dashboard(uuid,int), search_contacts(text,int) to authenticated;
grant execute on function ingest_email(text,jsonb), ingest_message(text,jsonb) to anon, authenticated;
revoke execute on function connect_settings(), set_connect_settings(jsonb), is_inbox_member(uuid,uuid), is_inbox_supervisor(uuid,uuid), can_view_conversation(uuid), can_view_contact(uuid), needs_send_approval(uuid),
  contact_timeline(uuid,int), queue_message(uuid,text,text,text[],text[],text,text,uuid,boolean,jsonb), approve_message(uuid,boolean,text), mark_message_sent(uuid,boolean,text,text), claim_conversation(uuid), assign_conversation(uuid,uuid,text),
  snooze_conversation(uuid,timestamptz,text), resolve_conversation(uuid,text,text), start_conversation(uuid,text,text,uuid), log_call(uuid,text,text,timestamptz,timestamptz,text,text,text,timestamptz,uuid,text,timestamptz), add_promise(uuid,text,timestamptz),
  complete_follow_up(uuid,text), my_connect_queue(), connect_dashboard(uuid,int), search_contacts(text,int), find_or_create_contact(uuid,text,text,text,uuid), apply_inbox_rules(uuid,text,text,text), pick_agent(uuid), connect_sla_tick(),
  conversations_before(), conversations_after(), messages_after() from anon, public;
revoke execute on function find_or_create_contact(uuid,text,text,text,uuid), apply_inbox_rules(uuid,text,text,text), pick_agent(uuid), connect_sla_tick() from authenticated;

alter publication supabase_realtime add table conversations, conversation_messages, calls, follow_ups, callbacks;

-- seed: shared inboxes for Sales & Support (members added by supervisors in the UI)
insert into inboxes (org_id, name, kind, address, department_id, visibility, assignment, provider, created_by)
select '00000000-0000-0000-0000-000000000001', d.name || ' inbox', 'email', lower(d.slug) || '@ghl.example', d.id, 'department', 'claim', 'manual', null
  from departments d where d.org_id = '00000000-0000-0000-0000-000000000001' and d.slug in ('sales','support','marketing');
insert into comm_templates (org_id, kind, name, category, subject, body, scope, approved) values
 ('00000000-0000-0000-0000-000000000001','email','Acknowledgement','support','Re: {{subject}}','Dear {{contact_name}},

Thank you for reaching out. I have received your message and will get back to you by {{by_when}}.

Warm regards,
{{my_name}}
GHL India Ventures','company',true),
 ('00000000-0000-0000-0000-000000000001','email','Follow-up after call','sales','Following up on our call','Dear {{contact_name}},

Thank you for your time today. As discussed, {{summary}}.

Next step: {{next_step}}.

Warm regards,
{{my_name}}','company',true),
 ('00000000-0000-0000-0000-000000000001','call_script','Inbound enquiry','sales',null,'1. Greet and confirm the caller''s name.
2. Ask what they are looking for and by when.
3. Do NOT quote prices or guarantees that are not in the approved material — say you will confirm and follow up.
4. Agree the next step and the date you will call back.
5. Log the call with the disposition and the promise.','company',true);
