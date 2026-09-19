<template>
  <div class="app">
    <Transition :key="activity.splashKey.value" name="activity-splash" appear>
      <div v-if="activity.splash.value" class="activity-splash" role="status">
        <template v-if="typeof activity.splash.value === 'string'">
          {{ activity.splash.value }}
        </template>
        <div v-else class="selection-splash">
          <div class="selection-splash-agent" :style="{ color: activity.splash.value.color }">
            {{ activity.splash.value.agent }}
          </div>
          <div v-if="activity.splash.value.model" class="selection-splash-model">
            <div class="selection-splash-provider">{{ activity.splash.value.model.provider }}</div>
            <div>{{ activity.splash.value.model.name }}</div>
          </div>
          <div
            class="selection-splash-variant"
            :class="{ 'is-explicit': activity.splash.value.variant !== undefined }"
            v-text="activity.splash.value.variant ?? '<default>'"
          ></div>
        </div>
      </div>
    </Transition>
    <template v-if="ready">
      <header v-show="headerVisible" id="app-header" ref="headerEl" class="app-header">
        <TopPanel
          :show-files-toggle="isMobile"
          :files-expanded="!sidePanelCollapsed"
          @toggle-files="sidePanelCollapsed = !sidePanelCollapsed"
          :tree-data="topPanelTreeData"
          :notification-sessions="notificationSessions"
          :project-directory="currentProject?.canonical ?? directory"
          :active-directory="directory"
          :selected-session-id="selected?.id ?? ''"
          :disabled-actions="['worktree', 'archive', 'project']"
          @open-shell="pty.open"
          :has-more-sessions="!!sessionCursor"
          :loading-sessions="busy"
          @load-more="state.moreSessions"
          @select-notification="selectNotification"
          @new-session="state.createSession(directory)"
          @new-session-in="state.createSession($event.directory)"
          @select-session="state.selectSessionByID($event.sessionId)"
          @delete-session="state.removeSession"
          @open-directory="isProjectPickerOpen = true"
          @open-settings="isSettingsOpen = true"
          @logout="logout"
          @dropdown-closed="focusInput"
        >
          <template #selection
            ><SessionPicker ref="sessionPickerRef" :state="state" :mobile="isMobile"
          /></template>
        </TopPanel>
      </header>
      <div
        ref="appBodyEl"
        class="app-body"
        :class="{ 'todo-collapsed': sidePanelCollapsed }"
        :style="
          sidePanelWidth !== null ? { '--todo-panel-width': `${sidePanelWidth}px` } : undefined
        "
      >
        <button
          v-if="isMobile && !sidePanelCollapsed"
          class="side-backdrop"
          aria-label="Close files"
          @click="sidePanelCollapsed = true"
        ></button>
        <div ref="sidePanelAreaEl" class="side-panel-area">
          <SidePanel
            class="todo-panel"
            :class="{ 'is-disabled': !selected }"
            :collapsed="sidePanelCollapsed"
            :tree-nodes="fileTree.nodes.value"
            :expanded-tree-paths="fileTree.expanded.value"
            :selected-tree-path="fileTree.selectedPath.value"
            :tree-loading="fileTree.loading.value"
            :tree-error="fileTree.error.value"
            :tree-status-by-path="fileTree.gitStatus.value"
            :tree-branch-info="gitControls.branch.value"
            :tree-branch-entries="gitControls.entries.value"
            :tree-branch-list-loading="gitControls.loading.value"
            :run-shell-command="gitControls.run"
            :tree-diff-stats="fileTree.diffStats.value"
            :tree-directory-name="directory"
            @toggle-collapse="sidePanelCollapsed = !sidePanelCollapsed"
            @open-diff="fileTree.openDiff($event.path, $event.staged)"
            @open-diff-all="fileTree.openDiff(undefined, $event.mode === 'staged')"
            @git-action="openGitAction"
            @reload="fileTree.reload"
            @toggle-dir="fileTree.toggle"
            @select-file="fileTree.selectedPath.value = $event || undefined"
            @open-file="fileTree.openFile"
          />
          <div
            v-if="!sidePanelCollapsed"
            class="side-resizer"
            @pointerdown="startSidePanelResize"
          ></div>
        </div>
        <div class="app-main-column">
          <main ref="outputEl" class="app-output">
            <div class="output-workspace">
              <div class="tool-window-layer">
                <div class="output-split">
                  <OutputPanel
                    :files="fileTree.files.value"
                    :file-cache-version="fileTree.version.value"
                    ref="outputPanelRef"
                    :key="selected?.id"
                    class="output-panel"
                    :project-name="currentProject?.name"
                    :project-color="currentProjectColor"
                    :is-following="scroller.isFollowing.value"
                    :status-text="statusText"
                    :connection-status="status"
                    :activity-status="activity.compression.value"
                    :is-status-error="!!(error || streamError)"
                    :is-thinking="running"
                    :busy-descendant-count="busyDescendants"
                    theme="github-dark"
                    :session-agent="selected?.agent"
                    :resolve-agent-color="agentColor"
                    :resolve-model-meta="modelMeta"
                    :compute-context-percent="contextPercent"
                    :history-actions-disabled="busy || loading || running || status !== 'connected'"
                    :session-revert="selected?.revert"
                    @fork-message="state.forkMessage"
                    @revert-message="state.revertMessage"
                    @undo-revert="state.redoRevert"
                    :has-more-messages="!!messageCursor"
                    :loading-history="busy || loading"
                    @load-more="state.moreMessages"
                    @reconnect="state.reconnect"
                    @resume-follow="scroller.resumeFollow()"
                    @message-rendered="scroller.notifyContentChange()"
                    @content-resized="scroller.notifyContentChange()"
                    @initial-render-complete="scroller.scrollToBottom(false)"
                    @show-thread-history="windows.showHistory"
                    @open-image="windows.openImage"
                    @open-file="fileTree.openFile"
                    @show-commit="unavailable('Commit diff')"
                    @show-message-diff="unavailable('Message diff')"
                  >
                    <template #header-actions>
                      <button
                        type="button"
                        class="header-toggle"
                        role="switch"
                        :aria-checked="headerVisible"
                        aria-controls="app-header"
                        aria-label="Show header menu"
                        @click="headerVisible = !headerVisible"
                      >
                        <span>Menu</span>
                        <span class="header-toggle-track" aria-hidden="true"></span>
                      </button>
                    </template>
                  </OutputPanel>
                </div>
              </div>
            </div>
          </main>
          <footer
            ref="inputEl"
            class="app-input"
            :class="{ 'is-disabled': !selected }"
            :style="inputHeight !== null ? { height: `${inputHeight}px` } : undefined"
          >
            <div class="input-resizer" @pointerdown="startInputResize"></div>
            <InputPanel
              ref="inputPanelRef"
              @focus="isMobile && (headerVisible = false)"
              :disabled="status !== 'connected' || busy || loading"
              :can-send="canSend"
              :agent-options="agentOptions"
              :has-agent-options="agentOptions.length > 0"
              :agent-color="agentColor(composerAgent)"
              :resolve-agent-color="agentColor"
              :model-options="modelOptions"
              :thinking-options="thinkingOptions"
              :has-model-options="modelOptions.length > 0"
              :has-thinking-options="thinkingOptions.length > 1"
              :can-attach="true"
              :is-thinking="running"
              :can-abort="running && !busy"
              :commands="commandOptions"
              :attachments="attachments"
              @add-attachments="addAttachments"
              @remove-attachment="attachments = attachments.filter((item) => item.id !== $event)"
              :message-input="messageInput"
              :selected-mode="composerAgent"
              :selected-model="selectedModel"
              :selected-thinking="composerModel?.variant"
              @update:message-input="messageInput = $event"
              @update:selected-mode="selectAgent"
              @update:selected-model="selectModel"
              @update:selected-thinking="selectVariant"
              @apply-history-entry="applyHistoryEntry"
              @send="send"
              @abort="state.interrupt"
              @open-image="windows.openImage"
              :pending-count="inbox.length"
              @show-pending="showPending"
            />
          </footer>
        </div>
        <div ref="toolWindowCanvasEl" class="tool-window-canvas">
          <TransitionGroup appear name="scale">
            <FloatingWindow
              v-for="entry in fw.entries.value"
              :key="entry.key"
              :entry="entry"
              :manager="fw"
              @focus="fw.bringToFront(entry.key)"
              @close="pty.close(entry.key)"
            />
          </TransitionGroup>
        </div>
      </div>
    </template>
    <div v-else class="app-loading-view" role="status" aria-live="polite">
      <div class="app-loading-card">
        <div class="absolute w-0 h-0 -z-10 flex items-center justify-center">
          <div class="flex fixed flex-col items-center w-96 h-40 translate-x-1/2 -translate-y-1/2">
            <div class="mb-4">
              <svg
                width="24mm"
                height="12mm"
                version="1.1"
                viewBox="0 0 24 12"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="m12.342 2.4512v3.328l1.3352 1.3352v3.9658l-0.67757 0.67756h-1.2953l-0.67757-0.67756v-8.629zm0-1.0562h-1.3153l-0.23914-0.23914v-0.91671l0.23914-0.23914h1.3153l0.23914 0.23914v0.91671zm10.602 9.6852-0.67756 0.67756h-6.6162l-0.67756-0.67756v-1.9928h1.3352v1.3352h2.6305v-2.6505h-3.2882l-0.67756-0.67756v-3.9658l0.67756-0.67757h6.6162l0.67756 0.67757v1.9729h-1.3153v-1.3153h-3.9857v2.6505h4.6234l0.67756 0.67757z"
                  fill="#ffffff"
                />
                <path
                  d="m1 0 5.4506 6-5.4506 6h3.6337l4.851-5.34v-1.32l-4.851-5.34z"
                  fill="#60a5fa"
                />
              </svg>
            </div>
            <div class="text-text-100 rounded-xl bg-surface-900 py-2 px-4">
              <span class="text-accent-400">V</span>is - OpenCode Visualizer
            </div>
          </div>
        </div>
        <form v-if="status === 'disconnected'" class="app-login-form" @submit.prevent="login">
          <p class="app-loading-title">Connect to OpenCode Server</p>
          <div class="app-login-fields">
            <input
              value="opencode"
              type="text"
              class="app-login-input"
              placeholder="Username"
              name="username"
              readonly
            />
            <input
              v-model="loginPassword"
              type="password"
              class="app-login-input"
              placeholder="Password"
              autocomplete="current-password"
            />
            <input
              v-model="loginUrl"
              type="url"
              class="app-login-input"
              placeholder="Server URL from opencode2 pair"
              name="url"
              required
            />
          </div>
          <p v-if="error" class="app-loading-message app-error-message">{{ error }}</p>
          <button type="submit" class="app-loading-retry bg-indigo-500!">Connect</button>
          <Welcome theme="github-dark" class="mt-8" />
        </form>
        <div v-else>
          <div class="app-loading-spinner" aria-hidden="true"></div>
          <p class="app-loading-title">Loading session data...</p>
          <p class="app-loading-message">Connecting to OpenCode...</p>
          <div class="app-loading-actions">
            <button
              type="button"
              class="app-loading-retry app-loading-abort"
              @click="state.disconnect"
            >
              Abort
            </button>
          </div>
        </div>
      </div>
    </div>
    <ProjectPicker
      :open="isProjectPickerOpen"
      :list-directory="state.listDirectory"
      @close="isProjectPickerOpen = false"
      @select="state.createSession"
    />
    <SettingsModal
      :open="isSettingsOpen"
      :models="models"
      :resolved-commit-model="resolvedCommitModel"
      @close="isSettingsOpen = false"
    />
    <GitChangesDialog
      v-if="gitAction && selected"
      :action="gitAction"
      :api="gitActions"
      :generate="generateCommitMessage"
      :generation-model-label="commitModelLabel"
      :resolved-model="resolvedCommitModel"
      :models="models"
      @close="gitAction = undefined"
      @changed="fileTree.reload"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import TopPanel, { type TopPanelWorktree } from './components/TopPanel.vue';
