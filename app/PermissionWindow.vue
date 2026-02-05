<template>
  <div class="permission-window">
    <div class="permission-header">
      <div class="permission-title">Permission request</div>
      <div class="permission-type">{{ request.permission }}</div>
    </div>
    <div class="permission-row">
      <div class="permission-label">Session</div>
      <div class="permission-value">{{ request.sessionID }}</div>
    </div>
    <div v-if="request.tool" class="permission-row">
      <div class="permission-label">Tool</div>
      <div class="permission-value">
        message {{ request.tool.messageID }}
        <span class="divider">/</span>
        call {{ request.tool.callID }}
      </div>
    </div>
    <div class="permission-section">
      <div class="section-title">Patterns</div>
      <ul class="pattern-list">
        <li v-for="pattern in request.patterns" :key="pattern">{{ pattern }}</li>
        <li v-if="request.patterns.length === 0" class="empty">None</li>
      </ul>
    </div>
    <div class="permission-section">
      <div class="section-title">Metadata</div>
      <div v-if="metadataEntries.length === 0" class="empty">None</div>
      <div v-for="entry in metadataEntries" :key="entry[0]" class="metadata-row">
        <div class="metadata-key">{{ entry[0] }}</div>
        <div class="metadata-value">{{ formatValue(entry[1]) }}</div>
      </div>
    </div>
    <div v-if="request.always.length > 0" class="permission-section">
      <div class="section-title">Always allow</div>
      <ul class="pattern-list">
        <li v-for="pattern in request.always" :key="pattern">{{ pattern }}</li>
      </ul>
    </div>
    <div v-if="error" class="permission-error">{{ error }}</div>
    <div class="permission-actions">
      <button
        type="button"
        class="permission-button is-once"
        :disabled="isSubmitting"
        @click="emitReply('once')"
      >
        Once
      </button>
      <button
        type="button"
        class="permission-button is-always"
        :disabled="isSubmitting"
        @click="emitReply('always')"
      >
        Always
      </button>
      <button
        type="button"
        class="permission-button is-reject"
        :disabled="isSubmitting"
        @click="emitReply('reject')"
      >
        Reject
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type PermissionRequest = {
  id: string;
  sessionID: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  always: string[];
  tool?: {
    messageID: string;
    callID: string;
  };
};

type PermissionReply = 'once' | 'always' | 'reject';

const props = defineProps<{
  request: PermissionRequest;
  isSubmitting?: boolean;
  error?: string;
}>();

const emit = defineEmits<{
  (event: 'reply', payload: { requestId: string; reply: PermissionReply }): void;
}>();

const metadataEntries = computed(() => Object.entries(props.request.metadata ?? {}));

function formatValue(value: unknown) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function emitReply(reply: PermissionReply) {
  emit('reply', { requestId: props.request.id, reply });
}
</script>

<style scoped>
.permission-window {
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: #e2e8f0;
  font-size: 12px;
}

.permission-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.permission-title {
  font-size: 13px;
  font-weight: 700;
}

.permission-type {
  font-size: 11px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.permission-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.permission-label {
  color: #94a3b8;
  font-size: 11px;
}

.permission-value {
  color: #e2e8f0;
  font-size: 11px;
  word-break: break-all;
}

.divider {
  margin: 0 4px;
  color: #64748b;
}

.permission-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-title {
  color: #cbd5f5;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.pattern-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pattern-list li {
  word-break: break-all;
}

.metadata-row {
  display: grid;
  grid-template-columns: minmax(80px, auto) 1fr;
  gap: 8px;
  align-items: start;
}

.metadata-key {
  color: #94a3b8;
  font-size: 11px;
}

.metadata-value {
  color: #e2e8f0;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
}

.empty {
  color: #64748b;
  font-size: 11px;
}

.permission-error {
  color: #fecaca;
  font-size: 11px;
}

.permission-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.permission-button {
  border-radius: 8px;
  padding: 6px 10px;
  border: 1px solid #334155;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 11px;
  cursor: pointer;
}

.permission-button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.permission-button.is-once {
  background: rgba(14, 116, 144, 0.25);
  border-color: rgba(14, 116, 144, 0.7);
}

.permission-button.is-always {
  background: rgba(34, 197, 94, 0.18);
  border-color: rgba(34, 197, 94, 0.6);
}

.permission-button.is-reject {
  background: rgba(239, 68, 68, 0.18);
  border-color: rgba(239, 68, 68, 0.6);
}
</style>
