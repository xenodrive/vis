<template>
  <div class="control-panel">
    <div class="control-message">
      <textarea
        ref="textareaRef"
        v-model="messageValue"
        class="control-input control-textarea"
        placeholder="Send a message..."
        @keydown="handleKeydown"
        @keydown.enter.ctrl.prevent="$emit('send')"
        @paste="handlePaste"
        @drop="handleDrop"
        @dragover.prevent
        @dragenter.prevent
      ></textarea>
      <input
        ref="fileInputRef"
        class="file-input"
        type="file"
        :accept="acceptMime"
        multiple
        @change="handleFileChange"
      />
      <div v-if="attachments.length > 0" class="attachment-list">
        <div v-for="item in attachments" :key="item.id" class="attachment-item">
          <img
            v-if="item.mime.startsWith('image/')"
            class="attachment-thumb"
            :src="item.dataUrl"
            :alt="item.filename"
          />
          <div class="attachment-meta">
            <div class="attachment-name">{{ item.filename }}</div>
            <div class="attachment-type">{{ item.mime }}</div>
          </div>
          <button
            type="button"
            class="attachment-remove"
            @click="$emit('remove-attachment', item.id)"
          >
            Remove
          </button>
        </div>
      </div>
      <div v-if="commandPopupOpen" class="command-popup">
        <div
          v-for="(command, index) in commandMatches"
          :key="command.name"
          class="command-item"
          :class="{ 'is-active': index === activeCommandIndex }"
          @mousedown.prevent="selectCommand(command.name)"
        >
          <div class="command-name">/{{ command.name }}</div>
          <div v-if="command.description" class="command-desc">{{ command.description }}</div>
        </div>
      </div>
    </div>
    <div class="control-toolbar">
      <div class="control-selects">
        <div class="control-field compact">
          <select
            id="mode-select"
            v-model="modeValue"
            class="control-input"
            :disabled="!hasAgentOptions"
            aria-label="Agent"
            title="Agent"
          >
            <option v-if="!hasAgentOptions" value="">Loading agents...</option>
            <option v-for="agent in agentOptions" :key="agent.id" :value="agent.id">
              {{ agent.label }}
            </option>
          </select>
        </div>
        <div class="control-field compact">
          <select
            id="model-select"
            v-model="modelValue"
            class="control-input"
            :disabled="!hasModelOptions"
            aria-label="Model"
            title="Model"
          >
            <option v-if="!hasModelOptions" value="">Loading models...</option>
            <option v-for="model in modelOptions" :key="model.id" :value="model.id">
              {{ model.label }}
            </option>
          </select>
        </div>
        <div class="control-field compact">
          <select
            id="thinking-select"
            v-model="thinkingValue"
            class="control-input"
            :disabled="!hasThinkingOptions"
            aria-label="Variant"
            title="Variant"
          >
            <option v-if="!hasThinkingOptions" value="">Loading...</option>
            <option v-for="option in thinkingOptions" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </div>
      </div>
      <button
        type="button"
        class="control-button attach-button"
        @click="triggerFileInput"
      >
        Attach
      </button>
      <button
        v-if="isThinking"
        type="button"
        class="control-button stop send-button"
        :disabled="!canAbort"
        @click="$emit('abort')"
      >
        STOP
      </button>
      <button
        v-else
        type="button"
        class="control-button primary send-button"
        :disabled="!canSend"
        @click="$emit('send')"
      >
        Send
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
type ModelOption = { id: string; label: string };
type CommandOption = { name: string; description?: string; hints?: string[] };

const props = defineProps<{
  messageInput: string;
  canSend: boolean;
  selectedMode: string;
  agentOptions: Array<{ id: string; label: string }>;
  hasAgentOptions: boolean;
  selectedModel: string;
  selectedThinking: string;
  modelOptions: ModelOption[];
  thinkingOptions: string[];
  hasModelOptions: boolean;
  hasThinkingOptions: boolean;
  isThinking: boolean;
  canAbort: boolean;
  commands: CommandOption[];
  attachments: Array<{ id: string; filename: string; mime: string; dataUrl: string }>;
}>();

const emit = defineEmits<{
  (event: 'update:message-input', value: string): void;
  (event: 'update:selected-mode', value: string): void;
  (event: 'update:selected-model', value: string): void;
  (event: 'update:selected-thinking', value: string): void;
  (event: 'send'): void;
  (event: 'abort'): void;
  (event: 'add-attachments', files: File[]): void;
  (event: 'remove-attachment', id: string): void;
}>();

const messageValue = computed({
  get: () => props.messageInput,
  set: (value) => emit('update:message-input', value),
});

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const activeCommandIndex = ref(0);
const acceptMime = 'image/png,image/jpeg,image/gif,image/webp';

const slashQuery = computed(() => {
  const value = messageValue.value;
  if (!value.startsWith('/')) return '';
  const trimmed = value.slice(1);
  const match = trimmed.match(/^(\S*)/);
  return match?.[1] ?? '';
});

const commandMatches = computed(() => {
  if (!messageValue.value.startsWith('/')) return [];
  if (/\s/.test(messageValue.value.slice(1))) return [];
  const query = slashQuery.value.trim().toLowerCase();
  const list = props.commands ?? [];
  const matches = list.filter((command) =>
    command.name.toLowerCase().startsWith(query),
  );
  const limit = 8;
  return matches.slice(0, limit);
});

