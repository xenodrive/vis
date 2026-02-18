import { createSessionKey, type SessionKey } from './sessionKey';

type NotificationEntry = {
  projectId: string;
  sessionId: string;
  requestIds: Set<string>;
};

export type NotificationSnapshotEntry = {
  projectId: string;
  sessionId: string;
  requestIds: string[];
};

export function createNotificationManager(
  resolveRoot: (projectId: string, sessionId: string) => SessionKey,
) {
  let state = new Map<string, NotificationEntry>();
  let sessionOrder: string[] = [];

  function addNotification(projectId: string, sessionId: string, requestId: string): boolean {
    const trimmedProjectId = projectId.trim();
    const trimmedSessionId = sessionId.trim();
    if (!trimmedProjectId || !trimmedSessionId || !requestId) return false;
    const resolvedRoot = resolveRoot(trimmedProjectId, trimmedSessionId);
    const key = createSessionKey(resolvedRoot.projectId, resolvedRoot.sessionId);
    if (!key) return false;

    const existing = state.get(key);
    if (existing?.requestIds.has(requestId)) return false;

    const next = new Map(state);
    const entry: NotificationEntry = {
      projectId: resolvedRoot.projectId,
      sessionId: resolvedRoot.sessionId,
      requestIds: new Set(existing?.requestIds ?? []),
    };
    entry.requestIds.add(requestId);
    next.set(key, entry);
    state = next;

    if (!sessionOrder.includes(key)) {
      sessionOrder = [...sessionOrder, key];
    }
    return true;
  }

  function removeNotification(requestId: string): boolean {
    if (!requestId) return false;
    for (const [key, entry] of state.entries()) {
      if (!entry.requestIds.has(requestId)) continue;

      const next = new Map(state);
      const updatedSet = new Set(entry.requestIds);
      updatedSet.delete(requestId);

      if (updatedSet.size === 0) {
        next.delete(key);
        sessionOrder = sessionOrder.filter((id) => id !== key);
      } else {
        next.set(key, {
          projectId: entry.projectId,
          sessionId: entry.sessionId,
          requestIds: updatedSet,
        });
      }
      state = next;
      return true;
    }
    return false;
  }

  function clearSession(projectId: string, sessionId: string): boolean {
    const trimmedProjectId = projectId.trim();
    const trimmedSessionId = sessionId.trim();
    if (!trimmedProjectId || !trimmedSessionId) return false;
    const root = resolveRoot(trimmedProjectId, trimmedSessionId);
    const key = createSessionKey(root.projectId, root.sessionId);
    if (!key || !state.has(key)) return false;

    const next = new Map(state);
    next.delete(key);
    state = next;
    sessionOrder = sessionOrder.filter((id) => id !== key);
    return true;
  }

  function getState(): Record<string, NotificationSnapshotEntry> {
    const out: Record<string, NotificationSnapshotEntry> = {};
    for (const [key, entry] of state.entries()) {
      out[key] = {
        projectId: entry.projectId,
        sessionId: entry.sessionId,
        requestIds: [...entry.requestIds],
      };
    }
    return out;
  }

  function hasAny(): boolean {
    return state.size > 0;
  }

  function getSessionKeys(): string[] {
    return sessionOrder.filter((id) => state.has(id));
  }

  function importState(data: Record<string, NotificationSnapshotEntry>): void {
    const next = new Map<string, NotificationEntry>();
    const order: string[] = [];
    for (const [key, entry] of Object.entries(data)) {
      const trimmedProjectId = entry.projectId.trim();
      const trimmedSessionId = entry.sessionId.trim();
      if (
        !trimmedProjectId ||
        !trimmedSessionId ||
        !Array.isArray(entry.requestIds) ||
        entry.requestIds.length === 0
      )
        continue;
      next.set(key, {
        projectId: trimmedProjectId,
        sessionId: trimmedSessionId,
        requestIds: new Set(entry.requestIds),
      });
      order.push(key);
    }
    state = next;
    sessionOrder = order;
  }

  return {
    addNotification,
    removeNotification,
    clearSession,
    getState,
    hasAny,
    getSessionKeys,
    importState,
  };
}
