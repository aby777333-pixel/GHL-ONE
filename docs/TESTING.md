# Testing GHL ONE

There is one test suite and it lives in Postgres, because that is where the rules
live. RLS policies, helper functions and triggers are the application's real
business logic; a mocked TypeScript test would not have caught a single one of
the bugs below.

Everything is **read-only**. No fixtures, no seeded rows, no test tenants. It is
safe to run against production, and that is the point — it verifies the database
you actually ship on.

- Checks: `supabase/migrations/0026_selftest.sql`
- Runner: `scripts/verify.mjs`
- CI: `.github/workflows/verify.yml`

---

## The three bugs that caused this

All three shipped. All three were found by hand, in one session, after the fact.

**1. Mutual RLS recursion on `meetings`.**
`meetings.meet_read` subqueried `meeting_participants`; `meeting_participants.mp_read`
subqueried `meetings`. Postgres raised
`infinite recursion detected in policy for relation "meetings"`.
Organisers and managers matched an earlier `OR` branch and never reached the
recursive one, so the page worked for everyone who tested it and threw for every
ordinary employee. Fixed in `0023_fix_meetings_rls_recursion.sql` with
`SECURITY DEFINER` helpers.
→ caught by **`test_rls_role_sweep`** (at runtime, per role) and
**`test_policy_recursion`** (statically, before it can throw).

**2. Role-gated tables with no company filter.**
`attendance_days`, `attendance_events`, `time_entries`, `calls` and the template
tables all had policies of the shape "manager may read" with no
`org_id = current_org()`. With one tenant that is invisible. With two it is a
cross-company data leak.
→ caught by **`test_tenant_scoping`**.

**3. `.insert().select()` returning nothing.**
The insert succeeded; the implicit `RETURNING` read was filtered away because the
table's SELECT policy delegated only to a `STABLE` helper. A stable function is
evaluated against a snapshot that does not contain the row the same statement
just wrote, so there was no branch that could see it.
→ caught by **`test_returning_policies`**.

Two more classes we have already paid for once are checked too: a `STABLE`
function that writes (`platform_company`), and an unparenthesised `CASE` inserted
into an enum column (`live_invite_notify`, `live_room_decision`).

---

## What each check does

| Check | Catches |
| --- | --- |
| `test_rls_role_sweep()` | Picks **one active user per distinct role**, sets the request claims, drops to the `authenticated` role, and runs `select 1 from <table> limit 1` against every public table the app touches, catching every exception. Any error — recursion, a broken helper, a missing grant — is a failed check naming the role *and* the table. This is the sweep that found bug 1. |
| `test_tenant_scoping()` | Wraps `tenant_isolation_report()` (0022). Fails when a table has an `org_id` column but no policy mentioning `current_org()`, when RLS is disabled, or when RLS is on with zero policies. Bug 2. |
| `test_policy_recursion()` | Static analysis over `pg_policy`: any pair of tables A and B where A's policy subqueries B and B's subqueries A. Bug 1, caught before it can throw. |
| `test_returning_policies()` | Tables whose SELECT policy delegates to a stable per-row helper but has no direct `owner_id`/`created_by`/`user_id = auth.uid()` branch. Bug 3. |
| `test_function_volatility()` | `STABLE`/`IMMUTABLE` functions whose body contains `insert into`, `update … set` or `delete from`. |
| `test_enum_casts()` | plpgsql `insert into <table with an enum column>` using a bare `case … end` instead of `(case … end)::<enum>`. |
| `platform_self_test()` | Runs all six, returns `{ ok, passed, failed, checks, suites, ran_at }`. |

`platform_self_test()` is granted to `authenticated` and `service_role` and gates
itself: platform admin, company admin, the service role, or a direct `postgres`
session. `anon` is explicitly revoked.

### Sweep caveat

`test_rls_role_sweep()` explicitly `SET ROLE authenticated` before probing,
because `postgres` and `service_role` have `BYPASSRLS` and would sail through
every policy. If that `SET ROLE` fails, the sweep **fails loudly** rather than
reporting a green pass it did not earn. Same for "there are no active users to
impersonate".

### Checks that are advisory, not gates

