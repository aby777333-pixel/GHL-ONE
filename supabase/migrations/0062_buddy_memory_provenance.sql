-- 0062 — Buddy remembers where it learnt something (stage 2)
--
-- What was there: `ai_memory` is (user_id, key, value, updated_at, org_id) and the `remember` tool
-- writes `{text: "..."}`. The route then dumps twelve rows into the prompt as a flat bullet list.
-- Nothing records where a memory came from, how sure Buddy is, whether it has gone stale, or what
-- it used to say — so "where did you get that?" is unanswerable, and a note Buddy inferred in
-- passing reads exactly like something the person stated as fact.
--
-- THE LAYERS, AND WHY PERSONAL MEMORY STAYS PERSONAL.
-- The spec asks for conversation → user → project → department → company → organisation. Three of
-- those already exist and are permission-governed, and this migration deliberately does not build a
-- fourth alongside them:
--   * personal working context  → `ai_memory`, own rows only (`aim_all`), which is what this
--     migration gives provenance to. `project_id` / `department_id` are *tags* saying when a memory
--     is relevant — never a grant to anybody else. Making personal memory shared is precisely where
--     an AI memory layer leaks, so the RLS policy is untouched.
--   * department and company knowledge → `ai_knowledge`, already owned, reviewed, classified and
--     gated by `can_view_classification` and department.
--   * everything live → the RLS-scoped tools.
-- The sanctioned path from the first to the second already exists and is explicit: a
-- `knowledge_article` proposal a human approves. AI-inferred notes and authoritative company
-- records therefore stay distinguishable, which §13 requires.
--
-- Nothing is removed. Every new column has a default, the primary key and the RLS policy are
-- unchanged, and the existing `remember` upsert keeps working untouched.

-- ---------------------------------------------------------------------------
-- 1. Provenance on a memory
-- ---------------------------------------------------------------------------

alter table ai_memory
  add column if not exists kind            text        not null default 'preference',
  add column if not exists source_type     text        not null default 'buddy',
  add column if not exists source_label    text,
  add column if not exists source_link     text,
  add column if not exists conversation_id uuid references ai_conversations(id) on delete set null,
  add column if not exists project_id      uuid references projects(id) on delete set null,
  add column if not exists department_id   uuid references departments(id) on delete set null,
  add column if not exists confidence      numeric(3,2) not null default 0.60,
  add column if not exists sensitivity     text        not null default 'normal',
  add column if not exists verified_at     timestamptz,
  add column if not exists expires_at      timestamptz,
  add column if not exists version         int         not null default 1,
  add column if not exists created_at      timestamptz not null default now();

