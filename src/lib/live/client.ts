"use client";
/**
 * Browser-side helpers for GHL LIVE. Thin wrappers over Supabase RPCs (RLS-scoped) and the two API routes.
 * Every function throws an Error with a human-readable message on failure.
 */
import { createClient } from "@/lib/supabase/client";
import type { CollabContext, RoomKind, RoomSettings, LiveRoom, BoardDoc, BoardKind, BoardVisibility, LiveDocKind, BoardTemplateKey } from "./types";

function fail(e: { message?: string } | null | undefined, fallback: string): never {
  throw new Error(e?.message || fallback);
}

export async function startRoom(kind: RoomKind, ctx: CollabContext = {}, opts: { settings?: RoomSettings; persistent?: boolean; visibility?: string; parent?: string | null } = {}) {
  const sb = createClient();
  const { data, error } = await sb.rpc("start_live_room", {
    p_kind: kind,
    p_title: ctx.title ?? null,
    p_channel: ctx.channelId ?? null,
    p_project: ctx.projectId ?? null,
    p_task: ctx.taskId ?? null,
    p_department: ctx.departmentId ?? null,
    p_help: ctx.helpId ?? null,
    p_incident: ctx.incidentId ?? null,
    p_meeting: ctx.meetingId ?? null,
    p_team: ctx.teamId ?? null,
    p_invitees: ctx.invitees ?? [],
    p_settings: (opts.settings ?? {}) as never,
    p_persistent: opts.persistent ?? false,
    p_visibility: opts.visibility ?? null,
    p_parent: opts.parent ?? null,
  });
  if (error || !data) fail(error, "Could not start the room");
  return data as string;
}

export async function callPerson(userId: string, video = true) {
  const { data, error } = await createClient().rpc("call_person", { p_user: userId, p_video: video });
  if (error || !data) fail(error, "Could not start the call");
  return data as string;
}

export async function knockPerson(userId: string, message?: string) {
  const { data, error } = await createClient().rpc("knock", { p_user: userId, p_message: message ?? null });
  if (error || !data) fail(error, "Could not knock");
  return data as string;
}

export type TokenResponse = {
  token: string; url: string; role: string; room: string; title: string; kind: RoomKind; settings: RoomSettings; confidential: boolean; identity: string; canPublish?: boolean; guest?: boolean; org?: string;
};

