-- 0068 — close the grants 0060–0067 left open (found by the database linter)
--
-- Two defects, both introduced by the Buddy work, both with the same root cause: **in this project
-- a new function does not arrive ungranted.** Supabase's default privileges grant EXECUTE on every
-- new function in `public` to `anon`, `authenticated` and `service_role`, so a function is reachable
-- the moment it is created — and `revoke ... from public` does not take that away, because the
-- grant is explicit rather than inherited from PUBLIC. 0045 and 0059 recorded this lesson for RPCs;
-- these are the places the new work failed to apply it.
--
-- 1. FOUR TRIGGER FUNCTIONS WERE REACHABLE BY `anon`. Calling one over PostgREST raises ("can only
--    be called as a trigger"), so nothing could be done with them — but the standard here is that
--    nothing anonymous reaches a SECURITY DEFINER function at all, and `notify_account_change` from
--    0052 correctly follows it. **A trigger function needs no EXECUTE grant for its trigger to
--    fire** — the trigger runs as the table owner — so revoking costs nothing. Verified after: the
--    sign-up, approval and memory-history triggers all still fire.
--
-- 2. `buddy_scan` AND `buddy_scan_all` WERE EXECUTABLE BY ANY SIGNED-IN MEMBER. 0066 revoked them
--    from `public, anon`, granted them to nobody, and its own comment claims they are "not granted
--    to `authenticated` at all" — which was false. Any member could have generated nudges for any
--    colleague, or run the whole company's scan on demand. The scan is the cron's job; now only the
--    cron can run it.
--
-- 3. `account_approvers(org, department)` answers "who may admit somebody in this company" for **any
--    org id passed to it**. It is only ever called from inside other SECURITY DEFINER functions,
--    which run as the owner and do not need the caller to hold the privilege — so granting it to
--    members gave them a way to ask that question about a company they are not in. User ids only,
--    but a cross-company answer nonetheless, and this product's first rule is that one company's
--    information never reaches another.
--
-- The lesson for anything added later: after creating a function, check
-- `has_function_privilege('anon'|'authenticated', oid, 'execute')` rather than assuming the revoke
-- covered it. The linter finds these (`anon_security_definer_function_executable`).

revoke all on function ai_memory_keep_history()            from public, anon, authenticated;
revoke all on function close_join_request_on_activation()  from public, anon, authenticated;
revoke all on function join_request_org_default()          from public, anon, authenticated;
revoke all on function notify_account_pending()            from public, anon, authenticated;

revoke all on function buddy_scan(uuid, int) from public, anon, authenticated;
revoke all on function buddy_scan_all()      from public, anon, authenticated;

revoke all on function account_approvers(uuid, uuid) from public, anon, authenticated;