- `tenant:no_org_column:review` always passes but lists every non-global table
  without an `org_id`. Many junction tables legitimately reach their tenant
  through a parent. Read the list on every release: anything on it that is *not*
  reached through a parent is the next bug 2. When you confirm a table is
  genuinely global, add it to `selftest_global_tables()` in a new migration —
  never by editing 0026.
- `test_enum_casts()` and `test_returning_policies()` are lints over function and
  policy source, so they are heuristics. Both were tuned against the whole live
  schema before being committed:
  - `test_enum_casts()` only fires on a `CASE` inside an `insert`, with no `::`
    anywhere in it, whose every quoted literal is a label of an enum used by a
    column of the target table. On today's schema that is **zero** false
    positives, and it does flag the original broken shape.
  - `test_returning_policies()` only fires when the delegated helper's own body
    reads the very table it guards — the self-referential shape of bug 3.
    Without that narrowing it flagged 52 policies (every `has_perm()` gate);
    with it, only the genuinely risky ones.

  A false positive is fixed by tightening the check, not by loosening it.

---

## Running it

### Locally

```bash
npm run verify          # database self test only
npm run check           # tsc --noEmit && eslint src --max-warnings=0 && npm run verify
```

`verify` needs two environment variables, read from the environment only
(`.env.local` and `.env` are loaded if present; both are gitignored):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

The service key comes from **Supabase dashboard → Project Settings → API Keys →
`service_role` (secret)**. It bypasses row level security: never commit it, never
put it in a `NEXT_PUBLIC_*` variable, never paste it into a log or an issue. The
runner never prints it.

If the key is missing the runner exits non-zero with instructions. It never
reports a pass without having run anything.

### From the SQL editor

```sql
select jsonb_pretty(platform_self_test());
```

Use this if the RPC times out — a browser/PostgREST call runs under the
`authenticated` statement timeout, and the role sweep is roughly
*(distinct active roles) × (public tables)* probes.

### In CI

`.github/workflows/verify.yml` runs on every pull request and on pushes to
`main`: install → `tsc --noEmit` → `eslint` → `next build` → `npm run verify`.

The verify step is skipped with a warning annotation (not a failure) until these
repository secrets exist, so the workflow is useful from day one:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (used by `next build`)

---

## Adding a check

1. Write a new `test_*()` function in a **new** migration (`0027_…`, `0028_…`),
   or `create or replace` an existing one. Never edit an applied migration.
2. Return the standard envelope with `selftest_result(jsonb)`, where the argument
   is a JSON array of `{ name, ok, detail }`:

   ```sql
   create or replace function test_my_rule() returns jsonb
   language plpgsql stable security definer set search_path = public as $$
   declare checks jsonb := '[]'::jsonb; r record; found int := 0;
   begin
     if not selftest_allowed() then raise exception 'forbidden'; end if;
     for r in select ... loop
       found := found + 1;
       checks := checks || jsonb_build_object('name', 'my_rule:' || r.thing, 'ok', false, 'detail', '…');
     end loop;
     if found = 0 then
       checks := checks || jsonb_build_object('name', 'my_rule:none', 'ok', true, 'detail', '…');
     end if;
     return selftest_result(checks);
   end $$;
   ```

3. Add its name to the `names` array in `platform_self_test()` and to the `case`
   inside the loop (`create or replace` the whole function in your new migration).
4. Grant execute to `authenticated, service_role`; revoke from `anon`.
5. Keep it **read-only**. If a check needs to write, it does not belong here.
6. Add a row to the table above.

`detail` should say what to do, not just what is wrong. Every existing check
names the fix.

---

## The standing rule

> **Every new table carries `org_id` and an org-scoped policy
> (`using (org_id = current_org() and …)`).
> Every new SELECT policy carries a direct owner branch
> (`owner_id = auth.uid()` / `created_by = auth.uid()` / `user_id = auth.uid()`)
> in addition to whatever helper it delegates to.**

A table that can only reach its tenant through a parent is a deliberate
exception: say so in the migration comment, and expect to see it in
`tenant:no_org_column:review` on every run.

And the two corollaries the other checks enforce:

- A policy must never subquery a table whose own policy subqueries it back. Use a
  `SECURITY DEFINER` helper to break the cycle.
- A function that writes is `VOLATILE`. Do not label it `STABLE` to make a
  planner warning go away.
