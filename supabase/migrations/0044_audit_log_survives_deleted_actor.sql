-- 0044 — An audit record must outlive the person it is about.
--
-- `audit_logs.actor_id` referenced `profiles(id) ON DELETE SET NULL`, and `audit_logs` carries an
-- append-only trigger that raises on any UPDATE or DELETE. Those two facts contradict each other:
-- deleting a person made Postgres try to null the actor on their audit rows, the trigger refused,
-- and the delete failed with `audit_logs is append-only`.
--
-- In practice **nobody who had ever done anything auditable could be removed at all** — not an
-- offboarded employee, not a QA account, not a person exercising a right to erasure. It stayed
-- hidden because offboarding deactivates rather than deletes; it surfaced the moment the launch
-- cleanup tried to remove the demo accounts.
--
-- The fix is the one audit tables normally use: the log records who acted as a historical fact,
-- not as a live pointer. `actor_label` keeps the name readable after the account is gone, a
-- BEFORE INSERT trigger fills it so no existing call site changes, and the foreign key goes away
-- so a deletion never rewrites history. The append-only guarantee is left completely intact.

alter table public.audit_logs add column if not exists actor_label text;

comment on column public.audit_logs.actor_label is
  'Who acted, captured at write time. Survives deletion of the account — audit_logs deliberately has no FK to profiles.';

-- One-time backfill so existing lines stay readable once the accounts behind them are removed.
-- The append-only trigger is suspended for this single statement inside the migration transaction
-- and restored immediately after; application traffic never sees it relaxed, and any failure rolls
-- the whole migration back (DDL is transactional in Postgres).
alter table public.audit_logs disable trigger audit_logs_immutable;

update public.audit_logs a
   set actor_label = p.full_name
  from public.profiles p
 where p.id = a.actor_id and a.actor_label is null;

alter table public.audit_logs enable trigger audit_logs_immutable;

create or replace function public.audit_actor_label()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.actor_label is null and new.actor_id is not null then
    select full_name into new.actor_label from profiles where id = new.actor_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_audit_actor_label on public.audit_logs;
create trigger trg_audit_actor_label
  before insert on public.audit_logs
  for each row execute function public.audit_actor_label();

-- The pointer that fought the append-only rule. The id stays on the row as a historical value.
alter table public.audit_logs drop constraint if exists audit_logs_actor_id_fkey;
