-- GHL ONE — Phase 1 Core schema
-- Organization hierarchy, people, projects, tasks, delegation, chat, files,
-- approvals, decisions, meetings, calendar, notifications, audit.
-- Design principle: the database models the organization's relationships and
-- workflows, not the UI.

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "pg_trgm" with schema extensions;

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
create type role_level as enum (
  'super_admin','director','executive','department_head','manager',
  'team_lead','employee','intern','consultant','vendor','guest'
);
create type task_status as enum (
  'backlog','todo','in_progress','in_review','waiting','blocked','done','cancelled'
);
create type task_priority as enum ('critical','urgent','high','normal','low');
create type waiting_on as enum (
  'none','employee','manager','client','vendor','approval','blocked'
);
create type project_status as enum (
  'planning','active','on_hold','at_risk','delayed','completed','cancelled'
);
create type approval_status as enum ('pending','approved','rejected','changes_requested');
create type approval_type as enum (
  'design','content','budget','purchase','hiring','leave','vendor','marketing',
  'campaign','deployment','contract','expense','investor_material','other'
);
create type classification as enum (
  'public','internal','confidential','highly_confidential','board_only'
);
create type channel_type as enum ('dm','group','department','project','company','announcement','task');
create type notification_kind as enum (
  'critical','action_required','mention','approval','deadline','information'
);
create type event_kind as enum (
  'meeting','deadline','campaign','event','release','interview','holiday','leave',
  'publishing','client_meeting','compliance','milestone'
);
create type presence_status as enum ('available','busy','in_meeting','dnd','away','offline','leave');
create type message_kind as enum ('text','voice','file','system','video');

-- ---------------------------------------------------------------------------
-- ORGANIZATION
-- ---------------------------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  tagline text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  color text not null default '#6366f1',
  icon text,
  head_id uuid,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  name text not null,
  lead_id uuid,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- PEOPLE
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid references organizations(id) on delete set null,
  email text not null,
  full_name text not null default '',
  avatar_url text,
  designation text,
  department_id uuid references departments(id) on delete set null,
  team_id uuid references teams(id) on delete set null,
  manager_id uuid references profiles(id) on delete set null,
  role role_level not null default 'employee',
  skills text[] not null default '{}',
  phone text,
  working_hours text default '09:30–18:30 IST',
  timezone text default 'Asia/Kolkata',
  presence presence_status not null default 'offline',
  status_text text,
  is_active boolean not null default false,
  is_external boolean not null default false,
  joined_at date,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_org_idx on profiles(org_id);
create index profiles_dept_idx on profiles(department_id);
create index profiles_manager_idx on profiles(manager_id);

alter table departments add constraint departments_head_fk
  foreign key (head_id) references profiles(id) on delete set null;
alter table teams add constraint teams_lead_fk
  foreign key (lead_id) references profiles(id) on delete set null;

