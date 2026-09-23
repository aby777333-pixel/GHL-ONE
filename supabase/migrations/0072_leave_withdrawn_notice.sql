-- 0072 — A withdrawn leave request is not a rejection.
--
-- There is no "cancelled" leave status: when employees withdraw their own pending request the app stores
-- it as `rejected` with a note ("Withdrawn by employee" / "Cancelled by employee"). `leave_notify()` then
-- told the employee — the very person who withdrew it — "Leave rejected: 12 Sep – 13 Sep", and told the
-- manager nothing, so the approver could still go looking for a request that no longer needed them.
--
-- Now, when the person changing the status IS the requester and the new status is `rejected`, the
-- manager is told it was withdrawn and the requester gets no "rejected" notice. Every other path —
-- a manager or HR decision, an insert, an approval and its calendar entry — is unchanged, line for line.

create or replace function public.leave_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
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
    if new.status = 'rejected' and auth.uid() is not null and auth.uid() = new.user_id then
      -- Withdrawn by the employee: tell whoever was going to decide it, not the employee.
      if coalesce(new.manager_id, mgr) is not null and coalesce(new.manager_id, mgr) <> new.user_id then
        insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
        values (coalesce(new.manager_id, mgr), 'information',
                'Leave request withdrawn by ' || coalesce(nm,'an employee'),
                to_char(new.starts_on,'DD Mon') || ' – ' || to_char(new.ends_on,'DD Mon') || ' · nothing to decide',
                '/calendar?tab=leave', 'leave', new.id, new.user_id);
      end if;
    else
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (new.user_id, 'information', 'Leave ' || replace(new.status::text,'_',' ') || ': ' || to_char(new.starts_on,'DD Mon') || ' – ' || to_char(new.ends_on,'DD Mon'),
              new.note, '/calendar?tab=leave', 'leave', new.id, auth.uid());
      if new.status = 'approved' then
        insert into calendar_events (org_id, kind, title, starts_at, ends_at, all_day, user_id, created_by)
        values (new.org_id, 'leave', coalesce(nm,'Leave') || ' — on leave', new.starts_on::timestamptz, new.ends_on::timestamptz + interval '1 day', true, new.user_id, auth.uid());
      end if;
    end if;
  end if;
  return new;
end $function$;

-- A trigger function needs no EXECUTE grant for its trigger to fire (0068).
revoke all on function public.leave_notify() from public, anon, authenticated;
