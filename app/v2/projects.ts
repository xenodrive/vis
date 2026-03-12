import type { Project } from '@opencode-ai/client';

export function compareProjects(
  a: Project,
  b: Project,
  activity: ReadonlyMap<string, number>,
): number {
  const aTime = activity.get(a.id);
  const bTime = activity.get(b.id);
  if (aTime !== undefined && bTime === undefined) return -1;
  if (aTime === undefined && bTime !== undefined) return 1;
  if (aTime !== undefined && bTime !== undefined && aTime !== bTime) return bTime - aTime;
  return (a.name || a.canonical.split('/').pop() || a.canonical).localeCompare(
    b.name || b.canonical.split('/').pop() || b.canonical,
  );
}
