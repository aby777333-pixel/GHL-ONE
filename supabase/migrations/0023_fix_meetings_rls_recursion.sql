-- ============================================================================
-- 0023 — LIVE BUG FIX (pre-existing, found by the multi-tenant isolation sweep)
--
-- meetings.meet_read subqueried meeting_participants, whose mp_read subqueried
-- meetings → mutual RLS recursion. Organizers and managers short-circuit on an
-- earlier OR branch, so it only ever bit ORDINARY EMPLOYEES, who got
-- "infinite recursion detected in policy for relation meetings" on /meetings.
-- Break the cycle with SECURITY DEFINER helpers (the standard fix).
-- ============================================================================
create or replace function is_meeting_participant(p_meeting uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from meeting_participants mp where mp.meeting_id = p_meeting and mp.user_id = p_user)
$$;

create or replace function meeting_org(p_meeting uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select organizer_id from meetings where id = p_meeting
$$;

create or replace function meeting_project(p_meeting uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select project_id from meetings where id = p_meeting
$$;

drop policy if exists meet_read on meetings;
create policy meet_read on meetings for select to authenticated
  using (org_id = current_org() and (organizer_id = auth.uid() or is_manager_plus() or is_meeting_participant(id)
         or (project_id is not null and can_view_project(project_id))));

drop policy if exists meet_update on meetings;
create policy meet_update on meetings for update to authenticated
  using (org_id = current_org() and (organizer_id = auth.uid() or is_manager_plus() or is_meeting_participant(id)))
  with check (org_id = current_org());

drop policy if exists mp_read on meeting_participants;
create policy mp_read on meeting_participants for select to authenticated
  using (user_id = auth.uid() or meeting_org(meeting_id) = auth.uid() or is_manager_plus()
         or (meeting_project(meeting_id) is not null and can_view_project(meeting_project(meeting_id))));

drop policy if exists mp_write on meeting_participants;
create policy mp_write on meeting_participants for all to authenticated
  using (meeting_org(meeting_id) = auth.uid() or is_manager_plus())
  with check (meeting_org(meeting_id) = auth.uid() or is_manager_plus());

grant execute on function is_meeting_participant(uuid, uuid), meeting_org(uuid), meeting_project(uuid) to authenticated;
