import {
  LayoutDashboard, ListChecks, FolderKanban, MessageSquare, CheckSquare, Calendar, Files, BookOpen, Users,
  Building2, Gavel, Video, Inbox, Megaphone, Lightbulb, Shield, Wand2, Gauge, Search, Workflow, Clock, LifeBuoy, Globe2, Palmtree, GraduationCap, Target, Briefcase, type LucideIcon,
} from "lucide-react";
import type { RoleLevel } from "@/lib/utils";
import { isManagerPlus, isLeadPlus } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: "inbox" | "approvals" | "chat"; mobile?: boolean };
export type NavSection = { title?: string; items: NavItem[] };

export function navFor(role: RoleLevel): NavSection[] {
  const manager = isManagerPlus(role);
  const lead = isLeadPlus(role);
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
        { href: "/meetings", label: "Meetings", icon: Video },
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
        { href: "/academy", label: "Academy", icon: GraduationCap },
        { href: "/goals", label: "Goals", icon: Target },
        { href: "/jobs", label: "Jobs", icon: Briefcase },
        { href: "/common", label: "GHL Common", icon: Globe2 },
      ],
    },
    {
      title: "Company",
      items: [
        ...(manager ? [{ href: "/command", label: "Command Center", icon: Gauge }] : []),
        { href: "/departments", label: "Departments", icon: Building2 },
        { href: "/people", label: "People", icon: Users },
        { href: "/files", label: "Files", icon: Files },
        { href: "/wiki", label: "Wiki", icon: BookOpen },
        { href: "/announcements", label: "Announcements", icon: Megaphone },
        { href: "/ideas", label: "Ideas", icon: Lightbulb },
        { href: "/search", label: "Search", icon: Search },
        ...(lead ? [{ href: "/admin", label: "Admin", icon: Shield }] : []),
      ],
    },
  ];
}
