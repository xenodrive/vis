<script setup lang="ts">
import { computed, onActivated, onDeactivated, ref, shallowRef, watch } from 'vue';
import DiffViewer from '../viewers/DiffViewer.vue';
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
  error: [cause: unknown];
  'toggle-hunk': [index: number];
  preview: [file: string, preview: GitPreview];
}>();
const source = shallowRef<GitSource>();
const loading = ref(false);
const error = shallowRef<unknown>();
let visible = true;
const hunks = computed(() => source.value?.preview.hunks ?? []);
const patches = computed(() => hunks.value.map(displayHunk));
const metadata = computed(() =>
  (source.value?.preview.header ?? '')
    .split('\n')
    .filter((line) =>
      /^(old mode|new mode|new file mode|deleted file mode|rename from|rename to) /.test(line),
    )
    .join('\n'),
);
watch(
  () => [props.snapshot, props.mode, props.file] as const,
  async (_, __, onCleanup) => {
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
    source.value = undefined;
    error.value = undefined;
    loading.value = true;
    if (visible) emit('loading', true);
    try {
      const result = await props.api.source(props.snapshot, props.mode, props.file);
      if (!cancelled) {
        source.value = result;
        emit('preview', props.file.file, result.preview);
      }
    } catch (cause) {
      if (!cancelled) {
        error.value = cause;
        if (visible) emit('error', cause);
      }
    } finally {
      if (!cancelled) {
        loading.value = false;
        if (visible) emit('loading', false);
      }
    }
  },
  { immediate: true },
);
onActivated(() => {
  visible = true;
  emit('loading', loading.value);
  if (error.value) emit('error', error.value);
});
onDeactivated(() => {
  visible = false;
});
</script>

<template>
  <div class="git-diff-file" :aria-busy="loading">
    <div class="git-diff-heading">
      {{ file.file }} <span class="git-add">+{{ file.additions }}</span>
      <span class="git-del">−{{ file.deletions }}</span>
    </div>
    <pre v-if="metadata" class="git-diff-metadata">{{ metadata }}</pre>
    <p v-if="source?.preview.binary" class="git-diff-notice">
      Binary or non-UTF-8 file changed.<template v-if="selectable">
        Select the whole file.</template
      >
    </p>
    <template v-else-if="source">
      <template v-if="hunks.length">
        <div v-for="(_, index) in hunks" :key="index" class="git-hunk">
          <label v-if="selectable && source.preview.selectable"
            ><input
              type="checkbox"
              :checked="selection === 'all' || Boolean(selection?.includes(index))"
              :disabled="disabled"
              @change="emit('toggle-hunk', index)"
            />
            Hunk {{ index + 1 }}</label
          >
          <DiffViewer
            :path="file.file"
            :diff-code="source.before"
            :diff-after="source.after"
            :diff-patch="patches[index]"
            theme="github-dark"
          />
        </div>
      </template>
      <DiffViewer
        v-else
        :path="file.file"
        :diff-code="source.before"
        :diff-after="source.after"
        :diff-patch="source.preview.header"
        theme="github-dark"
      />
    </template>
  </div>
</template>

<style scoped>
.git-diff-file {
  min-height: 100%;
  font-family: var(--term-font-family);
  font-size: var(--term-font-size);
  line-height: var(--term-line-height);
}
.git-diff-heading {
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
.git-hunk > label {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  background: #1e293b;
  font-size: 12px;
}
</style>
