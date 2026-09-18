-- 0063 — the learning loop, and the numbers the Buddy console reports (stages 3–4)
--
-- Feedback was being collected and read by nobody. `ai_feedback` has had helpful / not_helpful /
-- incorrect / outdated / unsafe since 0011, and a trigger routes a flag to the department's
-- knowledge owner — but nothing ever aggregated it, so a knowledge article three people had marked
-- wrong kept being handed to Buddy exactly as confidently as one nobody had ever questioned. That
-- is the difference between storing feedback and having a learning loop.
--
-- Four read-only functions. None of them changes what Buddy may see or do: they count things that
-- already exist, and the only new behaviour is that `search_knowledge`'s results now carry a
-- warning when people have flagged an article and nobody has resolved it.
--
-- `answer_quality` groups by `ai_messages.routing ->> 'intent'`, which is why 0061 records the
-- routing decision on the row: "which questions does Buddy answer badly" is unanswerable without
-- knowing which *kind* of question each answer was.

-- Who may read the console. Deliberately the same gate as the AI control centre the company
-- already has (`aia_write`), so this adds no new authority: admins and whoever holds `ai.manage`.
create or replace function can_see_ai_console()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(is_admin() or has_admin_perm('ai.manage'), false)
$$;

-- ---------------------------------------------------------------------------
-- 1. Is Buddy any good, and at what?
-- ---------------------------------------------------------------------------
create or replace function answer_quality(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org   uuid := current_org();
  v_from  timestamptz := now() - (greatest(1, least(coalesce(p_days, 30), 365)) || ' days')::interval;
  v_res   jsonb;
begin
  if not can_see_ai_console() then
    raise exception 'You need the AI control centre permission to see this.' using errcode = '42501';
  end if;

  with answers as (
    select m.id, m.confidence, m.mode, m.routing, m.created_at,
           (m.proposals is not null) as proposed,
           jsonb_array_length(coalesce(m.context, '[]'::jsonb)) as context_items
      from ai_messages m
      join ai_conversations c on c.id = m.conversation_id
     where c.org_id = v_org and m.role = 'assistant' and m.created_at >= v_from
  ),
  fb as (
    select f.message_id, f.rating, f.resolved_at
      from ai_feedback f
     where f.org_id = v_org and f.created_at >= v_from
  )
  select jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 30), 365)),
    'answers', (select count(*) from answers),
    'confidence', (select jsonb_object_agg(coalesce(confidence, 'unknown'), n) from (select confidence, count(*) n from answers group by confidence) x),
    'low_confidence_rate', (select case when count(*) = 0 then 0
                                   else round(100.0 * count(*) filter (where confidence = 'insufficient') / count(*), 1) end from answers),
    'grounded_rate', (select case when count(*) = 0 then 0
                             else round(100.0 * count(*) filter (where context_items > 0) / count(*), 1) end from answers),
    'proposal_rate', (select case when count(*) = 0 then 0
                              else round(100.0 * count(*) filter (where proposed) / count(*), 1) end from answers),
    'feedback', (select jsonb_object_agg(rating, n) from (select rating, count(*) n from fb group by rating) y),
    'unresolved_flags', (select count(*) from fb where rating in ('incorrect', 'outdated', 'unsafe') and resolved_at is null),
    -- Which kinds of question go badly. This is the row the console sorts by.
    'by_intent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'intent', intent, 'answers', n, 'insufficient', bad,
               'insufficient_rate', case when n = 0 then 0 else round(100.0 * bad / n, 1) end,
               'routed_by', routed_by, 'flags', flags)
             order by case when n = 0 then 0 else bad::numeric / n end desc, n desc)
        from (
          select coalesce(a.routing ->> 'intent', 'unrecorded') as intent,
                 count(*) as n,
                 count(*) filter (where a.confidence = 'insufficient') as bad,
                 mode() within group (order by a.routing ->> 'source') as routed_by,
                 count(*) filter (where exists (select 1 from fb where fb.message_id = a.id and fb.rating in ('incorrect','outdated','unsafe'))) as flags
            from answers a group by 1
        ) z), '[]'::jsonb),
    'by_mode', coalesce((
      select jsonb_agg(jsonb_build_object('mode', mode, 'answers', n) order by n desc)
        from (select coalesce(mode, 'chat') as mode, count(*) n from answers group by 1) w), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Which knowledge is carrying the answers, and which is rotting
-- ---------------------------------------------------------------------------
create or replace function knowledge_health(p_days int default 90)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org  uuid := current_org();
  v_from timestamptz := now() - (greatest(1, least(coalesce(p_days, 90), 365)) || ' days')::interval;
begin
  if not can_see_ai_console() then
    raise exception 'You need the AI control centre permission to see this.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', k.id, 'title', k.title, 'kind', k.kind, 'status', k.status,
             'department', (select d.name from departments d where d.id = k.department_id),
             'owner', person_name(k.owner_id),
             'review_at', k.review_at,
             'outdated', k.review_at is not null and k.review_at < current_date,
             'cited', cited.n,
             'helpful', sig.helpful,
             'flags', sig.flags,
             'last_flagged', sig.last_flagged
           ) order by sig.flags desc, cited.n desc)
      from ai_knowledge k
      cross join lateral (
        select count(*) as n from ai_messages m
          join ai_conversations c on c.id = m.conversation_id
         where c.org_id = v_org and m.created_at >= v_from
           and m.context @> jsonb_build_array(jsonb_build_object('kind', 'knowledge', 'id', k.id::text))
      ) cited
      cross join lateral (
        select count(*) filter (where f.rating = 'helpful') as helpful,
               count(*) filter (where f.rating in ('incorrect','outdated','unsafe') and f.resolved_at is null) as flags,
               max(f.created_at) filter (where f.rating in ('incorrect','outdated','unsafe')) as last_flagged
          from ai_feedback f
          join ai_messages m2 on m2.id = f.message_id
         where f.org_id = v_org
           and m2.context @> jsonb_build_array(jsonb_build_object('kind', 'knowledge', 'id', k.id::text))
      ) sig
     where k.org_id = v_org and k.status = 'approved'
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- 3. The loop closing: what Buddy is told about an article as it retrieves it
-- ---------------------------------------------------------------------------
-- Counts only, for articles the caller has already been shown by `search_knowledge` (which is
-- permission-filtered). No note text, no who: the point is "people have questioned this", which is
-- exactly what the answer should carry, not who questioned it.
create or replace function knowledge_signal(p_ids uuid[])
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := current_org();
begin
  if not is_active_member() then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'flags', s.flags, 'helpful', s.helpful))
      from unnest(coalesce(p_ids, '{}'::uuid[])) as t(id)
      cross join lateral (
        select count(*) filter (where f.rating in ('incorrect','outdated','unsafe') and f.resolved_at is null) as flags,
               count(*) filter (where f.rating = 'helpful') as helpful
          from ai_feedback f
          join ai_messages m on m.id = f.message_id
         where f.org_id = v_org
           and m.context @> jsonb_build_array(jsonb_build_object('kind', 'knowledge', 'id', t.id::text))
      ) s
     where s.flags > 0 or s.helpful > 0
  ), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- 4. What it costs, by feature and by model (§16 — the evidence for a model decision)