-- `kind` is the distinction the brief asks for: something the person stated, something they prefer,
-- something they told Buddy to always do, a decision they recorded, something Buddy worked out
-- itself, and something it is not sure about. An inference must never be able to read as a fact.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_memory_kind_ck') then
    alter table ai_memory add constraint ai_memory_kind_ck
      check (kind in ('fact', 'preference', 'instruction', 'decision', 'inference', 'uncertain'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_memory_source_ck') then
    alter table ai_memory add constraint ai_memory_source_ck
      check (source_type in ('user', 'buddy', 'task', 'project', 'meeting', 'message', 'knowledge', 'document', 'inference', 'system'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_memory_sensitivity_ck') then
    alter table ai_memory add constraint ai_memory_sensitivity_ck check (sensitivity in ('normal', 'confidential'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_memory_confidence_ck') then
    alter table ai_memory add constraint ai_memory_confidence_ck check (confidence >= 0 and confidence <= 1);
  end if;
end $$;

create index if not exists ai_memory_recall_idx on ai_memory (user_id, project_id, department_id);

-- ---------------------------------------------------------------------------
-- 2. What it used to say
-- ---------------------------------------------------------------------------

-- "version" and "last verified" are only meaningful if the previous belief survives somewhere. A
-- memory that silently changes its mind is the thing that makes an assistant untrustworthy: this is
-- what lets Buddy answer "I used to think X — you corrected me on 12 Sep".
create table if not exists ai_memory_history (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  key          text not null,
  value        jsonb not null,
  kind         text,
  source_type  text,
  source_label text,
  confidence   numeric(3,2),
  version      int not null,
  replaced_at  timestamptz not null default now()
);
create index if not exists ai_memory_history_idx on ai_memory_history (user_id, key, replaced_at desc);

alter table ai_memory_history enable row level security;

drop policy if exists aimh_own on ai_memory_history;
create policy aimh_own on ai_memory_history for select to authenticated
  using (user_id = auth.uid() and org_id = current_org());

drop policy if exists aimh_forget on ai_memory_history;
create policy aimh_forget on ai_memory_history for delete to authenticated
  using (user_id = auth.uid() and org_id = current_org());

-- No INSERT policy: history is written by the trigger below, never by a client.

create or replace function ai_memory_keep_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.value is distinct from old.value or new.kind is distinct from old.kind then
    insert into ai_memory_history (org_id, user_id, key, value, kind, source_type, source_label, confidence, version)
    values (coalesce(old.org_id, new.org_id, (select p.org_id from profiles p where p.id = old.user_id)),
            old.user_id, old.key, old.value, old.kind, old.source_type, old.source_label, old.confidence, old.version);
  end if;
  return new;
end $$;

drop trigger if exists ai_memory_history_trg on ai_memory;
create trigger ai_memory_history_trg before update on ai_memory
  for each row execute function ai_memory_keep_history();

-- ---------------------------------------------------------------------------
-- 3. Reading and writing it
-- ---------------------------------------------------------------------------
-- All SECURITY INVOKER: `aim_all` already says "your own rows, in your own company", so RLS is the
-- control and an unauthenticated caller reads nothing rather than being told it read nothing.

create or replace function remember_fact(
  p_key text,
  p_value text,
  p_kind text default 'preference',
  p_source_type text default 'buddy',
  p_source_label text default null,
  p_source_link text default null,
  p_project uuid default null,
  p_department uuid default null,
  p_confidence numeric default 0.6,
  p_expires_at timestamptz default null,
  p_conversation uuid default null
) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_me    uuid := auth.uid();
  v_key   text;
  v_text  text;
  v_old   ai_memory%rowtype;
  v_kind  text := coalesce(nullif(btrim(p_kind), ''), 'preference');
  v_src   text := coalesce(nullif(btrim(p_source_type), ''), 'buddy');
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  v_key  := lower(btrim(coalesce(p_key, '')));
  v_text := btrim(coalesce(p_value, ''));
  if v_key = ''  then raise exception 'A memory needs a name.'; end if;
  if v_text = '' then raise exception 'A memory needs something to remember.'; end if;
  if length(v_key) > 60 then v_key := left(v_key, 60); end if;
  if length(v_text) > 600 then v_text := left(v_text, 600); end if;

  select * into v_old from ai_memory where user_id = v_me and key = v_key;

  insert into ai_memory (user_id, key, value, kind, source_type, source_label, source_link,
                         conversation_id, project_id, department_id, confidence, expires_at,
                         updated_at, verified_at, version)
  values (v_me, v_key, jsonb_build_object('text', v_text), v_kind, v_src, nullif(btrim(p_source_label), ''),
          nullif(btrim(p_source_link), ''), p_conversation, p_project, p_department,
          least(greatest(coalesce(p_confidence, 0.6), 0), 1), p_expires_at,
          now(), now(), coalesce(v_old.version, 0) + 1)
  on conflict (user_id, key) do update set
    value = excluded.value, kind = excluded.kind, source_type = excluded.source_type,
    source_label = excluded.source_label, source_link = excluded.source_link,
    conversation_id = excluded.conversation_id, project_id = excluded.project_id,
    department_id = excluded.department_id, confidence = excluded.confidence,
    expires_at = excluded.expires_at, updated_at = now(), verified_at = now(),
    version = excluded.version;

  return jsonb_build_object('ok', true, 'key', v_key, 'version', coalesce(v_old.version, 0) + 1,
                            'replaced', v_old.key is not null,
                            'previous', case when v_old.key is null then null else v_old.value ->> 'text' end);
end $$;

-- The layered read. Ranked by how close a memory is to what the person is doing right now: this
-- project first, then this department, then their general working context.
create or replace function recall_memory(
  p_query text default null,
  p_project uuid default null,
  p_department uuid default null,
  p_limit int default 12
) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(x order by rank, updated_at desc), '[]'::jsonb)
    from (
      select m.updated_at,
             (case when p_project is not null and m.project_id = p_project then 0
                   when p_department is not null and m.department_id = p_department then 1
                   when m.project_id is null and m.department_id is null then 2
                   else 3 end)
             + (case when p_query is not null and (m.key ilike '%' || p_query || '%' or m.value ->> 'text' ilike '%' || p_query || '%') then -1 else 0 end) as rank,
             jsonb_build_object(
               'key', m.key,
               'text', m.value ->> 'text',
               'kind', m.kind,
               'confidence', m.confidence,
               'source_type', m.source_type,
               'source', coalesce(m.source_label, case m.source_type when 'user' then 'you told me' when 'buddy' then 'this conversation' else m.source_type end),
               'link', m.source_link,
               'project_id', m.project_id,
               'department_id', m.department_id,
               'updated_at', m.updated_at,
               'verified_at', m.verified_at,
               'expires_at', m.expires_at,
               'version', m.version
             ) as x
        from ai_memory m
       where m.user_id = auth.uid()
         and (m.expires_at is null or m.expires_at > now())
         and (p_query is null or m.key ilike '%' || p_query || '%' or m.value ->> 'text' ilike '%' || p_query || '%')
       order by rank, m.updated_at desc
       limit greatest(1, least(coalesce(p_limit, 12), 50))
    ) s
$$;

-- "Where did you get that?" — the row and everything it used to say.
create or replace function memory_provenance(p_key text)
returns jsonb
language sql stable set search_path = public as $$
  select coalesce((
    select jsonb_build_object(
      'found', true,
      'key', m.key,
      'text', m.value ->> 'text',
      'kind', m.kind,
      'confidence', m.confidence,
      'source_type', m.source_type,
      'source', coalesce(m.source_label, m.source_type),
      'link', m.source_link,
      'conversation_id', m.conversation_id,
      'project_id', m.project_id,
      'department_id', m.department_id,
      'first_recorded', m.created_at,
      'last_updated', m.updated_at,
      'last_verified', m.verified_at,
      'expires_at', m.expires_at,
      'version', m.version,
      'history', coalesce((
        select jsonb_agg(jsonb_build_object('value', h.value ->> 'text', 'kind', h.kind, 'version', h.version, 'replaced_at', h.replaced_at) order by h.replaced_at desc)
          from ai_memory_history h where h.user_id = m.user_id and h.key = m.key
      ), '[]'::jsonb)
    )
      from ai_memory m
     where m.user_id = auth.uid() and m.key = lower(btrim(p_key))
  ), jsonb_build_object('found', false))
$$;

create or replace function forget_memory(p_key text)
returns jsonb
language plpgsql set search_path = public as $$
declare v_n int;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  delete from ai_memory where user_id = auth.uid() and key = lower(btrim(p_key));
  get diagnostics v_n = row_count;
  delete from ai_memory_history where user_id = auth.uid() and key = lower(btrim(p_key));
  return jsonb_build_object('ok', true, 'forgotten', v_n > 0);
end $$;

-- §33: everything an employee's data shows is visible to the employee too. This is the Privacy
-- Center's read — the whole of what Buddy remembers about them, with where each piece came from.
create or replace function my_memory()
returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', m.key,
           'text', m.value ->> 'text',
           'kind', m.kind,
           'confidence', m.confidence,
           'source_type', m.source_type,
           'source', coalesce(m.source_label, case m.source_type when 'user' then 'you told me' when 'buddy' then 'a Buddy conversation' else m.source_type end),
           'link', m.source_link,
           'project', (select p.name from projects p where p.id = m.project_id),
           'department', (select d.name from departments d where d.id = m.department_id),
           'created_at', m.created_at,
           'updated_at', m.updated_at,
           'expires_at', m.expires_at,
           'version', m.version,
           'expired', m.expires_at is not null and m.expires_at <= now()
         ) order by m.updated_at desc), '[]'::jsonb)
    from ai_memory m where m.user_id = auth.uid()
$$;

-- 0059: a definer or invoker RPC answers only to a signed-in caller, and the PUBLIC grant a new
-- function receives by default has to be revoked from anon explicitly.
revoke all on function remember_fact(text, text, text, text, text, text, uuid, uuid, numeric, timestamptz, uuid) from public, anon;
revoke all on function recall_memory(text, uuid, uuid, int) from public, anon;
revoke all on function memory_provenance(text) from public, anon;
revoke all on function forget_memory(text) from public, anon;
revoke all on function my_memory() from public, anon;

grant execute on function remember_fact(text, text, text, text, text, text, uuid, uuid, numeric, timestamptz, uuid) to authenticated;
grant execute on function recall_memory(text, uuid, uuid, int) to authenticated;
grant execute on function memory_provenance(text) to authenticated;
grant execute on function forget_memory(text) to authenticated;
grant execute on function my_memory() to authenticated;

grant select, delete on ai_memory_history to authenticated;
