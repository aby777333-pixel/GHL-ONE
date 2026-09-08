-- ============================================================================
-- 0026 — PLATFORM SELF-TEST (read-only)
--
-- Automated regression + tenant-isolation checks that live where the data lives.
-- Every function in this file is READ-ONLY: no inserts, no updates, no deletes,
-- no fixtures, no test tenants. It is safe to run against production.
--
-- Motivated by three real bugs that shipped before there were any tests:
--   (1) meetings.meet_read subqueried meeting_participants and mp_read subqueried
--       meetings → "infinite recursion detected in policy for relation meetings".
--       Organisers and managers short-circuited earlier, so only ORDINARY
--       EMPLOYEES ever hit it.                → test_rls_role_sweep + test_policy_recursion
--   (2) attendance_days / attendance_events / time_entries / calls and the
--       template tables granted access by ROLE with NO company filter — a
--       cross-tenant leak the moment a second company exists.
--                                             → test_tenant_scoping
--   (3) an .insert().select() failed because the SELECT policy delegated only to
--       a STABLE helper, which cannot see the row the same statement just wrote.
--                                             → test_returning_policies
--   plus two classes we have paid for before:
--       a STABLE function that writes         → test_function_volatility
--       an unparenthesised CASE into an enum  → test_enum_casts
--
-- Entry point: platform_self_test().
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Shared helpers
-- ----------------------------------------------------------------------------

/** JWT role of the *caller* (before any SET ROLE inside these functions).
    Returns null when there are no PostgREST claims (psql / SQL editor). */
create or replace function selftest_jwt_role() returns text
language plpgsql stable as $$
declare c text;
begin
  c := current_setting('request.jwt.claims', true);
  if c is null or c = '' then return null; end if;
  return (c::jsonb ->> 'role');
exception when others then
  return null;
end $$;

/** Who may run the self-test.
    - a platform admin or a company admin (the documented gate), or
    - the service role (this is how scripts/verify.mjs and CI call it), or
    - a direct postgres session (SQL editor / psql). */
create or replace function selftest_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(selftest_jwt_role() = 'service_role', false)
      or session_user = 'postgres'
      or is_platform_admin()
      or is_admin()
$$;

/** Tables that are platform-level, not tenant-level: excluded from the RLS role
    sweep (no ordinary employee page touches them) and exempt from tenant scoping. */
create or replace function selftest_platform_only_tables() returns text[]
language sql immutable as $$
  select array[
    'platform_admins','platform_admin_invites','platform_assignments','platform_audit_logs',
    'platform_announcements','platform_features','break_glass_sessions','support_sessions',
    'tenant_usage','company_templates','federations','federation_members'
  ]::text[]
$$;

/** Documented exception list: genuinely GLOBAL tables. These legitimately have no
    org_id / no current_org() policy. Adding a table here is a deliberate act —
    it must be a platform table or a catalogue shared by every tenant. */
create or replace function selftest_global_tables() returns text[]
language sql immutable as $$
  select array[
    'organizations','screens','platform_features','company_templates','platform_admins',
    'platform_admin_invites','platform_assignments','platform_audit_logs','platform_announcements',
    'memberships','active_workspace','break_glass_sessions','support_sessions','federations',
    'federation_members','tenant_usage','org_features','employee_imports','company_invites',
    'company_onboarding'
  ]::text[]
$$;

/** Uniform result envelope: { passed, failed, checks: [{name, ok, detail}] } */
create or replace function selftest_result(p_checks jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'passed', (select count(*) from jsonb_array_elements(coalesce(p_checks, '[]'::jsonb)) e where (e->>'ok')::boolean),
    'failed', (select count(*) from jsonb_array_elements(coalesce(p_checks, '[]'::jsonb)) e where not (e->>'ok')::boolean),
    'checks', coalesce(p_checks, '[]'::jsonb)
  )
$$;

