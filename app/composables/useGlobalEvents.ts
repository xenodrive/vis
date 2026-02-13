import { type Ref, watchEffect } from 'vue';
import type { GlobalEventMap, SseEnvelope } from '../types/sse';
import { TypedEmitter } from '../utils/eventEmitter';

type EventKey = keyof GlobalEventMap;
type ConnectionOptions = { failFast?: boolean; timeoutMs?: number };

export type SessionScope = {
  on<K extends EventKey>(event: K, listener: (payload: GlobalEventMap[K]) => void): () => void;
  on(event: string, listener: (payload: any) => void): () => void;
  dispose(): void;
};

const KNOWN_EVENT_TYPES = new Set<EventKey>([
  'message.updated',
  'message.removed',
  'message.part.updated',
  'message.part.removed',
  'session.created',
  'session.updated',
  'session.deleted',
  'session.diff',
  'session.error',
  'session.status',
  'session.compacted',
  'permission.asked',
  'permission.replied',
  'question.asked',
  'question.replied',
  'question.rejected',
  'todo.updated',
  'pty.created',
  'pty.updated',
  'pty.exited',
  'pty.deleted',
  'worktree.ready',
  'worktree.failed',
  'project.updated',
  'vcs.branch.updated',
  'file.edited',
  'lsp.updated',
  'lsp.client.diagnostics',
  'command.executed',
  'installation.updated',
  'installation.update-available',
  'mcp.tools.changed',
  'connection.open',
  'connection.error',
  'connection.reconnected',
]);

function isKnownEventType(value: string): value is EventKey {
  return KNOWN_EVENT_TYPES.has(value as EventKey);
}

function parseEnvelope(raw: string): SseEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  if (!record.payload || typeof record.payload !== 'object') return null;
  const payload = record.payload as Record<string, unknown>;
  if (typeof payload.type !== 'string') return null;
  if (!payload.properties || typeof payload.properties !== 'object') return null;
  return {
    directory: typeof record.directory === 'string' ? record.directory : '',
    payload: {
      type: payload.type,
      properties: payload.properties as Record<string, unknown>,
    },
  };
}

function extractSessionId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  if (typeof record.sessionID === 'string') return record.sessionID;
  if (typeof record.sessionId === 'string') return record.sessionId;

  const info =
    record.info && typeof record.info === 'object'
      ? (record.info as Record<string, unknown>)
      : undefined;
  if (typeof info?.sessionID === 'string') return info.sessionID;
  if (typeof info?.sessionId === 'string') return info.sessionId;

  const part =
    record.part && typeof record.part === 'object'
      ? (record.part as Record<string, unknown>)
      : undefined;
  if (typeof part?.sessionID === 'string') return part.sessionID;
  if (typeof part?.sessionId === 'string') return part.sessionId;

  return undefined;
}

function computeAllowedSessionIds(rootId: string, parents: Map<string, string>): Set<string> {
  const allowed = new Set<string>();
  if (!rootId) return allowed;
  const childrenByParent = new Map<string, string[]>();
  parents.forEach((parentId, sessionId) => {
    if (!parentId) return;
    const bucket = childrenByParent.get(parentId) ?? [];
    bucket.push(sessionId);
    childrenByParent.set(parentId, bucket);
  });
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (allowed.has(current)) continue;
    allowed.add(current);
    const children = childrenByParent.get(current);
    if (children) stack.push(...children);
  }
  return allowed;
}

export function useGlobalEvents(baseUrl: string) {
  const emitter = new TypedEmitter<GlobalEventMap>();
  let source: EventSource | undefined;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let disconnectRequested = false;

  function routeEnvelope(envelope: SseEnvelope) {
    const type = envelope.payload.type;
    if (!isKnownEventType(type)) return;
    emitter.emit(type, envelope.payload.properties as GlobalEventMap[typeof type]);
  }

  function waitForOpen(timeoutMs = 5000) {
    return new Promise<void>((resolve, reject) => {
      const current = source;
      if (!current) {
        reject(new Error('SSE connection is not initialized.'));
        return;
      }
      if (current.readyState === EventSource.OPEN) {
        resolve();
        return;
      }
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('SSE connection failed.'));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('SSE connection timed out.'));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        current.removeEventListener('open', onOpen);
        current.removeEventListener('error', onError);
      };
      current.addEventListener('open', onOpen, { once: true });
      current.addEventListener('error', onError, { once: true });
    });
  }

  async function connect(options: ConnectionOptions = {}) {
    disconnectRequested = false;
    if (source) {
      if (options.failFast) await waitForOpen(options.timeoutMs ?? 5000);
      return;
    }

    const isReconnect = reconnectAttempt > 0;
    source = new EventSource(`${baseUrl}/global/event`);

    source.addEventListener('open', () => {
      reconnectAttempt = 0;
      emitter.emit('connection.open', {});
      if (isReconnect) {
        emitter.emit('connection.reconnected', {});
      }
    });

    source.addEventListener('message', (event) => {
      const envelope = parseEnvelope(event.data);
      if (!envelope) return;
      routeEnvelope(envelope);
    });

    source.addEventListener('error', () => {
      emitter.emit('connection.error', { message: 'SSE connection error.' });
      source?.close();
      source = undefined;
      if (disconnectRequested || reconnectTimer) return;
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, 1000);
    });

    if (options.failFast) await waitForOpen(options.timeoutMs ?? 5000);
  }

  function disconnect() {
    disconnectRequested = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    source?.close();
    source = undefined;
  }

  function on<K extends EventKey>(event: K, listener: (payload: GlobalEventMap[K]) => void): () => void;
  function on(event: string, listener: (payload: any) => void): () => void;
  function on(event: string, listener: (payload: any) => void): () => void {
    if (!isKnownEventType(event)) return () => {};
    return emitter.on(event, listener as any);
  }

  function session(selectedSessionId: Ref<string>, sessionParentById: Ref<Map<string, string>>): SessionScope {
    let allowed = new Set<string>();
    const stop = watchEffect(() => {
      allowed = computeAllowedSessionIds(selectedSessionId.value, sessionParentById.value);
    });
    const disposers = new Set<() => void>();

    function scopedOn<K extends EventKey>(
      event: K,
      listener: (payload: GlobalEventMap[K]) => void,
    ): () => void;
    function scopedOn(event: string, listener: (payload: any) => void): () => void;
    function scopedOn(event: string, listener: (payload: any) => void): () => void {
      if (!isKnownEventType(event)) return () => {};
      const off = on(event, (payload) => {
        const sessionId = extractSessionId(payload);
        if (!sessionId || allowed.has(sessionId)) {
          listener(payload);
        }
      });
      disposers.add(off);
      return () => {
        off();
        disposers.delete(off);
      };
    }

    function dispose() {
      stop();
      for (const off of disposers) off();
      disposers.clear();
    }

    return { on: scopedOn, dispose };
  }

  return { on, connect, disconnect, session };
}
