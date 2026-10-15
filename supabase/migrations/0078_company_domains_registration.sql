-- 0078 — Multi-company employee registration: company domains, a registration record that can wait
-- for a company that does not exist yet, an account status that says what is actually happening,
-- and the owner controls that move people from "registered" to "inside the right workspace".
--
-- What was true before this migration:
--   * Every sign-up landed in the FIRST company (GHL India Ventures) — even an invite addressed to
--     another company's workspace (`invites.org_id` was ignored), so `bennet@jaminbazaar.in`, invited
--     into Jamin Bazaar, would have been filed in the wrong tenant.
--   * The only domain rule was `organizations.email_domain` of that first company (0071). There was no
--     way to say "gio4x.com belongs to GIO4X" before GIO4X existed, so a GIO4X employee had nowhere to
--     wait except the wrong company's approval queue.
--   * A suspended person was sent to "Account awaiting approval", which is not what had happened.
--
-- Design:
--   * `company_domains` maps a verified domain to a company. `org_id` may be NULL: the company is known
--     by name but has no workspace yet. Only a platform owner writes it. A domain is recognised for
--     registration only once VERIFIED (DNS TXT or the owner's recorded attestation).
--   * `registrations` is one row per sign-up, created by `handle_new_user()`. When the company has no
--     workspace yet there is deliberately NO profile: a profile must belong to a tenant, and parking
--     people in a "holding" tenant would let waiting registrants of different companies see each other.
--     The row waits; linking the domain to a company creates the profile (`materialize_registrations`).
--   * Being on an approved domain never grants access by itself. Access needs an approver's decision,
--     or a domain explicitly marked `auto_approve` by the owner (the "trusted provisioning process").
--     ghlindiaventures.com is seeded auto-approve, which is exactly 0071's behaviour, unchanged.
--   * Unknown domains behave exactly as before 0078: inactive in the first company, waiting for its
--     approvers (0060).
--   * Approvers are told AFTER the address is verified, not at sign-up — an unverified sign-up proves
--     nothing about who is asking.

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.company_domains (
  id                  uuid primary key default gen_random_uuid(),
  domain              text not null unique
                        check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  company_name        text not null check (length(btrim(company_name)) between 2 and 120),
  org_id              uuid references public.organizations(id) on delete set null,
  status              text not null default 'active' check (status in ('active','disabled')),
  verified            boolean not null default false,
  verification_method text check (verification_method in ('dns','owner_attested')),
  verification_token  text not null default replace(gen_random_uuid()::text, '-', ''),
  verified_at         timestamptz,
  verified_by         uuid,
  verified_label      text,
  verification_note   text,
  auto_approve        boolean not null default false,
  notes               text,
  created_by          uuid,
  created_label       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists company_domains_org_idx on public.company_domains(org_id);

comment on table public.company_domains is
  'Verified email domain → company. org_id NULL = the company is known but has no GHL ONE workspace yet. Written only by platform owners through RPCs (0078).';

create table if not exists public.registrations (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  org_id                  uuid references public.organizations(id) on delete set null,
  company_domain_id       uuid references public.company_domains(id) on delete set null,
  email                   text not null,
  domain                  text not null,
  company_label           text,
  recognized              boolean not null default false,
  via                     text not null default 'unrecognized' check (via in ('first','invite','domain','unrecognized')),
  full_name               text,
  designation             text,
  employee_ref            text,
  phone                   text,
  manager_name            text,
  manager_id              uuid references public.profiles(id) on delete set null,
  requested_department_id uuid references public.departments(id) on delete set null,
  requested_department    text,
  note                    text,
  policies_accepted_at    timestamptz,
  email_verified_at       timestamptz,
  state                   text not null default 'open' check (state in ('open','rejected')),
  decision_note           text,
  decided_by              uuid,
  decided_label           text,
  decided_at              timestamptz,
  materialized_at         timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists registrations_org_idx    on public.registrations(org_id);
create index if not exists registrations_domain_idx on public.registrations(company_domain_id);

comment on table public.registrations is
  'One row per self sign-up (0078): what the person told us, which company their verified domain resolved to, and — when that company has no workspace yet — the only record of them until it does.';

alter table public.company_domains enable row level security;
alter table public.registrations  enable row level security;

-- Owners see everything; a company's own administrators see their own domains (read-only).
drop policy if exists cd_owner_read on public.company_domains;
create policy cd_owner_read on public.company_domains for select to authenticated
  using (is_platform_owner());
drop policy if exists cd_company_read on public.company_domains;
create policy cd_company_read on public.company_domains for select to authenticated
  using (org_id = current_org() and is_active_member() and (is_admin() or is_hr()));

-- A person reads their own registration; owners read all; a company's approvers read the ones they
-- may act on. No write policies: every write is an RPC that checks its own authority.
drop policy if exists reg_self on public.registrations;
create policy reg_self on public.registrations for select to authenticated
  using (user_id = auth.uid());
drop policy if exists reg_owner on public.registrations;
create policy reg_owner on public.registrations for select to authenticated
  using (is_platform_owner());
drop policy if exists reg_company on public.registrations;
create policy reg_company on public.registrations for select to authenticated
  using (org_id = current_org() and can_approve_account(user_id));

revoke all on public.company_domains from anon;
revoke all on public.registrations  from anon;
grant select on public.company_domains, public.registrations to authenticated;

-- The department a person named that does not exist yet → "Pending Department Assignment".
alter table public.join_requests add column if not exists requested_department text;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Small helpers
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

-- Is this company's workspace open for people to be admitted into?
create or replace function public.company_available(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select o.status in ('active','trial') from organizations o where o.id = p_org), false)
$$;

-- Per-company registration requirements (organizations.settings -> 'registration').
create or replace function public.registration_settings(p_org uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'require_phone',       coalesce((o.settings->'registration'->>'require_phone')::boolean, false),
    'require_employee_id', coalesce((o.settings->'registration'->>'require_employee_id')::boolean, false),
    'show_departments',    coalesce((o.settings->'registration'->>'show_departments')::boolean, true),
    'reminder_days',       coalesce((o.settings->'registration'->>'reminder_days')::int, 2)
  )
  from organizations o where o.id = p_org
$$;

-- Normalise what an owner types: "@Jaminbazaar.in", "info@jaminbazaar.in" and "jaminbazaar.in" are one domain.
create or replace function public.normalize_email_domain(p text)
returns text language sql immutable as $$
  select nullif(lower(btrim(regexp_replace(coalesce(p, ''), '^.*@', ''))), '')
$$;

-- Public mailbox providers can never be a company domain: anyone can own an address there.
create or replace function public.is_public_email_domain(p text)
returns boolean language sql immutable as $$
  select normalize_email_domain(p) = any (array[
    'gmail.com','googlemail.com','yahoo.com','yahoo.co.in','yahoo.in','ymail.com','outlook.com','hotmail.com',
    'live.com','msn.com','icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','zoho.com',
    'zohomail.in','rediffmail.com','gmx.com','mail.com','yandex.com','tutanota.com','fastmail.com'])
$$;

-- The platform owners' profile ids (for "somebody registered for a company that is not here yet").
create or replace function public.platform_owner_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select pa.user_id from platform_admins pa join profiles p on p.id = pa.user_id
   where pa.role = 'platform_super_admin' and p.is_active and not p.frozen
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Account status — one function every screen asks, so they cannot disagree
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.account_status_of(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r   registrations%rowtype;
  p   profiles%rowtype;
  o   organizations%rowtype;
  jr  join_requests%rowtype;
  v_confirmed timestamptz;
  v_status    text;
  v_needs     text[] := '{}';
  v_set       jsonb;
  v_dept      text;
  v_company   text;
  v_has_depts boolean;
begin
  if p_user is null then return jsonb_build_object('status', 'signed_out'); end if;
  select email_confirmed_at into v_confirmed from auth.users where id = p_user;
  select * into r from registrations where user_id = p_user;
  select * into p from profiles where id = p_user;

  if p.id is null then
    if r.user_id is null then return jsonb_build_object('status', 'unknown'); end if;
    v_status := case
      when r.state = 'rejected' then 'rejected'
      when v_confirmed is null then 'email_verification_pending'
      else 'awaiting_company' end;
    return jsonb_build_object(
      'status', v_status,
      'email', r.email,
      'full_name', r.full_name,
      'company', jsonb_build_object('name', r.company_label, 'available', false, 'on_platform', false),
      'department', null,
      'requested_department', r.requested_department,
      'request', null,
      'decision_note', r.decision_note,
      'decided_label', r.decided_label,
      'registration', jsonb_build_object('designation', r.designation, 'phone', r.phone, 'employee_ref', r.employee_ref,
        'manager_name', r.manager_name, 'recognized', r.recognized, 'domain', r.domain, 'via', r.via,
        'email_verified_at', coalesce(r.email_verified_at, v_confirmed), 'created_at', r.created_at),
      'needs', '[]'::jsonb);
  end if;

  select * into o  from organizations where id = p.org_id;
  select * into jr from join_requests where user_id = p_user order by created_at desc limit 1;
  select exists (select 1 from departments d where d.org_id = p.org_id) into v_has_depts;

  v_status := case
    when v_confirmed is null and not p.is_active then 'email_verification_pending'
    when p.status = 'suspended' or (p.is_active and p.frozen) then 'suspended'
    when p.is_active then 'active'
    when p.status in ('inactive','exited') or p.employee_code is not null then 'deactivated'
    when jr.status = 'declined' or r.state = 'rejected' then 'rejected'
    when not company_available(p.org_id) then 'awaiting_company'
    when jr.id is not null and jr.status = 'pending' and jr.department_id is null
         and (nullif(btrim(jr.requested_department), '') is not null or not v_has_depts) then 'pending_department'
    else 'pending_approval' end;

  if v_status in ('pending_approval','pending_department','awaiting_company') then
    v_set := coalesce(registration_settings(p.org_id), '{}'::jsonb);
    if (v_set->>'require_phone')::boolean and nullif(btrim(coalesce(p.phone, r.phone)), '') is null then v_needs := array_append(v_needs, 'phone'); end if;
    if (v_set->>'require_employee_id')::boolean and nullif(btrim(r.employee_ref), '') is null then v_needs := array_append(v_needs, 'employee_id'); end if;
    if v_has_depts and (jr.id is null or jr.status <> 'pending' or (jr.department_id is null and nullif(btrim(jr.requested_department), '') is null)) then
      v_needs := array_append(v_needs, 'department');
    end if;
  end if;

  select name into v_dept from departments where id = coalesce(case when p.is_active then p.department_id end, jr.department_id, p.department_id);

  return jsonb_build_object(
    'status', v_status,
    'email', p.email,
    'full_name', p.full_name,
    'company', jsonb_build_object('name', coalesce(o.name, r.company_label), 'status', o.status,
                                  'available', company_available(p.org_id), 'on_platform', o.id is not null),
    'department', case when v_dept is null then null else jsonb_build_object('name', v_dept) end,
    'requested_department', nullif(btrim(coalesce(jr.requested_department, r.requested_department)), ''),
    'request', case when jr.id is null then null else jsonb_build_object(
                 'status', jr.status, 'department_id', jr.department_id, 'designation', jr.designation, 'note', jr.note,
                 'decision_note', jr.decision_note, 'decided_label', jr.decided_label, 'created_at', jr.created_at) end,
    'decision_note', coalesce(jr.decision_note, r.decision_note),
    'decided_label', coalesce(jr.decided_label, r.decided_label),
    'registration', jsonb_build_object('designation', coalesce(r.designation, p.designation), 'phone', coalesce(p.phone, r.phone),
        'employee_ref', r.employee_ref, 'manager_name', r.manager_name, 'recognized', coalesce(r.recognized, false),
        'domain', coalesce(r.domain, split_part(p.email, '@', 2)), 'via', r.via,
        'email_verified_at', coalesce(r.email_verified_at, v_confirmed), 'created_at', coalesce(r.created_at, p.created_at)),
    'needs', to_jsonb(v_needs));
end $$;

create or replace function public.my_account_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select account_status_of(auth.uid())
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Who is told what
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

-- notify_account_pending (0060) told approvers at the moment of sign-up. Sign-ups made through
-- handle_new_user() now announce themselves once the address is verified (registration_announce),
-- so the old trigger stands down for exactly that person — the `ghl.signup_handled` marker, the same
-- idiom as `ghl.transfer_notified` (0056). Any other inactive insert behaves as before.
create or replace function public.notify_account_pending()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_target uuid;
  v_who    text;
begin
  if auth.uid() is not null then return null; end if;
  if coalesce(current_setting('ghl.signup_handled', true), '') = new.id::text then return null; end if;

  v_who := coalesce(nullif(btrim(new.full_name), ''), new.email);
  begin
    for v_target in select approver from account_approvers(new.org_id, new.department_id) approver loop
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id)
      values (v_target, new.org_id, 'action_required',
              'New sign-up awaiting approval: ' || v_who,
              new.email || ' has created an account and cannot sign in until it is approved.',
              '/people/requests', 'signup', new.id);
    end loop;
  exception when others then
    null;
  end;
  return null;
end $function$;

-- Called once the address is verified (and at sign-up if it already was). Tells the right people.
create or replace function public.registration_announce(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  r      registrations%rowtype;
  p      profiles%rowtype;
  jr     join_requests%rowtype;
  v_t    uuid;
  v_who  text;
  v_org  text;
  v_dept text;
  v_owner_org uuid;
begin
  update registrations set email_verified_at = coalesce(email_verified_at, now()), updated_at = now()
   where user_id = p_user;
  select * into r from registrations where user_id = p_user;
  select * into p from profiles where id = p_user;
  v_who := coalesce(nullif(btrim(coalesce(p.full_name, r.full_name)), ''), coalesce(p.email, r.email));

  if p.id is null then
    if r.user_id is null or r.state <> 'open' then return; end if;
    -- The company is not on GHL ONE yet: only the platform owners can do anything about that.
    for v_t in select platform_owner_ids() loop
      select org_id into v_owner_org from profiles where id = v_t;
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, meta)
      values (v_t, v_owner_org, 'action_required',
              v_who || ' registered for ' || coalesce(r.company_label, r.domain) || ' — not on GHL ONE yet',
              r.email || ' verified their address. ' || coalesce(r.company_label, r.domain)
                || ' has no workspace yet, so they are waiting. Link the domain to a company to move them along.',
              '/platform?tab=registrations', 'registration', p_user, jsonb_build_object('company', r.company_label));
    end loop;
    return;
  end if;

  select name into v_org from organizations where id = p.org_id;

  if not p.is_active then
    select * into jr from join_requests where user_id = p_user and status = 'pending' order by created_at desc limit 1;
    select name into v_dept from departments where id = jr.department_id;
    if company_available(p.org_id) then
      for v_t in select approver from account_approvers(p.org_id, jr.department_id) approver loop
        if v_t = p_user then continue; end if;
        insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id)
        values (v_t, p.org_id, 'action_required',
                'New sign-up awaiting approval: ' || v_who,
                p.email
                  || coalesce(' · ' || nullif(btrim(jr.designation), ''), '')
                  || coalesce(' · ' || v_dept, coalesce(' · asked for ' || nullif(btrim(jr.requested_department), '') || ' (not set up yet)', ''))
                  || '. Verified their email and cannot sign in until it is approved.',
                '/people/requests', 'signup', p_user);
      end loop;
    else
      for v_t in select platform_owner_ids() loop
        select org_id into v_owner_org from profiles where id = v_t;
        insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id)
        values (v_t, v_owner_org, 'action_required',
                v_who || ' registered for ' || coalesce(v_org, 'a company') || ', which is not active yet',
                p.email || ' verified their address and is waiting for ' || coalesce(v_org, 'the company') || '''s workspace to be activated.',
                '/platform?tab=registrations', 'registration', p_user);
      end loop;
    end if;
  elsif coalesce(r.requested_department_id::text, nullif(btrim(r.requested_department), '')) is not null and p.department_id is null then
    -- Admitted automatically by a trusted domain. Their self-chosen department was NOT applied (a
    -- department carries default permissions), so whoever runs the department is asked to confirm it.
    select name into v_dept from departments where id = r.requested_department_id;
    for v_t in select approver from account_approvers(p.org_id, r.requested_department_id) approver loop
      if v_t = p_user then continue; end if;
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id)
      values (v_t, p.org_id, 'action_required',
              v_who || ' joined ' || coalesce(v_org, 'the company') || ' — department to assign',
              'They signed in with their company email and say they work in '
                || coalesce(v_dept, nullif(btrim(r.requested_department), '')) || '. Confirm it in their employee record.',
              '/people/' || p_user, 'profile', p_user);
    end loop;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 5. Sign-up
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_default  uuid;
  v_org      uuid;
  v_inv      invites%rowtype;
  v_first    boolean;
  v_name     text;
  v_meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_dom      text  := lower(split_part(coalesce(new.email, ''), '@', 2));
  v_cd       company_domains%rowtype;
  v_active   boolean := false;
  v_profile  boolean := true;
  v_dept     uuid;
  v_req_dept text;
  v_phone    text;
  v_desig    text;
  v_emp      text;
  v_mgr_txt  text;
  v_mgr      uuid;
  v_note     text;
  v_label    text;
  v_via      text;
begin
  select id into v_default from organizations order by created_at limit 1;
  select not exists (select 1 from profiles) into v_first;
  v_name     := coalesce(nullif(btrim(v_meta->>'full_name'), ''), split_part(new.email, '@', 1));
  v_phone    := nullif(left(btrim(coalesce(v_meta->>'phone', '')), 32), '');
  v_desig    := nullif(left(btrim(coalesce(v_meta->>'designation', '')), 80), '');
  v_emp      := nullif(left(btrim(coalesce(v_meta->>'employee_ref', '')), 40), '');
  v_mgr_txt  := nullif(left(btrim(coalesce(v_meta->>'manager', '')), 120), '');
  v_req_dept := nullif(left(btrim(coalesce(v_meta->>'requested_department', '')), 80), '');
  v_note     := nullif(left(btrim(coalesce(v_meta->>'note', '')), 300), '');

  select * into v_inv from invites
   where lower(email) = lower(new.email) and accepted_at is null
   limit 1;

  -- A verified, enabled company domain. Exact match on the part after '@': a look-alike such as
  -- "x@evil-gio4x.com" or "x@gio4x.com.evil.io" matches nothing.
  select * into v_cd from company_domains where domain = v_dom and status = 'active' and verified limit 1;

  if v_first then
    v_org := v_default; v_active := true; v_via := 'first';
  elsif v_inv.id is not null then
    -- An invite names its company. It used to be ignored and everyone landed in the first company.
    v_org := coalesce(v_inv.org_id, v_default); v_active := true; v_via := 'invite';
  elsif v_cd.id is not null and v_cd.org_id is not null then
    v_org := v_cd.org_id; v_via := 'domain';
    -- Only a domain the owner marked as trusted admits on arrival, and only into an open workspace.
    v_active := v_cd.auto_approve and company_available(v_org);
  elsif v_cd.id is not null then
    -- The company is recognised but has no workspace yet. No profile: the registration waits.
    v_profile := false; v_via := 'domain';
  else
    -- Unrecognised domain: unchanged since 0060 — inactive in the first company, awaiting approval.
    v_org := v_default; v_active := false; v_via := 'unrecognized';
  end if;

  if v_org is not null and coalesce(v_meta->>'department_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_dept from departments where id = (v_meta->>'department_id')::uuid and org_id = v_org;
  end if;
  if v_org is not null and v_mgr_txt like '%@%' then
    select id into v_mgr from profiles where org_id = v_org and lower(email) = lower(v_mgr_txt) and is_active limit 1;
  end if;
  v_label := coalesce((select name from organizations where id = coalesce(v_cd.org_id, v_org)), v_cd.company_name);

  if not v_profile then
    -- The only record of this person until their company exists, so a failure here must fail the
    -- sign-up loudly rather than leave an account with nothing behind it.
    insert into registrations (user_id, org_id, company_domain_id, email, domain, company_label, recognized, via,
                               full_name, designation, employee_ref, phone, manager_name,
                               requested_department, note, policies_accepted_at, email_verified_at)
    values (new.id, null, v_cd.id, lower(new.email), v_dom, v_label, true, v_via,
            v_name, v_desig, v_emp, v_phone, v_mgr_txt,
            v_req_dept, v_note,
            case when coalesce(v_meta->>'policies_accepted', '') in ('true','1') then now() end,
            new.email_confirmed_at)
    on conflict (user_id) do nothing;
    if new.email_confirmed_at is not null then
      begin perform registration_announce(new.id); exception when others then null; end;
    end if;
    return new;
  end if;

  -- An inactive sign-up is announced once its address is verified (registration_announce), not here.
  if not v_active then
    perform set_config('ghl.signup_handled', new.id::text, true);
  end if;

  insert into profiles (id, org_id, email, full_name, role, department_id, designation, manager_id, phone, is_active, joined_at)
  values (
    new.id, v_org, new.email,
    coalesce(v_inv.full_name, v_name),
    case when v_first then 'super_admin'::role_level else coalesce(v_inv.role, 'employee'::role_level) end,
    -- A self-chosen department never lands on the profile before somebody approves it: departments
    -- carry default permissions. It travels on the join request / registration instead.
    v_inv.department_id,
    coalesce(v_inv.designation, v_desig),
    v_inv.manager_id,
    coalesce(v_inv.phone, v_phone),
    v_active,
    current_date
  );

  if v_inv.id is not null then
    update invites set accepted_at = now() where id = v_inv.id;
  end if;

  insert into channel_members (channel_id, user_id)
  select c.id, new.id from channels c
   where c.org_id = v_org and c.type in ('company','announcement') and not c.is_private
  on conflict do nothing;

  -- Never fail a sign-up over the paperwork once the profile exists.
  begin
    insert into registrations (user_id, org_id, company_domain_id, email, domain, company_label, recognized, via,
                               full_name, designation, employee_ref, phone, manager_name, manager_id,
                               requested_department_id, requested_department, note, policies_accepted_at,
                               email_verified_at, materialized_at)
    values (new.id, v_org, v_cd.id, lower(new.email), v_dom, v_label, v_cd.id is not null, v_via,
            v_name, v_desig, v_emp, v_phone, v_mgr_txt, v_mgr,
            v_dept, case when v_dept is null then v_req_dept end, v_note,
            case when coalesce(v_meta->>'policies_accepted', '') in ('true','1') then now() end,
            new.email_confirmed_at, now())
    on conflict (user_id) do nothing;

    if not v_active then
      insert into join_requests (org_id, user_id, department_id, designation, note, requested_department)
      values (v_org, new.id, v_dept, v_desig,
              nullif(concat_ws(' · ', v_note,
                               case when v_emp is not null then 'Employee ID ' || v_emp end,
                               case when v_mgr_txt is not null then 'Reports to ' || v_mgr_txt end), ''),
              case when v_dept is null then v_req_dept end);
    end if;

    if new.email_confirmed_at is not null then
      perform registration_announce(new.id);
    end if;
  exception when others then
    raise notice 'registration record skipped for %: %', new.id, sqlerrm;
  end;

  return new;
end $function$;

-- Verification is the moment a registration becomes real enough to tell anybody about.
create or replace function public.on_auth_email_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform registration_announce(new.id);
  exception when others then
    -- Never let our bookkeeping break somebody's email confirmation. The daily reminder catches
    -- any announcement lost here.
    raise notice 'registration_announce failed for %: %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists on_auth_email_confirmed on auth.users;
create trigger on_auth_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.on_auth_email_confirmed();

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 6. A company arrives: registrations become people
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.materialize_registrations(p_domain_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare
  r        registrations%rowtype;
  cd       company_domains%rowtype;
  v_avail  boolean;
  v_active boolean;
  v_dept   uuid;
  v_org    text;
  v_n      int := 0;
  v_ready  int := 0;
  v_orgs   uuid[] := '{}';
  v_o      uuid;
  v_t      uuid;
  v_conf   timestamptz;
begin
  for r in
    select rg.* from registrations rg
     where rg.company_domain_id = any (p_domain_ids) and rg.state = 'open'
       and not exists (select 1 from profiles pp where pp.id = rg.user_id)
     order by rg.created_at
  loop
    select * into cd from company_domains where id = r.company_domain_id;
    if cd.org_id is null then continue; end if;
    select name into v_org from organizations where id = cd.org_id;
    select email_confirmed_at into v_conf from auth.users where id = r.user_id;
    v_avail  := company_available(cd.org_id);
    v_active := cd.auto_approve and v_avail;
    v_dept   := null;
    if nullif(btrim(r.requested_department), '') is not null then
      select d.id into v_dept from departments d
       where d.org_id = cd.org_id and (lower(d.name) = lower(btrim(r.requested_department)) or d.slug = lower(btrim(r.requested_department)))
       limit 1;
    end if;

    perform set_config('ghl.signup_handled', r.user_id::text, true);
    insert into profiles (id, org_id, email, full_name, role, designation, phone, is_active, joined_at)
    values (r.user_id, cd.org_id, r.email, coalesce(nullif(btrim(r.full_name), ''), split_part(r.email, '@', 1)),
            'employee', r.designation, r.phone, v_active, current_date);
    perform set_config('ghl.signup_handled', '', true);

    insert into channel_members (channel_id, user_id)
    select c.id, r.user_id from channels c
     where c.org_id = cd.org_id and c.type in ('company','announcement') and not c.is_private
    on conflict do nothing;

    if not v_active then
      insert into join_requests (org_id, user_id, department_id, designation, note, requested_department)
      values (cd.org_id, r.user_id, v_dept, r.designation,
              nullif(concat_ws(' · ', r.note,
                               case when r.employee_ref is not null then 'Employee ID ' || r.employee_ref end,
                               case when r.manager_name is not null then 'Reports to ' || r.manager_name end), ''),
              case when v_dept is null then nullif(btrim(r.requested_department), '') end);
    end if;

    update registrations
       set org_id = cd.org_id, company_label = v_org, materialized_at = now(), updated_at = now(),
           requested_department_id = coalesce(v_dept, requested_department_id)
     where user_id = r.user_id;

    insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, meta)
    values (r.user_id, cd.org_id, 'information',
            case when v_active then 'Your ' || v_org || ' account is ready'
                 when v_avail  then v_org || ' is now on GHL ONE'
                 else v_org || ' has been added to GHL ONE' end,
            case when v_active then 'Your company workspace is open and your account is active. Sign in to GHL ONE.'
                 when v_avail  then 'Your registration has moved into the ' || v_org || ' workspace and is with its administrators. You do not need to register again — you will be told the moment it is approved.'
                 else 'Its workspace is being prepared. You do not need to register again — you will be told when it opens.' end,
            '/', 'registration', r.user_id,
            jsonb_build_object('email', v_conf is not null));

    v_n := v_n + 1;
    if v_avail and not v_active and v_conf is not null then
      v_ready := v_ready + 1;
      if not (cd.org_id = any (v_orgs)) then v_orgs := v_orgs || cd.org_id; end if;
    end if;
  end loop;

  -- One notice per approver per company, not one per person.
  foreach v_o in array v_orgs loop
    select name into v_org from organizations where id = v_o;
    for v_t in select approver from account_approvers(v_o, null) approver loop
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id)
      values (v_t, v_o, 'action_required',
              'People registered for ' || v_org || ' are waiting for approval',
              'Employees who registered before ' || v_org || ' was on GHL ONE are now in its approval queue.',
              '/people/requests', 'signup', null);
    end loop;
  end loop;

  return v_n;
end $$;

-- When a company's workspace opens, everybody waiting on it hears about it.
create or replace function public.company_activated(p_org uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p        profiles%rowtype;
  v_org    text;
  v_auto   int := 0;
  v_wait   int := 0;
  v_t      uuid;
  v_ids    uuid[];
begin
  select name into v_org from organizations where id = p_org;

  -- Anything still parked on a domain linked to this company.
  select array_agg(id) into v_ids from company_domains where org_id = p_org;
  if v_ids is not null then perform materialize_registrations(v_ids); end if;

  for p in
    select pr.* from profiles pr
     where pr.org_id = p_org and not pr.is_active and pr.employee_code is null
       and pr.status not in ('suspended','inactive','exited')
       and exists (select 1 from join_requests j where j.user_id = pr.id and j.status = 'pending')
  loop
    if exists (select 1 from registrations rg join company_domains cd on cd.id = rg.company_domain_id
                where rg.user_id = p.id and cd.auto_approve and cd.org_id = p_org)
       and exists (select 1 from auth.users u where u.id = p.id and u.email_confirmed_at is not null) then
      -- The owner marked this domain as trusted provisioning: admit on activation.
      perform set_config('ghl.account_approval', p.id::text, true);
      update profiles set is_active = true, joined_at = coalesce(joined_at, current_date) where id = p.id;
      perform set_config('ghl.account_approval', '', true);
      update join_requests set status = 'approved', decided_label = 'Trusted company domain', decided_at = now(), updated_at = now()
       where user_id = p.id and status = 'pending';
      v_auto := v_auto + 1;
    else
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, meta)
      values (p.id, p_org, 'information',
              v_org || '''s workspace is now active',
              'Your request is with its administrators. You do not need to register again — you will be told the moment it is approved.',
              '/', 'registration', p.id, jsonb_build_object('email', true));
      v_wait := v_wait + 1;
    end if;
  end loop;

  if v_wait > 0 then
    for v_t in select approver from account_approvers(p_org, null) approver loop
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id)
      values (v_t, p_org, 'action_required',
              v_wait || case when v_wait = 1 then ' person is' else ' people are' end || ' waiting to join ' || v_org,
              'They registered while the workspace was being prepared.',
              '/people/requests', 'signup', null);
    end loop;
  end if;

  return jsonb_build_object('auto_admitted', v_auto, 'waiting', v_wait);
