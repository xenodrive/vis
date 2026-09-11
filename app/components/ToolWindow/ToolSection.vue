<script setup lang="ts">
import { computed, watch } from 'vue';
import type { ToolSection } from '../../utils/protocol/tool-output';
import { useCodeRender } from '../../utils/useCodeRender';
import { guessLanguageFromPath } from './utils';
import { useFloatingWindow } from '../../composables/useFloatingWindow';
import CodeContent from '../CodeContent.vue';
const props = defineProps<{ section: ToolSection; terminal?: boolean }>();
const window = useFloatingWindow();
const { html, error } = useCodeRender(
  computed(() => ({
    code: props.section.code,
    lang: props.section.path ? guessLanguageFromPath(props.section.path) : 'text',
    theme: 'github-dark',
    gutterMode: props.section.gutterLines ? 'single' : 'none',
    gutterLines: props.section.gutterLines,
  })),
);
watch(html, () => window.notifyContentChange());
</script>

<template>
  <section>
    <p v-if="error" class="error">{{ error }}</p>
    <CodeContent v-else :html="html" :variant="terminal ? 'term' : 'code'" />
  </section>
</template>

<style scoped>
.error {
  color: #f87171;
  padding: 8px;
}
</style>
