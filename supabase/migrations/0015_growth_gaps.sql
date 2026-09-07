create or replace function feedback_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.to_user_id <> new.from_user_id then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (new.to_user_id, 'information', person_name(new.from_user_id) || ' shared ' || new.kind || ' feedback with you', left(new.body, 140), '/people/' || new.to_user_id || '?tab=feedback', 'feedback', new.id, new.from_user_id);
  end if;
  return null;
end $$;
create trigger feedback_notify after insert on feedback for each row execute function feedback_notify();

create or replace function one_on_one_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare other uuid;
begin
  other := case when auth.uid() = new.manager_id then new.employee_id else new.manager_id end;
  if tg_op = 'INSERT' then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (other, 'information', '1-on-1 scheduled with ' || person_name(auth.uid()), to_char(new.scheduled_at at time zone 'Asia/Kolkata', 'DD Mon HH24:MI'), '/one-on-ones?id=' || new.id, 'one_on_one', new.id, auth.uid());
  elsif (new.agenda is distinct from old.agenda or new.action_items is distinct from old.action_items or new.scheduled_at is distinct from old.scheduled_at or new.status is distinct from old.status) and other is not null and other <> auth.uid() then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (other, 'information', person_name(auth.uid()) || ' updated your 1-on-1', case when new.status is distinct from old.status then 'Status: ' || new.status else 'Agenda or action items changed' end, '/one-on-ones?id=' || new.id, 'one_on_one', new.id, auth.uid());
  end if;
  return null;
end $$;
create trigger one_on_ones_notify after insert or update on one_on_ones for each row execute function one_on_one_notify();

create policy se_update on skill_endorsements for update to authenticated using (endorsed_by = auth.uid()) with check (endorsed_by = auth.uid());
drop policy if exists li_all on learning_interests;
create policy li_self on learning_interests for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy li_manager_read on learning_interests for select to authenticated using (is_manager_of(user_id) or is_hr());

revoke execute on function feedback_notify(), one_on_one_notify() from anon, public;
