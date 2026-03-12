<script setup lang="ts">
import { ref, computed } from 'vue';
import type { FileDiffInfo } from '@opencode-ai/client';
import DiffViewer from '../viewers/DiffViewer.vue';
const props = defineProps<{ files: FileDiffInfo[] }>();
const index = ref(0);
const active = computed(() => props.files[index.value]);
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
    <DiffViewer
      v-if="active"
      :key="active.file"
      :path="active.file"
      :diff-patch="active.patch"
      theme="github-dark"
    />
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
