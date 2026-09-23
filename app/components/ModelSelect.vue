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
const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: ModelOption[];
    disabled?: boolean;
    defaultLabel?: string;
    defaultModelId?: string;
    upward?: boolean;
    autoFocus?: boolean;
  }>(),
  { autoFocus: true },
);
const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:open': [open: boolean];
}>();
const root = ref<HTMLElement>();
const open = ref(false);
const query = ref('');
const modelLabels = computed(() => {
  const labels = new Map(
    props.options.map((model) => [
      model.id,
      {
        provider: model.providerLabel ?? model.providerID,
        name: model.displayName,
        path: [model.providerID, model.modelID].filter(Boolean).join('/'),
      },
    ]),
  );
  if (props.defaultLabel) {
    labels.set('', {
      provider: undefined,
      name: props.defaultLabel,
      path: props.defaultModelId ?? '',
    });
  }
  return labels;
});
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
      :auto-focus="autoFocus"
      title="Model"
    >
      <template #value="{ value: id }">
        <div class="model-button-label">
          <span class="model-button-provider">{{ modelLabels.get(id)?.provider }}</span>
          <span class="model-button-name">{{ modelLabels.get(id)?.name }}</span>
          <span class="model-button-path">{{ modelLabels.get(id)?.path }}</span>
        </div>
      </template>
      <div class="model-picker">
        <DropdownSearch
          v-model="query"
          placeholder="Search..."
          class="model-search"
          :auto-focus="autoFocus"
        />
        <div class="model-picker-list">
          <DropdownItem v-if="defaultLabel" value="">
            <div class="model-dropdown-item">
              <span class="model-dropdown-name">{{ defaultLabel }}</span>
              <span v-if="defaultModelId" class="model-dropdown-path">{{ defaultModelId }}</span>
            </div>
          </DropdownItem>
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
  display: grid;
  grid-template-rows: 9px 12px 9px;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-align: left;
  align-self: center;
}
.model-control-root :deep(.model-control) {
  height: 36px;
  padding-block: 2px;
}
.model-button-provider {
  font-size: 9px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1;
}
.model-button-name {
  font-size: 12px;
  color: #e2e8f0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1;
}
.model-button-path {
  font-size: 9px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1;
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
@media (max-width: 768px) {
  .model-picker {
    max-height: calc(60svh - 14px);
  }
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
