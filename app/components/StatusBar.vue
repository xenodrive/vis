<template>
  <div class="statusbar" role="status" aria-live="polite">
    <div class="statusbar-section statusbar-left">
      <button
        v-if="connectionStatus === 'disconnected'"
        type="button"
        class="statusbar-reconnect"
        title="Reconnect to the server"
        @click="emit('reconnect')"
      >
        🔴 Disconnected
      </button>
      <span v-else-if="connectionStatus === 'connecting'" class="statusbar-text">
        🟡 Connecting…
      </span>
      <span v-else-if="connectionStatus === 'reconnecting'" class="statusbar-text">
        🟡 Reconnecting…
      </span>
      <span v-else class="statusbar-text">{{ thinkingDisplayText }}</span>
    </div>
    <div
      class="statusbar-section statusbar-right"
      :class="{ 'is-error': isStatusError, 'is-retry': isRetryStatus }"
    >
      {{ statusText }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ConnectionStatus } from '../types/event-worker';

defineProps<{
  connectionStatus: ConnectionStatus;
  thinkingDisplayText: string;
  statusText: string;
  isStatusError: boolean;
  isRetryStatus: boolean;
}>();

const emit = defineEmits<{ (event: 'reconnect'): void }>();
</script>

<style scoped>
.statusbar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 12px 12px;
  border-top: none;
  background: transparent;
  color: #94a3b8;
  font-size: 8pt;
  line-height: 1.2;
  margin: 0;
  border-radius: 0;
  box-sizing: border-box;
  z-index: 2;
}

.statusbar-section {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.statusbar-right {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.statusbar-reconnect {
  padding: 0;
  border: none;
  background: transparent;
  color: #fecaca;
  font: inherit;
  cursor: pointer;
}

.statusbar-reconnect:hover {
  text-decoration: underline;
}

.statusbar-reconnect:focus-visible {
  outline: 1px solid currentColor;
  outline-offset: 3px;
}

.statusbar-right.is-error,
.statusbar-right.is-retry {
  color: #fecaca;
}
</style>
