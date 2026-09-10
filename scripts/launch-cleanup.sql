-- GHL ONE — launch cleanup. Removes every demo and QA account and the content they created.
--
-- RUN THIS YOURSELF, in Supabase → SQL editor. It deletes production rows, so it is deliberately
-- not run by tooling. Everything is inside one transaction: it all applies, or none of it does.
--
-- Before running, confirm:
--   1. Supabase Auth → URL configuration → Site URL = https://ghlone.netlify.app
--      (+ both sites in Redirect URLs)
--   2. aby777333@gmail.com has an active super_admin profile and can sign in.
-- The script refuses to run otherwise, and is safe to re-run.
--
-- What it removes (verified against the database on 2026-09-10):
--   • 4 demo accounts  @ghl.demo  — Bhisham Rao, Priya Nair, Arun Kumar, Raj Menon
--   • 7 QA accounts    @ghl.test  — Test Super Admin / Dept Head / HR Manager / Team Lead /
--                                   Support Agent / Intern / Vendor
--   • everything they created: 27 of 28 tasks, 44 of 47 messages, the 1 project, 3 help requests,
--     their channel memberships, live rooms, boards, recordings, notifications.
-- What it keeps:
--   • the 5 real accounts (Aby, Abe, Rajkumar, Bennet, Saro)
--   • sadavasthulamanichandra@gmail.com — inactive, never signed in, kept deliberately in case it
--     is a real person. Remove it from Admin → People if it was a stray signup.
--   • all structure: departments, channels, wiki pages, roles, permissions, screens
--   • audit_logs — history is kept, and since 0044 it survives the deletion of the account it
--     refers to (the actor's name is stored on the row).
--
-- No real person reports to a demo account, so no reporting line is orphaned by this.

begin;

do $$
declare v_owner uuid; v_org uuid := '00000000-0000-0000-0000-000000000001'; n int;
begin
  select id into v_owner from profiles
   where lower(email) = 'aby777333@gmail.com' and role = 'super_admin' and is_active;
  if v_owner is null then
    raise exception 'ABORT: owner aby777333@gmail.com has no active super_admin profile yet. Sign in first, then re-run.';
  end if;

  -- Approvals, escalations and HR fallbacks route to the owner, not to a demo account.
  update organizations set settings = settings || jsonb_build_object('primary_admin_id', v_owner)
   where id = v_org;

  -- profiles.id → auth.users is ON DELETE CASCADE, and every FK pointing at profiles is CASCADE or
  -- SET NULL, so removing the auth users takes their content with them in one step.
  delete from invites where lower(email) like '%@ghl.demo' or lower(email) like '%@ghl.test';
  delete from auth.users where lower(email) like '%@ghl.demo' or lower(email) like '%@ghl.test';
  get diagnostics n = row_count;
  raise notice 'Removed % demo/QA accounts. primary_admin_id=%', n, v_owner;
end $$;

-- Check this before you COMMIT. Expect 6 rows: the 5 real people plus the inactive stray signup,
-- no @ghl.demo or @ghl.test, and primary_admin_id equal to Aby's id.
select u.email, p.full_name, p.role, p.is_active
from auth.users u left join profiles p on p.id = u.id
order by p.role, u.email;

commit;

-- ---------------------------------------------------------------------------------------------
-- The empty test tenant "GHL INDIA ASSETS", created while trying the onboarding wizard.
--
-- Run this SEPARATELY, after the block above has committed.
--
-- Note: a company cannot simply be `delete`d. `config_history_log()` fires as the company's rows
-- cascade away and writes a history row referencing the org that is disappearing, which violates
-- its own foreign key. That is consistent with the platform's own rule — a company is suspended,
-- made read-only or archived, never deleted — so ARCHIVING is the supported path and the one to
-- prefer:
--
--   select set_company_status(
--     (select id from organizations where name = 'GHL INDIA ASSETS'),
--     'archived',
--     'Created while testing the onboarding wizard; not a real company.');
--
-- If you genuinely want the row gone rather than archived, remove the config-logged children
-- first so nothing writes history mid-cascade:
--
--   begin;
--   do $$
--   declare o uuid;
--   begin
--     select id into o from organizations where name = 'GHL INDIA ASSETS';
--     if o is null then raise notice 'already gone'; return; end if;
--     if exists (select 1 from profiles where org_id = o) then
--       raise exception 'ABORT: that company has people in it.';
--     end if;
--     delete from permission_overrides where user_id in (select id from profiles where org_id = o);
--     delete from role_defaults  where org_id = o;
--     delete from system_roles   where org_id = o;
--     delete from org_features   where org_id = o;
--     delete from organizations  where id = o;
--   end $$;
--   commit;