const commandPopupOpen = computed(() => commandMatches.value.length > 0);

watch(slashQuery, () => {
  activeCommandIndex.value = 0;
});

watch(commandMatches, (matches) => {
  if (matches.length === 0) {
    activeCommandIndex.value = 0;
    return;
  }
  if (activeCommandIndex.value >= matches.length) {
    activeCommandIndex.value = matches.length - 1;
  }
});

function applyCommandSelection(name: string) {
  const current = messageValue.value;
  const rest = current.replace(/^\/\S*/, '');
  const nextRest = rest.length > 0 ? rest : ' ';
  messageValue.value = `/${name}${nextRest}`;
  nextTick(() => {
    textareaRef.value?.focus();
  });
}

function selectCommand(name: string) {
  applyCommandSelection(name);
}

function selectActiveCommand() {
  const match = commandMatches.value[activeCommandIndex.value];
  if (!match) return;
  applyCommandSelection(match.name);
}

function extractSlashCommand(value: string) {
  if (!value.startsWith('/')) return '';
  const trimmed = value.slice(1);
  const match = trimmed.match(/^(\S+)/);
  return match?.[1] ?? '';
}

function hasMatchingCommand(name: string) {
  if (!name) return false;
  return (props.commands ?? []).some(
    (command) => command.name.toLowerCase() === name.toLowerCase(),
  );
}

function handleKeydown(event: KeyboardEvent) {
  if (commandPopupOpen.value) {
    const total = commandMatches.value.length;
    if (total === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeCommandIndex.value = (activeCommandIndex.value + 1) % total;
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeCommandIndex.value = (activeCommandIndex.value - 1 + total) % total;
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      selectActiveCommand();
      return;
    }
    if (
      event.key === 'Enter' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      selectActiveCommand();
    }
    return;
  }
  if (
    event.key === 'Enter' &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey &&
    messageValue.value.startsWith('/')
  ) {
    const commandName = extractSlashCommand(messageValue.value);
    if (!hasMatchingCommand(commandName)) return;
    event.preventDefault();
    emit('send');
  }
}

function triggerFileInput() {
  fileInputRef.value?.click();
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  const files = input?.files ? Array.from(input.files) : [];
  if (files.length > 0) emit('add-attachments', files);
  if (input) input.value = '';
}

function handlePaste(event: ClipboardEvent) {
  const items = event.clipboardData?.items ? Array.from(event.clipboardData.items) : [];
  if (items.length === 0) return;
  const files = items
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  if (files.length === 0) return;
  event.preventDefault();
  emit('add-attachments', files);
}

function handleDrop(event: DragEvent) {
  const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
  if (files.length === 0) return;
  event.preventDefault();
  emit('add-attachments', files);
}

const modeValue = computed({
  get: () => props.selectedMode,
  set: (value) => emit('update:selected-mode', value),
});

const modelValue = computed({
  get: () => props.selectedModel,
  set: (value) => emit('update:selected-model', value),
});

const thinkingValue = computed({
  get: () => props.selectedThinking,
  set: (value) => emit('update:selected-thinking', value),
});
</script>

<style scoped>
.control-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  padding: 10px;
  background: rgba(15, 23, 42, 0.92);
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(2, 6, 23, 0.45);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
}

.control-message {
  width: 100%;
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}

.control-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.control-selects {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.control-selects .control-input {
  height: 32px;
}

.control-field {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.control-field.compact {
  flex: 1 1 160px;
  min-width: 160px;
}

.control-input {
  width: 100%;
  background: #0b1320;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
}

.control-input:focus-visible {
  outline: none;
}

.control-textarea {
  resize: none;
  min-height: 96px;
  font-size: 13px;
  line-height: 1.2;
  display: block;
  height: 100%;
  min-height: 0;
}

.file-input {
  display: none;
}

.attachment-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid #1e293b;
  background: rgba(2, 6, 23, 0.6);
}

.attachment-thumb {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  border: 1px solid #334155;
  object-fit: cover;
  background: #0b1320;
}

.attachment-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;
}

.attachment-name {
  font-size: 12px;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.attachment-type {
  font-size: 10px;
  color: #94a3b8;
}

.attachment-remove {
  background: #1e293b;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 4px 6px;
  font-size: 10px;
  cursor: pointer;
}

.command-popup {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 8px);
  background: rgba(2, 6, 23, 0.98);
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 6px;
  box-shadow: 0 12px 24px rgba(2, 6, 23, 0.45);
  max-height: 220px;
  overflow: auto;
  z-index: 5;
}

.command-item {
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.command-item.is-active {
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.45);
}

.command-name {
  font-size: 12px;
  color: #e2e8f0;
}

.command-desc {
  font-size: 11px;
  color: #94a3b8;
}

.control-button {
  background: #1e293b;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 6px 12px;
  height: 32px;
  font-size: 12px;
  cursor: pointer;
}

.send-button {
  height: 32px;
}

.control-button.primary {
  background: #2563eb;
  border-color: #1d4ed8;
}

.control-button.stop {
  background: #dc2626;
  border-color: #b91c1c;
  color: #fef2f2;
}

.send-button {
  margin-left: auto;
}

.attach-button {
  height: 32px;
}
</style>