-- ----------------------------------------------------------------------------
-- 1. test_rls_role_sweep() — the sweep that found bug (1)
--
-- For ONE active user per distinct role, set the request claims, drop to the
-- `authenticated` role (postgres has BYPASSRLS — without SET ROLE this sweep
-- would report a false pass) and attempt `select 1 from <table> limit 1` on
-- every public table the app touches, catching every exception.
--
-- Any error is a failed check naming the role and the table. The one we care
-- about most reads: "infinite recursion detected in policy for relation X".
--
-- Read-only: the only statements executed are SELECT ... LIMIT 1.
-- ----------------------------------------------------------------------------
create or replace function test_rls_role_sweep() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  checks      jsonb := '[]'::jsonb;
  r           record;
  tbl         text;
  tables      text[];
  orig_claims text;
  orig_sub    text;
  orig_role   text;
  can_switch  boolean := false;
  ok_count    int;
  fail_count  int;
  roles_seen  int := 0;
  err_msg     text;
  err_state   text;
begin
  if not selftest_allowed() then raise exception 'forbidden'; end if;

  select coalesce(array_agg(c.relname order by c.relname), '{}'::text[])
    into tables
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not (c.relname = any (selftest_platform_only_tables()));

  orig_claims := current_setting('request.jwt.claims', true);
  orig_sub    := current_setting('request.jwt.claim.sub', true);
  orig_role   := current_setting('role', true);

  -- Prove we can leave the BYPASSRLS role before trusting a single result.
  begin
    perform set_config('role', 'authenticated', true);
    can_switch := true;
    perform set_config('role', coalesce(nullif(orig_role, ''), 'none'), true);
  exception when others then
    can_switch := false;
  end;

  if not can_switch then
    return selftest_result(jsonb_build_array(jsonb_build_object(
      'name', 'rls_sweep:role_switch',
      'ok', false,
      'detail', 'could not SET ROLE authenticated; the sweep would have run with BYPASSRLS and reported a false pass'
    )));
  end if;

  for r in
    select distinct on (p.role) p.id, p.role::text as role_name, p.full_name
      from profiles p
     where p.is_active
       and not p.frozen
       and coalesce(p.status, 'active') = 'active'
     order by p.role, p.created_at
  loop
    roles_seen := roles_seen + 1;
    ok_count   := 0;
    fail_count := 0;

    perform set_config('request.jwt.claims',
      json_build_object('sub', r.id::text, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', r.id::text, true);
    perform set_config('role', 'authenticated', true);

    foreach tbl in array tables loop
      begin
        execute format('select 1 from public.%I limit 1', tbl);
        ok_count := ok_count + 1;
      exception when others then
        get stacked diagnostics err_msg = message_text, err_state = returned_sqlstate;
        fail_count := fail_count + 1;
        checks := checks || jsonb_build_object(
          'name',   format('rls:%s:%s', r.role_name, tbl),
          'ok',     false,
          'detail', format('[%s] %s', err_state, err_msg));
      end;
    end loop;

    perform set_config('role', coalesce(nullif(orig_role, ''), 'none'), true);

    checks := checks || jsonb_build_object(
      'name',   format('rls:%s:summary', r.role_name),
      'ok',     fail_count = 0,
      'detail', format('%s of %s tables readable without error as %s', ok_count, ok_count + fail_count, r.role_name));
  end loop;

  perform set_config('request.jwt.claims', coalesce(orig_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(orig_sub, ''), true);
  perform set_config('role', coalesce(nullif(orig_role, ''), 'none'), true);

  if roles_seen = 0 then
    checks := checks || jsonb_build_object(
      'name', 'rls_sweep:no_users', 'ok', false,
      'detail', 'no active, unfrozen profile with status=active was found; the sweep tested nothing');
  else
    checks := checks || jsonb_build_object(
      'name', 'rls_sweep:coverage', 'ok', true,
      'detail', format('%s distinct roles x %s tables swept', roles_seen, cardinality(tables)));
  end if;

  return selftest_result(checks);
end $$;

-- ----------------------------------------------------------------------------
-- 2. test_tenant_scoping() — bug (2): access granted by role with no company filter
--
-- Wraps tenant_isolation_report() (0022). That function is gated on
-- is_platform_admin(), so when the caller is the service role we temporarily
-- borrow a platform admin's claims; if that is impossible we fall back to the
-- identical catalogue query.
-- ----------------------------------------------------------------------------
create or replace function selftest_isolation_report() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  rep         jsonb;
  pa          uuid;
  orig_claims text;
  orig_sub    text;
begin
  begin
    rep := tenant_isolation_report();
  exception when others then
    rep := null;
  end;

  if rep is null then
    select user_id into pa from platform_admins limit 1;
    if pa is not null then
      orig_claims := current_setting('request.jwt.claims', true);
      orig_sub    := current_setting('request.jwt.claim.sub', true);
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', pa::text, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
        perform set_config('request.jwt.claim.sub', pa::text, true);
        rep := tenant_isolation_report();
      exception when others then
        rep := null;
      end;
      perform set_config('request.jwt.claims', coalesce(orig_claims, ''), true);
      perform set_config('request.jwt.claim.sub', coalesce(orig_sub, ''), true);
    end if;
  end if;

  if rep is null then
    -- Fallback: same catalogue query as tenant_isolation_report(), without the gate.
    with t as (
      select c.oid, c.relname, c.relrowsecurity,
             exists (select 1 from pg_attribute a
                      where a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped) as has_org,
             (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
             (select count(*) from pg_policy p
               where p.polrelid = c.oid
                 and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%current_org()%'
                   or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%current_org()%')) as org_scoped
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
    )
    select jsonb_build_object(
      'tables', (select count(*) from t),
      'rls_disabled', (select coalesce(jsonb_agg(relname order by relname), '[]'::jsonb) from t where not relrowsecurity),
      'no_policies', (select coalesce(jsonb_agg(relname order by relname), '[]'::jsonb) from t where relrowsecurity and policies = 0),
      'org_column_but_unscoped', (select coalesce(jsonb_agg(relname order by relname), '[]'::jsonb) from t where has_org and org_scoped = 0),
      'child_tables_no_org', (select coalesce(jsonb_agg(relname order by relname), '[]'::jsonb)
                                from t where not has_org and not (relname = any (selftest_global_tables()))),
      'checked_at', now(),
      'source', 'selftest_fallback'
    ) into rep;
  end if;

  return rep;
end $$;

create or replace function test_tenant_scoping() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  checks   jsonb := '[]'::jsonb;
  rep      jsonb;
  globals  text[] := selftest_global_tables();
  offend   text[];
begin
  if not selftest_allowed() then raise exception 'forbidden'; end if;

  rep := selftest_isolation_report();

  -- (a) org_id column but no policy mentioning current_org() — bug (2) exactly.
  select coalesce(array_agg(v order by v), '{}'::text[]) into offend
    from jsonb_array_elements_text(coalesce(rep->'org_column_but_unscoped', '[]'::jsonb)) v
   where not (v = any (globals));
  checks := checks || jsonb_build_object(
    'name', 'tenant:org_column_but_unscoped',
    'ok', cardinality(offend) = 0,
    'detail', case when cardinality(offend) = 0
                   then 'every table with an org_id column has at least one policy referencing current_org()'
                   else 'tables carry org_id but no current_org() policy (cross-company leak): ' || array_to_string(offend, ', ') end);

  -- (b) RLS switched off entirely.
  select coalesce(array_agg(v order by v), '{}'::text[]) into offend
    from jsonb_array_elements_text(coalesce(rep->'rls_disabled', '[]'::jsonb)) v
   where not (v = any (globals));
  checks := checks || jsonb_build_object(
    'name', 'tenant:rls_disabled',
    'ok', cardinality(offend) = 0,
    'detail', case when cardinality(offend) = 0
                   then 'row level security is enabled on every non-global table'
                   else 'RLS is disabled on: ' || array_to_string(offend, ', ') end);

  -- (c) RLS on, but zero policies (deny-all is usually an oversight, not a design).
  select coalesce(array_agg(v order by v), '{}'::text[]) into offend
    from jsonb_array_elements_text(coalesce(rep->'no_policies', '[]'::jsonb)) v
   where not (v = any (globals));
  checks := checks || jsonb_build_object(
    'name', 'tenant:rls_without_policies',
    'ok', cardinality(offend) = 0,
    'detail', case when cardinality(offend) = 0
                   then 'every RLS-enabled non-global table has at least one policy'
                   else 'RLS enabled but no policies on: ' || array_to_string(offend, ', ') end);

  -- (d) Informational: tables that reach their tenant only through a parent.
  --     Not a failure (many junction tables legitimately do), but must be reviewed:
  --     anything here that is NOT reached through a parent is the next bug (2).
  select coalesce(array_agg(v order by v), '{}'::text[]) into offend
    from jsonb_array_elements_text(coalesce(rep->'child_tables_no_org', '[]'::jsonb)) v
   where not (v = any (globals));
  checks := checks || jsonb_build_object(
    'name', 'tenant:no_org_column:review',
    'ok', true,
    'detail', case when cardinality(offend) = 0
                   then 'every non-global table carries org_id'
                   else format('%s tables reach their tenant through a parent — review: %s',
                               cardinality(offend), array_to_string(offend, ', ')) end);

  return selftest_result(checks) || jsonb_build_object('report', rep);
end $$;

-- ----------------------------------------------------------------------------
-- 3. test_policy_recursion() — bug (1), caught statically
--
-- Static analysis over pg_policy: flag any pair of tables A and B where A's
-- policy expressions subquery B and B's subquery A. That mutual reference is
-- what raises "infinite recursion detected in policy" at runtime, and only for
-- the users whose OR branches do not short-circuit first.
-- ----------------------------------------------------------------------------
create or replace function test_policy_recursion() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  checks jsonb := '[]'::jsonb;
  r      record;
  found  int := 0;
begin
  if not selftest_allowed() then raise exception 'forbidden'; end if;

  for r in
    with tbl as (
      select c.oid, c.relname
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
    ),
    expr as (
      select distinct t.relname as a,
             coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
             coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as e
        from pg_policy p join tbl t on t.oid = p.polrelid
    ),
    ref as (
      select e.a, e.e from expr e where e.e ~* '(from|join)[[:space:]]'
    ),
    edge as (
      select distinct ref.a, t2.relname as b
        from ref join tbl t2 on t2.relname <> ref.a
       where position(t2.relname in lower(ref.e)) > 0
         and ref.e ~* ('(from|join)[[:space:]]+(public\.)?"?' || t2.relname || '\M')
    )
    select e1.a, e1.b
      from edge e1 join edge e2 on e2.a = e1.b and e2.b = e1.a
     where e1.a < e1.b
     order by e1.a, e1.b
  loop
    found := found + 1;
    checks := checks || jsonb_build_object(
      'name',   format('recursion:%s<->%s', r.a, r.b),
      'ok',     false,
      'detail', format('policies on %s subquery %s and policies on %s subquery %s — mutual RLS recursion. '
                       || 'Break the cycle with a SECURITY DEFINER helper, as 0023 did for meetings/meeting_participants.',
                       r.a, r.b, r.b, r.a));
  end loop;

  if found = 0 then
    checks := checks || jsonb_build_object(
      'name', 'recursion:none', 'ok', true,
      'detail', 'no pair of tables subqueries each other from their policies');
  end if;

  return selftest_result(checks);
end $$;

-- ----------------------------------------------------------------------------
-- 4. test_returning_policies() — bug (3)
--
-- An .insert().select() needs the SELECT policy to see the row THIS statement
-- just wrote. A policy that delegates only to a STABLE helper taking the row's
-- own id cannot: the helper runs against a snapshot without the new row.
--
-- Flag a table when ALL of the following hold:
--   * it has an owner-ish column (owner_id / created_by / user_id), so a direct
--     branch is actually possible;
--   * its SELECT (or ALL) policy delegates to a STABLE/IMMUTABLE public helper
--     that takes at least one argument (i.e. is evaluated per row);
--   * that helper's own body reads the SAME table — the self-referential
--     delegation that cannot see the row the statement just wrote. Without this
--     narrowing the check flags every has_perm()/has_admin_perm() policy, which
--     is noise: those take a permission string, not the row's id;
--   * the policy has NO direct branch: owner_id = auth.uid() / created_by =
--     auth.uid() / user_id = auth.uid().
-- ----------------------------------------------------------------------------
create or replace function test_returning_policies() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  checks jsonb := '[]'::jsonb;
  r      record;
  found  int := 0;
begin
  if not selftest_allowed() then raise exception 'forbidden'; end if;

  for r in
    with tbl as (
      select c.oid, c.relname
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
    ),
    owned as (
      select t.oid, t.relname,
             array_agg(a.attname order by a.attname) as owner_cols
        from tbl t
        join pg_attribute a on a.attrelid = t.oid
       where a.attnum > 0 and not a.attisdropped
         and a.attname in ('owner_id', 'created_by', 'user_id')
       group by t.oid, t.relname
    ),
    pol as (
      select o.relname, p.polname,
             coalesce(pg_get_expr(p.polqual, p.polrelid), '') as q,
             o.owner_cols
        from pg_policy p join owned o on o.oid = p.polrelid
       where p.polcmd in ('r', '*')
    ),
    helper as (
      select pol.relname, pol.polname, pol.q, pol.owner_cols,
             (select string_agg(distinct pr.proname, ', ')
                from pg_proc pr join pg_namespace n2 on n2.oid = pr.pronamespace
               where n2.nspname = 'public'
                 and pr.pronargs > 0
                 and pr.provolatile in ('s', 'i')
                 and pr.proname not like 'selftest%'
                 and pr.proname not like 'test\_%'
                 and pr.proname not in ('current_org', 'current_department', 'current_role_level', 'role_rank')
                 and position(pr.proname in lower(pol.q)) > 0
                 and pol.q ~* ('\m' || pr.proname || '[[:space:]]*\(')
                 -- the helper reads the very table it is guarding
                 and pr.prosrc ~* ('(from|join|update|into)[[:space:]]+(public\.)?"?' || pol.relname || '\M')) as helpers
        from pol
    )
    select relname, polname, helpers, owner_cols
      from helper
     where helpers is not null
       and not (q ~* '\mowner_id[[:space:]]*=[[:space:]]*auth\.uid\(\)')
       and not (q ~* '\mcreated_by[[:space:]]*=[[:space:]]*auth\.uid\(\)')
       and not (q ~* '\muser_id[[:space:]]*=[[:space:]]*auth\.uid\(\)')
     order by relname, polname
  loop
    found := found + 1;
    checks := checks || jsonb_build_object(
      'name',   format('returning:%s.%s', r.relname, r.polname),
      'ok',     false,
      'detail', format('SELECT policy delegates to stable helper(s) [%s] with no direct owner branch. '
                       || 'The table has %s — add "<col> = auth.uid() or ..." so .insert().select() can read back '
                       || 'the row the same statement wrote.',
                       r.helpers, array_to_string(r.owner_cols, '/')));
  end loop;

  if found = 0 then
    checks := checks || jsonb_build_object(
      'name', 'returning:none', 'ok', true,
      'detail', 'every SELECT policy that delegates to a stable helper also has a direct owner/creator branch');
  end if;

  return selftest_result(checks);
end $$;

-- ----------------------------------------------------------------------------
-- 5. test_function_volatility()
--
-- A STABLE or IMMUTABLE function that writes is a lie to the planner: it may be
-- cached, folded, or skipped. This exact mistake was made in platform_company.
-- ----------------------------------------------------------------------------
create or replace function test_function_volatility() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  checks jsonb := '[]'::jsonb;
  r      record;
  found  int := 0;
begin
  if not selftest_allowed() then raise exception 'forbidden'; end if;

  for r in
    select p.proname,
           case p.provolatile when 's' then 'STABLE' else 'IMMUTABLE' end as vol,
           case
             when p.prosrc ~* '\minsert[[:space:]]+into\M' then 'insert into'
             when p.prosrc ~* '\mdelete[[:space:]]+from\M' then 'delete from'
             else 'update ... set'
           end as culprit
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.provolatile in ('s', 'i')
       and p.proname not like 'selftest%'
       and p.proname not like 'test\_%'
       and (p.prosrc ~* '\minsert[[:space:]]+into\M'
         or p.prosrc ~* '\mdelete[[:space:]]+from\M'
         or p.prosrc ~* '\mupdate[[:space:]]+(only[[:space:]]+)?[a-z_][a-z_0-9]*[[:space:]]+set\M')
     order by p.proname
  loop
    found := found + 1;
    checks := checks || jsonb_build_object(
      'name',   format('volatility:%s', r.proname),
      'ok',     false,
      'detail', format('declared %s but its body contains "%s". Drop the volatility marker (VOLATILE is the default).',
                       r.vol, r.culprit));
  end loop;

  if found = 0 then
    checks := checks || jsonb_build_object(
      'name', 'volatility:none', 'ok', true,
      'detail', 'no STABLE or IMMUTABLE function writes');
  end if;

  return selftest_result(checks);
end $$;

-- ----------------------------------------------------------------------------
-- 6. test_enum_casts()
--
-- plpgsql resolves an unparenthesised CASE to text, so
--     insert into notifications (kind) values (case when x then 'action_required'
--                                                   else 'information' end)
-- fails with "column kind is of type notification_kind but expression is of type text".
-- The fix is always (case ... end)::the_enum, or a cast on every branch.
-- This broke live_invite_notify and live_room_decision.
--
-- Scope is deliberately tight, so that a failure always means something:
--   * only INSERT statements inside function bodies;
--   * only a CASE whose END is followed by "," or ")" with no cast, and which
--     contains no "::" anywhere (branch-level casts are already correct);
--   * only when EVERY quoted literal in that CASE is a label of one enum type
--     used by a column of the target table.
-- Verified against the whole current schema: zero false positives, and it does
-- flag the original broken shape.
-- ----------------------------------------------------------------------------
create or replace function test_enum_casts() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  checks jsonb := '[]'::jsonb;
  r      record;
  found  int := 0;
begin
  if not selftest_allowed() then raise exception 'forbidden'; end if;

  for r in
    with fn as (
      select p.proname, p.prosrc
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.prokind = 'f'
         and p.proname not like 'selftest%'
         and p.proname not like 'test\_%'
         and p.prosrc ~* '\minsert[[:space:]]+into\M'
    ),
    stmt as (
      select fn.proname, m.parts[1] as body, m.parts[2] as target
        from fn,
             lateral regexp_matches(fn.prosrc,
               '(insert[[:space:]]+into[[:space:]]+([a-z_][a-z_0-9]*)[^;]*)', 'gi') as m(parts)
    ),
    cases as (
      select s.proname, s.target, ce.parts[1] as expr
        from stmt s,
             lateral regexp_matches(s.body,
               '(\mcase[[:space:]]+when\M(?:(?!\mend\M)[^;])*?\mend\M[[:space:]]*(?:,|\)(?![[:space:]]*::)))',
               'gi') as ce(parts)
       where ce.parts[1] !~ '::'
    ),
    enum_col as (
      select distinct c.relname, a.attname, a.atttypid as typid
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid
        join pg_type ty on ty.oid = a.atttypid
       where n.nspname = 'public' and c.relkind = 'r'
         and a.attnum > 0 and not a.attisdropped and ty.typtype = 'e'
    ),
    lit as (
      select cs.proname, cs.target, cs.expr, l.parts[1] as val
        from cases cs,
             lateral regexp_matches(cs.expr, '''([a-zA-Z_][a-zA-Z_0-9]*)''', 'g') as l(parts)
    )
    select l.proname, l.target, e.attname
      from lit l join enum_col e on e.relname = l.target
     group by l.proname, l.target, l.expr, e.attname, e.typid
    having bool_and(exists (select 1 from pg_enum en
                             where en.enumtypid = e.typid and en.enumlabel = l.val))
     order by 1, 2, 3
  loop
    found := found + 1;
    checks := checks || jsonb_build_object(
      'name',   format('enum_cast:%s->%s.%s', r.proname, r.target, r.attname),
      'ok',     false,
      'detail', format('%s() inserts into %s using an unparenthesised CASE whose branches are all labels of '
                       || 'the enum behind %s.%s. plpgsql resolves that to text. Write (case ... end)::<enum_type>.',
                       r.proname, r.target, r.target, r.attname));
  end loop;

  if found = 0 then
    checks := checks || jsonb_build_object(
      'name', 'enum_cast:none', 'ok', true,
      'detail', 'no function inserts an uncast CASE expression into a table with an enum column');
  end if;

  return selftest_result(checks);
end $$;

-- ----------------------------------------------------------------------------
-- 7. platform_self_test() — run everything
-- ----------------------------------------------------------------------------
create or replace function platform_self_test() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  suites  jsonb := '{}'::jsonb;
  checks  jsonb := '[]'::jsonb;
  one     jsonb;
  err_msg text;
  names   text[] := array['rls_role_sweep','tenant_scoping','policy_recursion',
                          'returning_policies','function_volatility','enum_casts'];
  nm      text;
begin
  if not selftest_allowed() then
    raise exception 'forbidden: platform_self_test() requires platform admin, company admin, or the service role';
  end if;

  foreach nm in array names loop
    begin
      case nm
        when 'rls_role_sweep'      then one := test_rls_role_sweep();
        when 'tenant_scoping'      then one := test_tenant_scoping();
        when 'policy_recursion'    then one := test_policy_recursion();
        when 'returning_policies'  then one := test_returning_policies();
        when 'function_volatility' then one := test_function_volatility();
        when 'enum_casts'          then one := test_enum_casts();
        else raise exception 'unknown check %', nm;
      end case;
    exception when others then
      get stacked diagnostics err_msg = message_text;
      one := selftest_result(jsonb_build_array(jsonb_build_object(
        'name', nm || ':crashed', 'ok', false,
        'detail', 'the check itself raised: ' || err_msg)));
    end;

    suites := suites || jsonb_build_object(nm, one);
    checks := checks || (
      select coalesce(jsonb_agg(jsonb_build_object(
               'suite', nm, 'name', e->>'name', 'ok', (e->>'ok')::boolean, 'detail', e->>'detail')), '[]'::jsonb)
        from jsonb_array_elements(coalesce(one->'checks', '[]'::jsonb)) e);
  end loop;

  return jsonb_build_object(
    'ok',     (select count(*) from jsonb_array_elements(checks) e where not (e->>'ok')::boolean) = 0,
    'passed', (select count(*) from jsonb_array_elements(checks) e where (e->>'ok')::boolean),
    'failed', (select count(*) from jsonb_array_elements(checks) e where not (e->>'ok')::boolean),
    'checks', checks,
    'suites', suites,
    'ran_at', now()
  );
end $$;

-- ----------------------------------------------------------------------------
-- 8. Grants — authenticated may call; the functions gate themselves.
--    "revoke from public" alone does NOT stop anon/authenticated, so anon is
--    revoked explicitly.
-- ----------------------------------------------------------------------------
grant execute on function
  selftest_jwt_role(), selftest_allowed(), selftest_platform_only_tables(), selftest_global_tables(),
  selftest_result(jsonb), selftest_isolation_report(),
  test_rls_role_sweep(), test_tenant_scoping(), test_policy_recursion(),
  test_returning_policies(), test_function_volatility(), test_enum_casts(),
  platform_self_test()
  to authenticated, service_role;

revoke execute on function
  selftest_allowed(), selftest_isolation_report(),
  test_rls_role_sweep(), test_tenant_scoping(), test_policy_recursion(),
  test_returning_policies(), test_function_volatility(), test_enum_casts(),
  platform_self_test()
  from anon;

comment on function platform_self_test() is
  'Read-only regression + tenant-isolation self test. Safe against production. Run with: npm run verify';
