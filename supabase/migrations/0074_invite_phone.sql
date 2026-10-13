-- An invite can carry a phone number, and sign-up copies it onto the profile.
--
-- Pre-authorising a person (invites + platform_admin_invites, the 0070/0073 pattern) could fill in
-- their name, level, department, designation and manager — but not their phone, so the number had
-- to be added by hand after they signed up. `invites.phone` is nullable and nothing reads it except
-- handle_new_user(), whose only change is the one extra column in the profile insert; a sign-up with
-- no invite, or an invite with no phone, lands exactly as before.

alter table public.invites add column if not exists phone text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_org uuid;
  v_inv invites%rowtype;
  v_first boolean;
  v_name text;
  v_domain text;
  v_domain_ok boolean;
begin
  select id into v_org from organizations order by created_at limit 1;
  select not exists (select 1 from profiles) into v_first;
  v_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));

  select * into v_inv from invites
   where lower(email) = lower(new.email) and accepted_at is null
   limit 1;

  select lower(nullif(btrim(email_domain), '')) into v_domain from organizations where id = v_org;
  v_domain_ok := v_domain is not null and lower(split_part(new.email, '@', 2)) = v_domain;

  insert into profiles (id, org_id, email, full_name, role, department_id, designation, manager_id, phone, is_active, joined_at)
  values (
    new.id, v_org, new.email,
    coalesce(v_inv.full_name, v_name),
    case when v_first then 'super_admin'::role_level else coalesce(v_inv.role, 'employee'::role_level) end,
    v_inv.department_id,
    v_inv.designation,
    v_inv.manager_id,
    v_inv.phone,
    v_first or v_inv.id is not null or v_domain_ok,
    current_date
  );

  if v_inv.id is not null then
    update invites set accepted_at = now() where id = v_inv.id;
  end if;

  insert into channel_members (channel_id, user_id)
  select c.id, new.id from channels c
   where c.org_id = v_org and c.type in ('company','announcement') and not c.is_private
  on conflict do nothing;

  return new;
end $function$;
