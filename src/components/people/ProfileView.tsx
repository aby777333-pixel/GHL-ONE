"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail, Phone, Clock, Globe, CalendarDays, Pencil, Video, PhoneCall, CalendarPlus, ListPlus, Briefcase, FolderKanban, Users, Palmtree, ExternalLink, ChevronRight, BellRing, Rss, ShieldCheck, MessageSquareHeart, Trophy, MessagesSquare } from "lucide-react";
import { Avatar, Button, Card, CardHeader, EmptyState, Pill, Progress } from "@/components/ui";
import { TaskRow, type TaskRowData } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, fmtDate, isAdminRole, isManagerPlus, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, type Profile, type ProjectStatus } from "@/lib/utils";
import { PRESENCE_LABEL, PRESENCE_TONE } from "./types";
import { ChatButton, RolePill } from "./PeopleBits";
import { EntityLive } from "@/components/live/EntityLive";
import { ProfileEditor } from "./ProfileEditor";
import { NotificationSettings } from "./NotificationSettings";
import { PushOptIn } from "@/components/notifications/PushOptIn";
import { CalendarFeedCard } from "@/components/calendar/CalendarFeedCard";
import { PrivacyCenter } from "./PrivacyCenter";
import { ProfileSkills } from "@/components/growth/ProfileSkills";
import { CareerCard } from "@/components/growth/Career";
import { ProfileRecognition } from "@/components/growth/Recognition";
import { FeedbackModal } from "@/components/growth/FeedbackModal";
import { KudosModal } from "@/components/growth/KudosModal";
import { EmploymentCard, MyAssetsCard, MyDocumentsCard, useIsHr } from "./EmployeeSelfService";
import { DelegationCard } from "./DelegationCard";
import { CapacityCalendar } from "./CapacityCalendar";
import { WhatIfAbsent } from "./WhatIfAbsent";
import { AllocationsCard } from "./AllocationsCard";

export type ProfileData = Profile & {
  manager: { id: string; full_name: string; avatar_url: string | null; designation: string | null } | null;
  department: { id: string; name: string; color: string } | null;
  team: { id: string; name: string } | null;
};

type ProjectItem = { role: string; id: string; name: string; status: string; progress: number; due_date: string | null };
type Report = { id: string; full_name: string; avatar_url: string | null; designation: string | null; presence: Profile["presence"]; department_id: string | null };
type Leave = { id: string; starts_on: string; ends_on: string; kind: string; note: string | null; status: string };

