<template>
  <dialog
    ref="dialogRef"
    class="modal-backdrop"
    @close="$emit('close')"
    @cancel.prevent
    @click.self="dialogRef?.close()"
  >
    <div class="modal">
      <header class="modal-header">
        <div class="modal-title">Settings</div>
        <button type="button" class="modal-close-button" @click="dialogRef?.close()">
          <Icon icon="lucide:x" :width="14" :height="14" />
        </button>
      </header>
      <div class="modal-body">
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">Enter to send</div>
            <div class="setting-description">
              Send messages by pressing Enter. When off, use Ctrl+Enter.
            </div>
          </div>
          <label class="toggle-switch">
            <input v-model="enterToSend" type="checkbox" class="toggle-input" />
            <span class="toggle-track" />
          </label>
        </div>
        <section class="generation-settings" aria-labelledby="commit-generation-title">
          <div id="commit-generation-title" class="setting-label">Commit message generation</div>
          <p class="setting-description">
            Generate from the commit diff using OpenCode's global model configuration.
          </p>
          <label class="model-field">
            <span>Model</span>
            <select v-model="modelKey">
              <option value="">Default (OpenCode)</option>
              <option v-if="commitModel && !selectedModel" :value="modelKey" disabled>
                {{ commitModel.providerID }}/{{ commitModel.id }} (not in current catalog)
              </option>
              <optgroup v-for="group in modelGroups" :key="group.provider" :label="group.provider">
                <option
                  v-for="model in group.models"
                  :key="model.id"
                  :value="JSON.stringify([model.providerID, model.id])"
                >
                  {{ model.name }} ({{ model.id }})
                </option>
              </optgroup>
            </select>
          </label>
          <label class="model-field">
            <span>Variant</span>
            <select v-model="variant" :disabled="!selectedModel">
              <option value="">Default</option>
              <option
                v-if="
                  commitModel?.variant &&
                  !variants.some((entry) => entry.id === commitModel?.variant)
                "
                :value="commitModel.variant"
                disabled
              >
                {{ commitModel.variant }} (not in current catalog)
              </option>
              <option v-for="entry in variants" :key="entry.id" :value="entry.id">
                {{ entry.id }}
              </option>
            </select>
          </label>
          <p class="setting-description">
            Default (OpenCode) uses the server's standard model, which may not be lightweight.
            Settings are saved automatically.
          </p>
        </section>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ModelInfo } from '@opencode-ai/client';
import { Icon } from '@iconify/vue';
import { useSettings } from '../composables/useSettings';

const props = defineProps<{
  open: boolean;
  models: ModelInfo[];
}>();

defineEmits<{
  (event: 'close'): void;
}>();

const dialogRef = ref<HTMLDialogElement | null>(null);
const { enterToSend, commitModel } = useSettings();
const modelKey = computed({
  get: () =>
    commitModel.value ? JSON.stringify([commitModel.value.providerID, commitModel.value.id]) : '',
  set: (key: string) => {
    if (!key) {
      commitModel.value = null;
      return;
    }
    const model = props.models.find(
      (entry) => JSON.stringify([entry.providerID, entry.id]) === key,
    );
    if (!model) throw new Error('The selected model is not available in the catalog.');
    commitModel.value = { providerID: model.providerID, id: model.id };
  },
});
const selectedModel = computed(() =>
  props.models.find(
    (model) =>
      model.providerID === commitModel.value?.providerID && model.id === commitModel.value?.id,
  ),
);
const variants = computed(() =>
  selectedModel.value ? selectedModel.value.variants.filter((entry) => entry.id !== 'default') : [],
);
const variant = computed({
  get: () => commitModel.value?.variant ?? '',
  set: (value: string) => {
    if (!commitModel.value) return;
    commitModel.value = {
      providerID: commitModel.value.providerID,
      id: commitModel.value.id,
      ...(value ? { variant: value } : {}),
    };
  },
});
const modelGroups = computed(() => {
  const groups = new Map<string, ModelInfo[]>();
  for (const model of props.models) {
    if (!groups.has(model.providerID)) groups.set(model.providerID, []);
    groups.get(model.providerID)!.push(model);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([provider, models]) => ({
      provider,
      models: models.toSorted((a, b) => a.name.localeCompare(b.name)),
    }));
});

watch(
  () => props.open,
  (open) => {
    const el = dialogRef.value;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  },
);
</script>

<style scoped>
.modal-backdrop {
  border: none;
  padding: 0;
  margin: 0;
  background: transparent;
  color: inherit;
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-backdrop:not([open]) {
  display: none;
}

.modal-backdrop::backdrop {
  background: rgba(2, 6, 23, 0.65);
}

.modal {
  width: min(480px, 95vw);
  max-height: 90dvh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: rgba(15, 23, 42, 0.98);
  border: 1px solid #334155;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(2, 6, 23, 0.45);
  color: #e2e8f0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.modal-title {
  font-size: 14px;
  font-weight: 600;
}

.modal-close-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid #334155;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
}

.modal-close-button:hover {
  background: #1e293b;
  color: #e2e8f0;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border: 1px solid #1e293b;
  border-radius: 8px;
  background: rgba(2, 6, 23, 0.45);
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.generation-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 12px;
}
.model-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}
.model-field select {
  width: 100%;
  min-width: 0;
  padding: 8px;
  color: #e2e8f0;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
}
.model-field select:disabled {
  opacity: 0.5;
}

.setting-label {
  font-size: 13px;
  font-weight: 500;
  color: #e2e8f0;
}

.setting-description {
  font-size: 11px;
  color: #64748b;
}

.toggle-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  cursor: pointer;
}

.toggle-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-track {
  width: 36px;
  height: 20px;
  background: #334155;
  border-radius: 10px;
  position: relative;
  transition: background 0.2s;
}

.toggle-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #94a3b8;
  border-radius: 50%;
  transition:
    transform 0.2s,
    background 0.2s;
}

.toggle-input:checked + .toggle-track {
  background: #3b82f6;
}

.toggle-input:checked + .toggle-track::after {
  transform: translateX(16px);
  background: #fff;
}
</style>
