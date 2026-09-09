-- 0037_owner_check_performance.sql
--
-- `has_perm` runs inside most RLS policies in this database, so what it does on the way to an
-- answer matters as much as the answer. 0035 gave it an owner branch that went through
-- `platform_role`, which pulls in the pending-invite fallback — a join from
-- `platform_admin_invites` onto `profiles` by lower(email) — on every permission check for every
-- ordinary user. Measured at roughly 0.25ms and 19 shared buffers per call: about a third of the
-- whole function.
--
-- Authority comes from the grant, not from the invitation. Somebody holding a pending platform
-- owner invite is not yet a platform owner, so the check `has_perm` uses is the authoritative
-- table and nothing else — a two-row primary-key lookup.
--
-- Measured after: 12.7ms → 7.2ms for the same 17-user sweep, and the 731-combination equivalence
-- test against the pre-0035 logic still reports zero mismatches.

create index if not exists profiles_lower_email_idx on public.profiles (lower(email));

create or replace function public.is_platform_owner_user(p_user uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from platform_admins
    where user_id = p_user and role = 'platform_super_admin'
  )
$$;

-- `is_platform_owner()` keeps its ORIGINAL definition, invites included, because that is what the
-- platform tables' own policies were written against and it is how a platform person is recognised
-- before their first login. 0035 had briefly made it delegate to the function above, which would
-- have changed that behaviour as a side effect.
create or replace function public.is_platform_owner()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce(platform_role(auth.uid()) = 'platform_super_admin', false)
$$;

revoke execute on function public.is_platform_owner_user(uuid) from public;
revoke execute on function public.is_platform_owner_user(uuid) from anon;
grant execute on function public.is_platform_owner_user(uuid) to authenticated;
revoke execute on function public.is_platform_owner() from public;
revoke execute on function public.is_platform_owner() from anon;
grant execute on function public.is_platform_owner() to authenticated;
