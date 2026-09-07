-- Knowledge owners / AI admins can read the flagged answer behind a feedback item (without opening other people's conversations)
create or replace function ai_feedback_excerpt(p_feedback uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from ai_feedback f where f.id = p_feedback and (f.routed_to = auth.uid() or is_admin() or has_admin_perm('ai.manage') or is_knowledge_owner(f.department_id)))
    then (select jsonb_build_object('question', (select q.content from ai_messages q where q.conversation_id = m.conversation_id and q.role = 'user' and q.created_at < m.created_at order by q.created_at desc limit 1), 'answer', left(m.content, 2000), 'confidence', m.confidence, 'mode', m.mode, 'asked_by', person_name(f.user_id), 'at', m.created_at)
            from ai_feedback f join ai_messages m on m.id = f.message_id where f.id = p_feedback)
    else jsonb_build_object('error', 'forbidden') end
$$;
grant execute on function ai_feedback_excerpt(uuid) to authenticated; revoke execute on function ai_feedback_excerpt(uuid) from anon, public;
