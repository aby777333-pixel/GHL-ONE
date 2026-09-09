-- The role sweep uses its own list. `push_config` is a sealed platform secret (RLS on, no policies,
-- grants revoked) so "permission denied" for every application role is the CORRECT result — the
-- sweep asks "can a normal user read this table without erroring", which is not a meaningful
-- question for a table no user is ever allowed to touch. Add it to the platform-only list so the
-- sweep skips it, exactly as it already skips platform_admins and friends. The table itself is
-- unchanged and stays sealed.
create or replace function selftest_platform_only_tables() returns text[]
language sql immutable set search_path = public as $$
  select array[
    'platform_admins','platform_admin_invites','platform_assignments','platform_audit_logs',
    'platform_announcements','platform_features','break_glass_sessions','support_sessions',
    'tenant_usage','company_templates','federations','federation_members','push_config'
  ]::text[]
$$;
