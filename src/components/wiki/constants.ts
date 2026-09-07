export const WIKI_CATEGORIES = [
  "Onboarding", "Policies", "Employee handbook", "Brand guidelines", "Sales scripts", "Development standards",
  "Content guidelines", "Investment documentation", "Support procedures", "FAQ", "SOPs",
] as const;

export type WikiListItem = {
  id: string;
  title: string;
  slug: string;
  category: string;
  department_id: string | null;
  classification: import("@/lib/utils").Classification;
  author_id: string | null;
  updated_at: string;
  created_at: string;
  excerpt: string;
  author: { id: string; full_name: string; avatar_url: string | null } | null;
};

export const WIKI_TEMPLATE = `# Title

Short summary of what this page covers and who it is for.

## Purpose

## Steps

1. First step
2. Second step
3. Third step

## Owner & review cadence

| Owner | Reviewed | Next review |
| --- | --- | --- |
| Name | 2026-01-01 | 2026-07-01 |
`;
