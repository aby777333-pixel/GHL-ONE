-- 0069_push_hook_timeout.sql
--
-- The push fan-out's HTTP timeout was 5000 ms, which is shorter than a cold serverless start.
--
-- Moving `push_config.hook_url` to ghl-one made this visible: the very first call after the
-- switch spent 4.83 s in request/response and pg_net gave up at 5 s — while the function itself
-- finished and the push WAS delivered (`push_subscriptions.last_used_at` was stamped 6 s after
-- the insert, `failure_count` still 0). The warm call straight after returned 200 in well under
-- a second. So the timeout never lost a notification; it filled `net._http_response` with rows
-- that look like failures and are not, which is exactly the kind of misleading evidence that
-- costs an hour later.
--
-- `net.http_post` queues the request and returns immediately, so the timeout is spent by the
-- background worker and never by the transaction that inserted the notification. Raising it
-- costs the writer nothing.
--
-- Body is otherwise byte-identical to the version installed by 0025.
create or replace function public.notification_push_fanout()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
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
      timeout_milliseconds := 15000
    );
  exception when others then
    -- Push is best-effort. The in-app notification is already committed and is the record.
    return new;
  end;
  return new;
end $function$;

-- 0068's rule: a new or replaced function arrives with EXECUTE granted to anon and authenticated
-- by Supabase's default privileges, and `revoke ... from public` does not remove that.
-- A trigger function needs no EXECUTE grant for its trigger to fire.
revoke all on function public.notification_push_fanout() from public, anon, authenticated;
