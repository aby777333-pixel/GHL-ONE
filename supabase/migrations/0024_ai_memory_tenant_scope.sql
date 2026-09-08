-- ============================================================================
-- 0024 — AI memory isolation (§11). ai_memory / ai_conversations were user-scoped
-- only. With one auth user per company that could not leak, but the platform rule
-- is that every record names its tenant, so make it explicit and enforced.
-- ============================================================================
alter table ai_memory add column if not exists org_id uuid references organizations(id) on delete cascade;
update ai_memory m set org_id = p.org_id from profiles p where p.id = m.user_id and m.org_id is null;
create index if not exists ai_memory_org_idx on ai_memory(org_id, user_id);

create or replace function ai_memory_org_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is null then select org_id into new.org_id from profiles where id = new.user_id; end if;
  return new;
end $$;
drop trigger if exists ai_memory_org on ai_memory;
create trigger ai_memory_org before insert on ai_memory for each row execute function ai_memory_org_default();

drop policy if exists aim_all on ai_memory;
create policy aim_all on ai_memory for all to authenticated
  using (user_id = auth.uid() and (org_id is null or org_id = current_org()))
  with check (user_id = auth.uid() and (org_id is null or org_id = current_org()));

alter table ai_conversations add column if not exists org_id uuid references organizations(id) on delete cascade;
update ai_conversations c set org_id = p.org_id from profiles p where p.id = c.user_id and c.org_id is null;

create or replace function ai_conversation_org_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.org_id is null then select org_id into new.org_id from profiles where id = new.user_id; end if;
  return new;
end $$;
drop trigger if exists ai_conversations_org on ai_conversations;
create trigger ai_conversations_org before insert on ai_conversations for each row execute function ai_conversation_org_default();
