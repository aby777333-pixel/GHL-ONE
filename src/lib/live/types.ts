/**
 * GHL LIVE — shared contract for rooms, boards, recordings and live docs.
 * Media runs on LiveKit; state lives in Supabase (migration 0021_live).
 * Keep this file dependency-free (no React, no Supabase imports) so both server and client code can use it.
 */

export type RoomKind =
  | "huddle" | "call" | "meeting" | "project_room" | "department_room" | "team_room" | "war_room" | "training"
  | "interview" | "virtual_office" | "temp" | "townhall" | "breakout" | "review" | "management" | "standup";

export type RoomStatus = "open" | "live" | "ended" | "archived";
export type RoomVisibility = "members" | "department" | "company" | "invite_only";
export type ParticipantRole = "host" | "cohost" | "presenter" | "participant" | "waiting" | "removed";
export type LiveState = "in_call" | "in_meeting" | "presenting" | "recording";

export const ROOM_KIND_LABEL: Record<RoomKind, string> = {
  huddle: "Huddle", call: "Call", meeting: "Meeting", project_room: "Project room", department_room: "Department room",
  team_room: "Team room", war_room: "War room", training: "Training room", interview: "Interview room",
  virtual_office: "Virtual office", temp: "Collaboration room", townhall: "Town hall", breakout: "Breakout",
  review: "Review room", management: "Management war room", standup: "Daily huddle",
};

export type RoomSettings = {
  allow_screen_share?: boolean;
  allow_recording?: boolean;
  allow_whiteboard?: boolean;
  guests_allowed?: boolean;
  watermark?: boolean;
  presenter_only?: boolean;      // town hall: only host/co-hosts/presenters publish
  audio_only_default?: boolean;
  agenda?: string[];
  goals?: string;
  pre_reading?: { title: string; link: string }[];
  timer_minutes?: number;
  [k: string]: unknown;
};

