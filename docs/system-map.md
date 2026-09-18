# GHL ONE system map

Generated from the codebase by `npm run system-map`. Structure only — no source code. Use it to say
*where* something lives and *what* exists; never quote it as a description of how a rule behaves,
because a name is not an implementation.

Stack: Next.js 16 (App Router, `src/`), React 19, Tailwind v4, Supabase/Postgres with RLS.
Counted at generation: 89 pages, 27 API endpoints, 203 tables, 425 database functions, 67 migrations.

## Screens (89)
- /
- /academy
- /academy/[id]
- /admin
- /admin/organization
- /admin/people-intelligence
- /announcements
- /approvals
- /approvals/[id]
- /attendance
- /automations
- /automations/[id]
- /boards
- /boards/[id]
- /bookings
- /broadcasts/[id]
- /broadcasts/new
- /calendar
- /chat
- /chat/[id]
- /command
- /common
- /connect
- /connect/[id]
- /connect/admin
- /connect/contacts
- /connect/contacts/[id]
- /connect/dashboard
- /connect/follow-ups
- /decisions
- /decisions/[id]
- /delegate
- /departments
- /departments/[slug]
- /docs
- /docs/[id]
- /events
- /experiments
- /files
- /files/[id]
- /goals
- /help
- /help/[id]
- /help/incidents/[id]
- /ideas
- /inbox
- /jobs
- /leave
- /live
- /live/[id]
- /live/guest/[token]
- /login
- /meetings
- /meetings/[id]
- /my-work
- /no-access
- /office-hours
- /one-on-ones
- /pending
- /people
- /people/[id]
- /people/requests
- /people/skills
- /people/team
- /platform
- /platform/[id]
- /platform/access
- /platform/new
- /policies/[id]
- /projects
- /projects/[id]
- /projects/new
- /pulse
- /recordings
- /recordings/[id]
- /requests
- /retros
- /search
- /status
- /tasks
- /tasks/[id]
- /visitors
- /wiki
- /wiki/[slug]
- /wiki/knowledge
- /wiki/knowledge/[id]
- /wiki/questions
- /wiki/questions/[id]
- /workforce

## API endpoints (27)
- /api/ai/ask
- /api/ai/brief
- /api/ai/buddy
- /api/ai/catch-up
- /api/ai/connect-draft
- /api/ai/delegate-parse
- /api/ai/extract-tasks
- /api/ai/inbox
- /api/ai/meeting-extract
- /api/ai/project-summary
- /api/ai/recording-summary
- /api/ai/risks
- /api/ai/search
- /api/ai/status
- /api/calendar/[token]
- /api/connect/send
- /api/hooks/[token]
- /api/hooks/email/[token]
- /api/hooks/message/[token]
- /api/hooks/push/[token]
- /api/live/moderate
- /api/live/token
- /api/push/decline
- /api/push/subscribe
- /api/push/unsubscribe
- /auth/callback
- /auth/signout

## Database tables (203)
access_events, access_grants, access_requests, access_review_items, access_reviews, active_workspace, admin_assignments, admin_roles, ai_actions, ai_assistants, ai_conversations, ai_feedback, ai_knowledge, ai_knowledge_owners, ai_memory, ai_memory_history, ai_messages, ai_summaries, ai_usage, allocations, announcement_acks, announcements, answer_votes, answers, approval_events, approvals, asset_assignments, asset_requests, assets, attendance_days, attendance_events, audit_logs, automation_runs, automations, board_access_log, board_comments, board_versions, boards, bookings, break_glass_sessions, break_policies, break_types, broadcast_acks, broadcasts, buddy_nudges, calendar_events, calendar_feed_tokens, callbacks, calls, candidates, channel_members, channels, checkins, collab_favorites, collab_policies, comm_templates, commitments, company_invites, company_onboarding, company_templates, config_history, contacts, conversation_messages, conversations, courses, coverage_requirements, decisions, delegations, departments, employee_documents, employee_imports, employee_transfers, enrollments, escalation_log, escalation_rules, event_rsvps, events, experiments, expert_slots, feature_flags, federation_members, federations, feedback, file_versions, files, follow_ups, glossary, goal_tasks, goals, handoffs, help_requests, idea_votes, ideas, inbox_members, inbox_rules, inboxes, incidents, integration_deliveries, integrations, internal_applications, interviews, invites, job_openings, join_requests, kudos, learning_interests, leave_balances, leave_types, leaves, lesson_progress, lessons, live_doc_comments, live_doc_versions, live_docs, live_events, live_guest_links, live_invites, live_notes, live_participants, live_polls, live_questions, live_recording_replies, live_recordings, live_rooms, live_transcripts, manager_history, meeting_actions, meeting_participants, meetings, memberships, mentorships, message_reactions, messages, milestones, module_usage, nav_layouts, notification_prefs, notifications, office_hours, one_on_ones, org_features, organizations, permission_overrides, platform_admin_invites, platform_admins, platform_announcements, platform_assignments, platform_audit_logs, platform_features, policies, policy_acks, policy_versions, probation_reviews, profiles, profiles_private, project_members, project_risks, project_templates, projects, public, push_config, push_subscriptions, questions, requests, resources, responsibilities, retrospectives, role_changes, role_defaults, role_history, screen_rules, screens, security_events, service_catalog, service_status, shift_assignments, shift_handovers, shift_swaps, shifts, signatures, skill_endorsements, standups, suggestions, support_sessions, survey_responses, surveys, system_roles, task_checklist, task_collaborators, task_comments, task_dependencies, task_history, task_templates, tasks, teams, tenant_usage, time_entries, user_roles, visitors, wiki_pages, workflow_runs, workflow_steps, workflow_templates

