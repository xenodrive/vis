<template>
  <div class="session-picker">
    <Teleport defer to="#location-picker">
      <div class="location-controls">
        <Dropdown
          v-model:open="projectOpen"
          class="location-dropdown"
          :label="projectLabel"
          :popup-style="popupStyle"
          @select="onProjectSelect"
        >
          <template #label>
            <span class="location-label"
              ><strong
                ><Icon icon="mdi:package-variant-closed" width="12" /> {{ projectLabel }}</strong
              ><small :title="location?.directory"
                ><Icon icon="mdi:folder-outline" width="12" /> {{ location?.directory }}</small
              ></span
            >
          </template>
          <div class="picker-panel">
            <DropdownSearch
              v-model="projectSearch"
              :auto-focus="!mobile"
              class="picker-search"
              placeholder="Search projects…"
            >
              <template #before><Icon icon="lucide:search" width="14" /></template>
            </DropdownSearch>
            <div class="picker-list">
              <div v-for="project in filteredProjects" :key="project.id" class="project-group">
                <DropdownLabel
                  class="project-heading"
                  :style="{ color: resolveProjectColorHex(project.icon?.color) }"
                >
                  <Icon icon="mdi:package-variant-closed" class="name-icon" width="14" />
                  {{ project.name || project.canonical.split('/').pop() || project.canonical }}
                  <template #action>
                    <span
                      class="project-updated"
                      title="Latest session update among the 50 most recently updated sessions"
                      >{{ formatMessageTime(state.projectActivity.value.get(project.id)) }}</span
                    >
                    <button
                      type="button"
                      class="project-favorite"
                      :class="{ 'is-favorite': isFavorite(project.id) }"
                      :title="isFavorite(project.id) ? 'Remove from favorites' : 'Add to favorites'"
                      :aria-label="
                        isFavorite(project.id) ? 'Remove from favorites' : 'Add to favorites'
                      "
                      :aria-pressed="isFavorite(project.id)"
                      @click.stop="toggleFavorite(project.id)"
                      @keydown.enter.stop
                      @keydown.space.stop
                    >
                      <Icon
                        :icon="isFavorite(project.id) ? 'mdi:star' : 'mdi:star-outline'"
                        width="12"
                      />
                    </button>
                  </template>
                </DropdownLabel>
                <div
                  v-for="place in projectLocations(project)"
                  :key="locationKey(place)"
                  class="picker-row location-branch"
                >
                  <DropdownItem
                    class="picker-main"
                    :active="
                      project.id === projectID &&
                      locationKey(place) === (location && locationKey(location))
                    "
                    :value="JSON.stringify({ projectID: project.id, ...place })"
                  >
                    <div class="picker-info">
                      <strong :title="place.directory"
                        ><Icon icon="mdi:folder-outline" class="name-icon" width="14" />
                        {{ place.directory }}</strong
                      >
                    </div>
                  </DropdownItem>
                </div>
              </div>
              <div v-if="!filteredProjects.length" class="picker-note">No matching projects</div>
            </div>
            <button
              type="button"
              class="picker-more project-open-button"
              :disabled="state.busy.value"
              @click="openProjectPicker"
            >
              <Icon icon="lucide:folder-open" width="14" />
              Open project…
            </button>
          </div>
        </Dropdown>
        <button
          class="picker-action project-settings-button"
          title="Project settings"
          :disabled="!currentProject || state.busy.value"
          @click="openProjectSettings"
        >
          <Icon icon="mdi:cog-outline" width="16" />
        </button>
      </div>
    </Teleport>
    <Teleport to="body">
      <ProjectSettingsDialog
        :open="settingsOpen"
        :project-id="editingProject?.id ?? ''"
        :worktree="editingProject?.canonical ?? ''"
        :name="editingProject?.name"
        :icon-color="editingProject?.icon?.color"
        :icon-override="editingProject?.icon?.override"
        :commands-start="editingProject?.commands?.start"
        :saving="savingProject"
        :error="settingsError"
        @close="settingsOpen = false"
        @save="saveProjectSettings"
      />
    </Teleport>
    <Dropdown
      v-model:open="sessionOpen"
      class="session-dropdown"
      :label="sessionLabel"
      :popup-style="{ ...popupStyle, left: '50%', translate: '-50% 0' }"
      @select="onSessionSelect"
    >
      <div class="picker-panel">
        <DropdownSearch
          v-model="search"
          :auto-focus="!mobile"
          class="picker-search"
          placeholder="Search sessions…"
        >
          <template #before><Icon icon="lucide:search" width="14" /></template>
        </DropdownSearch>
        <div class="picker-list">
          <div v-for="session in rows" :key="session.id" class="picker-row">
            <DropdownItem
              class="picker-main"
              :active="session.id === state.selected.value?.id"
              :value="session.id"
            >
              <div class="picker-info">
                <strong
                  ><span :title="state.active.value[session.id] ? 'Thinking' : 'Idle'">{{
                    state.active.value[session.id] ? '🤔' : '🟢'
                  }}</span>
                  {{ session.title || session.id }}</strong
                >
                <small
                  >{{ formatMessageTime(session.time.updated) }} ·
                  {{ session.location.directory }}</small
                >
              </div>
            </DropdownItem>
            <button
              class="picker-action"
              title="Rename session"
              :disabled="state.busy.value"
              @click="renameSession(session)"
            >
              <Icon icon="lucide:pencil" width="16" />
            </button>
            <button
              class="picker-action danger"
              title="Delete session permanently"
              :disabled="state.busy.value"
              @click="removeSession(session)"
            >
              <Icon icon="lucide:trash-2" width="16" />
            </button>
          </div>
          <div v-if="!rows.length && !loading" class="picker-note">No matching sessions</div>
          <button v-if="cursor" class="picker-more" :disabled="loading" @click="load(true)">
            Load more sessions…
          </button>
        </div>
        <div v-if="error" class="picker-error">{{ error }}</div>
        <div v-if="loading" class="picker-note">Loading sessions…</div>
        <button
          v-if="location"
          class="picker-more"
          :disabled="state.busy.value"
          @click="state.createSession(location.directory)"
        >
          New session
        </button>
      </div>
    </Dropdown>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import type { Project, SessionInfo } from '@opencode/client';
