-- 0079 — A pending, rejected, suspended or deactivated account reads no company content.
--
-- Measured while testing 0078: an account waiting for approval (never admitted by anybody) could read
-- 11 channels, all 283 channel memberships, 3 wiki pages and 3 Connect templates of the company its
-- sign-up landed in. Messages were already closed. This predates 0078 — every self sign-up has been
-- added to the company channels since 0001 — but 0078 makes it reachable from more companies, and the
-- brief is explicit: nothing beyond the person's own status until they are approved.
--
-- The fix is a RESTRICTIVE select policy, `is_active_member()`, on those four tables. A restrictive
-- policy can only remove rows, never add them, and it removes them only from people who are not active
-- members (inactive, frozen, or in a frozen department — the same definition every other RLS policy in
-- the product already uses). Verified before applying, by counting what each person can read on all
-- four tables: 25 active people, 0 drift; the pending probe went from [11, 283, 3, 3] to [0, 0, 0, 0].
-- Definer functions (notification fan-out, message triggers) are unaffected: RLS does not apply to them.

drop policy if exists active_member_only on public.channels;
create policy active_member_only on public.channels as restrictive for select to authenticated using (is_active_member());
drop policy if exists active_member_only on public.channel_members;
create policy active_member_only on public.channel_members as restrictive for select to authenticated using (is_active_member());
drop policy if exists active_member_only on public.wiki_pages;
create policy active_member_only on public.wiki_pages as restrictive for select to authenticated using (is_active_member());
drop policy if exists active_member_only on public.comm_templates;
create policy active_member_only on public.comm_templates as restrictive for select to authenticated using (is_active_member());

-- Keep it from silently coming back: the registration suite now checks the four policies exist.
create or replace function public.test_registration()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare checks jsonb := '[]'::jsonb; src text; n int;
begin
  if not selftest_allowed() then raise exception 'forbidden'; end if;

  src := pg_get_functiondef('handle_new_user()'::regprocedure);
  checks := checks || jsonb_build_object('name', 'registration:signup_reads_company_domains',
    'ok', src like '%company_domains%' and src like '%v_inv.org_id%',
    'detail', case when src like '%company_domains%' then 'Sign-up resolves the company from a verified domain and honours the invite''s company.'
                   else 'handle_new_user no longer consults company_domains: every sign-up would land in the first company again.' end);

  select count(*) into n from pg_trigger where tgname in ('on_auth_user_created','on_auth_email_confirmed') and not tgisinternal;
  checks := checks || jsonb_build_object('name', 'registration:auth_triggers_attached', 'ok', n = 2,
    'detail', case when n = 2 then 'Sign-up and email verification both reach the registration flow.' else 'An auth.users trigger is missing: sign-ups or verifications are not processed.' end);

  select count(*) into n from pg_trigger where tgname in ('organizations_registration_activation','organizations_email_domain_sync','notifications_account_mail') and not tgisinternal;
  checks := checks || jsonb_build_object('name', 'registration:followup_triggers_attached', 'ok', n = 3,
    'detail', case when n = 3 then 'Company activation, domain sync and account emails are wired.' else 'A registration trigger is missing (activation, domain sync or account email).' end);

  select count(*) into n from pg_class where relname in ('registrations','company_domains') and relnamespace = 'public'::regnamespace and relrowsecurity;
  checks := checks || jsonb_build_object('name', 'registration:tables_rls', 'ok', n = 2,
    'detail', case when n = 2 then 'registrations and company_domains are behind RLS.' else 'registrations or company_domains has RLS switched off.' end);

  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'registrations' and cmd <> 'SELECT';
  checks := checks || jsonb_build_object('name', 'registration:no_direct_writes', 'ok', n = 0,
    'detail', case when n = 0 then 'Registrations change only through RPCs that check their own authority.' else 'A write policy exists on registrations: somebody could edit their own company or state.' end);

  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'registrations' and coalesce(qual, '') like '%current_org()%';
  checks := checks || jsonb_build_object('name', 'registration:company_read_is_tenanted', 'ok', n >= 1,
    'detail', case when n >= 1 then 'A company reads only its own registrations.' else 'registrations has no org-scoped read policy.' end);

  select count(*) into n from company_domains where verified and status = 'active' and is_public_email_domain(domain);
  checks := checks || jsonb_build_object('name', 'registration:no_public_provider_domains', 'ok', n = 0,
    'detail', case when n = 0 then 'No public mailbox provider is mapped to a company.' else 'A public mailbox provider is mapped to a company: anyone could register into it.' end);

  select count(*) into n from cron.job where jobname = 'ghl_registration_reminders' and active;
  checks := checks || jsonb_build_object('name', 'registration:reminders_scheduled', 'ok', n = 1,
    'detail', case when n = 1 then 'Pending approvals are reminded daily at 09:15 IST.' else 'The registration reminder cron is not scheduled.' end);

  select count(*) into n from pg_policies where schemaname = 'public' and policyname = 'active_member_only' and permissive = 'RESTRICTIVE'
     and tablename in ('channels','channel_members','wiki_pages','comm_templates') and qual like '%is_active_member()%';
  checks := checks || jsonb_build_object('name', 'registration:pending_reads_nothing', 'ok', n = 4,
    'detail', case when n = 4 then 'A pending, suspended or deactivated account reads no channels, memberships, wiki or templates (0079).'
                   else 'An active-member-only policy is missing: a pending account can read company content again.' end);

  return selftest_result(checks);
end $$;
revoke all on function public.test_registration() from public, anon;
grant execute on function public.test_registration() to authenticated;

-- Fixed search_path on the two small domain helpers from 0078 (database linter: function_search_path_mutable).
alter function public.normalize_email_domain(text) set search_path = public;
alter function public.is_public_email_domain(text) set search_path = public;
