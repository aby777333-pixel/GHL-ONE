-- 0034_bugfixes.sql — fixes for issues found in the September 2026 test rounds.
-- Additive and idempotent. Nothing is dropped that the app still relies on.

-- ---------------------------------------------------------------------------
-- 1. A direct message is between two people. Full stop.
--
-- `can_view_channel` ended with `or has_admin_perm('communication.manage')`, which is right for a
-- group / department / help channel an administrator has to be able to moderate — and wrong for a
-- DM. Because the same helper backs both `msg_read` and `msg_insert`, an administrator could read
-- *and post into* anybody's private one-to-one, which is exactly how a third name turned up in a
-- two-person conversation during testing. It also contradicts the product's own rule that
-- administrators see metadata, never content.
-- Every other branch is unchanged, so moderation of non-DM channels still works.
-- ---------------------------------------------------------------------------
create or replace function public.can_view_channel(c uuid)
returns boolean
language sql
stable security definer
set search_path to 'public', 'extensions'
as $$
  select exists (
    select 1 from channels ch
    where ch.id = c and ch.org_id = current_org()
      and (
        is_channel_member(c)
        or (ch.visibility = 'company_open' and is_internal())
        or (ch.visibility = 'department_open' and is_internal() and (ch.department_id = current_department() or ch.department_id is null or current_department() = any(ch.department_ids)))
        or (ch.type = 'project' and ch.project_id is not null and can_view_project(ch.project_id))
        or (ch.visibility = 'executive_only' and is_admin())
        -- Administrative override — never for a direct message.
        or (ch.type <> 'dm' and has_admin_perm('communication.manage'))
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- 2. A private call is between the people invited to it.
--
-- `can_view_live_room` ended with `or is_manager_plus() or has_admin_perm('communication.manage')`,
-- so any manager could see — and therefore `join_live_room` would admit — every room in the
-- company, including a one-to-one call. Testers hit this directly: "I was trying to call Priya
-- Nair but somebody else joined the call."
-- Everything an administrator is legitimately entitled to see is already covered by the branches
-- that remain (host, co-host, participant, invitee, the room's channel or project, department- and
-- company-visible rooms, town halls, breakout parents). Administrative *metadata* continues to come
-- from `live_governance()`, which is SECURITY DEFINER and is not affected by this.
-- ---------------------------------------------------------------------------
create or replace function public.can_view_live_room(r uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
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
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. Withdrawing your own pending request.
--
-- `rq_update` had a USING clause and no WITH CHECK. Postgres then uses USING as the check, and the
-- requester's branch is `user_id = auth.uid() and status = 'pending'` — which the *new* row fails
-- the moment the status becomes anything else. Withdraw was therefore rejected every time.
-- The requester may now move their own pending request to cancelled; approvers and HR are
-- unchanged.
-- ---------------------------------------------------------------------------
drop policy if exists rq_update on public.requests;
create policy rq_update on public.requests for update
  using (
    org_id = current_org() and (
      approver_id = auth.uid()
      or second_approver_id = auth.uid()
      or is_hr()
      or (user_id = auth.uid() and status = 'pending')
    )
  )
  with check (
    org_id = current_org() and (
      approver_id = auth.uid()
      or second_approver_id = auth.uid()
      or is_hr()
      or (user_id = auth.uid() and status in ('pending', 'cancelled'))
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Editing or cancelling your own pending equipment request — same defect, same fix.
-- ---------------------------------------------------------------------------
drop policy if exists ar_update on public.asset_requests;
create policy ar_update on public.asset_requests for update
  using (
    org_id = current_org() and (
      approver_id = auth.uid()
      or is_hr()
      or has_admin_perm('system.manage')
      or (user_id = auth.uid() and status = 'pending')
    )
  )
  with check (
    org_id = current_org() and (
      approver_id = auth.uid()
      or is_hr()
      or has_admin_perm('system.manage')
      or (user_id = auth.uid() and status in ('pending', 'cancelled'))
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Removing a document you uploaded yourself.
--
-- `ed_self_insert` let an employee upload into their own folder, but the only write policy beyond
-- it was HR-only, so an employee could add a document and never take it back out. HR-supplied
-- documents stay HR's to remove — this covers only rows the employee uploaded about themselves.
-- ---------------------------------------------------------------------------
drop policy if exists ed_self_delete on public.employee_documents;
create policy ed_self_delete on public.employee_documents for delete
  using (org_id = current_org() and user_id = auth.uid() and uploaded_by = auth.uid());

drop policy if exists ed_self_update on public.employee_documents;
create policy ed_self_update on public.employee_documents for update
  using (org_id = current_org() and user_id = auth.uid() and uploaded_by = auth.uid())
  with check (org_id = current_org() and user_id = auth.uid() and uploaded_by = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. Cancelling a scheduled meeting.
--
-- There was no way to call one off: the organiser could only leave it on everyone's calendar.
-- Cancelling keeps the row (and its notes, decisions and actions) and marks it, so the history
-- survives and participants are told.
-- ---------------------------------------------------------------------------
alter table public.meetings add column if not exists cancelled_at timestamptz;
alter table public.meetings add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;
alter table public.meetings add column if not exists cancel_reason text;

create or replace function public.cancel_meeting(p_meeting uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  m public.meetings%rowtype;
  me uuid := auth.uid();
  target uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into m from public.meetings where id = p_meeting and org_id = current_org();
  if m.id is null then raise exception 'meeting not found'; end if;
  -- Only the organiser, or somebody who administers meetings, may call one off.
  if not (m.organizer_id = me or is_manager_plus() or has_admin_perm('communication.manage')) then
    raise exception 'not allowed to cancel this meeting';
  end if;
  if m.cancelled_at is not null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  update public.meetings
     set cancelled_at = now(), cancelled_by = me, cancel_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_meeting;

  -- Tell everyone who was expected there (the organiser already knows).
  for target in
    select mp.user_id from public.meeting_participants mp where mp.meeting_id = p_meeting and mp.user_id <> me
    union
    select m.organizer_id where m.organizer_id is not null and m.organizer_id <> me
  loop
    insert into public.notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (
      target, m.org_id, 'information',
      'Meeting cancelled: ' || m.title,
      coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'The organiser cancelled this meeting.'),
      '/meetings/' || p_meeting::text, 'meeting', p_meeting, me
    );
  end loop;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.cancel_meeting(uuid, text) from public;
grant execute on function public.cancel_meeting(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Nobody approves their own request.
--
-- The approval workflow accepted `requested_by = approver_id`, which is not an approval at all —
-- one row in the test data was raised and approved by the same person. Enforced in the database so
-- the API and any future caller are covered, not only the picker in the UI.
-- Existing rows are left exactly as they are; this guards new and re-pointed ones.
-- ---------------------------------------------------------------------------
create or replace function public.approvals_no_self()
returns trigger
language plpgsql
as $$
begin
  if new.approver_id is not null and new.approver_id = new.requested_by then
    raise exception 'You cannot assign an approval to yourself. Pick a different approver.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_approvals_no_self on public.approvals;
create trigger trg_approvals_no_self
  before insert or update of approver_id, requested_by on public.approvals
  for each row execute function public.approvals_no_self();

-- ---------------------------------------------------------------------------
-- 8. Nobody mentors themselves.
-- ---------------------------------------------------------------------------
create or replace function public.mentorships_no_self()
returns trigger
language plpgsql
as $$
begin
  if new.mentor_id = new.mentee_id then
    raise exception 'You cannot select yourself as a mentor.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_mentorships_no_self on public.mentorships;
create trigger trg_mentorships_no_self
  before insert or update of mentor_id, mentee_id on public.mentorships
  for each row execute function public.mentorships_no_self();

-- ---------------------------------------------------------------------------
-- 9. You do not apply to the opening you are hiring for.
--
-- The internal job board showed an Apply button to the person who posted the role.
-- ---------------------------------------------------------------------------
create or replace function public.applications_not_own_opening()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare j public.job_openings%rowtype;
begin
  select * into j from public.job_openings where id = new.job_id;
  if j.id is not null and (j.hiring_manager_id = new.user_id or j.created_by = new.user_id) then
    raise exception 'You cannot apply to an opening you posted or are hiring for.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_applications_not_own_opening on public.internal_applications;
create trigger trg_applications_not_own_opening
  before insert on public.internal_applications
  for each row execute function public.applications_not_own_opening();