end $$;

create or replace function public.on_company_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('active','trial') and coalesce(old.status, '') not in ('active','trial') then
    begin
      perform company_activated(new.id);
    exception when others then
      -- Never block a status change over the follow-up notices.
      raise notice 'company_activated failed for %: %', new.id, sqlerrm;
    end;
  end if;
  return null;
end $$;

drop trigger if exists organizations_registration_activation on public.organizations;
create trigger organizations_registration_activation
  after update of status on public.organizations
  for each row when (old.status is distinct from new.status)
  execute function public.on_company_status_change();

-- organizations.email_domain (set by the company wizard or company settings) becomes a company_domains
-- row — UNVERIFIED, so it recognises nobody until an owner verifies it. Only an owner's own action
-- may link an existing, unlinked domain: a company administrator can edit their organization row,
-- and must never be able to claim the people waiting on somebody else's domain.
create or replace function public.sync_org_email_domain()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_dom text; cd company_domains%rowtype;
begin
  v_dom := normalize_email_domain(new.email_domain);
  if v_dom is null or v_dom !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' or is_public_email_domain(v_dom) then
    return null;
  end if;
  begin
    select * into cd from company_domains where domain = v_dom;
    if cd.id is null then
      insert into company_domains (domain, company_name, org_id, notes, created_by, created_label)
      values (v_dom, new.name, new.id, 'From the company settings. Verify ownership before sign-ups on it are recognised.',
              auth.uid(), person_name(auth.uid()));
    elsif cd.org_id is null and is_platform_owner() then
      update company_domains set org_id = new.id, updated_at = now() where id = cd.id;
      perform materialize_registrations(array[cd.id]);
    end if;
  exception when others then
    raise notice 'email domain sync skipped: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists organizations_email_domain_sync on public.organizations;
