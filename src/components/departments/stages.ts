/** Department-specific workflow stages. Tasks carry the stage as a lowercase tag. */
export const WORKFLOW_STAGES: Record<string, string[]> = {
  content: ["Idea", "Research", "Draft", "Review", "Compliance", "Design", "Approval", "Scheduled", "Published"],
  design: ["Request", "Brief", "Assigned", "Designing", "Internal Review", "Revision", "Approved", "Delivered"],
};

export function stagesFor(slug?: string | null): string[] | null {
  if (!slug) return null;
  return WORKFLOW_STAGES[slug] || null;
}

export const stageTag = (stage: string) => stage.toLowerCase();

/** Which stage (if any) a task is in, based on its tags. */
export function stageOf(tags: string[] | null | undefined, stages: string[]): string | null {
  if (!tags?.length) return null;
  const set = new Set(tags.map((t) => t.toLowerCase()));
  for (let i = stages.length - 1; i >= 0; i--) if (set.has(stageTag(stages[i]!))) return stages[i]!;
  return null;
}

/** Replace any stage tag on a task with the new one (or none). */
export function withStage(tags: string[] | null | undefined, stages: string[], stage: string | null): string[] {
  const stageSet = new Set(stages.map(stageTag));
  const rest = (tags || []).filter((t) => !stageSet.has(t.toLowerCase()));
  return stage ? [...rest, stageTag(stage)] : rest;
}
