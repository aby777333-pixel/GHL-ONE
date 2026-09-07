-- Phase 2: Intelligence — assistant conversations, cached AI summaries, usage log.

create table ai_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  title text,
  scope jsonb not null default '{}'::jsonb,           -- e.g. {"project_id": "..."}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_user_idx on ai_conversations(user_id, updated_at desc);

create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  proposals jsonb,                                     -- proposed actions awaiting human confirmation
  sources jsonb,                                       -- [{title, link}]
  created_at timestamptz not null default now()
);
create index ai_messages_conv_idx on ai_messages(conversation_id, created_at);

-- Cached AI outputs keyed by entity + kind (+ optional day / input hash)
create table ai_summaries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,   -- personal outputs (briefs) are per user
  kind text not null,                                       -- brief_morning | brief_eod | project_summary | meeting_extract | catch_up | risk_report | search_answer
  entity_type text,
  entity_id uuid,
  day date,
  input_hash text,
  content jsonb not null,
  model text,
  created_at timestamptz not null default now()
);
create index ai_summaries_lookup_idx on ai_summaries(kind, entity_type, entity_id, user_id, day, created_at desc);

create table ai_usage (
  id bigint generated always as identity primary key,
  org_id uuid references organizations(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  feature text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  latency_ms int,
  created_at timestamptz not null default now()
);
create index ai_usage_created_idx on ai_usage(created_at desc);

create trigger ai_conversations_updated_at before update on ai_conversations for each row execute function set_updated_at();

alter table ai_conversations enable row level security;
alter table ai_messages enable row level security;
alter table ai_summaries enable row level security;
alter table ai_usage enable row level security;

create policy aic_own on ai_conversations for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and org_id = current_org());
create policy aim_own on ai_messages for all to authenticated
  using (exists (select 1 from ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()));

-- Summaries: personal ones visible to their user; entity summaries visible to whoever can see the entity
create policy ais_read on ai_summaries for select to authenticated using (
  org_id = current_org() and (
    user_id = auth.uid()
    or (user_id is null and entity_type = 'project' and entity_id is not null and can_view_project(entity_id))
    or (user_id is null and entity_type = 'meeting' and entity_id is not null and exists (
          select 1 from meetings m where m.id = entity_id and (m.organizer_id = auth.uid() or is_manager_plus()
            or exists (select 1 from meeting_participants mp where mp.meeting_id = m.id and mp.user_id = auth.uid()))))
    or (user_id is null and entity_type = 'channel' and entity_id is not null and can_view_channel(entity_id))
    or (user_id is null and entity_type = 'company' and is_manager_plus())
  )
);
create policy ais_insert on ai_summaries for insert to authenticated with check (org_id = current_org() and is_active_member());
create policy ais_delete on ai_summaries for delete to authenticated using (org_id = current_org() and (user_id = auth.uid() or is_admin()));

create policy aiu_insert on ai_usage for insert to authenticated with check (org_id = current_org() and user_id = auth.uid());
create policy aiu_read on ai_usage for select to authenticated using (org_id = current_org() and (user_id = auth.uid() or is_admin()));

-- Meetings: allow participants to update notes/summary/transcript (organizer/manager already can)
drop policy if exists meet_update on meetings;
create policy meet_update on meetings for update to authenticated using (
  org_id = current_org() and (organizer_id = auth.uid() or is_manager_plus()
    or exists (select 1 from meeting_participants mp where mp.meeting_id = id and mp.user_id = auth.uid()))
);
