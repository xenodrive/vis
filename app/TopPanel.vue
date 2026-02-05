<template>
  <div class="top-panel">
    <div class="top-row">
      <div class="top-field">
        <Dropdown
          v-model="projectValue"
          :label="selectedProjectLabel"
          placeholder="Select project"
          auto-close
        >
          <template #default>
            <div class="dropdown-list">
              <div v-if="projects.length === 0" class="dropdown-empty">No projects</div>
              <DropdownItem v-for="project in projects" :key="project.id" :value="project.id">
                <span class="dropdown-item-label">{{ projectLabel(project) }}</span>
              </DropdownItem>
            </div>
          </template>
        </Dropdown>
        <button type="button" class="control-button" @click="$emit('new-project')">
          Open project
        </button>
      </div>
      <div class="top-field">
        <Dropdown
          v-model="worktreeValue"
          :label="selectedWorktreeLabel"
          placeholder="Select worktree"
          :disabled="!canManageWorktrees"
          auto-close
        >
          <template #default="{ close }">
            <div class="dropdown-list">
              <div v-if="worktrees.length === 0" class="dropdown-empty">No worktrees</div>
              <DropdownItem
                v-for="directory in worktrees"
                :key="directory"
                :value="directory"
              >
                <span class="dropdown-item-label">{{ worktreeLabel(directory) }}</span>
                <button
                  v-if="canDeleteWorktree(directory)"
                  type="button"
                  class="dropdown-delete"
                  @click.stop="handleWorktreeDelete(directory, close)"
                >
                  Delete
                </button>
              </DropdownItem>
            </div>
          </template>
        </Dropdown>
        <button
          type="button"
          class="control-button"
          :disabled="!canManageWorktrees"
          @click="$emit('new-worktree')"
        >
          Add
        </button>
      </div>
      <div class="top-field">
        <Dropdown
          v-model="sessionValue"
          :label="selectedSessionLabel"
          placeholder="Select session"
          :disabled="!canManageSessions"
          auto-close
        >
          <template #default="{ close }">
            <div class="dropdown-list">
              <div v-if="sessions.length === 0" class="dropdown-empty">No sessions</div>
              <DropdownItem v-for="session in sessions" :key="session.id" :value="session.id">
                <span class="dropdown-item-label">{{ sessionLabel(session) }}</span>
                <button
                  type="button"
                  class="dropdown-delete"
                  @click.stop="handleSessionDelete(session.id, close)"
                >
                  Delete
                </button>
              </DropdownItem>
            </div>
          </template>
        </Dropdown>
        <button type="button" class="control-button" @click="$emit('new-session')">
          New
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Dropdown from './Dropdown.vue';
import DropdownItem from './Dropdown/Item.vue';
type ProjectInfo = {
  id: string;
  worktree?: string;
};

type SessionInfo = {
  id: string;
  projectID?: string;
  parentID?: string;
  title?: string;
  slug?: string;
  directory?: string;
};

const props = defineProps<{
  projects: ProjectInfo[];
  worktrees: string[];
  worktreeMeta?: Record<string, { branch?: string }>;
  sessions: SessionInfo[];
  selectedProjectId: string;
  selectedWorktreeDir: string;
  selectedSessionId: string;
  worktreeBase?: string;
}>();

const emit = defineEmits<{
  (event: 'update:selected-project-id', value: string): void;
  (event: 'update:selected-worktree-dir', value: string): void;
  (event: 'update:selected-session-id', value: string): void;
  (event: 'new-project'): void;
  (event: 'new-worktree'): void;
  (event: 'new-session'): void;
  (event: 'delete-worktree', value: string): void;
  (event: 'delete-session', value: string): void;
}>();

const projectValue = computed({
  get: () => props.selectedProjectId,
  set: (value) => emit('update:selected-project-id', value),
});

const sessionValue = computed({
  get: () => props.selectedSessionId,
  set: (value) => emit('update:selected-session-id', value),
});

const worktreeValue = computed({
  get: () => props.selectedWorktreeDir,
  set: (value) => emit('update:selected-worktree-dir', value),
});

const canManageWorktrees = computed(() => Boolean(props.worktreeBase));
const canManageSessions = computed(() =>
  Boolean(props.selectedWorktreeDir || props.worktreeBase),
);

const selectedProjectLabel = computed(() => {
  const project = props.projects.find((item) => item.id === props.selectedProjectId);
  return project ? projectLabel(project) : '';
});

const selectedWorktreeLabel = computed(() =>
  props.selectedWorktreeDir ? worktreeLabel(props.selectedWorktreeDir) : '',
);

const selectedSessionLabel = computed(() => {
  const session = props.sessions.find((item) => item.id === props.selectedSessionId);
  return session ? sessionLabel(session) : '';
});

function projectLabel(project: ProjectInfo) {
  if (project.id === 'global') return 'global /';
  if (project.worktree) return project.worktree;
  return project.id;
}

function sessionLabel(session: SessionInfo) {
  const base = session.title || session.slug || session.id;
  return `${base} (${session.id.slice(0, 6)})`;
}

function worktreeLabel(directory: string) {
  const base = props.worktreeBase?.replace(/\/+$/, '') ?? '';
  const branch = worktreeBranch(directory);
  if (branch) return branch;
  if (base && directory.startsWith(base)) {
    const trimmed = directory.slice(base.length).replace(/^\/+/, '');
    if (trimmed) return `./${trimmed}`;
  }
  return directory;
}

function normalizeWorktreePath(value: string) {
  const trimmed = value.replace(/\/+$/, '');
  return trimmed || value;
}

function worktreeBranch(directory: string) {
  const key = normalizeWorktreePath(directory);
  return props.worktreeMeta?.[key]?.branch ?? '';
}

function canDeleteWorktree(directory: string) {
  const base = normalizeWorktreePath(props.worktreeBase ?? '');
  if (!base) return true;
  return normalizeWorktreePath(directory) !== base;
}

function handleWorktreeDelete(id: string, close?: () => void) {
  emit('delete-worktree', id);
  close?.();
}

function handleSessionDelete(id: string, close?: () => void) {
  emit('delete-session', id);
  close?.();
}
</script>

<style scoped>
.top-panel {
  position: relative;
  background: rgba(15, 23, 42, 0.92);
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 10px;
  box-shadow: 0 12px 32px rgba(2, 6, 23, 0.45);
  z-index: 20;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
}

.top-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
  flex-wrap: wrap;
}

.top-field {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 260px;
  min-width: 0;
}

.dropdown-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dropdown-empty {
  padding: 6px 8px;
  font-size: 12px;
  color: #94a3b8;
}

.dropdown-item-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-delete {
  flex: 0 0 auto;
  background: #1e293b;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 10px;
  cursor: pointer;
}

.dropdown-delete:hover {
  background: #334155;
}

.control-button {
  background: #1e293b;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
}
</style>
