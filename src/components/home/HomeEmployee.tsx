"use client";

import { PageHeader } from "@/components/ui";
import { useSession } from "@/components/providers/SessionProvider";
import { fmtDate, greeting } from "@/lib/utils";
import { AnnouncementsCard, ApprovalsCard, MeetingsCard, MessagesCard, ProjectsCard, TodayCard, personalBrief, type Personal } from "./shared";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { TaskRow } from "@/components/tasks/TaskBits";
import { BriefCard } from "@/components/ai/BriefCard";
import { ClockCard } from "@/components/attendance";
import { BuddyHomeCard } from "@/components/ai/BuddyHomeCard";
import { KudosCard } from "@/components/growth/Recognition";

export function HomeEmployee({ personal }: { personal: Personal }) {
  const { profile } = useSession();
  return (
    <div className="page">
      <PageHeader eyebrow={fmtDate(new Date())} title={greeting(profile.full_name)} subtitle={personalBrief(personal)} />
      <div className="grid lg:grid-cols-3 gap-[var(--s3)] stagger">
        <div className="lg:col-span-2 space-y-[var(--s3)]">
          <ClockCard />
          <BuddyHomeCard />
          <BriefCard variant="employee" />
          <TodayCard p={personal} />
          {personal.waitingOnMe.length > 0 && (
            <Card>
              <CardHeader title="Waiting on you" subtitle="Colleagues are blocked until you act" />
              <div className="px-2 pb-2">{personal.waitingOnMe.map((t) => <TaskRow key={t.id} task={t} />)}</div>
            </Card>
          )}
          <ProjectsCard items={personal.projects} title="My projects" />
        </div>
        <div className="space-y-[var(--s3)]">
          <MessagesCard unread={personal.unreadTotal} />
          <ApprovalsCard items={personal.approvals} />
          <MeetingsCard items={personal.meetings} />
          <KudosCard />
          <AnnouncementsCard items={personal.announcements} />
          {personal.tasks.length === 0 && personal.projects.length === 0 && (
            <EmptyState title="Welcome to GHL ONE" hint="Your manager will assign work and projects here. Meanwhile, explore the Wiki and say hello in #general." />
          )}
        </div>
      </div>
    </div>
  );
}
