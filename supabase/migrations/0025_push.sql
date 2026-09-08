-- ---------------------------------------------------------------------------
-- 0025 — Web push notifications
--
-- Purely additive. Nothing here changes an existing column, policy or trigger:
-- the `notifications` table keeps its shape and stays the source of truth, and every push is a
-- best-effort second delivery channel fired AFTER the row is safely committed.
--
-- Shape:
--   push_config          one locked row holding the hook URL + shared secret (never hardcoded)
--   push_subscriptions   one row per browser/device, tenant-scoped like every other table
--   save/remove RPCs     the only writes the app performs (a shared browser can hold another
--                        person's row on the same endpoint, which plain RLS cannot retire)
--   hook RPCs            push_notification / push_targets / push_settle — the sessionless hook's
--                        three privileged reads, each gated on the shared secret. The app needs
--                        NO service-role key; the blast radius is these three queries, not the
--                        whole database.
--   notifications AFTER INSERT -> net.http_post to /api/hooks/push/<secret> (pg_net, same
--                        pattern as the outgoing webhooks in 0006_automation.sql)
-- ---------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- CONFIG (endpoint + secret live in a row, not in this file)
-- ---------------------------------------------------------------------------
create table if not exists push_config (
  id smallint primary key default 1 check (id = 1),
  hook_url text,                                  -- e.g. https://ghlone.netlify.app/api/hooks/push
  hook_secret text,                               -- must equal PUSH_HOOK_SECRET in the app env
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into push_config (id) values (1) on conflict (id) do nothing;

-- No policies at all: the row is readable only by SECURITY DEFINER functions and the
-- service role. A shared secret must never be selectable by an authenticated member.
alter table push_config enable row level security;
revoke all on push_config from anon, authenticated;

-- ---------------------------------------------------------------------------
-- SUBSCRIPTIONS
-- ---------------------------------------------------------------------------
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  failure_count int not null default 0
);
create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);
create index if not exists push_subscriptions_org_idx on push_subscriptions(org_id, user_id);

-- Tenant default, mirroring notification_org_default() (0022_platform.sql §186):
-- a device belongs to the workspace the person was in when they registered it, and the app
-- re-posts the subscription on load so it follows a workspace switch.
create or replace function push_subscription_org_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is null then
    new.org_id := coalesce(current_org(), (select org_id from profiles where id = new.user_id));
  end if;
  return new;
end $$;
drop trigger if exists push_subscriptions_org on push_subscriptions;
create trigger push_subscriptions_org before insert on push_subscriptions for each row execute function push_subscription_org_default();

alter table push_subscriptions enable row level security;

-- Mine, always — read, insert, update and delete.
drop policy if exists push_sub_own on push_subscriptions;
create policy push_sub_own on push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Admins may see WHICH devices exist in their own company (device count / last used), for
-- offboarding and security review. The keys are useless without the VAPID private key, and
-- nothing here exposes notification content.
drop policy if exists push_sub_admin_read on push_subscriptions;
create policy push_sub_admin_read on push_subscriptions for select to authenticated
  using (org_id = current_org() and (is_admin() or has_admin_perm('security.manage')));

-- ---------------------------------------------------------------------------
-- WRITE RPCS
-- ---------------------------------------------------------------------------

/**
 * Register or refresh this browser for the caller, in the workspace they are currently in.
 * SECURITY DEFINER because a shared computer can already hold a row for a different person on
 * the same endpoint: possession of the endpoint proves the browser is now theirs, so the stale
 * row is retired. Opening that up through RLS instead would let anyone delete anyone's device.
 */
create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); o uuid; sid uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 2000 then raise exception 'invalid endpoint'; end if;
  if p_p256dh is null or p_auth is null then raise exception 'invalid subscription keys'; end if;

  o := coalesce(current_org(), (select org_id from profiles where id = me));
  delete from push_subscriptions where endpoint = p_endpoint and user_id <> me;

  insert into push_subscriptions (user_id, org_id, endpoint, p256dh, auth, user_agent, last_used_at)
  values (me, o, p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 400), now())
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        org_id = excluded.org_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = coalesce(nullif(excluded.user_agent, ''), push_subscriptions.user_agent),
        failure_count = 0,
        last_used_at = now()
  returning id into sid;
  return sid;
end $$;

/** Forget one device (the caller's own). */
create or replace function remove_push_subscription(p_endpoint text) returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n int;
begin
  if me is null then raise exception 'not signed in'; end if;
  delete from push_subscriptions where user_id = me and (p_endpoint is null or endpoint = p_endpoint);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- HOOK RPCS — the push route's ONLY privileged reads
