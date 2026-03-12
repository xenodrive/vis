<script setup lang="ts">
import type { PendingPrompt } from '../../v2/pending-prompts';
import UserMessageBox from '../UserMessageBox.vue';

defineProps<{
  items: PendingPrompt[];
  theme: string;
  files: string[];
  sessionAgent?: string;
  resolveAgentColor: (agent?: string) => string;
}>();
defineEmits<{ dismiss: [id: string] }>();
</script>

<template>
  <UserMessageBox
    v-for="item in items"
    :key="item.id"
    :content="item.text"
    :agent-color="resolveAgentColor(item.agent ?? sessionAgent)"
    :theme="theme"
    :files="files"
  >
    <template #title>
      <span role="status">
        {{
          item.status === 'sending'
            ? 'Sending…'
            : item.status === 'accepted'
              ? 'Received by server · Waiting to be included in the conversation'
              : 'Send failed · Input retained in composer'
        }}
      </span>
    </template>
    <template #actions>
      <button
        v-if="item.status === 'failed'"
        class="pending-prompt-dismiss"
        type="button"
        @click="$emit('dismiss', item.id)"
      >
        Dismiss
      </button>
    </template>
    <template #attachments>
      <ul v-if="item.files.length">
        <li v-for="(file, index) in item.files" :key="index">{{ file }}</li>
      </ul>
    </template>
    <template #footer>
      <p v-if="item.error" class="pending-prompt-error">{{ item.error }}</p>
    </template>
  </UserMessageBox>
</template>

<style scoped>
.pending-prompt-dismiss {
  float: right;
  font-size: 10px;
}
.pending-prompt-error {
  color: #f87171;
}
</style>
