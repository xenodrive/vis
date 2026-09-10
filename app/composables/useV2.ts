import { computed, onBeforeUnmount, ref, shallowRef, triggerRef, watch } from 'vue';
import type {
  AgentInfo,
  CommandInfo,
  FormAnswer,
  FormInfo,
  ModelInfo,
  ModelRef,
  OpenCodeClient,
  OpenCodeEvent,
  PermissionReply,
  PermissionRequest,
  Project,
  SessionInfo,
  SessionInboxInfo,
  SessionMessageInfo,
  LocationRef,
} from '@opencode-ai/client';
import EventWorker from '../workers/v2-events?sharedworker';
import { createClient, errorMessage, type Connection } from '../v2/connection';
import { createPtyClient } from '../v2/pty';
import { compareProjects } from '../v2/projects';
import type { EventCommand, EventMessage } from '../v2/events';
import { applyTranscriptEvent, eventSessionID, mergeMessageSnapshot } from '../v2/transcript';
import type { PendingPrompt } from '../v2/pending-prompts';
import { updateSessionSettings } from '../v2/session-settings';
import { randomUUID } from '../utils/uuid';

export function useV2() {
  const status = ref<'disconnected' | 'connecting' | 'connected' | 'reconnecting'>('disconnected');
  const error = ref('');
  const streamError = ref('');
  const idleNotifications = ref<string[]>([]);
  function syncAttention() {
    sendWorker({
      type: 'attention',
      sessionID: !document.hidden && document.hasFocus() ? selected.value?.id : undefined,
    });
  }
  window.addEventListener('focus', syncAttention);
  window.addEventListener('blur', syncAttention);
  document.addEventListener('visibilitychange', syncAttention);
  function requestNotifications() {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default')
      void Notification.requestPermission();
  }
  window.addEventListener('pointerdown', requestNotifications, { once: true });
  onBeforeUnmount(() => {
    window.removeEventListener('focus', syncAttention);
    window.removeEventListener('blur', syncAttention);
    document.removeEventListener('visibilitychange', syncAttention);
    window.removeEventListener('pointerdown', requestNotifications);
  });
  const version = ref('');
  const busy = ref(false);
  const loading = ref(false);
  const directory = ref('');
  const sessions = shallowRef<SessionInfo[]>([]);
  const projects = shallowRef<Project[]>([]);
  const recentSessions = shallowRef<SessionInfo[]>([]);
  const projectActivity = computed(() => {
    const activity = new Map<string, number>();
    for (const session of recentSessions.value) {
      const updated = session.time.updated;
      const previous = activity.get(session.projectID);
      if (Number.isFinite(updated) && (previous === undefined || updated > previous))
        activity.set(session.projectID, updated);
    }
    return activity;
  });
  const sortedProjects = computed(() =>
    [...projects.value].sort((a, b) => compareProjects(a, b, projectActivity.value)),
  );
  const selected = shallowRef<SessionInfo>();
  const messages = shallowRef<SessionMessageInfo[]>([]);
  const inbox = shallowRef<SessionInboxInfo[]>([]);
  const outgoing = ref<PendingPrompt[]>([]);
  const pendingPrompts = computed(() => {
    const visible = new Set(messages.value.map((message) => message.id));
    const items = new Map<string, PendingPrompt>();
    for (const item of inbox.value) {
      if (item.type !== 'user' || visible.has(item.id)) continue;
      items.set(item.id, {
        id: item.id,
        sessionID: item.sessionID,
        text: item.payload.text,
        files: item.payload.files?.map((file) => file.name ?? file.mime) ?? [],
        status: 'accepted',
      });
    }
    for (const item of outgoing.value) {
      if (item.sessionID === selected.value?.id && !visible.has(item.id)) items.set(item.id, item);
    }
    return [...items.values()];
  });
  const permissions = shallowRef<PermissionRequest[]>([]);
  const forms = shallowRef<FormInfo[]>([]);
  const agents = shallowRef<AgentInfo[]>([]);
  const commands = shallowRef<CommandInfo[]>([]);
  const models = shallowRef<ModelInfo[]>([]);
  const defaultModel = shallowRef<ModelRef>();
  const active = ref<Record<string, boolean>>({});
  const activityStarts = new Map<string, number>();
  const sessionCursor = ref<string>();
  const messageCursor = ref<string>();
  const ready = ref(false);
  const running = computed(() => Boolean(selected.value && active.value[selected.value.id]));
  let client: OpenCodeClient | undefined;
  let worker: SharedWorker | undefined;
  let connection: Connection | undefined;
  let abort = new AbortController();
  let epoch = 0;
  let selection = 0;
  let loadingRevision = 0;
  let eventRevision = 0;
  let controlRevision = 0;
  let requestRevision = 0;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let listRevision = 0;
  let historyLoaded = false;
  let messageLookahead:
    | { message: SessionMessageInfo; startedAt: number; read: number }
    | undefined;
  let sessionsLoaded = false;
  let sessionLookahead: SessionInfo | undefined;
  let messageRead = 0;
  const snapshotReads = new Map<string, number>();
  const requestLocations = new Map<string, LocationRef>();
  const formLocations = new Map<string, LocationRef>();
  let syncing = false;
  let syncAgain = false;
  const touched = new Map<string, number>();
  const listeners = new Set<(event: OpenCodeEvent) => void>();
  watch(() => selected.value?.id, syncAttention);

  function api() {
    if (!client) throw new Error('Connect to an OpenCode V2 server first.');
    return client;
  }
  function options() {
    return { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]) };
  }
  function location() {
    const info = selected.value?.location;
    return { directory: info?.directory ?? directory.value, workspace: info?.workspaceID };
  }
  function report(cause: unknown) {
    error.value = errorMessage(cause);
  }

  async function perform(action: () => Promise<void>) {
    if (busy.value) return;
    busy.value = true;
    error.value = '';
    const current = epoch;
    try {
      await action();
    } catch (cause) {
      if (current === epoch) report(cause);
    } finally {
      if (current === epoch) busy.value = false;
    }
  }

  function sendWorker(message: EventCommand) {
    worker?.port.postMessage(message);
  }

  function stopEvents() {
    sendWorker({ type: 'disconnect' });
    worker?.port.close();
    worker = undefined;
    clearInterval(heartbeat);
  }

  function disconnect() {
    epoch++;
    selection++;
    abort.abort();
    abort = new AbortController();
    stopEvents();
    clearTimeout(refreshTimer);
    refreshTimer = undefined;
    client = undefined;
    connection = undefined;
    ready.value = false;
    busy.value = false;
    loadingRevision++;
    loading.value = false;
    status.value = 'disconnected';
    streamError.value = '';
    selected.value = undefined;
    sessions.value = [];
    recentSessions.value = [];
    projects.value = [];
    messages.value = [];
    outgoing.value = [];
    permissions.value = [];
    forms.value = [];
    inbox.value = [];
    agents.value = [];
    commands.value = [];
    models.value = [];
    active.value = {};
    activityStarts.clear();
    touched.clear();
    snapshotReads.clear();
    requestLocations.clear();
    formLocations.clear();
    historyLoaded = false;
    sessionsLoaded = false;
    sessionCursor.value = undefined;
    sessionLookahead = undefined;
    messageCursor.value = undefined;
    messageLookahead = undefined;
  }

  async function loadSessions(more = false) {
    if (more && !sessionCursor.value) return;
    const pending = more ? sessionLookahead : undefined;
    const pageSize = 50 - (pending ? 1 : 0);
    const current = epoch;
    const revision = ++listRevision;
    const result = await api().session.list(
      {
        limit: pageSize + 1,
        ...(more ? { cursor: sessionCursor.value } : { order: 'desc' as const }),
      },
      options(),
    );
    if (current !== epoch || revision !== listRevision) return;
    const page = result.data.slice(0, pageSize);
    if (!more) recentSessions.value = page;
    const map = new Map(sessions.value.map((session) => [session.id, session]));
    if (pending && !map.has(pending.id)) map.set(pending.id, pending);
    for (const session of page) map.set(session.id, session);
    if (selected.value && !map.has(selected.value.id)) map.set(selected.value.id, selected.value);
    sessions.value = [...map.values()].sort((a, b) => b.time.updated - a.time.updated);
    if (more || !sessionsLoaded) {
      // The API cursor points past the lookahead, so carry it into the next page.
      sessionLookahead = result.data[pageSize];
      sessionCursor.value = sessionLookahead ? (result.cursor.next ?? undefined) : undefined;
    }
    sessionsLoaded = true;
  }

  async function loadCatalog() {
    const current = epoch;
    const scope = selection;
    const [agentList, modelList, commandList, modelDefault] = await Promise.all([
      api().agent.list({ location: location() }, options()),
      api().model.list({ location: location() }, options()),
      api().command.list({ location: location() }, options()),
      api().model.default({ location: location() }, options()),
    ]);
    if (current !== epoch || scope !== selection) return;
    agents.value = agentList.data;
    defaultModel.value = modelDefault.data
      ? { providerID: modelDefault.data.providerID, id: modelDefault.data.id }
      : undefined;
    commands.value = commandList.data;
    models.value = modelList.data.filter((model) => model.enabled);
  }

  async function loadRequests() {
    const current = epoch;
    const scope = selection;
    const before = requestRevision;
    const register = (ref: LocationRef) => requestLocations.set(JSON.stringify(ref), ref);
    register({ directory: directory.value });
    for (const session of sessions.value) register(session.location);
    if (selected.value) register(selected.value.location);
    const snapshots = await Promise.all(
      [...requestLocations.values()].map(async (ref) => {
        const query = { directory: ref.directory, workspace: ref.workspaceID };
        const [permissionList, formList] = await Promise.all([
          api().permission.request.list({ location: query }, options()),
          api().form.request.list({ location: query }, options()),
        ]);
        return { ref, permissions: permissionList.data, forms: formList.data };
      }),
    );
    if (current !== epoch || scope !== selection) return;
    // Request settlement events invalidate in-flight snapshots.
    if (before !== requestRevision) {
      scheduleRefresh();
      return;
    }
    permissions.value = [
      ...new Map(
        snapshots
          .flatMap((snapshot) => snapshot.permissions)
          .map((request) => [request.id, request]),
      ).values(),
    ];
    forms.value = [
      ...new Map(
        snapshots.flatMap((snapshot) => snapshot.forms).map((form) => [form.id, form]),
      ).values(),
    ];
    for (const snapshot of snapshots)
      for (const form of snapshot.forms) formLocations.set(form.id, snapshot.ref);
  }

  async function loadMessages(more = false) {
    const id = selected.value?.id;
    if (!id || (more && !messageCursor.value)) return;
    const pending = more ? messageLookahead : undefined;
    const pageSize = 50 - (pending ? 1 : 0);
    const current = epoch;
    const scope = selection;
    const before = eventRevision;
    const read = ++messageRead;
    const result = await api().message.list(
      {
        sessionID: id,
        limit: pageSize + 1,
        ...(more ? { cursor: messageCursor.value } : { order: 'desc' as const }),
      },
      options(),
    );
    if (current !== epoch || scope !== selection) return;
    const page = result.data.slice(0, pageSize);
    let currentMessages = messages.value;
    if (pending) {
      currentMessages = mergeMessageSnapshot(currentMessages, [pending.message], {
        startedAt: pending.startedAt,
        read: pending.read,
        touched,
        snapshots: snapshotReads,
      });
    }
    messages.value = mergeMessageSnapshot(currentMessages, page, {
      startedAt: before,
      read,
      touched,
      snapshots: snapshotReads,
    });
    const delivered = new Set(page.map((message) => message.id));
    if (pending) delivered.add(pending.message.id);
    outgoing.value = outgoing.value.filter(
      (item) => item.sessionID !== id || !delivered.has(item.id),
    );
    if (more || !historyLoaded) {
      // The API cursor points past the lookahead, so carry it into the next page.
      const message = result.data[pageSize];
      messageLookahead = message ? { message, startedAt: before, read } : undefined;
      messageCursor.value = message ? (result.cursor.next ?? undefined) : undefined;
    }
    historyLoaded = true;
  }

  async function syncSession() {
    const id = selected.value?.id;
    if (!id) return;
    const current = epoch;
    const scope = selection;
    const before = controlRevision;
    const [info, pending] = await Promise.all([
      api().session.get({ sessionID: id }, options()),
      api().session.inbox.list({ sessionID: id }, options()),
      loadMessages(),
    ]);
    if (current !== epoch || scope !== selection) return;
    if (before !== controlRevision) {
      scheduleRefresh();
      return;
    }
    selected.value = info;
    inbox.value = pending;
    if (info.location.directory !== directory.value) {
      directory.value = info.location.directory;
      await loadCatalog();
    }
  }

  async function refresh() {
    if (!client || status.value !== 'connected') return;
    if (syncing) {
      syncAgain = true;
      return;
    }
    syncing = true;
    const current = epoch;
    const before = controlRevision;
    try {
      await loadSessions();
      if (current !== epoch) return;
      const [projectList, activeList] = await Promise.all([
        api().project.list(options()),
        api().session.active(options()),
        syncSession(),
        loadRequests(),
      ]);
      if (current !== epoch) return;
      projects.value = projectList;
      if (before === controlRevision)
        active.value = Object.fromEntries(Object.keys(activeList).map((id) => [id, true]));
      else syncAgain = true;
    } catch (cause) {
      if (current === epoch) report(cause);
    } finally {
      syncing = false;
      if (syncAgain) {
        syncAgain = false;
        scheduleRefresh();
      }
    }
  }

  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      void refresh();
    }, 180);
  }

  function receive(events: OpenCodeEvent[]) {
    for (const event of events) {
      if (event.type === 'server.connected') continue;
      eventRevision++;
      if (
        event.location &&
        (event.type.startsWith('permission.') || event.type.startsWith('form.'))
      ) {
        requestLocations.set(JSON.stringify(event.location), event.location);
        if (event.type === 'form.created') formLocations.set(event.data.form.id, event.location);
      }
      if (event.type.startsWith('permission.') || event.type.startsWith('form.')) requestRevision++;
      if (
        event.type.startsWith('session.execution.') ||
        event.type.startsWith('session.inbox.') ||
        [
          'session.created',
          'session.deleted',
          'session.moved',
          'session.renamed',
          'session.agent.selected',
          'session.model.selected',
        ].includes(event.type)
      )
        controlRevision++;
      const sessionID = eventSessionID(event);
      if (event.type === 'session.inbox.cancelled') dismissPrompt(event.data.inboxID);
      if (event.type === 'session.execution.started') {
        active.value[event.data.sessionID] = true;
        activityStarts.set(event.data.sessionID, eventRevision);
      }
      if (
        [
          'session.execution.succeeded',
          'session.execution.failed',
          'session.execution.interrupted',
        ].includes(event.type) &&
        sessionID
      ) {
        active.value[sessionID] = false;
      }
      if (event.type === 'permission.asked') {
        permissions.value = [
          ...permissions.value.filter((request) => request.id !== event.data.id),
          event.data,
        ];
      }
      if (event.type === 'permission.replied')
        permissions.value = permissions.value.filter(
          (request) => request.id !== event.data.requestID,
        );
      if (event.type === 'form.created')
        forms.value = [
          ...forms.value.filter((form) => form.id !== event.data.form.id),
          event.data.form,
        ];
      if (event.type === 'form.replied' || event.type === 'form.cancelled')
        forms.value = forms.value.filter((form) => form.id !== event.data.id);
      if (event.type === 'session.deleted') {
        recentSessions.value = recentSessions.value.filter(
          (session) => session.id !== event.data.sessionID,
        );
        sessions.value = sessions.value.filter((session) => session.id !== event.data.sessionID);
        if (selected.value?.id === event.data.sessionID) clearSelection();
      }
      if (sessionID === selected.value?.id) {
        const changed = applyTranscriptEvent(messages.value, event);
        if (changed) touched.set(changed, eventRevision);
        if (event.type === 'session.message.content.updated') {
          const message = messages.value.find((item) => item.id === event.data.messageID);
          if (message?.type === 'assistant') message.content = event.data.content;
          touched.set(event.data.messageID, eventRevision);
        }
        if (event.type === 'session.revert.committed') {
          selection++;
          messages.value = messages.value.filter((message) => message.id < event.data.to);
          if (loading.value) void loadSelectedSession();
        }
      }
      if (
        !event.type.endsWith('.delta') &&
        event.type !== 'session.tool.progress' &&
        event.type !== 'session.usage.updated'
      )
        scheduleRefresh();
      for (const listener of listeners) listener(event);
    }
    triggerRef(messages);
  }

  function startEvents() {
    if (!connection) return;
    stopEvents();
    const current = epoch;
    worker = new EventWorker();
    worker.port.onmessage = ({ data }: MessageEvent<EventMessage>) => {
      if (current !== epoch) return;
      if (data.type === 'events') receive(data.events);
      else if (data.type === 'idle-notifications') idleNotifications.value = data.sessionIDs;
      else if (data.type === 'notify') {
        if (
          typeof Notification === 'undefined' ||
          Notification.permission !== 'granted' ||
          (!document.hidden && document.hasFocus())
        )
          return;
        const title = sessions.value.find((session) => session.id === data.sessionID)?.title;
        const notification = new Notification(
          data.kind === 'idle'
            ? 'Session idle'
            : data.kind === 'permission'
              ? 'Permission'
              : 'Question',
          {
            body: `${title ?? data.sessionID}${data.kind === 'idle' ? ' is now idle.' : ' requires your response.'}`,
            tag: `vis-${data.kind}-${data.sessionID}`,
          },
        );
        notification.onclick = () => {
          window.focus();
          void selectSessionByID(data.sessionID);
          notification.close();
        };
      } else {
        status.value = data.status;
        streamError.value = data.error ?? '';
        if (data.status === 'connected') {
          // Rebuild the selected transcript after a gap; live SSE has no replay.
          messages.value = [];
          selection++;
          sessions.value = [];
          sessionsLoaded = false;
          sessionLookahead = undefined;
          sessionCursor.value = undefined;
          historyLoaded = false;
          snapshotReads.clear();
          touched.clear();
          messageCursor.value = undefined;
          messageLookahead = undefined;
          if (selected.value) void loadSelectedSession();
          void refresh();
        }
      }
    };
    worker.onerror = (event) => {
      status.value = 'reconnecting';
      streamError.value = event.message || 'The shared event worker failed. Reconnect to resume.';
    };
    worker.port.start();
    sendWorker({ type: 'connect', connection });
    syncAttention();
    heartbeat = setInterval(() => sendWorker({ type: 'heartbeat' }), 20000);
  }

  async function connect(input: Connection) {
    disconnect();
    error.value = '';
    status.value = 'connecting';
    const current = epoch;
    try {
      if (typeof SharedWorker === 'undefined')
        throw new Error('This version of vis requires SharedWorker support.');
      client = createClient(input);
      const [health, info] = await Promise.all([
        api().health.get(options()),
        api().location.get(undefined, options()),
      ]);
      if (current !== epoch) return;
      version.value = health.version;
      directory.value = info.directory;
      connection = { ...input };
      await loadCatalog();
      if (current !== epoch) return;
      ready.value = true;
      startEvents();
    } catch (cause) {
      if (current !== epoch) return;
      disconnect();
      report(cause);
    }
  }

  function clearSelection() {
    loadingRevision++;
    loading.value = false;
    defaultModel.value = undefined;
    commands.value = [];
    selection++;
    selected.value = undefined;
    messages.value = [];
    inbox.value = [];
    messageCursor.value = undefined;
    messageLookahead = undefined;
    touched.clear();
    snapshotReads.clear();
    historyLoaded = false;
  }

  async function selectSession(session: SessionInfo) {
    clearSelection();
    selected.value = session;
    directory.value = session.location.directory;
    error.value = '';
    await loadSelectedSession();
  }

  async function loadSelectedSession() {
    const current = epoch;
    const scope = selection;
    const revision = ++loadingRevision;
    loading.value = true;
    try {
      await Promise.all([syncSession(), loadCatalog(), loadRequests()]);
    } catch (cause) {
      if (current === epoch && scope === selection) report(cause);
    } finally {
      if (revision === loadingRevision) loading.value = false;
    }
  }

  async function createSession(path: string, workspace?: string) {
    await perform(async () => {
      if (!path.trim()) throw new Error('Enter an absolute directory on the OpenCode server.');
      const session = await api().session.create(
        { location: { directory: path.trim(), workspaceID: workspace } },
        options(),
      );
      await selectSession(session);
      await loadSessions();
    });
  }

  async function applySettings(sessionID: string, agent?: string, model?: ModelRef) {
    if (!agent && !model) return;
    const info = await updateSessionSettings(
      { sessionID, agent, model },
      api().session,
      options(),
      () => ({
        connection: epoch,
        started: activityStarts.get(sessionID),
        running: !!active.value[sessionID],
      }),
    );
    if (selected.value?.id === sessionID)
      selected.value = { ...selected.value, agent: info.agent, model: info.model };
  }

  function dismissPrompt(id: string) {
    outgoing.value = outgoing.value.filter((item) => item.id !== id);
  }

  async function send(
    text: string,
    agent?: string,
    model?: ModelRef,
    files: Array<{ uri: string; name: string }> = [],
  ) {
    const id = selected.value?.id;
    if (!id || (!text.trim() && !files.length) || busy.value || status.value !== 'connected')
      return false;
    const slash = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
    const command = slash && commands.value.find((command) => command.name === slash[1]);
    const delivery = 'steer' as const;
    const current = epoch;
    const pending: PendingPrompt | undefined =
      !command && slash?.[1] !== 'compact'
        ? {
            id: randomUUID(),
            sessionID: id,
            agent: agent ?? selected.value?.agent,
            text,
            files: files.map((file) => file.name),
            status: 'sending',
          }
        : undefined;
    if (pending) outgoing.value.push(pending);
    let sent = false;
    await perform(async () => {
      if (slash?.[1] === 'compact') {
        if (files.length) throw new Error('/compact does not accept attachments.');
        if (slash[2]?.trim()) throw new Error('/compact does not accept arguments.');
        await api().session.compact({ sessionID: id, delivery }, options());
        sent = true;
        scheduleRefresh();
        return;
      }
      await applySettings(id, agent, model);
      if (current !== epoch) throw new Error('The connection changed before sending the message.');
      if (command) {
        await api().session.command(
          { sessionID: id, command: command.name, text: slash?.[2] ?? '', delivery, files },
          options(),
        );
      } else {
        const accepted = await api().session.prompt(
          { sessionID: id, text, delivery, files },
          options(),
        );
        if (pending) {
          const item = outgoing.value.find((item) => item.id === pending.id);
          if (item) {
            item.id = accepted.id;
            item.status = 'accepted';
          }
        }
      }
      sent = true;
      scheduleRefresh();
    });
    if (!sent && pending) {
      const item = outgoing.value.find((item) => item.id === pending.id);
      if (item) {
        item.status = 'failed';
        item.error = error.value;
      }
    }
    return sent;
  }

  async function switchAgent(agent: string) {
    const sessionID = selected.value?.id;
    if (!sessionID || !agent) return;
    await perform(async () => {
      await applySettings(sessionID, agent);
      await syncSession();
    });
  }

  async function switchModel(model: ModelRef) {
    const sessionID = selected.value?.id;
    if (!sessionID) return;
    await perform(async () => {
      await applySettings(sessionID, undefined, model);
      await syncSession();
    });
  }

  async function interrupt() {
    const sessionID = selected.value?.id;
    if (!sessionID) return;
    await perform(async () => {
      await api().session.interrupt({ sessionID }, options());
      scheduleRefresh();
    });
  }

  async function replyPermission(request: PermissionRequest, reply: PermissionReply) {
    await perform(async () => {
      await api().permission.reply(
        { sessionID: request.sessionID, requestID: request.id, reply },
        options(),
      );
      permissions.value = permissions.value.filter((item) => item.id !== request.id);
    });
  }

  async function replyForm(form: FormInfo, answer: FormAnswer) {
    await perform(async () => {
      await api().form.reply(
        { sessionID: form.sessionID, formID: form.id, answer },
        formOptions(form),
      );
      forms.value = forms.value.filter((item) => item.id !== form.id);
    });
  }

  async function cancelForm(form: FormInfo) {
    await perform(async () => {
      await api().form.cancel({ sessionID: form.sessionID, formID: form.id }, formOptions(form));
      forms.value = forms.value.filter((item) => item.id !== form.id);
    });
  }

  function formOptions(form: FormInfo) {
    const ref = formLocations.get(form.id);
    const headers: Record<string, string> = {};
    if (ref) headers['x-opencode-directory'] = encodeURIComponent(ref.directory);
    if (ref?.workspaceID) headers['x-opencode-workspace'] = ref.workspaceID;
    return { ...options(), headers };
  }

  async function cancelInput(item: SessionInboxInfo) {
    const sessionID = selected.value?.id;
    if (!sessionID) return;
    await perform(async () => {
      await api().session.inbox.cancel({ sessionID, inboxID: item.id }, options());
      dismissPrompt(item.id);
      scheduleRefresh();
    });
  }

  function onEvent(listener: (event: OpenCodeEvent) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  async function listDirectory(path: string, signal: AbortSignal) {
    const response = await api().file.list(
      { location: { directory: path }, path: '.' },
      { signal },
    );
    return response.data.map((entry) => {
      const name = entry.path.split('/').filter(Boolean).at(-1) ?? entry.path;
      return {
        name,
        path: entry.path,
        absolute: `${path.replace(/\/$/, '')}/${name}`,
        type: entry.type,
        ignored: false,
      };
    });
  }

  function listFiles(scope: LocationRef, path: string, signal: AbortSignal) {
    return api().file.list(
      { location: { directory: scope.directory, workspace: scope.workspaceID }, path },
      { signal: AbortSignal.any([signal, options().signal]) },
    );
  }

  function readFile(scope: LocationRef, path: string, signal: AbortSignal) {
    return api().file.read(
      { location: { directory: scope.directory, workspace: scope.workspaceID }, path },
      { signal: AbortSignal.any([signal, options().signal]) },
    );
  }

  async function readVcs(scope: LocationRef, signal: AbortSignal) {
    const location = { directory: scope.directory, workspace: scope.workspaceID };
    const request = { signal: AbortSignal.any([signal, options().signal]) };
    const [info, status] = await Promise.all([
      api().vcs.get({ location }, request),
      api().vcs.status({ location }, request),
    ]);
    return { info: info.data, status: status.data };
  }

  async function readWorkingDiff(scope: LocationRef, signal: AbortSignal) {
    return (
      await api().vcs.diff(
        { location: { directory: scope.directory, workspace: scope.workspaceID }, mode: 'working' },
        { signal: AbortSignal.any([signal, options().signal]) },
      )
    ).data;
  }

  async function readTranscript(sessionID: string) {
    return (
      await api().message.list({ sessionID, order: 'desc', limit: 50 }, options())
    ).data.reverse();
  }

  async function selectSessionByID(sessionID: string) {
    await perform(async () => {
      const info = await api().session.get({ sessionID }, options());
      await selectSession(info);
    });
  }

  async function removeSession(sessionID: string) {
    await perform(async () => {
      await api().session.remove({ sessionID }, options());
      sessions.value = sessions.value.filter((session) => session.id !== sessionID);
      if (selected.value?.id === sessionID) clearSelection();
    });
  }

  function suspend() {
    stopEvents();
    if (ready.value) status.value = 'reconnecting';
  }
  function resume() {
    if (ready.value) startEvents();
  }
  window.addEventListener('pagehide', suspend);
  window.addEventListener('pageshow', resume);
  onBeforeUnmount(() => {
    disconnect();
    window.removeEventListener('pagehide', suspend);
    window.removeEventListener('pageshow', resume);
  });

  async function listProjectSessions(project: string, search: string, cursor?: string) {
    return api().session.list(
      {
        limit: 50,
        ...(cursor ? { cursor } : { project, search, parentID: null, order: 'desc' as const }),
      },
      options(),
    );
  }

  async function listLocationSessions(
    place: LocationRef,
    search: string,
    cursor: string | undefined,
    limit: number,
  ) {
    return api().session.list(
      {
        limit,
        ...(cursor
          ? { cursor }
          : {
              directory: place.directory,
              workspace: place.workspaceID,
              search,
              parentID: null,
              order: 'desc' as const,
            }),
      },
      options(),
    );
  }

  async function renameSession(sessionID: string, title: string) {
    await perform(async () => {
      await api().session.rename({ sessionID, title }, options());
      if (selected.value?.id === sessionID) await syncSession();
      await loadSessions();
    });
  }

  async function renameProject(projectID: string, name: string) {
    await perform(async () => {
      await api().project.update({ projectID, name }, options());
      projects.value = await api().project.list(options());
    });
  }

  async function updateProjectSettings(
    project: Project,
    input: { name: string; icon: { color: string; override: string }; commands: { start: string } },
  ) {
    const current = epoch;
    await api().project.update(
      { projectID: project.id, ...input, icon: { ...project.icon, ...input.icon } },
      options(),
    );
    const list = await api().project.list(options());
    if (current === epoch) projects.value = list;
  }

  return {
    idleNotifications,
    async runGitCommand(command: string, title = 'Git inspection') {
      const shell = api().shell;
      const scope = location();
      const signal = abort.signal;
      const started = await shell.create(
        {
          location: scope,
          command: `/bin/sh -c '${command.replaceAll("'", "'\\''")}'`,
          timeout: 120000,
          metadata: { source: 'vis-git', title },
        },
        { signal },
      );
      const id = started.data.id;
      try {
        let info = started.data;
        while (info.status === 'running') {
          await new Promise<void>((resolve, reject) => {
            signal.throwIfAborted();
            const cancel = () => {
              clearTimeout(timer);
              reject(signal.reason);
            };
            const timer = setTimeout(() => {
              signal.removeEventListener('abort', cancel);
              resolve();
            }, 200);
            signal.addEventListener('abort', cancel, { once: true });
          });
          info = (await shell.get({ id, location: scope }, { signal })).data;
        }
        let output = '';
        let cursor = 0;
        for (;;) {
          const page = (
            await shell.output({ id, location: scope, cursor, limit: 65536 }, { signal })
          ).data;
          if (page.truncated) throw new Error('Git command output was truncated.');
          output += page.output;
          if (page.cursor >= page.size) break;
          if (page.cursor <= cursor) throw new Error('Git command output cursor did not advance.');
          cursor = page.cursor;
        }
        if (info.status !== 'exited' || info.exit !== 0)
          throw new Error(`${title} failed (${info.status}, exit ${info.exit}):\n${output}`);
        return output;
      } finally {
        await shell.remove({ id, location: scope }, { signal: AbortSignal.timeout(10000) });
      }
    },
    async generateCommitMessage(prompt: string, signal: AbortSignal, model: ModelRef) {
      const response = await api().generate.text(
        { prompt, model },
        {
          signal: AbortSignal.any([signal, options().signal]),
        },
      );
      return response.text;
    },
    listProjectSessions,
    listLocationSessions,
    renameSession,
    renameProject,
    updateProjectSettings,
    ptyClient(scope: LocationRef) {
      if (!connection) throw new Error('Connect to OpenCode before opening a terminal.');
      return createPtyClient(api(), connection.url, scope);
    },
    readVcs,
    readWorkingDiff,
    listFiles,
    readFile,
    onEvent,
    listDirectory,
    readTranscript,
    selectSessionByID,
    removeSession,
    status,
    error,
    streamError,
    version,
    busy,
    loading,
    directory,
    ready,
    running,
    sessions,
    projects,
    projectActivity,
    sortedProjects,
    selected,
    messages,
    inbox,
    pendingPrompts,
    dismissPrompt,
    permissions,
    forms,
    agents,
    commands,
    models,
    defaultModel,
    active,
    sessionCursor,
    messageCursor,
    connect,
    disconnect,
    selectSession,
    createSession,
    send,
    switchAgent,
    switchModel,
    interrupt,
    replyPermission,
    replyForm,
    cancelForm,
    cancelInput,
    refresh,
    reconnect: startEvents,
    moreSessions: () => perform(() => loadSessions(true)),
    moreMessages: () => perform(() => loadMessages(true)),
  };
}
