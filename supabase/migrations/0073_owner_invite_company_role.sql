-- An invited platform owner arrives as a complete owner.
--
-- Every owner holds three things: the platform grant (platform_admins), the super_admin level
-- (profiles.role) and the Company Super Admin security role (user_roles). 0070 materialises the
-- first at sign-up and the company invite supplies the second; the third had to be added by hand
-- afterwards, because user_roles needs the user id and the id does not exist before sign-up.
--
-- This adds the third, and only for a `platform_super_admin` invite. It grants nothing an owner
-- did not already decide: only a platform owner can write platform_admin_invites (pai_all), and
-- has_perm's platform-owner branch already gives that person everything — the role makes them
-- identical to the other owners (counted by the last-Super-Admin guards, shown as Access in People).
--
-- Additive: the platform_admins insert is byte-identical to 0070, and the role insert sits in its
-- own exception block so it can never undo that insert or fail the sign-up.

create or replace function public.promote_platform_invite()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare inv_role text;
begin
  begin
    select i.role into inv_role
      from platform_admin_invites i
     where lower(i.email) = lower(new.email)
     limit 1;

    if inv_role is null then return new; end if;

    insert into platform_admins (user_id, role, note)
    values (new.id, inv_role, 'Promoted from platform_admin_invites when the account was created')
    on conflict (user_id) do nothing;
  exception when others then
    -- Never fail a sign-up over this. The invite still stands and the row can be added by hand.
    return new;
  end;

  if inv_role = 'platform_super_admin' then
    begin
      insert into user_roles (user_id, system_role_id, org_id, reason)
      select new.id, sr.id, new.org_id, 'Platform owner invite — granted when the account was created'
        from system_roles sr
       where sr.key = 'company_super_admin' and sr.org_id = new.org_id
      on conflict (user_id, system_role_id) do nothing;
    exception when others then
      return new;
    end;
  end if;

  return new;
end $function$;

revoke execute on function public.promote_platform_invite() from public, anon, authenticated;
