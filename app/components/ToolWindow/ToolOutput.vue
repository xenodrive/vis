<script setup lang="ts">
import { computed } from 'vue';
import type { SessionMessageAssistantTool } from '@opencode-ai/client';
import { toolOutput } from '../../utils/protocol/tool-output';
import ToolSection from './ToolSection.vue';
import DiffRenderer from '../renderers/DiffRenderer.vue';
const props = defineProps<{ tool: SessionMessageAssistantTool; fileIndex?: number }>();
const display = computed(() => {
  try {
    const output = toolOutput(props.tool);
    if (props.fileIndex !== undefined)
      output.files = output.files.slice(props.fileIndex, props.fileIndex + 1);
    return { output, error: '' };
  } catch (cause) {
    return { error: String(cause) };
  }
});
</script>

<template>
  <div class="tool-output">
    <p v-if="display.error" class="error">{{ display.error }}</p>
    <template v-if="display.output">
      <p v-if="display.output.error" class="error">{{ display.output.error }}</p>
      <DiffRenderer
        v-for="file in display.output.files"
        :key="file.file"
        :path="file.file"
        :diff-patch="file.patch"
        theme="github-dark"
      />
      <ToolSection
        v-for="(section, index) in display.output.sections"
        :key="index"
        :section="section"
        :terminal="tool.name === 'shell'"
      />
      <div v-for="(file, index) in display.output.media" :key="index" class="media">
        <img
          v-if="file.mime.startsWith('image/') && file.uri.startsWith('data:image/')"
          :src="file.uri"
          :alt="file.name ?? 'Read image'"
        />
        <a
          v-else-if="file.uri.startsWith('data:')"
          :href="file.uri"
          :download="file.name ?? 'attachment'"
          >{{ file.name ?? file.mime }}</a
        >
        <span v-else>{{ file.name }} ({{ file.mime }})</span>
      </div>
      <p v-for="(notice, index) in display.output.notices" :key="index" class="notice">
        {{ notice }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.tool-output {
  min-height: 100%;
}
.notice {
  white-space: pre-wrap;
  color: #cbd5e1;
  padding: 0 8px;
}
.error {
  white-space: pre-wrap;
  color: #f87171;
  padding: 8px;
}
.media {
  padding: 8px;
}
img {
  max-width: 100%;
}
a {
  color: #93c5fd;
}
</style>
