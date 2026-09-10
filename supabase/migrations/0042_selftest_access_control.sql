-- 0042 — Access-control invariants join the read-only self test (docs/TESTING.md).
--
-- These are the properties the RBAC design rests on. Each one is a rule that, if it silently
-- stopped holding, would be invisible until somebody either lost access they needed or gained
-- access they should never have had. Read-only, like every other check in the suite.
create or replace function public.test_access_control() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare checks jsonb := '[]'::jsonb; r record; n int;
begin
  if not selftest_allowed() then raise exception 'forbidden'; end if;

  -- 1. Every company has at least one way to administer itself (§17). A company with people but
  --    no administrator cannot grant access to anybody, including itself.
  for r in
    select o.id, o.name
      from organizations o
     where o.status in ('active','trial','onboarding')
       and exists (select 1 from profiles p where p.org_id = o.id and p.is_active)
       and not exists (
         select 1 from profiles p
          where p.org_id = o.id and p.is_active
            and (p.role = 'super_admin' or is_company_super_admin(p.id)))
  loop
    checks := checks || jsonb_build_object('name', 'access:no_admin:' || r.name, 'ok', false,
      'detail', 'This company has active people and no Super Admin. Assign one in Access Control → People.');
  end loop;

  -- 2. Every granular key points at a broad key that exists (§4). A dangling alias would make the
  --    key resolve as if it had no fallback, silently narrowing what old roles grant.
  for r in
    select p.key, p.legacy_alias from permissions p
     where p.legacy_alias is not null
       and not exists (select 1 from permissions a where a.key = p.legacy_alias)
  loop
    checks := checks || jsonb_build_object('name', 'access:dangling_alias:' || r.key, 'ok', false,
      'detail', 'legacy_alias "' || r.legacy_alias || '" is not in the catalogue. Add it, or clear the alias.');
  end loop;

  -- 3. No alias loops. `a -> b -> a` would make resolution depend on which key you asked for.
  for r in
    select p.key from permissions p
     join permissions q on q.key = p.legacy_alias
    where q.legacy_alias = p.key
  loop
    checks := checks || jsonb_build_object('name', 'access:alias_loop:' || r.key, 'ok', false,
      'detail', 'Two keys alias each other. An alias must point at a broader key, never back.');
  end loop;

  -- 4. Platform keys stay out of company roles (§24). A tenant role holding `platform.*` would be
  --    inert today (has_perm refuses it) but is a loaded gun the moment that branch changes.
  for r in
    select sr.name, sr.org_id from system_roles sr
     where exists (select 1 from unnest(sr.permissions) k where k like 'platform.%')
  loop
    checks := checks || jsonb_build_object('name', 'access:platform_key_in_role:' || r.name, 'ok', false,
      'detail', 'A company role lists a platform.* permission. Remove it — platform authority is not a tenant role.');
  end loop;

  -- 5. The guards are actually attached. A dropped trigger is a silent hole.
  select count(*) into n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal and c.relname = 'user_roles' and t.tgname = 'trg_guard_user_role';
  checks := checks || jsonb_build_object('name', 'access:assignment_guard_present', 'ok', n = 1,
    'detail', case when n = 1 then 'trg_guard_user_role is attached to user_roles.'
                   else 'trg_guard_user_role is MISSING — roles can be assigned by people who do not hold what they grant.' end);

  select count(*) into n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal and c.relname in ('profiles','user_roles')
     and t.tgname in ('trg_last_super_admin_profile','trg_last_super_admin_role');
  checks := checks || jsonb_build_object('name', 'access:last_admin_guard_present', 'ok', n = 2,
    'detail', case when n = 2 then 'Both last-Super-Admin guards are attached.'
                   else 'A last-Super-Admin guard is MISSING — a company can be left with nobody who can administer it.' end);

  -- 6. Authorisation must not read organisational identity (§3A). `has_perm` deciding anything
  --    from a job title would make a promotion silently grant power.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'has_perm'
     and pg_get_functiondef(p.oid) ~ '\mdesignation\M';
  checks := checks || jsonb_build_object('name', 'access:authz_ignores_job_title', 'ok', n = 0,
    'detail', case when n = 0 then 'has_perm does not read designation. Job title is organisational identity, never authority.'
                   else 'has_perm references `designation`. A job title must never grant access.' end);

  if jsonb_array_length(checks) = 0 then
    checks := jsonb_build_array(jsonb_build_object('name','access:none','ok',true,'detail','No access-control problems found.'));
  end if;
  return selftest_result(checks);
end $$;

revoke all on function public.test_access_control() from public;
revoke all on function public.test_access_control() from anon;
grant execute on function public.test_access_control() to authenticated, service_role;

-- Register it in the runner (step 3 of "Adding a check" in docs/TESTING.md).
create or replace function public.platform_self_test() returns jsonb
language plpgsql set search_path to 'public' as $$
declare
  suites  jsonb := '{}'::jsonb;
  checks  jsonb := '[]'::jsonb;
  one     jsonb;
  err_msg text;
  names   text[] := array['rls_role_sweep','tenant_scoping','policy_recursion',
                          'returning_policies','function_volatility','enum_casts','access_control'];
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
        when 'access_control'      then one := test_access_control();
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