create trigger organizations_email_domain_sync
  after insert or update of email_domain on public.organizations
  for each row execute function public.sync_org_email_domain();

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 7. Before sign-in: what will happen to this address?
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

-- Says which company a domain belongs to (0059 already allows domain → company before sign-in) and
-- whether its workspace is open. It never says whether an ACCOUNT or an INVITE exists for an address.
create or replace function public.registration_preview(p_email text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_dom text; cd company_domains%rowtype; o organizations%rowtype; v_avail boolean; v_set jsonb;
begin
  v_dom := lower(split_part(btrim(coalesce(p_email, '')), '@', 2));
  if v_dom = '' or position('.' in v_dom) = 0 then return jsonb_build_object('valid', false, 'recognized', false); end if;
  select * into cd from company_domains where domain = v_dom and status = 'active' and verified;
  if cd.id is null then
    return jsonb_build_object('valid', true, 'recognized', false, 'public_provider', is_public_email_domain(v_dom));
  end if;
  select * into o from organizations where id = cd.org_id;
  v_avail := o.id is not null and company_available(o.id);
  v_set := case when o.id is null then '{}'::jsonb else registration_settings(o.id) end;
  return jsonb_build_object(
    'valid', true,
    'recognized', true,
    'company', coalesce(o.name, cd.company_name),
    'workspace', case when o.id is null then 'not_on_platform' when v_avail then 'ready' else 'preparing' end,
    'auto_approve', cd.auto_approve and v_avail,
    'require_phone', coalesce((v_set->>'require_phone')::boolean, false),
    'require_employee_id', coalesce((v_set->>'require_employee_id')::boolean, false),
    'departments', case when v_avail and coalesce((v_set->>'show_departments')::boolean, true) then
      coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.position, d.name)
                  from departments d where d.org_id = o.id and not coalesce(d.frozen, false)), '[]'::jsonb)
      else '[]'::jsonb end);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 8. The waiting person's own controls
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

