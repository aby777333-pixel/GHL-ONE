-- Phase 4 wave 2: GHL Buddy — role-aware AI companion. Assistants + action levels, approved knowledge (owners, review dates),
-- feedback, AI activity log, personal memory, expert finder, permission-aware restricted hits, blocker chain, department brief.

-- ---------------------------------------------------------------------------
-- ASSISTANTS (AI control center)
-- ---------------------------------------------------------------------------
create table ai_assistants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  key text not null,                         -- general | it | sales | support | design | content | hr | manager | department_head | new_joiner
  name text not null,
  description text,
  personality text not null,                 -- appended to the system prompt
  enabled boolean not null default true,
  department_ids uuid[],                     -- null = all departments
  action_level int not null default 5 check (action_level between 1 and 6),   -- 1 answer · 2 suggest · 3 draft · 4 prepare · 5 execute with confirmation · 6 automatic (workflows only)
  data_scopes text[] not null default '{tasks,projects,chat,files,wiki,knowledge,people,attendance_self,leave_self,help,decisions,meetings}',
  daily_limit int,                           -- requests per user per day; null = unlimited
  model text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

-- ---------------------------------------------------------------------------
-- APPROVED KNOWLEDGE (department AI knowledge base)
-- ---------------------------------------------------------------------------
create or replace function imm_array_to_string(a text[]) returns text immutable language sql as $$ select array_to_string(a, ' ') $$;

create table ai_knowledge (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  department_id uuid references departments(id) on delete set null,      -- null = company-wide
  title text not null,
  body text not null,
  kind text not null default 'guide',        -- sop | policy | faq | script | objection | guide | incident | positioning | checklist | template
  tags text[] not null default '{}',
  status text not null default 'draft',      -- draft | approved | archived
  classification classification not null default 'internal',
  owner_id uuid references profiles(id) on delete set null,
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  review_at date,                            -- AI warns when past
  source_type text,                          -- wiki | file | conversation | manual | correction
  source_id uuid,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'') || ' ' || imm_array_to_string(tags))) stored
);
create index ai_knowledge_search_idx on ai_knowledge using gin(search);
create index ai_knowledge_dept_idx on ai_knowledge(org_id, department_id, status);
create trigger ai_knowledge_updated_at before update on ai_knowledge for each row execute function set_updated_at();

