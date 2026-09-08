-- ============================================================================
-- 0027 — Second round of RLS fixes, found by the new self-test suite (0026).
--
-- Three distinct problems in the same four policies:
--  1. MUTUAL RECURSION, same shape as the meetings bug fixed in 0023:
--       candidates.cand_read     -> interviews      -> candidates
--       workflow_runs.wr_read    -> workflow_steps  -> workflow_runs
--     Only bites users who fall through to the recursive OR branch, so HR and
--     managers never saw it.
--  2. BROKEN CORRELATIONS that silently denied access:
--       candidates:     `i.candidate_id = i.id`   (should correlate to candidates.id)
--       workflow_runs:  `s.run_id = s.id`         (should correlate to workflow_runs.id)
--     Written this way the subquery is effectively always false, so interview
--     panellists could not see their candidate and step owners could not see their run.
--  3. NO TENANT FILTER on `interviews`: the `is_hr()` branch had no org scoping,
--     so an HR user in company A could read company B's interviews. Harmless with
--     one tenant, a cross-company leak with two.
-- ============================================================================

create or replace function candidate_org(p_candidate uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from candidates where id = p_candidate
$$;

create or replace function candidate_owner(p_candidate uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select owner_id from candidates where id = p_candidate
$$;

create or replace function is_candidate_panelist(p_candidate uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from interviews i where i.candidate_id = p_candidate and p_user = any(i.panel))
$$;

create or replace function can_view_workflow_run(p_run uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workflow_runs r
     where r.id = p_run and r.org_id = current_org()
       and (is_hr() or is_manager_plus() or r.subject_user_id = auth.uid() or r.started_by = auth.uid())
  )
$$;

create or replace function workflow_run_starter(p_run uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select started_by from workflow_runs where id = p_run
$$;

create or replace function is_run_step_owner(p_run uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workflow_steps s where s.run_id = p_run and s.owner_id = p_user)
$$;

-- candidates: correlate properly, and reach interviews through a definer helper.
drop policy if exists cand_read on candidates;
create policy cand_read on candidates for select to authenticated
  using (org_id = current_org() and (
    is_hr() or owner_id = auth.uid()
    or exists (select 1 from job_openings j where j.id = candidates.job_id and j.hiring_manager_id = auth.uid())
    or is_candidate_panelist(id)));

-- interviews: tenant-scoped through the candidate, and no longer reads `candidates` directly.
drop policy if exists int_read on interviews;
create policy int_read on interviews for select to authenticated
  using (candidate_org(candidate_id) = current_org()
     and (auth.uid() = any(panel) or created_by = auth.uid() or is_hr() or candidate_owner(candidate_id) = auth.uid()));

drop policy if exists int_write on interviews;
create policy int_write on interviews for all to authenticated
  using (candidate_org(candidate_id) = current_org() and (auth.uid() = any(panel) or created_by = auth.uid() or is_hr()))
  with check (candidate_org(candidate_id) = current_org() and (auth.uid() = any(panel) or created_by = auth.uid() or is_hr()));

-- workflow runs and steps: correlate properly, and break the cycle both ways.
drop policy if exists wr_read on workflow_runs;
create policy wr_read on workflow_runs for select to authenticated
  using (org_id = current_org() and (
    is_hr() or is_manager_plus() or subject_user_id = auth.uid() or started_by = auth.uid()
    or is_run_step_owner(id)));

drop policy if exists ws_read on workflow_steps;
create policy ws_read on workflow_steps for select to authenticated
  using (owner_id = auth.uid() or can_view_workflow_run(run_id));

drop policy if exists ws_update on workflow_steps;
create policy ws_update on workflow_steps for update to authenticated
  using (owner_id = auth.uid() or is_hr() or workflow_run_starter(run_id) = auth.uid())
  with check (owner_id = auth.uid() or is_hr() or workflow_run_starter(run_id) = auth.uid());

grant execute on function candidate_org(uuid), candidate_owner(uuid), is_candidate_panelist(uuid, uuid),
  can_view_workflow_run(uuid), workflow_run_starter(uuid), is_run_step_owner(uuid, uuid) to authenticated;
