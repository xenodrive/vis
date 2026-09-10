<script setup lang="ts">
import { computed, onActivated, onDeactivated, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import DiffViewer from '../viewers/DiffViewer.vue';
import { Icon } from '@iconify/vue';
import {
  displayHunk,
  type GitPreview,
  type GitActions,
  type GitDiffMode,
  type GitPatch,
  type GitSnapshot,
  type GitSource,
} from '../../v2/git';

const props = defineProps<{
  api: GitActions;
  snapshot: GitSnapshot;
  file: GitPatch;
  mode: GitDiffMode;
  selectable?: boolean;
  selection?: 'all' | number[];
  disabled?: boolean;
}>();
const emit = defineEmits<{
  loading: [value: boolean];
  'toggle-hunk': [index: number];
  preview: [file: string, preview: GitPreview];
}>();
const source = shallowRef<GitSource>();
const preview = shallowRef<GitPreview>();
const loading = ref(false);
const error = shallowRef<unknown>();
let visible = true;
let controller: AbortController | undefined;
const errorText = computed(() =>
  error.value instanceof Error ? error.value.message : String(error.value ?? ''),
);
const hunks = computed(() => preview.value?.hunks ?? []);
const patch = computed(() => (preview.value?.header ?? '') + hunks.value.map(displayHunk).join(''));
function cancel() {
  controller?.abort();
  controller = undefined;
  loading.value = false;
}
async function load() {
  cancel();
  const request = new AbortController();
  controller = request;
  error.value = undefined;
  loading.value = true;
  emit('loading', true);
  try {
    const result = await props.api.preview(props.snapshot, props.mode, props.file, request.signal);
    if (controller !== request) return;
    source.value = undefined;
    preview.value = result;
    emit('preview', props.file.file, preview.value);
    if (result.binary) return;
    const highlighted = await props.api.source(
      props.snapshot,
      props.mode,
      props.file,
      request.signal,
    );
    if (controller !== request) return;
    if (highlighted.preview.hash !== result.hash)
      throw new Error('File changed. Refresh its diff before loading source highlighting.');
    source.value = highlighted;
    preview.value = highlighted.preview;
    emit('preview', props.file.file, preview.value);
  } catch (cause) {
    if (controller === request) error.value = cause;
  } finally {
    if (controller === request) {
      controller = undefined;
      loading.value = false;
      emit('loading', false);
    }
  }
}
watch(
  () => [props.snapshot, props.mode, props.file] as const,
  () => {
    cancel();
    source.value = undefined;
    preview.value = undefined;
    error.value = undefined;
    if (visible) void load();
  },
  { immediate: true },
);
onActivated(() => {
  visible = true;
  emit('loading', loading.value);
  if (!source.value && !preview.value?.binary && !loading.value && !error.value) void load();
});
onDeactivated(() => {
  visible = false;
  cancel();
});
onBeforeUnmount(cancel);
</script>

<template>
  <div class="git-diff-file" :aria-busy="loading">
    <div class="git-diff-heading">
      {{ file.file }}
    </div>
    <Icon
      v-if="loading"
      icon="mdi:loading"
      class="git-diff-spinner"
      aria-label="Loading diff"
      role="status"
    />
    <p v-if="error" class="git-diff-notice" role="alert">
      {{ errorText }}
      <button type="button" :disabled="loading" @click="load()">Retry diff</button>
    </p>
    <p v-if="preview?.binary" class="git-diff-notice">
      Binary or non-UTF-8 file changed.<template v-if="selectable">
        Select the whole file.</template
      >
    </p>
    <template v-else-if="preview">
      <DiffViewer
        :path="file.file"
        :diff-code="source?.before"
        :diff-after="source?.after"
        :diff-patch="patch"
        theme="github-dark"
      >
        <template v-if="selectable && preview.selectable" #hunk-header="{ index }">
          <label class="git-hunk-selection">
            <input
              type="checkbox"
              :aria-label="`Select hunk ${index + 1}`"
              :checked="selection === 'all' || Boolean(selection?.includes(index))"
              :disabled="disabled"
              @change="emit('toggle-hunk', index)"
            />
          </label>
        </template>
      </DiffViewer>
    </template>
  </div>
</template>

<style scoped>
.git-diff-file {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  font-family: var(--term-font-family);
  font-size: var(--term-font-size);
  line-height: var(--term-line-height);
}
.git-diff-file > .diff-viewer-root {
  flex: 1;
  height: auto;
}
.git-diff-spinner {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 16px;
  height: 16px;
  z-index: 3;
  animation: git-diff-spin 1s linear infinite;
}
@keyframes git-diff-spin {
  to {
    transform: rotate(360deg);
  }
}
.git-diff-heading {
  flex-shrink: 0;
  padding-right: 36px;
  padding: 10px;
  overflow-wrap: anywhere;
  font-size: 12px;
}
.git-add {
  color: #4ade80;
}
.git-del {
  color: #f87171;
}
.git-diff-metadata,
.git-diff-notice {
  padding: 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 12px;
  color: #94a3b8;
}
.git-hunk-selection {
  display: flex;
  margin-left: auto;
  padding-right: 1ch;
  gap: 8px;
  font-size: 12px;
}
</style>
