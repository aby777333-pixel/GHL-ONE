-- Follow-ups from module build: vote counting, reactions realtime, leave + announcement notifications,
-- approval comments, decision → task link.

-- Ideas: votes kept in sync by trigger (voters cannot update ideas themselves)
create or replace function idea_votes_sync() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare iid uuid := coalesce(new.idea_id, old.idea_id);
begin
  update ideas set votes = (select count(*) from idea_votes where idea_id = iid) where id = iid;
  return null;
end $$;
create trigger idea_votes_after_change after insert or delete on idea_votes
  for each row execute function idea_votes_sync();
-- everyone can see who voted (needed for "voted" state + counts)
drop policy if exists iv_all on idea_votes;
create policy iv_read on idea_votes for select to authenticated using (is_active_member());
create policy iv_write on idea_votes for insert to authenticated with check (user_id = auth.uid());
create policy iv_delete on idea_votes for delete to authenticated using (user_id = auth.uid());

-- Reactions stream over realtime
alter publication supabase_realtime add table message_reactions;

-- Message body edits only by the author; managers may still pin/unpin/delete
drop policy if exists msg_update on messages;
create policy msg_update on messages for update to authenticated using (author_id = auth.uid() or is_manager_plus());
create or replace function message_edit_guard() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is distinct from new.author_id and new.body is distinct from old.body then
    new.body := old.body;
  end if;
  return new;
end $$;
create trigger messages_edit_guard before update on messages for each row execute function message_edit_guard();

-- Leaves: notify manager on request, employee on decision
create or replace function leave_notify() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare mgr uuid; nm text;
begin
  select manager_id, full_name into mgr, nm from profiles where id = new.user_id;
  if tg_op = 'INSERT' then
    if mgr is not null then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (mgr, 'approval', 'Leave request from ' || coalesce(nm,'an employee'),
              to_char(new.starts_on,'DD Mon') || ' – ' || to_char(new.ends_on,'DD Mon') || coalesce(' · ' || new.note, ''),
              '/calendar?tab=leave', 'leave', new.id, new.user_id);
    end if;
  elsif new.status is distinct from old.status then
    insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (new.user_id, 'information', 'Leave ' || replace(new.status::text,'_',' ') || ': ' || to_char(new.starts_on,'DD Mon') || ' – ' || to_char(new.ends_on,'DD Mon'),
            new.note, '/calendar?tab=leave', 'leave', new.id, auth.uid());
    if new.status = 'approved' then
      insert into calendar_events (org_id, kind, title, starts_at, ends_at, all_day, user_id, created_by)
      values (new.org_id, 'leave', coalesce(nm,'Leave') || ' — on leave', new.starts_on::timestamptz, new.ends_on::timestamptz + interval '1 day', true, new.user_id, auth.uid());
    end if;
  end if;
  return new;
end $$;
create trigger leaves_after_insert after insert on leaves for each row execute function leave_notify();
create trigger leaves_after_update after update on leaves for each row execute function leave_notify();

-- Announcements reach the Inbox
create or replace function announcement_notify() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
  select p.id,
         case when new.mandatory then 'action_required'::notification_kind else 'information'::notification_kind end,
         case when new.mandatory then 'Must read: ' else 'Announcement: ' end || new.title,
         left(new.body, 140), '/announcements#' || new.id, 'announcement', new.id, new.author_id
    from profiles p
   where p.org_id = new.org_id and p.is_active
     and (new.department_ids = '{}' or p.department_id = any(new.department_ids))
     and p.id is distinct from new.author_id;
  return new;
end $$;
create trigger announcements_after_insert after insert on announcements for each row execute function announcement_notify();

-- Approval comments: anyone involved may add a 'comment' event
create policy ae_comment on approval_events for insert to authenticated
  with check (actor_id = auth.uid() and action = 'comment'
              and exists (select 1 from approvals a where a.id = approval_id
                            and (a.requested_by = auth.uid() or a.approver_id = auth.uid() or a.delegated_from = auth.uid() or is_manager_plus())));

-- Decision → follow-up task link
alter table tasks add column if not exists source_decision_id uuid references decisions(id) on delete set null;

-- Meeting actions can be closed without a task
alter table meeting_actions add column if not exists done boolean not null default false;

-- Sessions: last_seen visible in directory already via profiles; nothing else.
revoke execute on function idea_votes_sync(), message_edit_guard(), leave_notify(), announcement_notify() from anon, public, authenticated;

-- Storage: managers may also delete objects (file owners deleting files with versions uploaded by others)
drop policy if exists "files_bucket_delete" on storage.objects;
create policy "files_bucket_delete" on storage.objects for delete to authenticated
  using (bucket_id in ('files','chat') and (owner = auth.uid() or is_manager_plus()));

-- Project members can read the activity of projects they can see
create policy audit_read_project on audit_logs for select to authenticated
  using (org_id = current_org() and project_id is not null and can_view_project(project_id));

-- Task comments: notify assignee/owner and [@Name] mentions
create or replace function task_comment_notify() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare t tasks%rowtype; author_name text; m text; uid uuid; notified uuid[] := '{}';
begin
  select * into t from tasks where id = new.task_id;
  select full_name into author_name from profiles where id = new.author_id;
  for m in select (regexp_matches(new.body, '\[@([^\]]+)\]', 'g'))[1] loop
    select id into uid from profiles where org_id = t.org_id and lower(full_name) = lower(m) limit 1;
    if uid is not null and uid <> new.author_id and not (uid = any(notified)) then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (uid, 'mention', coalesce(author_name,'Someone') || ' mentioned you on: ' || t.title, left(new.body, 140), '/tasks/' || t.id, 'task', t.id, new.author_id);
      notified := notified || uid;
    end if;
  end loop;
  foreach uid in array array_remove(array[t.assignee_id, t.owner_id], null) loop
    if uid <> new.author_id and not (uid = any(notified)) then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (uid, 'information', coalesce(author_name,'Someone') || ' commented on: ' || t.title, left(new.body, 140), '/tasks/' || t.id, 'task', t.id, new.author_id);
      notified := notified || uid;
    end if;
  end loop;
  return new;
end $$;
create trigger task_comments_notify after insert on task_comments for each row execute function task_comment_notify();
revoke execute on function task_comment_notify() from anon, public, authenticated;