import type { useSessionState } from '../composables/useSessionState';
import Dropdown from './Dropdown.vue';
import DropdownItem from './Dropdown/Item.vue';
import DropdownLabel from './Dropdown/Label.vue';
import ProjectSettingsDialog from './ProjectSettingsDialog.vue';
import DropdownSearch from './Dropdown/Search.vue';
import { formatMessageTime } from '../utils/formatters';
import { errorMessage } from '../utils/errors';
import { resolveProjectColorHex } from '../utils/projects';
import { useFavoriteProjects } from '../composables/useFavoriteProjects';

const props = defineProps<{ state: ReturnType<typeof useSessionState>; mobile?: boolean }>();
const emit = defineEmits<{ (event: 'open-directory'): void }>();
function openProjectPicker() {
  projectOpen.value = false;
  emit('open-directory');
}
const { isFavorite, toggleFavorite } = useFavoriteProjects();
const projectOpen = ref(false);
const settingsOpen = ref(false);
const editingProject = ref<Project>();
const savingProject = ref(false);
const settingsError = ref('');
function openProjectSettings() {
  if (!currentProject.value) return;
  editingProject.value = currentProject.value;
  settingsError.value = '';
  projectOpen.value = false;
  settingsOpen.value = true;
}
async function saveProjectSettings(input: {
  name: string;
  icon: { color: string; override: string };
  commands: { start: string };
}) {
  const project = editingProject.value;
  if (!project || savingProject.value) return;
  savingProject.value = true;
  settingsError.value = '';
  try {
    await props.state.updateProjectSettings(project, input);
    settingsOpen.value = false;
  } catch (cause) {
    settingsError.value = errorMessage(cause);
  } finally {
    savingProject.value = false;
  }
}
const sessionOpen = ref(false);
const projectSearch = ref('');
const search = ref('');
const projectID = ref(new URL(window.location.href).searchParams.get('project') ?? '');
type Place = SessionInfo['location'];
const chosenLocation = ref<Place>();
const location = computed(
  () =>
    chosenLocation.value ??
    (currentProject.value ? { directory: currentProject.value.canonical } : undefined),
);
function locationKey(place: Place) {
  return place.directory;
}
function projectLocations(project: Project): Place[] {
  const canonical: Place = { directory: project.canonical };
  const session = props.state.selected.value;
  return session?.projectID === project.id &&
    locationKey(session.location) !== locationKey(canonical)
    ? [canonical, session.location]
    : [canonical];
}
const rows = ref<SessionInfo[]>([]);
const cursor = ref<string>();
let sessionLookahead: SessionInfo | undefined;
const loading = ref(false);
const error = ref('');
let revision = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const popupStyle = { width: 'min(680px, 90vw)', maxWidth: '90vw', overflow: 'hidden' };
const currentProject = computed(() =>
  props.state.projects.value.find((project) => project.id === projectID.value),
);
const projectLabel = computed(
  () =>
    currentProject.value?.name ||
    currentProject.value?.canonical.split('/').pop() ||
    'Select project',
);
const sessionLabel = computed(() =>
  props.state.selected.value?.projectID === projectID.value &&
  location.value &&
  locationKey(props.state.selected.value.location) === locationKey(location.value)
    ? `${props.state.active.value[props.state.selected.value.id] ? '🤔' : '🟢'} ${props.state.selected.value.title || props.state.selected.value.id}`
    : 'Select session',
);
const filteredProjects = computed(() => {
  const query = projectSearch.value.trim().toLowerCase();
  return props.state.sortedProjects.value
    .filter((project) =>
      `${project.name ?? ''} ${projectLocations(project)
        .map((place) => place.directory)
        .join(' ')}`
        .toLowerCase()
        .includes(query),
    )
    .sort((a, b) => Number(isFavorite(b.id)) - Number(isFavorite(a.id)));
});
watch(
  () => props.state.selected.value?.id,
  () => {
    const session = props.state.selected.value;
    if (session) {
      projectID.value = session.projectID;
      chosenLocation.value = session.location;
    }
  },
  { immediate: true },
);
async function chooseProject(id: string, place: Place) {
  const changedProject = props.state.selected.value?.projectID !== id;
  projectID.value = id;
  chosenLocation.value = place;
  projectOpen.value = false;
  sessionOpen.value = true;
  if (changedProject) {
    try {
      const result = await props.state.listProjectSessions(id, '');
      if (projectID.value !== id) return;
      if (result.data[0]) await selectSession(result.data[0]);
    } catch (cause) {
      error.value = errorMessage(cause);
    }
  }
}
function onProjectSelect(value: unknown) {
  if (typeof value !== 'string') return;
  for (const project of props.state.projects.value) {
    const place = projectLocations(project).find(
      (place) => JSON.stringify({ projectID: project.id, ...place }) === value,
    );
    if (place) {
      void chooseProject(project.id, place);
      return;
    }
  }
}
function onSessionSelect(value: unknown) {
  const session = rows.value.find((session) => session.id === value);
  if (session) void selectSession(session);
}
async function load(more = false) {
  const place = location.value;
  if (!place || (more && (loading.value || !cursor.value))) return;
  const pending = more ? sessionLookahead : undefined;
  const pageSize = 50 - (pending ? 1 : 0);
  const request = ++revision;
  loading.value = true;
  error.value = '';
  try {
    const query = search.value.trim();
    const result = await props.state.listLocationSessions(
      place,
      query,
      more ? cursor.value : undefined,
      pageSize + 1,
    );
    if (request !== revision) return;
    const page = result.data.slice(0, pageSize);
    if (pending) page.unshift(pending);
    rows.value = more
      ? [...new Map([...rows.value, ...page].map((session) => [session.id, session])).values()]
      : page;
    sessionLookahead = result.data[pageSize];
    cursor.value = sessionLookahead ? (result.cursor.next ?? undefined) : undefined;
  } catch (cause) {
    if (request === revision) error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    if (request === revision) loading.value = false;
  }
}
watch([location, search], () => {
  revision++;
  clearTimeout(timer);
  rows.value = [];
  cursor.value = undefined;
  sessionLookahead = undefined;
  loading.value = !!projectID.value;
  timer = setTimeout(() => void load(), 200);
});
watch(sessionOpen, (open) => {
  if (open) {
    clearTimeout(timer);
    void load();
  }
});
async function selectSession(session: SessionInfo) {
  await props.state.selectSession(session);
  sessionOpen.value = false;
}
async function renameSession(session: SessionInfo) {
  const title = window.prompt('Session name', session.title ?? '');
  if (!title?.trim()) return;
  await props.state.renameSession(session.id, title.trim());
  await load();
}
async function removeSession(session: SessionInfo) {
  if (!window.confirm('Delete this session permanently?')) return;
  await props.state.removeSession(session.id);
  await load();
}
onBeforeUnmount(() => {
  revision++;
  clearTimeout(timer);
});
defineExpose({
  toggleSessionDropdown: () => {
    sessionOpen.value = !sessionOpen.value;
  },
  closeSessionDropdown: () => {
    sessionOpen.value = false;
    projectOpen.value = false;
  },
});
</script>

