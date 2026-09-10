-- 0045 — Take the unauthenticated caller off the SECURITY DEFINER functions that never needed it.
--
-- A new function is granted to PUBLIC by default, and PUBLIC includes `anon` — the role the app's
-- own publishable key uses before anybody signs in. Most functions here defend themselves (they
-- check `auth.uid()`, `has_perm`, a shared secret, or a guest token), but these ten carried no
-- internal check at all and relied entirely on nobody thinking to POST to `/rpc/<name>`. Each is
-- reached legitimately by signed-in users, by an RLS policy, or by pg_cron — never by a stranger:
--
--   live_tick, tenant_usage_snapshot                      maintenance run by pg_cron
--   company_go_live_blockers, company_setup_health        platform console reads
--   huddle_suggestion                                     reads a channel's recent messages
--   candidate_org, candidate_owner, meeting_org,          row-ownership helpers used inside
--     meeting_project, workflow_run_starter               RLS policies
--
-- `authenticated` keeps EXECUTE on the policy helpers, because a policy is evaluated as the
-- calling role and would otherwise fail closed for everyone. This removes the anonymous path only.
--
-- `workspaces_for_email` stays anon-callable on purpose: the sign-in screen has to answer "which
-- companies does this address belong to" before there is a session.
--
-- The lesson, already recorded in CLAUDE.md for the access-control RPCs: revoking from `anon`
-- alone does nothing while the PUBLIC grant stands. Revoke from both, then grant back deliberately.

revoke execute on function public.live_tick() from public, anon;
revoke execute on function public.tenant_usage_snapshot() from public, anon;
revoke execute on function public.company_go_live_blockers(uuid) from public, anon;
revoke execute on function public.company_setup_health(uuid) from public, anon;
revoke execute on function public.huddle_suggestion(uuid) from public, anon;
revoke execute on function public.candidate_org(uuid) from public, anon;
revoke execute on function public.candidate_owner(uuid) from public, anon;
revoke execute on function public.meeting_org(uuid) from public, anon;
revoke execute on function public.meeting_project(uuid) from public, anon;
revoke execute on function public.workflow_run_starter(uuid) from public, anon;

grant execute on function public.company_go_live_blockers(uuid) to authenticated;
grant execute on function public.company_setup_health(uuid) to authenticated;
grant execute on function public.huddle_suggestion(uuid) to authenticated;
grant execute on function public.candidate_org(uuid) to authenticated;
grant execute on function public.candidate_owner(uuid) to authenticated;
grant execute on function public.meeting_org(uuid) to authenticated;
grant execute on function public.meeting_project(uuid) to authenticated;
grant execute on function public.workflow_run_starter(uuid) to authenticated;
