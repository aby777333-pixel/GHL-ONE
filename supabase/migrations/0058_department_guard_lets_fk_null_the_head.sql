-- 0058 — Follow-up to 0057, found by verifying it rather than trusting "success".
--
-- 1. department_guard() is why Design's head was dangling in the first place, and why 0057's
--    cleanup silently did nothing. It is a BEFORE UPDATE trigger that restores name/slug/color/
--    position/org_id/head_id unless the caller is an administrator. `departments_head_fk` is
--    ON DELETE SET NULL, and Postgres performs that action as an ordinary UPDATE — which fires
--    BEFORE UPDATE triggers. With no session (a cascade, a migration, a cron job) is_admin() is
--    false, so the guard put the deleted person's id straight back. Deleting ANY department head
--    therefore left a dangling head_id, and attendance_cron_tick() then failed every run that
--    tried to notify them.
--    The guard now stands down when there is no session (same convention as guard_user_role and
--    guard_platform_admins — RLS already keeps anon off this table), and never restores a head_id
--    that no longer exists.
--
-- 2. attendance_daily_summary() had a second DISTINCT casualty in the same statement: the bare
--    `null` for entity_id resolves to text too. Cast to uuid.

create or replace function department_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;          -- FK actions, migrations, cron
  if not (is_admin() or has_admin_perm('department.manage')) then
    new.name := old.name; new.slug := old.slug; new.color := old.color; new.position := old.position; new.org_id := old.org_id;
    if new.head_id is not null or exists (select 1 from profiles where id = old.head_id) then
      new.head_id := old.head_id;
    end if;
  end if;
  return new;
end $$;

update departments d set head_id = null
 where d.head_id is not null and not exists (select 1 from profiles p where p.id = d.head_id);
update departments d set on_duty_user_id = null
 where d.on_duty_user_id is not null and not exists (select 1 from profiles p where p.id = d.on_duty_user_id);

do $$
declare def text := pg_get_functiondef('attendance_daily_summary()'::regprocedure); patched text;
begin
  if position('''attendance_summary_hr'', null::uuid' in def) > 0 then return; end if;
  patched := replace(def, '''attendance_summary_hr'', null', '''attendance_summary_hr'', null::uuid');
  if patched = def then raise exception '0058: expected text not found in attendance_daily_summary'; end if;
  execute patched;
end $$;

do $$
begin
  if exists (select 1 from departments d where d.head_id is not null and not exists (select 1 from profiles p where p.id = d.head_id)) then
    raise exception '0058: a department still points at a missing head';
  end if;
end $$;
