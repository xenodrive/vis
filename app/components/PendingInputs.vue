<script setup lang="ts">
import type { SessionInboxInfo } from '@opencode/client';
defineProps<{ items: SessionInboxInfo[]; disabled: boolean }>();
defineEmits<{ cancel: [item: SessionInboxInfo] }>();
</script>

<template>
  <div class="pending-inputs">
    <p v-if="!items.length">No pending inputs.</p>
    <section v-for="item in items" :key="item.id">
      <strong>{{ item.delivery }} · {{ item.type }}</strong>
      <pre>{{
        'text' in item.payload ? item.payload.text : JSON.stringify(item.payload, null, 2)
      }}</pre>
      <button type="button" :disabled="disabled" @click="$emit('cancel', item)">
        Cancel input
      </button>
    </section>
  </div>
</template>

<style scoped>
.pending-inputs {
  padding: 12px;
  color: #e2e8f0;
  font-size: 12px;
}
section {
  padding: 8px 0;
  border-bottom: 1px solid #334155;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 8px 0;
}
button {
  border: 1px solid #475569;
  background: #1e293b;
  color: #e2e8f0;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
}
button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
