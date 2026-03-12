<template>
  <div class="welcome-content">
    <MessageViewer :code="markdown" lang="markdown" :theme="theme" />
  </div>
</template>

<script setup lang="ts">
import MessageViewer from './MessageViewer.vue';

defineProps<{
  theme: string;
}>();

const origin = window.location.origin;

const markdown = `\
# How To Use \`OpenCode Visualizer\`

**1. Configure CORS**

Allow this vis origin in the OpenCode service's CORS settings:

\`\`\`bash
opencode2 service set cors ${origin}
\`\`\`

**2. Get connection details**

Start or reuse the service and display its connection details:
\`\`\`bash
opencode2 pair
\`\`\`

**3. Connect to OpenCode**

Enter the displayed URL and Password above, then select **Connect**.

`;
</script>

<style scoped>
.welcome-content {
  text-align: left;
  font-size: 12px;
  line-height: 1.5;
  color: #94a3b8;
}
</style>
