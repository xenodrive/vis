import type { Project } from '@opencode/client';

const PROJECT_COLOR_HEX: Record<string, string> = {
  pink: '#e34ba9',
  mint: '#95f3d9',
  orange: '#ff802b',
  purple: '#9d5bd2',
  cyan: '#369eff',
  lime: '#c4f042',
};

export function resolveProjectColorHex(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return PROJECT_COLOR_HEX[trimmed] ?? trimmed;
}

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