create table invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  full_name text,
  role role_level not null default 'employee',
  department_id uuid references departments(id) on delete set null,
  designation text,
  manager_id uuid references profiles(id) on delete set null,
  invited_by uuid references profiles(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

create table leaves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  kind text not null default 'leave',
  status approval_status not null default 'pending',
  note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- PROJECTS
-- ---------------------------------------------------------------------------
create table project_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  key text not null unique,
  name text not null,
  description text,
  department_slug text,
  tasks jsonb not null default '[]'::jsonb,
  milestones jsonb not null default '[]'::jsonb
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text,
  name text not null,
  description text,
  objectives text,
  department_id uuid references departments(id) on delete set null,
  owner_id uuid references profiles(id) on delete set null,
  status project_status not null default 'planning',
  priority task_priority not null default 'normal',
  classification classification not null default 'internal',
  start_date date,
  due_date date,
  progress int not null default 0 check (progress between 0 and 100),
  template_key text,
  client_name text,
  tags text[] not null default '{}',
  archived boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_org_idx on projects(org_id);
create index projects_dept_idx on projects(department_id);
create index projects_owner_idx on projects(owner_id);

create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member',
  added_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  completed_at timestamptz,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table project_risks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  severity task_priority not null default 'normal',
  mitigation text,
  owner_id uuid references profiles(id) on delete set null,
  resolved_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- TASKS (Universal Task Engine)
-- ---------------------------------------------------------------------------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  department_id uuid references departments(id) on delete set null,
  parent_id uuid references tasks(id) on delete cascade,
  milestone_id uuid references milestones(id) on delete set null,
  title text not null,
  description text,
  owner_id uuid references profiles(id) on delete set null,       -- accountable
  assignee_id uuid references profiles(id) on delete set null,    -- responsible
  delegated_by uuid references profiles(id) on delete set null,
  approver_id uuid references profiles(id) on delete set null,
  status task_status not null default 'todo',
  priority task_priority not null default 'normal',
  waiting_on waiting_on not null default 'none',
  waiting_on_user_id uuid references profiles(id) on delete set null,
  waiting_note text,
  start_date date,
  due_date timestamptz,
  completed_at timestamptz,
  estimated_hours numeric(6,2),
  actual_hours numeric(6,2),
  tags text[] not null default '{}',
  requires_approval boolean not null default false,
  source_message_id uuid,
  source_meeting_id uuid,
  recurrence jsonb,
  position int not null default 0,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_org_idx on tasks(org_id);
create index tasks_project_idx on tasks(project_id);
create index tasks_assignee_idx on tasks(assignee_id);
create index tasks_owner_idx on tasks(owner_id);
create index tasks_status_idx on tasks(status);
create index tasks_due_idx on tasks(due_date);
create index tasks_parent_idx on tasks(parent_id);
create index tasks_title_trgm on tasks using gin (title gin_trgm_ops);

create table task_collaborators (
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (task_id, user_id)
);

create table task_dependencies (
  task_id uuid not null references tasks(id) on delete cascade,
  depends_on_id uuid not null references tasks(id) on delete cascade,
  primary key (task_id, depends_on_id),
  check (task_id <> depends_on_id)
);

create table task_checklist (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  label text not null,
  done boolean not null default false,
  position int not null default 0
);

create table task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on task_comments(task_id);

create table task_history (
  id bigint generated always as identity primary key,
  task_id uuid not null references tasks(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  field text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);
create index task_history_task_idx on task_history(task_id);

create table task_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  description text,
  department_slug text,
  priority task_priority not null default 'normal',
  checklist jsonb not null default '[]'::jsonb,
  subtasks jsonb not null default '[]'::jsonb,
  estimated_hours numeric(6,2)
);

-- ---------------------------------------------------------------------------
-- CHAT
-- ---------------------------------------------------------------------------
create table channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  type channel_type not null default 'group',
  name text not null,
  slug text,
  description text,
  department_id uuid references departments(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  is_private boolean not null default false,
  is_readonly boolean not null default false,
  classification classification not null default 'internal',
  dm_key text,
  created_by uuid references profiles(id) on delete set null,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index channels_dm_key_idx on channels(org_id, dm_key) where dm_key is not null;
create unique index channels_slug_idx on channels(org_id, slug) where slug is not null;

create table channel_members (
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member',
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index channel_members_user_idx on channel_members(user_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  parent_id uuid references messages(id) on delete cascade,
  kind message_kind not null default 'text',
  body text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  mentions uuid[] not null default '{}',
  is_pinned boolean not null default false,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_channel_idx on messages(channel_id, created_at desc);
create index messages_parent_idx on messages(parent_id);
create index messages_body_trgm on messages using gin (body gin_trgm_ops);

create table message_reactions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  primary key (message_id, user_id, emoji)
);

alter table tasks add constraint tasks_source_message_fk
  foreign key (source_message_id) references messages(id) on delete set null;

-- ---------------------------------------------------------------------------
-- FILES & KNOWLEDGE
-- ---------------------------------------------------------------------------
create table files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  folder text not null default 'General',
  project_id uuid references projects(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  task_id uuid references tasks(id) on delete set null,
  classification classification not null default 'internal',
  owner_id uuid references profiles(id) on delete set null,
  current_version int not null default 1,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index files_project_idx on files(project_id);
create index files_name_trgm on files using gin (name gin_trgm_ops);

create table file_versions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references files(id) on delete cascade,
  version int not null,
  storage_path text not null,
  size_bytes bigint,
  mime_type text,
  uploaded_by uuid references profiles(id) on delete set null,
  note text,
  approval_status approval_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (file_id, version)
);

create table wiki_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  slug text not null,
  body text not null default '',
  category text not null default 'General',
  department_id uuid references departments(id) on delete set null,
  classification classification not null default 'internal',
  author_id uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);
create index wiki_body_trgm on wiki_pages using gin (body gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- MEETINGS & DECISIONS
-- ---------------------------------------------------------------------------
create table meetings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  project_id uuid references projects(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  organizer_id uuid references profiles(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  meeting_link text,
  agenda text,
  notes text,
  recording_url text,
  transcript text,
  summary text,
  created_at timestamptz not null default now()
);
create index meetings_starts_idx on meetings(starts_at);

create table meeting_participants (
  meeting_id uuid not null references meetings(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (meeting_id, user_id)
);

create table meeting_actions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  title text not null,
  owner_id uuid references profiles(id) on delete set null,
  due_date date,
  task_id uuid references tasks(id) on delete set null,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table tasks add constraint tasks_source_meeting_fk
  foreign key (source_meeting_id) references meetings(id) on delete set null;

create table decisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  decision text not null,
  reason text,
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz not null default now(),
  project_id uuid references projects(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  meeting_id uuid references meetings(id) on delete set null,
  message_id uuid references messages(id) on delete set null,
  channel_id uuid references channels(id) on delete set null,
  participants uuid[] not null default '{}',
  follow_up text,
  classification classification not null default 'internal',
  created_at timestamptz not null default now()
);
create index decisions_project_idx on decisions(project_id);

-- ---------------------------------------------------------------------------
-- APPROVALS
-- ---------------------------------------------------------------------------
create table approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  type approval_type not null default 'other',
  title text not null,
  description text,
  requested_by uuid references profiles(id) on delete set null,
  approver_id uuid references profiles(id) on delete set null,
  delegated_from uuid references profiles(id) on delete set null,
  status approval_status not null default 'pending',
  priority task_priority not null default 'normal',
  task_id uuid references tasks(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  file_id uuid references files(id) on delete set null,
  amount numeric(14,2),
  due_date timestamptz,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create index approvals_approver_idx on approvals(approver_id, status);
create index approvals_requester_idx on approvals(requested_by);

create table approval_events (
  id bigint generated always as identity primary key,
  approval_id uuid not null references approvals(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- CALENDAR, ANNOUNCEMENTS, NOTIFICATIONS
-- ---------------------------------------------------------------------------
create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind event_kind not null default 'event',
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  project_id uuid references projects(id) on delete cascade,
  department_id uuid references departments(id) on delete set null,
  user_id uuid references profiles(id) on delete cascade,
  meeting_id uuid references meetings(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index calendar_events_starts_idx on calendar_events(starts_at);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  body text not null,
  author_id uuid references profiles(id) on delete set null,
  kind text not null default 'update',
  mandatory boolean not null default false,
  pinned boolean not null default false,
  department_ids uuid[] not null default '{}',
  published_at timestamptz not null default now(),
  expires_at timestamptz
);

create table announcement_acks (
  announcement_id uuid not null references announcements(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  acked_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind notification_kind not null default 'information',
  title text not null,
  body text,
  link text,
  entity_type text,
  entity_id uuid,
  actor_id uuid references profiles(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, read_at, created_at desc);

create table ideas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  body text,
  author_id uuid references profiles(id) on delete set null,
  status text not null default 'open',
  votes int not null default 0,
  project_id uuid references projects(id) on delete set null,
  created_at timestamptz not null default now()
);
create table idea_votes (
  idea_id uuid not null references ideas(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (idea_id, user_id)
);

-- ---------------------------------------------------------------------------
-- AUDIT / ACTIVITY GRAPH
-- ---------------------------------------------------------------------------
create table audit_logs (
  id bigint generated always as identity primary key,
  org_id uuid references organizations(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  project_id uuid,
  task_id uuid,
  summary text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_project_idx on audit_logs(project_id, created_at desc);
create index audit_logs_entity_idx on audit_logs(entity_type, entity_id);
create index audit_logs_created_idx on audit_logs(created_at desc);

-- Audit rows are append-only: nobody updates or deletes them.
create or replace function audit_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end $$;
create trigger audit_logs_immutable
  before update or delete on audit_logs
  for each row execute function audit_immutable();

-- ---------------------------------------------------------------------------
-- HELPER FUNCTIONS (security definer — never recurse into RLS)
-- ---------------------------------------------------------------------------
create or replace function current_org() returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select org_id from profiles where id = auth.uid()
$$;

create or replace function current_role_level() returns role_level
language sql stable security definer set search_path = public, extensions as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function current_department() returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select department_id from profiles where id = auth.uid()
$$;

create or replace function is_active_member() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((select is_active from profiles where id = auth.uid()), false)
$$;

-- rank: lower = more senior
create or replace function role_rank(r role_level) returns int
language sql immutable as $$
  select case r
    when 'super_admin' then 0
    when 'director' then 1
    when 'executive' then 2
    when 'department_head' then 3
    when 'manager' then 4
    when 'team_lead' then 5
    when 'employee' then 6
    when 'intern' then 7
    when 'consultant' then 8
    when 'vendor' then 9
    when 'guest' then 10
  end
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(role_rank(current_role_level()) <= 2, false)
$$;

create or replace function is_manager_plus() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(role_rank(current_role_level()) <= 4, false)
$$;

create or replace function is_lead_plus() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(role_rank(current_role_level()) <= 5, false)
$$;

create or replace function is_internal() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(role_rank(current_role_level()) <= 7, false)
$$;

create or replace function is_project_member(p uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from project_members where project_id = p and user_id = auth.uid()
  ) or exists (
    select 1 from projects where id = p and (owner_id = auth.uid() or created_by = auth.uid())
  )
$$;

create or replace function can_view_classification(c classification) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select case c
    when 'public' then true
    when 'internal' then is_internal()
    when 'confidential' then role_rank(current_role_level()) <= 4
    when 'highly_confidential' then role_rank(current_role_level()) <= 2
    when 'board_only' then role_rank(current_role_level()) <= 1
  end
$$;

create or replace function can_view_project(p uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from projects pr
    where pr.id = p
      and pr.org_id = current_org()
      and (
        is_project_member(p)
        or is_admin()
        or (pr.classification in ('public','internal') and is_internal())
        or (pr.classification = 'confidential' and (
              is_manager_plus()
              or (pr.department_id is not null and pr.department_id = current_department()
                  and is_lead_plus())))
      )
  )
$$;

create or replace function is_channel_member(c uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from channel_members where channel_id = c and user_id = auth.uid())
$$;

create or replace function can_view_channel(c uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from channels ch
    where ch.id = c and ch.org_id = current_org()
      and (
        is_channel_member(c)
        or (not ch.is_private and ch.type in ('company','announcement','department','group') and is_internal())
        or (ch.type = 'project' and ch.project_id is not null and can_view_project(ch.project_id))
      )
  )
$$;

create or replace function can_view_task(t uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from tasks tk
    where tk.id = t and tk.org_id = current_org()
      and (
        tk.assignee_id = auth.uid() or tk.owner_id = auth.uid()
        or tk.created_by = auth.uid() or tk.delegated_by = auth.uid()
        or tk.approver_id = auth.uid() or tk.waiting_on_user_id = auth.uid()
        or exists (select 1 from task_collaborators tc where tc.task_id = t and tc.user_id = auth.uid())
        or (tk.project_id is not null and can_view_project(tk.project_id))
        or (tk.project_id is null and is_internal() and (
              is_manager_plus() or tk.department_id is null or tk.department_id = current_department()))
      )
  )
$$;

create or replace function can_edit_task(t uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (
    select 1 from tasks tk
    where tk.id = t and tk.org_id = current_org()
      and (
        tk.assignee_id = auth.uid() or tk.owner_id = auth.uid()
        or tk.created_by = auth.uid() or tk.delegated_by = auth.uid()
        or tk.approver_id = auth.uid()
        or exists (select 1 from task_collaborators tc where tc.task_id = t and tc.user_id = auth.uid())
        or is_manager_plus()
        or (tk.project_id is not null and is_project_member(tk.project_id))
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- TRIGGERS: profiles from auth, updated_at, history, notifications, audit
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger profiles_updated_at before update on profiles for each row execute function set_updated_at();
create trigger projects_updated_at before update on projects for each row execute function set_updated_at();
create trigger tasks_updated_at before update on tasks for each row execute function set_updated_at();
create trigger files_updated_at before update on files for each row execute function set_updated_at();
create trigger wiki_updated_at before update on wiki_pages for each row execute function set_updated_at();

-- New auth user → profile. First user ever becomes super_admin & active.
-- Otherwise, an invite for the email pre-activates with role/department;
-- else the account waits (is_active = false) for an admin to activate.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_org uuid;
  v_inv invites%rowtype;
  v_first boolean;
  v_name text;
begin
  select id into v_org from organizations order by created_at limit 1;
  select not exists (select 1 from profiles) into v_first;
  v_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));

  select * into v_inv from invites
   where lower(email) = lower(new.email) and accepted_at is null
   limit 1;

  insert into profiles (id, org_id, email, full_name, role, department_id, designation, manager_id, is_active, joined_at)
  values (
    new.id, v_org, new.email,
    coalesce(v_inv.full_name, v_name),
    case when v_first then 'super_admin'::role_level else coalesce(v_inv.role, 'employee'::role_level) end,
    v_inv.department_id,
    v_inv.designation,
    v_inv.manager_id,
    v_first or v_inv.id is not null,
    current_date
  );

  if v_inv.id is not null then
    update invites set accepted_at = now() where id = v_inv.id;
  end if;

  -- Auto-join company channels
  insert into channel_members (channel_id, user_id)
  select c.id, new.id from channels c
   where c.org_id = v_org and c.type in ('company','announcement') and not c.is_private
  on conflict do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Task history + notifications + audit on change
create or replace function task_after_change() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  actor uuid := auth.uid();
  link text;
begin
  link := '/tasks/' || new.id;
  if tg_op = 'INSERT' then
    insert into task_history (task_id, actor_id, field, old_value, new_value)
      values (new.id, actor, 'created', null, new.title);
    insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, project_id, task_id, summary, new_value)
      values (new.org_id, actor, 'task.created', 'task', new.id, new.project_id, new.id, new.title,
              jsonb_build_object('status', new.status, 'priority', new.priority, 'assignee_id', new.assignee_id));
    if new.assignee_id is not null and new.assignee_id <> coalesce(actor, '00000000-0000-0000-0000-000000000000') then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (new.assignee_id,
              case when new.priority in ('critical','urgent') then 'critical'::notification_kind else 'action_required'::notification_kind end,
              'New task assigned: ' || new.title,
              case when new.due_date is not null then 'Due ' || to_char(new.due_date at time zone 'Asia/Kolkata', 'DD Mon HH24:MI') else null end,
              link, 'task', new.id, actor);
    end if;
    if new.approver_id is not null and new.approver_id <> coalesce(actor, '00000000-0000-0000-0000-000000000000') then
      insert into notifications (user_id, kind, title, link, entity_type, entity_id, actor_id)
      values (new.approver_id, 'information', 'You are the approver for: ' || new.title, link, 'task', new.id, actor);
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into task_history (task_id, actor_id, field, old_value, new_value)
      values (new.id, actor, 'status', old.status::text, new.status::text);
    if new.status = 'done' then
      new.completed_at := coalesce(new.completed_at, now());
      -- notify owner / delegator
      insert into notifications (user_id, kind, title, link, entity_type, entity_id, actor_id)
      select u, 'information', 'Completed: ' || new.title, link, 'task', new.id, actor
        from unnest(array[new.owner_id, new.delegated_by]) as u
       where u is not null and u <> coalesce(actor, '00000000-0000-0000-0000-000000000000')
       group by u;
    end if;
    if new.status = 'blocked' and new.owner_id is not null and new.owner_id <> coalesce(actor,'00000000-0000-0000-0000-000000000000') then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (new.owner_id, 'action_required', 'Blocked: ' || new.title, new.waiting_note, link, 'task', new.id, actor);
    end if;
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into task_history (task_id, actor_id, field, old_value, new_value)
      values (new.id, actor, 'assignee', old.assignee_id::text, new.assignee_id::text);
    if new.assignee_id is not null and new.assignee_id <> coalesce(actor,'00000000-0000-0000-0000-000000000000') then
      insert into notifications (user_id, kind, title, link, entity_type, entity_id, actor_id)
      values (new.assignee_id, 'action_required', 'Task reassigned to you: ' || new.title, link, 'task', new.id, actor);
    end if;
  end if;
  if new.priority is distinct from old.priority then
    insert into task_history (task_id, actor_id, field, old_value, new_value)
      values (new.id, actor, 'priority', old.priority::text, new.priority::text);
  end if;
  if new.due_date is distinct from old.due_date then
    insert into task_history (task_id, actor_id, field, old_value, new_value)
      values (new.id, actor, 'due_date', old.due_date::text, new.due_date::text);
  end if;
  if new.waiting_on is distinct from old.waiting_on or new.waiting_on_user_id is distinct from old.waiting_on_user_id then
    insert into task_history (task_id, actor_id, field, old_value, new_value)
      values (new.id, actor, 'waiting_on', old.waiting_on::text, new.waiting_on::text || coalesce(' (' || new.waiting_note || ')', ''));
    if new.waiting_on_user_id is not null and new.waiting_on_user_id <> coalesce(actor,'00000000-0000-0000-0000-000000000000') then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (new.waiting_on_user_id, 'action_required', 'Waiting on you: ' || new.title, new.waiting_note, link, 'task', new.id, actor);
    end if;
  end if;
  if new.title is distinct from old.title then
    insert into task_history (task_id, actor_id, field, old_value, new_value)
      values (new.id, actor, 'title', old.title, new.title);
  end if;

  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, project_id, task_id, summary, old_value, new_value)
    values (new.org_id, actor, 'task.updated', 'task', new.id, new.project_id, new.id, new.title,
            jsonb_build_object('status', old.status, 'priority', old.priority, 'assignee_id', old.assignee_id, 'due_date', old.due_date, 'waiting_on', old.waiting_on),
            jsonb_build_object('status', new.status, 'priority', new.priority, 'assignee_id', new.assignee_id, 'due_date', new.due_date, 'waiting_on', new.waiting_on));
  return new;
end $$;

create trigger tasks_after_insert after insert on tasks for each row execute function task_after_change();
create trigger tasks_before_update before update on tasks for each row execute function task_after_change();

-- Unblock dependents automatically when a dependency is done
create or replace function task_dependency_release() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    update tasks t set status = 'todo', waiting_on = 'none', waiting_note = null
     where t.id in (select task_id from task_dependencies where depends_on_id = new.id)
       and t.status in ('waiting','blocked','backlog')
       and not exists (
         select 1 from task_dependencies d join tasks d2 on d2.id = d.depends_on_id
          where d.task_id = t.id and d2.status <> 'done' and d2.id <> new.id
       );
    insert into notifications (user_id, kind, title, link, entity_type, entity_id, actor_id)
    select t.assignee_id, 'action_required', 'Unblocked — you can start: ' || t.title, '/tasks/' || t.id, 'task', t.id, auth.uid()
      from tasks t
     where t.id in (select task_id from task_dependencies where depends_on_id = new.id)
       and t.assignee_id is not null;
  end if;
  return new;
end $$;
create trigger tasks_dependency_release after update on tasks for each row execute function task_dependency_release();

-- Approvals: notify approver, audit events
create or replace function approval_after_change() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into approval_events (approval_id, actor_id, action, note) values (new.id, actor, 'requested', new.description);
    if new.approver_id is not null then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (new.approver_id, 'approval', 'Approval requested: ' || new.title, new.description, '/approvals/' || new.id, 'approval', new.id, actor);
    end if;
    insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, project_id, task_id, summary, new_value)
    values (new.org_id, actor, 'approval.requested', 'approval', new.id, new.project_id, new.task_id, new.title, to_jsonb(new));
    return new;
  end if;
  if new.status is distinct from old.status then
    new.decided_at := case when new.status = 'pending' then null else now() end;
    insert into approval_events (approval_id, actor_id, action, note) values (new.id, actor, new.status::text, new.decision_note);
    if new.requested_by is not null then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (new.requested_by,
              case when new.status = 'approved' then 'information'::notification_kind else 'action_required'::notification_kind end,
              initcap(replace(new.status::text, '_', ' ')) || ': ' || new.title, new.decision_note,
              '/approvals/' || new.id, 'approval', new.id, actor);
    end if;
    if new.task_id is not null and new.status = 'approved' then
      update tasks set waiting_on = 'none', status = case when status = 'waiting' then 'in_progress' else status end
       where id = new.task_id and waiting_on = 'approval';
    end if;
    insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, project_id, task_id, summary, old_value, new_value)
    values (new.org_id, actor, 'approval.' || new.status::text, 'approval', new.id, new.project_id, new.task_id, new.title,
            jsonb_build_object('status', old.status), jsonb_build_object('status', new.status, 'note', new.decision_note));
  elsif new.approver_id is distinct from old.approver_id then
    insert into approval_events (approval_id, actor_id, action, note) values (new.id, actor, 'delegated', 'to ' || new.approver_id::text);
    if new.approver_id is not null then
      insert into notifications (user_id, kind, title, link, entity_type, entity_id, actor_id)
      values (new.approver_id, 'approval', 'Approval delegated to you: ' || new.title, '/approvals/' || new.id, 'approval', new.id, actor);
    end if;
  end if;
  return new;
end $$;
create trigger approvals_after_insert after insert on approvals for each row execute function approval_after_change();
create trigger approvals_before_update before update on approvals for each row execute function approval_after_change();

-- Messages: bump channel, notify mentions & DM recipients
create or replace function message_after_insert() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  ch channels%rowtype;
  sender_name text;
  m uuid;
begin
  select * into ch from channels where id = new.channel_id;
  update channels set last_message_at = new.created_at where id = new.channel_id;
  select full_name into sender_name from profiles where id = new.author_id;

  foreach m in array new.mentions loop
    if m <> new.author_id then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (m, 'mention', coalesce(sender_name,'Someone') || ' mentioned you in #' || ch.name,
              left(new.body, 140), '/chat/' || ch.id || '?m=' || new.id, 'message', new.id, new.author_id);
    end if;
  end loop;

  if ch.type = 'dm' then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    select cm.user_id, 'information', coalesce(sender_name,'Someone') || ' sent you a message',
           left(new.body, 140), '/chat/' || ch.id, 'message', new.id, new.author_id
      from channel_members cm
     where cm.channel_id = ch.id and cm.user_id <> new.author_id and not cm.muted
       and not (cm.user_id = any(new.mentions));
  end if;

  -- the sender has read their own message
  update channel_members set last_read_at = new.created_at where channel_id = new.channel_id and user_id = new.author_id;
  return new;
end $$;
create trigger messages_after_insert after insert on messages for each row execute function message_after_insert();

-- Project channel auto-creation + owner membership
create or replace function project_after_insert() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare cid uuid;
begin
  insert into channels (org_id, type, name, project_id, classification, created_by)
  values (new.org_id, 'project', new.name, new.id, new.classification, new.created_by)
  returning id into cid;
  if new.owner_id is not null then
    insert into project_members (project_id, user_id, role) values (new.id, new.owner_id, 'owner') on conflict do nothing;
    insert into channel_members (channel_id, user_id) values (cid, new.owner_id) on conflict do nothing;
  end if;
  if new.created_by is not null and new.created_by is distinct from new.owner_id then
    insert into project_members (project_id, user_id, role) values (new.id, new.created_by, 'member') on conflict do nothing;
    insert into channel_members (channel_id, user_id) values (cid, new.created_by) on conflict do nothing;
  end if;
  if new.due_date is not null then
    insert into calendar_events (org_id, kind, title, starts_at, all_day, project_id, created_by)
    values (new.org_id, 'deadline', new.name || ' — due', new.due_date::timestamptz, true, new.id, new.created_by);
  end if;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, project_id, summary)
  values (new.org_id, auth.uid(), 'project.created', 'project', new.id, new.id, new.name);
  return new;
end $$;
create trigger projects_after_insert after insert on projects for each row execute function project_after_insert();

-- Project members join the project channel automatically
create or replace function project_member_after_insert() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into channel_members (channel_id, user_id)
  select c.id, new.user_id from channels c where c.project_id = new.project_id and c.type = 'project'
  on conflict do nothing;
  insert into notifications (user_id, kind, title, link, entity_type, entity_id, actor_id)
  select new.user_id, 'information', 'You were added to project: ' || p.name, '/projects/' || p.id, 'project', p.id, auth.uid()
    from projects p where p.id = new.project_id and new.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000');
  return new;
end $$;
create trigger project_members_after_insert after insert on project_members for each row execute function project_member_after_insert();

-- Milestones and meetings appear on the calendar
create or replace function milestone_calendar() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.due_date is not null then
    insert into calendar_events (org_id, kind, title, starts_at, all_day, project_id)
    select p.org_id, 'milestone', new.title, new.due_date::timestamptz, true, new.project_id from projects p where p.id = new.project_id;
  end if;
  return new;
end $$;
create trigger milestones_calendar after insert on milestones for each row execute function milestone_calendar();

create or replace function meeting_calendar() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into calendar_events (org_id, kind, title, starts_at, ends_at, project_id, department_id, meeting_id, created_by)
  values (new.org_id, 'meeting', new.title, new.starts_at, new.ends_at, new.project_id, new.department_id, new.id, new.organizer_id);
  return new;
end $$;
create trigger meetings_calendar after insert on meetings for each row execute function meeting_calendar();

create or replace function meeting_participant_notify() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
  select new.user_id, 'information', 'Meeting: ' || m.title,
         to_char(m.starts_at at time zone 'Asia/Kolkata', 'Dy DD Mon, HH24:MI'), '/meetings/' || m.id, 'meeting', m.id, m.organizer_id
    from meetings m where m.id = new.meeting_id and new.user_id <> coalesce(m.organizer_id, '00000000-0000-0000-0000-000000000000');
  return new;
end $$;
create trigger meeting_participants_notify after insert on meeting_participants for each row execute function meeting_participant_notify();

-- Decisions are audited
create or replace function decision_audit() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, project_id, summary, new_value)
  values (new.org_id, auth.uid(), 'decision.recorded', 'decision', new.id, new.project_id, new.title, jsonb_build_object('decision', new.decision));
  return new;
end $$;
create trigger decisions_audit after insert on decisions for each row execute function decision_audit();

-- Profile role/department changes are audited (permissions matter)
create or replace function profile_audit() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.role is distinct from old.role or new.department_id is distinct from old.department_id
     or new.is_active is distinct from old.is_active or new.manager_id is distinct from old.manager_id then
    insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, old_value, new_value)
    values (new.org_id, auth.uid(), 'profile.permissions_changed', 'profile', new.id, new.full_name,
            jsonb_build_object('role', old.role, 'department_id', old.department_id, 'is_active', old.is_active, 'manager_id', old.manager_id),
            jsonb_build_object('role', new.role, 'department_id', new.department_id, 'is_active', new.is_active, 'manager_id', new.manager_id));
  end if;
  return new;
end $$;
create trigger profiles_audit after update on profiles for each row execute function profile_audit();

-- Files: audit uploads
create or replace function file_version_audit() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  update files set current_version = greatest(current_version, new.version), updated_at = now() where id = new.file_id;
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, project_id, task_id, summary, new_value)
  select f.org_id, new.uploaded_by, 'file.version_uploaded', 'file', f.id, f.project_id, f.task_id, f.name || ' v' || new.version,
         jsonb_build_object('version', new.version, 'size', new.size_bytes)
    from files f where f.id = new.file_id;
  return new;
end $$;
create trigger file_versions_audit after insert on file_versions for each row execute function file_version_audit();

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table organizations enable row level security;
alter table departments enable row level security;
alter table teams enable row level security;
alter table profiles enable row level security;
alter table invites enable row level security;
alter table leaves enable row level security;
alter table project_templates enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table milestones enable row level security;
alter table project_risks enable row level security;
alter table tasks enable row level security;
alter table task_collaborators enable row level security;
alter table task_dependencies enable row level security;
alter table task_checklist enable row level security;
alter table task_comments enable row level security;
alter table task_history enable row level security;
alter table task_templates enable row level security;
alter table channels enable row level security;
alter table channel_members enable row level security;
alter table messages enable row level security;
alter table message_reactions enable row level security;
alter table files enable row level security;
alter table file_versions enable row level security;
alter table wiki_pages enable row level security;
alter table meetings enable row level security;
alter table meeting_participants enable row level security;
alter table meeting_actions enable row level security;
alter table decisions enable row level security;
alter table approvals enable row level security;
alter table approval_events enable row level security;
alter table calendar_events enable row level security;
alter table announcements enable row level security;
alter table announcement_acks enable row level security;
alter table notifications enable row level security;
alter table ideas enable row level security;
alter table idea_votes enable row level security;
alter table audit_logs enable row level security;

-- organizations
create policy org_read on organizations for select to authenticated using (id = current_org());
create policy org_admin on organizations for update to authenticated using (id = current_org() and is_admin());

-- departments / teams
create policy dept_read on departments for select to authenticated using (org_id = current_org());
create policy dept_write on departments for all to authenticated using (org_id = current_org() and is_admin()) with check (org_id = current_org() and is_admin());
create policy team_read on teams for select to authenticated using (org_id = current_org());
create policy team_write on teams for all to authenticated using (org_id = current_org() and is_manager_plus()) with check (org_id = current_org() and is_manager_plus());

-- profiles: self always; directory for active members
create policy profile_self on profiles for select to authenticated using (id = auth.uid());
create policy profile_dir on profiles for select to authenticated using (org_id = current_org() and is_active_member());
create policy profile_self_update on profiles for update to authenticated using (id = auth.uid())
  with check (id = auth.uid());
create policy profile_admin_update on profiles for update to authenticated using (org_id = current_org() and is_manager_plus());

-- prevent self-escalation: non-admins cannot change their own role/active/department
create or replace function profile_guard() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() = new.id and not is_admin() then
    new.role := old.role;
    new.is_active := old.is_active;
    new.department_id := old.department_id;
    new.manager_id := old.manager_id;
    new.org_id := old.org_id;
    new.is_external := old.is_external;
  elsif auth.uid() <> new.id and not is_admin() then
    -- managers may edit designation/department/manager of others but not role or activation
    new.role := old.role;
    new.is_active := old.is_active;
    new.org_id := old.org_id;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on profiles for each row execute function profile_guard();

-- invites
create policy invites_rw on invites for all to authenticated using (org_id = current_org() and is_manager_plus()) with check (org_id = current_org() and is_manager_plus());

-- leaves
create policy leaves_read on leaves for select to authenticated using (org_id = current_org() and is_active_member());
create policy leaves_own on leaves for insert to authenticated with check (org_id = current_org() and user_id = auth.uid());
create policy leaves_mgr on leaves for update to authenticated using (org_id = current_org() and (is_manager_plus() or user_id = auth.uid()));

-- templates
create policy tpl_read on project_templates for select to authenticated using (is_active_member());
create policy tpl_write on project_templates for all to authenticated using (is_manager_plus()) with check (is_manager_plus());
create policy ttpl_read on task_templates for select to authenticated using (is_active_member());
create policy ttpl_write on task_templates for all to authenticated using (is_manager_plus()) with check (is_manager_plus());

-- projects
create policy projects_read on projects for select to authenticated using (can_view_project(id));
create policy projects_insert on projects for insert to authenticated with check (org_id = current_org() and is_active_member() and is_internal());
create policy projects_update on projects for update to authenticated using (can_view_project(id) and (is_manager_plus() or owner_id = auth.uid() or created_by = auth.uid()));
create policy projects_delete on projects for delete to authenticated using (org_id = current_org() and is_admin());

create policy pm_read on project_members for select to authenticated using (can_view_project(project_id));
create policy pm_write on project_members for all to authenticated
  using (can_view_project(project_id) and (is_manager_plus() or is_project_member(project_id)))
  with check (can_view_project(project_id) and (is_manager_plus() or is_project_member(project_id)));

create policy ms_read on milestones for select to authenticated using (can_view_project(project_id));
create policy ms_write on milestones for all to authenticated using (can_view_project(project_id) and (is_lead_plus() or is_project_member(project_id))) with check (can_view_project(project_id));
create policy risk_read on project_risks for select to authenticated using (can_view_project(project_id));
create policy risk_write on project_risks for all to authenticated using (can_view_project(project_id)) with check (can_view_project(project_id));

-- tasks
create policy tasks_read on tasks for select to authenticated using (can_view_task(id));
create policy tasks_insert on tasks for insert to authenticated with check (org_id = current_org() and is_active_member() and (project_id is null or can_view_project(project_id)));
create policy tasks_update on tasks for update to authenticated using (can_edit_task(id));
create policy tasks_delete on tasks for delete to authenticated using (org_id = current_org() and (is_manager_plus() or created_by = auth.uid()));

create policy tc_read on task_collaborators for select to authenticated using (can_view_task(task_id));
create policy tc_write on task_collaborators for all to authenticated using (can_edit_task(task_id)) with check (can_edit_task(task_id));
create policy td_read on task_dependencies for select to authenticated using (can_view_task(task_id));
create policy td_write on task_dependencies for all to authenticated using (can_edit_task(task_id)) with check (can_edit_task(task_id));
create policy tk_read on task_checklist for select to authenticated using (can_view_task(task_id));
create policy tk_write on task_checklist for all to authenticated using (can_edit_task(task_id)) with check (can_edit_task(task_id));
create policy tcm_read on task_comments for select to authenticated using (can_view_task(task_id));
create policy tcm_insert on task_comments for insert to authenticated with check (can_view_task(task_id) and author_id = auth.uid());
create policy tcm_update on task_comments for update to authenticated using (author_id = auth.uid());
create policy th_read on task_history for select to authenticated using (can_view_task(task_id));

-- channels & messages
create policy ch_read on channels for select to authenticated using (can_view_channel(id));
create policy ch_insert on channels for insert to authenticated with check (org_id = current_org() and is_active_member());
create policy ch_update on channels for update to authenticated using (org_id = current_org() and (created_by = auth.uid() or is_manager_plus()));
create policy cm_read on channel_members for select to authenticated using (can_view_channel(channel_id));
create policy cm_insert on channel_members for insert to authenticated with check (can_view_channel(channel_id) or user_id = auth.uid());
create policy cm_update on channel_members for update to authenticated using (user_id = auth.uid() or is_manager_plus());
create policy cm_delete on channel_members for delete to authenticated using (user_id = auth.uid() or is_manager_plus());

create policy msg_read on messages for select to authenticated using (can_view_channel(channel_id));
create policy msg_insert on messages for insert to authenticated with check (
  author_id = auth.uid() and can_view_channel(channel_id)
  and not exists (select 1 from channels c where c.id = channel_id and c.is_readonly and not is_manager_plus())
);
create policy msg_update on messages for update to authenticated using (author_id = auth.uid() or is_manager_plus());
create policy mr_read on message_reactions for select to authenticated using (exists (select 1 from messages m where m.id = message_id and can_view_channel(m.channel_id)));
create policy mr_write on message_reactions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- files
create policy files_read on files for select to authenticated using (
  org_id = current_org() and can_view_classification(classification)
  and (project_id is null or can_view_project(project_id))
  and (task_id is null or can_view_task(task_id))
);
create policy files_insert on files for insert to authenticated with check (org_id = current_org() and is_active_member());
create policy files_update on files for update to authenticated using (org_id = current_org() and (owner_id = auth.uid() or is_manager_plus()));
create policy files_delete on files for delete to authenticated using (org_id = current_org() and (owner_id = auth.uid() or is_admin()));
create policy fv_read on file_versions for select to authenticated using (exists (select 1 from files f where f.id = file_id and can_view_classification(f.classification) and (f.project_id is null or can_view_project(f.project_id))));
create policy fv_insert on file_versions for insert to authenticated with check (uploaded_by = auth.uid());
create policy fv_update on file_versions for update to authenticated using (is_manager_plus());

create policy wiki_read on wiki_pages for select to authenticated using (org_id = current_org() and can_view_classification(classification));
create policy wiki_write on wiki_pages for all to authenticated using (org_id = current_org() and (is_lead_plus() or author_id = auth.uid())) with check (org_id = current_org() and is_active_member());

-- meetings
create policy meet_read on meetings for select to authenticated using (
  org_id = current_org() and (organizer_id = auth.uid() or is_manager_plus()
    or exists (select 1 from meeting_participants mp where mp.meeting_id = id and mp.user_id = auth.uid())
    or (project_id is not null and can_view_project(project_id)))
);
create policy meet_insert on meetings for insert to authenticated with check (org_id = current_org() and is_active_member());
create policy meet_update on meetings for update to authenticated using (org_id = current_org() and (organizer_id = auth.uid() or is_manager_plus()));
create policy mp_read on meeting_participants for select to authenticated using (exists (select 1 from meetings m where m.id = meeting_id and (m.organizer_id = auth.uid() or is_manager_plus() or user_id = auth.uid() or (m.project_id is not null and can_view_project(m.project_id)))));
create policy mp_write on meeting_participants for all to authenticated using (exists (select 1 from meetings m where m.id = meeting_id and (m.organizer_id = auth.uid() or is_manager_plus()))) with check (true);
create policy ma_read on meeting_actions for select to authenticated using (exists (select 1 from meetings m where m.id = meeting_id and (m.organizer_id = auth.uid() or is_manager_plus() or owner_id = auth.uid() or exists (select 1 from meeting_participants mp where mp.meeting_id = m.id and mp.user_id = auth.uid()))));
create policy ma_write on meeting_actions for all to authenticated using (exists (select 1 from meetings m where m.id = meeting_id and (m.organizer_id = auth.uid() or is_manager_plus() or exists (select 1 from meeting_participants mp where mp.meeting_id = m.id and mp.user_id = auth.uid())))) with check (true);

-- decisions
create policy dec_read on decisions for select to authenticated using (org_id = current_org() and can_view_classification(classification) and (project_id is null or can_view_project(project_id)));
create policy dec_insert on decisions for insert to authenticated with check (org_id = current_org() and is_lead_plus());
create policy dec_update on decisions for update to authenticated using (org_id = current_org() and (decided_by = auth.uid() or is_admin()));

-- approvals
create policy appr_read on approvals for select to authenticated using (
  org_id = current_org() and (requested_by = auth.uid() or approver_id = auth.uid() or delegated_from = auth.uid() or is_manager_plus())
);
create policy appr_insert on approvals for insert to authenticated with check (org_id = current_org() and requested_by = auth.uid() and is_active_member());
create policy appr_update on approvals for update to authenticated using (org_id = current_org() and (approver_id = auth.uid() or requested_by = auth.uid() or is_admin()));
create policy ae_read on approval_events for select to authenticated using (exists (select 1 from approvals a where a.id = approval_id and (a.requested_by = auth.uid() or a.approver_id = auth.uid() or is_manager_plus())));

-- calendar
create policy cal_read on calendar_events for select to authenticated using (
  org_id = current_org() and is_active_member()
  and (project_id is null or can_view_project(project_id))
  and (user_id is null or user_id = auth.uid() or is_lead_plus())
);
create policy cal_write on calendar_events for all to authenticated using (org_id = current_org() and (created_by = auth.uid() or is_lead_plus())) with check (org_id = current_org() and is_active_member());

-- announcements
create policy ann_read on announcements for select to authenticated using (org_id = current_org() and is_active_member() and (department_ids = '{}' or current_department() = any(department_ids) or is_manager_plus()));
create policy ann_write on announcements for all to authenticated using (org_id = current_org() and is_manager_plus()) with check (org_id = current_org() and is_manager_plus());
create policy ack_read on announcement_acks for select to authenticated using (user_id = auth.uid() or is_manager_plus());
create policy ack_insert on announcement_acks for insert to authenticated with check (user_id = auth.uid());

-- notifications
create policy notif_own on notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on notifications for update to authenticated using (user_id = auth.uid());
create policy notif_delete on notifications for delete to authenticated using (user_id = auth.uid());

-- ideas
create policy ideas_read on ideas for select to authenticated using (org_id = current_org() and is_active_member());
create policy ideas_insert on ideas for insert to authenticated with check (org_id = current_org() and author_id = auth.uid());
create policy ideas_update on ideas for update to authenticated using (org_id = current_org() and (author_id = auth.uid() or is_manager_plus()));
create policy iv_all on idea_votes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit: managers and above read; nobody writes directly (triggers are security definer)
create policy audit_read on audit_logs for select to authenticated using (org_id = current_org() and is_manager_plus());

-- ---------------------------------------------------------------------------
-- REALTIME
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table messages, notifications, tasks, channel_members, approvals;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Open (or create) a DM channel between me and another user
create or replace function open_dm(other uuid) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  k text;
  cid uuid;
  me uuid := auth.uid();
  oname text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  k := least(me::text, other::text) || ':' || greatest(me::text, other::text);
  select id into cid from channels where org_id = current_org() and dm_key = k;
  if cid is null then
    select full_name into oname from profiles where id = other;
    insert into channels (org_id, type, name, dm_key, is_private, created_by)
    values (current_org(), 'dm', coalesce(oname, 'Direct message'), k, true, me)
    returning id into cid;
    insert into channel_members (channel_id, user_id) values (cid, me), (cid, other) on conflict do nothing;
  end if;
  return cid;
end $$;

-- Mark channel read
create or replace function mark_channel_read(c uuid) returns void
language sql security definer set search_path = public, extensions as $$
  update channel_members set last_read_at = now() where channel_id = c and user_id = auth.uid();
$$;

-- Unread counts for my channels
create or replace function my_unread_counts()
returns table(channel_id uuid, unread bigint)
language sql stable security definer set search_path = public, extensions as $$
  select cm.channel_id, count(m.id)
    from channel_members cm
    left join messages m on m.channel_id = cm.channel_id and m.created_at > cm.last_read_at
         and m.author_id is distinct from auth.uid() and m.deleted_at is null and m.parent_id is null
   where cm.user_id = auth.uid()
   group by cm.channel_id
$$;

-- Create a task from a chat message, keeping the conversation link
create or replace function task_from_message(msg uuid, p_title text, p_assignee uuid, p_due timestamptz, p_priority task_priority default 'normal')
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  m messages%rowtype;
  ch channels%rowtype;
  tid uuid;
begin
  select * into m from messages where id = msg;
  if m.id is null or not can_view_channel(m.channel_id) then raise exception 'message not accessible'; end if;
  select * into ch from channels where id = m.channel_id;
  insert into tasks (org_id, project_id, department_id, title, description, owner_id, assignee_id, delegated_by, due_date, priority, source_message_id, created_by, status)
  values (ch.org_id, ch.project_id, ch.department_id, coalesce(nullif(p_title,''), left(m.body, 120)),
          'From #' || ch.name || ' — ' || m.body, auth.uid(), coalesce(p_assignee, m.author_id), auth.uid(), p_due, p_priority, m.id, auth.uid(), 'todo')
  returning id into tid;
  insert into messages (channel_id, author_id, kind, body, parent_id)
  values (m.channel_id, auth.uid(), 'system', 'Created task from this message: ' || coalesce(nullif(p_title,''), left(m.body, 120)) || ' [/tasks/' || tid || ']', m.id);
  return tid;
end $$;

-- Company health & command-center summary (respects visibility via RLS-safe queries on visible rows)
create or replace function company_pulse()
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  o uuid := current_org();
  r jsonb;
  t_total int; t_done_7 int; t_created_7 int; t_overdue int; t_critical int; t_blocked int; t_waiting_mgmt int; t_waiting_dept int;
  p_active int; p_at_risk int; p_delayed int; p_total int;
  a_pending int; a_stale int;
  ms_upcoming int; mt_today int;
  avg_delay numeric;
  people int; people_over int;
begin
  if not is_manager_plus() then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select count(*) filter (where status not in ('done','cancelled')),
         count(*) filter (where status = 'done' and completed_at > now() - interval '7 days'),
         count(*) filter (where created_at > now() - interval '7 days'),
         count(*) filter (where status not in ('done','cancelled') and due_date < now()),
         count(*) filter (where status not in ('done','cancelled') and priority in ('critical','urgent')),
         count(*) filter (where status = 'blocked'),
         count(*) filter (where status not in ('done','cancelled') and waiting_on in ('manager','approval')),
         count(*) filter (where status not in ('done','cancelled') and waiting_on in ('employee','client','vendor'))
    into t_total, t_done_7, t_created_7, t_overdue, t_critical, t_blocked, t_waiting_mgmt, t_waiting_dept
    from tasks where org_id = o and parent_id is null;

  select count(*) filter (where status = 'active'), count(*) filter (where status = 'at_risk'),
         count(*) filter (where status = 'delayed' or (status in ('active','at_risk') and due_date < current_date)),
         count(*) filter (where status not in ('completed','cancelled'))
    into p_active, p_at_risk, p_delayed, p_total
    from projects where org_id = o and not archived;

  select count(*), count(*) filter (where created_at < now() - interval '48 hours')
    into a_pending, a_stale from approvals where org_id = o and status = 'pending';

  select count(*) into ms_upcoming from milestones m join projects p on p.id = m.project_id
   where p.org_id = o and m.completed_at is null and m.due_date between current_date and current_date + 14;
  select count(*) into mt_today from meetings where org_id = o and starts_at::date = current_date;

  select coalesce(avg(extract(epoch from (coalesce(completed_at, now()) - due_date))/86400), 0)
    into avg_delay from tasks where org_id = o and due_date is not null and due_date < now()
    and (completed_at is null or completed_at > due_date) and created_at > now() - interval '30 days';

  select count(*) into people from profiles where org_id = o and is_active;
  select count(*) into people_over from (
    select assignee_id from tasks where org_id = o and status not in ('done','cancelled') and assignee_id is not null
    group by assignee_id having count(*) filter (where priority in ('critical','urgent')) >= 5 or count(*) >= 12
  ) s;

  r := jsonb_build_object(
    'tasks', jsonb_build_object('open', t_total, 'done_7d', t_done_7, 'created_7d', t_created_7, 'overdue', t_overdue,
                                'critical', t_critical, 'blocked', t_blocked, 'waiting_mgmt', t_waiting_mgmt, 'waiting_dept', t_waiting_dept),
    'projects', jsonb_build_object('active', p_active, 'at_risk', p_at_risk, 'delayed', p_delayed, 'total', p_total),
    'approvals', jsonb_build_object('pending', a_pending, 'stale', a_stale),
    'milestones_14d', ms_upcoming,
    'meetings_today', mt_today,
    'avg_delay_days', round(avg_delay, 1),
    'people', jsonb_build_object('active', people, 'overloaded', people_over)
  );
  return r;
end $$;

-- Department health rollup
create or replace function department_health()
returns table(department_id uuid, name text, color text, slug text, people int, open_tasks int, overdue int, blocked int, critical int, projects int, at_risk int, pending_approvals int)
language sql stable security definer set search_path = public, extensions as $$
  select d.id, d.name, d.color, d.slug,
    (select count(*)::int from profiles p where p.department_id = d.id and p.is_active),
    (select count(*)::int from tasks t where t.department_id = d.id and t.status not in ('done','cancelled')),
    (select count(*)::int from tasks t where t.department_id = d.id and t.status not in ('done','cancelled') and t.due_date < now()),
    (select count(*)::int from tasks t where t.department_id = d.id and t.status = 'blocked'),
    (select count(*)::int from tasks t where t.department_id = d.id and t.status not in ('done','cancelled') and t.priority in ('critical','urgent')),
    (select count(*)::int from projects p where p.department_id = d.id and p.status not in ('completed','cancelled') and not p.archived),
    (select count(*)::int from projects p where p.department_id = d.id and (p.status in ('at_risk','delayed') or (p.status='active' and p.due_date < current_date))),
    (select count(*)::int from approvals a join profiles ap on ap.id = a.approver_id where ap.department_id = d.id and a.status = 'pending')
  from departments d
  where d.org_id = current_org() and is_active_member()
  order by d.position, d.name
$$;

-- Workload per person (manager+)
create or replace function workload()
returns table(user_id uuid, full_name text, avatar_url text, designation text, department_id uuid, presence presence_status,
              open_tasks int, urgent int, overdue int, blocked int, waiting int, due_week int, on_leave boolean, est_hours numeric)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, p.full_name, p.avatar_url, p.designation, p.department_id, p.presence,
    (select count(*)::int from tasks t where t.assignee_id = p.id and t.status not in ('done','cancelled')),
    (select count(*)::int from tasks t where t.assignee_id = p.id and t.status not in ('done','cancelled') and t.priority in ('critical','urgent')),
    (select count(*)::int from tasks t where t.assignee_id = p.id and t.status not in ('done','cancelled') and t.due_date < now()),
    (select count(*)::int from tasks t where t.assignee_id = p.id and t.status = 'blocked'),
    (select count(*)::int from tasks t where t.assignee_id = p.id and t.status = 'waiting'),
    (select count(*)::int from tasks t where t.assignee_id = p.id and t.status not in ('done','cancelled') and t.due_date between now() and now() + interval '7 days'),
    exists (select 1 from leaves l where l.user_id = p.id and l.status = 'approved' and current_date between l.starts_on and l.ends_on),
    (select coalesce(sum(t.estimated_hours),0) from tasks t where t.assignee_id = p.id and t.status not in ('done','cancelled'))
  from profiles p
  where p.org_id = current_org() and p.is_active and (is_lead_plus() or p.id = auth.uid())
  order by p.full_name
$$;

-- Universal search across authorized entities
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
    order by 6 desc limit lim);
end $$;

-- Instantiate a project from a template
create or replace function create_project_from_template(tpl_key text, p_name text, p_owner uuid, p_due date, p_department uuid default null)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  t project_templates%rowtype;
  pid uuid;
  item jsonb;
  i int := 0;
  prev uuid;
  cur uuid;
  offset_days int;
begin
  select * into t from project_templates where key = tpl_key;
  if t.id is null then raise exception 'template % not found', tpl_key; end if;
  insert into projects (org_id, name, description, department_id, owner_id, status, due_date, template_key, created_by)
  values (current_org(), p_name, t.description, coalesce(p_department, (select id from departments where org_id = current_org() and slug = t.department_slug)), p_owner, 'planning', p_due, tpl_key, auth.uid())
  returning id into pid;

  for item in select * from jsonb_array_elements(t.milestones) loop
    insert into milestones (project_id, title, due_date, position)
    values (pid, item->>'title', case when p_due is not null and (item->>'offset_pct') is not null then current_date + ((p_due - current_date) * (item->>'offset_pct')::numeric / 100)::int else null end, i);
    i := i + 1;
  end loop;

  i := 0; prev := null;
  for item in select * from jsonb_array_elements(t.tasks) loop
    offset_days := coalesce((item->>'due_offset_days')::int, null);
    insert into tasks (org_id, project_id, department_id, title, description, owner_id, assignee_id, priority, status, position, created_by, due_date, estimated_hours)
    values (current_org(), pid, (select department_id from projects where id = pid), item->>'title', item->>'description', p_owner, null,
            coalesce((item->>'priority')::task_priority, 'normal'), (case when i = 0 then 'todo' else 'backlog' end)::task_status, i, auth.uid(),
            case when offset_days is not null then (current_date + offset_days)::timestamptz else null end,
            (item->>'estimated_hours')::numeric)
    returning id into cur;
    if coalesce((item->>'depends_on_previous')::boolean, false) and prev is not null then
      insert into task_dependencies (task_id, depends_on_id) values (cur, prev);
      update tasks set status = 'waiting', waiting_on = 'employee', waiting_note = 'Waiting on previous stage' where id = cur;
    end if;
    prev := cur; i := i + 1;
  end loop;
  return pid;
end $$;

-- Delegation: create a workflow in one call (a chain of tasks with dependencies)
-- steps: [{title, assignee_id, department_id, due_date, priority, depends_on_previous, description}]
create or replace function create_delegation(p_project uuid, p_summary text, p_approver uuid, steps jsonb)
returns uuid[]
language plpgsql security definer set search_path = public, extensions as $$
declare
  item jsonb;
  prev uuid;
  cur uuid;
  ids uuid[] := '{}';
  i int := 0;
  o uuid := current_org();
begin
  if not is_active_member() then raise exception 'not allowed'; end if;
  for item in select * from jsonb_array_elements(steps) loop
    insert into tasks (org_id, project_id, department_id, title, description, owner_id, assignee_id, delegated_by, approver_id, priority, due_date, requires_approval, status, position, created_by)
    values (o, p_project, nullif(item->>'department_id','')::uuid, item->>'title',
            coalesce(item->>'description', p_summary), auth.uid(), nullif(item->>'assignee_id','')::uuid, auth.uid(),
            case when coalesce((item->>'final')::boolean,false) then p_approver else null end,
            coalesce((item->>'priority')::task_priority, 'normal'),
            nullif(item->>'due_date','')::timestamptz,
            coalesce((item->>'final')::boolean,false) and p_approver is not null,
            'todo', i, auth.uid())
    returning id into cur;
    if coalesce((item->>'depends_on_previous')::boolean, false) and prev is not null then
      insert into task_dependencies (task_id, depends_on_id) values (cur, prev);
      update tasks set status = 'waiting', waiting_on = 'employee', waiting_on_user_id = (select assignee_id from tasks where id = prev), waiting_note = 'Waiting on previous step' where id = cur;
    end if;
    ids := ids || cur; prev := cur; i := i + 1;
  end loop;
  return ids;
end $$;

-- Activity graph: everything related to an entity
create or replace function related_to(entity text, eid uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare r jsonb := '{}'::jsonb;
begin
  if entity = 'project' then
    if not can_view_project(eid) then return r; end if;
    r := jsonb_build_object(
      'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'status', status, 'priority', priority, 'due_date', due_date, 'assignee_id', assignee_id)), '[]') from tasks where project_id = eid and parent_id is null),
      'files', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'version', current_version, 'updated_at', updated_at)), '[]') from files where project_id = eid),
      'decisions', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'decided_at', decided_at)), '[]') from decisions where project_id = eid),
      'meetings', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'starts_at', starts_at)), '[]') from meetings where project_id = eid),
      'approvals', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'status', status)), '[]') from approvals where project_id = eid),
      'channel', (select id from channels where project_id = eid and type = 'project' limit 1)
    );
  end if;
  return r;
