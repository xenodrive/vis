<template>
  <div class="diff-renderer-content" :style="{ '--code-gutter-width': gutterWidth }">
    <div v-if="hasTabs" class="viewer-tabs">
      <button
        v-for="(tab, i) in diffTabs"
        :key="tab.file"
        type="button"
        class="viewer-tab"
        :class="{ active: i === activeTabIndex }"
        @click="activeTabIndex = i"
      >
        {{ basename(tab.file) }}
      </button>
    </div>
    <div class="viewer-body">
      <div v-if="showLoading" class="viewer-loading" role="status" aria-label="Loading diff">
        <Icon icon="mdi:loading" />
      </div>
      <div v-else-if="hunks.length" class="diff-document">
        <CodeContent v-if="preamble" :html="preamble" variant="diff" />
        <section v-for="hunk in hunks" :key="hunk.index">
          <div class="hunk-header">
            <div class="hunk-controls">
              <slot name="hunk-header" :index="hunk.index" :header="hunk.header" />
            </div>
            <span class="hunk-title">{{ hunk.header }}</span>
          </div>
          <CodeContent :html="hunk.html" variant="diff" />
        </section>
      </div>
      <CodeContent v-else :html="renderedHtml || ''" variant="diff" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import CodeContent from '../CodeContent.vue';
import { Icon } from '@iconify/vue';
import { type CodeRenderParams, useCodeRender } from '../../utils/useCodeRender';
import { guessLanguageFromPath } from '../ToolWindow/utils';

const props = defineProps<{
  path?: string;
  diffCode?: string;
  diffAfter?: string;
  diffPatch?: string;
  diffTabs?: Array<{ file: string; before: string; after: string }>;
  gutterMode?: 'none' | 'double';
  lang?: string;
  theme?: string;
}>();

const emit = defineEmits<{
  (event: 'rendered'): void;
}>();

const activeTabIndex = ref(0);
const hasTabs = computed(() => !!props.diffTabs && props.diffTabs.length > 1);

const activePath = computed(() => {
  const tabs = props.diffTabs;
  if (!tabs || tabs.length === 0) return props.path;
  return tabs[activeTabIndex.value]?.file;
});

const activeDiffCode = computed(() => {
  const tabs = props.diffTabs;
  if (!tabs || tabs.length === 0) return props.diffCode ?? '';
  return tabs[activeTabIndex.value]?.before ?? '';
});

const activeDiffAfter = computed(() => {
  const tabs = props.diffTabs;
  if (!tabs || tabs.length === 0) return props.diffAfter;
  return tabs[activeTabIndex.value]?.after;
});

const activeDiffLang = computed(() => {
  if (props.lang && props.lang !== 'text') return props.lang;
  return guessLanguageFromPath(activePath.value);
});

const renderParams = computed<CodeRenderParams | null>(() => {
  const hasDiffTabs = !!props.diffTabs && props.diffTabs.length > 0;
  if (!activeDiffCode.value && !activeDiffAfter.value && !props.diffPatch) return null;
  return {
    code: activeDiffCode.value,
    after: activeDiffAfter.value,
    patch: hasDiffTabs ? undefined : props.diffPatch || undefined,
    lang: activeDiffLang.value,
    theme: props.theme ?? 'github-dark',
    gutterMode: props.gutterMode ?? 'double',
  };
});

const { html: renderedHtml, hunks, preamble } = useCodeRender(renderParams);
const gutterWidth = computed(() => {
  let maximum = 1;
  for (const hunk of hunks.value) {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(hunk.header);
    if (!match) continue;
    maximum = Math.max(
      maximum,
      Number(match[1]) + Number(match[2] ?? 1),
      Number(match[3]) + Number(match[4] ?? 1),
    );
  }
  return `${String(maximum).length + 2}ch`;
});

watch(
  [() => renderedHtml.value, () => activeTabIndex.value],
  () => {
    nextTick(() => emit('rendered'));
  },
  { immediate: true },
);

const showLoading = computed(() => {
  if (renderedHtml.value) return false;
  return !!renderParams.value;
});

function basename(filepath: string) {
  return filepath.split('/').pop() ?? filepath;
}
</script>

<style scoped>
.hunk-header {
  display: grid;
  grid-template-columns: calc(2 * var(--code-gutter-width)) 1fr;
  box-sizing: border-box;
  background: #1e293b;
  color: #94a3b8;
  font-family: var(--term-font-family);
  font-size: var(--term-font-size);
  white-space: pre;
}
.hunk-controls {
  position: sticky;
  left: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--code-gutter-background, #161b22);
}
.hunk-title {
  padding: 8px 0 8px 1ch;
}
.diff-renderer-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.viewer-tabs {
  display: flex;
  gap: 0;
  background: rgba(26, 29, 36, 0.95);
  border-bottom: 1px solid rgba(90, 100, 120, 0.35);
  overflow-x: auto;
  scrollbar-width: none;
  flex-shrink: 0;
}

.viewer-tabs::-webkit-scrollbar {
  display: none;
}

.viewer-tab {
  border: 0;
  background: transparent;
  color: #8a8f9a;
  font-size: 11px;
  font-family: inherit;
  padding: 3px 10px;
  cursor: pointer;
  white-space: nowrap;
  border-bottom: 2px solid transparent;
  transition:
    color 0.15s,
    border-color 0.15s;
}

.viewer-tab:hover {
  color: #cbd5e1;
}

.viewer-tab.active {
  color: #e2e8f0;
  border-bottom-color: #60a5fa;
}

.viewer-body {
  container-type: inline-size;
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.diff-document {
  display: grid;
  min-width: 100%;
  width: max-content;
}
.diff-document > section {
  min-width: 0;
}
.diff-document :deep(.code-content) {
  width: auto;
}

.viewer-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #64748b;
  font-size: 13px;
  user-select: none;
}
.viewer-loading svg {
  animation: diff-spin 1s linear infinite;
}
@keyframes diff-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
