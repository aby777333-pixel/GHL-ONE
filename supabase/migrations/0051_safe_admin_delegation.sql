-- 0051 — §15 Safe admin delegation: the `roles.*` keys become the control.
--
-- `roles.create`, `roles.edit`, `roles.delete` and `roles.assign` have been in the catalogue since
-- 0040 and gated NOTHING. Role administration was reached through `is_admin()`, which is
-- `role_rank(current_role_level()) <= 2` — a place in the org chart. Three directors could edit and
-- assign security roles for no reason other than their rank, which is what §15 forbids and what
-- §3A already committed this codebase against: a level is organisational identity, never authority.
--
-- Four keys that appear in the matrix, can be granted and revoked, and change nothing at all, are
-- worse than no keys: somebody will grant one and believe they have delegated something. It is the
-- same failure `access:scope_not_enforced` exists to catch for scope rules, and the new
-- `delegation` suite now catches it for these.
--
-- Making the keys real is a NARROWING, so the authority is seeded first. Whoever can administer
-- roles today still can tomorrow; what changes is that it is written down, visible in the matrix,
-- and removable. Same move as `legacy_alias` in 0040 — preserve the effective set, make the
-- granularity usable.

-- ---------------------------------------------------------------------------------------------
-- Seed: write down what `is_admin()` has been granting silently.
--
-- The seed is small because the aliases already do most of the work: all four `roles.*` keys and
-- both `access_control.*` keys alias `security.manage`, so everybody holding that resolves them
-- already. The only route not covered is the level one, so that is the only route seeded.
--   * `super_admin` needs nothing — has_perm has an unconditional branch for that level.
--   * `director` and `executive` are exactly what `is_admin()` adds, so they are seeded.
--   * The two roles carrying people.manage/hr.manage are both "Company Super Admin", which holds
--     security.manage, so the alias covers their holders.
--   * `admin_roles` (the separate admin_assignments path) is deliberately NOT seeded: "HR Admin"
--     lists people.manage, and letting that keep implying role administration is precisely the
--     over-grant §15 exists to remove. It has no holders, so nobody is affected.
-- ---------------------------------------------------------------------------------------------
insert into public.role_defaults (org_id, level, permissions)
select o.id, l,
       array['roles.create','roles.edit','roles.delete','roles.assign',
             'access_control.view','access_control.manage']
  from public.organizations o
 cross join unnest(array['director','executive']::role_level[]) l
on conflict (org_id, level) do update
  set permissions = (
    select array(select distinct e
                   from unnest(role_defaults.permissions || excluded.permissions) e
                  order by e));

-- ---------------------------------------------------------------------------------------------
-- The keys now gate what they name.
--
-- Split per command, because §15 names them separately and a single FOR ALL policy cannot tell
-- "may create a role" from "may delete one". Each keeps the company test added in 0050.
--
-- `has_admin_perm` rather than `has_perm`, deliberately: it is what the previous policies used, so
-- the `admin_assignments` route (including the `*` wildcard) keeps working exactly as it did.
--
-- The manager branch on user_roles is untouched. A manager assigning a role no stronger than their
-- own level to their own report is a real workflow that §15 does not ask anyone to remove; what it
-- asks is that blanket authority stop arriving from a job level, and that is what changed.
-- ---------------------------------------------------------------------------------------------
drop policy if exists sr_write on public.system_roles;

create policy sr_insert on public.system_roles for insert
  with check (org_id = current_org() and has_admin_perm('roles.create'));

create policy sr_update on public.system_roles for update
  using      (org_id = current_org() and has_admin_perm('roles.edit'))
  with check (org_id = current_org() and has_admin_perm('roles.edit'));

create policy sr_delete on public.system_roles for delete
  using (org_id = current_org() and has_admin_perm('roles.delete'));

drop policy if exists ur_write on public.user_roles;

create policy ur_insert on public.user_roles for insert
  with check (
    org_id = current_org()
    and (has_admin_perm('roles.assign')
         or (is_manager_of(user_id) and exists (
               select 1 from system_roles s
                where s.id = user_roles.system_role_id
                  and role_rank(s.base_level) >= role_rank(effective_level(auth.uid())))))
  );

create policy ur_update on public.user_roles for update
  using (
    org_id = current_org()
    and (has_admin_perm('roles.assign')
         or (is_manager_of(user_id) and exists (
               select 1 from system_roles s
                where s.id = user_roles.system_role_id
                  and role_rank(s.base_level) >= role_rank(effective_level(auth.uid())))))
  ) with check (
    org_id = current_org()
    and (has_admin_perm('roles.assign')
         or (is_manager_of(user_id) and exists (
               select 1 from system_roles s
                where s.id = user_roles.system_role_id
                  and role_rank(s.base_level) >= role_rank(effective_level(auth.uid())))))
  );

