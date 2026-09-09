<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Dropdown from './Dropdown.vue';
import DropdownItem from './Dropdown/Item.vue';
import DropdownLabel from './Dropdown/Label.vue';
import DropdownSearch from './Dropdown/Search.vue';

export type ModelOption = {
  id: string;
  modelID: string;
  label: string;
  displayName: string;
  providerID?: string;
  providerLabel?: string;
};
const props = defineProps<{
  modelValue: string;
  options: ModelOption[];
  disabled?: boolean;
  defaultLabel?: string;
  upward?: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:open': [open: boolean];
}>();
const root = ref<HTMLElement>();
const open = ref(false);
const query = ref('');
function findModel(id: unknown) {
  return props.options.find((model) => model.id === id);
}
const value = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value),
});
const groups = computed(() => {
  const groups = new Map<
    string | undefined,
    { providerID?: string; label?: string; models: ModelOption[] }
  >();
  const terms = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  for (const model of props.options) {
    if (
      !terms.every((term) =>
        [model.displayName, model.modelID, model.providerID, model.providerLabel].some((field) =>
          field?.toLowerCase().includes(term),
        ),
      )
    )
      continue;
    let group = groups.get(model.providerID);
    if (!group) {
      group = {
        providerID: model.providerID,
        label: model.providerLabel ?? model.providerID,
        models: [],
      };
      groups.set(model.providerID, group);
    }
    group.models.push(model);
  }
  return [...groups.values()];
});
watch(open, (value) => {
  if (value) query.value = '';
  emit('update:open', value);
});
defineExpose({
  open() {
    if (props.disabled) return false;
    root.value?.querySelector('button')?.focus();
    open.value = true;
    return true;
  },
  reset() {
    query.value = '';
    open.value = false;
  },
});
</script>

<template>
  <div ref="root" class="model-control-root">
    <Dropdown
      v-model="value"
      v-model:open="open"
      :disabled="disabled"
      :placeholder="options.length ? 'Select model' : 'Loading models...'"
      button-class="model-control"
      :popup-class="upward ? 'model-control-popup opens-upward' : 'model-control-popup'"
      auto-close
      title="Model"
    >
      <template #value="{ value: id }">
        <span v-if="defaultLabel && id === ''">{{ defaultLabel }}</span>
        <div v-else class="model-button-label">
          <span
            v-if="findModel(id)?.providerLabel || findModel(id)?.providerID"
            class="model-button-provider"
            >{{ findModel(id)?.providerLabel ?? findModel(id)?.providerID }}</span
          >
          <span class="model-button-name">{{ findModel(id)?.displayName }}</span>
        </div>
      </template>
      <div class="model-picker">
        <DropdownSearch v-model="query" placeholder="Search..." class="model-search" />
        <div class="model-picker-list">
          <DropdownItem v-if="defaultLabel" value="">{{ defaultLabel }}</DropdownItem>
          <div v-if="!groups.length" class="model-empty">
            {{ options.length ? 'No matching models' : 'No models available' }}
          </div>
          <template v-for="group in groups" :key="group.providerID">
            <DropdownLabel v-if="group.label">{{ group.label }}</DropdownLabel>
            <DropdownItem v-for="model in group.models" :key="model.id" :value="model.id">
              <div class="model-dropdown-item">
                <span class="model-dropdown-name">{{ model.displayName }}</span>
                <span class="model-dropdown-path">{{ model.providerID }}/{{ model.modelID }}</span>
              </div>
            </DropdownItem>
          </template>
        </div>
      </div>
    </Dropdown>
  </div>
</template>

<style scoped src="./model-controls.css"></style>
<style scoped>
.model-button-label {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  line-height: 1.15;
  text-align: left;
  align-self: flex-start;
}
.model-button-provider {
  position: fixed;
  font-size: 9px;
  color: #94a3b8;
  white-space: nowrap;
  text-overflow: ellipsis;
  transform: translate(-3px, -11px);
}
.model-button-name {
  font-size: 12px;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.model-picker {
  display: flex;
  flex-direction: column;
  max-height: calc(280px - 12px);
  overflow: hidden;
  margin: -6px;
  padding: 6px;
}
.model-picker-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
.model-search {
  flex: 0 0 auto;
  padding: 0 0 4px;
}
.model-search :deep(.ui-dropdown-search-input) {
  border-radius: 6px;
  font-size: 11px;
  font-family: inherit;
  padding: 4px 6px;
}
.model-dropdown-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-width: 0;
}
.model-dropdown-name {
  font-size: 12px;
  color: #e2e8f0;
  line-height: 1.2;
}
.model-dropdown-path {
  font-size: 10px;
  color: #94a3b8;
  line-height: 1.2;
}
.model-empty {
  padding: 6px 8px;
  font-size: 12px;
  color: #94a3b8;
}
</style>