-- Same contract as 0060, plus the department that does not exist yet. The old 3-argument version is
-- dropped first so PostgREST never has two candidates to choose between.
drop function if exists public.request_account_activation(uuid, text, text);
create or replace function public.request_account_activation(
  p_department uuid default null,
  p_designation text default null,
  p_note text default null,
  p_requested_department text default null)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_me     uuid := auth.uid();
  v_prof   profiles%rowtype;
  v_dept   departments%rowtype;
  v_id     uuid;
  v_target uuid;
  v_who    text;
  v_n      int := 0;
  v_req    text := case when p_department is null then nullif(left(btrim(coalesce(p_requested_department, '')), 80), '') end;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  select * into v_prof from profiles where id = v_me;
  if v_prof.id is null then raise exception 'Your company is not on GHL ONE yet, so there is no department to choose. Your registration is saved — nothing more is needed from you.'; end if;
  if v_prof.is_active then return jsonb_build_object('ok', true, 'already_active', true); end if;
  if v_prof.status in ('suspended','inactive','exited') or v_prof.employee_code is not null then
    raise exception 'This account has been closed. Ask your manager or HR to reactivate it.';
  end if;

  if p_department is not null then
    select * into v_dept from departments where id = p_department and org_id = v_prof.org_id;
    if v_dept.id is null then raise exception 'Choose a department in your company.'; end if;
  end if;

  update join_requests
     set department_id = p_department,
         designation   = nullif(btrim(p_designation), ''),
         note          = nullif(btrim(p_note), ''),
         requested_department = v_req,
         status        = 'pending',
         updated_at    = now()
   where user_id = v_me and status = 'pending'
   returning id into v_id;

  if v_id is null then
    insert into join_requests (org_id, user_id, department_id, designation, note, requested_department)
    values (v_prof.org_id, v_me, p_department, nullif(btrim(p_designation), ''), nullif(btrim(p_note), ''), v_req)
    returning id into v_id;
  end if;

  update registrations set requested_department_id = p_department, requested_department = v_req,
         designation = coalesce(nullif(btrim(p_designation), ''), designation), state = 'open', updated_at = now()
   where user_id = v_me;

  -- A company still being set up is told at activation (company_activated), not now.
  if not company_available(v_prof.org_id) then
    return jsonb_build_object('ok', true, 'request', v_id, 'notified', 0, 'awaiting_company', true);
  end if;

  v_who := coalesce(nullif(btrim(v_prof.full_name), ''), v_prof.email);
  for v_target in select approver from account_approvers(v_prof.org_id, p_department) approver loop
    if v_target = v_me then continue; end if;
    insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
    values (v_target, v_prof.org_id, 'action_required',
            v_who || ' is asking to join ' || coalesce(v_dept.name, case when v_req is not null then v_req || ' (not set up yet)' end, 'the company'),
            v_prof.email
              || coalesce(' · ' || nullif(btrim(p_designation), ''), '')
              || coalesce(' · ' || nullif(btrim(p_note), ''), ''),
            '/people/requests', 'signup', v_me, v_me);
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ok', true, 'request', v_id, 'notified', v_n);
end $function$;

