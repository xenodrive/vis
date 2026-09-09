<script setup lang="ts">
import { computed } from 'vue';
import type { ModelInfo } from '@opencode-ai/client';
import { useSettings } from '../composables/useSettings';
import ModelSelect from './ModelSelect.vue';
import VariantSelect from './VariantSelect.vue';

const props = defineProps<{ models: ModelInfo[]; disabled?: boolean }>();
const { commitModel } = useSettings();
const options = computed(() =>
  props.models
    .map((model) => ({
      id: JSON.stringify([model.providerID, model.id]),
      modelID: model.id,
      label: model.name,
      displayName: model.name,
      providerID: model.providerID,
    }))
    .toSorted(
      (a, b) =>
        a.providerID.localeCompare(b.providerID) || a.displayName.localeCompare(b.displayName),
    ),
);
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
  selectedModel.value
    ? [
        undefined,
        ...selectedModel.value.variants
          .filter((entry) => entry.id !== 'default')
          .map((entry) => entry.id),
      ]
    : [undefined],
);
const variant = computed({
  get: () => commitModel.value?.variant,
  set: (value: string | undefined) => {
    if (!commitModel.value) return;
    commitModel.value = {
      providerID: commitModel.value.providerID,
      id: commitModel.value.id,
      ...(value === undefined ? {} : { variant: value }),
    };
  },
});
</script>
<template>
  <div class="commit-model-picker">
    <ModelSelect
      v-model="modelKey"
      :options="options"
      :disabled="disabled"
      default-label="Default (OpenCode)"
    />
    <VariantSelect v-model="variant" :options="variants" :disabled="disabled || !selectedModel" />
  </div>
</template>
<style scoped>
.commit-model-picker {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex-wrap: wrap;
  padding-top: 8px;
}
.commit-model-picker > :first-child {
  flex: 1 1 160px;
}
</style>
