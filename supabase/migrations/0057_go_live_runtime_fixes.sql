-- 0057 — Go-live audit: three functions that failed at runtime, one dangling head, and a check
-- that would have noticed.
--
-- 1. `insert into notifications (…, kind, …) select distinct x, 'information', …` raises
--    "column kind is of type notification_kind but expression is of type text". DISTINCT has to
--    compare the output columns, so Postgres resolves the untyped literal to text *before* the
--    insert target can coerce it. VALUES and plain SELECT do not do this, which is why only the
--    DISTINCT form broke. Three functions had it:
--      attendance_daily_summary()  — ghl_attendance_daily cron has failed every run since 2026-09-08
--      messages_after()            — a Connect message needing approval (probation/intern sender)
--                                    could not be inserted at all: the trigger raised
--      start_access_review()       — starting an access review raised after building the items
--    Patched in place with an assertion that each replacement actually happened, so this cannot
--    silently no-op against a definition that has drifted.
--
-- 2. departments.head_id for Design pointed at a profile that no longer exists (and has no auth
--    user). The FK is ON DELETE SET NULL and validated, so the row was removed with triggers
--    bypassed. attendance_cron_tick() then failed its coverage-gap notification — 54 of 144 runs in
--    the last 24 h. Cleared; Design needs a new head appointed.
--
-- 3. Nothing surfaced either failure: the cron log was the only witness. `test_runtime_health()`
--    joins platform_self_test() and fails when any scheduled job's most recent run failed, or when
--    the DISTINCT-literal pattern reappears in a function that inserts into a table with an enum.

-- 1 ────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  fixes constant text[][] := array[
    ['attendance_daily_summary()',  'select distinct aa.user_id, ''information'',',  'select distinct aa.user_id, ''information''::notification_kind,'],
    ['messages_after()',            'select distinct u, ''approval'',',              'select distinct u, ''approval''::notification_kind,'],
    ['start_access_review(text,uuid,date)', 'select distinct reviewer_id, ''security'',', 'select distinct reviewer_id, ''security''::notification_kind,']
  ];
  i int; def text; patched text;
begin
  for i in 1 .. array_length(fixes, 1) loop
    def := pg_get_functiondef(fixes[i][1]::regprocedure);
    if position(fixes[i][3] in def) > 0 then continue; end if;          -- already applied
    patched := replace(def, fixes[i][2], fixes[i][3]);
    if patched = def then
      raise exception '0057: expected text not found in %', fixes[i][1];
    end if;
    execute patched;
  end loop;
end $$;

-- 2 ────────────────────────────────────────────────────────────────────────────────────────────
update departments d set head_id = null
 where d.head_id is not null and not exists (select 1 from profiles p where p.id = d.head_id);
update departments d set on_duty_user_id = null
 where d.on_duty_user_id is not null and not exists (select 1 from profiles p where p.id = d.on_duty_user_id);

-- 3 ────────────────────────────────────────────────────────────────────────────────────────────
create or replace function test_runtime_health() returns jsonb
language plpgsql stable security definer set search_path = public, cron as $$
declare
  checks jsonb := '[]'::jsonb;
  r record;
  n int := 0;
begin
  if not selftest_allowed() then raise exception 'forbidden'; end if;

  -- a) scheduled jobs whose most recent run failed
  for r in
    select j.jobname, d.start_time, left(d.return_message, 200) msg
      from cron.job j
      join lateral (select * from cron.job_run_details x where x.jobid = j.jobid
                     order by x.start_time desc limit 1) d on true
     where j.active and d.status = 'failed'
  loop
    n := n + 1;
    checks := checks || jsonb_build_object('name', 'cron:' || r.jobname, 'ok', false,
      'detail', format('last run at %s failed: %s', r.start_time, r.msg));
  end loop;
  if n = 0 then
    checks := checks || jsonb_build_object('name', 'cron:healthy', 'ok', true,
      'detail', 'the most recent run of every active scheduled job succeeded');
  end if;

  -- b) insert … select distinct … '<enum label>' with no cast
  n := 0;
  for r in
    select distinct p.proname, m.parts[1] as target, l.parts[1] as val
      from pg_proc p,
           lateral regexp_matches(p.prosrc,
             'insert[[:space:]]+into[[:space:]]+([a-z_][a-z_0-9]*)[^;]*?select[[:space:]]+distinct([^;]*)', 'gi') m(parts),
           lateral regexp_matches(m.parts[2], '''([a-z_][a-z_0-9]*)''(?!::)', 'g') l(parts)
     where p.pronamespace = 'public'::regnamespace and p.proname not like 'test\_%'
       and exists (select 1 from pg_attribute a join pg_type t on t.oid = a.atttypid join pg_enum e on e.enumtypid = t.oid
                    where a.attrelid = to_regclass('public.' || m.parts[1]) and a.attnum > 0 and not a.attisdropped
                      and e.enumlabel = l.parts[1])
  loop
    n := n + 1;
    checks := checks || jsonb_build_object('name', format('distinct_literal:%s->%s', r.proname, r.target), 'ok', false,
      'detail', format('%s() inserts ''%s'' into %s through SELECT DISTINCT without a cast; DISTINCT resolves it to text. Write ''%s''::<enum_type>.',
                       r.proname, r.val, r.target, r.val));
  end loop;
  if n = 0 then
    checks := checks || jsonb_build_object('name', 'distinct_literal:none', 'ok', true,
      'detail', 'no INSERT … SELECT DISTINCT passes an uncast enum label');
  end if;

  return selftest_result(checks);
end $$;
revoke execute on function test_runtime_health() from public, anon;
grant execute on function test_runtime_health() to authenticated;

do $$
declare def text := pg_get_functiondef('platform_self_test()'::regprocedure); patched text;
begin
  if position('runtime_health' in def) > 0 then return; end if;
  patched := replace(def, '''delegation'',''entitlements''];', '''delegation'',''entitlements'',''runtime_health''];');
  patched := replace(patched, 'when ''entitlements''        then one := test_entitlements();',
                              'when ''entitlements''        then one := test_entitlements();
        when ''runtime_health''      then one := test_runtime_health();');
  if position('test_runtime_health()' in patched) = 0 or position(',''runtime_health''];' in patched) = 0 then
    raise exception '0057: could not wire runtime_health into platform_self_test';
  end if;
  execute patched;
end $$;
