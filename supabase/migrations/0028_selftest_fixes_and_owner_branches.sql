-- ============================================================================
-- 0028 — Acting on the FIRST run of the self-test suite (0026).
--
-- 1. test_rls_role_sweep() could never run: PostgreSQL forbids SET ROLE inside a
--    SECURITY DEFINER context, so the sweep's own false-pass guard fired on every
--    call. It failed CLOSED (honest), but the single most valuable regression
--    check in the suite was inert. Authorisation is unaffected — the gate is
--    selftest_allowed(), which stays SECURITY DEFINER.
-- 2. Six SELECT policies delegated only to a STABLE helper, which reads the
--    pre-insert snapshot and cannot see the row the current statement just wrote.
--    Same bug that broke boards/live_docs in 0021. A direct creator branch fixes
--    .insert().select() and only re-grants someone read access to their own row.
--    The membership/junction tables the suite also flagged are deliberately NOT
--    changed — see 0030 for why.
-- 3. _probe_log was a debugging scratch table left in production with RLS off.
-- ============================================================================
drop table if exists public._probe_log;

alter function test_rls_role_sweep() security invoker;

drop policy if exists ch_read on channels;
create policy ch_read on channels for select to authenticated
  using (created_by = auth.uid() or owner_id = auth.uid() or can_view_channel(id));

drop policy if exists ct_read on contacts;
create policy ct_read on contacts for select to authenticated
  using (created_by = auth.uid() or owner_id = auth.uid() or can_view_contact(id));

drop policy if exists cv_read on conversations;
create policy cv_read on conversations for select to authenticated
  using (created_by = auth.uid() or can_view_conversation(id));

drop policy if exists ib_read on inboxes;
create policy ib_read on inboxes for select to authenticated
  using (org_id = current_org() and (created_by = auth.uid() or is_inbox_member(id) or has_perm('connect.manage')));

drop policy if exists projects_read on projects;
create policy projects_read on projects for select to authenticated
  using (created_by = auth.uid() or owner_id = auth.uid() or can_view_project(id));

drop policy if exists tasks_read on tasks;
create policy tasks_read on tasks for select to authenticated
  using (created_by = auth.uid() or owner_id = auth.uid() or can_view_task(id));
