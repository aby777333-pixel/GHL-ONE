-- 0070_promote_platform_invite.sql
--
-- An invite was the pre-registration mechanism, never the grant, and the two owner checks
-- disagreed about what that meant:
--
--   is_platform_owner()        -> platform_role(auth.uid()) = 'platform_super_admin', which falls
--                                 back to platform_admin_invites joined to profiles by email.
--                                 Invite-aware, so TRUE for an invited person. Every platform RLS
--                                 policy uses this one (pa_write, pf_write, pai_all, pc_read, ...).
--   is_platform_owner_user(id) -> reads platform_admins only. FALSE for an invited person -- and
--                                 this is the one has_perm uses for its unconditional first
--                                 branch, along with explain_permission, permission_scope and
--                                 preview_user_access.
--
-- So an invited-but-not-yet-added owner passed every platform policy and failed every has_perm
-- short-circuit. Nothing anywhere promoted the invite into platform_admins, so the half state
-- was permanent until somebody noticed and inserted the row by hand.
--
-- This closes it at the only moment that works: the profile does not exist until sign-up, and
-- platform_admins.user_id is FK'd to profiles(id), so the row cannot be written any earlier.
--
-- It grants no authority of its own. Only a platform owner can write platform_admin_invites
-- (policy `pai_all` is `is_platform_owner()`), so this materialises a decision an owner already
-- made; it never invents one. The role is copied from the invite and is constrained by the
-- table's own CHECK, so an invite cannot smuggle in a role that does not exist.
--
-- guard_platform_admins stands down when auth.uid() is null (the 0058 convention), and a sign-up
-- has no session, so the insert passes the guard rather than tripping it.
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
  return new;
end $function$;

drop trigger if exists profiles_promote_platform_invite on public.profiles;
create trigger profiles_promote_platform_invite
after insert on public.profiles
for each row execute function public.promote_platform_invite();

-- 0068's rule: Supabase grants EXECUTE on a new function to anon and authenticated by default,
-- and `revoke ... from public` does not remove that. A trigger function needs no grant to fire.
revoke all on function public.promote_platform_invite() from public, anon, authenticated;