export function ProfileView({ person, tasks, projects, reports, leaves, edit, focus, fromNav }: { person: ProfileData; tasks: TaskRowData[]; projects: ProjectItem[]; reports: Report[]; leaves: Leave[]; edit?: boolean; focus?: string | null; fromNav?: boolean }) {
  const router = useRouter();
  /**
   * Notifications deep-link into a section of this page (a mentorship request arrives as
   * `?tab=mentoring`). The profile has no tabs — everything is one long column — so without
   * this the person landed at the top and concluded the request was missing. Scroll the
   * matching card into view instead. `#career` in the URL is handled by the browser already;
   * this covers the query-parameter form, including notifications sent before the link was fixed.
   */
  React.useEffect(() => {
    if (focus !== "mentoring" && focus !== "career") return;
    const t = setTimeout(() => document.getElementById("career")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    return () => clearTimeout(t);
  }, [focus]);
  const { profile: me } = useSession();
  const self = me.id === person.id;
  const canEdit = self || isManagerPlus(me.role) || isAdminRole(me.role);
  const [editing, setEditing] = React.useState(!!edit && canEdit);
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  const [kudosOpen, setKudosOpen] = React.useState(false);
  const iManage = !self && (person.manager_id === me.id || person.secondary_manager_id === me.id);
  // Employee self-service (assets, documents, employment): shown to the person, HR, and their manager.
  const isHr = useIsHr();
  const managerOf = person.manager_id === me.id || person.secondary_manager_id === me.id;
  const hrView = self || !!isHr || managerOf;

  const meetHref = `/meetings?new=1&with=${person.id}`;

  return (
    <div className="page">
      {/*
          "← People" is only true when you actually came from the directory. Opened from the avatar
          menu in the header it claimed a path the user never took, so the label follows the entry
          point: the shell appends `?from=nav`, and that renders a plain Back instead.
      */}
      {fromNav ? (
        <button type="button" onClick={() => router.back()} className="inline-flex items-center gap-1 text-sm text-muted hover:text-[var(--fg)] mb-[var(--s3)]">
          <ArrowLeft size={14} /> Back
        </button>
      ) : (
        <Link href="/people" className="inline-flex items-center gap-1 text-sm text-muted hover:text-[var(--fg)] mb-[var(--s3)]"><ArrowLeft size={14} /> People</Link>
      )}

      {/* Header */}
      <Card className="p-[var(--s4)] mb-[var(--s4)] overflow-hidden relative">
        <div className="absolute inset-x-0 top-0 h-[89px] opacity-90" style={{ background: `linear-gradient(135deg, ${person.department?.color || "var(--brand)"} 0%, color-mix(in oklab, ${person.department?.color || "var(--brand)"} 40%, var(--bg-elev)) 100%)` }} />
        {/*
          Only the avatar may overlap the banner. The banner is painted in the department's own
          colour and Management's is #0f172a — near-black — while the name inherits var(--fg),
          which is also near-black in light mode, so bottom-aligning the text beside the avatar
          rendered the name invisible for anyone in a dark-coloured department. Every piece of
          text now starts below the banner, which is correct for all 16 department colours.
        */}
        <div className="relative pt-[34px]">
          <span className="rounded-full ring-4 ring-[var(--bg-elev)] w-fit inline-block"><Avatar name={person.full_name} src={person.avatar_url} size={89} presence={person.presence} /></span>
        </div>
        {/*
          The action cluster (Chat · Call · Video · Schedule · Assign · Recognise · Feedback) is wide.
          Side by side from `sm` it took the row and squeezed this column, so the name arrived
          cropped ("Test …") and the designation sat under the buttons at laptop widths. The two
          columns now stack until `lg`, both can shrink (`min-w-0` on each, or the buttons' own
          min-content width becomes a floor), and the name wraps instead of truncating.
        */}
        <div className="relative flex flex-col lg:flex-row lg:items-end gap-[var(--s3)] mt-[var(--s3)]">
          <div className="min-w-0 lg:flex-1 lg:pb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="h1 break-words min-w-0">{person.full_name}</h1>
              <RolePill role={person.role} />
              {person.is_external && <Pill tone="tone-muted">External</Pill>}
              {!person.is_active && <Pill tone="tone-warn">Inactive</Pill>}
            </div>
            <div className="text-sm text-2 mt-0.5">{person.designation || "—"}{person.department ? <> · <Link href="/departments" className="hover:underline">{person.department.name}</Link></> : null}{person.team ? ` · ${person.team.name}` : ""}</div>
            <div className="flex items-center gap-2 flex-wrap mt-2 text-xs">
              <Pill tone={PRESENCE_TONE[person.presence]}>{PRESENCE_LABEL[person.presence]}</Pill>
              {person.status_text && <span className="text-muted truncate max-w-[320px]">“{person.status_text}”</span>}
              {person.manager && (
                <Link href={`/people/${person.manager.id}`} className="pill tone-neutral hover:bg-[var(--line)]">
                  <Avatar name={person.manager.full_name} src={person.manager.avatar_url} size={14} /> Reports to {person.manager.full_name}
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap min-w-0 lg:justify-end lg:pb-1">
            {!self && <ChatButton userId={person.id} variant="primary" size="md" />}
            {!self && <EntityLive ctx={{ personId: person.id, title: `Call with ${person.full_name}` }} include={["knock"]} label="Call · Video · Knock" />}
            {!self && (
              <>
                <Link href={meetHref} className="btn btn-secondary" title="Call"><PhoneCall size={15} /><span className="hidden sm:inline">Call</span></Link>
                <Link href={meetHref} className="btn btn-secondary" title="Video"><Video size={15} /><span className="hidden sm:inline">Video</span></Link>
                <Link href={meetHref} className="btn btn-secondary"><CalendarPlus size={15} /><span className="hidden sm:inline">Schedule</span></Link>
                <Link href={`/tasks?new=1&assignee=${person.id}`} className="btn btn-secondary"><ListPlus size={15} /><span className="hidden sm:inline">Assign task</span></Link>
                <Button variant="secondary" onClick={() => setKudosOpen(true)} title="Recognise"><Trophy size={15} /><span className="hidden sm:inline">Recognise</span></Button>
                <Button variant="secondary" onClick={() => setFeedbackOpen(true)} title="Give feedback"><MessageSquareHeart size={15} /><span className="hidden sm:inline">Give feedback</span></Button>
                {iManage && <Link href={`/one-on-ones?new=1&with=${person.id}`} className="btn btn-secondary" title="Schedule 1-on-1"><MessagesSquare size={15} /><span className="hidden sm:inline">Schedule 1-on-1</span></Link>}
              </>
            )}
            {canEdit && !editing && <Button variant={self ? "primary" : "ghost"} onClick={() => setEditing(true)}><Pencil size={15} /> {self ? "Edit my profile" : "Edit"}</Button>}
          </div>
        </div>
      </Card>

      {editing ? (
        <Card className="p-[var(--s4)] mb-[var(--s4)]">
          <CardHeader title={self ? "My profile" : `Edit ${person.full_name}`} subtitle={self && !isAdminRole(me.role) ? "Role, department and manager are managed by administrators." : undefined} className="!px-0 !pt-0" />
          <ProfileEditor person={person} onDone={() => { setEditing(false); router.replace(`/people/${person.id}`); }} />
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-[var(--s4)] items-start">
        <div className="space-y-[var(--s4)] min-w-0">
          {/* Current work */}
          <Card>
            <CardHeader title="Current work" subtitle={tasks.length ? `${tasks.length} open task${tasks.length > 1 ? "s" : ""}` : "Nothing assigned right now"} action={<Briefcase size={15} className="text-muted" />} />
            {tasks.length === 0 ? (
              <EmptyState title="No open tasks" hint={self ? "Enjoy the calm — or capture what is next." : "Tasks you are allowed to see will appear here."} className="py-[var(--s4)]" action={!self ? <Link href={`/tasks?new=1&assignee=${person.id}`} className="btn btn-secondary btn-sm"><ListPlus size={14} /> Assign a task</Link> : undefined} />
            ) : (
              <div className="px-1 pb-1">{tasks.map((t) => <TaskRow key={t.id} task={t} />)}</div>
            )}
          </Card>

          {/* Projects */}
          <Card>
            <CardHeader title="Projects" subtitle={projects.length ? `${projects.length} project${projects.length > 1 ? "s" : ""}` : undefined} action={<FolderKanban size={15} className="text-muted" />} />
            {projects.length === 0 ? (
              <EmptyState title="Not on any project" className="py-[var(--s4)]" />
            ) : (
              <div className="divide-y border-t">
                {projects.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 px-[var(--s4)] py-2.5 row-hover">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <Progress value={p.progress} className="max-w-[160px]" height={4} />
                        <span className="text-[11px] text-muted num">{p.progress}%</span>
                        {p.due_date && <span className="text-[11px] text-muted">· due {fmtDate(p.due_date)}</span>}
                      </div>
                    </div>
                    <Pill tone={PROJECT_STATUS_TONE[p.status as ProjectStatus] || "tone-neutral"}>{PROJECT_STATUS_LABEL[p.status as ProjectStatus] || p.status}</Pill>
                    <span className="text-[11px] text-muted capitalize hidden sm:inline">{p.role}</span>
                    <ChevronRight size={14} className="text-muted" />
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Reports */}
          <Card>
            <CardHeader title="Direct reports" subtitle={reports.length ? `${reports.length} ${reports.length > 1 ? "people" : "person"}` : undefined} action={<Users size={15} className="text-muted" />} />
            {reports.length === 0 ? (
              <EmptyState title="No direct reports" className="py-[var(--s4)]" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-[var(--s3)] pb-[var(--s3)]">
                {reports.map((r) => (
                  <Link key={r.id} href={`/people/${r.id}`} className="flex items-center gap-2.5 p-2 rounded-[var(--radius-sm)] row-hover border">
                    <Avatar name={r.full_name} src={r.avatar_url} size={32} presence={r.presence} />
                    <div className="min-w-0"><div className="text-sm truncate">{r.full_name}</div><div className="text-[11px] text-muted truncate">{r.designation || "—"}</div></div>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Delegations — me, HR, or my manager */}
          {hrView && <div id="delegation" className="scroll-mt-24"><DelegationCard userId={person.id} self={self} canManage={!!isHr || managerOf || isAdminRole(me.role)} /></div>}

          {/* Org intelligence: what breaks if away, allocations (manager / HR) */}
          {(self || managerOf || isManagerPlus(me.role)) && <WhatIfAbsent userId={person.id} title={self ? "What breaks if I am away?" : "What breaks if they are away?"} />}
          {(managerOf || !!isHr || isManagerPlus(me.role)) && <AllocationsCard userId={person.id} canEdit={managerOf || !!isHr || isManagerPlus(me.role)} />}

          {/* Employee self-service — me, HR, or my manager (RLS filters what each can actually see) */}
          {hrView && <MyAssetsCard userId={person.id} self={self} />}
          {(self || !!isHr) && <MyDocumentsCard userId={person.id} self={self} name={person.full_name} />}

          {/* Growth: career, feedback & recognition */}
          <CareerCard person={person} self={self} canRequestMentor={self || iManage} />
          <ProfileRecognition userId={person.id} self={self} onGiveFeedback={() => setFeedbackOpen(true)} onRecognise={!self ? () => setKudosOpen(true) : undefined} />

          {/* My settings — only on my own profile */}
          {self && (
            <>
              <Card id="notifications" className="scroll-mt-24">
                <CardHeader title="Notifications & quiet hours" subtitle="How and when GHL ONE reaches you. Critical items always get through." action={<BellRing size={15} className="text-muted" />} />
                <div className="px-[var(--s4)] pb-[var(--s4)] space-y-[var(--s4)]">
                  <PushOptIn />
                  <NotificationSettings />
                </div>
              </Card>
              <Card id="calendar" className="scroll-mt-24">
                <CardHeader title="Calendar subscription" subtitle="See your GHL ONE schedule inside Google, Outlook or Apple Calendar." action={<Rss size={15} className="text-muted" />} />
                <div className="px-[var(--s4)] pb-[var(--s4)]"><CalendarFeedCard /></div>
              </Card>
              <Card id="privacy" className="scroll-mt-24">
                <CardHeader title="Privacy Center" subtitle="Exactly what GHL ONE records about you, who can see it, and your private record." action={<ShieldCheck size={15} className="text-muted" />} />
                <div className="px-[var(--s4)] pb-[var(--s4)]"><PrivacyCenter /></div>
              </Card>
            </>
          )}
        </div>

        <div className="space-y-[var(--s4)] min-w-0">
          {/* Contact */}
          <Card>
            <CardHeader title="Contact" />
            <div className="px-[var(--s4)] pb-[var(--s4)] space-y-2 text-sm">
              <a href={`mailto:${person.email}`} className="flex items-center gap-2 hover:underline min-w-0"><Mail size={14} className="text-muted shrink-0" /><span className="truncate">{person.email}</span><ExternalLink size={11} className="text-muted" /></a>
              {person.phone ? <a href={`tel:${person.phone}`} className="flex items-center gap-2 hover:underline"><Phone size={14} className="text-muted shrink-0" />{person.phone}</a> : <div className="flex items-center gap-2 text-muted"><Phone size={14} /> No phone</div>}
              <div className="flex items-center gap-2"><Clock size={14} className="text-muted shrink-0" />{person.working_hours || "—"}</div>
              <div className="flex items-center gap-2"><Globe size={14} className="text-muted shrink-0" />{person.timezone || "—"}</div>
              <div className="flex items-center gap-2"><CalendarDays size={14} className="text-muted shrink-0" />{person.joined_at ? `Joined ${fmtDate(person.joined_at)}` : "Join date unknown"}</div>
              {person.last_seen_at && <div className="text-[11px] text-muted pl-6">Last seen {ago(person.last_seen_at)}</div>}
            </div>
          </Card>

          {/* Employment record — read-only here; HR edits it in People Ops */}
          {hrView && <EmploymentCard person={person} />}

          {/* Skills */}
          <Card>
            <CardHeader title="Skills" subtitle="Endorsed by colleagues · verified when a manager or HR vouches" />
            <div className="px-[var(--s4)] pb-[var(--s4)]">
              <ProfileSkills key={person.skills.join("|")} person={person} self={self} />
            </div>
          </Card>

          {/* Capacity: the person, their manager and leadership */}
          {(self || managerOf || isManagerPlus(me.role)) && <CapacityCalendar userId={person.id} />}

          {/* Availability */}
          <Card>
            <CardHeader title="Availability" action={<Palmtree size={15} className="text-muted" />} />
            <div className="px-[var(--s4)] pb-[var(--s4)]">
              {leaves.length === 0 ? (
                <div className="text-sm text-muted">No upcoming approved leave.</div>
              ) : (
                <ul className="space-y-2">
                  {leaves.map((l) => (
                    <li key={l.id} className="text-sm flex items-start gap-2">
                      <Pill tone="tone-warn" className="capitalize shrink-0">{l.kind}</Pill>
                      <div className="min-w-0"><div className="num">{fmtDate(l.starts_on)}{l.ends_on !== l.starts_on ? ` → ${fmtDate(l.ends_on)}` : ""}</div>{l.note && <div className="text-xs text-muted truncate">{l.note}</div>}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>

      {feedbackOpen && <FeedbackModal toUserId={person.id} isManagerOfRecipient={iManage} onClose={() => setFeedbackOpen(false)} onDone={() => router.refresh()} />}
      {kudosOpen && !self && <KudosModal toUserId={person.id} onClose={() => setKudosOpen(false)} onDone={() => router.refresh()} />}
    </div>
  );
}
