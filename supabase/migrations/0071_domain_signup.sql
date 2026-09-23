-- 0071 — A company email address gets you in.
--
-- Until now a self sign-up was created INACTIVE unless an `invites` row named that exact address, and then
-- waited on /pending for an owner, HR or the department head to approve it. The company now wants its own
-- people straight in: anyone who signs up with an address on the company's `email_domain` is active on
-- arrival, as an `employee`. Any other address behaves exactly as before (inactive → join request →
-- approval), and an invite still decides the role/department it always did.
--
-- Why this is safe: email confirmation is ON for this project — a self sign-up is sent a link and gets no
-- session until it is clicked — so a domain address can only be used by someone who reads that mailbox.
-- Becoming active at insert grants nothing before the address is confirmed, because there is no session.
--
-- Nothing else in handle_new_user() changes. `profiles_notify_pending` fires only for an inactive row, so a
-- domain sign-up raises no "awaiting approval" notice; `auto_onboarding` starts the onboarding checklist
-- for it exactly as it does for an invited person.

update public.organizations
   set email_domain = 'ghlindiaventures.com'
 where id = '00000000-0000-0000-0000-000000000001'
   and email_domain is null;

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

  -- The company's own domain (0071). Exact match on the part after '@' — a look-alike such as
  -- "x@evil-ghlindiaventures.com" or "x@ghlindiaventures.com.evil.io" does not match.
  select lower(nullif(btrim(email_domain), '')) into v_domain from organizations where id = v_org;
  v_domain_ok := v_domain is not null and lower(split_part(new.email, '@', 2)) = v_domain;

  insert into profiles (id, org_id, email, full_name, role, department_id, designation, manager_id, is_active, joined_at)
  values (
    new.id, v_org, new.email,
    coalesce(v_inv.full_name, v_name),
    case when v_first then 'super_admin'::role_level else coalesce(v_inv.role, 'employee'::role_level) end,
    v_inv.department_id,
    v_inv.designation,
    v_inv.manager_id,
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

-- A trigger function needs no EXECUTE grant for its trigger to fire (0068).
revoke all on function public.handle_new_user() from public, anon, authenticated;