end $$;

grant execute on function open_dm(uuid), mark_channel_read(uuid), my_unread_counts(), task_from_message(uuid,text,uuid,timestamptz,task_priority),
  company_pulse(), department_health(), workload(), search_all(text,int), create_project_from_template(text,text,uuid,date,uuid),
  create_delegation(uuid,text,uuid,jsonb), related_to(text,uuid) to authenticated;
revoke execute on function open_dm(uuid), mark_channel_read(uuid), my_unread_counts(), task_from_message(uuid,text,uuid,timestamptz,task_priority),
  company_pulse(), department_health(), workload(), search_all(text,int), create_project_from_template(text,text,uuid,date,uuid),
  create_delegation(uuid,text,uuid,jsonb), related_to(text,uuid) from anon;

-- ---------------------------------------------------------------------------
-- STORAGE
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 52428800), ('avatars', 'avatars', true, 5242880), ('chat', 'chat', false, 52428800)
on conflict (id) do nothing;

create policy "files_bucket_read" on storage.objects for select to authenticated using (bucket_id in ('files','chat') and is_active_member());
create policy "files_bucket_write" on storage.objects for insert to authenticated with check (bucket_id in ('files','chat') and is_active_member());
create policy "files_bucket_delete" on storage.objects for delete to authenticated using (bucket_id in ('files','chat') and (owner = auth.uid() or is_admin()));
create policy "avatars_read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars_write" on storage.objects for insert to authenticated with check (bucket_id = 'avatars');
create policy "avatars_update" on storage.objects for update to authenticated using (bucket_id = 'avatars' and owner = auth.uid());

