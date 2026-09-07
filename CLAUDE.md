# GHL ONE — Company Operating System for GHL India Ventures

Next.js 16 (App Router, `src/`), React 19, Tailwind v4, Supabase (project `rarlrohsybktcheyrhiv`).
Positioning: *One Company. One Workspace. One Source of Truth.*

## Conventions (read before writing code)
- **Auth/session**: server pages call `getSession()` from `@/lib/session` (redirects to /login or /pending). Client components use `useSession()` from `@/components/providers/SessionProvider` → `{ profile, departments, people }`.
- **Supabase**: server → `createClient()` from `@/lib/supabase/server`; client → `createClient()` from `@/lib/supabase/client`. Types in `@/lib/database.types` (generated). Row/enum aliases + label maps + helpers in `@/lib/utils` (`Task`, `Project`, `STATUS_LABEL`, `PRIORITY_TONE`, `fmtDate`, `relDate`, `ago`, `isManagerPlus`…).
- **UI primitives**: `@/components/ui` — `Button`, `Pill`, `Avatar`, `AvatarStack`, `Card`, `CardHeader`, `Input`, `Textarea`, `Select`, `Field`, `SearchInput`, `Modal` (`side` for drawer), `Tabs`, `EmptyState`, `Spinner`, `Skeleton`, `Kbd`, `Stat`, `Progress`, `Menu`/`MenuItem`, `PageHeader`, `useToast()`.
- **Pickers**: `@/components/pickers` — `PersonPicker`, `DepartmentPicker`, `PriorityPicker`, `StatusPicker`, `ClassificationPicker`, `ProjectPicker`.
- **Task bits**: `@/components/tasks/TaskBits` — `StatusPill`, `PriorityPill`, `WaitingPill`, `DueLabel`, `PersonChip`, `TaskRow`. `@/components/tasks/QuickTaskForm` creates tasks.
- **Styling**: CSS tokens in `globals.css` (`var(--bg-elev)`, `var(--line)`, `var(--fg-muted)`, tones `.tone-*`, `.card`, `.btn`, `.input`, `.pill`, `.page`, `.h1/.h2/.h3`, `.eyebrow`, `.text-muted`). Golden-ratio spacing `--s1..--s7`. Dark mode = `.dark` on `<html>`; use tokens, never hard-coded greys. Mobile first: no horizontal overflow; bottom nav is 56px on <lg.
- **Routes** live under `src/app/(app)/…` (inside the shell). Auth pages outside: `/login`, `/pending`, `/auth/*`. Proxy at `src/proxy.ts` protects everything else.
- **Data rules** are enforced in Postgres (RLS + triggers). Notifications, task history, audit logs, calendar entries and project channels are created by triggers — do not duplicate in the client. RPCs: `search_all`, `company_pulse`, `department_health`, `workload`, `open_dm`, `mark_channel_read`, `my_unread_counts`, `task_from_message`, `create_project_from_template`, `create_delegation`, `related_to`.
- Roles: super_admin > director > executive > department_head > manager > team_lead > employee > intern > consultant > vendor > guest. Helpers `isAdminRole`, `isManagerPlus`, `isLeadPlus`, `isInternal`.
- Never run `next build` while `next dev` is running. Verify in the browser, then commit → push → deploy.

## Intelligence (Phase 2)
- Server-only AI layer in `src/lib/ai/` (`client.ts` = Anthropic SDK wrapper `complete()` / `extract()` + usage logging; `context.ts` = permission-safe context builders that ALWAYS use the caller's RLS-scoped Supabase client; `prompts.ts` = stable cacheable system prompts; `route.ts` = `withAI()` auth/error wrapper + summary cache helpers). Routes under `src/app/api/ai/*` (ask, brief, project-summary, meeting-extract, extract-tasks, delegate-parse, catch-up, risks, search, status). Client code uses `callAI()` and types from `@/lib/ai/types` and must handle `.disabled` (no `ANTHROPIC_API_KEY`).
- Model: `claude-opus-5` (override with `AI_MODEL`). Cheap routes use `effort: "low"`. The AI never executes actions — it proposes; humans confirm in the UI.
- Cached outputs live in `ai_summaries`; usage in `ai_usage` (admin-visible).

## Automation (Phase 3)
- Engine lives in Postgres (`0006_automation.sql`): `automations` (WHEN trigger_type + trigger_config → IF conditions → THEN actions; see `run_automation_action` for action JSON) fired by AFTER triggers via `fire_automations()` with a depth guard (max 2); `automation_runs` log; `schedule` triggers and the escalation ladder (`escalation_rules`) run on pg_cron (`run_scheduled_automations` every 5 min, `run_escalations` every 15 min, digests daily/weekly 08:30 IST). Recurring tasks: `tasks.recurrence` → next occurrence spawned on completion. Handoffs: `handoffs` table + trigger moves/assigns the task. Outgoing webhooks/Slack via `pg_net`; incoming via `/api/hooks/{token}` → `ingest_webhook()`; personal ICS feed via `/api/calendar/{token}.ics` → `calendar_feed()`.
- Template variables for automation text: `{{title}} {{assignee_name}} {{owner_name}} {{project_name}} {{department_name}} {{due}} {{link}} {{status}} {{priority}} {{actor_name}}`.

## Migrations
`supabase/migrations/*.sql` are the source of truth and are applied to the remote project via the Supabase MCP (`apply_migration`). Keep them additive.
