import { ref } from 'vue';
import type { OpenCodeClient } from '@opencode/client';
import EventWorker from '../workers/events?sharedworker';
import type { ConnectionStatus, EventCommand, EventMessage } from '../types/event-worker';
import { createClient, type Connection } from '../utils/protocol/client';

/** Own the HTTP client, request cancellation and shared event transport. */
export function useConnection() {
  const status = ref<ConnectionStatus>('disconnected');
  const streamError = ref('');
  let client: OpenCodeClient | undefined;
  let abort = new AbortController();
  let worker: SharedWorker | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  function api() {
    if (!client) throw new Error('Connect to an OpenCode server first.');
    return client;
  }

  function options() {
    return { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]) };
  }

  function initialize(input: Connection) {
    if (typeof SharedWorker === 'undefined')
      throw new Error('This version of vis requires SharedWorker support.');
    client = createClient(input);
  }

  function send(message: EventCommand) {
    worker?.port.postMessage(message);
  }

  function stopEvents() {
    send({ type: 'disconnect' });
    worker?.port.close();
    worker = undefined;
    clearInterval(heartbeat);
  }

  function startEvents(connection: Connection, receive: (message: EventMessage) => void) {
    stopEvents();
    status.value = 'connecting';
    streamError.value = '';
    const current = new EventWorker();
    worker = current;
    current.port.onmessage = ({ data }: MessageEvent<EventMessage>) => {
      if (worker !== current) return;
      if (data.type === 'status') {
        status.value = data.status;
        streamError.value = data.error ?? '';
      }
      receive(data);
    };
    current.onerror = (event) => {
      if (worker !== current) return;
      status.value = 'disconnected';
      streamError.value = event.message || 'The shared event worker failed. Reconnect to resume.';
    };
    current.port.start();
    send({ type: 'connect', connection });
    heartbeat = setInterval(() => send({ type: 'heartbeat' }), 20000);
  }

  function reset() {
    abort.abort();
    abort = new AbortController();
    stopEvents();
    client = undefined;
    status.value = 'disconnected';
    streamError.value = '';
  }

  return {
    status,
    streamError,
    api,
    options,
    initialize,
    send,
    startEvents,
    stopEvents,
    reset,
    hasClient: () => client !== undefined,
    signal: () => abort.signal,
  };
}