-- ---------------------------------------------------------------------------
-- SEED: organization, departments, channels, templates
-- ---------------------------------------------------------------------------
insert into organizations (id, name, slug, tagline)
values ('00000000-0000-0000-0000-000000000001', 'GHL India Ventures', 'ghl', 'One Company. One Workspace. One Source of Truth.');

insert into departments (org_id, name, slug, color, icon, position, description) values
 ('00000000-0000-0000-0000-000000000001','Management','management','#0f172a','crown',0,'Executive management and strategy'),
 ('00000000-0000-0000-0000-000000000001','IT & Technology','technology','#2563eb','cpu',1,'Development, infrastructure, security'),
 ('00000000-0000-0000-0000-000000000001','Sales','sales','#16a34a','trending-up',2,'Leads, pipeline, conversion'),
 ('00000000-0000-0000-0000-000000000001','Investor Relations','investor-relations','#7c3aed','landmark',3,'Investor communication and materials'),
 ('00000000-0000-0000-0000-000000000001','Customer Support','support','#ea580c','life-buoy',4,'Tickets, escalations, SLA'),
 ('00000000-0000-0000-0000-000000000001','Operations','operations','#0891b2','settings',5,'Day-to-day operations'),
 ('00000000-0000-0000-0000-000000000001','Content','content','#db2777','pen-line',6,'Writers, research, editorial'),
 ('00000000-0000-0000-0000-000000000001','Design','design','#f59e0b','palette',7,'Graphic and UI/UX design'),
 ('00000000-0000-0000-0000-000000000001','Marketing','marketing','#e11d48','megaphone',8,'Campaigns and brand'),
 ('00000000-0000-0000-0000-000000000001','Finance & Accounts','finance','#059669','wallet',9,'Finance, accounts, budgets'),
 ('00000000-0000-0000-0000-000000000001','HR & Recruitment','hr','#9333ea','users',10,'People, hiring, onboarding'),
 ('00000000-0000-0000-0000-000000000001','Legal & Compliance','legal','#475569','scale',11,'Contracts, compliance, risk'),
 ('00000000-0000-0000-0000-000000000001','Administration','admin','#64748b','building',12,'Office and administration'),
 ('00000000-0000-0000-0000-000000000001','Business Development','bizdev','#0ea5e9','handshake',13,'Partnerships and growth'),
 ('00000000-0000-0000-0000-000000000001','Project Teams','projects','#4f46e5','folder-kanban',14,'Cross-functional project teams'),
 ('00000000-0000-0000-0000-000000000001','External','external','#94a3b8','globe',15,'Consultants, vendors, freelancers');

