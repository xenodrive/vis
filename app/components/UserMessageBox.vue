<script setup lang="ts">
import MessageViewer from './MessageViewer.vue';

defineProps<{
  content: string;
  agentColor: string;
  theme: string;
  files: string[];
  reverted?: boolean;
}>();
defineEmits<{ rendered: [] }>();
</script>

<template>
  <div class="user-message-box" :style="{ borderLeftColor: agentColor }">
    <slot name="actions" />
    <div class="user-message-title">💬 <slot name="title" /></div>
    <div class="user-message-body" :class="{ 'is-reverted': reverted }">
      <MessageViewer
        class="message-viewer-context-user"
        :code="content"
        lang="markdown"
        :theme="theme"
        :files="files"
        copy-button
        @rendered="$emit('rendered')"
      />
      <slot name="attachments" />
    </div>
    <slot name="footer" />
  </div>
</template>

<style scoped>
.user-message-box {
  background: rgba(2, 6, 23, 0.6);
  border: 1px solid #1e293b;
  border-left-width: 3px;
  border-radius: 10px;
  padding: 10px;
  width: 100%;
  box-sizing: border-box;
  margin: 0;
  color: #f1f5f9;
}
.user-message-title {
  margin: 0 0 6px;
  font-size: 10px;
  font-weight: 600;
}
.user-message-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  padding: 4px 0;
}
.user-message-body.is-reverted {
  text-decoration: line-through;
}
</style>