create table ai_knowledge_owners (
  org_id uuid not null references organizations(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (department_id, user_id)
);

create or replace function is_knowledge_owner(d uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or has_admin_perm('ai.manage')
      or exists (select 1 from ai_knowledge_owners o where o.user_id = auth.uid() and (d is null or o.department_id = d))
      or exists (select 1 from departments x where x.id = d and x.head_id = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- FEEDBACK, ACTION LOG, PERSONAL MEMORY, LEARNING INTERESTS
-- ---------------------------------------------------------------------------
alter table ai_conversations add column if not exists assistant_key text, add column if not exists mode text;
alter table ai_messages add column if not exists confidence text, add column if not exists context jsonb, add column if not exists mode text, add column if not exists attachments jsonb;

create table ai_feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  message_id uuid references ai_messages(id) on delete cascade,
  rating text not null,                      -- helpful | not_helpful | incorrect | outdated | unsafe
  note text,
  department_id uuid references departments(id) on delete set null,
  routed_to uuid references profiles(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table ai_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  conversation_id uuid references ai_conversations(id) on delete set null,
  message_id uuid references ai_messages(id) on delete set null,
  kind text not null,                        -- task | decision | meeting | help_request | leave_request | bug_report | message_draft | knowledge_article | access_request | bring_in | escalation
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'proposed',   -- proposed | confirmed | performed | dismissed | failed
  result jsonb,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  performed_at timestamptz
);
create index ai_actions_user_idx on ai_actions(user_id, created_at desc);

create table ai_memory (
  user_id uuid not null references profiles(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table learning_interests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  topic text not null,
  note text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table ai_assistants enable row level security;
alter table ai_knowledge enable row level security;
alter table ai_knowledge_owners enable row level security;
alter table ai_feedback enable row level security;
alter table ai_actions enable row level security;
alter table ai_memory enable row level security;
alter table learning_interests enable row level security;

create policy aia_read on ai_assistants for select to authenticated using (org_id = current_org());
create policy aia_write on ai_assistants for all to authenticated using (org_id = current_org() and (is_admin() or has_admin_perm('ai.manage'))) with check (org_id = current_org() and (is_admin() or has_admin_perm('ai.manage')));

create policy aik_read on ai_knowledge for select to authenticated using (
  org_id = current_org() and is_active_member() and (
    (status = 'approved' and can_view_classification(classification) and (department_id is null or department_id = current_department() or is_manager_plus() or is_knowledge_owner(department_id)))
    or created_by = auth.uid() or owner_id = auth.uid() or is_knowledge_owner(department_id)
  )
);
create policy aik_insert on ai_knowledge for insert to authenticated with check (org_id = current_org() and is_active_member() and created_by = auth.uid());
create policy aik_update on ai_knowledge for update to authenticated using (org_id = current_org() and (is_knowledge_owner(department_id) or owner_id = auth.uid() or (created_by = auth.uid() and status = 'draft')));
create policy aik_delete on ai_knowledge for delete to authenticated using (org_id = current_org() and (is_knowledge_owner(department_id) or (created_by = auth.uid() and status = 'draft')));
-- approval guard: only owners can set status = approved
create or replace function ai_knowledge_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and (old.status is distinct from 'approved') then
    if not is_knowledge_owner(new.department_id) then raise exception 'Only knowledge owners can approve'; end if;
    new.approved_by := auth.uid(); new.approved_at := now();
    insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary) values (new.org_id, auth.uid(), 'ai.knowledge_approved', 'ai_knowledge', new.id, new.title);
  end if;
  return new;
end $$;
create trigger ai_knowledge_guard before update on ai_knowledge for each row execute function ai_knowledge_guard();

create policy aiko_read on ai_knowledge_owners for select to authenticated using (org_id = current_org());
create policy aiko_write on ai_knowledge_owners for all to authenticated using (org_id = current_org() and (is_admin() or has_admin_perm('ai.manage'))) with check (org_id = current_org() and (is_admin() or has_admin_perm('ai.manage')));

create policy aif_read on ai_feedback for select to authenticated using (org_id = current_org() and (user_id = auth.uid() or routed_to = auth.uid() or is_admin() or has_admin_perm('ai.manage') or is_knowledge_owner(department_id)));
create policy aif_insert on ai_feedback for insert to authenticated with check (org_id = current_org() and user_id = auth.uid());
create policy aif_update on ai_feedback for update to authenticated using (org_id = current_org() and (routed_to = auth.uid() or is_admin() or has_admin_perm('ai.manage') or is_knowledge_owner(department_id)));

create policy aiact_read on ai_actions for select to authenticated using (org_id = current_org() and (user_id = auth.uid() or is_admin() or has_admin_perm('ai.manage')));
create policy aiact_insert on ai_actions for insert to authenticated with check (org_id = current_org() and user_id = auth.uid());
create policy aiact_update on ai_actions for update to authenticated using (org_id = current_org() and user_id = auth.uid());

create policy aim_all on ai_memory for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy li_all on learning_interests for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- feedback routing: incorrect/outdated/unsafe → department knowledge owner (or head), notify
create or replace function ai_feedback_route() returns trigger
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if new.rating in ('incorrect','outdated','unsafe') then
    select user_id into target from ai_knowledge_owners where department_id = new.department_id limit 1;
    if target is null and new.department_id is not null then select head_id into target from departments where id = new.department_id; end if;
    if target is null then select (settings->>'primary_admin_id')::uuid into target from organizations where id = new.org_id; end if;
    new.routed_to := target;
    if target is not null then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (target, 'action_required', 'AI guidance flagged as ' || new.rating, coalesce(new.note, 'No details given') || ' — from ' || person_name(new.user_id), '/admin?tab=ai', 'ai_feedback', new.id, new.user_id);
    end if;
  end if;
  return new;
end $$;
create trigger ai_feedback_route before insert on ai_feedback for each row execute function ai_feedback_route();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
/** Approved knowledge search (permission-filtered by RLS); flags items past their review date. */
create or replace function search_knowledge(p_q text, p_department uuid default null, p_limit int default 6)
returns table(id uuid, title text, kind text, department_id uuid, snippet text, review_at date, outdated boolean, rank real)
language sql stable security invoker set search_path = public as $$
  select k.id, k.title, k.kind, k.department_id, left(k.body, 600), k.review_at, (k.review_at is not null and k.review_at < current_date),
         ts_rank(k.search, websearch_to_tsquery('english', p_q))
    from ai_knowledge k
   where k.status = 'approved'
     and (p_department is null or k.department_id = p_department or k.department_id is null)
     and (k.search @@ websearch_to_tsquery('english', p_q) or k.title ilike '%' || p_q || '%')
   order by (k.department_id = p_department) desc nulls last, 8 desc, k.approved_at desc
   limit p_limit
$$;

/** Find people who can help: skills, designation, responsibilities, department — with availability and open work. */
create or replace function find_experts(p_q text, p_limit int default 8)
returns table(id uuid, full_name text, designation text, department_id uuid, department_name text, presence presence_status, skills text[], open_tasks int, matched_on text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.designation, p.department_id, d.name, p.presence, p.skills,
         (select count(*)::int from tasks t where t.assignee_id = p.id and t.status not in ('done','cancelled')),
         case when exists (select 1 from unnest(p.skills) s where s ilike '%' || p_q || '%') then 'skill'
              when p.designation ilike '%' || p_q || '%' then 'designation'
              when p.responsibilities ilike '%' || p_q || '%' then 'responsibilities'
              when d.name ilike '%' || p_q || '%' then 'department'
              else 'endorsement' end
    from profiles p left join departments d on d.id = p.department_id
   where p.org_id = current_org() and p.is_active and is_active_member()
     and (exists (select 1 from unnest(p.skills) s where s ilike '%' || p_q || '%')
          or p.designation ilike '%' || p_q || '%' or p.responsibilities ilike '%' || p_q || '%' or d.name ilike '%' || p_q || '%')
   order by (p.presence in ('available','remote')) desc, 8 asc
   limit p_limit
$$;

/** Things that match the query but the caller may NOT see — so the Buddy can say "found, but restricted" and offer Request Access.
    Returns generic labels for highly confidential material. */
create or replace function restricted_hits(p_q text, p_limit int default 5)
returns table(resource_type text, resource_id uuid, label text, approver_id uuid, classification classification)
language sql stable security definer set search_path = public as $$
  (select 'project', pr.id, case when pr.classification in ('highly_confidential','board_only') then 'A restricted project' else pr.name end, pr.owner_id, pr.classification
     from projects pr where pr.org_id = current_org() and not pr.archived and pr.name ilike '%' || p_q || '%' and not can_view_project(pr.id) limit p_limit)
  union all
  (select 'file', f.id, case when f.classification in ('highly_confidential','board_only') then 'A restricted file' else f.name end, f.owner_id, f.classification
     from files f where f.org_id = current_org() and f.name ilike '%' || p_q || '%'
      and not (has_grant('file', f.id) or (can_view_classification(f.classification) and (f.project_id is null or can_view_project(f.project_id)))) limit p_limit)
  union all
  (select 'wiki', w.id, case when w.classification in ('highly_confidential','board_only') then 'A restricted page' else w.title end, w.author_id, w.classification
     from wiki_pages w where w.org_id = current_org() and w.title ilike '%' || p_q || '%' and not can_view_classification(w.classification) limit p_limit)
  union all
  (select 'channel', c.id, case when c.visibility in ('confidential','executive_only') then 'A restricted room' else '#' || c.name end, c.owner_id, c.classification
     from channels c where c.org_id = current_org() and not c.archived and c.type <> 'dm' and c.name ilike '%' || p_q || '%' and not can_view_channel(c.id) limit p_limit)
$$;

/** Why is this blocked? Walk dependencies, waiting-on, pending approvals and handoffs. */
create or replace function blocker_chain(p_task uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t tasks%rowtype; chain jsonb := '[]'::jsonb; cur uuid; guard int := 0; dep record; ap record;
begin
  if not can_view_task(p_task) then return jsonb_build_object('error','forbidden'); end if;
  cur := p_task;
  while cur is not null and guard < 8 loop
    guard := guard + 1;
    select * into t from tasks where id = cur;
    exit when t.id is null;
    chain := chain || jsonb_build_object('task_id', t.id, 'title', t.title, 'status', t.status, 'assignee', person_name(t.assignee_id), 'assignee_id', t.assignee_id,
      'department', (select name from departments where id = t.department_id), 'waiting_on', t.waiting_on, 'waiting_on_user', person_name(t.waiting_on_user_id), 'waiting_note', t.waiting_note,
      'due', t.due_date, 'age_days', extract(day from now() - t.updated_at)::int,
      'pending_approval', (select jsonb_build_object('id', a.id, 'title', a.title, 'approver', person_name(a.approver_id), 'approver_id', a.approver_id, 'age_hours', extract(epoch from now() - a.created_at)::int/3600)
                             from approvals a where a.task_id = t.id and a.status = 'pending' order by a.created_at limit 1),
      'pending_handoff', (select jsonb_build_object('to_department', (select name from departments where id = h.to_department_id), 'age_hours', extract(epoch from now() - h.created_at)::int/3600)
                             from handoffs h where h.task_id = t.id and h.status = 'pending' limit 1));
    -- next hop: an incomplete dependency, else the task the waiting_on user is blocked by
    select d.depends_on_id into cur from task_dependencies d join tasks x on x.id = d.depends_on_id where d.task_id = t.id and x.status not in ('done','cancelled') order by x.due_date nulls last limit 1;
    if cur is null and t.waiting_on_user_id is not null then
      select x.id into cur from tasks x where x.assignee_id = t.waiting_on_user_id and x.status in ('blocked','waiting') and x.id <> t.id order by x.updated_at desc limit 1;
    end if;
    if cur is not null and chain @> jsonb_build_array(jsonb_build_object('task_id', cur)) then exit; end if;
  end loop;
  return jsonb_build_object('chain', chain, 'root', chain -> (jsonb_array_length(chain) - 1));
end $$;

/** Department morning brief for the department head / manager buddy. */
create or replace function department_brief(p_department uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not (is_manager_plus() or current_department() = p_department) then jsonb_build_object('error','forbidden') else jsonb_build_object(
    'department', (select name from departments where id = p_department),
    'status', (select status from departments where id = p_department),
    'on_duty', (select person_name(on_duty_user_id) from departments where id = p_department),
    'people', (select count(*) from profiles where department_id = p_department and is_active),
    'present_today', (select count(*) from attendance_days a join profiles p on p.id = a.user_id where p.department_id = p_department and a.day = (now() at time zone 'Asia/Kolkata')::date and a.status not in ('leave','absent')),
    'on_leave', (select coalesce(jsonb_agg(person_name(l.user_id)), '[]') from leaves l join profiles p on p.id = l.user_id where p.department_id = p_department and l.status = 'approved' and (now() at time zone 'Asia/Kolkata')::date between l.starts_on and l.ends_on),
    'critical_requests', (select count(*) from help_requests where department_id = p_department and priority = 'critical' and status in ('new','accepted','working','waiting')),
    'requests_over_sla', (select count(*) from help_requests where department_id = p_department and status = 'new' and ack_due_at < now()),
    'requests_open', (select count(*) from help_requests where department_id = p_department and status in ('new','accepted','working','waiting')),
    'overdue_tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'assignee', person_name(assignee_id), 'due', due_date)), '[]') from (select * from tasks where department_id = p_department and status not in ('done','cancelled') and due_date < now() order by due_date limit 8) x),
    'blocked_tasks', (select count(*) from tasks where department_id = p_department and status in ('blocked','waiting')),
    'today_events', (select coalesce(jsonb_agg(jsonb_build_object('title', title, 'kind', kind, 'at', starts_at)), '[]') from calendar_events where (department_id = p_department or department_id is null) and (starts_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date and kind in ('release','deadline','event','compliance','milestone','client_meeting')),
    'pending_approvals', (select count(*) from approvals a join profiles p on p.id = a.approver_id where p.department_id = p_department and a.status = 'pending')
  ) end
$$;

/** Requests today for the daily limit. */
create or replace function ai_requests_today() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from ai_usage where user_id = auth.uid() and feature like 'buddy%' and created_at > date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'
$$;

grant execute on function search_knowledge(text,uuid,int), find_experts(text,int), restricted_hits(text,int), blocker_chain(uuid), department_brief(uuid), ai_requests_today(), is_knowledge_owner(uuid) to authenticated;
revoke execute on function search_knowledge(text,uuid,int), find_experts(text,int), restricted_hits(text,int), blocker_chain(uuid), department_brief(uuid), ai_requests_today(), is_knowledge_owner(uuid), ai_knowledge_guard(), ai_feedback_route() from anon, public;

-- ---------------------------------------------------------------------------
-- SEED: assistants + starter knowledge (how GHL ONE works — process guidance, not company policy)
-- ---------------------------------------------------------------------------
insert into ai_assistants (org_id, key, name, description, personality, department_ids, position)
select '00000000-0000-0000-0000-000000000001', v.key, v.name, v.description, v.personality,
       case when v.slugs is null then null else (select array_agg(d.id) from departments d where d.org_id = '00000000-0000-0000-0000-000000000001' and d.slug = any(v.slugs)) end, v.pos
from (values
  ('general', 'GHL Buddy', 'Everyone''s work companion.', 'You are GHL Buddy: calm, clear, warm, practical. Speak like a capable colleague who knows the company. Move the person toward the next useful action.', null::text[], 0),
  ('it', 'IT Buddy', 'Debugging, architecture, deployments, incidents.', 'You are IT Buddy: technical and precise. Reason like a senior engineer pairing with a colleague. Ask for the exact error, environment and what changed. Give ordered checks, what to inspect, what NOT to change, and how to verify. Project stack: Next.js, React, Supabase/PostgreSQL, Node. If the person says production is down, switch to incident mode: check status, scope, create incident, notify the responsible team, start a war room, capture logs, record a timeline.', array['technology'], 1),
  ('sales', 'Sales Buddy', 'Client questions, objections, call prep.', 'You are Sales Buddy: fast, persuasive, compliant. When a client question is forwarded, first say what the client is really asking (trust, differentiation, risk, value), then a short usable response structure. Never invent guarantees, pricing, performance figures, legal claims or commitments; if it is not in approved knowledge say "Don''t guess. Confirm this with your manager." Offer roleplay and next-best-action (follow-up, meeting, send document, ask question, escalate, wait).', array['sales','bizdev','investor-relations'], 2),
  ('support', 'Support Buddy', 'Diagnose, find the SOP, escalate cleanly.', 'You are Support Buddy: patient and diagnostic. Classify the issue, ask 2-3 narrowing questions, find the SOP, suggest troubleshooting, and when IT is needed produce a structured escalation (customer issue, troubleshooting done, screenshots, logs, priority, impact). Draft customer-safe replies only from approved information; the employee reviews before sending.', array['support'], 3),
  ('design', 'Design Buddy', 'Briefs, brand rules, review, handoff.', 'You are Design Buddy: visual and brief-driven. Clarify vague requests by listing the missing items (size, platform, copy, deadline, audience, brand version, approval owner) and offer to ask the requester. Break work into research → copy handoff → concept → draft → review → revision → export → approval. Reviews cover hierarchy, spacing, readability, brand consistency and missing information — assist, never replace taste.', array['design'], 4),
  ('content', 'Content Buddy', 'Briefs, outlines, drafts, quality checks.', 'You are Content Buddy: clear and language-focused. Extract audience, objective, tone, length, deadline, required facts, CTA and approver from a brief. Offer openings and structure without taking over. Clearly separate approved company information, draft information, employee-provided information and unknowns; never turn uncertain claims into copy. Quality checks: grammar, clarity, consistency, repetition, brand terminology, unsupported claims, missing CTA.', array['content','marketing'], 5),
  ('hr', 'HR Buddy', 'Policies, attendance, leave, onboarding.', 'You are HR Buddy: policy-focused and discreet. Answer from approved policies and the person''s own authorised data (their balances, their attendance). Explain the process and offer the action (create leave request, request correction). Never change records yourself. For recruitment help, avoid protected characteristics entirely.', array['hr','admin'], 6),
  ('manager', 'Manager Buddy', 'Focus, delegation, workload, blockers.', 'You are Manager Buddy. For "what should I focus on" weigh team workload, deadlines, blocked tasks, approvals waiting, attendance coverage and open requests. For delays, show the actual chain (who is waiting on whom, for how long) — never a vague score. For "who can take this" consider skills, current load, availability and deadline. Prepare meetings with open issues, previous decisions, outstanding actions and files.', null, 7),
  ('department_head', 'Department Head Buddy', 'Capacity, requests, SLA, staffing.', 'You are Department Head Buddy. Lead with the department morning brief: critical requests, who is out, requests over SLA, deployments/events today, overdue and blocked work, approvals waiting. Think in capacity, SLA and cross-department dependencies.', null, 8),
  ('new_joiner', 'New Joiner Buddy', 'First weeks, who is who, how things work.', 'You are New Joiner Buddy: extra patient and encouraging. Explain who is who, what departments do, how to request leave, where files live, what to work on today. Guide the first week day by day without overwhelming. Offer the 2-minute explanation before the full guide.', null, 9)
) as v(key, name, description, personality, slugs, pos);

insert into ai_knowledge (org_id, title, body, kind, tags, status, approved_at, review_at, source_type, created_by)
select '00000000-0000-0000-0000-000000000001', v.title, v.body, v.kind, v.tags, 'approved', now(), current_date + 365, 'manual', null
from (values
  ('How to request leave in GHL ONE', E'1. Open **Leave** in the left navigation.\n2. Check your balances per leave type at the top.\n3. Click **Apply for leave**, choose the type, dates (half-day if needed) and reason.\n4. Pick a backup person and hand over open tasks — the system restores them when you return.\n5. Review the impact preview (who else is off, deadlines in that period), then submit.\n\nFlow: you → your manager → HR (only for leave types that require HR). You are notified at each step; approved leave appears on the team calendar and sets your status to *On leave*.', 'guide', array['leave','self-service'], 'faq'),
  ('How attendance works (and how to fix a missed clock-out)', E'Clock in from the clock pill in the top bar (office / remote / field / client visit / travel / training / half-day). Breaks pause your working time. Clock out at the end of the day.\n\nWhat is recorded: your clock in/out times, mode, optional note, and — only if you tick *share my location for this check-in* — a one-time location. Nothing is tracked continuously; there is no keystroke, screen, webcam or microphone monitoring. You can see everything recorded about you in **Privacy Center** on your profile.\n\nForgot to clock out? Open **Attendance → Corrections** and request a correction, or ask HR via **Help Desk → HR → Attendance correction**. The AI never changes attendance records itself.', 'guide', array['attendance','privacy','self-service'], 'faq'),
  ('How to ask another department for help', E'Use **Help Desk** → pick the department → choose a request type (or *Something else*). Fill the short form, set priority and the date you need it by. Every request gets an **owner** in that department (no "someone will look at it"), an acknowledgement target (SLA), and — once accepted — its own conversation room with you and the owner. Requests that are not acknowledged in time escalate automatically along the department''s escalation matrix.\n\nFor company-wide questions post in **#help** in GHL Common. For urgent operational problems use *Urgent assistance*.', 'guide', array['help desk','requests','sla'], 'faq'),
  ('Request access instead of Access denied', E'If a project, file, room or page is restricted you will see **Request access**. Say what you need (view / comment / edit / download), why, and for how long (once, until a date, while the project is active, permanent). The data owner — or the primary admin for high-risk material — approves. Temporary access is revoked automatically when it expires and every grant is audited. You can see who can see a resource and *why* from the resource''s menu (managers) or ask GHL Buddy.', 'guide', array['access','permissions','security'], 'faq'),
  ('Focus sessions and timesheets', E'Start a **focus session** from a task (Attendance → Timesheet or the task page): your status becomes *Focus time* with the task name, notifications are quieter, and time is logged voluntarily against the task. Timesheets are suggested from tasks, focus sessions, meetings and approved work events — you confirm them. Nothing is inferred from mouse or keyboard activity.', 'guide', array['focus','timesheet','productivity'], 'faq'),
  ('Rooms, groups and bringing someone in', E'Anyone can create a room from GHL Common (**Create room**): group, temporary (auto-archives on a date), team, social, client or vendor. Every room has an owner, a purpose and a visibility (company-open, department, invite-only, private, confidential, executive-only) shown in the header. Inside any conversation use **Add people → Bring someone in** with a reason and optional access expiry; they get *Catch me up* so they don''t need the whole history. A room can be converted into a project with one click.', 'guide', array['chat','groups','collaboration'], 'faq')
) as v(title, body, kind, tags, k2);

alter publication supabase_realtime add table ai_actions;