import SessionPicker from './components/SessionPicker.vue';
import SidePanel from './components/SidePanel.vue';
import OutputPanel from './components/OutputPanel.vue';
import InputPanel from './components/InputPanel.vue';
import FloatingWindow from './components/FloatingWindow.vue';
import ProjectPicker from './components/ProjectPicker.vue';
import SettingsModal from './components/SettingsModal.vue';
import Welcome from './components/Welcome.vue';
import PendingInputs from './components/PendingInputs.vue';
import GitChangesDialog from './components/git/GitChangesDialog.vue';
import { createGitActions, type GitAction } from './utils/git/actions';
import { useSessionState } from './composables/useSessionState';
import { useSettings } from './composables/useSettings';
import { useSessionWindows } from './composables/useSessionWindows';
import { useFileTree } from './composables/useFileTree';
import { useTerminalWindows } from './composables/useTerminalWindows';
import { useGitControls } from './composables/useGitControls';
import { useComposerDraft } from './composables/useComposerDraft';
import { useMessages } from './composables/useMessages';
import { useCredentials } from './composables/useCredentials';
import { useWorkspaceLayout } from './composables/useWorkspaceLayout';
import { useAutoScroller } from './composables/useAutoScroller';
import { presentTranscript } from './utils/messagePresentation';
import { resolveProjectColorHex } from './utils/projects';
import { opencodeTheme, resolveAgentColor, resolveTheme } from './utils/theme';
import { randomUUID } from './utils/uuid';
import { selectCommitModel } from './utils/commitModel';
import type { MessageTokens } from './types/message';
import type { ModelRef } from '@opencode/client';