insert into channels (org_id, type, name, slug, description, is_readonly, department_id) values
 ('00000000-0000-0000-0000-000000000001','company','general','general','Company-wide conversation',false,null),
 ('00000000-0000-0000-0000-000000000001','announcement','announcements','announcements','Official announcements from management',true,null),
 ('00000000-0000-0000-0000-000000000001','company','urgent','urgent','Urgent, time-critical coordination',false,null);

insert into channels (org_id, type, name, slug, description, department_id, is_private)
select '00000000-0000-0000-0000-000000000001', 'department', d.slug, d.slug, d.name || ' department channel', d.id,
       d.slug = 'management'
  from departments d where d.slug in ('management','sales','technology','design','content','support','marketing','finance','hr','legal','operations','investor-relations');

insert into project_templates (key, name, description, department_slug, tasks, milestones) values
 ('website', 'Website Development', 'Plan, design, build, test and launch a website.', 'technology',
  '[{"title":"Requirements & sitemap","priority":"high","due_offset_days":3},
    {"title":"Content brief & copy","priority":"normal","due_offset_days":7,"depends_on_previous":true},
    {"title":"UI design (desktop + mobile)","priority":"high","due_offset_days":14,"depends_on_previous":true},
    {"title":"Design approval","priority":"high","due_offset_days":15,"depends_on_previous":true},
    {"title":"Development","priority":"high","due_offset_days":28,"depends_on_previous":true},
    {"title":"QA & cross-browser testing","priority":"high","due_offset_days":32,"depends_on_previous":true},
    {"title":"Management approval","priority":"critical","due_offset_days":33,"depends_on_previous":true},
    {"title":"Launch & DNS","priority":"critical","due_offset_days":35,"depends_on_previous":true}]',
  '[{"title":"Design signed off","offset_pct":40},{"title":"Development complete","offset_pct":80},{"title":"Live","offset_pct":100}]'),
 ('investor_presentation', 'Investor Presentation', 'Prepare an investor deck with content, design and management approval.', 'investor-relations',
  '[{"title":"Outline & key numbers","priority":"high","due_offset_days":2},
    {"title":"Draft content","priority":"high","due_offset_days":5,"depends_on_previous":true},
    {"title":"Compliance review","priority":"high","due_offset_days":6,"depends_on_previous":true},
    {"title":"Design the deck","priority":"high","due_offset_days":9,"depends_on_previous":true},
    {"title":"Management approval","priority":"critical","due_offset_days":10,"depends_on_previous":true},
    {"title":"Final export & distribution","priority":"normal","due_offset_days":11,"depends_on_previous":true}]',
  '[{"title":"Content locked","offset_pct":50},{"title":"Deck approved","offset_pct":100}]'),
 ('marketing_campaign', 'Marketing Campaign', 'Plan and execute a multi-channel campaign.', 'marketing',
  '[{"title":"Campaign brief & goals","priority":"high","due_offset_days":2},
    {"title":"Content calendar","priority":"normal","due_offset_days":5,"depends_on_previous":true},
    {"title":"Creative design","priority":"high","due_offset_days":10,"depends_on_previous":true},
    {"title":"Landing page","priority":"high","due_offset_days":14,"depends_on_previous":true},
    {"title":"Approval","priority":"critical","due_offset_days":15,"depends_on_previous":true},
    {"title":"Launch","priority":"critical","due_offset_days":16,"depends_on_previous":true},
    {"title":"Performance report","priority":"normal","due_offset_days":30,"depends_on_previous":true}]',
  '[{"title":"Creative approved","offset_pct":50},{"title":"Campaign live","offset_pct":60},{"title":"Wrap-up","offset_pct":100}]'),
 ('product_launch', 'New Product Launch', 'Bring a new product to market.', 'management',
  '[{"title":"Product definition","priority":"high","due_offset_days":5},{"title":"Go-to-market plan","priority":"high","due_offset_days":10,"depends_on_previous":true},{"title":"Collateral & website","priority":"high","due_offset_days":20,"depends_on_previous":true},{"title":"Sales enablement","priority":"normal","due_offset_days":25,"depends_on_previous":true},{"title":"Launch approval","priority":"critical","due_offset_days":28,"depends_on_previous":true},{"title":"Launch","priority":"critical","due_offset_days":30,"depends_on_previous":true}]',
  '[{"title":"GTM approved","offset_pct":35},{"title":"Launch","offset_pct":100}]'),
 ('recruitment', 'Recruitment', 'Hire for an open position.', 'hr',
  '[{"title":"Job description & approval","priority":"high","due_offset_days":2},{"title":"Publish opening","priority":"normal","due_offset_days":3,"depends_on_previous":true},{"title":"Screen candidates","priority":"normal","due_offset_days":12,"depends_on_previous":true},{"title":"Interviews","priority":"high","due_offset_days":20,"depends_on_previous":true},{"title":"Offer & hiring approval","priority":"critical","due_offset_days":24,"depends_on_previous":true},{"title":"Onboarding","priority":"normal","due_offset_days":30,"depends_on_previous":true}]',
  '[{"title":"Shortlist ready","offset_pct":40},{"title":"Offer accepted","offset_pct":85}]'),
 ('event', 'Event', 'Organise a company or client event.', 'operations',
  '[{"title":"Event concept & budget approval","priority":"high","due_offset_days":3},{"title":"Venue & vendors","priority":"high","due_offset_days":10,"depends_on_previous":true},{"title":"Invitations & content","priority":"normal","due_offset_days":14,"depends_on_previous":true},{"title":"Design collateral","priority":"normal","due_offset_days":18,"depends_on_previous":true},{"title":"Run the event","priority":"critical","due_offset_days":30,"depends_on_previous":true},{"title":"Post-event report","priority":"normal","due_offset_days":33,"depends_on_previous":true}]',
  '[{"title":"Budget approved","offset_pct":10},{"title":"Event day","offset_pct":90}]'),
 ('property', 'Property Project', 'Property acquisition / development workflow.', 'bizdev',
  '[{"title":"Site identification & due diligence","priority":"high","due_offset_days":10},{"title":"Legal & title verification","priority":"critical","due_offset_days":20,"depends_on_previous":true},{"title":"Financial model","priority":"high","due_offset_days":25,"depends_on_previous":true},{"title":"Investor material","priority":"high","due_offset_days":32,"depends_on_previous":true},{"title":"Management approval","priority":"critical","due_offset_days":35,"depends_on_previous":true},{"title":"Execution","priority":"high","due_offset_days":60,"depends_on_previous":true}]',
  '[{"title":"Due diligence complete","offset_pct":33},{"title":"Approved","offset_pct":58},{"title":"Closed","offset_pct":100}]'),
 ('tech_deployment', 'Technology Deployment', 'Deploy a system or integration.', 'technology',
  '[{"title":"Scope & architecture","priority":"high","due_offset_days":3},{"title":"Build","priority":"high","due_offset_days":14,"depends_on_previous":true},{"title":"Security review","priority":"critical","due_offset_days":17,"depends_on_previous":true},{"title":"UAT","priority":"high","due_offset_days":21,"depends_on_previous":true},{"title":"Deployment approval","priority":"critical","due_offset_days":22,"depends_on_previous":true},{"title":"Deploy & monitor","priority":"critical","due_offset_days":24,"depends_on_previous":true}]',
  '[{"title":"Build complete","offset_pct":60},{"title":"Deployed","offset_pct":100}]'),
 ('compliance', 'Compliance Project', 'Meet a regulatory or compliance requirement.', 'legal',
  '[{"title":"Requirement analysis","priority":"high","due_offset_days":3},{"title":"Gap assessment","priority":"high","due_offset_days":8,"depends_on_previous":true},{"title":"Remediation tasks","priority":"high","due_offset_days":20,"depends_on_previous":true},{"title":"Documentation","priority":"normal","due_offset_days":25,"depends_on_previous":true},{"title":"Sign-off","priority":"critical","due_offset_days":28,"depends_on_previous":true}]',
  '[{"title":"Gap assessment done","offset_pct":30},{"title":"Compliant","offset_pct":100}]');

