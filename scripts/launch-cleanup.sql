-- GHL ONE — launch cleanup. Run in Supabase SQL editor (or via MCP execute_sql) ONLY after:
--   1. Supabase Auth → URL configuration → Site URL = https://ghlone.netlify.app (+ redirect URLs for both sites)
--   2. The owner (aby777333@gmail.com) has signed up at /login → "Create account" and can log in.
-- The script refuses to run until the owner profile exists as super_admin, so it is safe to re-run.
-- Everything runs in one transaction: either all of it applies, or nothing does.

begin;

do $$
declare v_owner uuid; v_org uuid := '00000000-0000-0000-0000-000000000001';
begin
  select id into v_owner from profiles where lower(email) = 'aby777333@gmail.com' and role = 'super_admin' and is_active;
  if v_owner is null then
    raise exception 'ABORT: owner aby777333@gmail.com has no active super_admin profile yet. Sign up first, then re-run.';
  end if;

  -- 1. Primary admin → owner (approvals, escalations and HR fallbacks route here)
  update organizations set settings = settings || jsonb_build_object('primary_admin_id', v_owner) where id = v_org;

  -- 2. Smoke-test rows created while verifying Phase 4/5
  delete from help_requests where id = '97bdf050-9840-4a12-b964-4914cbb2fc11';                                -- URGENT (it): Smoke test: VPN down
  delete from incidents     where id = 'fe7bea0e-a5cd-44c5-863c-75554d1d81b9';                                -- Smoke test: staging deploy failing
  delete from tasks         where id in ('e19d1174-25dc-42de-82a6-52928c43c5e6','ba324dca-8e99-443f-9413-0c47028bf7df'); -- Blink test + Incident task
  delete from workflow_runs where subject_user_id in (select id from profiles where lower(email) like '%@ghl.demo'); -- Arun's onboarding run

  -- 3. Demo accounts. profiles.id → auth.users is ON DELETE CASCADE and every FK that points at
  --    profiles is CASCADE or SET NULL, so deleting the auth users removes their profiles, channel
  --    memberships, messages, tasks etc. cleanly.
  delete from auth.users where lower(email) in ('ceo@ghl.demo','manager@ghl.demo','employee@ghl.demo','writer@ghl.demo');
  -- QA accounts handed to the IT team for role-by-role testing (created 2026-09-08).
  delete from invites where lower(email) like '%@ghl.test';
  delete from auth.users where lower(email) like '%@ghl.test';

  raise notice 'Launch cleanup done. primary_admin_id=%, demo users removed=4', v_owner;
end $$;

-- Sanity check before you COMMIT: expect the owner only, no @ghl.demo, and primary_admin_id = owner id.
select u.email, p.role, (select settings->>'primary_admin_id' from organizations limit 1) as primary_admin_id
from auth.users u left join profiles p on p.id = u.id order by u.created_at;

commit;
