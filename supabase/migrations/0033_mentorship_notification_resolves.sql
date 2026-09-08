-- ============================================================================
-- 0033 — Mentorship requests: two reported bugs.
--
-- 1. "I click the notification and cannot see the request."
--    The link was /people/<mentor>?tab=mentoring, but the profile page has no tabs
--    and ignored ?tab entirely. The request lives in the Career card far down a long
--    single-column page, so the mentor landed at the top and saw nothing. The page now
--    scrolls to that card for ?tab=mentoring (which also repairs links already sent),
--    and new links carry the #career anchor as well.
--
-- 2. "When I give him a mentor, the inbox should say done — but it stays a request."
--    Answering a request only INSERTED a second notification for the mentee. The mentor's
--    original 'action_required' item was never marked read, so it sat in the inbox for
--    ever. Accepting, declining or ending now retires it.
--
-- Both branches keep their existing behaviour otherwise; nothing else about mentorships changes.
-- ============================================================================
create or replace function mentorship_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'requested' then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (new.mentor_id, 'action_required',
            person_name(new.mentee_id) || ' asked you to mentor: ' || new.topic, null,
            '/people/' || new.mentor_id || '?tab=mentoring#career', 'mentorship', new.id, new.requested_by);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    -- The request has been answered: it is no longer an action for the mentor.
    update notifications
       set read_at = now()
     where entity_type = 'mentorship' and entity_id = new.id
       and kind = 'action_required' and read_at is null;
    insert into notifications (user_id, kind, title, link, entity_type, entity_id, actor_id)
    values (new.mentee_id, 'information', 'Mentorship ' || new.status || ': ' || new.topic,
            '/people/' || new.mentee_id || '?tab=mentoring#career', 'mentorship', new.id, auth.uid());
  end if;
  return null;
end $$;

-- Retire the ones already stuck in an inbox: a mentorship that is no longer 'requested'
-- must not still be asking someone to act on it.
update notifications n
   set read_at = now()
  from mentorships m
 where n.entity_type = 'mentorship' and n.entity_id = m.id
   and n.kind = 'action_required' and n.read_at is null
   and m.status <> 'requested';