<style scoped>
.project-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  width: 100%;
  box-sizing: border-box;
}
.project-favorite {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-left: 6px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: #64748b;
}
.project-favorite:hover {
  background: #1d2a45;
}
.project-favorite:focus-visible {
  outline: 1px solid #94a3b8;
  outline-offset: 2px;
}
.project-favorite.is-favorite {
  color: #facc15;
}
.project-updated {
  color: #64748b;
  font-size: 10px;
  font-weight: 400;
  letter-spacing: normal;
  white-space: nowrap;
}
.location-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.project-settings-button {
  width: 32px !important;
  height: 32px !important;
}
.project-settings {
  margin: auto;
  width: min(440px, calc(100vw - 32px));
  box-sizing: border-box;
  padding: 20px;
  background: #0f172a;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 10px;
}
.project-settings::backdrop {
  background: #020617aa;
}
.project-settings form,
.project-settings label {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.project-settings form {
  gap: 16px;
}
.project-settings h2 {
  margin: 0;
  font-size: 16px;
}
.project-settings label {
  font-size: 12px;
}
.settings-path {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.project-settings input,
.settings-actions button {
  background: #1e293b;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 5px;
  padding: 6px 8px;
}
.settings-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.location-dropdown {
  width: 240px;
  max-width: 100%;
}
.location-dropdown :deep(.ui-dropdown-button) {
  height: 32px;
  box-sizing: border-box;
  padding: 3px 8px;
}
.location-dropdown :deep(.ui-dropdown-label) {
  min-width: 0;
}
.name-icon,
.location-label :deep(svg) {
  display: inline-block;
  vertical-align: -2px;
}
.name-icon {
  color: #64748b;
}
.location-label {
  display: flex;
  flex-direction: column;
  min-width: 0;
  text-align: left;
  line-height: 12px;
}
.location-label strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
}
.location-label small {
  font-size: 10px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.project-group + .project-group {
  margin-top: 6px;
}
.location-branch {
  margin-left: 16px;
  padding-left: 8px;
}
.session-picker {
  width: 100%;
  display: flex;
  gap: 8px;
  min-width: 0;
}
.session-dropdown {
  width: 100%;
  min-width: 0;
}
.picker-panel {
  padding: 8px;
  display: flex;
  flex-direction: column;
  max-height: calc(var(--viewport-height, 100dvh) * 0.6 - 14px);
  box-sizing: border-box;
  overflow: hidden;
}
.picker-search {
  flex-shrink: 0;
  width: 100%;
  gap: 6px;
  color: #64748b;
}
.picker-list {
  min-height: 0;
  overflow-y: auto;
  margin-top: 6px;
}
.picker-row,
.location-row {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.location-row {
  border-top: 1px solid #334155;
  margin-top: 6px;
}
.picker-main {
  flex: 1;
  min-width: 0;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  color: #e2e8f0;
  padding: 6px 8px;
  border-radius: 0;
}
.picker-info {
  min-width: 0;
  flex: 1;
}
button {
  cursor: pointer;
}
button:disabled {
  opacity: 0.4;
  cursor: default;
}
.picker-main strong,
.picker-main small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.picker-main strong {
  font-size: 12px;
  font-weight: 400;
}
.picker-main small {
  color: #64748b;
  font-size: 10px;
  margin-top: 3px;
}
.picker-main:hover,
.picker-main[aria-selected='true'] {
  background: rgba(30, 41, 59, 0.8);
}
.picker-main.is-active {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.45);
}
.picker-action {
  border: 1px solid #334155;
  background: #111a2c;
  color: #cbd5e1;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  padding: 0;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.picker-action:hover {
  background: #1d2a45;
}
.picker-action[title^='New session'] {
  color: #86efac;
}
.picker-action.danger {
  color: #fca5a5;
}
.picker-action.danger:hover {
  color: #f87171;
  background: #7f1d1d55;
}
.picker-note,
.picker-error {
  padding: 10px;
  font-size: 12px;
  color: #94a3b8;
}
.picker-error {
  color: #f87171;
}
.picker-more {
  flex-shrink: 0;
  display: block;
  width: 100%;
  padding: 8px;
  margin-top: 4px;
  border: 1px solid #334155;
  border-radius: 5px;
  color: #cbd5e1;
  background: #0f172a;
}
.project-open-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
</style>
