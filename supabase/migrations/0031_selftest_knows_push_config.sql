-- ============================================================================
-- 0031 / 0032 — Teach the self-test about `push_config`.
--
-- push_config holds the shared push webhook secret. It is deliberately SEALED:
-- RLS on, ZERO policies, grants revoked from anon and authenticated, so only
-- SECURITY DEFINER code and the service role can ever read it.
--
-- The suite correctly noticed and reported that 17 times — "RLS enabled but no
-- policies", plus "permission denied" once per role in the sweep. Both are the
-- intended state, not defects. The right answer is to tell the suite the table is
-- a platform-level object, NOT to loosen the table. It stays sealed.
-- ============================================================================
create or replace function selftest_global_tables() returns text[]
language sql immutable set search_path = public as $$
  select array[
    'organizations','screens','platform_features','company_templates','platform_admins',
    'platform_admin_invites','platform_assignments','platform_audit_logs','platform_announcements',
    'memberships','active_workspace','break_glass_sessions','support_sessions','federations',
    'federation_members','tenant_usage','org_features','employee_imports','company_invites',
    'company_onboarding','push_config'
  ]::text[]
$$;

-- The role sweep keeps its own list: asking "can a normal user read this without erroring"
-- is not a meaningful question for a table no user may touch at all.
create or replace function selftest_platform_only_tables() returns text[]
language sql immutable set search_path = public as $$
  select array[
    'platform_admins','platform_admin_invites','platform_assignments','platform_audit_logs',
    'platform_announcements','platform_features','break_glass_sessions','support_sessions',
    'tenant_usage','company_templates','federations','federation_members','push_config'
  ]::text[]
$$;