-- Name, phone, designation, employee ID and manager — editable while waiting (and after).
create or replace function public.update_my_registration(
  p_full_name text default null, p_phone text default null, p_designation text default null,
  p_employee_ref text default null, p_manager text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_email text;
  v_name text  := nullif(left(btrim(coalesce(p_full_name, '')), 120), '');
  v_phone text := nullif(left(btrim(coalesce(p_phone, '')), 32), '');
  v_des text   := nullif(left(btrim(coalesce(p_designation, '')), 80), '');
  v_emp text   := nullif(left(btrim(coalesce(p_employee_ref, '')), 40), '');
  v_mgr text   := nullif(left(btrim(coalesce(p_manager, '')), 120), '');
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  if v_name is not null and length(v_name) < 2 then raise exception 'Enter your full name.'; end if;
  select email into v_email from auth.users where id = v_me;

  insert into registrations (user_id, org_id, email, domain, full_name, phone, designation, employee_ref, manager_name, via)
  values (v_me, (select org_id from profiles where id = v_me), lower(v_email), lower(split_part(v_email, '@', 2)),
          v_name, v_phone, v_des, v_emp, v_mgr, 'unrecognized')
  on conflict (user_id) do update
     set full_name    = coalesce(excluded.full_name, registrations.full_name),
         phone        = coalesce(excluded.phone, registrations.phone),
         designation  = coalesce(excluded.designation, registrations.designation),
         employee_ref = coalesce(excluded.employee_ref, registrations.employee_ref),
         manager_name = coalesce(excluded.manager_name, registrations.manager_name),
         updated_at   = now();

  -- Only the fields a person may always change about themselves; profile_guard still applies.
  update profiles
     set full_name   = coalesce(v_name, full_name),
         phone       = coalesce(v_phone, phone),
         designation = case when is_active then designation else coalesce(v_des, designation) end
   where id = v_me;

  return jsonb_build_object('ok', true);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 9. Company approvers see what the person told us
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.pending_accounts()
returns jsonb language sql stable security definer set search_path = public as $function$
  select coalesce(jsonb_agg(x order by created_at), '[]'::jsonb)
    from (
      select p.created_at,
             jsonb_build_object(
               'id', p.id,
               'full_name', p.full_name,
               'email', p.email,
               'avatar_url', p.avatar_url,
               'role', p.role,
               'created_at', p.created_at,
               'department_id', coalesce(r.department_id, p.department_id),
               'department', d.name,
               'designation', coalesce(nullif(btrim(r.designation), ''), p.designation),
               'note', r.note,
               'requested_at', r.created_at,
               'asked', r.id is not null,
               -- 0078 additions — older clients ignore them.
               'requested_department', nullif(btrim(r.requested_department), ''),
               'employee_ref', rg.employee_ref,
               'phone', coalesce(p.phone, rg.phone),
               'manager_name', rg.manager_name,
               'manager_id', rg.manager_id,
               'email_verified', exists (select 1 from auth.users u where u.id = p.id and u.email_confirmed_at is not null),
               'via', rg.via
             ) as x
        from profiles p
        left join lateral (
          select jr.* from join_requests jr
           where jr.user_id = p.id and jr.status = 'pending'
           order by jr.created_at desc limit 1
        ) r on true
        left join departments d on d.id = coalesce(r.department_id, p.department_id)
        left join registrations rg on rg.user_id = p.id
       where p.org_id = current_org()
         and not p.is_active
         and p.employee_code is null
         and can_approve_account(p.id, coalesce(r.department_id, p.department_id))
    ) s
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 10. Notices about your own account also go by email (0075's notification row stays the record)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

-- Identical to 0056 except: a suspension is called a suspension, and the notice to the person
-- themselves carries meta.email so it reaches somebody who cannot sign in to read it.
create or replace function public.notify_account_change()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  v_actor    uuid := auth.uid();
  admin_id   uuid;
  became     boolean;
  ceased     boolean;
  from_dep   text;
  to_dep     text;
  v_approved boolean;
begin
  v_approved := coalesce(current_setting('ghl.account_approval', true), '') = new.id::text;

  if new.is_active is distinct from old.is_active then
    if new.id is distinct from v_actor then
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id, meta)
      values (new.id, new.org_id, 'security',
              case when v_approved then 'Your account has been approved'
                   when new.is_active then 'Your account has been reactivated'
                   when new.status = 'suspended' then 'Your account has been suspended'
                   else 'Your account has been deactivated' end,
              case when v_approved
                   then coalesce(person_name(v_actor) || ' approved your account. ', '')
                        || 'You can sign in to GHL ONE now.'
                   when new.is_active
                   then 'You can sign in again.'
                   when new.status = 'suspended'
                   then 'You cannot use GHL ONE while it is suspended. If this is unexpected, contact your manager or HR.'
                   else 'You will not be able to sign in. If this is unexpected, contact your manager or HR.' end,
              '/', 'profile', new.id, v_actor, jsonb_build_object('email', true));
    end if;

    if not new.is_active then
      for admin_id in
        select p.id from profiles p
         where p.org_id = new.org_id and p.is_active
           and p.id is distinct from new.id and p.id is distinct from v_actor
           and (p.role = 'super_admin' or is_company_super_admin(p.id))
      loop
        insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
        values (admin_id, new.org_id, 'security',
                person_name(new.id) || '''s account was ' || case when new.status = 'suspended' then 'suspended' else 'deactivated' end,
                case when v_actor is null then 'Deactivated by the system.' else 'Changed by ' || person_name(v_actor) || '.' end
                || ' Their work may need reassigning.',
                '/admin?tab=people', 'profile', new.id, v_actor);
      end loop;
    end if;
  end if;

  if new.department_id is distinct from old.department_id
     and new.id is distinct from v_actor
     and not v_approved
     and coalesce(current_setting('ghl.transfer_notified', true), '') is distinct from new.id::text
  then
    select name into from_dep from departments where id = old.department_id;
    select name into to_dep   from departments where id = new.department_id;
    insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id, meta)
    values (new.id, new.org_id, 'information',
            case when to_dep is null then 'You are no longer in a department'
                 else 'You have moved to ' || to_dep end,
            case when from_dep is null then '' else 'Previously ' || from_dep || '. ' end
            || case when v_actor is null then 'Changed by the system.' else 'Changed by ' || person_name(v_actor) || '.' end,
            '/people/' || new.id, 'profile', new.id, v_actor,
            -- An assignment for somebody not yet working inside is worth an email; a routine move is not.
            jsonb_build_object('email', old.department_id is null));
  end if;

  became := new.role = 'super_admin' and old.role is distinct from 'super_admin';
  ceased := old.role = 'super_admin' and new.role is distinct from 'super_admin';
  if became or ceased then
    for admin_id in
      select p.id from profiles p
       where p.org_id = new.org_id and p.is_active
         and p.id is distinct from new.id and p.id is distinct from v_actor
         and (p.role = 'super_admin' or is_company_super_admin(p.id))
    loop
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id)
      values (admin_id, new.org_id, 'security',
              person_name(new.id) || (case when became then ' is now a Super Admin' else ' is no longer a Super Admin' end),
              case when v_actor is null then 'Changed by the system.' else 'Changed by ' || person_name(v_actor) || '.' end
              || ' Company-wide authority changed hands.',
              '/platform/access?tab=people', 'profile', new.id, v_actor);
    end loop;
  end if;

  return null;
end $function$;

-- Identical to 0060 except the notice to the person carries meta.email.
create or replace function public.decline_account(p_user uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  v_me   uuid := auth.uid();
  v_prof profiles%rowtype;
  v_req  join_requests%rowtype;
  v_dept uuid;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  select * into v_prof from profiles where id = p_user;
  if v_prof.id is null then raise exception 'No such person.'; end if;
  if v_prof.is_active then raise exception 'That account is already active. Deactivate it from the people admin instead.'; end if;

  select * into v_req from join_requests where user_id = p_user and status = 'pending' order by created_at desc limit 1;
  v_dept := coalesce(v_req.department_id, v_prof.department_id);
  if not can_approve_account(p_user, v_dept) then
    raise exception 'You are not allowed to answer this request.';
  end if;

  if v_req.id is not null then
    update join_requests
       set status = 'declined', decided_by = v_me, decided_label = person_name(v_me),
           decided_at = now(), decision_note = nullif(btrim(p_reason), ''), updated_at = now()
     where id = v_req.id;
  end if;

  insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id, meta)
  values (p_user, v_prof.org_id, 'security',
          'Your access request was not approved',
          coalesce(nullif(btrim(p_reason), ''), 'No reason was given.')
            || ' You can correct the details and ask again.',
          '/pending', 'profile', p_user, v_me, jsonb_build_object('email', true));

  return jsonb_build_object('ok', true);
end $function$;

-- Posts an email-flagged notification to the app, which sends it through Resend. Same pg_net and
-- shared-secret pattern as the push fan-out (0025); the route is /api/hooks/account-mail/<secret>.
create or replace function public.notification_account_mail()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare cfg push_config%rowtype;
begin
  begin
    select * into cfg from push_config where id = 1;
    if cfg.id is null or coalesce(cfg.hook_url, '') = '' or coalesce(cfg.hook_secret, '') = '' then return new; end if;
    perform net.http_post(
      url := regexp_replace(rtrim(cfg.hook_url, '/'), '/push$', '/account-mail') || '/' ||
             case when cfg.hook_secret ~ '^[A-Za-z0-9_.~-]{16,200}$' then cfg.hook_secret else 'hook' end,
      body := jsonb_build_object('notification_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-GHL-Push-Secret', cfg.hook_secret),
      timeout_milliseconds := 15000
    );
  exception when others then
    return new;
  end;
  return new;
end $$;

drop trigger if exists notifications_account_mail on public.notifications;
create trigger notifications_account_mail
  after insert on public.notifications
  for each row when ((new.meta ->> 'email') = 'true')
  execute function public.notification_account_mail();

-- What the mail route may send: only an email-flagged notification about the recipient's own
-- account, only once, and only to the address on that account. The secret is the credential.
create or replace function public.account_mail(p_secret text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cfg push_config%rowtype;
  n   notifications%rowtype;
  v_to text; v_name text; v_org text;
begin
  select * into cfg from push_config where id = 1;
  if cfg.id is null or coalesce(cfg.hook_secret, '') = '' or p_secret is distinct from cfg.hook_secret then return null; end if;
  select * into n from notifications where id = p_id;
  if n.id is null or coalesce(n.meta->>'email', '') <> 'true' or n.meta ? 'emailed_at' then return null; end if;
  select u.email into v_to from auth.users u where u.id = n.user_id;
  select full_name into v_name from profiles where id = n.user_id;
  select name into v_org from organizations where id = n.org_id;
  update notifications set meta = meta || jsonb_build_object('emailed_at', now()) where id = p_id;
  return jsonb_build_object('to', v_to, 'name', v_name, 'company', v_org, 'title', n.title, 'body', n.body, 'link', n.link);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 11. Reminders
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.registration_reminders()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o       record;
  v_t     uuid;
  v_n     int;
  v_sent  int := 0;
  v_days  int;
  v_owner_org uuid;
begin
  for o in select id, name from organizations where status in ('active','trial') loop
    v_days := coalesce((registration_settings(o.id)->>'reminder_days')::int, 2);
    if v_days <= 0 then continue; end if;
    for v_t in
      select distinct a from join_requests j
        join profiles p on p.id = j.user_id and not p.is_active and p.employee_code is null
        cross join lateral account_approvers(o.id, j.department_id) a
       where j.org_id = o.id and j.status = 'pending' and j.created_at < now() - make_interval(days => v_days)
    loop
      select count(*) into v_n from join_requests j join profiles p on p.id = j.user_id and not p.is_active and p.employee_code is null
       where j.org_id = o.id and j.status = 'pending' and j.created_at < now() - make_interval(days => v_days)
         and can_approve_account_as(v_t, j.user_id, j.department_id);
      if v_n = 0 then continue; end if;
      if exists (select 1 from notifications x where x.user_id = v_t and x.entity_type = 'signup_reminder'
                  and x.created_at > now() - interval '20 hours') then continue; end if;
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id)
      values (v_t, o.id, 'action_required',
              v_n || case when v_n = 1 then ' account request has' else ' account requests have' end || ' been waiting over ' || v_days || ' days',
              'People who registered for ' || o.name || ' cannot sign in until somebody answers.',
              '/people/requests', 'signup_reminder', null);
      v_sent := v_sent + 1;
    end loop;
  end loop;

  -- Registrations for companies that are not on GHL ONE yet: a daily line to the owners.
  select count(*) into v_n from registrations r
   where r.state = 'open' and r.email_verified_at is not null
     and not exists (select 1 from profiles p where p.id = r.user_id)
     and r.created_at < now() - interval '2 days';
  if v_n > 0 then
    for v_t in select platform_owner_ids() loop
      if exists (select 1 from notifications x where x.user_id = v_t and x.entity_type = 'registration_reminder'
                  and x.created_at > now() - interval '20 hours') then continue; end if;
      select org_id into v_owner_org from profiles where id = v_t;
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id)
      values (v_t, v_owner_org, 'information',
              v_n || case when v_n = 1 then ' person is' else ' people are' end || ' waiting for their company to join GHL ONE',
              'Their email domains are recognised but not linked to a workspace.',
              '/platform?tab=registrations', 'registration_reminder', null);
      v_sent := v_sent + 1;
    end loop;
  end if;

  return jsonb_build_object('sent', v_sent);
end $$;

-- can_approve_account() answers for auth.uid(); the reminder needs the same answer for somebody else.
create or replace function public.can_approve_account_as(p_approver uuid, p_user uuid, p_department uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from account_approvers((select org_id from profiles where id = p_user), p_department) a where a = p_approver)
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ghl_registration_reminders') then
    perform cron.unschedule('ghl_registration_reminders');
  end if;
  perform cron.schedule('ghl_registration_reminders', '45 3 * * *', 'select public.registration_reminders()');
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 12. The owner's console
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.platform_registrations()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_owner() then raise exception 'Only a platform owner can see registrations across companies.'; end if;
  return jsonb_build_object(
    'domains', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cd.id, 'domain', cd.domain, 'company_name', cd.company_name, 'org_id', cd.org_id,
        'org_name', o.name, 'org_status', o.status, 'status', cd.status, 'verified', cd.verified,
        'verification_method', cd.verification_method, 'verification_token', cd.verification_token,
        'verified_at', cd.verified_at, 'verified_label', cd.verified_label, 'verification_note', cd.verification_note,
        'auto_approve', cd.auto_approve, 'notes', cd.notes, 'created_at', cd.created_at,
        'registrations', (select count(*) from registrations r where r.company_domain_id = cd.id),
        'waiting', (select count(*) from registrations r where r.company_domain_id = cd.id and r.state = 'open'
                      and not exists (select 1 from profiles p where p.id = r.user_id and p.is_active)))
        order by coalesce(o.name, cd.company_name), cd.domain)
        from company_domains cd left join organizations o on o.id = cd.org_id), '[]'::jsonb),
    'registrations', coalesce((
      select jsonb_agg(x order by (x->>'created_at') desc) from (
        select jsonb_build_object(
          'user_id', r.user_id, 'email', r.email, 'full_name', coalesce(p.full_name, r.full_name),
          'company', coalesce(o.name, r.company_label), 'org_id', coalesce(p.org_id, r.org_id),
          'domain', r.domain, 'recognized', r.recognized, 'via', r.via,
          'designation', coalesce(r.designation, p.designation), 'employee_ref', r.employee_ref,
          'phone', coalesce(p.phone, r.phone), 'manager_name', r.manager_name,
          'requested_department', coalesce((select name from departments where id = r.requested_department_id), r.requested_department),
          'department', (select name from departments where id = p.department_id),
          'status', account_status_of(r.user_id)->>'status',
          'decision_note', r.decision_note,
          'has_profile', p.id is not null,
          'created_at', r.created_at, 'email_verified_at', r.email_verified_at) as x
          from registrations r
          left join profiles p on p.id = r.user_id
          left join organizations o on o.id = p.org_id) s), '[]'::jsonb),
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'status', o.status, 'tenant_code', o.tenant_code,
        'available', company_available(o.id), 'settings', registration_settings(o.id),
        'departments', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.position, d.name)
                                   from departments d where d.org_id = o.id), '[]'::jsonb))
        order by o.name) from organizations o), '[]'::jsonb));
end $$;

create or replace function public.upsert_company_domain(
  p_domain text, p_company_name text, p_auto_approve boolean default false,
  p_notes text default null, p_status text default 'active')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_dom text := normalize_email_domain(p_domain); v_id uuid; v_old company_domains%rowtype;
begin
  if not is_platform_owner() then raise exception 'Only a platform owner can manage company domains.'; end if;
  if v_dom is null or v_dom !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then
    raise exception 'Enter a domain such as company.com.';
  end if;
  if is_public_email_domain(v_dom) then
    raise exception '% is a public email provider. Anyone can have an address there, so it can never identify a company.', v_dom;
  end if;
  if length(btrim(coalesce(p_company_name, ''))) < 2 then raise exception 'Enter the company name.'; end if;
  if p_status not in ('active','disabled') then raise exception 'Unknown status.'; end if;

  select * into v_old from company_domains where domain = v_dom;
  insert into company_domains (domain, company_name, auto_approve, notes, status, created_by, created_label)
  values (v_dom, btrim(p_company_name), coalesce(p_auto_approve, false), nullif(btrim(p_notes), ''), p_status, auth.uid(), person_name(auth.uid()))
  on conflict (domain) do update
     set company_name = excluded.company_name, auto_approve = excluded.auto_approve,
         notes = excluded.notes, status = excluded.status, updated_at = now()
  returning id into v_id;

  insert into platform_audit_logs (actor_id, org_id, action, entity_type, entity_id, reason, summary, details)
  values (auth.uid(), (select org_id from company_domains where id = v_id),
          case when v_old.id is null then 'platform.domain_added' else 'platform.domain_updated' end,
          'company_domain', v_id, p_notes, v_dom,
          jsonb_build_object('company', btrim(p_company_name), 'auto_approve', p_auto_approve, 'status', p_status,
                             'before', case when v_old.id is null then null else to_jsonb(v_old) - 'verification_token' end));
  return v_id;
end $$;

create or replace function public.link_company_domain(p_id uuid, p_org uuid, p_include_aliases boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cd company_domains%rowtype; v_ids uuid[]; v_made int := 0; v_org text;
begin
  if not is_platform_owner() then raise exception 'Only a platform owner can link a domain to a company.'; end if;
  select * into cd from company_domains where id = p_id;
  if cd.id is null then raise exception 'No such domain.'; end if;
  if p_org is not null and not exists (select 1 from organizations where id = p_org) then raise exception 'No such company.'; end if;

  if p_org is null then
    update company_domains set org_id = null, updated_at = now() where id = p_id;
    v_ids := array[p_id];
  else
    -- Aliases: other unlinked domains recorded under the same company name move with it.
    select array_agg(id) into v_ids from company_domains
     where id = p_id or (p_include_aliases and org_id is null and lower(btrim(company_name)) = lower(btrim(cd.company_name)));
    update company_domains set org_id = p_org, updated_at = now() where id = any (v_ids);
    v_made := materialize_registrations(v_ids);
  end if;

  select name into v_org from organizations where id = p_org;
  insert into platform_audit_logs (actor_id, org_id, action, entity_type, entity_id, summary, details)
  values (auth.uid(), p_org, case when p_org is null then 'platform.domain_unlinked' else 'platform.domain_linked' end,
          'company_domain', p_id, cd.domain,
          jsonb_build_object('company', v_org, 'domains', (select jsonb_agg(domain) from company_domains where id = any (v_ids)), 'registrations_moved', v_made));
  return jsonb_build_object('ok', true, 'domains', coalesce(array_length(v_ids, 1), 0), 'moved', v_made);
end $$;

create or replace function public.verify_company_domain(p_id uuid, p_method text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cd company_domains%rowtype;
begin
  if not is_platform_owner() then raise exception 'Only a platform owner can verify a domain.'; end if;
  select * into cd from company_domains where id = p_id;
  if cd.id is null then raise exception 'No such domain.'; end if;
  if p_method is null then
    update company_domains set verified = false, verification_method = null, verified_at = null, verified_by = null,
           verified_label = null, verification_note = nullif(btrim(p_note), ''), updated_at = now() where id = p_id;
  elsif p_method = 'owner_attested' then
    if length(btrim(coalesce(p_note, ''))) < 8 then raise exception 'Say how you know this domain belongs to the company (at least 8 characters).'; end if;
    update company_domains set verified = true, verification_method = 'owner_attested', verified_at = now(), verified_by = auth.uid(),
           verified_label = person_name(auth.uid()), verification_note = btrim(p_note), updated_at = now() where id = p_id;
  elsif p_method = 'dns' then
    update company_domains set verified = true, verification_method = 'dns', verified_at = now(), verified_by = auth.uid(),
           verified_label = person_name(auth.uid()), verification_note = coalesce(nullif(btrim(p_note), ''), 'DNS TXT record found'), updated_at = now() where id = p_id;
  else
    raise exception 'Unknown verification method.';
  end if;
  insert into platform_audit_logs (actor_id, org_id, action, entity_type, entity_id, reason, summary, details)
  values (auth.uid(), cd.org_id, case when p_method is null then 'platform.domain_unverified' else 'platform.domain_verified' end,
          'company_domain', p_id, p_note, cd.domain, jsonb_build_object('method', p_method));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.set_registration_settings(p_org uuid, p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not (is_platform_owner() or (p_org = current_org() and is_active_member() and is_admin())) then
    raise exception 'Only a platform owner or this company''s administrators can change its registration rules.';
  end if;
  v := jsonb_strip_nulls(jsonb_build_object(
    'require_phone',       (p_settings->>'require_phone')::boolean,
    'require_employee_id', (p_settings->>'require_employee_id')::boolean,
    'show_departments',    (p_settings->>'show_departments')::boolean,
    'reminder_days',       least(greatest((p_settings->>'reminder_days')::int, 0), 30)));
  update organizations
     set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('registration', coalesce(settings->'registration', '{}'::jsonb) || v),
         updated_at = now()
   where id = p_org;
  insert into platform_audit_logs (actor_id, org_id, action, entity_type, entity_id, summary, details)
  values (auth.uid(), p_org, 'platform.registration_settings', 'organization', p_org, 'Registration rules', v);
  return registration_settings(p_org);
end $$;

-- Every account decision an owner can take across companies. Each one is audited, and the person is
-- told through the same triggers as a decision taken inside the company.
create or replace function public.platform_account_action(
  p_user uuid, p_action text, p_reason text default null, p_department uuid default null,
  p_role role_level default null, p_manager uuid default null, p_designation text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  p    profiles%rowtype;
  r    registrations%rowtype;
  v_dept uuid;
begin
  if not is_platform_owner() then raise exception 'Only a platform owner can do this across companies.'; end if;
  if p_user = v_me then raise exception 'You cannot change your own account from here.'; end if;
  select * into p from profiles where id = p_user;
  select * into r from registrations where user_id = p_user;
  if p.id is null and r.user_id is null then raise exception 'No such registration.'; end if;

  if p_action = 'reject' then
    if p.id is null then
      update registrations set state = 'rejected', decision_note = nullif(btrim(p_reason), ''), decided_by = v_me,
             decided_label = person_name(v_me), decided_at = now(), updated_at = now() where user_id = p_user;
    else
      if p.is_active then raise exception 'That account is active. Suspend or deactivate it instead.'; end if;
      update join_requests set status = 'declined', decided_by = v_me, decided_label = person_name(v_me), decided_at = now(),
             decision_note = nullif(btrim(p_reason), ''), updated_at = now()
       where user_id = p_user and status = 'pending';
      if not found then
        insert into join_requests (org_id, user_id, status, decided_by, decided_label, decided_at, decision_note)
        values (p.org_id, p_user, 'declined', v_me, person_name(v_me), now(), nullif(btrim(p_reason), ''));
      end if;
      insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id, meta)
      values (p_user, p.org_id, 'security', 'Your access request was not approved',
              coalesce(nullif(btrim(p_reason), ''), 'No reason was given.') || ' You can correct the details and ask again.',
              '/pending', 'profile', p_user, v_me, jsonb_build_object('email', true));
    end if;

  elsif p_action = 'reopen' then
    if p.id is not null then raise exception 'Only a registration still waiting for its company can be reopened here.'; end if;
    update registrations set state = 'open', decision_note = null, decided_by = null, decided_label = null, decided_at = null, updated_at = now()
     where user_id = p_user;

  elsif p.id is null then
    raise exception 'This person''s company is not on GHL ONE yet. Link their domain to a company first.';

  elsif p_action = 'approve' then
    if p.is_active then return jsonb_build_object('ok', true, 'already_active', true); end if;
    v_dept := coalesce(p_department, (select department_id from join_requests where user_id = p_user and status = 'pending' order by created_at desc limit 1));
    if v_dept is not null and not exists (select 1 from departments where id = v_dept and org_id = p.org_id) then raise exception 'That department is not in this company.'; end if;
    if p_manager is not null and not exists (select 1 from profiles m where m.id = p_manager and m.org_id = p.org_id and m.is_active) then raise exception 'That manager is not in this company.'; end if;
    perform set_config('ghl.account_approval', p_user::text, true);
    update profiles set is_active = true,
           status = case when status in ('suspended','inactive','exited') then 'active' else status end,
           department_id = coalesce(v_dept, department_id), manager_id = coalesce(p_manager, manager_id),
           designation = coalesce(nullif(btrim(p_designation), ''), designation),
           role = coalesce(p_role, role), joined_at = coalesce(joined_at, current_date)
     where id = p_user;
    perform set_config('ghl.account_approval', '', true);
    update join_requests set status = 'approved', decided_by = v_me, decided_label = person_name(v_me), decided_at = now(),
           decision_note = nullif(btrim(p_reason), ''), updated_at = now()
     where user_id = p_user and status = 'pending';

  elsif p_action = 'suspend' then
    update profiles set status = 'suspended' where id = p_user;
  elsif p_action = 'deactivate' then
    update profiles set status = 'inactive' where id = p_user;
  elsif p_action = 'reactivate' then
    update profiles set status = 'active', frozen = false, is_active = true where id = p_user;
  elsif p_action = 'move_department' then
    if p_department is null or not exists (select 1 from departments where id = p_department and org_id = p.org_id) then
      raise exception 'Choose a department in this person''s company.';
    end if;
    update profiles set department_id = p_department where id = p_user;
    update join_requests set department_id = p_department, requested_department = null, updated_at = now()
     where user_id = p_user and status = 'pending';
  else
    raise exception 'Unknown action %.', p_action;
  end if;

  insert into platform_audit_logs (actor_id, org_id, action, entity_type, entity_id, reason, summary, details)
  values (v_me, coalesce(p.org_id, r.org_id), 'platform.account_' || p_action, 'profile', p_user, p_reason,
          coalesce(p.email, r.email), jsonb_build_object('department', p_department, 'role', p_role));
  return jsonb_build_object('ok', true, 'status', account_status_of(p_user)->>'status');
end $$;

-- Explicit multi-company access: a membership in another company, or a move of the home company.
create or replace function public.platform_set_membership(p_user uuid, p_org uuid, p_role role_level default 'employee', p_active boolean default true, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p profiles%rowtype; v_org text;
begin
  if not is_platform_owner() then raise exception 'Only a platform owner can give somebody access to another company.'; end if;
  select * into p from profiles where id = p_user;
  if p.id is null then raise exception 'No such person.'; end if;
  if p.org_id = p_org then raise exception 'That is their home company. Use transfer to change it.'; end if;
  if not exists (select 1 from organizations where id = p_org) then raise exception 'No such company.'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 8 then raise exception 'Give a reason (at least 8 characters) — this is cross-company access.'; end if;
  select name into v_org from organizations where id = p_org;

  insert into memberships (user_id, org_id, role, status, is_primary)
  values (p_user, p_org, coalesce(p_role, 'employee'), case when p_active then 'active' else 'suspended' end, false)
  on conflict (user_id, org_id) do update set role = excluded.role, status = excluded.status;
  if not p_active then
    delete from active_workspace where user_id = p_user and org_id = p_org;
  end if;

  insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id, meta)
  values (p_user, p.org_id, 'security',
          case when p_active then 'You now have access to ' || v_org else 'Your access to ' || v_org || ' was removed' end,
          case when p_active then 'Use the workspace switcher at the top to move between companies. Each company''s data stays separate.'
               else 'Your own company is unaffected.' end,
          '/', 'profile', p_user, auth.uid(), jsonb_build_object('email', true));
  insert into platform_audit_logs (actor_id, org_id, action, entity_type, entity_id, reason, summary, details)
  values (auth.uid(), p_org, case when p_active then 'platform.membership_granted' else 'platform.membership_revoked' end,
          'profile', p_user, p_reason, p.email, jsonb_build_object('role', p_role, 'home_org', p.org_id));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.platform_transfer_company(p_user uuid, p_org uuid, p_department uuid default null, p_keep_access boolean default false, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p profiles%rowtype; v_from text; v_to text;
begin
  if not is_platform_owner() then raise exception 'Only a platform owner can move somebody to another company.'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 8 then raise exception 'Give a reason (at least 8 characters).'; end if;
  select * into p from profiles where id = p_user;
  if p.id is null then raise exception 'No such person.'; end if;
  if p.org_id = p_org then raise exception 'They are already in that company.'; end if;
  if not exists (select 1 from organizations where id = p_org) then raise exception 'No such company.'; end if;
  if p.role = 'super_admin' or is_company_super_admin(p_user) then
    raise exception 'This person administers their company. Hand that over first, then transfer them.';
  end if;
  if p_department is not null and not exists (select 1 from departments where id = p_department and org_id = p_org) then
    raise exception 'That department is not in the destination company.';
  end if;
  select name into v_from from organizations where id = p.org_id;
  select name into v_to from organizations where id = p_org;

  perform set_config('ghl.account_approval', p_user::text, true);
  perform set_config('ghl.transfer_notified', p_user::text, true);
  update profiles set org_id = p_org, department_id = p_department, manager_id = null, team_id = null where id = p_user;
  perform set_config('ghl.account_approval', '', true);
  perform set_config('ghl.transfer_notified', '', true);

  update memberships set status = case when p_keep_access then 'active' else 'suspended' end, is_primary = false
   where user_id = p_user and org_id = p.org_id;
  update memberships set is_primary = true where user_id = p_user and org_id = p_org;
  delete from active_workspace where user_id = p_user;
  update registrations set org_id = p_org, updated_at = now() where user_id = p_user;

  insert into notifications (user_id, org_id, kind, title, body, link, entity_type, entity_id, actor_id, meta)
  values (p_user, p_org, 'security', 'You have moved to ' || v_to,
          'Your home company is now ' || v_to || ' (previously ' || v_from || ').'
            || case when p_keep_access then ' You keep access to ' || v_from || ' through the workspace switcher.' else '' end,
          '/', 'profile', p_user, auth.uid(), jsonb_build_object('email', true));
  insert into platform_audit_logs (actor_id, org_id, action, entity_type, entity_id, reason, summary, details)
  values (auth.uid(), p_org, 'platform.company_transfer', 'profile', p_user, p_reason, p.email,
          jsonb_build_object('from', p.org_id, 'to', p_org, 'department', p_department, 'kept_access', p_keep_access));
  return jsonb_build_object('ok', true);
end $$;

-- A person's companies, for the owner's cross-company view.
create or replace function public.platform_person_access(p_email text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p profiles%rowtype;
begin
  if not is_platform_owner() then raise exception 'Only a platform owner can look this up.'; end if;
  select * into p from profiles where lower(email) = lower(btrim(p_email));
  if p.id is null then return null; end if;
  return jsonb_build_object(
    'user_id', p.id, 'full_name', p.full_name, 'email', p.email, 'home_org', p.org_id,
    'status', account_status_of(p.id)->>'status',
    'department', (select name from departments where id = p.department_id),
    'memberships', coalesce((select jsonb_agg(jsonb_build_object('org_id', m.org_id, 'name', o.name, 'role', m.role, 'status', m.status, 'home', m.org_id = p.org_id) order by o.name)
                               from memberships m join organizations o on o.id = m.org_id where m.user_id = p.id), '[]'::jsonb));
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 13. Seed: the four domains named by the owners (2026-10-15)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

insert into company_domains (domain, company_name, org_id, verified, verification_method, verified_at, verified_label, verification_note, auto_approve, notes, created_label)
values
  ('ghlindiaventures.com', 'GHL India Ventures', (select id from organizations where tenant_code = 'GHL-001'),
   true, 'owner_attested', now(), 'Platform owners', 'Named by the platform owners on 2026-10-15; the company''s own domain.',
   true, 'Trusted provisioning: a verified address here is admitted on arrival (0071 behaviour, unchanged).', 'Migration 0078'),
  ('ghlindia.com', 'GHL India', null,
   true, 'owner_attested', now(), 'Platform owners', 'Named by the platform owners on 2026-10-15.',
   false, 'Pending company mapping confirmation: link it to the right company once confirmed.', 'Migration 0078'),
  ('jaminbazaar.in', 'Jamin Bazaar', (select id from organizations where tenant_code = 'JAM-003'),
   true, 'owner_attested', now(), 'Platform owners', 'Named by the platform owners on 2026-10-15.',
   false, null, 'Migration 0078'),
  ('gio4x.com', 'GIO4X', null,
   true, 'owner_attested', now(), 'Platform owners', 'Named by the platform owners on 2026-10-15.',
   false, 'No workspace yet: registrations wait until one is linked.', 'Migration 0078')
on conflict (domain) do nothing;

-- Jamin Bazaar's stored domain was a mailbox ("info@jaminbazaar.in"), which can never match. Corrected
-- AFTER the seed, so the sync trigger finds the verified row already linked and leaves it alone.
update organizations set email_domain = 'jaminbazaar.in'
 where email_domain = 'info@jaminbazaar.in';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 14. Self test
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

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

  return selftest_result(checks);
end $$;

create or replace function public.platform_self_test()
returns jsonb language plpgsql set search_path to 'public' as $function$
declare
  suites  jsonb := '{}'::jsonb;
  checks  jsonb := '[]'::jsonb;
  one     jsonb;
  err_msg text;
  names   text[] := array['rls_role_sweep','tenant_scoping','policy_recursion','returning_policies',
                          'function_volatility','enum_casts','access_control','delegation','entitlements','runtime_health','messaging','registration'];
  nm      text;
begin
  if not selftest_allowed() then
    raise exception 'forbidden: platform_self_test() requires platform admin, company admin, or the service role';
  end if;

  foreach nm in array names loop
    begin
      case nm
        when 'rls_role_sweep'      then one := test_rls_role_sweep();
        when 'tenant_scoping'      then one := test_tenant_scoping();
        when 'policy_recursion'    then one := test_policy_recursion();
        when 'returning_policies'  then one := test_returning_policies();
        when 'function_volatility' then one := test_function_volatility();
        when 'enum_casts'          then one := test_enum_casts();
        when 'access_control'      then one := test_access_control();
        when 'delegation'          then one := test_delegation();
        when 'entitlements'        then one := test_entitlements();
        when 'runtime_health'      then one := test_runtime_health();
        when 'messaging'           then one := test_messaging();
        when 'registration'        then one := test_registration();
        else raise exception 'unknown check %', nm;
      end case;
    exception when others then
      get stacked diagnostics err_msg = message_text;
      one := selftest_result(jsonb_build_array(jsonb_build_object(
        'name', nm || ':crashed', 'ok', false,
        'detail', 'the check itself raised: ' || err_msg)));
    end;

    suites := suites || jsonb_build_object(nm, one);
    checks := checks || (
      select coalesce(jsonb_agg(jsonb_build_object(
               'suite', nm, 'name', e->>'name', 'ok', (e->>'ok')::boolean, 'detail', e->>'detail')), '[]'::jsonb)
        from jsonb_array_elements(coalesce(one->'checks', '[]'::jsonb)) e);
  end loop;

  return jsonb_build_object(
    'ok',     (select count(*) from jsonb_array_elements(checks) e where not (e->>'ok')::boolean) = 0,
    'passed', (select count(*) from jsonb_array_elements(checks) e where (e->>'ok')::boolean),
    'failed', (select count(*) from jsonb_array_elements(checks) e where not (e->>'ok')::boolean),
    'checks', checks,
    'suites', suites,
    'ran_at', now()
  );
end $function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 15. Grants (0068: a new function is granted to anon and authenticated by default; revoke both)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

do $$
declare f text;
begin
  -- Internal: reached only from other definer functions and triggers.
  foreach f in array array[
    'public.account_status_of(uuid)', 'public.registration_announce(uuid)', 'public.materialize_registrations(uuid[])',
    'public.company_activated(uuid)', 'public.on_company_status_change()', 'public.sync_org_email_domain()',
    'public.on_auth_email_confirmed()', 'public.notification_account_mail()', 'public.registration_reminders()',
    'public.can_approve_account_as(uuid, uuid, uuid)', 'public.platform_owner_ids()', 'public.registration_settings(uuid)',
    'public.handle_new_user()', 'public.notify_account_pending()', 'public.notify_account_change()', 'public.test_registration()']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;

  -- Signed-in callers; each function checks its own authority.
  foreach f in array array[
    'public.my_account_status()', 'public.request_account_activation(uuid, text, text, text)',
    'public.update_my_registration(text, text, text, text, text)', 'public.pending_accounts()', 'public.decline_account(uuid, text)',
    'public.platform_registrations()', 'public.upsert_company_domain(text, text, boolean, text, text)',
    'public.link_company_domain(uuid, uuid, boolean)', 'public.verify_company_domain(uuid, text, text)',
    'public.set_registration_settings(uuid, jsonb)',
    'public.platform_account_action(uuid, text, text, uuid, role_level, uuid, text)',
    'public.platform_set_membership(uuid, uuid, role_level, boolean, text)',
    'public.platform_transfer_company(uuid, uuid, uuid, boolean, text)', 'public.platform_person_access(text)',
    'public.company_available(uuid)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;

  -- Before sign-in, and the shared-secret mail hook (the secret is the credential, as with push).
  execute 'revoke all on function public.registration_preview(text) from public';
  execute 'grant execute on function public.registration_preview(text) to anon, authenticated';
  execute 'revoke all on function public.account_mail(text, uuid) from public';
  execute 'grant execute on function public.account_mail(text, uuid) to anon, authenticated';
end $$;

-- platform_self_test is SECURITY INVOKER; test_registration is called from it under the caller, so
-- the callers allowed by selftest_allowed() need to execute it.
grant execute on function public.test_registration() to authenticated;
