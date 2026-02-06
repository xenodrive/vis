<template>
  <div class="top-panel">
    <div class="top-row">
      <div class="top-field">
        <Dropdown
          v-model="baseWorktreeValue"
          :label="selectedBaseWorktreeLabel"
          placeholder="Select directory"
          auto-close
        >
          <template #default>
            <div class="dropdown-list">
              <div v-if="baseWorktrees.length === 0" class="dropdown-empty">No directories</div>
              <DropdownItem v-for="dir in baseWorktrees" :key="dir" :value="dir">
                <span class="dropdown-item-label">{{ dir }}</span>
              </DropdownItem>
            </div>
          </template>
        </Dropdown>
        <button type="button" class="control-button" @click="$emit('open-directory')">
          Open
        </button>
      </div>

      <div class="top-field">
        <Dropdown
          v-model="activeDirectoryValue"
          :label="selectedActiveDirectoryLabel"
          placeholder="Select worktree"
          :disabled="!baseWorktree"
          auto-close
        >
          <template #default="{ close }">
            <div class="dropdown-list">
              <div v-if="activeDirectories.length === 0" class="dropdown-empty">No worktrees</div>
              <DropdownItem
                v-for="directory in activeDirectories"
                :key="directory"
                :value="directory"
              >
                <span class="dropdown-item-label">{{ activeDirectoryLabel(directory) }}</span>
                <button
                  v-if="canDeleteActiveDirectory(directory)"
                  type="button"
                  class="dropdown-delete"
                  @click.stop="handleActiveDirectoryDelete(directory, close)"
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
          :disabled="!baseWorktree"
          @click="$emit('create-worktree')"
        >
          Add
        </button>
      </div>

      <div class="top-field">
        <Dropdown
          v-model="sessionValue"
          :label="selectedSessionLabel"
          placeholder="Select session"
          :disabled="!activeDirectory"
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

type SessionInfo = {
  id: string;
  projectID?: string;
  parentID?: string;
  title?: string;
  slug?: string;
  directory?: string;
};

const props = defineProps<{
  baseWorktrees: string[];
  baseWorktree: string;
  activeDirectories: string[];
  activeDirectory: string;
  activeDirectoryMeta?: Record<string, { branch?: string }>;
  sessions: SessionInfo[];
  selectedSessionId: string;
}>();

const emit = defineEmits<{
  (event: 'update:base-worktree', value: string): void;
  (event: 'update:active-directory', value: string): void;
  (event: 'update:selected-session-id', value: string): void;
  (event: 'open-directory'): void;
  (event: 'create-worktree'): void;
  (event: 'new-session'): void;
  (event: 'delete-active-directory', value: string): void;
  (event: 'delete-session', value: string): void;
}>();

const baseWorktreeValue = computed({
  get: () => props.baseWorktree,
  set: (value) => emit('update:base-worktree', value),
});

const activeDirectoryValue = computed({
  get: () => props.activeDirectory,
  set: (value) => emit('update:active-directory', value),
});

const sessionValue = computed({
  get: () => props.selectedSessionId,
  set: (value) => emit('update:selected-session-id', value),
});

const selectedBaseWorktreeLabel = computed(() => props.baseWorktree || '');

const selectedActiveDirectoryLabel = computed(() => {
  if (!props.activeDirectory) return '';
  return activeDirectoryLabel(props.activeDirectory);
});

const selectedSessionLabel = computed(() => {
  const session = props.sessions.find((item) => item.id === props.selectedSessionId);
  return session ? sessionLabel(session) : '';
});

function sessionLabel(session: SessionInfo) {
  const base = session.title || session.slug || session.id;
  return `${base} (${session.id.slice(0, 6)})`;
}

function activeDirectoryLabel(directory: string) {
  const branch = activeDirectoryBranch(directory);
  if (branch) return branch;
  return directory;
}

function normalizeDirectory(value: string) {
  const trimmed = value.replace(/\/+$/, '');
  return trimmed || value;
}

function activeDirectoryBranch(directory: string) {
  const key = normalizeDirectory(directory);
  return props.activeDirectoryMeta?.[key]?.branch ?? '';
}

function canDeleteActiveDirectory(directory: string) {
  const base = normalizeDirectory(props.baseWorktree);
  if (!base) return true;
  return normalizeDirectory(directory) !== base;
}

function handleActiveDirectoryDelete(directory: string, close?: () => void) {
  emit('delete-active-directory', directory);
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

.control-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
