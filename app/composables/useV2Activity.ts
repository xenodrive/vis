import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { SessionMessageInfo } from '@opencode-ai/client';
import type { useV2 } from './useV2';
import type { useFloatingWindows } from './useFloatingWindows';
import { useSettings } from './useSettings';
import ReasoningContent from '../components/ToolWindow/Reasoning.vue';
import ToolSection from '../components/v2/ToolSection.vue';

export type ActivityMessage = Extract<SessionMessageInfo, { type: 'skill' | 'shell' }>;

export type SelectionSplash = {
  agent: string;
  color: string;
  model?: { provider: string; name: string };
  variant?: string;
};

export function useV2Activity(
  state: ReturnType<typeof useV2>,
  fw: ReturnType<typeof useFloatingWindows>,
) {
  const splash = ref<string | SelectionSplash>('');
  const splashKey = ref(0);
  const liveCompression = ref<{ text: string; created: number }>();
  const compression = computed(() => {
    const latest = state.messages.value.findLast((message) =>
      ['user', 'assistant', 'compaction'].includes(message.type),
    );
    if (liveCompression.value && (!latest || liveCompression.value.created >= latest.time.created))
      return liveCompression.value.text;
    return latest?.type === 'compaction'
      ? latest.status === 'running'
        ? '🤯 Context compressing'
        : latest.status === 'failed'
          ? '⚠️ Context compression failed'
          : ''
      : '';
  });
  const seen = new Set<string>();
  let compressionWindow: { key: string; text: string } | undefined;
  const { suppressAutoWindows } = useSettings();
  let timer: ReturnType<typeof setTimeout> | undefined;
  function showSplash(content: string | SelectionSplash) {
    splashKey.value += 1;
    splash.value = content;
    clearTimeout(timer);
    timer = setTimeout(() => {
      splash.value = '';
    }, 500);
  }
  const activities = computed(() =>
    state.messages.value.filter(
      (message): message is ActivityMessage => message.type === 'skill' || message.type === 'shell',
    ),
  );

  function showCompression(status: 'running' | 'completed' | 'error') {
    if (!compressionWindow || suppressAutoWindows.value) return;
    void fw.open(compressionWindow.key, {
      component: ReasoningContent,
      props: {
        entries: [{ id: compressionWindow.key, text: compressionWindow.text }],
        theme: 'github-dark',
      },
      title:
        status === 'running'
          ? '🤯 Context compressing'
          : status === 'error'
            ? '⚠️ Context compression failed'
            : '🤯 Context compressed',
      variant: 'message',
      color: '#a78bfa',
      status,
    });
  }

  function openActivity(message: ActivityMessage, manual = true) {
    if (!manual && suppressAutoWindows.value) return;
    const shell = message.type === 'shell';
    void fw.open(`${manual ? 'history-' : ''}activity:${message.id}`, {
      component: shell ? ToolSection : ReasoningContent,
      props: shell
        ? {
            terminal: true,
            section: { code: `$ ${message.command}\n${message.output?.output ?? ''}` },
          }
        : { entries: [{ id: message.id, text: message.text }], theme: 'github-dark' },
      title: shell
        ? `🔧 [SHELL]${message.exit === undefined ? '' : ` [exit ${message.exit}]`} ${message.command.split('\n')[0]}`
        : `📚 ${message.name}`,
      variant: shell ? 'term' : 'message',
      status: shell && message.status === 'running' ? 'running' : 'completed',
      color: shell ? '#34d399' : '#a78bfa',
      ...(manual
        ? {
            expiry: Infinity,
            closable: true,
            resizable: true,
            focusOnOpen: true,
            scroll: 'manual' as const,
          }
        : {}),
    });
  }

  watch(
    () => state.selected.value?.id,
    () => {
      clearTimeout(timer);
      splash.value = '';
      liveCompression.value = undefined;
      if (compressionWindow) fw.close(compressionWindow.key);
      compressionWindow = undefined;
      seen.clear();
    },
    { flush: 'sync' },
  );

  const stop = state.onEvent((event) => {
    if (!('sessionID' in event.data) || event.data.sessionID !== state.selected.value?.id) return;
    if (seen.has(event.id)) return;
    let text = '';
    switch (event.type) {
      case 'session.moved':
        text = `Location → ${event.data.location.directory}`;
        break;
      case 'session.compaction.started':
        seen.add(event.id);
        compressionWindow = { key: `compaction:${event.id}`, text: '' };
        showCompression('running');
        liveCompression.value = { text: '🤯 Context compressing', created: event.created };
        return;
      case 'session.compaction.delta':
        seen.add(event.id);
        if (compressionWindow) {
          compressionWindow.text += event.data.text;
          showCompression('running');
        }
        return;
      case 'session.compaction.ended':
        seen.add(event.id);
        if (compressionWindow) {
          compressionWindow.text = event.data.text;
          showCompression('completed');
        }
        liveCompression.value = { text: '', created: event.created };
        return;
      case 'session.compaction.failed':
        seen.add(event.id);
        showCompression('error');
        liveCompression.value = { text: '⚠️ Context compression failed', created: event.created };
        return;
      case 'session.skill.activated':
        openActivity(
          {
            id: event.id.replace(/^evt_/, 'msg_'),
            type: 'skill',
            skill: event.data.id,
            name: event.data.name,
            text: event.data.text,
            time: { created: event.created },
          },
          false,
        );
        break;
      case 'session.shell.started':
      case 'session.shell.ended':
        openActivity(
          {
            id: event.data.shell.id,
            type: 'shell',
            shellID: event.data.shell.id,
            command: event.data.shell.command,
            status: event.data.shell.status,
            exit: event.data.shell.exit,
            output: 'output' in event.data ? event.data.output : undefined,
            time: { created: event.created },
          },
          false,
        );
        break;
      default:
        return;
    }
    seen.add(event.id);
    if (!text) return;
    showSplash(text);
  });
  onBeforeUnmount(() => {
    stop();
    clearTimeout(timer);
  });
  return { splash, splashKey, showSplash, compression, activities, openActivity };
}
