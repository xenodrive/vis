import { onBeforeUnmount, watch } from 'vue';
import type {
  SessionMessageInfo,
  SessionMessageAssistantTool,
  SessionInfo,
  OpenCodeEvent,
} from '@opencode/client';
import { useFloatingWindows } from './useFloatingWindows';
import type { useSessionState } from './useSessionState';
import { useSettings } from './useSettings';
import ReasoningContent from '../components/ToolWindow/Reasoning.vue';
import SubagentContent from '../components/ToolWindow/Subagent.vue';
import PermissionContent from '../components/ToolWindow/Permission.vue';
import FormContent from '../components/ToolWindow/FormRequest.vue';
import ToolOutput from '../components/ToolWindow/ToolOutput.vue';
import { toolOutput } from '../utils/protocol/tool-output';
import ActivityHistory from '../components/ToolWindow/ActivityHistory.vue';
import { useSessionActivity } from './useSessionActivity';
import ContentViewer from '../components/viewers/ContentViewer.vue';
import { toolColor } from '../components/ToolWindow/utils';
import {
  applyTranscriptEvent,
  eventSessionID,
  mergeMessageSnapshot,
  latestThinking,
} from '../utils/protocol/transcript';
import { presentTool } from '../utils/messagePresentation';
import type { HistoryWindowEntry } from '../types/message';
import type { ReasoningPart, ToolPart } from '../types/message';

