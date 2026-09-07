-- No public function is callable by anon; trigger functions not callable by anyone but the owner.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.prorettype = 'trigger'::regtype as is_trigger
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' loop
    execute format('revoke execute on function %s from anon, public', f.sig);
    if f.is_trigger then
      execute format('revoke execute on function %s from authenticated', f.sig);
    end if;
  end loop;
end $$;
alter function audit_immutable() set search_path = public;
alter function role_rank(role_level) set search_path = public;
alter function set_updated_at() set search_path = public;
alter default privileges in schema public revoke execute on functions from anon, public;
