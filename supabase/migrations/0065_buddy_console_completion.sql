-- 0065 — the two §15 views the console was missing
--
-- §15 lists what an administrator should be able to inspect. 0063 covered usage, low-confidence
-- answers, knowledge gaps, outdated knowledge, feedback and cost; 0064 covered actions that were
-- confirmed but could not be read back. Two were still missing, and both are answerable from data
-- that already exists:
--
--   * **agent performance** — `assistant_performance()` reports per *persona*, from the assistant
--     recorded on each answer by 0061. Per persona, never per person: the unit on this screen is the
--     question, and "who asks Buddy the most" is not a metric this product will ever produce.
--   * **failed tool calls** — every Buddy tool is now built through a wrapper that records what ran
--     and how it went into `ai_messages.routing -> 'tools'`, so `tool_health()` needs no new table.
--     "empty" is tracked apart from "error" because a tool that correctly reports finding nothing is
--     working — but one that is *always* empty is usually a permission or data problem, which is
--     exactly what an administrator wants to see.
--
-- ONE ITEM ON §15's LIST IS DELIBERATELY NOT BUILT: a list of people's unanswered questions.
-- `ai_conversations` is `aic_own` and `ai_messages` reaches its tenant through it — a person's
-- conversations with Buddy are readable by that person alone, including by administrators. A
-- SECURITY DEFINER function that surfaced question text to the console would quietly repeal that,
-- and "what people asked the AI" is exactly the kind of record §33 exists to protect. The knowledge
-- gap is reported as counts by intent instead, and the route from a bad answer to a fixed SOP stays
-- the one the person opts into: the feedback flag, which already carries their note to the
-- department's knowledge owner.

create or replace function assistant_performance(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org  uuid := current_org();
  v_from timestamptz := now() - (greatest(1, least(coalesce(p_days, 30), 365)) || ' days')::interval;
begin
  if not can_see_ai_console() then
    raise exception 'You need the AI control centre permission to see this.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'key', key, 'name', name, 'answers', n,
             'grounded_rate', case when n = 0 then 0 else round(100.0 * grounded / n, 1) end,
             'insufficient_rate', case when n = 0 then 0 else round(100.0 * bad / n, 1) end,
             'proposals', proposals, 'flags', flags)
           order by n desc)
      from (
        select coalesce(m.routing ->> 'assistant', c.assistant_key, 'general') as key,
               coalesce(max(a.name), coalesce(m.routing ->> 'assistant', c.assistant_key, 'general')) as name,
               count(*) as n,
               count(*) filter (where jsonb_array_length(coalesce(m.context, '[]'::jsonb)) > 0) as grounded,
               count(*) filter (where m.confidence = 'insufficient') as bad,
               count(*) filter (where m.proposals is not null) as proposals,
               count(*) filter (where exists (
                 select 1 from ai_feedback f
                  where f.message_id = m.id and f.rating in ('incorrect','outdated','unsafe') and f.resolved_at is null)) as flags
          from ai_messages m
          join ai_conversations c on c.id = m.conversation_id
          left join ai_assistants a on a.org_id = v_org and a.key = coalesce(m.routing ->> 'assistant', c.assistant_key)
         where c.org_id = v_org and m.role = 'assistant' and m.created_at >= v_from
         group by 1
      ) s
  ), '[]'::jsonb);
end $$;

create or replace function tool_health(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org  uuid := current_org();
  v_from timestamptz := now() - (greatest(1, least(coalesce(p_days, 30), 365)) || ' days')::interval;
begin
  if not can_see_ai_console() then
    raise exception 'You need the AI control centre permission to see this.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'name', name, 'calls', n, 'errors', errs, 'empty', empties,
             'error_rate', case when n = 0 then 0 else round(100.0 * errs / n, 1) end,
             'empty_rate', case when n = 0 then 0 else round(100.0 * empties / n, 1) end,
             'p50_ms', p50)
           order by errs desc, empties desc, n desc)
      from (
        select t ->> 'name' as name,
               count(*) as n,
               count(*) filter (where t ->> 'outcome' = 'error') as errs,
               count(*) filter (where t ->> 'outcome' = 'empty') as empties,
               percentile_disc(0.5) within group (order by (t ->> 'ms')::int) as p50
          from ai_messages m
          join ai_conversations c on c.id = m.conversation_id
          cross join lateral jsonb_array_elements(coalesce(m.routing -> 'tools', '[]'::jsonb)) as t
         where c.org_id = v_org and m.created_at >= v_from
         group by 1
      ) s
  ), '[]'::jsonb);
end $$;

revoke all on function assistant_performance(int) from public, anon;
revoke all on function tool_health(int) from public, anon;
grant execute on function assistant_performance(int) to authenticated;
grant execute on function tool_health(int) to authenticated;
