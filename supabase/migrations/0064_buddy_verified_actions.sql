-- 0064 — Buddy checks that what it proposed actually happened (§11, stage 5)
--
-- The pattern the brief asks for is Understand → Plan → Retrieve → Reason → Propose → Confirm →
-- Execute → **Verify** → Report. Everything up to Execute was built: `propose_actions` never
-- executes, `BuddyProposals` runs the write under the person's own permissions, and `ai_actions`
-- records proposed → confirmed → performed. The last two steps were missing, and they are the ones
-- that matter most in this codebase, for a reason its own test report already recorded:
--
--   *"An RLS-refused UPDATE returns no error — it matches zero rows."*
--
-- The same is true of an INSERT whose row is then invisible to the person who made it, of a trigger
-- that rewrites a column, and of a write that lands in the wrong company. In every one of those
-- cases the client sees no error, shows a success toast, and is wrong. "Performed" meant "we called
-- the API and it did not throw" — never "the thing exists and the person can see it".
--
-- `verify_ai_action` is deliberately SECURITY INVOKER: it re-reads the created row **through the
-- caller's own RLS**, so the question it answers is the useful one — not "is there a row somewhere"
-- but "can the person Buddy just helped actually see what it made for them?"

alter table ai_actions
  add column if not exists verified_at   timestamptz,
  add column if not exists verification  jsonb;

comment on column ai_actions.verification is
  'Result of re-reading the created entity as the person who confirmed the action: '
  '{entity, id, found, checked_at, reason}. Null means never verified — which is what every action '
  'recorded before this migration is, and what an entity type this function cannot check stays.';

create or replace function verify_ai_action(p_action uuid, p_entity text, p_id uuid)
returns jsonb
language plpgsql set search_path = public as $$
declare
  v_found  boolean;
  v_reason text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;

  -- Each branch reads one table with no SECURITY DEFINER anywhere in the path, so RLS decides.
  -- An entity this function does not know is recorded as unverifiable rather than as verified:
  -- silence must never be able to read as success.
  case p_entity
    when 'task'           then select exists (select 1 from tasks             where id = p_id) into v_found;
    when 'decision'       then select exists (select 1 from decisions         where id = p_id) into v_found;
    when 'meeting'        then select exists (select 1 from meetings          where id = p_id) into v_found;
    when 'help_request'   then select exists (select 1 from help_requests     where id = p_id) into v_found;
    when 'leave'          then select exists (select 1 from leaves            where id = p_id) into v_found;
    when 'message'        then select exists (select 1 from messages          where id = p_id) into v_found;
    when 'knowledge'      then select exists (select 1 from ai_knowledge      where id = p_id) into v_found;
    when 'access_request' then select exists (select 1 from access_requests   where id = p_id) into v_found;
    when 'live_room'      then select exists (select 1 from live_rooms        where id = p_id) into v_found;
    when 'learning'       then select exists (select 1 from learning_interests where id = p_id) into v_found;
    when 'commitment'     then select exists (select 1 from commitments       where id = p_id) into v_found;
    when 'request'        then select exists (select 1 from requests          where id = p_id) into v_found;
    else
      v_found := null;
      v_reason := 'no check for this kind';
  end case;

  if v_found is false then
    v_reason := 'created, but it cannot be read back — it may have been refused, rewritten by a rule, or filed where you cannot see it';
  end if;

  -- Own rows only (`aiact_update`); a failed stamp must never undo the work itself.
  update ai_actions
     set verified_at = now(),
         verification = jsonb_build_object('entity', p_entity, 'id', p_id, 'found', v_found, 'checked_at', now(), 'reason', v_reason),
         status = case when v_found is false then 'failed' else status end
   where id = p_action and user_id = auth.uid();

  return jsonb_build_object('entity', p_entity, 'id', p_id, 'found', v_found, 'reason', v_reason);
end $$;

-- How much of what Buddy did was checked, and what failed the check. Read by the Buddy console.
create or replace function action_verification(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org  uuid := current_org();
  v_from timestamptz := now() - (greatest(1, least(coalesce(p_days, 30), 365)) || ' days')::interval;
begin
  if not can_see_ai_console() then
    raise exception 'You need the AI control centre permission to see this.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'performed', count(*) filter (where status in ('performed', 'failed')),
      'verified',  count(*) filter (where verification ->> 'found' = 'true'),
      'failed',    count(*) filter (where verification ->> 'found' = 'false'),
      'unchecked', count(*) filter (where status = 'performed' and verified_at is null),
      -- The LIMIT belongs to a derived table, not to the aggregate: `jsonb_agg(... order by ...)`
      -- takes no LIMIT of its own.
      'failures', coalesce((
        select jsonb_agg(jsonb_build_object('kind', kind, 'entity', verification ->> 'entity',
                                            'id', verification ->> 'id', 'when', performed_at)
               order by performed_at desc)
          from (select * from ai_actions f
                 where f.org_id = v_org and f.created_at >= v_from and f.verification ->> 'found' = 'false'
                 order by f.performed_at desc limit 10) g), '[]'::jsonb)
    )
      from ai_actions
     where org_id = v_org and created_at >= v_from
  );
end $$;

revoke all on function verify_ai_action(uuid, text, uuid) from public, anon;
revoke all on function action_verification(int) from public, anon;
grant execute on function verify_ai_action(uuid, text, uuid) to authenticated;
grant execute on function action_verification(int) to authenticated;
