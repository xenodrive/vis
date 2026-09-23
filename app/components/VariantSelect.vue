<script setup lang="ts">
import { computed } from 'vue';
import Dropdown from './Dropdown.vue';
import DropdownItem from './Dropdown/Item.vue';
const props = withDefaults(
  defineProps<{
    modelValue?: string;
    options: Array<string | undefined>;
    disabled?: boolean;
    upward?: boolean;
    autoFocus?: boolean;
  }>(),
  { autoFocus: true },
);
const emit = defineEmits<{
  'update:modelValue': [value: string | undefined];
  'update:open': [open: boolean];
}>();
const value = computed({
  get: () => (props.modelValue === undefined ? '__default' : props.modelValue),
  set: (key: string) => emit('update:modelValue', key === '__default' ? undefined : key),
});
function label(value: string | undefined) {
  return value === undefined ? '<default>' : value;
}
</script>
<template>
  <div class="model-control-root">
    <Dropdown
      v-model="value"
      :disabled="disabled"
      button-class="model-control"
      :popup-class="upward ? 'model-control-popup opens-upward' : 'model-control-popup'"
      auto-close
      :auto-focus="autoFocus"
      title="Variant"
      @update:open="emit('update:open', $event)"
    >
      <template #value="{ value: key }"
        ><span :style="key === '__default' ? undefined : { color: '#f59e0b' }">{{
          label(key === '__default' ? undefined : key)
        }}</span></template
      >
      <DropdownItem
        v-for="option in options"
        :key="option === undefined ? '__default' : option"
        :value="option === undefined ? '__default' : option"
        >{{ label(option) }}</DropdownItem
      >
    </Dropdown>
  </div>
</template>
<style scoped src="./model-controls.css"></style>
