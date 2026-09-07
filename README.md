# GHL ONE

**One Company. One Workspace. One Source of Truth.**

The internal Company Operating System of GHL India Ventures: command center, department workspaces, universal task engine, delegation, projects with project rooms, real-time chat (message → task), decision register, approval center, meetings that produce work, unified calendar, files with version control, wiki, directory & org chart, universal search, inbox, announcements, ideas, audit trail.

## Stack
Next.js 16 (App Router, `src/`), React 19, Tailwind v4, Supabase (Postgres 17, Auth, Storage, Realtime). Hosted on Netlify (`ghl-one`).

## Local development
```bash
npm install
cp .env.example .env.local   # fill NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

## Database
Migrations live in `supabase/migrations/` and are the source of truth (applied to the remote project). Row-level security, triggers (notifications, task history, audit, calendar, project channels) and RPCs are all in Postgres — the UI never duplicates those rules.

## Roles
`super_admin > director > executive > department_head > manager > team_lead > employee > intern > consultant > vendor > guest`.
First ever sign-up becomes super_admin. Pre-invited emails (Admin → Invites) activate automatically with their role and department; everyone else waits at `/pending` until an admin activates them.

## Roadmap
Phase 1 Core (this) → Phase 2 Intelligence (AI assistant, morning brief, meeting extraction, semantic search, bottleneck AI) → Phase 3 Automation (WHEN/IF/THEN, escalation engine, integrations) → Phase 4 Enterprise operations (HR, OKRs, guest portals, compliance) → Phase 5 Deep intelligence. The Communication superlayer (calls, video, screen recording, transcription) is an additive module.