const state = useSessionState();
const {
  ready,
  status,
  error,
  streamError,
  busy,
  loading,
  running,
  sessions,
  projects,
  selected,
  directory,
  messages,
  agents,
  models,
  active,
  sessionCursor,
  messageCursor,
  inbox,
} = state;
const windows = useSessionWindows(state);
const activity = windows.activity;
const commandOptions = computed(() => [
  { name: 'shell', description: 'Open a terminal and optionally run a command' },
  { name: 'compact', description: 'Compress the current session context' },
  ...state.commands.value.filter((command) => !['shell', 'compact'].includes(command.name)),
]);
const pendingAgent = ref<string>();
const pendingModel = ref<ModelRef>();
const composerAgent = computed(
  () => pendingAgent.value ?? selected.value?.agent ?? agents.value[0]?.id ?? '',
);
const composerModel = computed(() => {
  if (pendingModel.value) return pendingModel.value;
  const agentModel = agents.value.find((agent) => agent.id === composerAgent.value)?.model;
  if (pendingAgent.value !== undefined && agentModel) return agentModel;
  return selected.value?.model ?? agentModel ?? state.defaultModel.value;
});
function selectAgent(agent: string) {
  if (running.value || busy.value || loading.value) return;
  updateComposerSelection(() => {
    pendingAgent.value = agent;
    pendingModel.value = undefined;
  });
}
function composerSelectionKey() {
  const model = composerModel.value;
  return JSON.stringify([composerAgent.value, model?.providerID, model?.id, model?.variant]);
}
function updateComposerSelection(update: () => void) {
  const previous = composerSelectionKey();
  update();
  if (previous === composerSelectionKey()) return;
  const agent = agents.value.find((agent) => agent.id === composerAgent.value);
  if (!agent) return;
  const selected = composerModel.value;
  const model = models.value.find(
    (model) => model.providerID === selected?.providerID && model.id === selected?.id,
  );
  activity.showSplash({
    agent: agent.name,
    color: agentColor(agent.id),
    model: model ? { provider: model.providerID, name: model.name } : undefined,
    variant: selected?.variant,
  });
}
watch(
  running,
  (value) => {
    if (!value) return;
    pendingAgent.value = undefined;
    pendingModel.value = undefined;
  },
  { flush: 'sync' },
);
watch(
  () => selected.value?.id,
  () => {
    pendingAgent.value = undefined;
    pendingModel.value = undefined;
  },
  { flush: 'sync' },
);
const { fw } = windows;
const pty = useTerminalWindows(state, fw);
const gitActions = createGitActions(
  (command, options) => state.runGitCommand(command, 'Git inspection', options),
  async (command, title) => {
    await state.runGitCommand(command, title);
    return 0;
  },
);
const fileTree = useFileTree(state, fw, gitActions);
const gitAction = ref<GitAction>();
const { commitModel } = useSettings();
const resolvedCommitModel = computed(
  () => commitModel.value ?? selectCommitModel(models.value, composerModel.value),
);
const commitModelLabel = computed(() => {
  const model = resolvedCommitModel.value;
  return model
    ? `${model.providerID}/${model.id} · Variant: ${model.variant ?? 'Default'}`
    : 'No model available';
});
function openGitAction(action: GitAction) {
  if (!gitAction.value) gitAction.value = action;
}
function generateCommitMessage(prompt: string, signal: AbortSignal) {
  const model = resolvedCommitModel.value;
  if (!model) throw new Error('Select a model before generating a commit message.');
  return state.generateCommitMessage(prompt, signal, model);
}
watch(
  () => JSON.stringify([ready.value, selected.value?.id, selected.value?.location]),
  () => {
    gitAction.value = undefined;
  },
  { flush: 'sync' },
);
const gitControls = useGitControls(state, fileTree.reload);
watch(fileTree.branch, (branch) => {
  if (branch) void gitControls.reload();
});
const msg = useMessages();
const credentials = useCredentials();
const headerEl = ref<HTMLElement>();
const appBodyEl = ref<HTMLElement>();
const sidePanelAreaEl = ref<HTMLElement>();
const outputEl = ref<HTMLElement>();
const inputEl = ref<HTMLElement>();
const toolWindowCanvasEl = ref<HTMLElement>();
const sessionPickerRef = ref<InstanceType<typeof SessionPicker>>();
const outputPanelRef = ref<InstanceType<typeof OutputPanel>>();
const inputPanelRef = ref<InstanceType<typeof InputPanel>>();
const {
  isMobile,
  inputHeight,
  sidePanelWidth,
  sidePanelCollapsed,
  startInputResize,
  startSidePanelResize,
  syncExtent,
} = useWorkspaceLayout(
  {
    header: headerEl,
    body: appBodyEl,
    side: sidePanelAreaEl,
    output: outputEl,
    input: inputEl,
    canvas: toolWindowCanvasEl,
  },
  fw,
);
const headerVisible = ref(!isMobile.value);
const scrollEl = computed(() => outputPanelRef.value?.panelEl ?? undefined);
const scroller = useAutoScroller(scrollEl, ref('follow'), {
  smoothEngine: 'raf',
  scrollSpeedPxPerSecond: 3000,
});
const isSettingsOpen = ref(false);
const isProjectPickerOpen = ref(false);
const loginUrl = ref('');
const loginPassword = ref('');
const composerDraft = useComposerDraft(
  computed(() => selected.value?.id),
  (cause) => {
    error.value = `Draft storage: ${cause instanceof Error ? cause.message : String(cause)}`;
  },
);
const { messageInput } = composerDraft;
const attachments = ref<Array<{ id: string; filename: string; mime: string; dataUrl: string }>>([]);
let attachmentGeneration = 0;
watch(
  () => selected.value?.id,
  () => {
    attachmentGeneration++;
    attachments.value = [];
  },
  { flush: 'sync' },
);
async function addAttachments(files: File[]) {
  const generation = attachmentGeneration;
  try {
    const added = await Promise.all(
      files.map(async (file) => {
        if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type))
          throw new Error(`Unsupported image type: ${file.type}`);
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        return { id: randomUUID(), filename: file.name, mime: file.type, dataUrl };
      }),
    );
    if (generation === attachmentGeneration) attachments.value.push(...added);
  } catch (cause) {
    if (generation === attachmentGeneration)
      error.value = cause instanceof Error ? cause.message : String(cause);
  }
}
const canSend = computed(
  () =>
    !!selected.value &&
    status.value === 'connected' &&
    !busy.value &&
    !loading.value &&
    (!!messageInput.value.trim() || attachments.value.length > 0),
);
const currentProject = computed(() =>
  projects.value.find((project) => project.id === selected.value?.projectID),
);
const currentProjectColor = computed(() =>
  resolveProjectColorHex(currentProject.value?.icon?.color),
);
const busyDescendants = computed(
  () =>
    sessions.value.filter(
      (session) =>
        session.id !== selected.value?.id &&
        windows.belongsToSelection(session.id) &&
        active.value[session.id],
    ).length,
);
const statusText = computed(
  () =>
    error.value ||
    streamError.value ||
    (status.value !== 'connected'
      ? `${status.value}...`
      : loading.value
        ? 'Loading session...'
        : state.pendingPrompts.value.some((item) => item.status === 'sending')
          ? 'Sending...'
          : inbox.value.length
            ? `${inbox.value.length} pending input(s)`
            : ''),
);
const resolvedTheme = resolveTheme(opencodeTheme, 'dark');
function agentColor(id?: string) {
  return resolveAgentColor(
    id ?? '',
    agents.value.find((agent) => agent.id === id)?.color,
    agents.value.map((agent) => ({ name: agent.id, color: agent.color })),
    resolvedTheme,
  );
}
const agentOptions = computed(() =>
  agents.value
    .filter((agent) => !agent.hidden && agent.mode !== 'subagent')
    .map((agent) => ({
      id: agent.id,
      label: agent.name,
      description: agent.description,
      color: agentColor(agent.id),
    })),
);
const modelOptions = computed(() =>
  models.value.map((model) => ({
    id: `${model.providerID}/${model.id}`,
    modelID: model.id,
    label: model.name,
    displayName: model.name,
    providerID: model.providerID,
    providerLabel: model.providerID,
  })),
);
const selectedModel = computed(() =>
  composerModel.value ? `${composerModel.value.providerID}/${composerModel.value.id}` : '',
);
const thinkingOptions = computed(() => [
  undefined,
  ...(models.value
    .find((model) => `${model.providerID}/${model.id}` === selectedModel.value)
    ?.variants.map((variant) => variant.id) ?? []),
]);
function modelMeta(path?: string) {
  const model = modelOptions.value.find((model) => model.id === path);
  return model ? { displayName: model.displayName, providerLabel: model.providerLabel } : undefined;
}
function contextPercent(tokens: MessageTokens, providerID?: string, modelID?: string) {
  const model = models.value.find(
    (model) => model.providerID === providerID && model.id === modelID,
  );
  return model?.limit.context
    ? Math.round(
        ((tokens.input + (tokens.cache?.read ?? 0) + (tokens.cache?.write ?? 0)) /
          model.limit.context) *
          100,
      )
    : null;
}