export function useSessionWindows(state: ReturnType<typeof useSessionState>) {
  const fw = useFloatingWindows();
  const { suppressAutoWindows } = useSettings();
  const observed = new Map<string, string>();
  const children = new Map<string, SessionMessageInfo[]>();
  const fetching = new Set<string>();
  const requestKeys = new Set<string>();
  let generation = 0;
  let revision = 0;
  let read = 0;
  const touched = new Map<string, number>();
  const snapshots = new Map<string, number>();
  const liveMessages = new Set<string>();
  const activity = useSessionActivity(state, fw);

  function belongsToSelection(sessionID: string) {
    const visited = new Set<string>();
    let id: string | undefined = sessionID;
    while (id && !visited.has(id)) {
      if (id === state.selected.value?.id) return true;
      visited.add(id);
      id = state.sessions.value.find((session) => session.id === id)?.parentID;
    }
    return false;
  }

  function openTool(part: ToolPart, manual = false) {
    const toolState = part.state;
    const status = toolState.status === 'pending' ? 'running' : toolState.status;
    const input =
      part.invocation.state.status === 'streaming' ? undefined : part.invocation.state.input;
    const detail =
      typeof input?.path === 'string'
        ? input.path
        : typeof input?.command === 'string'
          ? input.command.split('\n')[0]
          : '';
    let files: string[] = [];
    let statusLabel: string | undefined;
    try {
      const output = toolOutput(part.invocation);
      files = output.files.map((file) => file.file);
      statusLabel = output.statusLabel;
    } catch (cause) {
      state.error.value = String(cause);
      return;
    }
    const targets = files.length
      ? files.map((path, index) => ({ path, index }))
      : [{ path: detail, index: undefined }];
    for (const target of targets)
      void fw.open(
        `${manual ? 'history-tool:' : 'tool:'}${part.id}${target.index === undefined ? '' : `:${target.index}`}`,
        {
          component: ToolOutput,
          props: { tool: part.invocation, fileIndex: target.index },
          variant: part.tool === 'shell' ? 'term' : files.length ? 'diff' : 'code',
          title: `🔧 [${part.tool.toUpperCase()}]${statusLabel ? ` [${statusLabel}]` : ''}${target.path ? ` ${target.path}` : ''}`,
          status,
          color: toolColor(
            part.tool === 'shell' ? 'bash' : part.tool === 'subagent' ? 'task' : part.tool,
          ),
          ...(manual
            ? {
                closable: true,
                resizable: true,
                focusOnOpen: true,
                scroll: 'manual' as const,
                expiry: Infinity,
              }
            : {}),
        },
      );
  }

  function observeTool(sessionID: string, messageID: string, tool: SessionMessageAssistantTool) {
    const part = presentTool(sessionID, messageID, tool);
    const signature = JSON.stringify(tool);
    const previous = observed.get(part.id);
    observed.set(part.id, signature);
    if (previous === signature || suppressAutoWindows.value) return;
    if (
      !liveMessages.has(messageID) &&
      (tool.state.status === 'completed' || tool.state.status === 'error')
    )
      return;
    if (tool.state.status === 'streaming') return;
    if (['patch', 'edit', 'read'].includes(tool.name) && tool.state.status === 'running') return;
    openTool(part);
  }

  function syncTranscript(sessionID: string, messages: SessionMessageInfo[]) {
    const initial = !observed.has(`session:${sessionID}`);
    if (messages.length) observed.set(`session:${sessionID}`, 'loaded');
    const thought = latestThinking(messages);
    const answers: Array<{ id: string; text: string }> = [];
    const isChild = sessionID !== state.selected.value?.id;
    const unfinished = isChild ? thought.assistantRunning : thought.running;
    for (const message of messages) {
      if (message.type !== 'assistant') continue;
      for (const [index, content] of message.content.entries()) {
        if (content.type === 'tool') observeTool(sessionID, message.id, content);
        if (
          content.type === 'text' &&
          (liveMessages.has(message.id) || message.time.completed === undefined)
        )
          answers.push({ id: `${message.id}:text:${index}`, text: content.text });
      }
    }
    if (suppressAutoWindows.value) return;
    const entries = isChild ? answers : thought.entries;
    const key = `${isChild ? 'subagent' : 'reasoning'}:${sessionID}`;
    if (!isChild && entries.length === 0) {
      if (fw.has(key)) void fw.close(key);
      return;
    }
    const signature = JSON.stringify({ entries, unfinished });
    const previous = observed.get(key);
    observed.set(key, signature);
    if (entries.length === 0 || previous === signature || (initial && !unfinished)) return;
    if (!unfinished && !messages.some((message) => liveMessages.has(message.id))) return;
    const session = state.sessions.value.find((session) => session.id === sessionID);
    void fw.open(key, {
      component: isChild ? SubagentContent : ReasoningContent,
      props: { entries, theme: 'github-dark' },
      variant: 'message',
      scroll: 'follow',
      title: isChild ? `🤖 ${session?.title ?? sessionID}` : '🤔 Thought',
      ...(!isChild ? { expiresAt: unfinished ? Infinity : Date.now() + 3000 } : {}),
      color: isChild ? '#60a5fa' : '#8b5cf6',
      status: unfinished ? 'running' : 'completed',
    });
  }

  watch(
    () => state.selected.value?.id,
    () => {
      generation++;
      observed.clear();
      liveMessages.clear();
      children.clear();
      fetching.clear();
      touched.clear();
      snapshots.clear();
      requestKeys.clear();
      fw.closeAll({ exclude: (key) => key.startsWith('shell:') });
    },
    { flush: 'sync' },
  );

  watch(state.messages, (messages) => {
    if (state.selected.value) syncTranscript(state.selected.value.id, messages);
  });

  async function syncChild(session: SessionInfo) {
    if (fetching.has(session.id)) return;
    fetching.add(session.id);
    const current = generation;
    const startedAt = revision;
    const readID = ++read;
    try {
      const incoming = await state.readTranscript(session.id);
      if (current !== generation) return;
      const messages = mergeMessageSnapshot(children.get(session.id) ?? [], incoming, {
        startedAt,
        read: readID,
        touched,
        snapshots,
      });
      children.set(session.id, messages);
      syncTranscript(session.id, messages);
    } catch (error) {
      if (current === generation) state.error.value = String(error);
    } finally {
      if (current === generation) fetching.delete(session.id);
    }
  }

  watch([state.sessions, () => state.selected.value?.id], ([sessions]) => {
    for (const session of sessions) {
      if (
        session.id !== state.selected.value?.id &&
        belongsToSelection(session.id) &&
        !children.has(session.id)
      )
        void syncChild(session);
    }
  });

  const stop = state.onEvent((event: OpenCodeEvent) => {
    const id = eventSessionID(event);
    if (id && belongsToSelection(id) && 'assistantMessageID' in event.data) {
      liveMessages.add(event.data.assistantMessageID);
    }
    if (!id || id === state.selected.value?.id || !belongsToSelection(id)) return;
    let transcript = children.get(id);
    if (!transcript) {
      transcript = [];
      children.set(id, transcript);
    }
    const messageID = applyTranscriptEvent(transcript, event);
    if (messageID) touched.set(messageID, ++revision);
    syncTranscript(id, transcript);
    if (event.type.startsWith('session.execution.') && event.type !== 'session.execution.started') {
      const session = state.sessions.value.find((session) => session.id === id);
      if (session) void syncChild(session);
    }
  });

  watch(
    [
      state.permissions,
      state.forms,
      state.busy,
      state.status,
      state.error,
      () => state.selected.value?.id,
    ],
    () => {
      const nextKeys = new Set<string>();
      for (const request of state.permissions.value) {
        if (!belongsToSelection(request.sessionID)) continue;
        const key = `permission:${request.id}`;
        nextKeys.add(key);
        void fw.open(key, {
          component: PermissionContent,
          props: {
            request,
            isSubmitting: state.busy.value || state.status.value !== 'connected',
            error: state.error.value,
            onReply: ({ reply }: { reply: 'once' | 'always' | 'reject' }) =>
              state.replyPermission(request, reply),
          },
          title: 'Permission request',
          variant: 'plain',
          width: 520,
          height: 390,
          color: '#f59e0b',
          scroll: 'manual',
          resizable: true,
          expiry: Infinity,
        });
      }
      for (const form of state.forms.value) {
        if (form.sessionID !== 'global' && !belongsToSelection(form.sessionID)) continue;
        const key = `question:${form.id}`;
        nextKeys.add(key);
        void fw.open(key, {
          component: FormContent,
          props: {
            form,
            disabled: state.busy.value || state.status.value !== 'connected',
            serverError: state.error.value,
            onReply: (answer: Parameters<typeof state.replyForm>[1]) =>
              state.replyForm(form, answer),
            onCancel: () => state.cancelForm(form),
          },
          title: form.title,
          variant: 'plain',
          width: 520,
          height: 420,
          color: '#60a5fa',
          scroll: 'manual',
          resizable: true,
          expiry: Infinity,
        });
      }
      for (const key of requestKeys) if (!nextKeys.has(key)) void fw.close(key);
      requestKeys.clear();
      for (const key of nextKeys) requestKeys.add(key);
    },
    { immediate: true },
  );

  function openReasoning(part: ReasoningPart) {
    void fw.open(`history-reasoning:${part.id}`, {
      component: ReasoningContent,
      props: { entries: [{ id: part.id, text: part.text }], theme: 'github-dark' },
      title: '🤔 Thought',
      variant: 'message',
      color: '#8b5cf6',
      scroll: 'manual',
      closable: true,
      resizable: true,
      focusOnOpen: true,
      expiry: Infinity,
    });
  }

  function showHistory({ entries }: { entries: HistoryWindowEntry[] }) {
    void fw.open('thread-history', {
      component: ActivityHistory,
      props: {
        entries,
        activities: activity.activities.value,
        onActivityClick: activity.openActivity,
        theme: 'github-dark',
        onToolClick: (part: ToolPart) => openTool(part, true),
        onReasoningClick: openReasoning,
      },
      title: 'Thread History',
      variant: 'message',
      scroll: 'follow',
      smoothEngine: 'native',
      closable: true,
      resizable: true,
      focusOnOpen: true,
      expiry: Infinity,
      width: 720,
      height: 520,
    });
  }

  function openImage({ url, filename }: { url: string; filename: string }) {
    void fw.open(`image-viewer:${url}`, {
      component: ContentViewer,
      props: { path: filename, imageSrc: url },
      title: filename,
      closable: true,
      resizable: true,
      focusOnOpen: true,
      scroll: 'manual',
      expiry: Infinity,
      width: 800,
      height: 600,
    });
  }

  onBeforeUnmount(stop);
  return { fw, showHistory, openImage, belongsToSelection, activity };
}
