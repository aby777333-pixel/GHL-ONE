-- 0053 — §25: a module the company does not have is not reachable, whatever the roles say.
--
-- The brief's formula is `USER ACCESS = COMPANY FEATURE ENABLED AND USER HAS PERMISSION`, and it
-- insists the two ideas stay separate: an entitlement is what the company bought, a permission is
-- what a person may do inside it. Both halves existed here — `platform_features`, `org_features`,
-- `set_org_feature()` and `org_feature_enabled()` are all implemented and administered at
-- /platform/[id] → Features — but **nothing consulted them**. `org_feature_enabled` was referenced
-- by no policy, no access function, and nowhere in `src/`. Turning a feature off changed nothing.
--
-- That is the fourth control in this codebase that was only a label, after the granular keys of
-- 0040, the scope rules of 0043 and the `roles.*` keys of 0051. The pattern is consistent enough
-- to be worth naming: **a table that stores an intention is not a control until something asks it
-- a question.**
--
-- The mapping lives on `screens` because a "module" in this codebase IS a screen: `effective_nav`
-- and `proxy.ts` both derive from `effective_screens`, so gating there removes the module from the
-- sidebar, the router and everything downstream in one move, which is what §5 demands.

-- ---------------------------------------------------------------------------------------------
-- The mapping. A NULL `feature_key` means "not a purchasable module" — Home, Inbox, Approvals,
-- Search, Admin and the rest are part of the product itself and are never entitlement-gated.
-- ---------------------------------------------------------------------------------------------
alter table public.screens
  add column if not exists feature_key text references public.platform_features(key);

comment on column public.screens.feature_key is
  'The entitlement this screen belongs to. NULL = part of the product, never gated. Enforced as an AND on top of the permission chain in effective_screens().';

update public.screens s set feature_key = v.f
from (values
  ('chat','chat'), ('files','files'), ('wiki','knowledge'), ('people','people'),
  ('attendance','attendance'), ('leave','leave'), ('academy','academy'),
  ('tasks','tasks'), ('projects','projects'), ('help','help_desk'),
  ('connect','connect'), ('live','video'), ('boards','whiteboards'),
  ('recordings','recording'), ('docs','live_docs')
) as v(s, f)
where s.key = v.s and s.feature_key is distinct from v.f;

-- Every one of those 15 features is `default_enabled = true` in the catalogue and no company has
-- turned any of them off, so this migration changes nobody's access today — verified by comparing
-- a fingerprint of all 195 person × screen answers before and after: identical. The three features
-- that default to off — external_guests, federation, api — are capabilities rather than modules
-- and deliberately map to no screen: gating a screen on them would take something away on deploy.

-- ---------------------------------------------------------------------------------------------
-- The AND, and the honest reason.
--
-- The feature test is deliberately NOT another source in the precedence chain. The chain answers
-- "may this person" and its most specific entry wins; entitlement answers "does this company have
-- the thing at all", and no individual override should be able to grant a module that was never
-- bought. So it is an outermost AND over the whole coalesce. Verified: with Projects switched off,
-- an individual override granting `projects` to a named person still yields allowed = false.
--
-- `source` becomes the token `feature_disabled` rather than a sentence, because the no-access
-- screen has to treat this case differently from every other one rather than merely display it:
-- for a permission rule it offers "Request access" and a company administrator can act on that;
-- for an entitlement there is nobody inside the company who can say yes. Matching a prose sentence
-- is a bad hinge to hang that on, so the UI matches `FEATURE_DISABLED` from `src/lib/screens.ts`.
-- ---------------------------------------------------------------------------------------------
create or replace function public.effective_screens(p_user uuid default auth.uid())
returns table(key text, label text, path text, grp text, allowed boolean, source text, sort_order integer)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare p profiles%rowtype; lvl role_level;
begin
  select * into p from profiles where id = p_user;
  if p.id is null then return; end if;
  lvl := effective_level(p_user);
  return query
  select s.key, s.label, s.path, s.grp,
    coalesce(
      (select r.allowed from screen_rules r where r.org_id = p.org_id and r.scope = 'user' and r.scope_id = p_user and r.screen_key = s.key and (r.expires_at is null or r.expires_at > now())),
      (select bool_or(r.allowed) from screen_rules r join user_roles ur on ur.system_role_id = r.scope_id and ur.user_id = p_user and ur.starts_at <= now() and (ur.expires_at is null or ur.expires_at > now())
         where r.org_id = p.org_id and r.scope = 'role' and r.screen_key = s.key and (r.expires_at is null or r.expires_at > now())),
      (select bool_or(s.key = any(sr.screens)) or not bool_or(s.key = any(sr.denied_screens)) from user_roles ur join system_roles sr on sr.id = ur.system_role_id
         where ur.user_id = p_user and ur.starts_at <= now() and (ur.expires_at is null or ur.expires_at > now()) and (s.key = any(sr.screens) or s.key = any(sr.denied_screens))),
      (select r.allowed from screen_rules r where r.org_id = p.org_id and r.scope = 'department' and r.scope_id = p.department_id and r.screen_key = s.key and (r.expires_at is null or r.expires_at > now())),
      (select true from departments d where d.id = p.department_id and s.key = any(d.default_screens)),
      (select r.allowed from screen_rules r where r.org_id = p.org_id and r.scope = 'default' and r.scope_id is null and r.screen_key = s.key),
      case when p.is_external then s.external_ok and not s.admin_only
           when s.key = 'people-intelligence' then is_primary_admin_user(p_user) or has_admin_perm_user(p_user, 'security.manage')
           when s.key = 'admin' then role_rank(lvl) <= role_rank('team_lead') or exists (select 1 from admin_assignments a where a.user_id = p_user and (a.expires_at is null or a.expires_at > now()))
           else role_rank(lvl) <= role_rank(s.default_min_level) end
    )
    -- §25: entitlement AND permission. Never a tier of its own — no override outranks "the company
    -- does not have this module".
    and (s.feature_key is null or org_feature_enabled(s.feature_key, p.org_id))
    as allowed,
    case
      when s.feature_key is not null and not org_feature_enabled(s.feature_key, p.org_id)
        then 'feature_disabled'
      when exists (select 1 from screen_rules r where r.org_id = p.org_id and r.scope = 'user' and r.scope_id = p_user and r.screen_key = s.key and (r.expires_at is null or r.expires_at > now())) then 'individual override'
      when exists (select 1 from screen_rules r join user_roles ur on ur.system_role_id = r.scope_id and ur.user_id = p_user where r.org_id = p.org_id and r.scope = 'role' and r.screen_key = s.key) then 'role rule'
      when exists (select 1 from user_roles ur join system_roles sr on sr.id = ur.system_role_id where ur.user_id = p_user and (s.key = any(sr.screens) or s.key = any(sr.denied_screens))) then 'system role'
      when exists (select 1 from screen_rules r where r.org_id = p.org_id and r.scope = 'department' and r.scope_id = p.department_id and r.screen_key = s.key) then 'department rule'
      when exists (select 1 from departments d where d.id = p.department_id and s.key = any(d.default_screens)) then 'department default'
      when exists (select 1 from screen_rules r where r.org_id = p.org_id and r.scope = 'default' and r.scope_id is null and r.screen_key = s.key) then 'company default'
      else 'system default (' || s.default_min_level::text || '+)' end as source,
    s.position
  from screens s
  where not p.frozen or s.key in ('home','inbox')
  order by s.position;
