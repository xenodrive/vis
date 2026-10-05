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
opencode service set cors ${origin}
\`\`\`

**2. Get connection details**

Start or reuse the service and generate a one-time pairing link:
\`\`\`bash
opencode pair
\`\`\`

**3. Connect to OpenCode**

Paste the full pairing URL above, then select **Connect**. Do not open it first: each link works only once.

Vis saves the session token for reconnection. If the link expires or has already been used, run \`opencode pair\` again to get a new one.

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