const topPanelTreeData = computed<TopPanelWorktree[]>(() => {
  const tree = new Map<string, TopPanelWorktree>();
  for (const project of projects.value)
    tree.set(project.id, {
      directory: project.canonical,
      label: project.name ?? project.canonical,
      name: project.name,
      projectId: project.id,
      projectColor: resolveProjectColorHex(project.icon?.color),
      sandboxes: [],
    });
  for (const session of sessions.value) {
    if (session.parentID) continue;
    let project = tree.get(session.projectID);
    if (!project) {
      project = {
        directory: session.location.directory,
        label: session.location.directory,
        projectId: session.projectID,
        sandboxes: [],
      };
      tree.set(session.projectID, project);
    }
    let sandbox = project.sandboxes.find(
      (sandbox) => sandbox.directory === session.location.directory,
    );
    if (!sandbox) {
      sandbox = { directory: session.location.directory, sessions: [] };
      project.sandboxes.push(sandbox);
    }
    sandbox.sessions.push({
      id: session.id,
      title: `${session.parentID ? '↳ ' : ''}${session.title ?? session.id}`,
      status: active.value[session.id] ? 'busy' : 'idle',
      timeCreated: session.time.created,
      timeUpdated: session.time.updated,
      archivedAt: session.time.archived,
    });
  }
  return [...tree.values()];
});
const notificationOrder = ref<string[]>([]);
const notificationCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const sessionID of state.idleNotifications.value) counts.set(sessionID, 1);
  for (const request of [...state.permissions.value, ...state.forms.value])
    counts.set(request.sessionID, (counts.get(request.sessionID) ?? 0) + 1);
  return counts;
});
watch(
  notificationCounts,
  (counts) => {
    const retained = notificationOrder.value.filter((id) => counts.has(id));
    const known = new Set(retained);
    notificationOrder.value = [...retained, ...[...counts.keys()].filter((id) => !known.has(id))];
  },
  { immediate: true, flush: 'sync' },
);
const notificationSessions = computed(() => {
  return notificationOrder.value.map((sessionId) => ({
    sessionId,
    count: notificationCounts.value.get(sessionId) ?? 0,
    projectId: sessions.value.find((session) => session.id === sessionId)?.projectID ?? '',
  }));
});