## Database functions (425)
access_event_summary, access_findings, access_request_after_change, access_request_route, account_approvers, ack_task, action_verification, activity_timeline, add_promise, admin_assignment_audit, admin_role_audit, admin_sessions, ai_conversation_org_default, ai_cost_summary, ai_feedback_excerpt, ai_feedback_route, ai_knowledge_guard, ai_memory_keep_history, ai_memory_org_default, ai_requests_today, announcement_notify, answer_quality, answer_vote_sync, answers_notify, apply_access_review, apply_inbox_rules, apply_role_change, apply_transfer, approval_after_change, approvals_automation_events, approvals_route_delegation, approve_account, approve_message, asset_assignment_sync, asset_request_route, assign_conversation, assign_employee_code, assignment_warnings, assistant_performance, attendance_after_event, attendance_auto_checkout, attendance_board, attendance_cron_tick, attendance_daily_summary, attendance_exceptions, attendance_patterns, attendance_recompute, attendance_settings, attendance_summary, audit_immutable, auto_onboarding, autojoin_common, automation_ctx, automations_schedule_touch, blocker_chain, board_comment_notify, board_element_task, board_restore, board_snapshot, board_to_project, break_policy_for, bring_in, broadcast_send, buddy_scan, buddy_scan_all, calendar_feed, call_person, can_approve_account, can_approve_accounts, can_assign, can_edit_board, can_edit_task, can_see_ai_console, can_see_workforce, can_view_board, can_view_channel, can_view_classification, can_view_contact, can_view_conversation, can_view_live_doc, can_view_live_room, can_view_project, can_view_recording, can_view_screen, can_view_task, can_view_workflow_run, candidate_org, candidate_owner, capacity_calendar, change_impact, change_manager, claim_conversation, claim_help_request, clear_expired_dnd, clock, close_join_request_on_activation, collab_can, collaboration_map, commitment_reminders, company_go_live_blockers, company_now, company_pulse, company_setup_health, complete_follow_up, config_history_log, connect_dashboard, connect_settings, connect_sla_tick, contact_timeline, conversations_after, conversations_before, convert_channel_to_project, correct_attendance, coverage_after_break, coverage_forecast, create_breakouts, create_company, create_delegation, create_project_from_template, current_department, current_org, current_role_level, decision_audit, decisions_automation_events, decline_account, default_onboarding_steps, delegate_for, delegations_notify, delete_collab_policy, department_availability, department_brief, department_coverage, department_guard, department_health, dismiss_nudge, effective_approver, effective_level, effective_nav, effective_screens, end_break_glass, end_breakouts, end_live_room, enrollment_notify, escalate_help_requests, escalate_requests, eval_condition, events_calendar, expert_slot_notify, expire_access_grants, expire_collaboration, expire_delegations_and_roles, explain_access, feature_enabled, feedback_notify, file_version_audit, file_versions_automation_events, find_experts, find_or_create_contact, fire_automations, forget_memory, freeze_department, freeze_user, grant_support_access, handle_new_user, handoff_after_change, has_admin_perm, has_admin_perm_user, has_break_glass, has_grant, has_perm, help_request_after_change, help_request_live_archive, hire_candidate, huddle_suggestion, idea_votes_sync, imm_array_to_string, import_people, in_federation, in_focus_window, in_quiet_hours, ingest_email, ingest_message, ingest_webhook, invite_department, is_active_member, is_admin, is_candidate_panelist, is_channel_member, is_hr, is_inbox_member, is_inbox_supervisor, is_internal, is_internal_user, is_knowledge_owner, is_lead_plus, is_live_host, is_manager_of, is_manager_of_user, is_manager_plus, is_meeting_participant, is_platform_admin, is_platform_admin_user, is_platform_owner, is_primary_admin, is_primary_admin_user, is_project_member, is_run_step_owner, join_live_room, join_request_org_default, knock, knowledge_health, knowledge_signal, kudos_after_insert, leave_before_change, leave_collisions, leave_days, leave_impact, leave_live_room, leave_notify, leaves_route_delegation, lesson_progress_sync, live_bookmark, live_doc_comment_notify, live_doc_snapshot, live_doc_task, live_governance, live_guest_consume, live_guest_link, live_guest_lookup, live_history, live_invite, live_invite_department, live_invite_notify, live_moderate, live_raise_hand, live_recording_share_notify, live_room_decision, live_room_task, live_running_late, live_tick, live_to_knowledge, lock_feature, log_access_event, log_call, mark_channel_read, mark_message_sent, meeting_calendar, meeting_cost, meeting_hygiene, meeting_load, meeting_org, meeting_participant_notify, meeting_project, membership_sync, memory_provenance, mentorship_notify, message_after_insert, message_edit_guard, messages_after, messages_automation_events, milestone_calendar, my_attendance, my_attendance_exceptions, my_calendar_token, my_commitments, my_connect_queue, my_leave_balances, my_memory, my_nudges, my_pending_policies, my_unread_counts, my_workspaces, needs_send_approval, notification_org_default, notification_push_fanout, notify_account_change, notify_account_pending, nudge_workflow_step, offboard_user, one_on_one_notify, open_dm, operational_inactivity, org_completeness_audit, org_feature_enabled, org_health, pending_accounts, people_intelligence, person_name, pick_agent, platform_can_touch, platform_company, platform_overview, platform_role, platform_self_test, policy_publish, prepare_handover, prepare_shift_handover, probation_reminders, profile_audit, profile_change_history, profile_guard, profile_status_sync, project_after_insert, project_member_after_insert, projects_automation_events, publish_platform_announcement, purge_access_events, push_notification, push_settle, push_subscription_org_default, push_targets, queue_message, recall_memory, related_to, remember_fact, remove_push_subscription, render_tpl, reports_of, request_account_activation, request_federation, request_route, resolve_conversation, resolve_step_department, resolve_step_owner, resolve_targets, respond_federation, respond_live_invite, restore_handovers, restricted_hits, revoke_everywhere, revoke_grant, revoke_session, revoke_support_access, role_rank, roster, rotate_calendar_token, run_automation_action, run_digests, run_escalations, run_scheduled_automations, save_push_subscription, schedule_next_run, search_all, search_contacts, search_knowledge, seen_nudges, selftest_allowed, selftest_global_tables, selftest_isolation_report, selftest_jwt_role, selftest_platform_only_tables, selftest_result, service_status_notify, session_login_alert, set_active_workspace, set_attendance_settings, set_collab_policy, set_company_status, set_connect_settings, set_employee_status, set_live_state, set_org_feature, set_updated_at, shift_handover_notify, shift_swap_apply, similar_help_requests, similar_knowledge, similar_tasks, since_last_visit, skill_endorsement_verify, skip_workflow_step, snooze_conversation, start_access_review, start_break_glass, start_conversation, start_focus, start_live_room, start_war_room, start_workflow, stop_focus, storage_org_ok, task_after_change, task_assignment_guard, task_comment_notify, task_dependency_release, task_from_message, task_quality_gate, task_recurrence_next, task_recurrence_spawn, tasks_automation_events, team_digest, tenant_isolation_probe, tenant_isolation_report, tenant_usage_snapshot, test_automation, test_enum_casts, test_function_volatility, test_policy_recursion, test_returning_policies, test_rls_role_sweep … and 25 more

