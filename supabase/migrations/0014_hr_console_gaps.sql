-- HR can maintain private records; nudges via RPC; HR admins without manager role can edit profiles; hiring managers can store resumes
create policy pp_hr_write on profiles_private for all to authenticated using (is_hr()) with check (is_hr());

create or replace function nudge_workflow_step(p_step uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s workflow_steps%rowtype; r workflow_runs%rowtype;
begin
  select * into s from workflow_steps where id = p_step;
  if s.id is null then raise exception 'not found'; end if;
  select * into r from workflow_runs where id = s.run_id;
  if not (is_hr() or is_manager_plus() or r.started_by = auth.uid()) then raise exception 'forbidden'; end if;
  if s.owner_id is null then return; end if;
  insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
  values (s.owner_id, 'action_required', 'Reminder: ' || s.title || ' — ' || r.subject_label, coalesce(p_note, 'This ' || r.kind || ' step is waiting on you.'), case when s.task_id is not null then '/tasks/' || s.task_id else '/admin?tab=workflows&run=' || r.id end, 'workflow_step', s.id, auth.uid());
end $$;
grant execute on function nudge_workflow_step(uuid,text) to authenticated; revoke execute on function nudge_workflow_step(uuid,text) from anon, public;

drop policy if exists profile_admin_update on profiles;
create policy profile_admin_update on profiles for update to authenticated using (org_id = current_org() and (is_manager_plus() or is_hr())) with check (org_id = current_org() and (is_manager_plus() or is_hr()));

drop policy if exists hr_bucket_write on storage.objects;
create policy hr_bucket_write on storage.objects for insert to authenticated with check (bucket_id = 'hr' and (is_hr() or (storage.foldername(name))[1] = auth.uid()::text or ((storage.foldername(name))[1] = 'candidates' and is_manager_plus())));
drop policy if exists hr_bucket_read on storage.objects;
create policy hr_bucket_read on storage.objects for select to authenticated using (bucket_id = 'hr' and (is_hr() or (storage.foldername(name))[1] = auth.uid()::text or ((storage.foldername(name))[1] = 'candidates' and is_manager_plus())));
