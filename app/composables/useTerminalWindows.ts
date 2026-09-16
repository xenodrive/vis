import { watch, onBeforeUnmount } from 'vue';
import type { Pty } from '@opencode/client';
import type { useSessionState } from './useSessionState';
import type { useFloatingWindows } from './useFloatingWindows';
import type { PtyClient } from '../utils/protocol/pty';
import Terminal from '../components/terminal/Terminal.vue';
import { PtyCursor } from '../utils/protocol/pty';

export function useTerminalWindows(
  state: ReturnType<typeof useSessionState>,
  fw: ReturnType<typeof useFloatingWindows>,
) {
  let generation = 0;
  let abort = new AbortController();
  let api: PtyClient | undefined;
  const clients = new Map<string, PtyClient>();
  const closing = new Map<string, Promise<void>>();
  const commands = new Map<string, { exit?: number; done: (code: number) => void }>();
  const exits = new Map<string, number>();
  function report(cause: unknown) {
    state.error.value = String(cause);
  }
  async function show(pty: Pty, client: PtyClient, initialInput?: string) {
    const key = `shell:${pty.id}`;
    if (fw.has(key)) return;
    clients.set(key, client);
    await fw.open(key, {
      component: Terminal,
      props: {
        id: pty.id,
        api: client,
        initialInput,
        startCommand: commands.has(key),
        onError: report,
        onExit: () => {
          const command = commands.get(key);
          if (!command || command.exit === 0) void close(key);
        },
        onSize: (size: { width: number; height: number }) => fw.updateOptions(key, size),
      },
      title: `🔧 [SHELL] ${pty.cwd}`,
      variant: 'term',
      width: 700,
      height: 430,
      scroll: 'none',
      closable: true,
      resizable: true,
      focusOnOpen: true,
      expiry: Infinity,
      color: '#a855f7',
    });
  }
  async function restore() {
    const current = generation;
    const client = api;
    if (!client) return;
    try {
      const entries = await client.list(abort.signal);
      if (current !== generation) return;
      for (const pty of entries) {
        if (pty.title === 'vis terminal') {
          if (pty.status === 'running') await show(pty, client);
          else await client.remove(pty.id, AbortSignal.timeout(10000));
        }
        if (current !== generation) return;
      }
    } catch (cause) {
      if (current === generation) report(cause);
    }
  }
  async function open(initialInput?: string) {
    const current = generation;
    const client = api;
    if (!client) return false;
    try {
      const pty = await client.create(abort.signal);
      if (current !== generation) return false;
      await show(pty, client, initialInput);
      return true;
    } catch (cause) {
      if (current === generation) report(cause);
      return false;
    }
  }
  async function close(key: string) {
    const pending = closing.get(key);
    if (pending) return pending;
    const client = clients.get(key);
    if (!client) {
      await fw.close(key);
      return;
    }
    const current = generation;
    const operation = (async () => {
      try {
        await client.remove(key.slice('shell:'.length), AbortSignal.timeout(10000));
        if (current !== generation) return;
        clients.delete(key);
        commands.get(key)?.done(-1);
        commands.delete(key);
        await fw.close(key);
      } catch (cause) {
        if (current === generation && clients.has(key)) report(cause);
      } finally {
        closing.delete(key);
      }
    })();
    closing.set(key, operation);
    return operation;
  }
  async function run(command: string, title = command): Promise<number | undefined> {
    const client = api;
    const current = generation;
    if (!client) return;
    try {
      const pty = await client.create(abort.signal, command);
      if (current !== generation) return;
      const key = `shell:${pty.id}`;
      const completion = new Promise<number>((done) => commands.set(key, { done }));
      await show(pty, client);
      fw.updateOptions(key, { title: `🔧 ${title}` });
      const code = exits.get(pty.id);
      if (code !== undefined) finishCommand(key, code);
      return await completion;
    } catch (cause) {
      if (current === generation) report(cause);
    }
  }
  async function inspect(command: string): Promise<string> {
    const client = api;
    if (!client) throw new Error('No active Location for Git inspection.');
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]);
    const pty = await client.create(signal, command);
    try {
      const url = await client.connectUrl(pty.id, undefined, signal);
      return await new Promise<string>((resolve, reject) => {
        const socket = new WebSocket(url);
        socket.binaryType = 'arraybuffer';
        socket.onopen = () => socket.send('\n');
        const cursor = new PtyCursor();
        let output = '';
        const cancel = () => {
          socket.close();
          reject(new Error('Git inspection cancelled.'));
        };
        signal.addEventListener('abort', cancel, { once: true });
        socket.onmessage = (event) => {
          try {
            output += cursor.consume(event.data) ?? '';
          } catch (cause) {
            socket.close();
            reject(cause);
          }
        };
        socket.onerror = () => {
          socket.close();
          reject(new Error('Git inspection connection failed.'));
        };
        socket.onclose = (event) => {
          signal.removeEventListener('abort', cancel);
          if (!output) {
            reject(
              new Error(
                `Git inspection returned no output (WebSocket ${event.code}${event.reason ? `: ${event.reason}` : ''}, PTY exit ${exits.get(pty.id) ?? 'not received'}).`,
              ),
            );
            return;
          }
          resolve(output.replaceAll('\r', ''));
        };
        if (signal.aborted) cancel();
      });
    } finally {
      await client.remove(pty.id, AbortSignal.timeout(10000));
      exits.delete(pty.id);
    }
  }
  function finishCommand(key: string, code: number) {
    const command = commands.get(key);
    if (!command) return;
    if (command.exit !== undefined) return;
    command.exit = code;
    command.done(code);
    const entry = fw.entries.value.find((entry) => entry.key === key);
    if (entry)
      fw.updateOptions(key, {
        title: `${entry.title} [exit ${code}]`,
        props: { ...entry.props, exited: true },
      });
  }
  watch(
    () => JSON.stringify([state.ready.value, state.selected.value?.location]),
    () => {
      generation++;
      abort.abort();
      abort = new AbortController();
      for (const key of clients.keys()) void fw.close(key);
      clients.clear();
      for (const command of commands.values()) command.done(-1);
      commands.clear();
      exits.clear();
      const scope = state.selected.value?.location;
      api = state.ready.value && scope ? state.ptyClient(scope) : undefined;
      void restore();
    },
    { immediate: true },
  );
  const stopEvents = state.onEvent((event) => {
    if (event.type !== 'pty.deleted' && event.type !== 'pty.exited') return;
    const key = `shell:${event.data.id}`;
    if (event.type === 'pty.exited') {
      exits.set(event.data.id, event.data.exitCode);
      finishCommand(key, event.data.exitCode);
    }
    if (!clients.has(key)) return;
    if (event.type === 'pty.deleted') {
      commands.get(key)?.done(-1);
      commands.delete(key);
      exits.delete(event.data.id);
      clients.delete(key);
      void fw.close(key);
    } else {
      const entry = fw.entries.value.find((entry) => entry.key === key);
      if (entry) fw.updateOptions(key, { props: { ...entry.props, exited: true } });
    }
  });
  onBeforeUnmount(() => {
    stopEvents();
    generation++;
    abort.abort();
  });
  return { open, close, run, inspect };
}