--
-- Postgres calls the hook with no session, so the route needs to read another person's
-- subscriptions and the notification row. It does that HERE, behind the same shared secret the
-- trigger already sends, instead of with a service-role key: a service key would bypass every
-- policy in the product, and these three functions bypass exactly three queries.
--
-- Every one of them verifies `p_secret` against `push_config.hook_secret` and, on a mismatch,
-- returns a benign empty value. None of them raises and none of them reveals whether a user, a
-- notification or a subscription exists — a wrong secret is indistinguishable from a missing row.
-- ---------------------------------------------------------------------------

/**
 * The notification the fan-out just wrote, as JSON. `null` when the secret is wrong OR the row is
 * gone (deleted between the trigger firing and the HTTP call) — the caller cannot tell which.
 */
create or replace function push_notification(p_secret text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare secret_ok boolean; out_row jsonb;
begin
  select (c.hook_secret is not null and c.hook_secret <> '' and p_secret is not null and c.hook_secret = p_secret)
    into secret_ok from push_config c where c.id = 1;
  if not coalesce(secret_ok, false) or p_id is null then return null; end if;

  select jsonb_build_object(
           'id', n.id, 'user_id', n.user_id, 'org_id', n.org_id, 'kind', n.kind,
           'title', n.title, 'body', n.body, 'link', n.link,
           'entity_type', n.entity_type, 'entity_id', n.entity_id)
    into out_row
    from notifications n where n.id = p_id;

  return out_row;   -- null when there is no such row
end $$;

/**
 * Every device that should receive this notification, with quiet hours already applied.
 *
 * Returns `{ok, quiet, subs:[{id, endpoint, p256dh, auth, failure_count}]}`.
 *  - quiet hours / DND come from `in_quiet_hours(p_user)`, the same rule escalations and digests
 *    use, and are BYPASSED for `critical` and `action_required` (the documented exception);
 *  - `quiet = true` always comes with an empty `subs`, so a caller that ignores the flag still
 *    sends nothing;
 *  - org scoping mirrors the fan-out trigger: a device with no workspace is always eligible, a
 *    device pinned to a workspace only matches its own. Company B never rings a device that was
 *    registered while working in company A.
 */
create or replace function push_targets(p_secret text, p_user uuid, p_org uuid default null, p_kind text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare secret_ok boolean; quiet boolean := false; subs jsonb;
begin
  select (c.hook_secret is not null and c.hook_secret <> '' and p_secret is not null and c.hook_secret = p_secret)
    into secret_ok from push_config c where c.id = 1;
  if not coalesce(secret_ok, false) then
    return jsonb_build_object('ok', false, 'quiet', false, 'subs', '[]'::jsonb);
  end if;
  if p_user is null then
    return jsonb_build_object('ok', true, 'quiet', false, 'subs', '[]'::jsonb);
  end if;

  if coalesce(p_kind, '') not in ('critical', 'action_required') then
    begin
      quiet := coalesce(in_quiet_hours(p_user), false);
    exception when others then
      quiet := false;   -- fail open: a missed rule is better than a missed alert
    end;
  end if;
  if quiet then
    return jsonb_build_object('ok', true, 'quiet', true, 'subs', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh,
           'auth', s.auth, 'failure_count', s.failure_count)), '[]'::jsonb)
    into subs
    from (
      select s2.id, s2.endpoint, s2.p256dh, s2.auth, s2.failure_count
        from push_subscriptions s2
       where s2.user_id = p_user
         and (p_org is null or s2.org_id is null or s2.org_id = p_org)
       order by s2.last_used_at desc nulls last, s2.created_at desc
       limit 25
    ) s;

  return jsonb_build_object('ok', true, 'quiet', false, 'subs', coalesce(subs, '[]'::jsonb));
end $$;

/**
 * Book-keeping after a send round: retire endpoints the push service says are gone, count a
 * strike against the ones that failed for any other reason (retired at 10), and stamp the ones
 * that made it. Silent no-op on a wrong secret — push housekeeping is never worth an error.
 */
create or replace function push_settle(
  p_secret text,
  p_dead uuid[] default '{}',
  p_shaky uuid[] default '{}',
  p_delivered uuid[] default '{}'
) returns void
language plpgsql security definer set search_path = public as $$
declare secret_ok boolean;
begin
  select (c.hook_secret is not null and c.hook_secret <> '' and p_secret is not null and c.hook_secret = p_secret)
    into secret_ok from push_config c where c.id = 1;
  if not coalesce(secret_ok, false) then return; end if;

  if coalesce(array_length(p_dead, 1), 0) > 0 then
    delete from push_subscriptions where id = any(p_dead);
  end if;

  if coalesce(array_length(p_shaky, 1), 0) > 0 then
    update push_subscriptions set failure_count = failure_count + 1 where id = any(p_shaky);
    delete from push_subscriptions where id = any(p_shaky) and failure_count >= 10;
  end if;

  if coalesce(array_length(p_delivered, 1), 0) > 0 then
    update push_subscriptions set last_used_at = now(), failure_count = 0 where id = any(p_delivered);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- FAN-OUT: notifications -> web push (pg_net, mirroring the webhook action in 0006)
