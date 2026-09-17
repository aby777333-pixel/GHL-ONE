-- 0059 — Close the remaining information leaks through SECURITY DEFINER functions (go-live audit).
--
-- 0045 removed the anonymous caller from the definer functions that guarded nothing *and wrote or
-- read content*. What it left were yes/no oracles: they change nothing and return one fact, so they
-- looked harmless — but each answers a question about somebody else, for anyone, signed in or not.
-- Probed as `anon` during the audit:
--
--   platform_role(<id>)           → 'platform_super_admin'   who runs the platform
--   is_platform_admin_user(<id>)  → true                     ditto
--   platform_can_touch(org, <id>) → true                     ditto, per company
--   is_internal_user, is_live_host, collab_can, org_feature_enabled, has_break_glass,
--   in_federation, is_candidate_panelist, is_meeting_participant, is_run_step_owner
--                                 → membership facts about arbitrary ids
--   workspaces_for_email(<email>) → which company an address has an account in (account enumeration)
--   live_running_late(<meeting>)  → no check at all: anyone holding a meeting id could send every
--                                   participant a "<name> is running late" notification
--
-- 1. `anon` loses EXECUTE on all of them except workspaces_for_email. Every RLS policy that uses
--    them is `TO authenticated`, and every function that calls them is SECURITY DEFINER (runs as the
--    owner), so nothing reachable before sign-in depended on the grant. Verified by fingerprinting
--    what anon, a platform owner and a director can read from all 213 tables before and after.
--    Same PUBLIC-then-anon revoke as 0045: revoking from anon alone does nothing.
--
-- 2. The four platform-identity oracles also answered any *signed-in* member of any company about
--    any user id. They now only answer about the caller, unless the caller is platform staff or
--    there is no session (cron, migrations). Every call site in policies and functions passes the
--    caller (default auth.uid(), or active_workspace.user_id which is auth.uid()), so no legitimate
--    path asks about somebody else. The membership helpers (is_live_host, collab_can,
--    is_internal_user…) keep cross-user answers for signed-in callers on purpose: start_live_room
--    checks invitees with them, and they reveal nothing a colleague cannot already see.
--
-- 3. workspaces_for_email stays anon-callable — 0045 kept it for a sign-in company picker — but the
--    per-account branch now answers only a signed-in caller asking about their own address. Before
--    sign-in it matches on the company's configured email domain alone, which is not a secret.
--
-- 4. live_running_late requires a session and that the caller organises or attends the meeting.

-- 1 ────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'platform_role(uuid)', 'is_platform_admin_user(uuid)', 'platform_can_touch(uuid,uuid)',
    'is_internal_user(uuid)', 'is_live_host(uuid,uuid)', 'org_feature_enabled(text,uuid)',
    'collab_can(text,uuid)', 'has_break_glass(uuid,uuid)', 'in_federation(uuid,uuid)',
    'is_candidate_panelist(uuid,uuid)', 'is_meeting_participant(uuid,uuid)',
    'is_run_step_owner(uuid,uuid)', 'live_running_late(uuid,integer)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- 2 ────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.is_platform_admin_user(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (p_user = auth.uid() or auth.uid() is null or exists (select 1 from platform_admins where user_id = auth.uid()))
     and (exists (select 1 from platform_admins where user_id = p_user)
          or exists (select 1 from platform_admin_invites i join profiles p on lower(p.email) = lower(i.email) where p.id = p_user))
$$;

create or replace function public.platform_role(p_user uuid default auth.uid()) returns text
language sql stable security definer set search_path = public as $$
  select case when p_user = auth.uid() or auth.uid() is null or exists (select 1 from platform_admins where user_id = auth.uid())
    then coalesce(
      (select role from platform_admins where user_id = p_user),
      (select i.role from platform_admin_invites i join profiles p on lower(p.email) = lower(i.email) where p.id = p_user limit 1)
    ) end
$$;

create or replace function public.platform_can_touch(p_org uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when not (p_user = auth.uid() or auth.uid() is null or exists (select 1 from platform_admins where user_id = auth.uid())) then false
    when not is_platform_admin_user(p_user) then false
    when platform_role(p_user) in ('platform_super_admin','platform_ops','platform_security') then true
    else exists (select 1 from platform_assignments a where a.user_id = p_user and a.org_id = p_org)
  end
$$;

create or replace function public.has_break_glass(p_org uuid, p_user uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select (p_user = auth.uid() or auth.uid() is null or exists (select 1 from platform_admins where user_id = auth.uid()))
    and (exists (
      select 1 from break_glass_sessions b
       where b.actor_id = p_user and b.org_id = p_org and b.ended_at is null and b.expires_at > now() and b.scope in ('content','full')
    ) or exists (
      select 1 from support_sessions s
       where s.org_id = p_org and s.revoked_at is null and s.expires_at > now() and s.scope = 'content'
         and (s.granted_to is null or s.granted_to = p_user) and platform_can_touch(p_org, p_user)
    ))
$$;

-- 3 ────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.workspaces_for_email(p_email text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', o.name, 'slug', o.slug, 'logo_url', o.logo_url, 'accent_color', o.accent_color) order by o.name), '[]'::jsonb)
    from organizations o
   where o.status in ('active','trial','onboarding','read_only')
     and ((auth.uid() is not null
           and exists (select 1 from profiles me where me.id = auth.uid() and lower(me.email) = lower(p_email))
           and exists (select 1 from memberships m where m.user_id = auth.uid() and m.org_id = o.id and m.status = 'active'))
          or (o.email_domain is not null and lower(split_part(p_email,'@',2)) = lower(o.email_domain)))
$$;

-- 4 ────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.live_running_late(p_meeting uuid, p_minutes integer default 5) returns void
language plpgsql security definer set search_path = public as $$
declare m meetings%rowtype; u uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into m from meetings where id = p_meeting;
  if m.id is null then return; end if;
  if not (m.organizer_id = auth.uid() or is_meeting_participant(p_meeting)) then
    raise exception 'Only the organiser or a participant can say they are running late' using errcode = 'insufficient_privilege';
  end if;
  for u in select user_id from meeting_participants where meeting_id = p_meeting and user_id <> auth.uid() union select m.organizer_id loop
    if u is not null and u <> auth.uid() then
      insert into notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_id) values (u, 'information', person_name(auth.uid()) || ' is running ' || p_minutes || ' min late', m.title, coalesce('/live/' || m.live_room_id, '/meetings/' || m.id), 'meeting', m.id, auth.uid());
    end if;
  end loop;
  if m.live_room_id is not null then
    insert into live_events (org_id, room_id, kind, actor_id, actor_name, payload) values (m.org_id, m.live_room_id, 'running_late', auth.uid(), person_name(auth.uid()), jsonb_build_object('minutes', p_minutes));
  end if;
end $$;
