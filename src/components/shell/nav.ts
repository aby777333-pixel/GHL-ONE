import {
  LayoutDashboard, ListChecks, FolderKanban, MessageSquare, CheckSquare, Calendar, Files, BookOpen, Users, Building2, Gavel, Video, Inbox, Megaphone, Lightbulb, Shield, Wand2, Gauge, Search, Workflow, Clock, LifeBuoy, Globe2, Palmtree, GraduationCap, Target, Briefcase, Activity, MessagesSquare, ClipboardList, MessageCircleQuestion, Radio, PenTool, Clapperboard, FileText, Layers, KeyRound, type LucideIcon,
} from "lucide-react";
import type { RoleLevel } from "@/lib/utils";
import { isManagerPlus, isLeadPlus } from "@/lib/utils";
import { isPathAllowed, type Screen } from "@/lib/screens";

export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: "inbox" | "approvals" | "chat"; mobile?: boolean };
export type NavSection = { title?: string; items: NavItem[] };

/** Extra facts the nav needs that a role alone cannot answer. */
export type NavContext = {
  platformAdmin?: boolean;
  /** Effective permission keys — lets the nav offer permission-gated screens without guessing from role. */
  permissions?: string[];
};

export function navFor(role: RoleLevel, ctx: NavContext = {}): NavSection[] {
  const manager = isManagerPlus(role);
  const lead = isLeadPlus(role);
  // Access Control is permission-gated, not role-gated: "admin" is a role, authority is a permission.
  const security = (ctx.permissions || []).includes("security.manage");
  return [
    {
      items: [
        { href: "/", label: "Home", icon: LayoutDashboard, mobile: true },
        { href: "/my-work", label: "My Work", icon: ListChecks, mobile: true },
        { href: "/inbox", label: "Inbox", icon: Inbox, badge: "inbox", mobile: true },
        { href: "/chat", label: "Chat", icon: MessageSquare, badge: "chat", mobile: true },
        { href: "/approvals", label: "Approvals", icon: CheckSquare, badge: "approvals", mobile: true },
      ],
    },
    {
      title: "Work",
      items: [
        { href: "/projects", label: "Projects", icon: FolderKanban },
        { href: "/tasks", label: "Tasks", icon: ListChecks },
        { href: "/delegate", label: "Delegate", icon: Wand2 },
        { href: "/help", label: "Help Desk", icon: LifeBuoy },
        { href: "/connect", label: "Connect", icon: MessagesSquare },
        { href: "/meetings", label: "Meetings", icon: Video },
        { href: "/live", label: "GHL LIVE", icon: Radio },
        { href: "/boards", label: "Boards", icon: PenTool },
        { href: "/recordings", label: "Recordings", icon: Clapperboard },
        { href: "/docs", label: "Live docs", icon: FileText },
        { href: "/calendar", label: "Calendar", icon: Calendar },
        { href: "/decisions", label: "Decisions", icon: Gavel },
        ...(lead ? [{ href: "/automations", label: "Automations", icon: Workflow }] : []),
      ],
    },
    {
      title: "Me & Team",
      items: [
        { href: "/attendance", label: "Attendance", icon: Clock },
        { href: "/leave", label: "Leave", icon: Palmtree },
        { href: "/requests", label: "Requests", icon: ClipboardList },
        { href: "/academy", label: "Academy", icon: GraduationCap },
        { href: "/goals", label: "Goals", icon: Target },
        { href: "/jobs", label: "Jobs", icon: Briefcase },
        { href: "/common", label: "GHL Common", icon: Globe2 },
      ],
    },
    {
      title: "Company",
      items: [
        ...(manager ? [{ href: "/command", label: "Command Center", icon: Gauge }, { href: "/workforce", label: "Workforce", icon: Activity }] : []),
        { href: "/departments", label: "Departments", icon: Building2 },
        { href: "/people", label: "People", icon: Users },
        { href: "/files", label: "Files", icon: Files },
        { href: "/wiki", label: "Wiki", icon: BookOpen },
        { href: "/wiki/questions", label: "Q&A", icon: MessageCircleQuestion },
        { href: "/status", label: "Status", icon: Activity },
        { href: "/announcements", label: "Announcements", icon: Megaphone },
        { href: "/ideas", label: "Ideas", icon: Lightbulb },
        { href: "/search", label: "Search", icon: Search },
        ...(lead ? [{ href: "/admin", label: "Admin", icon: Shield }] : []),
        ...(security && !ctx.platformAdmin ? [{ href: "/platform/access", label: "Access Control", icon: KeyRound }] : []),
      ],
    },
    // The platform layer sits above every company. Only `is_platform_admin()` people see it, and
    // every page behind it re-checks that in the database — this section is convenience, not control.
    ...(ctx.platformAdmin
      ? [{ title: "Platform", items: [
          { href: "/platform", label: "Command Center", icon: Layers },
          { href: "/platform/access", label: "Access Control", icon: KeyRound },
        ] } as NavSection]
      : []),
  ];
}

/** Drop nav items the screen catalogue denies (individual → role → department → default precedence). Keeps items that have no governing screen. */
export function filterNav(sections: NavSection[], screens?: Screen[]): NavSection[] {
  if (!screens || !screens.length) return sections;
  return sections
    .map((s) => ({ ...s, items: s.items.filter((i) => isPathAllowed(screens, i.href)) }))
    .filter((s) => s.items.length > 0);
}