create policy ur_delete on public.user_roles for delete
  using (
    org_id = current_org()
    and (has_admin_perm('roles.assign')
         or (is_manager_of(user_id) and exists (
               select 1 from system_roles s
                where s.id = user_roles.system_role_id
                  and role_rank(s.base_level) >= role_rank(effective_level(auth.uid())))))
  );

-- Writing an individual allow or deny is access-control administration, which is the key §15 names
-- for it. It aliases security.manage, so every existing security administrator resolves it.
drop policy if exists po_write on public.permission_overrides;
create policy po_write on public.permission_overrides for all
  using      (org_id = current_org() and has_admin_perm('access_control.manage'))
  with check (org_id = current_org() and has_admin_perm('access_control.manage'));

-- Caught by `delegation:authority_not_from_rank` on its first run: `po_read` still admitted
-- `is_admin()`, so who holds which individual allow or deny was readable by rank. Writing was fixed
-- above and reading was left behind — and reading an access-control table is itself an
-- access-control capability, which is what `access_control.view` names.
drop policy if exists po_read on public.permission_overrides;
create policy po_read on public.permission_overrides for select using (
  org_id = current_org()
  and (user_id = auth.uid() or has_admin_perm('access_control.view') or is_manager_of(user_id))
);

-- ---------------------------------------------------------------------------------------------
-- A suite for delegation, because the failure mode here has its own shape: a key that is only a
-- label. This asserts the reverse direction from the scope checks — every key that NAMES an
-- administrative capability must be referenced by at least one policy, so a future refactor that
-- drops one fails the suite with the key's name instead of quietly making it decorative again.
-- ---------------------------------------------------------------------------------------------
create or replace function public.delegation_enforced_permissions()
returns text[]
language sql
immutable
as $$
  select array['roles.create','roles.edit','roles.delete','roles.assign','access_control.manage'];
$$;

create or replace function public.test_delegation()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare checks jsonb := '[]'::jsonb; k text; n int; bad text[] := '{}';
begin
  if not selftest_allowed() then raise exception 'forbidden'; end if;

  foreach k in array delegation_enforced_permissions() loop
    select count(*) into n from pg_policies
     where schemaname = 'public'
       and (coalesce(qual,'') || coalesce(with_check,'')) like '%' || k || '%';
    if n = 0 then bad := bad || k; end if;
  end loop;
  checks := checks || jsonb_build_object('name', 'delegation:keys_enforced', 'ok', cardinality(bad) = 0,
    'detail', case when cardinality(bad) = 0
                   then 'Every administrative key gates a policy: ' || array_to_string(delegation_enforced_permissions(), ', ') || '.'
                   else 'These keys name a capability but gate nothing, so granting or revoking them changes nothing: ' || array_to_string(bad, ', ') end);

  -- §15: administering roles must not be reachable from a place in the org chart. `is_admin()` is
  -- `role_rank(...) <= 2`, so a policy that admits it hands role administration to every director.
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename in ('system_roles','user_roles','permission_overrides')
     and (coalesce(qual,'') || coalesce(with_check,'')) ~ '\mis_admin\(\)';
  checks := checks || jsonb_build_object('name', 'delegation:authority_not_from_rank', 'ok', n = 0,
    'detail', case when n = 0
                   then 'No policy on system_roles, user_roles or permission_overrides grants on is_admin() - authority comes from keys, not rank.'
                   else n || ' policy(ies) on the authority tables still grant on is_admin(), so a job level confers role administration.' end);

  -- Splitting create/edit/delete is the point of §15; one FOR ALL policy cannot express it.
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'system_roles' and cmd in ('INSERT','UPDATE','DELETE');
  checks := checks || jsonb_build_object('name', 'delegation:role_commands_separate', 'ok', n >= 3,
    'detail', case when n >= 3 then 'Creating, editing and deleting a role are gated separately.'
                   else 'system_roles has fewer than three write policies - create/edit/delete cannot be delegated apart.' end);

  return selftest_result(checks);
end $function$;

create or replace function public.platform_self_test()
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  suites  jsonb := '{}'::jsonb;
  checks  jsonb := '[]'::jsonb;
  one     jsonb;
  err_msg text;
  names   text[] := array['rls_role_sweep','tenant_scoping','policy_recursion',
                          'returning_policies','function_volatility','enum_casts','access_control','delegation'];
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
        when 'delegation'          then one := test_delegation();
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
end $function$;

revoke all on function public.test_delegation() from public, anon;
