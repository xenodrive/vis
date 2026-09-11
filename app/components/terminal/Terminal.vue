<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { PtyCursor, type PtyClient } from '../../utils/protocol/pty';
import { PTY_FONT_FAMILY, PTY_LINGER_MS } from '../../utils/terminal';

const props = defineProps<{
  id: string;
  api: PtyClient;
  initialInput?: string;
  startCommand?: boolean;
  exited?: boolean;
}>();
const host = ref<HTMLElement>();
const emit = defineEmits<{
  error: [message: string];
  exit: [];
  size: [size: { width: number; height: number }];
}>();
let terminal: Terminal;
let socket: WebSocket | undefined;
let observer: ResizeObserver;
const abort = new AbortController();
const cursor = new PtyCursor();
let retry: ReturnType<typeof setTimeout> | undefined;
let linger: ReturnType<typeof setTimeout> | undefined;
let initialFrame: number | undefined;
let fitted = false;
let delay = 500;
let initialInputSent = false;
let resizing = false;
let nextSize: { cols: number; rows: number } | undefined;

async function resize() {
  if (resizing) return;
  resizing = true;
  try {
    while (nextSize && !abort.signal.aborted) {
      const size = nextSize;
      nextSize = undefined;
      await props.api.resize(props.id, size.cols, size.rows, abort.signal);
    }
  } catch (cause) {
    if (!abort.signal.aborted) emit('error', String(cause));
  } finally {
    resizing = false;
  }
}
function fit() {
  if (!fitted || props.exited || terminal.options.disableStdin) return;
  const screen = host.value?.querySelector<HTMLElement>('.xterm-screen');
  if (!screen || !host.value || !screen.offsetWidth || !screen.offsetHeight) return;
  const viewport = host.value.querySelector<HTMLElement>('.xterm-viewport');
  const scrollbar = viewport ? viewport.offsetWidth - viewport.clientWidth : 0;
  const cols = Math.max(
    2,
    Math.floor((host.value.clientWidth - scrollbar) / (screen.offsetWidth / terminal.cols)),
  );
  const rows = Math.max(
    1,
    Math.floor(host.value.clientHeight / (screen.offsetHeight / terminal.rows)),
  );
  if (cols !== terminal.cols || rows !== terminal.rows) terminal.resize(cols, rows);
  nextSize = { cols, rows };
  void resize();
}
async function connect() {
  try {
    const url = await props.api.connectUrl(props.id, cursor.value, abort.signal);
    if (abort.signal.aborted) return;
    const ws = new WebSocket(url);
    socket = ws;
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      if (props.startCommand && !initialInputSent) {
        ws.send('\n');
        initialInputSent = true;
      }
      delay = 500;
      fit();
      terminal.focus();
      if (!initialInputSent && props.initialInput) {
        ws.send(`${props.initialInput}\n`);
        initialInputSent = true;
      }
    };
    ws.onmessage = (event) => {
      try {
        const output = cursor.consume(event.data);
        if (output !== undefined) terminal.write(output);
      } catch (cause) {
        emit('error', String(cause));
        ws.close(1000);
      }
    };
    ws.onclose = (event) => {
      if (abort.signal.aborted) return;
      if (event.code === 1000 || event.code === 4404) {
        terminal.options.disableStdin = true;
        terminal.options.cursorBlink = false;
        observer.disconnect();
        nextSize = undefined;
        terminal.write('', () => {
          if (!abort.signal.aborted) linger = setTimeout(() => emit('exit'), PTY_LINGER_MS);
        });
        return;
      }
      retry = setTimeout(() => {
        void connect();
      }, delay);
      delay = Math.min(delay * 2, 15000);
    };
  } catch (cause) {
    if (!abort.signal.aborted) emit('error', String(cause));
  }
}
onMounted(() => {
  terminal = new Terminal({
    cols: 80,
    rows: 25,
    fontSize: 13,
    lineHeight: 1.1,
    fontFamily: PTY_FONT_FAMILY,
    cursorBlink: true,
    scrollback: 10000,
    theme: {
      background: '#050505',
      foreground: '#e2e8f0',
      cursor: '#e2e8f0',
      selectionBackground: 'rgba(148, 163, 184, 0.3)',
    },
  });
  terminal.open(host.value!);
  terminal.onData((data) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(data);
  });
  terminal.attachCustomKeyEventHandler(
    (event) => !(event.type === 'keydown' && event.key === 'Escape' && event.altKey),
  );
  observer = new ResizeObserver(fit);
  observer.observe(host.value!);
  initialFrame = requestAnimationFrame(() => {
    const screen = host.value?.querySelector<HTMLElement>('.xterm-screen');
    const viewport = host.value?.querySelector<HTMLElement>('.xterm-viewport');
    if (screen)
      emit('size', {
        width: Math.ceil(
          screen.offsetWidth + (viewport ? viewport.offsetWidth - viewport.clientWidth : 0) + 10,
        ),
        height: Math.ceil(screen.offsetHeight + 29),
      });
    fitted = true;
  });
  void connect();
});
onBeforeUnmount(() => {
  abort.abort();
  clearTimeout(retry);
  clearTimeout(linger);
  if (initialFrame !== undefined) cancelAnimationFrame(initialFrame);
  observer?.disconnect();
  socket?.close();
  terminal?.dispose();
});
watch(
  () => props.exited,
  (exited) => {
    if (exited && terminal) {
      terminal.options.cursorBlink = false;
      terminal.options.disableStdin = true;
    }
  },
);
</script>

<template><div ref="host" class="terminal-host" @keydown.stop @pointerdown.stop /></template>

<style scoped>
.terminal-host {
  height: 100%;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  background: #050505;
}
.terminal-host :deep(.xterm) {
  height: 100%;
}
</style>