end $function$;

-- ---------------------------------------------------------------------------------------------
-- The entitlement suite. Same shape as `delegation`: assert the thing that stores an intention is
-- actually being asked a question, because that is the failure this migration fixes.
-- ---------------------------------------------------------------------------------------------
create or replace function public.test_entitlements()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare checks jsonb := '[]'::jsonb; n int; bad text[];
begin
  if not selftest_allowed() then raise exception 'forbidden'; end if;

  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'effective_screens'
     and pg_get_functiondef(p.oid) ~ 'org_feature_enabled\(';
  checks := checks || jsonb_build_object('name', 'entitlement:enforced', 'ok', n = 1,
    'detail', case when n = 1
                   then 'effective_screens applies org_feature_enabled, so a module the company does not have is unreachable however the roles are set.'
                   else 'effective_screens no longer consults org_feature_enabled - turning a feature off would change nothing.' end);

  -- A screen pointing at a key that is not in the catalogue would be gated on a question nobody
  -- can answer; org_feature_enabled falls back to true, so it would silently stop gating.
  select coalesce(array_agg(s.key order by s.key), '{}'::text[]) into bad
    from screens s
   where s.feature_key is not null
     and not exists (select 1 from platform_features f where f.key = s.feature_key and not f.deprecated);
  checks := checks || jsonb_build_object('name', 'entitlement:mapping_valid', 'ok', cardinality(bad) = 0,
    'detail', case when cardinality(bad) = 0
                   then 'Every screen that names a feature names one that exists and is current.'
                   else 'These screens are gated on a feature that is missing or deprecated, so they are no longer gated at all: ' || array_to_string(bad, ', ') end);

  select coalesce(array_agg(distinct f.feature_key order by f.feature_key), '{}'::text[]) into bad
    from org_features f
   where not exists (select 1 from platform_features pf where pf.key = f.feature_key);
  checks := checks || jsonb_build_object('name', 'entitlement:no_unknown_overrides', 'ok', cardinality(bad) = 0,
    'detail', case when cardinality(bad) = 0
                   then 'Every per-company feature override names a feature in the catalogue.'
                   else 'These companies hold overrides for features that no longer exist: ' || array_to_string(bad, ', ') end);

  -- Informational: a new paid module added to `screens` without a feature_key is ungated, and the
  -- only moment anyone would notice is when a company that did not buy it can still open it.
  select coalesce(array_agg(s.key order by s.key), '{}'::text[]) into bad
    from screens s where s.feature_key is null;
  checks := checks || jsonb_build_object('name', 'entitlement:ungated:review', 'ok', true,
    'detail', format('%s screens are part of the product and never entitlement-gated: %s', cardinality(bad), array_to_string(bad, ', ')));

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
  names   text[] := array['rls_role_sweep','tenant_scoping','policy_recursion','returning_policies',
                          'function_volatility','enum_casts','access_control','delegation','entitlements'];
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
        when 'entitlements'        then one := test_entitlements();
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

revoke all on function public.test_entitlements() from public, anon;