insert into task_templates (name, description, department_slug, priority, checklist, estimated_hours) values
 ('Bug fix', 'Reproduce, fix, test and deploy a bug fix.', 'technology', 'high', '["Reproduce","Root cause","Fix","Test","Deploy","Verify in production"]', 4),
 ('Blog article', 'Write and publish an article.', 'content', 'normal', '["Research","Outline","Draft","Editor review","Compliance check","Design assets","Approval","Publish"]', 8),
 ('Social creative', 'Design a social media creative.', 'design', 'normal', '["Brief","Concept","Design","Internal review","Revision","Approval","Deliver"]', 3),
 ('Client proposal', 'Prepare and send a client proposal.', 'sales', 'high', '["Requirements","Pricing","Draft","Management review","Send","Follow up"]', 6),
 ('Support escalation', 'Handle an escalated support issue.', 'support', 'urgent', '["Acknowledge client","Gather logs/screenshots","Escalate to IT","Resolve","Confirm with client","Knowledge base entry"]', 3);

insert into wiki_pages (org_id, title, slug, category, body, classification) values
 ('00000000-0000-0000-0000-000000000001', 'Welcome to GHL ONE', 'welcome', 'Onboarding',
  E'# Welcome to GHL ONE\n\nGHL ONE is the digital headquarters of GHL India Ventures.\n\n**What am I responsible for?** → My Work\n**What should I do next?** → Today / Next\n**Who am I waiting for?** → Waiting\n**What needs approval?** → Approvals\n**Where are the files?** → Files\n\nPrinciple: chat creates context, context creates decisions, decisions create work, work creates results.', 'internal'),
 ('00000000-0000-0000-0000-000000000001', 'Task ownership rules', 'task-ownership', 'Policies',
  E'Every task has exactly one **Responsible** person (assignee) and one **Accountable** owner. Contributors help; the Approver signs off.\n\nNever leave a task without an assignee. If you are waiting on someone, set *Waiting on* so management sees the real bottleneck.', 'internal');