-- ---------------------------------------------------------------------------
-- Tokens only. The price list lives in `src/lib/ai/models.ts`, so a price change is one edit in one
-- place and the database never holds a number that quietly goes out of date.
create or replace function ai_cost_summary(p_days int default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_org  uuid := current_org();
  v_from timestamptz := now() - (greatest(1, least(coalesce(p_days, 30), 365)) || ' days')::interval;
begin
  if not can_see_ai_console() then
    raise exception 'You need the AI control centre permission to see this.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'days', greatest(1, least(coalesce(p_days, 30), 365)),
    'total', (select jsonb_build_object(
                'requests', count(*),
                'input_tokens', coalesce(sum(input_tokens), 0),
                'output_tokens', coalesce(sum(output_tokens), 0),
                'cache_read_tokens', coalesce(sum(cache_read_tokens), 0),
                'cache_write_tokens', coalesce(sum(cache_write_tokens), 0),
                'p50_latency_ms', percentile_disc(0.5) within group (order by latency_ms))
              from ai_usage where org_id = v_org and created_at >= v_from),
    'by_model', coalesce((select jsonb_agg(jsonb_build_object(
                  'model', model, 'requests', n, 'input_tokens', inp, 'output_tokens', outp,
                  'cache_read_tokens', cr, 'cache_write_tokens', cw) order by n desc)
                from (select coalesce(model, 'unknown') as model, count(*) n, sum(input_tokens) inp,
                             sum(output_tokens) outp, sum(cache_read_tokens) cr, sum(cache_write_tokens) cw
                        from ai_usage where org_id = v_org and created_at >= v_from group by 1) a), '[]'::jsonb),
    'by_feature', coalesce((select jsonb_agg(jsonb_build_object(
                    'feature', feature, 'requests', n, 'input_tokens', inp, 'output_tokens', outp,
                    'cache_read_tokens', cr, 'cache_write_tokens', cw, 'model', model) order by n desc)
                  from (select coalesce(feature, 'unknown') as feature, count(*) n, sum(input_tokens) inp,
                               sum(output_tokens) outp, sum(cache_read_tokens) cr, sum(cache_write_tokens) cw,
                               mode() within group (order by model) as model
                          from ai_usage where org_id = v_org and created_at >= v_from group by 1) b), '[]'::jsonb)
  );
end $$;

revoke all on function can_see_ai_console() from public, anon;
revoke all on function answer_quality(int) from public, anon;
revoke all on function knowledge_health(int) from public, anon;
revoke all on function knowledge_signal(uuid[]) from public, anon;
revoke all on function ai_cost_summary(int) from public, anon;

grant execute on function can_see_ai_console() to authenticated;
grant execute on function answer_quality(int) to authenticated;
grant execute on function knowledge_health(int) to authenticated;
grant execute on function knowledge_signal(uuid[]) to authenticated;
grant execute on function ai_cost_summary(int) to authenticated;

-- The containment lookups above scan ai_messages.context; give them an index rather than a seq scan
-- on a table that grows with every answer.
create index if not exists ai_messages_context_gin on ai_messages using gin (context jsonb_path_ops);
