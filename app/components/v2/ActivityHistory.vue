<script setup lang="ts">
import ThreadHistoryContent from '../ThreadHistoryContent.vue';
import type { HistoryWindowEntry } from '../../types/message';
import type { ToolPart, ReasoningPart } from '../../types/sse';
import type { ActivityMessage } from '../../composables/useV2Activity';
defineProps<{ entries: HistoryWindowEntry[]; activities: ActivityMessage[]; theme: string }>();
const emit = defineEmits<{
  'tool-click': [part: ToolPart];
  'reasoning-click': [part: ReasoningPart];
  'activity-click': [message: ActivityMessage];
}>();
</script>

<template>
  <ThreadHistoryContent
    :entries="entries"
    :theme="theme"
    @tool-click="emit('tool-click', $event)"
    @reasoning-click="emit('reasoning-click', $event)"
  />
  <section v-if="activities.length" class="activity-history">
    <h3>Session activities · loaded history</h3>
    <button
      v-for="message in activities"
      :key="message.id"
      type="button"
      @click="emit('activity-click', message)"
    >
      {{ message.type === 'skill' ? `📚 ${message.name}` : `$ ${message.command}` }}
    </button>
  </section>
</template>

<style scoped>
.activity-history {
  padding: 12px;
}
h3 {
  color: #94a3b8;
  font-size: 12px;
  margin-bottom: 8px;
}
button {
  display: block;
  width: 100%;
  text-align: left;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  padding: 6px 10px;
  margin-top: 4px;
  border: 1px solid #475569;
  border-radius: 4px;
  background: #1e293b;
  color: #e2e8f0;
  cursor: pointer;
}
button:hover {
  background: #334155;
}
</style>