function focusInput() {
  inputPanelRef.value?.focus();
}
function unavailable(feature: string) {
  error.value = `${feature} is not yet available in vis.`;
}
async function selectNotification() {
  const queue = notificationSessions.value.filter((item) => item.sessionId !== 'global');
  const notification = queue.find((item) => item.sessionId !== selected.value?.id) ?? queue[0];
  if (notification && notification.sessionId !== selected.value?.id)
    await state.selectSessionByID(notification.sessionId);
  await nextTick();
  const sessionID = notification?.sessionId ?? 'global';
  const keys = [
    ...state.permissions.value
      .filter((request) => request.sessionID === sessionID)
      .map((request) => `permission:${request.id}`),
    ...state.forms.value
      .filter((form) => form.sessionID === sessionID)
      .map((form) => `question:${form.id}`),
  ];
  const key = keys.find((key) => fw.has(key));
  if (key) fw.bringToFront(key);
}
function selectModel(id: string) {
  if (running.value || busy.value || loading.value) return;
  const model = models.value.find((model) => `${model.providerID}/${model.id}` === id);
  if (model) {
    updateComposerSelection(() => {
      pendingModel.value = { providerID: model.providerID, id: model.id };
    });
  }
}
function selectVariant(variant: string | undefined) {
  if (running.value || busy.value || loading.value) return;
  const model = composerModel.value;
  if (model) {
    updateComposerSelection(() => {
      pendingModel.value = { ...model, variant };
    });
  }
}
async function applyHistoryEntry(entry: {
  text: string;
  agent?: string;
  model?: string;
  variant?: string;
}) {
  messageInput.value = entry.text;
  if (entry.agent) selectAgent(entry.agent);
  if (entry.model) await selectModel(entry.model);
  if (entry.variant !== undefined) await selectVariant(entry.variant);
}
async function send() {
  if (!canSend.value) return;
  const id = selected.value?.id;
  const text = messageInput.value;
  const sentDraft = composerDraft.snapshot();
  const sentAttachments = [...attachments.value];
  // Persist the displayed selection before starting an idle session.
  const agent = running.value ? undefined : composerAgent.value;
  const model = running.value ? undefined : composerModel.value;
  if (!id) return;
  const shellCommand = /^\/shell(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (shellCommand && sentAttachments.length) {
    error.value = '/shell does not accept attachments.';
    return;
  }
  if (
    shellCommand
      ? await pty.open(shellCommand[1])
      : await state.send(
          text,
          agent,
          model,
          sentAttachments.map((item) => ({ uri: item.dataUrl, name: item.filename })),
        )
  ) {
    composerDraft.clearSent(id, sentDraft);
    if (selected.value?.id === id) {
      const sentIDs = new Set(sentAttachments.map((item) => item.id));
      attachments.value = attachments.value.filter((item) => !sentIDs.has(item.id));
      if (!shellCommand && text.trim() !== '/compact' && pendingModel.value === model)
        pendingModel.value = undefined;
      if (!shellCommand && text.trim() !== '/compact' && pendingAgent.value === agent)
        pendingAgent.value = undefined;
      inputPanelRef.value?.reset();
      if (isMobile.value) inputPanelRef.value?.blur();
      else focusInput();
      scroller.resumeFollow();
    }
  }
}
function showPending() {
  void fw.open('pending-inputs', {
    component: PendingInputs,
    props: { items: inbox.value, disabled: busy.value, onCancel: state.cancelInput },
    title: 'Pending inputs',
    variant: 'plain',
    scroll: 'manual',
    closable: true,
    resizable: true,
    expiry: Infinity,
    width: 520,
    height: 360,
  });
}
watch([inbox, busy], () => {
  if (fw.has('pending-inputs'))
    fw.updateOptions('pending-inputs', {
      props: { items: inbox.value, disabled: busy.value, onCancel: state.cancelInput },
    });
});
watch([messages, selected], () => {
  if (selected.value) msg.setPresentation(presentTranscript(selected.value, messages.value));
  else msg.reset();
});
watch(
  () => selected.value?.id,
  (id) => {
    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set('session', id);
      url.searchParams.set('project', selected.value!.projectID);
    } else {
      url.searchParams.delete('session');
      url.searchParams.delete('project');
    }
    window.history.replaceState(null, '', url);
    void nextTick(() => {
      syncExtent();
      scroller.resetFollow();
      focusInput();
    });
  },
);
const initialURL = new URL(window.location.href);
let initialSelectionStarted = false;
let initialSelectionGeneration = 0;
watch(
  ready,
  (connected) => {
    if (!connected) {
      initialSelectionStarted = false;
      initialSelectionGeneration++;
    }
  },
  { flush: 'sync' },
);
watch([ready, projects], async ([connected]) => {
  if (!connected || selected.value || initialSelectionStarted) return;
  const sessionID = initialURL.searchParams.get('session');
  if (sessionID) {
    initialSelectionStarted = true;
    await state.selectSessionByID(sessionID);
    return;
  }
  const projectID = initialURL.searchParams.get('project') || state.sortedProjects.value[0]?.id;
  if (projectID) {
    initialSelectionStarted = true;
    const generation = initialSelectionGeneration;
    try {
      const result = await state.listProjectSessions(projectID, '');
      if (
        generation === initialSelectionGeneration &&
        ready.value &&
        !selected.value &&
        result.data[0]
      )
        await state.selectSession(result.data[0]);
    } catch (cause) {
      if (generation === initialSelectionGeneration)
        error.value = cause instanceof Error ? cause.message : String(cause);
    }
    return;
  }
});