export type LiveRoom = {
  id: string;
  org_id: string;
  kind: RoomKind;
  title: string;
  host_id: string | null;
  co_hosts: string[];
  channel_id: string | null;
  project_id: string | null;
  task_id: string | null;
  department_id: string | null;
  team_id: string | null;
  help_request_id: string | null;
  incident_id: string | null;
  meeting_id: string | null;
  parent_room_id: string | null;
  status: RoomStatus;
  persistent: boolean;
  visibility: RoomVisibility;
  locked: boolean;
  waiting_room: boolean;
  confidential: boolean;
  settings: RoomSettings;
  livekit_room: string | null;
  started_at: string;
  ended_at: string | null;
  last_active_at: string;
  peak_participants: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LiveParticipant = {
  room_id: string;
  user_id: string;
  role: ParticipantRole;
  joined_at: string;
  left_at: string | null;
  hand_raised: boolean;
  device: string | null;
  invited_by: string | null;
};

export type LiveInvite = {
  id: string;
  org_id: string;
  room_id: string;
  from_user: string;
  to_user: string;
  kind: "ring" | "knock" | "invite" | "request_share";
  status: "pending" | "accepted" | "declined" | "missed" | "cancelled";
  message: string | null;
  created_at: string;
  responded_at: string | null;
};

export type LiveEvent = {
  id: number;
  org_id: string;
  room_id: string;
  kind: string;
  actor_id: string | null;
  actor_name: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export type TranscriptSegment = {
  id?: number;
  room_id?: string | null;
  recording_id?: string | null;
  speaker_id: string | null;
  speaker_name: string | null;
  lang: string;
  text: string;
  offset_ms: number | null;
  created_at?: string;
};

export type LivePoll = {
  id: string;
  org_id: string;
  room_id: string | null;
  board_id: string | null;
  question: string;
  options: { id: string; label: string }[];
  votes: Record<string, string[]>;
  multi: boolean;
  anonymous: boolean;
  status: "open" | "closed";
  created_by: string | null;
  created_at: string;
  closed_at: string | null;
};

export type LiveQuestion = {
  id: string;
  org_id: string;
  room_id: string;
  body: string;
  author_id: string | null;
  anonymous: boolean;
  upvotes: string[];
  answered: boolean;
  answer: string | null;
  answered_by: string | null;
  created_at: string;
};

/** What join_live_room() returns. */
export type JoinResult =
  | { ok: true; role: ParticipantRole; livekit_room: string; confidential: boolean; settings: RoomSettings; title: string; kind: RoomKind }
  | { ok: false; reason: "ended" | "no_access" | "waiting" };

/** Context an entity page passes when starting collaboration from it. */
export type CollabContext = {
  channelId?: string | null;
  projectId?: string | null;
  taskId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
  helpId?: string | null;
  incidentId?: string | null;
  meetingId?: string | null;
  personId?: string | null;        // 1:1 call / knock target
  title?: string | null;
  invitees?: string[];
};

export type CollabAction =
  | "voice" | "video" | "huddle" | "screen" | "whiteboard" | "record" | "meeting" | "doc" | "group" | "knock" | "war_room" | "video_note";

/** Stage modes inside a room (one-button switching, section 201). */
export type StageMode = "video" | "screen" | "whiteboard" | "doc" | "notes";

/** Data-channel messages exchanged inside a LiveKit room (ephemeral; persisted parts go to Supabase separately). */
export type LiveDataMessage =
  | { t: "pointer"; x: number; y: number; on: boolean }                                   // remote pointer over the shared screen (normalised 0..1)
  | { t: "annot"; id: string; kind: "pen" | "arrow" | "circle" | "rect" | "text" | "highlight"; pts: number[]; color: string; text?: string; ttl?: number }
  | { t: "annot_clear"; id?: string }
  | { t: "reaction"; emoji: string }
  | { t: "hand"; up: boolean }
  | { t: "caption"; text: string; final: boolean; lang: string; offset_ms: number }
  | { t: "mode"; mode: StageMode; boardId?: string | null; docId?: string | null; follow?: boolean }
  | { t: "follow"; on: boolean }                                                            // presenter asks everyone to follow their stage mode
  | { t: "timer"; ends_at: number | null; label?: string }
  | { t: "notes"; body: string; version: number }
  | { t: "poll"; pollId: string; action: "open" | "close" | "vote" }
  | { t: "move_to"; roomId: string }                                                        // host moves a participant into/out of a breakout
  | { t: "request_share"; from: string }
  | { t: "record"; on: boolean; by: string }                                                // recording indicator for everyone
  | { t: "quality"; level: "excellent" | "good" | "weak" }
  | { t: "ai"; kind: "decision" | "task"; text: string; by: string }                        // AI detector suggestions shared with the room
  | { t: "board_op"; boardId: string; op: BoardOp };

/* ------------------------------------------------------------------ recordings */
export type RecordingKind = "screen" | "screen_voice" | "screen_cam" | "camera" | "video_note" | "meeting" | "async_update";
export type RecordingAccess = "only_me" | "selected" | "team" | "department" | "project" | "company";

export type RecordingSummary = {
  summary: string;
  key_points: string[];
  tasks: { title: string; assignee_name?: string | null; due?: string | null }[];
  questions: string[];
  decisions: string[];
  segments?: { from_sec: number; to_sec: number; why: string }[];     // "watch only what matters"
};

export type RecordingChapter = { t: number; title: string };

export type LiveRecording = {
  id: string;
  org_id: string;
  room_id: string | null;
  owner_id: string;
  kind: RecordingKind;
  title: string;
  description: string | null;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  duration_sec: number;
  thumbnail_path: string | null;
  transcript: string | null;
  transcript_segments: { t: number; text: string; speaker?: string | null }[];
  summary: RecordingSummary | null;
  chapters: RecordingChapter[];
  access: RecordingAccess;
  access_ids: string[];
  project_id: string | null;
  task_id: string | null;
  channel_id: string | null;
  help_request_id: string | null;
  knowledge_id: string | null;
  department_id: string | null;
  expires_at: string | null;
  downloadable: boolean;
  status: "uploading" | "ready" | "failed" | "expired";
  views: number;
  created_at: string;
  updated_at: string;
};

export const RECORDING_BUCKET = "live";
export const RECORDING_MAX_BYTES = 500 * 1024 * 1024;

/* ------------------------------------------------------------------ boards (GHL BOARD) */
export type BoardKind = "personal" | "team" | "department" | "project" | "room" | "shared";
export type BoardVisibility = "private" | "members" | "department" | "company";

export type BoardElementType =
  | "pen" | "highlighter" | "sticky" | "text" | "rect" | "ellipse" | "diamond" | "arrow" | "connector" | "line"
  | "image" | "file" | "icon" | "table" | "frame" | "comment";

export type BoardElement = {
  id: string;
  type: BoardElementType;
  x: number;
  y: number;
  w?: number;
  h?: number;
  rotation?: number;
  /** pen/highlighter/arrow/line: flat [x0,y0,x1,y1,...] relative to (x,y) */
  points?: number[];
  text?: string;
  color?: string;          // stroke / text colour token or hex
  fill?: string;           // sticky/shape fill
  fontSize?: number;
  strokeWidth?: number;
  /** connector endpoints (element ids) */
  from?: string;
  to?: string;
  /** image/file */
  src?: string;            // storage path in bucket 'live' (boards/<boardId>/…)
  name?: string;
  /** icon name (lucide) */
  icon?: string;
  /** table cells */
  rows?: string[][];
  /** frame: title; sticky: author */
  title?: string;
  author?: string | null;
  authorId?: string | null;
  votes?: string[];        // user ids who voted on this element
  locked?: boolean;
  z?: number;
  taskId?: string | null;  // when converted to a task
  meta?: Record<string, unknown>;
};

export type BoardPage = { id: string; title: string; elements: BoardElement[] };
export type BoardDoc = { pages: BoardPage[]; background?: "grid" | "dots" | "plain" };

/** Board operations broadcast over Supabase Realtime (`board:<id>`) and LiveKit data (when inside a room). */
export type BoardOp =
  | { op: "add"; pageId: string; el: BoardElement }
  | { op: "update"; pageId: string; id: string; patch: Partial<BoardElement> }
  | { op: "remove"; pageId: string; ids: string[] }
  | { op: "reorder"; pageId: string; ids: string[]; z: number }
  | { op: "page_add"; page: BoardPage }
  | { op: "page_remove"; pageId: string }
  | { op: "page_rename"; pageId: string; title: string }
  | { op: "replace"; doc: BoardDoc }
  | { op: "cursor"; x: number; y: number; pageId: string; name: string; color: string; userId: string; laser?: boolean }
  | { op: "follow"; pageId: string; view: { x: number; y: number; zoom: number }; userId: string }
  | { op: "lock"; locked: boolean };

export type BoardTemplateKey =
  | "blank" | "brainstorm" | "project_planning" | "flowchart" | "org_chart" | "customer_journey" | "mind_map" | "process_map"
  | "sprint_planning" | "retrospective" | "incident_analysis"
  | "architecture_diagram" | "incident_timeline" | "api_flow"
  | "pitch_planning" | "account_planning" | "objection_map"
  | "root_cause_analysis" | "moodboard" | "user_flow" | "onboarding_journey";

export const BOARD_TEMPLATES: { key: BoardTemplateKey; label: string; group: "General" | "IT" | "Sales" | "Support" | "Design" | "HR"; hint: string }[] = [
  { key: "blank", label: "Blank canvas", group: "General", hint: "Start from nothing" },
  { key: "brainstorm", label: "Brainstorm", group: "General", hint: "Ideas, clusters, votes" },
  { key: "project_planning", label: "Project planning", group: "General", hint: "Goals → milestones → tasks → owners" },
  { key: "flowchart", label: "Flowchart", group: "General", hint: "Start, steps, decisions, end" },
  { key: "org_chart", label: "Org chart", group: "General", hint: "Who reports to whom" },
  { key: "customer_journey", label: "Customer journey", group: "General", hint: "Stages, touchpoints, pains, gains" },
  { key: "mind_map", label: "Mind map", group: "General", hint: "Central topic and branches" },
  { key: "process_map", label: "Process map", group: "General", hint: "Swimlanes per department" },
  { key: "sprint_planning", label: "Sprint planning", group: "General", hint: "Backlog → this sprint → done" },
  { key: "retrospective", label: "Retrospective", group: "General", hint: "Went well / to improve / actions" },
  { key: "incident_analysis", label: "Incident analysis", group: "General", hint: "What happened, impact, cause, fix" },
  { key: "architecture_diagram", label: "Architecture diagram", group: "IT", hint: "Services, data stores, flows" },
  { key: "incident_timeline", label: "Incident timeline", group: "IT", hint: "Detected → mitigated → resolved" },
  { key: "api_flow", label: "API flow", group: "IT", hint: "Client → API → services → response" },
  { key: "pitch_planning", label: "Pitch planning", group: "Sales", hint: "Audience, pain, promise, proof, ask" },
  { key: "account_planning", label: "Account planning", group: "Sales", hint: "Stakeholders, goals, risks, next steps" },
  { key: "objection_map", label: "Objection map", group: "Sales", hint: "Objection → response → proof" },
  { key: "root_cause_analysis", label: "Root cause analysis", group: "Support", hint: "5 whys / fishbone" },
  { key: "moodboard", label: "Moodboard", group: "Design", hint: "References, colours, type, notes" },
  { key: "user_flow", label: "User flow", group: "Design", hint: "Screens and transitions" },
  { key: "onboarding_journey", label: "Onboarding journey", group: "HR", hint: "Day 1 → week 1 → month 1 → 90 days" },
];

/* ------------------------------------------------------------------ live docs */
export type LiveDocKind = "doc" | "meeting_notes" | "agenda" | "sop" | "handover" | "breakout_notes";

export type LiveDoc = {
  id: string;
  org_id: string;
  title: string;
  kind: LiveDocKind;
  body: string;
  room_id: string | null;
  meeting_id: string | null;
  project_id: string | null;
  task_id: string | null;
  department_id: string | null;
  owner_id: string | null;
  version: number;
  visibility: BoardVisibility;
  member_ids: string[];
  suggestion_mode: boolean;
  archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Realtime channel names (Supabase) */
export const liveChannelName = (roomId: string) => `live:${roomId}`;
export const boardChannelName = (boardId: string) => `board:${boardId}`;
export const docChannelName = (docId: string) => `doc:${docId}`;
export const inviteChannelName = (userId: string) => `live-invites:${userId}`;

/** Storage paths (bucket 'live') */
export const recordingPath = (orgId: string, ownerId: string, ext: string) => `${orgId}/recordings/${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
export const boardAssetPath = (orgId: string, boardId: string, name: string) => `${orgId}/boards/${boardId}/${Date.now()}-${name.replace(/[^\w.\-]+/g, "_")}`;
export const roomCapturePath = (orgId: string, roomId: string) => `${orgId}/rooms/${roomId}/${Date.now()}.jpg`;

export const CAPTION_LANGS: { code: string; label: string }[] = [
  { code: "en-IN", label: "English" },
  { code: "ta-IN", label: "Tamil" },
  { code: "hi-IN", label: "Hindi" },
  { code: "te-IN", label: "Telugu" },
  { code: "ml-IN", label: "Malayalam" },
  { code: "kn-IN", label: "Kannada" },
];

export type QualityLevel = "excellent" | "good" | "weak";
export type BandwidthMode = "normal" | "low" | "audio_only" | "saver";

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
