"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail, Phone, Clock, Globe, CalendarDays, Pencil, Video, PhoneCall, CalendarPlus, ListPlus, Briefcase, FolderKanban, Users, Palmtree, ExternalLink, ChevronRight } from "lucide-react";
import { Avatar, Button, Card, CardHeader, EmptyState, Pill, Progress } from "@/components/ui";
import { TaskRow, type TaskRowData } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { ago, fmtDate, isAdminRole, isManagerPlus, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, type Profile, type ProjectStatus } from "@/lib/utils";
import { PRESENCE_LABEL, PRESENCE_TONE } from "./types";
import { ChatButton, RolePill } from "./PeopleBits";
import { ProfileEditor } from "./ProfileEditor";

export type ProfileData = Profile & {
  manager: { id: string; full_name: string; avatar_url: string | null; designation: string | null } | null;
  department: { id: string; name: string; color: string } | null;
  team: { id: string; name: string } | null;
};

type ProjectItem = { role: string; id: string; name: string; status: string; progress: number; due_date: string | null };
type Report = { id: string; full_name: string; avatar_url: string | null; designation: string | null; presence: Profile["presence"]; department_id: string | null };
type Leave = { id: string; starts_on: string; ends_on: string; kind: string; note: string | null; status: string };

export function ProfileView({ person, tasks, projects, reports, leaves, edit }: { person: ProfileData; tasks: TaskRowData[]; projects: ProjectItem[]; reports: Report[]; leaves: Leave[]; edit?: boolean }) {
  const router = useRouter();
  const { profile: me } = useSession();
  const self = me.id === person.id;
  const canEdit = self || isManagerPlus(me.role) || isAdminRole(me.role);
  const [editing, setEditing] = React.useState(!!edit && canEdit);

  const meetHref = `/meetings?new=1&with=${person.id}`;

  return (
    <div className="page">
      <Link href="/people" className="inline-flex items-center gap-1 text-sm text-muted hover:text-[var(--fg)] mb-[var(--s3)]"><ArrowLeft size={14} /> People</Link>

      {/* Header */}
      <Card className="p-[var(--s4)] mb-[var(--s4)] overflow-hidden relative">
        <div className="absolute inset-x-0 top-0 h-[89px] opacity-90" style={{ background: `linear-gradient(135deg, ${person.department?.color || "var(--brand)"} 0%, color-mix(in oklab, ${person.department?.color || "var(--brand)"} 40%, var(--bg-elev)) 100%)` }} />
        <div className="relative flex flex-col sm:flex-row sm:items-end gap-[var(--s3)] pt-[34px]">
          <span className="rounded-full ring-4 ring-[var(--bg-elev)] w-fit"><Avatar name={person.full_name} src={person.avatar_url} size={89} presence={person.presence} /></span>
          <div className="min-w-0 flex-1 sm:pb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="h1 truncate">{person.full_name}</h1>
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
          <div className="flex items-center gap-2 flex-wrap sm:pb-1">
            {!self && <ChatButton userId={person.id} variant="primary" size="md" />}
            {!self && (
              <>
                <Link href={meetHref} className="btn btn-secondary" title="Call"><PhoneCall size={15} /><span className="hidden sm:inline">Call</span></Link>
                <Link href={meetHref} className="btn btn-secondary" title="Video"><Video size={15} /><span className="hidden sm:inline">Video</span></Link>
                <Link href={meetHref} className="btn btn-secondary"><CalendarPlus size={15} /><span className="hidden sm:inline">Schedule</span></Link>
                <Link href={`/tasks?new=1&assignee=${person.id}`} className="btn btn-secondary"><ListPlus size={15} /><span className="hidden sm:inline">Assign task</span></Link>
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

          {/* Skills */}
          <Card>
            <CardHeader title="Skills" />
            <div className="px-[var(--s4)] pb-[var(--s4)]">
              {person.skills.length ? <div className="flex flex-wrap gap-1.5">{person.skills.map((s) => <Link key={s} href={`/people?q=${encodeURIComponent(s)}`} className="pill tone-neutral hover:bg-[var(--line)]">{s}</Link>)}</div> : <div className="text-sm text-muted">No skills listed{self ? " — add some so colleagues can find you." : "."}</div>}
            </div>
          </Card>

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
    </div>
  );
}
