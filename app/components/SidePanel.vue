<template>
  <aside class="side-panel" :class="{ 'is-collapsed': collapsed }">
    <button
      v-if="collapsed"
      type="button"
      class="side-toggle side-toggle-collapsed"
      :aria-expanded="!collapsed"
      aria-label="Expand side panel"
      @click="emit('toggle-collapse')"
    >
      <Icon icon="lucide:chevron-right" width="14" height="14" />
    </button>
    <div v-else class="side-body">
      <div class="side-tabs">
        <div class="side-directory" :title="treeDirectoryName">{{ treeDirectoryName }}</div>
        <button
          type="button"
          class="side-toggle side-toggle-inline"
          :aria-expanded="!collapsed"
          aria-label="Collapse side panel"
          @click="emit('toggle-collapse')"
        >
          <Icon icon="lucide:chevron-left" width="14" height="14" />
        </button>
      </div>
      <TreeView
        :root-nodes="treeNodes"
        :expanded-paths="expandedTreePaths"
        :selected-path="selectedTreePath"
        :is-loading="treeLoading"
        :error="treeError"
        :git-status-by-path="treeStatusByPath"
        :branch-info="treeBranchInfo"
        :diff-stats="treeDiffStats"
        :directory-name="treeDirectoryName"
        :branch-entries="treeBranchEntries"
        :branch-list-loading="treeBranchListLoading"
        :run-shell-command="runShellCommand"
        @toggle-dir="(path) => emit('toggle-dir', path)"
        @select-file="(path) => emit('select-file', path)"
        @open-diff="(payload) => emit('open-diff', payload)"
        @open-diff-all="(payload) => emit('open-diff-all', payload)"
        @open-file="(path) => emit('open-file', path)"
        @reload="emit('reload')"
        @git-action="(action) => emit('git-action', action)"
      />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { toRefs } from 'vue';
import { Icon } from '@iconify/vue';
import type { BranchEntry, GitBranchInfo, GitDiffStats, GitFileStatus } from '../types/git';
import type { TreeNode } from '../types/files';
import type { GitAction } from '../utils/git/actions';
import TreeView from './TreeView.vue';

const props = defineProps<{
  collapsed: boolean;
  treeNodes: TreeNode[];
  expandedTreePaths: string[];
  selectedTreePath?: string;
  treeLoading: boolean;
  treeError?: string;
  treeStatusByPath: Record<string, GitFileStatus>;
  treeBranchInfo?: GitBranchInfo | null;
  treeDiffStats?: GitDiffStats | null;
  treeDirectoryName?: string;
  treeBranchEntries?: BranchEntry[];
  treeBranchListLoading?: boolean;
  runShellCommand?: (command: string) => Promise<void>;
}>();

const emit = defineEmits<{
  (event: 'toggle-collapse'): void;
  (event: 'toggle-dir', path: string): void;
  (event: 'select-file', path: string): void;
  (event: 'open-diff', payload: { path: string; staged: boolean }): void;
  (event: 'open-diff-all', payload: { mode: 'staged' | 'changes' | 'all' }): void;
  (event: 'open-file', path: string): void;
  (event: 'reload'): void;
  (event: 'git-action', action: GitAction): void;
}>();

const {
  collapsed,
  treeNodes,
  expandedTreePaths,
  selectedTreePath,
  treeLoading,
  treeError,
  treeStatusByPath,
  treeBranchInfo,
  treeDiffStats,
  treeDirectoryName,
  treeBranchEntries,
  treeBranchListLoading,
  runShellCommand,
} = toRefs(props);
</script>

<style scoped>
.side-directory {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #cbd5e1;
  font-size: 12px;
  align-self: center;
}
.side-panel {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: row;
  border: 1px solid #334155;
  border-radius: 12px;
  background-clip: padding-box;
  background: rgba(12, 18, 30, 0.95);
  box-shadow: 0 10px 24px rgba(2, 6, 23, 0.35);
  overflow: hidden;
}

.side-toggle {
  width: 26px;
  height: 26px;
  border: 1px solid rgba(100, 116, 139, 0.45);
  border-radius: 6px;
  background: rgba(30, 41, 59, 0.92);
  color: #cbd5e1;
  cursor: pointer;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.side-toggle:hover {
  background: rgba(51, 65, 85, 0.95);
}

.side-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.side-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid rgba(71, 85, 105, 0.42);
}

.side-tab {
  flex: 1;
  border: 1px solid rgba(100, 116, 139, 0.35);
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.7);
  color: #94a3b8;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  padding: 5px 0;
  cursor: pointer;
}

.side-tab.is-active {
  background: rgba(30, 64, 175, 0.45);
  color: #e2e8f0;
  border-color: rgba(96, 165, 250, 0.6);
}

.side-panel.is-collapsed {
  border-color: rgba(100, 116, 139, 0.45);
}

.side-toggle-inline {
  margin-left: auto;
}

.side-toggle-collapsed {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 0;
}
</style>
