"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckSquare, Plus, FolderKanban, IndianRupee, CalendarClock, Inbox } from "lucide-react";
import { Card, EmptyState, PageHeader, Button, Tabs } from "@/components/ui";
import { PersonChip, PriorityPill } from "@/components/tasks/TaskBits";
import { useSession } from "@/components/providers/SessionProvider";
import { cn, fmtDate, isManagerPlus, relDate, type Approval } from "@/lib/utils";
import { ApprovalActions } from "./ApprovalActions";
import { ApprovalStatusPill, ApprovalTypePill, WaitingSince, fmtAmount } from "./ApprovalBits";
import { RequestApprovalModal, type RequestApprovalDefaults } from "./RequestApprovalModal";

type TabKey = "for_me" | "mine" | "all" | "history";

export function ApprovalsClient({ approvals, projects, initialTab, openNew, defaults }: { approvals: Approval[]; projects: { id: string; name: string }[]; initialTab?: string; openNew: boolean; defaults: RequestApprovalDefaults }) {
  const { profile } = useSession();
  const router = useRouter();
  const manager = isManagerPlus(profile.role);
  const validTabs: TabKey[] = manager ? ["for_me", "mine", "all", "history"] : ["for_me", "mine", "history"];
  const [tab, setTab] = React.useState<TabKey>(validTabs.includes(initialTab as TabKey) ? (initialTab as TabKey) : "for_me");
  const [showNew, setShowNew] = React.useState(openNew);
  const [now] = React.useState(() => Date.now());

  const projectName = React.useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const forMe = approvals.filter((a) => a.status === "pending" && a.approver_id === profile.id);
  const mine = approvals.filter((a) => a.requested_by === profile.id);
  const allPending = approvals.filter((a) => a.status === "pending");
  const history = approvals.filter((a) => a.status !== "pending").sort((a, b) => (b.decided_at || b.created_at).localeCompare(a.decided_at || a.created_at));

  const list = tab === "for_me" ? forMe : tab === "mine" ? mine : tab === "all" ? allPending : history;

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "for_me", label: "For me", count: forMe.length },
    { key: "mine", label: "Requested by me", count: mine.filter((a) => a.status === "pending").length },
    ...(manager ? [{ key: "all" as TabKey, label: "All pending", count: allPending.length }] : []),
    { key: "history", label: "History", count: history.length },
  ];

  const stale = forMe.filter((a) => Date.parse(a.created_at) < now - 48 * 3600 * 1000).length;

  function closeNew() {
    setShowNew(false);
    if (openNew) router.replace("/approvals");
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Approval Center"
        title="Approvals"
        subtitle={forMe.length ? `${forMe.length} waiting for your decision${stale ? ` · ${stale} older than 48h` : ""}` : "Everything that needs a decision, in one place."}
        actions={<Button variant="primary" onClick={() => setShowNew(true)}><Plus size={15} /> Request approval</Button>}
      />

      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-[var(--s3)]" />

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={tab === "history" ? <Inbox size={18} /> : <CheckSquare size={18} />}
            title={tab === "for_me" ? "Nothing waiting on you" : tab === "mine" ? "You haven't requested anything" : tab === "all" ? "No pending approvals" : "No decisions yet"}
            hint={
              (tab === "for_me" || tab === "all") && history.length
                ? `Nothing is pending. ${history.length} decided request${history.length === 1 ? " is" : "s are"} in History — approving or rejecting moves a request there.`
                : tab === "for_me"
                  ? "Requests where you are the approver will appear here."
                  : tab === "mine"
                    ? "Design sign-offs, budgets, purchases, leave — request them here and track the status."
                    : "Decided requests are kept here for the record."
            }
            action={
              tab === "mine" ? (
                <Button variant="primary" onClick={() => setShowNew(true)}><Plus size={15} /> Request approval</Button>
              ) : (tab === "for_me" || tab === "all") && history.length ? (
                <Button variant="secondary" onClick={() => setTab("history")}>See History</Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-2 stagger">
          {list.map((a) => (
            <ApprovalRow key={a.id} approval={a} projectName={projectName.get(a.project_id || "")} showActions={tab !== "history"} now={now} />
          ))}
        </div>
      )}

      {showNew && <RequestApprovalModal open onClose={closeNew} defaults={defaults} onCreated={(id) => router.push(`/approvals/${id}`)} />}
    </div>
  );
}

function ApprovalRow({ approval: a, projectName, showActions, now }: { approval: Approval; projectName?: string; showActions: boolean; now: number }) {
  const stale = a.status === "pending" && Date.parse(a.created_at) < now - 48 * 3600 * 1000;
  return (
    <Card className={cn("px-[var(--s3)] py-[var(--s3)] sm:px-[var(--s4)]", stale && "border-l-2 border-l-[var(--danger)]")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <ApprovalTypePill type={a.type} />
            <PriorityPill priority={a.priority} />
            <ApprovalStatusPill status={a.status} />
            <WaitingSince since={a.created_at} status={a.status} className="ml-auto" />
          </div>
          <Link href={`/approvals/${a.id}`} className="block font-medium mt-1.5 leading-snug hover:underline">{a.title}</Link>
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1.5 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="text-muted">From</span> <PersonChip id={a.requested_by} size={18} />
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="text-muted">To</span> <PersonChip id={a.approver_id} size={18} />
            </span>
            {projectName && a.project_id && (
              <Link href={`/projects/${a.project_id}`} className="inline-flex items-center gap-1 hover:underline truncate max-w-[200px]"><FolderKanban size={12} /> {projectName}</Link>
            )}
            {a.amount !== null && a.amount !== undefined && (
              <span className="inline-flex items-center gap-1 num font-medium text-[var(--fg-2)]"><IndianRupee size={12} /> {fmtAmount(a.amount).slice(1)}</span>
            )}
            {a.due_date && (
              <span className={cn("inline-flex items-center gap-1 num", a.status === "pending" && Date.parse(a.due_date) < now ? "text-danger" : "")} title={fmtDate(a.due_date, true)}><CalendarClock size={12} /> {relDate(a.due_date)}</span>
            )}
            {a.status !== "pending" && a.decided_at && <span className="num">Decided {fmtDate(a.decided_at)}</span>}
          </div>
        </div>
      </div>
      {showActions && <ApprovalActions approval={a} size="sm" className="mt-3" />}
    </Card>
  );
}