## Scheduled jobs (22)
- ghl_access_purge (15 21 * * *)
- ghl_attendance_daily (35 3 * * 1-6)
- ghl_attendance_tick (*/10 * * * *)
- ghl_auto_checkout (30 20 * * *)
- ghl_buddy_nudges (0 4,10 * * 1-6)
- ghl_commitments (30 3 * * *)
- ghl_connect_sla (*/10 * * * *)
- ghl_daily_digest (0 3 * * *)
- ghl_dnd_clear (*/5 * * * *)
- ghl_escalations (*/15 * * * *)
- ghl_expire_collab (*/10 * * * *)
- ghl_expire_grants (*/10 * * * *)
- ghl_expire_roles (*/15 * * * *)
- ghl_help_sla (*/15 * * * *)
- ghl_live_tick (*/10 * * * *)
- ghl_org_audit (45 3 * * *)
- ghl_probation (15 3 * * *)
- ghl_request_sla (*/30 * * * *)
- ghl_restore_handovers (30 0 * * *)
- ghl_scheduled_automations (*/5 * * * *)
- ghl_tenant_usage (20 1 * * *)
- ghl_weekly_digest (0 3 * * 1)

## Front-end areas
Components by area: academy, access, admin, ai, approvals, attendance, auth, automations, board, bookings, broadcasts, calendar, chat, command, commitments, common, connect, decisions, departments, docs, events, experiments, files, goals, growth, help, home, ideas, inbox, intel, jobs, leave, live, meetings, mywork, notifications, officehours, people, platform, policies, projects, providers, pulse, questions, recordings, requests, retros, shell, standups, status, tasks, ui, visitors, wiki, workforce
Shared libraries: ai/buddy.ts, ai/buddyPrompts.ts, ai/client.ts, ai/context.ts, ai/memory.ts, ai/models.ts, ai/orchestrator.ts, ai/pricing.ts, ai/prompts.ts, ai/route.ts, ai/types.ts, connectPerms.ts, database.types.ts, live/client.ts, live/livekit.ts, live/types.ts, permissions.ts, push/client.ts, push/server.ts, screens.ts, session.ts, supabase/client.ts, supabase/server.ts, utils.ts

