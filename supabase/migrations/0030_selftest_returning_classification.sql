-- ---------------------------------------------------------------------------
-- 0030 — test_returning_policies() treated every flagged policy as a failure, but the bug it
-- hunts (`.insert().select()` returning nothing because a STABLE helper cannot see the
-- just-written row) can only happen where the INSERTING user owns the row. On a
-- membership/junction table the owner column is `user_id` — the person being ADDED, normally
-- not the actor. Adding `user_id = auth.uid()` there would widen read access and still not fix
-- a read-back, so those are now advisory review items; the check still fails hard for root
-- entities carrying owner_id/created_by. Verified before the change: no `.insert().select()`
-- exists anywhere in the app for federation_members, inbox_members, live_participants,
-- project_members, task_collaborators or user_roles.
-- ---------------------------------------------------------------------------

create or replace function test_returning_policies() returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare
  checks jsonb := '[]'::jsonb;
  r      record;
  failed int := 0;
  review int := 0;
  reviewed text := '';
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
                 and pr.prosrc ~* ('(from|join|update|into)[[:space:]]+(public\.)?"?' || pol.relname || '\M')) as helpers
        from pol
    )
    select relname, polname, helpers, owner_cols,
           -- An actor-owned row: the inserter is the owner, so a read-back really can fail.
           ('owner_id' = any(owner_cols) or 'created_by' = any(owner_cols)) as actor_owned
      from helper
     where helpers is not null
       and not (q ~* '\mowner_id[[:space:]]*=[[:space:]]*auth\.uid\(\)')
       and not (q ~* '\mcreated_by[[:space:]]*=[[:space:]]*auth\.uid\(\)')
       and not (q ~* '\muser_id[[:space:]]*=[[:space:]]*auth\.uid\(\)')
     order by relname, polname
  loop
    if r.actor_owned then
      failed := failed + 1;
      checks := checks || jsonb_build_object(
        'name',   format('returning:%s.%s', r.relname, r.polname),
        'ok',     false,
        'detail', format('SELECT policy delegates to stable helper(s) [%s] with no direct owner branch. '
                         || 'The table has %s — add "<col> = auth.uid() or ..." so .insert().select() can read back '
                         || 'the row the same statement wrote.',
                         r.helpers, array_to_string(r.owner_cols, '/')));
    else
      review := review + 1;
      reviewed := reviewed || case when reviewed = '' then '' else ', ' end || r.relname || '.' || r.polname;
    end if;
  end loop;

  if failed = 0 then
    checks := checks || jsonb_build_object(
      'name', 'returning:none', 'ok', true,
      'detail', 'every SELECT policy on an actor-owned table that delegates to a stable helper also has a direct owner/creator branch');
  end if;

  if review > 0 then
    checks := checks || jsonb_build_object(
      'name', 'returning:membership_tables:review', 'ok', true,
      'detail', format('%s membership/junction policies delegate to a stable helper and own only user_id (the member, not the actor). '
                       || 'Safe while nothing does .insert().select() on them; if that changes, route the insert through a '
                       || 'SECURITY DEFINER RPC rather than widening the policy: %s', review, reviewed));
  end if;

  return selftest_result(checks);
end $fn$;
