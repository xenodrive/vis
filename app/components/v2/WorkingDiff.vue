<script setup lang="ts">
import { ref, computed } from 'vue';
import GitDiffFile from './GitDiffFile.vue';
import type { GitActions, GitSnapshot, GitDiffMode, GitPatch } from '../../v2/git';
const props = defineProps<{
  files: GitPatch[];
  api: GitActions;
  snapshot: GitSnapshot;
  mode: 'staged' | 'changes';
}>();
const index = ref(0);
const active = computed(() => props.files[index.value]);
const loading = ref(false);
const error = ref('');
function mode(file: GitPatch): GitDiffMode {
  return props.snapshot.untracked.some((entry) => entry.file === file.file)
    ? 'untracked'
    : props.mode;
}
function report(cause: unknown) {
  error.value = cause instanceof Error ? cause.message : JSON.stringify(cause);
}
</script>

<template>
  <div class="working-diff">
    <div class="file-tabs" v-if="files.length > 1">
      <button
        v-for="(file, i) in files"
        :key="file.file"
        :class="{ active: i === index }"
        @click="index = i"
      >
        {{ file.file }} <span>+{{ file.additions }} −{{ file.deletions }}</span>
      </button>
    </div>
    <div class="diff-body">
      <KeepAlive
        ><GitDiffFile
          v-if="active"
          :key="active.file"
          :file="active"
          :api="api"
          :snapshot="snapshot"
          :mode="mode(active)"
          @loading="loading = $event"
          @error="report"
      /></KeepAlive>
    </div>
    <div class="diff-status" role="status" :title="error">
      {{ error || (loading ? 'Loading diff…' : '') }}
    </div>
  </div>
</template>

<style scoped>
.working-diff {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.file-tabs {
  display: flex;
  flex-shrink: 0;
  overflow-x: auto;
  border-bottom: 1px solid #334155;
}
.diff-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.diff-status {
  flex: 0 0 24px;
  height: 24px;
  padding: 4px 8px;
  font-size: 11px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-top: 1px solid #334155;
}
button {
  white-space: nowrap;
  padding: 6px 10px;
  color: #94a3b8;
  cursor: pointer;
  font-size: 12px;
}
button.active {
  color: #e2e8f0;
  background: #1e293b;
}
span {
  font-size: 10px;
}
</style>
