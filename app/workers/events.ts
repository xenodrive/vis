import type { OpenCodeEvent } from '@opencode/client';
import { createClient, type Connection } from '../utils/protocol/client';
import { errorMessage } from '../utils/errors';
import type { EventCommand, EventMessage } from '../types/event-worker';

type Source = {
  ports: Map<MessagePort, number>;
  abort: AbortController;
  status: Extract<EventMessage, { type: 'status' }>;
  events: OpenCodeEvent[];
  attention: Map<MessagePort, string>;
  idle: Set<string>;
  active: Set<string>;
  roots: Map<string, string>;
};

const sources = new Map<string, Source>();
const subscriptions = new Map<MessagePort, string>();

function broadcast(source: Source, message: EventMessage) {
  for (const port of source.ports.keys()) port.postMessage(message);
}

function disconnect(port: MessagePort) {
  const key = subscriptions.get(port);
  subscriptions.delete(port);
  if (key === undefined) return;
  const source = sources.get(key);
  if (!source) return;
  source.ports.delete(port);
  source.attention.delete(port);
  if (source.ports.size > 0) return;
  source.abort.abort();
  sources.delete(key);
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    if (signal.aborted) done();
  });
}

async function consume(source: Source, connection: Connection) {
  const { signal } = source.abort;
  let attempt = 0;
  while (!signal.aborted) {
    try {
      const client = createClient(connection);
      source.active = new Set(Object.keys(await client.session.active({ signal })));
      async function root(id: string): Promise<string> {
        const cached = source.roots.get(id);
        if (cached) return cached;
        const session = await client.session.get({ sessionID: id }, { signal });
        const result = session.parentID ? await root(session.parentID) : id;
        source.roots.set(id, result);
        return result;
      }
      async function attentive(id: string) {
        const roots = await Promise.all([...source.attention.values()].map(root));
        return roots.includes(id);
      }
      function publishIdle() {
        broadcast(source, { type: 'idle-notifications', sessionIDs: [...source.idle] });
      }
      function notify(sessionID: string, kind: 'idle' | 'permission' | 'question') {
        if (source.attention.size) return;
        const port = source.ports.keys().next().value;
        port?.postMessage({ type: 'notify', sessionID, kind } satisfies EventMessage);
      }
      for await (const event of client.event.subscribe({ signal })) {
        if (signal.aborted) return;
        if (event.type === 'server.connected') {
          attempt = 0;
          source.status = { type: 'status', status: 'connected' };
          broadcast(source, source.status);
        }
        source.events.push(event);
        if (event.type === 'session.deleted') {
          source.active.delete(event.data.sessionID);
          source.idle.delete(event.data.sessionID);
          source.roots.delete(event.data.sessionID);
          publishIdle();
        }
        if (event.type === 'session.execution.started') {
          const id = event.data.sessionID;
          source.active.add(id);
          source.idle.delete(await root(id));
          publishIdle();
        }
        if (
          event.type === 'session.execution.succeeded' ||
          event.type === 'session.execution.failed' ||
          event.type === 'session.execution.interrupted'
        ) {
          const id = event.data.sessionID;
          source.active.delete(id);
          const rootID = await root(id);
          const runningRoots = await Promise.all([...source.active].map(root));
          if (
            !runningRoots.includes(rootID) &&
            !(await attentive(rootID)) &&
            !source.idle.has(rootID)
          ) {
            source.idle.add(rootID);
            publishIdle();
            notify(rootID, 'idle');
          }
        }
        if (event.type === 'permission.asked') notify(event.data.sessionID, 'permission');
        if (event.type === 'form.created') notify(event.data.form.sessionID, 'question');
      }
      if (!signal.aborted) throw new Error('The event stream ended.');
    } catch (error) {
      if (signal.aborted) return;
      source.events = [];
      source.status = { type: 'status', status: 'reconnecting', error: errorMessage(error) };
      broadcast(source, source.status);
      await delay(Math.min(1000 * 2 ** attempt++, 15000), signal);
    }
  }
}

setInterval(() => {
  for (const source of sources.values()) {
    if (source.events.length) {
      broadcast(source, { type: 'events', events: source.events });
      source.events = [];
    }
    for (const [port, seen] of source.ports) {
      if (Date.now() - seen > 180000) disconnect(port);
    }
  }
}, 32);

const worker = self as unknown as { onconnect: (event: MessageEvent) => void };
worker.onconnect = (event) => {
  const port = event.ports[0];
  if (!port) return;
  port.onmessage = ({ data }: MessageEvent<EventCommand>) => {
    if (data.type === 'disconnect') return disconnect(port);
    if (data.type === 'attention') {
      const key = subscriptions.get(port);
      const source = key === undefined ? undefined : sources.get(key);
      if (!source) return;
      if (data.sessionID) {
        source.attention.set(port, data.sessionID);
        source.idle.delete(source.roots.get(data.sessionID) ?? data.sessionID);
        broadcast(source, { type: 'idle-notifications', sessionIDs: [...source.idle] });
      } else source.attention.delete(port);
      return;
    }
    if (data.type === 'heartbeat') {
      const key = subscriptions.get(port);
      const source = key === undefined ? undefined : sources.get(key);
      if (source) source.ports.set(port, Date.now());
      else
        port.postMessage({
          type: 'status',
          status: 'disconnected',
          error: 'Event subscription expired. Reconnect to resume.',
        } satisfies EventMessage);
      return;
    }
    disconnect(port);
    const key = JSON.stringify(data.connection);
    let source = sources.get(key);
    if (!source) {
      source = {
        ports: new Map(),
        abort: new AbortController(),
        events: [],
        attention: new Map(),
        idle: new Set(),
        active: new Set(),
        roots: new Map(),
        status: { type: 'status', status: 'connecting' },
      };
      sources.set(key, source);
    }
    const first = source.ports.size === 0;
    if (source.events.length) {
      broadcast(source, { type: 'events', events: source.events });
      source.events = [];
    }
    source.ports.set(port, Date.now());
    subscriptions.set(port, key);
    port.postMessage(source.status);
    port.postMessage({
      type: 'idle-notifications',
      sessionIDs: [...source.idle],
    } satisfies EventMessage);
    if (first) void consume(source, data.connection);
  };
  port.onmessageerror = () => disconnect(port);
  port.start();
};
