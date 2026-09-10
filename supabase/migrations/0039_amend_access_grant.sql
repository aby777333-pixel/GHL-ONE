-- 0039 — Amend a live access grant instead of only revoking it.
--
-- An approved access request produced a grant that could be revoked but never changed. When the
-- requirement moved — "view" should have been "edit", a permanent grant should end in a month —
-- the only route was revoke + ask again, which threw away the approval trail and left the person
-- without access in between.
--
-- `access_grants` deliberately carries no client-writable policy (only `acg_read`), so this is a
-- SECURITY DEFINER RPC with exactly the authorisation `revoke_grant` uses: an admin, a holder of
-- `access.approve`, or the person who granted it. Nobody gains authority they did not already have.

create or replace function public.amend_grant(
  p_grant uuid,
  p_level text default null,
  p_expires_at timestamptz default null,
  p_clear_expiry boolean default false,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  g access_grants%rowtype;
  new_level text;
  new_expires timestamptz;
begin
  select * into g from access_grants where id = p_grant;
  if g.id is null then return; end if;
  if not (is_admin() or has_admin_perm('access.approve') or g.granted_by = auth.uid()) then
    raise exception 'forbidden';
  end if;
  if g.revoked_at is not null then
    raise exception 'this grant is already revoked';
  end if;

  new_level := coalesce(nullif(btrim(coalesce(p_level, '')), ''), g.level);
  if new_level not in ('view', 'comment', 'edit', 'download') then
    raise exception 'unknown access level: %', new_level;
  end if;

  -- Three intents, kept apart: clear the expiry (make it permanent), set a new one, or leave it.
  if p_clear_expiry then
    new_expires := null;
  elsif p_expires_at is not null then
    if p_expires_at <= now() then
      raise exception 'an expiry in the past would revoke the grant — use revoke_grant instead';
    end if;
    new_expires := p_expires_at;
  else
    new_expires := g.expires_at;
  end if;

  update access_grants
     set level = new_level,
         expires_at = new_expires
   where id = p_grant;

  -- The approval history is the point of the audit trail: record before and after, never replace.
  insert into audit_logs (org_id, actor_id, action, entity_type, entity_id, summary, old_value, new_value)
  values (
    g.org_id, auth.uid(), 'access.amended', g.resource_type, g.resource_id,
    'Access changed for ' || person_name(g.user_id),
    jsonb_build_object('level', g.level, 'expires_at', g.expires_at),
    jsonb_build_object('level', new_level, 'expires_at', new_expires, 'reason', p_reason)
  );
end $$;

-- A new function is granted to PUBLIC by default, which reaches `anon`. Take that away first, then
-- hand it back to signed-in callers only (see the note in CLAUDE.md — revoking from `anon` alone
-- does nothing while the PUBLIC grant stands).
revoke all on function public.amend_grant(uuid, text, timestamptz, boolean, text) from public;
revoke all on function public.amend_grant(uuid, text, timestamptz, boolean, text) from anon;
grant execute on function public.amend_grant(uuid, text, timestamptz, boolean, text) to authenticated;