export async function fetchToken(body: { roomId: string; device?: string } | { guestToken: string; name?: string }): Promise<TokenResponse> {
  const res = await fetch("/api/live/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string; reason?: string; disabled?: boolean };
  if (!res.ok) {
    const err = new Error(json.error || "Could not join") as Error & { status: number; reason?: string; disabled?: boolean };
    err.status = res.status; err.reason = json.reason; err.disabled = json.disabled;
    throw err;
  }
  return json;
}

export async function leaveRoom(roomId: string) {
  await createClient().rpc("leave_live_room", { p_room: roomId });
}

export async function endRoom(roomId: string, summary?: string) {
  const res = await fetch("/api/live/moderate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roomId, action: "end", value: summary ?? null }) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Could not end the room");
}

export async function moderate(roomId: string, action: string, userId?: string, value?: string) {
  const res = await fetch("/api/live/moderate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ roomId, userId, action, value }) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Action failed");
}

export async function setLiveState(state: "in_call" | "in_meeting" | "presenting" | "recording") {
  await createClient().rpc("set_live_state", { p_state: state });
}

export async function invitePerson(roomId: string, userId: string, kind: "ring" | "knock" | "invite" | "request_share" = "ring", message?: string) {
  const { data, error } = await createClient().rpc("live_invite", { p_room: roomId, p_user: userId, p_kind: kind, p_message: message ?? null });
  if (error) fail(error, "Could not invite");
  return data as string;
}

export async function inviteDepartment(roomId: string, departmentId: string, message?: string) {
  const { data, error } = await createClient().rpc("live_invite_department", { p_room: roomId, p_department: departmentId, p_message: message ?? null });
  if (error) fail(error, "Could not invite the department");
  return (data as number) ?? 0;
}

export async function respondInvite(inviteId: string, status: "accepted" | "declined") {
  await createClient().rpc("respond_live_invite", { p_id: inviteId, p_status: status });
}

export async function raiseHand(roomId: string, up: boolean) {
  await createClient().rpc("live_raise_hand", { p_room: roomId, p_up: up });
}

export async function roomTask(roomId: string, input: { title: string; assigneeId?: string | null; due?: string | null; priority?: "critical" | "urgent" | "high" | "normal" | "low"; description?: string | null; attachments?: { path: string; name: string; type: string; size?: number }[] }) {
  const { data, error } = await createClient().rpc("live_room_task", {
    p_room: roomId, p_title: input.title, p_assignee: input.assigneeId ?? null, p_due: input.due ?? null, p_priority: input.priority ?? "normal", p_description: input.description ?? null, p_attachments: (input.attachments ?? []) as never,
  });
  if (error || !data) fail(error, "Could not create the task");
  return data as string;
}

export async function roomDecision(roomId: string, input: { title: string; decision: string; reason?: string | null }) {
  const { data, error } = await createClient().rpc("live_room_decision", { p_room: roomId, p_title: input.title, p_decision: input.decision, p_reason: input.reason ?? null });
  if (error || !data) fail(error, "Could not record the decision");
  return data as string;
}

export async function bookmark(roomId: string, label?: string, offsetMs?: number) {
  await createClient().rpc("live_bookmark", { p_room: roomId, p_label: label ?? null, p_offset_ms: offsetMs ?? null });
}

export async function runningLate(meetingId: string, minutes = 5) {
  const { error } = await createClient().rpc("live_running_late", { p_meeting: meetingId, p_minutes: minutes });
  if (error) fail(error, "Could not notify");
}

export async function createBreakouts(roomId: string, groups: { title: string; user_ids: string[] }[]) {
  const { data, error } = await createClient().rpc("create_breakouts", { p_room: roomId, p_groups: groups as never });
  if (error) fail(error, "Could not create breakout rooms");
  return (data as string[]) ?? [];
}

export async function endBreakouts(roomId: string) {
  const { error } = await createClient().rpc("end_breakouts", { p_room: roomId });
  if (error) fail(error, "Could not end breakouts");
}

export async function guestLink(roomId: string, name?: string, email?: string, hours = 4) {
  const { data, error } = await createClient().rpc("live_guest_link", { p_room: roomId, p_name: name ?? null, p_email: email ?? null, p_hours: hours });
  if (error || !data) fail(error, "Could not create a guest link");
  return `${window.location.origin}/live/guest/${data as string}`;
}

export async function liveHistory(type: "project" | "task" | "department" | "channel" | "help" | "incident" | "meeting", id: string) {
  const { data } = await createClient().rpc("live_history", { p_type: type, p_id: id });
  return (data ?? {}) as { rooms?: unknown[]; recordings?: unknown[]; boards?: unknown[]; docs?: unknown[]; decisions?: unknown[] };
}

export async function huddleSuggestion(channelId: string) {
  const { data } = await createClient().rpc("huddle_suggestion", { p_channel: channelId });
  return (data ?? {}) as { messages_20m?: number; authors?: number; live_room_id?: string | null; suggest?: boolean };
}

export async function toggleFavorite(kind: "board" | "room" | "doc" | "recording", entityId: string, userId: string, on: boolean) {
  const sb = createClient();
  if (on) await sb.from("collab_favorites").upsert({ user_id: userId, kind, entity_id: entityId });
  else await sb.from("collab_favorites").delete().match({ user_id: userId, kind, entity_id: entityId });
}

/* ------------------------------------------------------------------ boards */
export async function createBoard(input: { orgId: string; ownerId: string; title: string; kind?: BoardKind; visibility?: BoardVisibility; projectId?: string | null; departmentId?: string | null; teamId?: string | null; roomId?: string | null; templateKey?: BoardTemplateKey; doc?: BoardDoc; memberIds?: string[] }) {
  const { data, error } = await createClient().from("boards").insert({
    org_id: input.orgId, owner_id: input.ownerId, created_by: input.ownerId, title: input.title, kind: input.kind ?? "personal", visibility: input.visibility ?? (input.kind === "personal" ? "private" : "members"),
    project_id: input.projectId ?? null, department_id: input.departmentId ?? null, team_id: input.teamId ?? null, room_id: input.roomId ?? null, template_key: input.templateKey ?? "blank",
    doc: (input.doc ?? { pages: [{ id: "p1", title: "Page 1", elements: [] }] }) as never, member_ids: input.memberIds ?? [],
  }).select("id").single();
  if (error || !data) fail(error, "Could not create the board");
  return data.id as string;
}

export async function boardTask(boardId: string, elementId: string, title: string, assigneeId?: string | null, due?: string | null) {
  const { data, error } = await createClient().rpc("board_element_task", { p_board: boardId, p_element_id: elementId, p_title: title, p_assignee: assigneeId ?? null, p_due: due ?? null, p_priority: "normal" });
  if (error || !data) fail(error, "Could not create the task");
  return data as string;
}

export async function boardSnapshot(boardId: string, label?: string) {
  const { error } = await createClient().rpc("board_snapshot", { p_board: boardId, p_label: label ?? null });
  if (error) fail(error, "Could not snapshot");
}

export async function boardRestore(boardId: string, versionId: string) {
  const { error } = await createClient().rpc("board_restore", { p_board: boardId, p_version_id: versionId });
  if (error) fail(error, "Could not restore");
}

export async function boardToProject(boardId: string, name: string, items: { title: string; description?: string; assignee_id?: string | null; priority?: string; due?: string | null }[], due?: string | null) {
  const { data, error } = await createClient().rpc("board_to_project", { p_board: boardId, p_name: name, p_due: due ?? null, p_items: items as never });
  if (error || !data) fail(error, "Could not create the project");
  return data as string;
}

/* ------------------------------------------------------------------ live docs */
export async function createDoc(input: { orgId: string; ownerId: string; title: string; kind?: LiveDocKind; body?: string; roomId?: string | null; meetingId?: string | null; projectId?: string | null; taskId?: string | null; departmentId?: string | null; visibility?: BoardVisibility; memberIds?: string[] }) {
  const { data, error } = await createClient().from("live_docs").insert({
    org_id: input.orgId, owner_id: input.ownerId, created_by: input.ownerId, title: input.title, kind: input.kind ?? "doc", body: input.body ?? "",
    room_id: input.roomId ?? null, meeting_id: input.meetingId ?? null, project_id: input.projectId ?? null, task_id: input.taskId ?? null, department_id: input.departmentId ?? null,
    visibility: input.visibility ?? "members", member_ids: input.memberIds ?? [],
  }).select("id").single();
  if (error || !data) fail(error, "Could not create the document");
  return data.id as string;
}

export async function docTask(docId: string, text: string, assigneeId?: string | null, due?: string | null) {
  const { data, error } = await createClient().rpc("live_doc_task", { p_doc: docId, p_text: text, p_assignee: assigneeId ?? null, p_due: due ?? null });
  if (error || !data) fail(error, "Could not create the task");
  return data as string;
}

export async function docSnapshot(docId: string, label?: string) {
  const { error } = await createClient().rpc("live_doc_snapshot", { p_doc: docId, p_label: label ?? null });
  if (error) fail(error, "Could not save a version");
}

export async function toKnowledge(input: { title: string; body: string; kind?: string; roomId?: string | null; recordingId?: string | null; departmentId?: string | null }) {
  const { data, error } = await createClient().rpc("live_to_knowledge", { p_title: input.title, p_body: input.body, p_kind: input.kind ?? "guide", p_room: input.roomId ?? null, p_recording: input.recordingId ?? null, p_department: input.departmentId ?? null });
  if (error || !data) fail(error, "Could not create the knowledge draft");
  return data as string;
}

export async function fetchRoom(roomId: string) {
  const { data } = await createClient().from("live_rooms").select("*").eq("id", roomId).maybeSingle();
  return (data as unknown as LiveRoom) ?? null;
}