-- ---------------------------------------------------------------------------

/**
 * AFTER INSERT on notifications. Enqueues one asynchronous POST to the app's push hook with
 * nothing but the new notification's id; the route re-reads the row through push_notification()
 * and gets its targets from push_targets(), which applies quiet hours / DND (critical and
 * action_required always get through). The shared secret is the route's only credential.
 *
 * Every failure mode is swallowed: an unreachable hook, a missing config row or a pg_net error
 * must never roll back the notification that has just been written.
 */
create or replace function notification_push_fanout() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare cfg push_config%rowtype;
begin
  begin
    select * into cfg from push_config where id = 1;
    if cfg.id is null or not cfg.enabled then return new; end if;
    if coalesce(cfg.hook_url, '') = '' or coalesce(cfg.hook_secret, '') = '' then return new; end if;

    -- Do not spend an HTTP request on someone with no registered device.
    if not exists (
      select 1 from push_subscriptions s
       where s.user_id = new.user_id
         and (new.org_id is null or s.org_id is null or s.org_id = new.org_id)
    ) then return new; end if;

    -- The route accepts the secret in the path OR in the header, and checks the header first.
    -- A secret containing characters that are not path-safe would simply 404, so in that case
    -- we post to a literal segment and let the header do the authenticating.
    perform net.http_post(
      url := rtrim(cfg.hook_url, '/') || '/' ||
             case when cfg.hook_secret ~ '^[A-Za-z0-9_.~-]{16,200}$' then cfg.hook_secret else 'hook' end,
      body := jsonb_build_object('notification_id', new.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-GHL-Push-Secret', cfg.hook_secret
      ),
      timeout_milliseconds := 5000
    );
  exception when others then
    -- Push is best-effort. The in-app notification is already committed and is the record.
    return new;
  end;
  return new;
end $$;

drop trigger if exists notifications_push on notifications;
create trigger notifications_push after insert on notifications for each row execute function notification_push_fanout();

-- ---------------------------------------------------------------------------
-- GRANTS
-- ---------------------------------------------------------------------------
grant execute on function save_push_subscription(text, text, text, text), remove_push_subscription(text) to authenticated;
revoke execute on function save_push_subscription(text, text, text, text), remove_push_subscription(text) from anon, public;

-- The hook route is called by Postgres and therefore has NO session: it authenticates with the
-- shared secret, which each of these three checks itself, so anon must be able to call them.
-- Without the secret they return null / an empty list / nothing at all, so an open grant buys an
-- attacker exactly nothing — and it is what lets the app drop the service-role key entirely.
grant execute on function
  push_notification(text, uuid),
  push_targets(text, uuid, uuid, text),
  push_settle(text, uuid[], uuid[], uuid[])
to anon, authenticated;
-- Trigger functions are deliberately left alone: Postgres checks EXECUTE on a trigger function
-- when the trigger is created, and revoking here would buy nothing while risking the one thing
-- that must never fail — the INSERT into notifications.
revoke all on push_subscriptions from anon;

-- Realtime is deliberately NOT enabled on push_subscriptions — nothing in the UI needs to watch it.

-- ---------------------------------------------------------------------------
-- OPERATOR STEP (run once, with your real values — do not commit them):
--
--   update push_config
--      set hook_url    = 'https://ghlone.netlify.app/api/hooks/push',
--          hook_secret = '<the same string as PUSH_HOOK_SECRET in the app environment>',
--          enabled     = true,
--          updated_at  = now()
--    where id = 1;
--
-- hook_url is the deployment's origin + /api/hooks/push (no trailing slash, no token).
-- Prefer a URL-safe secret (base64url or hex, 16–200 chars) so it can also travel in the path;
-- the X-GHL-Push-Secret header is the authoritative check either way.
--
-- To pause every web push without touching code:  update push_config set enabled = false where id = 1;
--
-- Note: `tenant_isolation_report()` will list `push_config` under `no_policies` and
-- `child_tables_no_org`. That is deliberate — it is a single platform-level secret row with no
-- tenant and no reader other than SECURITY DEFINER code and the service role.
-- ---------------------------------------------------------------------------