async function login() {
  await state.connect({ url: loginUrl.value.trim(), password: loginPassword.value });
  if (ready.value) credentials.save(loginUrl.value.trim(), 'opencode', loginPassword.value);
}
function logout() {
  credentials.clear();
  state.disconnect();
  fw.closeAll();
  msg.reset();
}
let lastCtrlG = 0;
let lastEscape: { time: number; sessionID: string } | undefined;
function keydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') lastEscape = undefined;
  if (
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    event.key.toLowerCase() === 'a' &&
    document.activeElement instanceof HTMLDivElement
  ) {
    event.preventDefault();
    const range = document.createRange();
    range.selectNodeContents(document.activeElement);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  }
  if (!ready.value) return;
  if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === 'o') {
    event.preventDefault();
    void pty.open();
    return;
  }
  if ((event.ctrlKey && event.key === ';') || (event.altKey && event.key.toLowerCase() === 'n')) {
    event.preventDefault();
    void state.createSession(directory.value);
  }
  if (event.ctrlKey && event.key.toLowerCase() === 'g') {
    event.preventDefault();
    if (Date.now() - lastCtrlG < 400) {
      sessionPickerRef.value?.closeSessionDropdown();
      selectNotification();
      lastCtrlG = 0;
    } else {
      sessionPickerRef.value?.toggleSessionDropdown();
      lastCtrlG = Date.now();
    }
  }
  if (event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    const peers = sessions.value.filter(
      (session) => session.projectID === selected.value?.projectID && !session.parentID,
    );
    const index = peers.findIndex((session) => session.id === selected.value?.id);
    const next =
      peers[(index + (event.key === 'ArrowLeft' ? 1 : -1) + peers.length) % peers.length];
    if (next) void state.selectSession(next);
  }
  if (event.key === 'Escape') {
    if (event.repeat || event.isComposing) return;
    const sessionID = selected.value?.id;
    const now = performance.now();
    if (
      sessionID &&
      running.value &&
      !busy.value &&
      lastEscape?.sessionID === sessionID &&
      now - lastEscape.time < 400
    ) {
      event.preventDefault();
      lastEscape = undefined;
      void state.interrupt();
      return;
    }
    lastEscape = sessionID && running.value ? { time: now, sessionID } : undefined;
    if (isSettingsOpen.value) isSettingsOpen.value = false;
    else if (isProjectPickerOpen.value) isProjectPickerOpen.value = false;
    else if (isMobile.value && !sidePanelCollapsed.value) sidePanelCollapsed.value = true;
    else {
      const manual = fw.entries.value
        .filter((entry) => entry.closable)
        .sort((a, b) => b.zIndex - a.zIndex)[0];
      if (manual) void pty.close(manual.key);
      focusInput();
    }
  }
}
onMounted(() => {
  credentials.load();
  loginUrl.value = credentials.url.value;
  loginPassword.value = credentials.password.value;
  if (credentials.isConfigured.value) void login();
  window.addEventListener('keydown', keydown);
});
onBeforeUnmount(() => window.removeEventListener('keydown', keydown));
</script>