## Environment variables read by the app
AI_MODEL, AI_ROUTER, ANTHROPIC_API_KEY, CONNECT_FROM_EMAIL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL, NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_LIVEKIT_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_VAPID_PUBLIC_KEY, PUSH_HOOK_SECRET, RESEND_API_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT

## How each area works
The project's own engineering record is `CLAUDE.md`, whose sections are:
- Conventions (read before writing code)
- Intelligence (Phase 2)
- Automation (Phase 3)
- Migrations
- Employee & Team OS (Phase 4)
- Wave 2 schema (AI Buddy + HR ops)
- GHL Buddy (AI companion)
- Phase 5 — Employee control, screen governance, org intelligence (schema 0017–0018)
- Phase 5b — Workforce admin (0019) & GHL Connect (0020)
- Phase 5 UI map (built 2026-09-08)
- GHL LIVE (schema 0021_live.sql)
- Multi-company platform (0022_platform.sql)
- Web push + PWA (schema 0025_push.sql)
- Access control — Platform Owner, roles and permissions (schema 0035–0036)
- RBAC — granular permissions and the Company Super Admin (schema 0040–0042)
- Permission scope — own / team / department / company (schema 0043)
- Audit records outlive the people in them (schema 0044)
- Role-level deny, and why "why?" can no longer lie (schema 0046)
- Resource scope for tasks and projects (schema 0047)
- Scope for files, the wiki and chat (schema 0049)
- Tenant isolation for the authority tables (schema 0050)
- Safe admin delegation — the roles.* keys become real (§15, schema 0051)
- Authority changes are announced (§20, schema 0052)
- Feature entitlements gate modules (§25, schema 0053)
- Every surface that offers a destination is governed (§5, §19)
- Access Control → Audit Log (§18, schema 0054)
- Fourth test report — 11 issues (schema 0055 + UI)
- View As shows the menu, and a department move is announced (§13, §20, schema 0056)
- Bulk administration (§29)
- Role templates and creating a company's own roles (schema 0048)
- People directory: job title, access level and security roles side by side (§12, §3A)
- Go-live audit — runtime failures nothing was watching (schema 0057–0058)
- Function oracles closed (schema 0059)
- A sign-up reaches the people who can admit it (schema 0060)
- Buddy intelligence orchestrator — stage 1 (schema 0061)
- Buddy memory with provenance — stage 2 (schema 0062)
- Buddy stages 3-5 — models, the learning loop, the console, verified actions (schema 0063-0064)
