-- ============================================================================
-- 0021_live.sql — GHL LIVE: real-time collaboration (rooms, huddles, calls,
-- screen share, recordings, transcripts, whiteboards, live docs, governance)
-- Additive. Media runs on LiveKit (token minted by /api/live/token); this
-- schema holds rooms, membership, history, artifacts and the permission matrix.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Rooms
-- ----------------------------------------------------------------------------
create table if not exists live_rooms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null default 'huddle' check (kind in ('huddle','call','meeting','project_room','department_room','team_room','war_room','training','interview','virtual_office','temp','townhall','breakout','review','management','standup')),
  title text not null,
  host_id uuid references profiles(id) on delete set null,
  co_hosts uuid[] not null default '{}',
  channel_id uuid references channels(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  team_id uuid references teams(id) on delete set null,
  help_request_id uuid references help_requests(id) on delete set null,
  incident_id uuid references incidents(id) on delete set null,
  meeting_id uuid references meetings(id) on delete set null,
  parent_room_id uuid references live_rooms(id) on delete cascade,
  status text not null default 'live' check (status in ('open','live','ended','archived')),
  persistent boolean not null default false,
  visibility text not null default 'members' check (visibility in ('members','department','company','invite_only')),
  locked boolean not null default false,
  waiting_room boolean not null default false,
  confidential boolean not null default false,
  settings jsonb not null default '{}'::jsonb,   -- {allow_screen_share, allow_recording, allow_whiteboard, guests_allowed, watermark, presenter_only, audio_only_default, agenda[], goals, pre_reading[]}
  livekit_room text unique,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  last_active_at timestamptz not null default now(),
  peak_participants int not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists live_rooms_org_idx on live_rooms(org_id, updated_at desc);
create index if not exists live_rooms_status_idx on live_rooms(org_id, status) where status in ('open','live');
create index if not exists live_rooms_project_idx on live_rooms(project_id);
create index if not exists live_rooms_channel_idx on live_rooms(channel_id);
create index if not exists live_rooms_department_idx on live_rooms(department_id);
create index if not exists live_rooms_title_trgm on live_rooms using gin (title extensions.gin_trgm_ops);
drop trigger if exists live_rooms_updated on live_rooms;
create trigger live_rooms_updated before update on live_rooms for each row execute function set_updated_at();

create table if not exists live_participants (
  room_id uuid not null references live_rooms(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'participant' check (role in ('host','cohost','presenter','participant','waiting','removed')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  hand_raised boolean not null default false,
  device text,
  invited_by uuid references profiles(id) on delete set null,
  primary key (room_id, user_id)
);
create index if not exists live_participants_user_idx on live_participants(user_id) where left_at is null;

create table if not exists live_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  room_id uuid not null references live_rooms(id) on delete cascade,
  kind text not null,               -- joined|left|share_started|share_stopped|recording_started|recording_stopped|decision|task|bookmark|poll|question|breakout|lock|unlock|guest_link|guest_joined|admitted|removed|role|note|running_late|reaction
  actor_id uuid references profiles(id) on delete set null,
  actor_name text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists live_events_room_idx on live_events(room_id, created_at);

create table if not exists live_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  room_id uuid not null references live_rooms(id) on delete cascade,
  from_user uuid not null references profiles(id) on delete cascade,
  to_user uuid not null references profiles(id) on delete cascade,
  kind text not null default 'ring' check (kind in ('ring','knock','invite','request_share')),
  status text not null default 'pending' check (status in ('pending','accepted','declined','missed','cancelled')),
  message text,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index if not exists live_invites_to_idx on live_invites(to_user, status) where status = 'pending';

create table if not exists live_guest_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  room_id uuid not null references live_rooms(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  guest_name text,
  guest_email text,
  created_by uuid references profiles(id) on delete set null,
  expires_at timestamptz not null default now() + interval '4 hours',
  max_uses int not null default 3,
  uses int not null default 0,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists live_notes (
  room_id uuid primary key references live_rooms(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  body text not null default '',
  version int not null default 0,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists live_transcripts (
  id bigint generated always as identity primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  room_id uuid references live_rooms(id) on delete cascade,
  recording_id uuid,
  speaker_id uuid references profiles(id) on delete set null,
  speaker_name text,
  lang text not null default 'en-IN',
  text text not null,
  offset_ms int,
  created_at timestamptz not null default now()
);
create index if not exists live_transcripts_room_idx on live_transcripts(room_id, created_at);
create index if not exists live_transcripts_rec_idx on live_transcripts(recording_id, offset_ms);

create table if not exists live_polls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  room_id uuid references live_rooms(id) on delete cascade,
  board_id uuid,
  question text not null,
  options jsonb not null default '[]'::jsonb,        -- [{id,label}]
  votes jsonb not null default '{}'::jsonb,          -- {optionId: [userId,...]}
  multi boolean not null default false,
  anonymous boolean not null default false,
  status text not null default 'open' check (status in ('open','closed')),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists live_polls_room_idx on live_polls(room_id);

create table if not exists live_questions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  room_id uuid not null references live_rooms(id) on delete cascade,
  body text not null,
  author_id uuid references profiles(id) on delete set null,
  anonymous boolean not null default false,
  upvotes uuid[] not null default '{}',
  answered boolean not null default false,
  answer text,
  answered_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists live_questions_room_idx on live_questions(room_id, created_at);

-- ----------------------------------------------------------------------------
-- Recordings (Loom-style screen/camera recordings, video notes, meeting recordings)
-- ----------------------------------------------------------------------------
create table if not exists live_recordings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  room_id uuid references live_rooms(id) on delete set null,
  owner_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'screen' check (kind in ('screen','screen_voice','screen_cam','camera','video_note','meeting','async_update')),
  title text not null,
  description text,
  storage_path text not null,
  mime_type text not null default 'video/webm',
  size_bytes bigint not null default 0,
  duration_sec int not null default 0,
  thumbnail_path text,
  transcript text,
  transcript_segments jsonb not null default '[]'::jsonb,   -- [{t, text, speaker}]
  summary jsonb,                                            -- {summary, key_points[], tasks[], questions[], decisions[]}
  chapters jsonb not null default '[]'::jsonb,              -- [{t, title}]
  access text not null default 'only_me' check (access in ('only_me','selected','team','department','project','company')),
  access_ids uuid[] not null default '{}',
  project_id uuid references projects(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  channel_id uuid references channels(id) on delete set null,
  help_request_id uuid references help_requests(id) on delete set null,
  knowledge_id uuid,
  department_id uuid references departments(id) on delete set null,
  expires_at timestamptz,
  downloadable boolean not null default true,
  status text not null default 'ready' check (status in ('uploading','ready','failed','expired')),
  views int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists live_recordings_org_idx on live_recordings(org_id, created_at desc);
create index if not exists live_recordings_owner_idx on live_recordings(owner_id);
create index if not exists live_recordings_project_idx on live_recordings(project_id);
create index if not exists live_recordings_room_idx on live_recordings(room_id);
create index if not exists live_recordings_title_trgm on live_recordings using gin (title extensions.gin_trgm_ops);
drop trigger if exists live_recordings_updated on live_recordings;
create trigger live_recordings_updated before update on live_recordings for each row execute function set_updated_at();
alter table live_transcripts drop constraint if exists live_transcripts_recording_fk;
alter table live_transcripts add constraint live_transcripts_recording_fk foreign key (recording_id) references live_recordings(id) on delete cascade;

create table if not exists live_recording_replies (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null references live_recordings(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  kind text not null default 'text' check (kind in ('text','voice','video')),
  body text,
  storage_path text,
  at_sec int,
  created_at timestamptz not null default now()
);
create index if not exists live_recording_replies_idx on live_recording_replies(recording_id, created_at);

-- ----------------------------------------------------------------------------
-- GHL BOARD — collaborative whiteboards
-- ----------------------------------------------------------------------------
create table if not exists boards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  kind text not null default 'personal' check (kind in ('personal','team','department','project','room','shared')),
  owner_id uuid references profiles(id) on delete set null,
  team_id uuid references teams(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  room_id uuid references live_rooms(id) on delete set null,
  template_key text,
  doc jsonb not null default '{"pages":[{"id":"p1","title":"Page 1","elements":[]}]}'::jsonb,
  version int not null default 0,
  locked boolean not null default false,
  visibility text not null default 'members' check (visibility in ('private','members','department','company')),
  member_ids uuid[] not null default '{}',
  archived boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists boards_org_idx on boards(org_id, updated_at desc);
create index if not exists boards_project_idx on boards(project_id);
create index if not exists boards_room_idx on boards(room_id);
create index if not exists boards_title_trgm on boards using gin (title extensions.gin_trgm_ops);
drop trigger if exists boards_updated on boards;
create trigger boards_updated before update on boards for each row execute function set_updated_at();
alter table live_polls drop constraint if exists live_polls_board_fk;
alter table live_polls add constraint live_polls_board_fk foreign key (board_id) references boards(id) on delete cascade;

create table if not exists board_versions (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  version int not null,
  label text,
  doc jsonb not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists board_versions_idx on board_versions(board_id, version desc);

create table if not exists board_comments (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  element_id text,
  page_id text,
  body text not null,
  author_id uuid references profiles(id) on delete set null,
  mentions uuid[] not null default '{}',
  resolved boolean not null default false,
  task_id uuid references tasks(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists board_comments_idx on board_comments(board_id, created_at);

create table if not exists board_access_log (
  id bigint generated always as identity primary key,
  board_id uuid not null references boards(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  action text not null,     -- visibility_changed|member_added|member_removed|exported|locked|unlocked|template_applied|snapshot
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Live documents (collaborative notes, agendas, meeting notes, SOP drafts)
-- ----------------------------------------------------------------------------
create table if not exists live_docs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  kind text not null default 'doc' check (kind in ('doc','meeting_notes','agenda','sop','handover','breakout_notes')),
  body text not null default '',
  room_id uuid references live_rooms(id) on delete set null,
  meeting_id uuid references meetings(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  owner_id uuid references profiles(id) on delete set null,
  version int not null default 0,
  visibility text not null default 'members' check (visibility in ('private','members','department','company')),
  member_ids uuid[] not null default '{}',
  suggestion_mode boolean not null default false,
  archived boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists live_docs_org_idx on live_docs(org_id, updated_at desc);
create index if not exists live_docs_room_idx on live_docs(room_id);
create index if not exists live_docs_title_trgm on live_docs using gin (title extensions.gin_trgm_ops);
drop trigger if exists live_docs_updated on live_docs;
create trigger live_docs_updated before update on live_docs for each row execute function set_updated_at();

create table if not exists live_doc_versions (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references live_docs(id) on delete cascade,
  version int not null,
  body text not null,
  label text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists live_doc_versions_idx on live_doc_versions(doc_id, version desc);

create table if not exists live_doc_comments (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references live_docs(id) on delete cascade,
  anchor text,                  -- quoted text the comment refers to
  body text not null,
  suggestion text,              -- proposed replacement (suggestion mode)
  author_id uuid references profiles(id) on delete set null,
  mentions uuid[] not null default '{}',
  resolved boolean not null default false,
  accepted boolean,
  task_id uuid references tasks(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists live_doc_comments_idx on live_doc_comments(doc_id, created_at);

create table if not exists collab_favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('board','room','doc','recording')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, entity_id)
);

-- ----------------------------------------------------------------------------
-- Permission matrix (Super Admin controls who can do what; department defaults)
-- ----------------------------------------------------------------------------
create table if not exists collab_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  scope text not null default 'default' check (scope in ('default','department','role')),
  department_id uuid references departments(id) on delete cascade,
  role role_level,
  can_start_calls boolean not null default true,
  can_video boolean not null default true,
  can_record boolean not null default true,
  can_share_screen boolean not null default true,
  can_whiteboard boolean not null default true,
  can_invite_guests boolean not null default false,
  can_remote_assist boolean not null default false,
  can_create_public_rooms boolean not null default false,
  can_townhall boolean not null default false,
  recording_retention_days int,
  confidential_default boolean not null default false,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create unique index if not exists collab_policies_default_uq on collab_policies(org_id) where scope = 'default';
create unique index if not exists collab_policies_department_uq on collab_policies(org_id, department_id) where scope = 'department';
create unique index if not exists collab_policies_role_uq on collab_policies(org_id, role) where scope = 'role';

-- Additive links on existing tables
alter table tasks add column if not exists source_live_room_id uuid references live_rooms(id) on delete set null;
alter table decisions add column if not exists live_room_id uuid references live_rooms(id) on delete set null;
alter table meetings add column if not exists live_room_id uuid references live_rooms(id) on delete set null;
alter table channels add column if not exists live_room_id uuid references live_rooms(id) on delete set null;
alter table profiles add column if not exists live_room_id uuid references live_rooms(id) on delete set null;
alter table profiles add column if not exists live_state text check (live_state in ('in_call','in_meeting','presenting','recording'));
alter table profiles add column if not exists presence_before_live presence_status;
alter table help_requests add column if not exists live_room_id uuid references live_rooms(id) on delete set null;
alter table incidents add column if not exists live_room_id uuid references live_rooms(id) on delete set null;
alter table ai_knowledge add column if not exists recording_id uuid references live_recordings(id) on delete set null;

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
create or replace function collab_can(p_action text, p_user uuid default auth.uid()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare pr profiles%rowtype; pol collab_policies%rowtype; v boolean;
begin
  select * into pr from profiles where id = p_user;
  if pr.id is null or not pr.is_active then return false; end if;
  if pr.role = 'super_admin' or has_admin_perm_user(p_user, 'communication.manage') then return true; end if;
  -- precedence: role rule → department rule → default → built-in default
  select * into pol from collab_policies where org_id = pr.org_id and scope = 'role' and role = pr.role;
  if pol.id is null then select * into pol from collab_policies where org_id = pr.org_id and scope = 'department' and department_id = pr.department_id; end if;
  if pol.id is null then select * into pol from collab_policies where org_id = pr.org_id and scope = 'default'; end if;
  if pol.id is null then
    return case p_action when 'invite_guests' then role_rank(pr.role) <= 4 when 'remote_assist' then false when 'create_public_rooms' then role_rank(pr.role) <= 4 when 'townhall' then role_rank(pr.role) <= 3 else true end;
  end if;
  v := case p_action
    when 'start_calls' then pol.can_start_calls when 'video' then pol.can_video when 'record' then pol.can_record
    when 'share_screen' then pol.can_share_screen when 'whiteboard' then pol.can_whiteboard when 'invite_guests' then pol.can_invite_guests
    when 'remote_assist' then pol.can_remote_assist when 'create_public_rooms' then pol.can_create_public_rooms when 'townhall' then pol.can_townhall
    else true end;
  return coalesce(v, true);
end $$;

create or replace function can_view_live_room(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from live_rooms lr
    where lr.id = r and lr.org_id = current_org() and is_active_member()
      and (
        lr.host_id = auth.uid() or auth.uid() = any(lr.co_hosts)
        or exists (select 1 from live_participants lp where lp.room_id = lr.id and lp.user_id = auth.uid() and lp.role <> 'removed')
        or exists (select 1 from live_invites li where li.room_id = lr.id and li.to_user = auth.uid())
        or (lr.channel_id is not null and can_view_channel(lr.channel_id))
        or (lr.project_id is not null and can_view_project(lr.project_id))
        or (lr.visibility = 'department' and lr.department_id = current_department())
        or (lr.visibility = 'company' and is_internal())
        or (lr.kind = 'townhall' and is_internal())
        or (lr.parent_room_id is not null and can_view_live_room(lr.parent_room_id))
        or is_manager_plus()
        or has_admin_perm('communication.manage')
      )
  )
$$;

create or replace function is_live_host(r uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from live_rooms lr where lr.id = r and (lr.host_id = p_user or p_user = any(lr.co_hosts)))
      or exists (select 1 from live_participants lp where lp.room_id = r and lp.user_id = p_user and lp.role in ('host','cohost'))
      or has_admin_perm_user(p_user, 'communication.manage')
$$;

create or replace function can_view_board(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from boards bd
    where bd.id = b and bd.org_id = current_org() and is_active_member()
      and (
        bd.owner_id = auth.uid() or auth.uid() = any(bd.member_ids)
        or (bd.visibility = 'company' and is_internal())
        or (bd.visibility = 'department' and bd.department_id = current_department())
        or (bd.visibility in ('members','department','company') and bd.project_id is not null and can_view_project(bd.project_id))
        or (bd.visibility in ('members','department','company') and bd.room_id is not null and can_view_live_room(bd.room_id))
        or (bd.visibility in ('members','department','company') and bd.team_id is not null and exists (select 1 from profiles p where p.id = auth.uid() and p.team_id = bd.team_id))
        or (bd.visibility in ('members','department','company') and bd.kind = 'department' and bd.department_id = current_department())
        or has_admin_perm('communication.manage')
      )
  )
$$;

create or replace function can_edit_board(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_view_board(b) and exists (select 1 from boards bd where bd.id = b and (not bd.locked or bd.owner_id = auth.uid() or is_manager_plus()))
$$;

create or replace function can_view_live_doc(d uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from live_docs ld
    where ld.id = d and ld.org_id = current_org() and is_active_member()
      and (
        ld.owner_id = auth.uid() or auth.uid() = any(ld.member_ids)
        or (ld.visibility = 'company' and is_internal())
        or (ld.visibility = 'department' and ld.department_id = current_department())
        or (ld.visibility <> 'private' and ld.room_id is not null and can_view_live_room(ld.room_id))
        or (ld.visibility <> 'private' and ld.project_id is not null and can_view_project(ld.project_id))
        or (ld.visibility <> 'private' and ld.task_id is not null and can_view_task(ld.task_id))
        or (ld.visibility <> 'private' and ld.meeting_id is not null and exists (select 1 from meeting_participants mp where mp.meeting_id = ld.meeting_id and mp.user_id = auth.uid()))
        or has_admin_perm('communication.manage')
      )
  )
$$;

create or replace function can_view_recording(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from live_recordings rc
    where rc.id = r and rc.org_id = current_org() and is_active_member() and rc.status <> 'expired'
      and (
        rc.owner_id = auth.uid()
        or (rc.access = 'selected' and auth.uid() = any(rc.access_ids))
        or (rc.access = 'team' and exists (select 1 from profiles a join profiles b on a.team_id = b.team_id where a.id = auth.uid() and b.id = rc.owner_id and a.team_id is not null))
        or (rc.access = 'department' and coalesce(rc.department_id, (select department_id from profiles where id = rc.owner_id)) = current_department())
        or (rc.access = 'project' and rc.project_id is not null and can_view_project(rc.project_id))
        or (rc.access = 'company' and is_internal())
        or (rc.channel_id is not null and rc.access <> 'only_me' and can_view_channel(rc.channel_id))
        or (rc.task_id is not null and rc.access <> 'only_me' and can_view_task(rc.task_id))
        or (rc.room_id is not null and rc.access <> 'only_me' and can_view_live_room(rc.room_id))
        or has_admin_perm('communication.manage')
      )
  )
$$;

-- ----------------------------------------------------------------------------
-- Room lifecycle RPCs
-- ----------------------------------------------------------------------------
create or replace function start_live_room(
  p_kind text default 'huddle', p_title text default null,
  p_channel uuid default null, p_project uuid default null, p_task uuid default null, p_department uuid default null,
  p_help uuid default null, p_incident uuid default null, p_meeting uuid default null, p_team uuid default null,
  p_invitees uuid[] default '{}', p_settings jsonb default '{}'::jsonb, p_persistent boolean default false,
  p_visibility text default null, p_parent uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare o uuid := current_org(); rid uuid; cid uuid := p_channel; t text := p_title; u uuid; existing uuid; vis text; conf boolean := false; members uuid[];
begin
  if not is_active_member() then raise exception 'forbidden'; end if;
  if not collab_can('start_calls') then raise exception 'You are not allowed to start calls. Ask your manager or IT.'; end if;
  if p_kind = 'townhall' and not collab_can('townhall') then raise exception 'Only management can start a town hall.'; end if;
  if p_kind = 'war_room' and p_incident is null and p_help is null and not is_lead_plus() then raise exception 'forbidden'; end if;

  -- Persistent rooms are singletons per entity: return the existing open one.
  if p_persistent or p_kind in ('project_room','department_room','team_room','virtual_office','management','standup') then
    select id into existing from live_rooms
     where org_id = o and status in ('open','live') and kind = p_kind
       and coalesce(project_id, '00000000-0000-0000-0000-000000000000') = coalesce(p_project, '00000000-0000-0000-0000-000000000000')
       and coalesce(department_id, '00000000-0000-0000-0000-000000000000') = coalesce(p_department, '00000000-0000-0000-0000-000000000000')
       and coalesce(team_id, '00000000-0000-0000-0000-000000000000') = coalesce(p_team, '00000000-0000-0000-0000-000000000000')
       and coalesce(channel_id, '00000000-0000-0000-0000-000000000000') = coalesce(p_channel, '00000000-0000-0000-0000-000000000000')
     order by created_at limit 1;
    if existing is not null then
      update live_rooms set status = 'live', last_active_at = now() where id = existing;
      return existing;
    end if;
  end if;

  -- Derive the conversation channel from the entity so the huddle lives beside the chat.
  if cid is null and p_project is not null then select id into cid from channels where project_id = p_project and type = 'project' and not archived limit 1; end if;
  if cid is null and p_task is not null then select id into cid from channels where task_id = p_task and type = 'task' and not archived limit 1; end if;
  if cid is null and p_help is not null then select channel_id into cid from help_requests where id = p_help; end if;
  if cid is null and p_incident is not null then select channel_id into cid from incidents where id = p_incident; end if;
  if cid is null and p_department is not null and p_kind in ('department_room','virtual_office') then select id into cid from channels where department_id = p_department and type = 'department' and not archived limit 1; end if;
  if cid is not null and not can_view_channel(cid) then raise exception 'channel not accessible'; end if;
  if p_project is not null and not can_view_project(p_project) then raise exception 'project not accessible'; end if;

  if t is null or t = '' then
    t := case p_kind
      when 'project_room' then coalesce((select name from projects where id = p_project), 'Project') || ' room'
      when 'department_room' then coalesce((select name from departments where id = p_department), 'Department') || ' room'
      when 'team_room' then coalesce((select name from teams where id = p_team), 'Team') || ' room'
      when 'virtual_office' then coalesce((select name from departments where id = p_department), 'Office') || ' · virtual office'
      when 'war_room' then 'War room: ' || coalesce((select title from incidents where id = p_incident), (select title from help_requests where id = p_help), 'Incident')
      when 'management' then 'Management war room'
      when 'standup' then 'Daily huddle'
      when 'townhall' then 'Company town hall'
      when 'call' then 'Call'
      else coalesce((select '#' || name from channels where id = cid), 'Huddle') end;
  end if;

  vis := coalesce(p_visibility, case p_kind when 'townhall' then 'company' when 'department_room' then 'department' when 'virtual_office' then 'department' when 'management' then 'invite_only' else 'members' end);
  if vis in ('company') and p_kind <> 'townhall' and not collab_can('create_public_rooms') then vis := 'members'; end if;
  select coalesce(cp.confidential_default, false) into conf from collab_policies cp where cp.org_id = o and cp.scope = 'default';
  if p_kind in ('management','interview') then conf := true; end if;

  insert into live_rooms (org_id, kind, title, host_id, channel_id, project_id, task_id, department_id, team_id, help_request_id, incident_id, meeting_id, parent_room_id, persistent, visibility, confidential, settings, created_by, status)
  values (o, p_kind, left(t, 120), auth.uid(), cid, p_project, p_task, coalesce(p_department, case when p_kind in ('department_room','virtual_office') then current_department() end), p_team, p_help, p_incident, p_meeting, p_parent,
          p_persistent or p_kind in ('project_room','department_room','team_room','virtual_office','management','standup'), vis, conf,
          jsonb_build_object('allow_screen_share', true, 'allow_recording', not conf, 'allow_whiteboard', true, 'guests_allowed', false, 'watermark', conf, 'presenter_only', p_kind = 'townhall') || coalesce(p_settings, '{}'::jsonb),
          auth.uid(), 'live')
  returning id into rid;
  update live_rooms set livekit_room = 'ghlone_' || replace(rid::text, '-', '') where id = rid;

  insert into live_participants (room_id, user_id, role) values (rid, auth.uid(), 'host') on conflict (room_id, user_id) do update set role = 'host', left_at = null, joined_at = now();
  insert into live_notes (room_id, org_id) values (rid, o) on conflict do nothing;
  if p_meeting is not null then update meetings set live_room_id = rid, meeting_link = '/live/' || rid where id = p_meeting; end if;
  if p_help is not null then update help_requests set live_room_id = rid where id = p_help; end if;
  if p_incident is not null then update incidents set live_room_id = rid where id = p_incident; end if;
  if cid is not null and p_kind not in ('breakout') then
    update channels set live_room_id = rid where id = cid;
    insert into messages (channel_id, author_id, kind, body) values (cid, auth.uid(), 'video', person_name(auth.uid()) || ' started **' || t || '** · [Join](/live/' || rid || ')');
  end if;

  -- Invitees: ring them (trigger sends the notification). Channel members are not rung by default — they see the Join bar.
  members := array_remove(coalesce(p_invitees, '{}'), auth.uid());
  if p_kind = 'war_room' and p_incident is not null then
    members := members || array_remove(array(select distinct cm.user_id from channel_members cm where cm.channel_id = cid), auth.uid());
  end if;
  if p_kind = 'townhall' then
    members := array(select id from profiles where org_id = o and is_active and is_internal_user(id) and id <> auth.uid());
  end if;
  for u in select distinct x from unnest(members) x where x is not null loop
    insert into live_invites (org_id, room_id, from_user, to_user, kind, message) values (o, rid, auth.uid(), u, case when p_kind = 'townhall' then 'invite' else 'ring' end, t);
  end loop;

  insert into live_events (org_id, room_id, kind, actor_id, actor_name, payload) values (o, rid, 'started', auth.uid(), person_name(auth.uid()), jsonb_build_object('kind', p_kind, 'invitees', coalesce(array_length(members, 1), 0)));
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, project_id, task_id, summary, new_value)
  values (o, auth.uid(), 'live.room_started', 'live_room', rid, p_project, p_task, t, jsonb_build_object('kind', p_kind, 'channel_id', cid, 'department_id', p_department, 'visibility', vis));
  return rid;
end $$;

create or replace function is_internal_user(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_user and role_rank(role) <= 7)
$$;

create or replace function join_live_room(p_room uuid, p_device text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r live_rooms%rowtype; me uuid := auth.uid(); rl text := 'participant'; prev presence_status; n int;
begin
  select * into r from live_rooms where id = p_room;
  if r.id is null then raise exception 'room not found'; end if;
  if r.status = 'ended' or r.status = 'archived' then return jsonb_build_object('ok', false, 'reason', 'ended'); end if;
  if not can_view_live_room(p_room) then
    return jsonb_build_object('ok', false, 'reason', 'no_access');
  end if;
  if is_live_host(p_room, me) then rl := case when r.host_id = me then 'host' else 'cohost' end;
  elsif (r.locked or r.waiting_room) and not exists (select 1 from live_participants lp where lp.room_id = p_room and lp.user_id = me and lp.role in ('participant','presenter','cohost','host')) then
    insert into live_participants (room_id, user_id, role, device) values (p_room, me, 'waiting', p_device)
      on conflict (room_id, user_id) do update set role = 'waiting', joined_at = now(), left_at = null, device = excluded.device;
    return jsonb_build_object('ok', false, 'reason', 'waiting');
  end if;
  insert into live_participants (room_id, user_id, role, device) values (p_room, me, rl, p_device)
    on conflict (room_id, user_id) do update set role = case when live_participants.role in ('host','cohost','presenter') then live_participants.role else rl end, joined_at = now(), left_at = null, device = excluded.device;
  update live_invites set status = 'accepted', responded_at = now() where room_id = p_room and to_user = me and status = 'pending';
  select presence into prev from profiles where id = me;
  update profiles set presence_before_live = case when live_room_id is null then prev else presence_before_live end, presence = 'in_meeting', live_room_id = p_room, live_state = case when r.kind in ('meeting','townhall','training','interview') then 'in_meeting' else 'in_call' end where id = me;
  select count(*) into n from live_participants where room_id = p_room and left_at is null and role not in ('waiting','removed');
  update live_rooms set status = 'live', last_active_at = now(), peak_participants = greatest(peak_participants, n) where id = p_room;
  insert into live_events (org_id, room_id, kind, actor_id, actor_name) values (r.org_id, p_room, 'joined', me, person_name(me));
  return jsonb_build_object('ok', true, 'role', rl, 'livekit_room', r.livekit_room, 'confidential', r.confidential, 'settings', r.settings, 'title', r.title, 'kind', r.kind);
end $$;

create or replace function leave_live_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); o uuid;
begin
  update live_participants set left_at = now(), hand_raised = false where room_id = p_room and user_id = me and left_at is null;
  update profiles set presence = coalesce(presence_before_live, 'available'), presence_before_live = null, live_room_id = null, live_state = null where id = me and live_room_id = p_room;
  select org_id into o from live_rooms where id = p_room;
  insert into live_events (org_id, room_id, kind, actor_id, actor_name) values (o, p_room, 'left', me, person_name(me));
  update live_rooms set last_active_at = now() where id = p_room;
end $$;

create or replace function set_live_state(p_state text) returns void
language sql security definer set search_path = public as $$
  update profiles set live_state = case when p_state in ('in_call','in_meeting','presenting','recording') then p_state else live_state end where id = auth.uid() and live_room_id is not null;
$$;

create or replace function end_live_room(p_room uuid, p_summary text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r live_rooms%rowtype; mins int; n int;
begin
  select * into r from live_rooms where id = p_room;
  if r.id is null then return; end if;
  if not (is_live_host(p_room) or is_manager_plus()) then raise exception 'only the host can end this room'; end if;
  mins := greatest(1, extract(epoch from (now() - r.started_at))::int / 60);
  select count(distinct user_id) into n from live_participants where room_id = p_room and role not in ('waiting','removed');
  update live_participants set left_at = coalesce(left_at, now()) where room_id = p_room;
  update profiles set presence = coalesce(presence_before_live, 'available'), presence_before_live = null, live_room_id = null, live_state = null where live_room_id = p_room;
  update live_rooms set status = case when persistent then 'open' else 'ended' end, ended_at = case when persistent then null else now() end, locked = false, last_active_at = now() where id = p_room;
  update live_rooms set status = 'ended', ended_at = now() where parent_room_id = p_room and status <> 'ended';
  update live_invites set status = 'missed', responded_at = now() where room_id = p_room and status = 'pending';
  update channels set live_room_id = null where live_room_id = p_room;
  if r.channel_id is not null then
    insert into messages (channel_id, author_id, kind, body) values (r.channel_id, auth.uid(), 'system', '**' || r.title || '** ended · ' || mins || ' min · ' || n || ' participant' || case when n = 1 then '' else 's' end || coalesce(E'\n' || p_summary, '') || E'\n[History](/live/' || p_room || ')');
  end if;
  insert into live_events (org_id, room_id, kind, actor_id, actor_name, payload) values (r.org_id, p_room, 'ended', auth.uid(), person_name(auth.uid()), jsonb_build_object('minutes', mins, 'participants', n));
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, project_id, summary, new_value) values (r.org_id, auth.uid(), 'live.room_ended', 'live_room', p_room, r.project_id, r.title, jsonb_build_object('minutes', mins, 'participants', n));
end $$;

/** Host controls. Media-level mute/remove is executed by /api/live/moderate against LiveKit after this succeeds. */
create or replace function live_moderate(p_room uuid, p_user uuid, p_action text, p_value text default null) returns void
language plpgsql security definer set search_path = public as $$
declare o uuid; r live_rooms%rowtype;
begin
  select * into r from live_rooms where id = p_room; o := r.org_id;
  if r.id is null then raise exception 'room not found'; end if;
  if not is_live_host(p_room) then raise exception 'host only'; end if;
  if p_action = 'admit' then
    update live_participants set role = 'participant', joined_at = now(), left_at = null where room_id = p_room and user_id = p_user and role = 'waiting';
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id) values (p_user, 'information', 'You were admitted to ' || r.title, 'Join now.', '/live/' || p_room, 'live_room', p_room, auth.uid());
  elsif p_action = 'remove' then
    update live_participants set role = 'removed', left_at = now() where room_id = p_room and user_id = p_user;
    update profiles set presence = coalesce(presence_before_live, 'available'), presence_before_live = null, live_room_id = null, live_state = null where id = p_user and live_room_id = p_room;
  elsif p_action = 'role' then
    if p_value not in ('cohost','presenter','participant') then raise exception 'bad role'; end if;
    update live_participants set role = p_value where room_id = p_room and user_id = p_user and role <> 'host';
    if p_value = 'cohost' then update live_rooms set co_hosts = array(select distinct unnest(co_hosts || p_user)) where id = p_room; else update live_rooms set co_hosts = array_remove(co_hosts, p_user) where id = p_room; end if;
  elsif p_action = 'lock' then update live_rooms set locked = (p_value = 'true') where id = p_room;
  elsif p_action = 'waiting_room' then update live_rooms set waiting_room = (p_value = 'true') where id = p_room;
  elsif p_action = 'setting' then update live_rooms set settings = settings || jsonb_build_object(split_part(p_value, '=', 1), (split_part(p_value, '=', 2) = 'true')) where id = p_room;
  elsif p_action = 'confidential' then update live_rooms set confidential = (p_value = 'true'), settings = settings || jsonb_build_object('allow_recording', p_value <> 'true', 'watermark', p_value = 'true') where id = p_room;
  elsif p_action = 'transfer_host' then
    update live_rooms set host_id = p_user, co_hosts = array_remove(array(select distinct unnest(co_hosts || auth.uid())), p_user) where id = p_room;
    update live_participants set role = 'host' where room_id = p_room and user_id = p_user;
    update live_participants set role = 'cohost' where room_id = p_room and user_id = auth.uid();
  elsif p_action in ('mute','stop_share','lower_hand') then
    if p_action = 'lower_hand' then update live_participants set hand_raised = false where room_id = p_room and user_id = p_user; end if;
  else raise exception 'unknown action %', p_action; end if;
  insert into live_events (org_id, room_id, kind, actor_id, actor_name, payload) values (o, p_room, p_action, auth.uid(), person_name(auth.uid()), jsonb_build_object('user_id', p_user, 'value', p_value));
  if p_action in ('lock','remove','confidential','transfer_host') then
    insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value) values (o, auth.uid(), 'live.' || p_action, 'live_room', p_room, r.title, jsonb_build_object('user_id', p_user, 'value', p_value));
  end if;
end $$;

create or replace function live_raise_hand(p_room uuid, p_up boolean) returns void
language sql security definer set search_path = public as $$
  update live_participants set hand_raised = p_up where room_id = p_room and user_id = auth.uid();
$$;

/** Ring / knock / invite someone into a room (or request that they share their screen). */
create or replace function live_invite(p_room uuid, p_user uuid, p_kind text default 'ring', p_message text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare o uuid; iid uuid; r live_rooms%rowtype;
begin
  select * into r from live_rooms where id = p_room; o := r.org_id;
  if r.id is null or not can_view_live_room(p_room) then raise exception 'room not accessible'; end if;
  if r.confidential and not is_live_host(p_room) then raise exception 'only the host can invite into a confidential room'; end if;
  insert into live_invites (org_id, room_id, from_user, to_user, kind, message) values (o, p_room, auth.uid(), p_user, p_kind, coalesce(p_message, r.title)) returning id into iid;
  insert into live_participants (room_id, user_id, role, invited_by, left_at) values (p_room, p_user, 'participant', auth.uid(), now()) on conflict do nothing;
  insert into live_events (org_id, room_id, kind, actor_id, actor_name, payload) values (o, p_room, 'invited', auth.uid(), person_name(auth.uid()), jsonb_build_object('user_id', p_user, 'kind', p_kind));
  return iid;
end $$;

create or replace function live_invite_department(p_room uuid, p_department uuid, p_message text default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; u uuid; d departments%rowtype;
begin
  select * into d from departments where id = p_department;
  for u in select distinct x from unnest(array_remove(array[d.on_duty_user_id, d.head_id] || coalesce(d.escalation_matrix, '{}'), null)) x where x <> auth.uid() loop
    perform live_invite(p_room, u, 'ring', coalesce(p_message, 'Your department is needed in a live room'));
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function respond_live_invite(p_id uuid, p_status text) returns void
language sql security definer set search_path = public as $$
  update live_invites set status = p_status, responded_at = now() where id = p_id and (to_user = auth.uid() or from_user = auth.uid()) and status = 'pending';
$$;

/** Direct 1:1 call: opens (or reuses) a call room for the pair and rings the other person. */
create or replace function call_person(p_user uuid, p_video boolean default true) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; rid uuid;
begin
  if p_user = auth.uid() then raise exception 'cannot call yourself'; end if;
  cid := open_dm(p_user);
  select id into rid from live_rooms where channel_id = cid and status in ('open','live') and kind = 'call' order by created_at desc limit 1;
  if rid is null then
    rid := start_live_room('call', 'Call with ' || person_name(p_user), cid, null, null, null, null, null, null, null, array[p_user], jsonb_build_object('audio_only_default', not p_video), false, 'members', null);
  else
    perform live_invite(rid, p_user, 'ring', 'Call with ' || person_name(auth.uid()));
  end if;
  return rid;
end $$;

create or replace function knock(p_user uuid, p_message text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid; cid uuid;
begin
  cid := open_dm(p_user);
  rid := start_live_room('huddle', person_name(auth.uid()) || ' wants to talk', cid, null, null, null, null, null, null, null, '{}'::uuid[], '{}'::jsonb, false, 'members', null);
  perform live_invite(rid, p_user, 'knock', coalesce(p_message, person_name(auth.uid()) || ' wants to talk'));
  return rid;
end $$;

/** Turn talk into work without leaving the room. */
create or replace function live_room_task(p_room uuid, p_title text, p_assignee uuid default null, p_due timestamptz default null, p_priority task_priority default 'normal', p_description text default null, p_attachments jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare r live_rooms%rowtype; tid uuid; parts uuid[];
begin
  select * into r from live_rooms where id = p_room;
  if r.id is null or not can_view_live_room(p_room) then raise exception 'room not accessible'; end if;
  select array_agg(user_id) into parts from live_participants where room_id = p_room and role not in ('waiting','removed');
  insert into tasks (org_id, project_id, department_id, title, description, owner_id, assignee_id, created_by, status, priority, due_date, source_live_room_id, tags)
  values (r.org_id, r.project_id, coalesce(r.department_id, (select department_id from profiles where id = coalesce(p_assignee, auth.uid()))), left(p_title, 200),
          coalesce(p_description, '') || E'\n\n_Captured in live room **' || r.title || '** with ' || array_to_string(array(select person_name(x) from unnest(coalesce(parts, '{}')) x), ', ') || '_' || case when jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 0 then E'\nAttachments: ' || (select string_agg(a->>'path', ', ') from jsonb_array_elements(p_attachments) a) else '' end,
          auth.uid(), coalesce(p_assignee, auth.uid()), auth.uid(), 'todo', coalesce(p_priority, 'normal'), p_due, p_room, array['live'])
  returning id into tid;
  if r.channel_id is not null then
    insert into messages (channel_id, author_id, kind, body, attachments) values (r.channel_id, auth.uid(), 'system', 'Task created in the room: [' || p_title || '](/tasks/' || tid || ')' || case when p_assignee is not null then ' → ' || person_name(p_assignee) else '' end, coalesce(p_attachments, '[]'::jsonb));
  end if;
  insert into live_events (org_id, room_id, kind, actor_id, actor_name, payload) values (r.org_id, p_room, 'task', auth.uid(), person_name(auth.uid()), jsonb_build_object('task_id', tid, 'title', p_title, 'assignee_id', p_assignee));
  return tid;
end $$;

create or replace function live_room_decision(p_room uuid, p_title text, p_decision text, p_reason text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare r live_rooms%rowtype; did uuid; parts uuid[];
begin
  select * into r from live_rooms where id = p_room;
  if r.id is null or not can_view_live_room(p_room) then raise exception 'room not accessible'; end if;
  if not (is_lead_plus() or is_live_host(p_room)) then raise exception 'Only leads and above (or the host) can record decisions'; end if;
  select array_agg(user_id) into parts from live_participants where room_id = p_room and role not in ('waiting','removed');
  insert into decisions (org_id, title, decision, reason, decided_by, project_id, department_id, channel_id, meeting_id, participants, live_room_id, classification)
  values (r.org_id, left(p_title, 200), p_decision, p_reason, auth.uid(), r.project_id, r.department_id, r.channel_id, r.meeting_id, coalesce(parts, '{}'), p_room, (case when r.confidential then 'confidential' else 'internal' end)::classification)
  returning id into did;
  if r.channel_id is not null then
    insert into messages (channel_id, author_id, kind, body) values (r.channel_id, auth.uid(), 'system', '📌 Decision recorded: [' || p_title || '](/decisions/' || did || ')');
  end if;
  insert into live_events (org_id, room_id, kind, actor_id, actor_name, payload) values (r.org_id, p_room, 'decision', auth.uid(), person_name(auth.uid()), jsonb_build_object('decision_id', did, 'title', p_title));
  return did;
end $$;

create or replace function live_bookmark(p_room uuid, p_label text default null, p_offset_ms int default null) returns void
language sql security definer set search_path = public as $$
  insert into live_events (org_id, room_id, kind, actor_id, actor_name, payload)
  select org_id, p_room, 'bookmark', auth.uid(), person_name(auth.uid()), jsonb_build_object('label', coalesce(p_label, 'Important'), 'offset_ms', p_offset_ms) from live_rooms where id = p_room and can_view_live_room(p_room);
$$;

create or replace function live_running_late(p_meeting uuid, p_minutes int default 5) returns void
language plpgsql security definer set search_path = public as $$
declare m meetings%rowtype; u uuid;
begin
  select * into m from meetings where id = p_meeting;
  if m.id is null then return; end if;
  for u in select user_id from meeting_participants where meeting_id = p_meeting and user_id <> auth.uid() union select m.organizer_id loop
    if u is not null and u <> auth.uid() then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id) values (u, 'information', person_name(auth.uid()) || ' is running ' || p_minutes || ' min late', m.title, coalesce('/live/' || m.live_room_id, '/meetings/' || m.id), 'meeting', m.id, auth.uid());
    end if;
  end loop;
  if m.live_room_id is not null then
    insert into live_events (org_id, room_id, kind, actor_id, actor_name, payload) values (m.org_id, m.live_room_id, 'running_late', auth.uid(), person_name(auth.uid()), jsonb_build_object('minutes', p_minutes));
  end if;
end $$;

/** Breakout rooms: host splits participants; each breakout is a child room with its own notes. */
create or replace function create_breakouts(p_room uuid, p_groups jsonb) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare r live_rooms%rowtype; g jsonb; bid uuid; ids uuid[] := '{}'; u text; i int := 0;
begin
  select * into r from live_rooms where id = p_room;
  if r.id is null or not is_live_host(p_room) then raise exception 'host only'; end if;
  for g in select * from jsonb_array_elements(p_groups) loop
    i := i + 1;
    insert into live_rooms (org_id, kind, title, host_id, co_hosts, channel_id, project_id, department_id, parent_room_id, visibility, confidential, settings, created_by, status)
    values (r.org_id, 'breakout', coalesce(g->>'title', 'Breakout ' || i), r.host_id, r.co_hosts, null, r.project_id, r.department_id, p_room, 'members', r.confidential, r.settings, auth.uid(), 'live')
    returning id into bid;
    update live_rooms set livekit_room = 'ghlone_' || replace(bid::text, '-', '') where id = bid;
    insert into live_notes (room_id, org_id) values (bid, r.org_id);
    insert into live_docs (org_id, title, kind, room_id, project_id, owner_id, created_by) values (r.org_id, coalesce(g->>'title', 'Breakout ' || i) || ' notes', 'breakout_notes', bid, r.project_id, auth.uid(), auth.uid());
    for u in select jsonb_array_elements_text(coalesce(g->'user_ids', '[]'::jsonb)) loop
      insert into live_participants (room_id, user_id, role, left_at) values (bid, u::uuid, 'participant', now()) on conflict do nothing;
    end loop;
    ids := ids || bid;
  end loop;
  insert into live_events (org_id, room_id, kind, actor_id, actor_name, payload) values (r.org_id, p_room, 'breakout', auth.uid(), person_name(auth.uid()), jsonb_build_object('rooms', ids));
  return ids;
end $$;

create or replace function end_breakouts(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  if not is_live_host(p_room) then raise exception 'host only'; end if;
  select org_id into o from live_rooms where id = p_room;
  update live_rooms set status = 'ended', ended_at = now() where parent_room_id = p_room and status <> 'ended';
  update live_participants set left_at = coalesce(left_at, now()) where room_id in (select id from live_rooms where parent_room_id = p_room);
  insert into live_events (org_id, room_id, kind, actor_id, actor_name) values (o, p_room, 'breakout_ended', auth.uid(), person_name(auth.uid()));
end $$;

/** External guests: temporary link scoped to one room; validated by the token route which mints a LiveKit token. */
create or replace function live_guest_link(p_room uuid, p_name text default null, p_email text default null, p_hours int default 4) returns text
language plpgsql security definer set search_path = public as $$
declare r live_rooms%rowtype; tok text;
begin
  select * into r from live_rooms where id = p_room;
  if r.id is null or not can_view_live_room(p_room) then raise exception 'room not accessible'; end if;
  if not collab_can('invite_guests') then raise exception 'You are not allowed to invite external guests.'; end if;
  if r.confidential then raise exception 'Confidential rooms cannot have external guests.'; end if;
  insert into live_guest_links (org_id, room_id, guest_name, guest_email, created_by, expires_at) values (r.org_id, p_room, p_name, p_email, auth.uid(), now() + make_interval(hours => least(greatest(p_hours, 1), 72))) returning token into tok;
  update live_rooms set settings = settings || '{"guests_allowed": true}'::jsonb where id = p_room;
  insert into live_events (org_id, room_id, kind, actor_id, actor_name, payload) values (r.org_id, p_room, 'guest_link', auth.uid(), person_name(auth.uid()), jsonb_build_object('name', p_name));
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value) values (r.org_id, auth.uid(), 'live.guest_invited', 'live_room', p_room, r.title, jsonb_build_object('name', p_name, 'email', p_email, 'hours', p_hours));
  return tok;
end $$;

create or replace function live_guest_lookup(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g live_guest_links%rowtype; r live_rooms%rowtype;
begin
  select * into g from live_guest_links where token = p_token;
  if g.id is null or g.revoked or g.expires_at < now() or g.uses >= g.max_uses then return jsonb_build_object('ok', false); end if;
  select * into r from live_rooms where id = g.room_id;
  if r.id is null or r.status = 'ended' or r.status = 'archived' or r.confidential or not coalesce((r.settings->>'guests_allowed')::boolean, false) then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'room_id', r.id, 'title', r.title, 'livekit_room', r.livekit_room, 'guest_name', g.guest_name, 'org', (select name from organizations where id = r.org_id), 'locked', r.locked);
end $$;

create or replace function live_guest_consume(p_token text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare g live_guest_links%rowtype;
begin
  select * into g from live_guest_links where token = p_token;
  if g.id is null then return; end if;
  update live_guest_links set uses = uses + 1 where id = g.id;
  insert into live_events (org_id, room_id, kind, actor_name, payload) values (g.org_id, g.room_id, 'guest_joined', coalesce(p_name, g.guest_name, 'Guest'), jsonb_build_object('link_id', g.id));
end $$;

/** Everything a project / task / department / channel did live: rooms, recordings, boards, docs, decisions. */
create or replace function live_history(p_type text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rooms jsonb; recs jsonb; bds jsonb; docs jsonb; decs jsonb;
begin
  if p_type = 'project' and not can_view_project(p_id) then return '{}'::jsonb; end if;
  if p_type = 'channel' and not can_view_channel(p_id) then return '{}'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'kind', r.kind, 'status', r.status, 'started_at', r.started_at, 'ended_at', r.ended_at, 'host', person_name(r.host_id), 'participants', (select count(*) from live_participants lp where lp.room_id = r.id and lp.role not in ('waiting','removed'))) order by r.started_at desc), '[]') into rooms
    from live_rooms r where r.org_id = current_org() and can_view_live_room(r.id)
     and ((p_type = 'project' and r.project_id = p_id) or (p_type = 'task' and r.task_id = p_id) or (p_type = 'department' and r.department_id = p_id) or (p_type = 'channel' and r.channel_id = p_id) or (p_type = 'help' and r.help_request_id = p_id) or (p_type = 'incident' and r.incident_id = p_id) or (p_type = 'meeting' and r.meeting_id = p_id));
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'kind', x.kind, 'duration_sec', x.duration_sec, 'created_at', x.created_at, 'owner', person_name(x.owner_id)) order by x.created_at desc), '[]') into recs
    from live_recordings x where x.org_id = current_org() and can_view_recording(x.id)
     and ((p_type = 'project' and x.project_id = p_id) or (p_type = 'task' and x.task_id = p_id) or (p_type = 'department' and x.department_id = p_id) or (p_type = 'channel' and x.channel_id = p_id) or (p_type = 'help' and x.help_request_id = p_id) or (x.room_id in (select id from live_rooms r where (p_type = 'project' and r.project_id = p_id) or (p_type = 'task' and r.task_id = p_id) or (p_type = 'meeting' and r.meeting_id = p_id))));
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'title', b.title, 'kind', b.kind, 'updated_at', b.updated_at, 'owner', person_name(b.owner_id)) order by b.updated_at desc), '[]') into bds
    from boards b where b.org_id = current_org() and not b.archived and can_view_board(b.id)
     and ((p_type = 'project' and b.project_id = p_id) or (p_type = 'department' and b.department_id = p_id) or (b.room_id in (select id from live_rooms r where (p_type = 'project' and r.project_id = p_id) or (p_type = 'task' and r.task_id = p_id) or (p_type = 'channel' and r.channel_id = p_id) or (p_type = 'meeting' and r.meeting_id = p_id))));
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'kind', d.kind, 'updated_at', d.updated_at) order by d.updated_at desc), '[]') into docs
    from live_docs d where d.org_id = current_org() and not d.archived and can_view_live_doc(d.id)
     and ((p_type = 'project' and d.project_id = p_id) or (p_type = 'task' and d.task_id = p_id) or (p_type = 'department' and d.department_id = p_id) or (p_type = 'meeting' and d.meeting_id = p_id) or (d.room_id in (select id from live_rooms r where (p_type = 'project' and r.project_id = p_id) or (p_type = 'task' and r.task_id = p_id) or (p_type = 'channel' and r.channel_id = p_id) or (p_type = 'meeting' and r.meeting_id = p_id))));
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'decided_at', d.decided_at, 'by', person_name(d.decided_by)) order by d.decided_at desc), '[]') into decs
    from decisions d where d.org_id = current_org() and d.live_room_id is not null and can_view_classification(d.classification)
     and ((p_type = 'project' and d.project_id = p_id) or (p_type = 'department' and d.department_id = p_id) or (p_type = 'channel' and d.channel_id = p_id) or (p_type = 'meeting' and d.meeting_id = p_id) or (d.live_room_id in (select id from live_rooms r where (p_type = 'task' and r.task_id = p_id))));
  return jsonb_build_object('rooms', rooms, 'recordings', recs, 'boards', bds, 'docs', docs, 'decisions', decs);
end $$;

/** Board / doc helpers */
create or replace function board_snapshot(p_board uuid, p_label text default null) returns int
language plpgsql security definer set search_path = public as $$
declare b boards%rowtype;
begin
  select * into b from boards where id = p_board;
  if b.id is null or not can_view_board(p_board) then raise exception 'board not accessible'; end if;
  insert into board_versions (board_id, version, label, doc, created_by) values (p_board, b.version, p_label, b.doc, auth.uid());
  insert into board_access_log (board_id, actor_id, action, details) values (p_board, auth.uid(), 'snapshot', jsonb_build_object('version', b.version, 'label', p_label));
  return b.version;
end $$;

create or replace function board_restore(p_board uuid, p_version_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v board_versions%rowtype;
begin
  if not can_edit_board(p_board) then raise exception 'board not editable'; end if;
  select * into v from board_versions where id = p_version_id and board_id = p_board;
  if v.id is null then raise exception 'version not found'; end if;
  perform board_snapshot(p_board, 'Before restore');
  update boards set doc = v.doc, version = version + 1 where id = p_board;
  insert into board_access_log (board_id, actor_id, action, details) values (p_board, auth.uid(), 'restored', jsonb_build_object('from_version', v.version));
end $$;

create or replace function board_element_task(p_board uuid, p_element_id text, p_title text, p_assignee uuid default null, p_due timestamptz default null, p_priority task_priority default 'normal') returns uuid
language plpgsql security definer set search_path = public as $$
declare b boards%rowtype; tid uuid;
begin
  select * into b from boards where id = p_board;
  if b.id is null or not can_view_board(p_board) then raise exception 'board not accessible'; end if;
  insert into tasks (org_id, project_id, department_id, title, description, owner_id, assignee_id, created_by, status, priority, due_date, source_live_room_id, tags)
  values (b.org_id, b.project_id, coalesce(b.department_id, (select department_id from profiles where id = coalesce(p_assignee, auth.uid()))), left(p_title, 200), 'From board **' || b.title || '** · /boards/' || b.id || '#' || p_element_id, auth.uid(), coalesce(p_assignee, auth.uid()), auth.uid(), 'todo', coalesce(p_priority, 'normal'), p_due, b.room_id, array['board'])
  returning id into tid;
  return tid;
end $$;

/** Board → project: create a project from a planning board (frames = milestones, stickies = tasks). */
create or replace function board_to_project(p_board uuid, p_name text, p_due date default null, p_items jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare b boards%rowtype; pid uuid; it jsonb; i int := 0;
begin
  select * into b from boards where id = p_board;
  if b.id is null or not can_view_board(p_board) then raise exception 'board not accessible'; end if;
  if not is_lead_plus() then raise exception 'Only leads and above can create projects'; end if;
  insert into projects (org_id, name, description, department_id, owner_id, status, due_date, created_by)
  values (b.org_id, left(p_name, 120), 'Created from board ' || b.title || ' (/boards/' || b.id || ')', coalesce(b.department_id, current_department()), auth.uid(), 'planning', p_due, auth.uid()) returning id into pid;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into tasks (org_id, project_id, department_id, title, description, owner_id, assignee_id, created_by, status, priority, due_date, position, tags)
    values (b.org_id, pid, coalesce(b.department_id, current_department()), left(it->>'title', 200), coalesce(it->>'description', ''), auth.uid(), nullif(it->>'assignee_id','')::uuid, auth.uid(), (case when i = 0 then 'todo' else 'backlog' end)::task_status, coalesce((it->>'priority')::task_priority, 'normal'), nullif(it->>'due','')::timestamptz, i, array['board']);
    i := i + 1;
  end loop;
  update boards set project_id = pid where id = p_board and project_id is null;
  return pid;
end $$;

create or replace function live_doc_snapshot(p_doc uuid, p_label text default null) returns int
language plpgsql security definer set search_path = public as $$
declare d live_docs%rowtype;
begin
  select * into d from live_docs where id = p_doc;
  if d.id is null or not can_view_live_doc(p_doc) then raise exception 'doc not accessible'; end if;
  insert into live_doc_versions (doc_id, version, body, label, created_by) values (p_doc, d.version, d.body, p_label, auth.uid());
  return d.version;
end $$;

create or replace function live_doc_task(p_doc uuid, p_text text, p_assignee uuid default null, p_due timestamptz default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare d live_docs%rowtype; tid uuid;
begin
  select * into d from live_docs where id = p_doc;
  if d.id is null or not can_view_live_doc(p_doc) then raise exception 'doc not accessible'; end if;
  insert into tasks (org_id, project_id, department_id, title, description, owner_id, assignee_id, created_by, status, priority, due_date, source_live_room_id, source_meeting_id, tags)
  values (d.org_id, d.project_id, coalesce(d.department_id, (select department_id from profiles where id = coalesce(p_assignee, auth.uid()))), left(p_text, 200), 'From document **' || d.title || '** · /docs/' || d.id, auth.uid(), coalesce(p_assignee, auth.uid()), auth.uid(), 'todo', 'normal', p_due, d.room_id, d.meeting_id, array['doc'])
  returning id into tid;
  return tid;
end $$;

/** Meeting → knowledge entry (draft, owner approves) */
create or replace function live_to_knowledge(p_title text, p_body text, p_kind text default 'guide', p_room uuid default null, p_recording uuid default null, p_department uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare kid uuid; o uuid := current_org();
begin
  if not is_active_member() then raise exception 'forbidden'; end if;
  insert into ai_knowledge (org_id, title, body, kind, status, classification, owner_id, department_id, source_type, source_id, recording_id, tags)
  values (o, left(p_title, 200), p_body, p_kind, 'draft', 'internal', auth.uid(), coalesce(p_department, current_department()), case when p_recording is not null then 'recording' else 'live_room' end, coalesce(p_recording, p_room), p_recording, array['live'])
  returning id into kid;
  if p_recording is not null then update live_recordings set knowledge_id = kid where id = p_recording; end if;
  return kid;
end $$;

/** Smart nudges: is this chat getting complicated? (used by the "Start a 5-minute huddle?" recommendation) */
create or replace function huddle_suggestion(p_channel uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare n int; authors int; live uuid;
begin
  if not can_view_channel(p_channel) then return '{}'::jsonb; end if;
  select count(*), count(distinct author_id) into n, authors from messages where channel_id = p_channel and created_at > now() - interval '20 minutes' and deleted_at is null and kind <> 'system';
  select live_room_id into live from channels where id = p_channel;
  return jsonb_build_object('messages_20m', n, 'authors', authors, 'live_room_id', live, 'suggest', live is null and n >= 12 and authors >= 2);
end $$;

/** Governance: what is live right now (metadata only — never content). */
create or replace function live_governance() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_admin() or has_admin_perm('communication.manage')) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'active', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'kind', r.kind, 'host', person_name(r.host_id), 'department', (select name from departments where id = r.department_id), 'project', (select name from projects where id = r.project_id), 'started_at', r.started_at, 'minutes', extract(epoch from (now() - r.started_at))::int / 60, 'participants', (select count(*) from live_participants lp where lp.room_id = r.id and lp.left_at is null and lp.role not in ('waiting','removed')), 'locked', r.locked, 'confidential', r.confidential, 'guests', (select count(*) from live_guest_links g where g.room_id = r.id and not g.revoked and g.expires_at > now())) order by r.started_at desc), '[]')
                 from live_rooms r where r.org_id = current_org() and r.status = 'live'),
    'today', jsonb_build_object(
      'rooms', (select count(*) from live_rooms where org_id = current_org() and started_at > date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'),
      'minutes', (select coalesce(sum(extract(epoch from (coalesce(ended_at, now()) - started_at))::int / 60), 0) from live_rooms where org_id = current_org() and started_at > date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'),
      'recordings', (select count(*) from live_recordings where org_id = current_org() and created_at > date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'),
      'guest_links', (select count(*) from live_guest_links where org_id = current_org() and created_at > date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')),
    'audit', (select coalesce(jsonb_agg(jsonb_build_object('at', a.created_at, 'action', a.action, 'actor', person_name(a.actor_id), 'summary', a.summary, 'entity_id', a.entity_id) order by a.created_at desc), '[]') from (select * from audit_logs where org_id = current_org() and action like 'live.%' order by created_at desc limit 50) a),
    'policies', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from collab_policies p where p.org_id = current_org())
  );
end $$;

create or replace function set_collab_policy(p_scope text, p_department uuid, p_role role_level, p_values jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare o uuid := current_org(); pid uuid;
begin
  if not (is_admin() or has_admin_perm('communication.manage')) then raise exception 'forbidden'; end if;
  select id into pid from collab_policies where org_id = o and scope = p_scope and (p_scope = 'default' or (p_scope = 'department' and department_id = p_department) or (p_scope = 'role' and role = p_role));
  if pid is null then
    insert into collab_policies (org_id, scope, department_id, role, updated_by) values (o, p_scope, case when p_scope = 'department' then p_department end, case when p_scope = 'role' then p_role end, auth.uid()) returning id into pid;
  end if;
  update collab_policies set
    can_start_calls = coalesce((p_values->>'can_start_calls')::boolean, can_start_calls),
    can_video = coalesce((p_values->>'can_video')::boolean, can_video),
    can_record = coalesce((p_values->>'can_record')::boolean, can_record),
    can_share_screen = coalesce((p_values->>'can_share_screen')::boolean, can_share_screen),
    can_whiteboard = coalesce((p_values->>'can_whiteboard')::boolean, can_whiteboard),
    can_invite_guests = coalesce((p_values->>'can_invite_guests')::boolean, can_invite_guests),
    can_remote_assist = coalesce((p_values->>'can_remote_assist')::boolean, can_remote_assist),
    can_create_public_rooms = coalesce((p_values->>'can_create_public_rooms')::boolean, can_create_public_rooms),
    can_townhall = coalesce((p_values->>'can_townhall')::boolean, can_townhall),
    recording_retention_days = case when p_values ? 'recording_retention_days' then nullif(p_values->>'recording_retention_days','')::int else recording_retention_days end,
    confidential_default = coalesce((p_values->>'confidential_default')::boolean, confidential_default),
    updated_by = auth.uid(), updated_at = now()
  where id = pid;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, new_value) values (o, auth.uid(), 'live.policy_changed', 'collab_policy', pid, p_scope, p_values);
  return pid;
end $$;

create or replace function delete_collab_policy(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_admin() or has_admin_perm('communication.manage')) then raise exception 'forbidden'; end if;
  delete from collab_policies where id = p_id and org_id = current_org() and scope <> 'default';
end $$;

/** Housekeeping cron: end idle rooms, expire recordings by retention, archive temp rooms when the request is resolved. */
create or replace function live_tick() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; m int; rec record;
begin
  -- rooms with nobody inside for 2 hours end (persistent rooms go back to 'open')
  for rec in select id, persistent from live_rooms where status = 'live' and last_active_at < now() - interval '2 hours'
            and not exists (select 1 from live_participants lp where lp.room_id = live_rooms.id and lp.left_at is null and lp.role not in ('waiting','removed')) loop
    update live_rooms set status = case when rec.persistent then 'open' else 'ended' end, ended_at = case when rec.persistent then null else now() end where id = rec.id;
    update channels set live_room_id = null where live_room_id = rec.id;
    n := n + 1;
  end loop;
  update profiles p set presence = coalesce(presence_before_live, 'available'), presence_before_live = null, live_room_id = null, live_state = null
    where live_room_id is not null and not exists (select 1 from live_rooms lr where lr.id = p.live_room_id and lr.status = 'live');
  update live_invites set status = 'missed', responded_at = now() where status = 'pending' and created_at < now() - interval '90 seconds';
  update live_recordings set status = 'expired' where status = 'ready' and expires_at is not null and expires_at < now(); get diagnostics m = row_count; n := n + m;
  update live_recordings set status = 'expired' from collab_policies cp where cp.org_id = live_recordings.org_id and cp.scope = 'default' and cp.recording_retention_days is not null and live_recordings.status = 'ready' and live_recordings.expires_at is null and live_recordings.created_at < now() - make_interval(days => cp.recording_retention_days); get diagnostics m = row_count; n := n + m;
  update live_rooms set status = 'archived' from help_requests h where live_rooms.help_request_id = h.id and h.status in ('completed','declined') and live_rooms.status in ('open','ended'); get diagnostics m = row_count; n := n + m;
  return n;
end $$;

-- Search: rooms, boards, recordings, docs
create or replace function search_all(q text, lim int default 8)
returns table(kind text, id uuid, title text, subtitle text, link text, rank real)
language plpgsql stable security definer set search_path = public, extensions as $$
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
     from files f where f.org_id = current_org() and can_view_classification(f.classification) and (f.project_id is null or can_view_project(f.project_id)) and (f.name ilike qq or q = any(f.tags))
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
     from wiki_pages w where w.org_id = current_org() and can_view_classification(w.classification) and (w.title ilike qq or w.body ilike qq)
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
end $$;

-- ----------------------------------------------------------------------------
-- Triggers: invites → notifications; board/doc mentions → notifications; recording shares
-- ----------------------------------------------------------------------------
create or replace function live_invite_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare r live_rooms%rowtype; ttl text;
begin
  select * into r from live_rooms where id = new.room_id;
  ttl := case new.kind when 'ring' then '📞 ' || person_name(new.from_user) || ' is calling you' when 'knock' then '🚪 ' || person_name(new.from_user) || ' wants to talk' when 'request_share' then '🖥️ ' || person_name(new.from_user) || ' asks you to share your screen' else '🎥 ' || person_name(new.from_user) || ' invited you: ' || r.title end;
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
  values (new.to_user, (case when new.kind in ('ring','knock') then 'action_required' else 'information' end)::notification_kind, ttl, coalesce(new.message, r.title), '/live/' || new.room_id || '?invite=' || new.id, 'live_room', new.room_id, new.from_user);
  return new;
end $$;
drop trigger if exists live_invites_notify on live_invites;
create trigger live_invites_notify after insert on live_invites for each row execute function live_invite_notify();

create or replace function board_comment_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare b boards%rowtype; u uuid;
begin
  select * into b from boards where id = new.board_id;
  for u in select distinct x from unnest(new.mentions) x where x <> coalesce(new.author_id, '00000000-0000-0000-0000-000000000000') loop
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (u, 'mention', person_name(new.author_id) || ' mentioned you on board ' || b.title, left(new.body, 200), '/boards/' || b.id || case when new.element_id is not null then '#' || new.element_id else '' end, 'board', b.id, new.author_id);
  end loop;
  if b.owner_id is not null and b.owner_id <> coalesce(new.author_id, '00000000-0000-0000-0000-000000000000') and not (b.owner_id = any(new.mentions)) then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (b.owner_id, 'information', person_name(new.author_id) || ' commented on ' || b.title, left(new.body, 200), '/boards/' || b.id, 'board', b.id, new.author_id);
  end if;
  return new;
end $$;
drop trigger if exists board_comments_notify on board_comments;
create trigger board_comments_notify after insert on board_comments for each row execute function board_comment_notify();

create or replace function live_doc_comment_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare d live_docs%rowtype; u uuid;
begin
  select * into d from live_docs where id = new.doc_id;
  for u in select distinct x from unnest(new.mentions) x where x <> coalesce(new.author_id, '00000000-0000-0000-0000-000000000000') loop
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (u, 'mention', person_name(new.author_id) || ' mentioned you in ' || d.title, left(new.body, 200), '/docs/' || d.id, 'live_doc', d.id, new.author_id);
  end loop;
  return new;
end $$;
drop trigger if exists live_doc_comments_notify on live_doc_comments;
create trigger live_doc_comments_notify after insert on live_doc_comments for each row execute function live_doc_comment_notify();

create or replace function live_recording_share_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if tg_op = 'UPDATE' and new.access = 'selected' and new.access_ids <> old.access_ids then
    for u in select distinct x from unnest(new.access_ids) x where x <> new.owner_id and not (x = any(old.access_ids)) loop
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (u, 'information', person_name(new.owner_id) || ' shared a recording: ' || new.title, coalesce(new.summary->>'summary', ''), '/recordings/' || new.id, 'recording', new.id, new.owner_id);
    end loop;
  end if;
  if tg_op = 'INSERT' and new.kind = 'video_note' and new.channel_id is null and new.access = 'selected' then
    for u in select distinct x from unnest(new.access_ids) x where x <> new.owner_id loop
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (u, 'information', person_name(new.owner_id) || ' sent you a video note', new.title, '/recordings/' || new.id, 'recording', new.id, new.owner_id);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists live_recordings_share on live_recordings;
create trigger live_recordings_share after insert or update of access_ids on live_recordings for each row execute function live_recording_share_notify();

-- Activity on help requests: when a request completes, the temporary room archives (also handled by live_tick)
create or replace function help_request_live_archive() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('completed','declined') and old.status not in ('completed','declined') and new.live_room_id is not null then
    update live_rooms set status = 'archived', ended_at = coalesce(ended_at, now()) where id = new.live_room_id;
    update channels set live_room_id = null where live_room_id = new.live_room_id;
  end if;
  return new;
end $$;
drop trigger if exists help_requests_live_archive on help_requests;
create trigger help_requests_live_archive after update of status on help_requests for each row execute function help_request_live_archive();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table live_rooms enable row level security;
alter table live_participants enable row level security;
alter table live_events enable row level security;
alter table live_invites enable row level security;
alter table live_guest_links enable row level security;
alter table live_notes enable row level security;
alter table live_transcripts enable row level security;
alter table live_polls enable row level security;
alter table live_questions enable row level security;
alter table live_recordings enable row level security;
alter table live_recording_replies enable row level security;
alter table boards enable row level security;
alter table board_versions enable row level security;
alter table board_comments enable row level security;
alter table board_access_log enable row level security;
alter table live_docs enable row level security;
alter table live_doc_versions enable row level security;
alter table live_doc_comments enable row level security;
alter table collab_favorites enable row level security;
alter table collab_policies enable row level security;

drop policy if exists lr_read on live_rooms;
create policy lr_read on live_rooms for select to authenticated using (org_id = current_org() and (host_id = auth.uid() or created_by = auth.uid() or can_view_live_room(id)));
drop policy if exists lr_update on live_rooms;
create policy lr_update on live_rooms for update to authenticated using (org_id = current_org() and is_live_host(id)) with check (org_id = current_org());

drop policy if exists lp_read on live_participants;
create policy lp_read on live_participants for select to authenticated using (can_view_live_room(room_id));
drop policy if exists lp_self on live_participants;
create policy lp_self on live_participants for update to authenticated using (user_id = auth.uid() or is_live_host(room_id)) with check (user_id = auth.uid() or is_live_host(room_id));

drop policy if exists le_read on live_events;
create policy le_read on live_events for select to authenticated using (org_id = current_org() and can_view_live_room(room_id));
drop policy if exists le_insert on live_events;
create policy le_insert on live_events for insert to authenticated with check (org_id = current_org() and can_view_live_room(room_id) and actor_id = auth.uid());

drop policy if exists li_read on live_invites;
create policy li_read on live_invites for select to authenticated using (org_id = current_org() and (to_user = auth.uid() or from_user = auth.uid() or is_live_host(room_id)));
drop policy if exists li_update on live_invites;
create policy li_update on live_invites for update to authenticated using (to_user = auth.uid() or from_user = auth.uid()) with check (to_user = auth.uid() or from_user = auth.uid());

drop policy if exists lg_read on live_guest_links;
create policy lg_read on live_guest_links for select to authenticated using (org_id = current_org() and (created_by = auth.uid() or is_live_host(room_id)));
drop policy if exists lg_update on live_guest_links;
create policy lg_update on live_guest_links for update to authenticated using (org_id = current_org() and (created_by = auth.uid() or is_live_host(room_id))) with check (org_id = current_org());

drop policy if exists ln_read on live_notes;
create policy ln_read on live_notes for select to authenticated using (org_id = current_org() and can_view_live_room(room_id));
drop policy if exists ln_write on live_notes;
create policy ln_write on live_notes for all to authenticated using (org_id = current_org() and can_view_live_room(room_id)) with check (org_id = current_org() and can_view_live_room(room_id));

drop policy if exists lt_read on live_transcripts;
create policy lt_read on live_transcripts for select to authenticated using (org_id = current_org() and ((room_id is not null and can_view_live_room(room_id)) or (recording_id is not null and can_view_recording(recording_id))));
drop policy if exists lt_insert on live_transcripts;
create policy lt_insert on live_transcripts for insert to authenticated with check (org_id = current_org() and ((room_id is not null and can_view_live_room(room_id)) or (recording_id is not null and exists (select 1 from live_recordings r where r.id = recording_id and r.owner_id = auth.uid()))));
drop policy if exists lt_delete on live_transcripts;
create policy lt_delete on live_transcripts for delete to authenticated using (org_id = current_org() and (speaker_id = auth.uid() or (room_id is not null and is_live_host(room_id)) or (recording_id is not null and exists (select 1 from live_recordings r where r.id = recording_id and r.owner_id = auth.uid()))));

drop policy if exists lpo_read on live_polls;
create policy lpo_read on live_polls for select to authenticated using (org_id = current_org() and ((room_id is not null and can_view_live_room(room_id)) or (board_id is not null and can_view_board(board_id))));
drop policy if exists lpo_write on live_polls;
create policy lpo_write on live_polls for all to authenticated using (org_id = current_org() and ((room_id is not null and can_view_live_room(room_id)) or (board_id is not null and can_view_board(board_id)))) with check (org_id = current_org() and ((room_id is not null and can_view_live_room(room_id)) or (board_id is not null and can_view_board(board_id))));

drop policy if exists lq_read on live_questions;
create policy lq_read on live_questions for select to authenticated using (org_id = current_org() and can_view_live_room(room_id));
drop policy if exists lq_write on live_questions;
create policy lq_write on live_questions for all to authenticated using (org_id = current_org() and can_view_live_room(room_id)) with check (org_id = current_org() and can_view_live_room(room_id));

drop policy if exists rec_read on live_recordings;
create policy rec_read on live_recordings for select to authenticated using (org_id = current_org() and (owner_id = auth.uid() or can_view_recording(id)));
drop policy if exists rec_insert on live_recordings;
create policy rec_insert on live_recordings for insert to authenticated with check (org_id = current_org() and owner_id = auth.uid() and collab_can('record'));
drop policy if exists rec_update on live_recordings;
create policy rec_update on live_recordings for update to authenticated using (org_id = current_org() and (owner_id = auth.uid() or has_admin_perm('communication.manage'))) with check (org_id = current_org());
drop policy if exists rec_delete on live_recordings;
create policy rec_delete on live_recordings for delete to authenticated using (org_id = current_org() and (owner_id = auth.uid() or is_admin()));

drop policy if exists rr_read on live_recording_replies;
create policy rr_read on live_recording_replies for select to authenticated using (can_view_recording(recording_id));
drop policy if exists rr_write on live_recording_replies;
create policy rr_write on live_recording_replies for insert to authenticated with check (can_view_recording(recording_id) and author_id = auth.uid());

drop policy if exists bd_read on boards;
-- NOTE: INSERT ... RETURNING (supabase-js .insert().select()) re-checks the SELECT policy, and a STABLE
-- helper cannot see the row the current command just inserted — so every read policy needs a direct owner branch.
create policy bd_read on boards for select to authenticated using (org_id = current_org() and (owner_id = auth.uid() or created_by = auth.uid() or can_view_board(id)));
drop policy if exists bd_insert on boards;
create policy bd_insert on boards for insert to authenticated with check (org_id = current_org() and is_active_member() and collab_can('whiteboard') and (owner_id = auth.uid() or created_by = auth.uid()));
drop policy if exists bd_update on boards;
create policy bd_update on boards for update to authenticated using (org_id = current_org() and can_edit_board(id)) with check (org_id = current_org());
drop policy if exists bd_delete on boards;
create policy bd_delete on boards for delete to authenticated using (org_id = current_org() and (owner_id = auth.uid() or is_admin()));

drop policy if exists bv_read on board_versions;
create policy bv_read on board_versions for select to authenticated using (can_view_board(board_id));
drop policy if exists bv_insert on board_versions;
create policy bv_insert on board_versions for insert to authenticated with check (can_view_board(board_id));

drop policy if exists bc_read on board_comments;
create policy bc_read on board_comments for select to authenticated using (can_view_board(board_id));
drop policy if exists bc_write on board_comments;
create policy bc_write on board_comments for all to authenticated using (can_view_board(board_id) and (author_id = auth.uid() or is_manager_plus() or exists (select 1 from boards b where b.id = board_id and b.owner_id = auth.uid()))) with check (can_view_board(board_id));

drop policy if exists bal_read on board_access_log;
create policy bal_read on board_access_log for select to authenticated using (exists (select 1 from boards b where b.id = board_id and (b.owner_id = auth.uid() or is_manager_plus())));
drop policy if exists bal_insert on board_access_log;
create policy bal_insert on board_access_log for insert to authenticated with check (can_view_board(board_id) and actor_id = auth.uid());

drop policy if exists ld_read on live_docs;
create policy ld_read on live_docs for select to authenticated using (org_id = current_org() and (owner_id = auth.uid() or created_by = auth.uid() or can_view_live_doc(id)));
drop policy if exists ld_insert on live_docs;
create policy ld_insert on live_docs for insert to authenticated with check (org_id = current_org() and is_active_member() and (owner_id = auth.uid() or created_by = auth.uid()));
drop policy if exists ld_update on live_docs;
create policy ld_update on live_docs for update to authenticated using (org_id = current_org() and can_view_live_doc(id)) with check (org_id = current_org());
drop policy if exists ld_delete on live_docs;
create policy ld_delete on live_docs for delete to authenticated using (org_id = current_org() and (owner_id = auth.uid() or is_admin()));

drop policy if exists ldv_read on live_doc_versions;
create policy ldv_read on live_doc_versions for select to authenticated using (can_view_live_doc(doc_id));
drop policy if exists ldv_insert on live_doc_versions;
create policy ldv_insert on live_doc_versions for insert to authenticated with check (can_view_live_doc(doc_id));

drop policy if exists ldc_read on live_doc_comments;
create policy ldc_read on live_doc_comments for select to authenticated using (can_view_live_doc(doc_id));
drop policy if exists ldc_write on live_doc_comments;
create policy ldc_write on live_doc_comments for all to authenticated using (can_view_live_doc(doc_id)) with check (can_view_live_doc(doc_id));

drop policy if exists cf_self on collab_favorites;
create policy cf_self on collab_favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists cp_read on collab_policies;
create policy cp_read on collab_policies for select to authenticated using (org_id = current_org());

-- Storage bucket for recordings (500 MB per file; access is enforced on live_recordings rows, paths are unguessable)
insert into storage.buckets (id, name, public, file_size_limit) values ('live', 'live', false, 524288000) on conflict (id) do update set file_size_limit = excluded.file_size_limit;
drop policy if exists live_bucket_read on storage.objects;
create policy live_bucket_read on storage.objects for select to authenticated using (bucket_id = 'live' and is_active_member());
drop policy if exists live_bucket_write on storage.objects;
create policy live_bucket_write on storage.objects for insert to authenticated with check (bucket_id = 'live' and is_active_member());
drop policy if exists live_bucket_update on storage.objects;
create policy live_bucket_update on storage.objects for update to authenticated using (bucket_id = 'live' and owner = auth.uid());
drop policy if exists live_bucket_delete on storage.objects;
create policy live_bucket_delete on storage.objects for delete to authenticated using (bucket_id = 'live' and (owner = auth.uid() or is_admin()));

-- Realtime
do $$ begin
  alter publication supabase_realtime add table live_rooms, live_participants, live_invites, live_notes, live_polls, live_questions, live_recordings, boards, board_comments, live_docs, live_doc_comments, live_events;
exception when duplicate_object then null; end $$;

-- Screens (governed routes)
insert into screens (key, label, path, grp, default_min_level, external_ok, admin_only, description, position) values
 ('live','GHL LIVE','/live','work','guest',true,false,'Live rooms: calls, huddles, screen share, meetings',19),
 ('boards','Boards','/boards','work','guest',true,false,'Collaborative whiteboards',20),
 ('recordings','Recordings','/recordings','work','guest',true,false,'Screen recordings, video notes and meeting recordings',21),
 ('docs','Live docs','/docs','work','guest',true,false,'Collaborative documents and meeting notes',22)
on conflict (key) do nothing;

-- Default policy + department defaults from the spec (IT: remote assistance, limited recording; Design: boards/video review; Sales: external guests)
insert into collab_policies (org_id, scope, can_invite_guests, can_remote_assist, can_create_public_rooms, can_townhall, recording_retention_days, updated_by)
select id, 'default', false, false, false, false, null, null from organizations on conflict do nothing;
insert into collab_policies (org_id, scope, department_id, can_remote_assist, can_invite_guests, can_record)
select d.org_id, 'department', d.id, true, false, true from departments d where d.slug = 'technology' on conflict do nothing;
insert into collab_policies (org_id, scope, department_id, can_invite_guests)
select d.org_id, 'department', d.id, true from departments d where d.slug in ('sales','bizdev','investor-relations') on conflict do nothing;
insert into collab_policies (org_id, scope, department_id, can_invite_guests)
select d.org_id, 'department', d.id, true from departments d where d.slug = 'support' on conflict do nothing;
insert into collab_policies (org_id, scope, role, can_invite_guests, can_create_public_rooms, can_townhall, can_remote_assist)
select o.id, 'role', r, true, true, true, true from organizations o, unnest(array['super_admin','director','executive','department_head']::role_level[]) r on conflict do nothing;
insert into collab_policies (org_id, scope, role, can_record, can_invite_guests)
select o.id, 'role', r, false, false from organizations o, unnest(array['intern','vendor','guest']::role_level[]) r on conflict do nothing;

-- Board templates (system templates are stored as boards with kind 'shared' + template_key + owner null; the client also has built-in ones)
-- (Templates are shipped in the client: brainstorm, project planning, flowchart, org chart, customer journey, mind map, process map,
--  sprint planning, retrospective, incident analysis, architecture diagram, incident timeline, API flow, pitch planning, account planning,
--  objection map, root cause analysis, moodboard, user flow, onboarding journey.)

-- Grants
grant execute on function collab_can(text, uuid), can_view_live_room(uuid), is_live_host(uuid, uuid), can_view_board(uuid), can_edit_board(uuid), can_view_live_doc(uuid), can_view_recording(uuid), is_internal_user(uuid),
  start_live_room(text, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid[], jsonb, boolean, text, uuid), join_live_room(uuid, text), leave_live_room(uuid), set_live_state(text), end_live_room(uuid, text),
  live_moderate(uuid, uuid, text, text), live_raise_hand(uuid, boolean), live_invite(uuid, uuid, text, text), live_invite_department(uuid, uuid, text), respond_live_invite(uuid, text), call_person(uuid, boolean), knock(uuid, text),
  live_room_task(uuid, text, uuid, timestamptz, task_priority, text, jsonb), live_room_decision(uuid, text, text, text), live_bookmark(uuid, text, int), live_running_late(uuid, int),
  create_breakouts(uuid, jsonb), end_breakouts(uuid), live_guest_link(uuid, text, text, int), live_history(text, uuid),
  board_snapshot(uuid, text), board_restore(uuid, uuid), board_element_task(uuid, text, text, uuid, timestamptz, task_priority), board_to_project(uuid, text, date, jsonb),
  live_doc_snapshot(uuid, text), live_doc_task(uuid, text, uuid, timestamptz), live_to_knowledge(text, text, text, uuid, uuid, uuid), huddle_suggestion(uuid), live_governance(), set_collab_policy(text, uuid, role_level, jsonb), delete_collab_policy(uuid)
  to authenticated;
revoke execute on function start_live_room(text, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid[], jsonb, boolean, text, uuid), join_live_room(uuid, text), end_live_room(uuid, text), live_moderate(uuid, uuid, text, text), live_guest_link(uuid, text, text, int), live_governance(), set_collab_policy(text, uuid, role_level, jsonb), delete_collab_policy(uuid), live_room_task(uuid, text, uuid, timestamptz, task_priority, text, jsonb), live_room_decision(uuid, text, text, text), board_to_project(uuid, text, date, jsonb), live_to_knowledge(text, text, text, uuid, uuid, uuid) from anon;
-- Guest lookup/consume are anon-callable by design (token = capability)
grant execute on function live_guest_lookup(text), live_guest_consume(text, text) to anon, authenticated;
grant execute on function live_tick() to authenticated;
revoke execute on function live_tick() from anon;

-- Cron
do $$ begin
  perform cron.unschedule('ghl_live_tick');
exception when others then null; end $$;
select cron.schedule('ghl_live_tick', '*/10 * * * *', $$select live_tick()$$);