<style scoped>
.activity-splash {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8vw;
  pointer-events: none;
  color: #f1f5f9;
  font-size: clamp(28px, 5vw, 72px);
  font-weight: 700;
  text-align: center;
  overflow-wrap: anywhere;
  text-shadow:
    0 2px 12px #020617,
    0 0 40px #020617;
}
.activity-splash-enter-active,
.activity-splash-leave-active {
  transition:
    opacity 250ms ease,
    transform 250ms ease;
}
.selection-splash {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  line-height: 1.1;
}
.selection-splash-agent {
  font-variant-caps: small-caps;
  font-size: 0.8em;
}
.selection-splash-model {
  max-width: 100%;
  color: #e2e8f0;
  text-align: center;
  line-height: 1.2;
}
.selection-splash-provider {
  font-size: 0.55em;
  font-weight: 500;
  color: #ffffff;
  margin-bottom: 4px;
}
.selection-splash-variant {
  font-size: 0.35em;
  font-weight: 500;
  text-transform: uppercase;
  color: #94a3b8;
}
.selection-splash-variant.is-explicit {
  color: #f59e0b;
}
.activity-splash-enter-from,
.activity-splash-leave-to {
  opacity: 0;
  transform: scale(1.2);
}
@media (prefers-reduced-motion: reduce) {
  .activity-splash-enter-active,
  .activity-splash-leave-active {
    transition: none;
  }
}
.app {
  --term-font-family:
    'Iosevka Term', 'Iosevka Fixed', 'JetBrains Mono', 'Cascadia Mono', 'SFMono-Regular', Menlo,
    Consolas, 'Liberation Mono', monospace;
  --term-font-size: 13px;
  --term-line-height: 1.1;
  position: fixed;
  top: var(--viewport-top, 0px);
  left: var(--viewport-left, 0px);
  width: var(--viewport-width, 100%);
  height: var(--viewport-height, 100dvh);
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 12px;
  box-sizing: border-box;
}
.app-loading-view {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  place-items: center;
  z-index: 0;
}
.app-loading-card {
  position: relative;
  width: min(420px, 92vw);
  border: 1px solid #334155;
  background: rgba(15, 23, 42, 0.92);
  border-radius: 14px;
  padding: 20px;
  box-shadow: 0 14px 34px rgba(2, 6, 23, 0.5);
  text-align: center;
}
.app-loading-spinner {
  width: 26px;
  height: 26px;
  margin: 0 auto 12px;
  border-radius: 50%;
  border: 3px solid rgba(148, 163, 184, 0.4);
  border-top-color: #e2e8f0;
  animation: app-loading-spin 0.85s linear infinite;
}
.app-loading-title {
  margin: 0;
  color: #e2e8f0;
  font-size: 14px;
  font-weight: 600;
}
.app-loading-message {
  margin: 8px 0 0;
  color: #94a3b8;
  font-size: 12px;
}
.app-loading-retry {
  margin-top: 14px;
  border: 1px solid #334155;
  background: #1e293b;
  color: #e2e8f0;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}
.app-loading-retry:hover {
  background: #334155;
}
.app-loading-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}
.app-loading-abort {
  background: transparent;
  border-color: #475569;
  color: #94a3b8;
}
.app-loading-abort:hover {
  background: #1e293b;
  color: #e2e8f0;
}
.app-login-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: stretch;
}
.app-login-fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.app-login-input {
  width: 100%;
  padding: 8px 12px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 6px;
  color: #e2e8f0;
  font-size: 13px;
  box-sizing: border-box;
}
.app-login-input::placeholder {
  color: #64748b;
}
.app-login-input:focus {
  outline: none;
  border-color: #475569;
  background: #0f172a;
}
.app-login-input:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.app-error-message {
  color: #f87171;
}
@keyframes app-loading-spin {
  to {
    transform: rotate(360deg);
  }
}
.app-header {
  flex: 0 0 auto;
  position: relative;
  z-index: 30;
}
.header-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 8px;
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
}
.header-toggle:focus-visible {
  outline: 2px solid #60a5fa;
  outline-offset: -2px;
  border-radius: 8px;
}
.header-toggle-track {
  width: 28px;
  height: 16px;
  padding: 2px;
  border-radius: 999px;
  background: #475569;
}
.header-toggle-track::before {
  content: '';
  display: block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #e2e8f0;
}
.header-toggle[aria-checked='true'] .header-toggle-track {
  background: #2563eb;
}
.header-toggle[aria-checked='true'] .header-toggle-track::before {
  transform: translateX(12px);
}
.app-output {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
  z-index: 10;
  isolation: isolate;
}
.app-input {
  flex: 0 0 auto;
  position: relative;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-height: min(200px, 40%);
  max-height: 60%;
}
.input-resizer {
  position: absolute;
  top: -8px;
  left: 8px;
  right: 8px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ns-resize;
  z-index: 40;
  touch-action: none;
}
.input-resizer::before {
  content: '';
  width: 44px;
  height: 3px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.6);
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.6);
}
.input-resizer:hover::before {
  background: rgba(226, 232, 240, 0.7);
}
.output-workspace {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: visible;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.tool-window-layer {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  box-sizing: border-box;
}
.output-split {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: stretch;
  width: 100%;
  height: 100%;
  min-height: 0;
}
.app-body {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: stretch;
  gap: var(--todo-panel-gap);
  --todo-panel-gap: 10px;
  --todo-panel-open-width: clamp(260px, 26vw, 380px);
  --todo-panel-collapsed-width: 30px;
  --todo-panel-width: var(--todo-panel-open-width);
}
.app-body.todo-collapsed {
  --todo-panel-width: var(--todo-panel-collapsed-width);
}
.app-main-column {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.side-panel-area {
  position: relative;
  flex: 0 0 var(--todo-panel-width);
  width: var(--todo-panel-width);
  min-height: 0;
}
.todo-panel {
  width: 100%;
  height: 100%;
  min-height: 0;
}
.side-resizer {
  position: absolute;
  top: 8px;
  bottom: 8px;
  right: -7px;
  width: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ew-resize;
  touch-action: none;
}
.side-resizer::before {
  content: '';
  width: 3px;
  height: 44px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.6);
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.6);
}
.side-resizer:hover::before {
  background: rgba(226, 232, 240, 0.7);
}
.is-disabled {
  opacity: 0.4;
  pointer-events: none;
}
.tool-window-canvas {
  position: fixed;
  top: var(--canvas-top, 0px);
  left: var(--viewport-left, 0px);
  width: var(--viewport-width, 100%);
  height: var(--canvas-height, 100%);
  pointer-events: none;
  overflow: clip;
  z-index: 20;
  --dock-reserved: 0px;
  --tool-top-offset: 0px;
  --tool-area-height: var(--canvas-height, 100%);
  --term-width: 670px;
  --term-height: 386px;
}
.output-panel {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  height: 100%;
  min-height: 0;
}
.app-loading-card {
  max-height: 100%;
  overflow: auto;
}
.app-output,
.app-body,
.app-header {
  min-width: 0;
}
@media (max-width: 768px) {
  .app {
    --app-padding-top: max(6px, env(safe-area-inset-top));
    --app-padding-right: max(6px, env(safe-area-inset-right));
    --app-padding-left: max(6px, env(safe-area-inset-left));
    padding: var(--app-padding-top) var(--app-padding-right) max(6px, env(safe-area-inset-bottom))
      var(--app-padding-left);
    gap: 6px;
  }
  .app-body,
  .app-main-column {
    gap: 6px;
  }
  .side-panel-area {
    position: absolute;
    inset: 0 auto 0 0;
    width: min(340px, 90%);
    z-index: 50;
  }
  .todo-collapsed .side-panel-area {
    display: none;
  }
  .side-backdrop {
    position: absolute;
    inset: 0;
    z-index: 49;
    background: #02061799;
  }
  .side-resizer,
  .input-resizer {
    display: none;
  }
  .app-input {
    /* Small viewport units stay stable when the software keyboard opens. */
    height: clamp(144px, 24svh, 200px) !important;
    min-height: 0;
    max-height: none;
  }
  .app-input:has(.input-textarea:focus) {
    height: clamp(108px, 18svh, 150px) !important;
  }
  .tool-window-canvas {
    z-index: 60;
  }
}
:deep(.scale-enter-active),
:deep(.scale-leave-active) {
  transition:
    transform 0.15s ease-in,
    opacity 0.15s ease-in;
}
:deep(.scale-enter-from),
:deep(.scale-leave-to) {
  opacity: 0;
  --win-scale-x: 1.5;
  --win-scale-y: 0;
}
</style>
