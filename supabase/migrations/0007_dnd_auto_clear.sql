-- Do-not-disturb expiry: flip presence back to available when dnd_until passes.
create or replace function clear_expired_dnd() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with expired as (
    update notification_prefs set dnd_until = null where dnd_until is not null and dnd_until <= now() returning user_id
  )
  update profiles p set presence = 'available' from expired e where p.id = e.user_id and p.presence = 'dnd';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function clear_expired_dnd() from anon, public, authenticated;
select cron.schedule('ghl_dnd_clear', '*/5 * * * *', $$select clear_expired_dnd()$$);
