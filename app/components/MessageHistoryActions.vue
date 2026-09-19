<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue';
import Dropdown from './Dropdown.vue';
import DropdownItem from './Dropdown/Item.vue';

type Action = 'Fork' | 'Revert' | 'Redo';
const props = defineProps<{ disabled?: boolean; reverted: boolean; content: string }>();
const emit = defineEmits<{ action: [action: Action] }>();
const action = ref<Action>('Fork');
const dialog = ref<HTMLDialogElement>();
const titleID = useId();
const description = computed(() => {
  if (action.value === 'Fork')
    return 'Create a new session with the conversation before this message?';
  if (action.value === 'Redo')
    return 'Restore the conversation and file changes from before the revert?';
  return 'Revert this message and everything after it, including the associated file changes? Sending a new message will make the revert permanent and disable Redo.';
});
async function confirm(value: Action) {
  if (props.disabled) return;
  action.value = value;
  await nextTick();
  dialog.value?.showModal();
}
function execute() {
  if (props.disabled) return;
  dialog.value?.close();
  emit('action', action.value);
}
</script>

<template>
  <div class="message-history-actions">
    <!-- @vue-generic {Action} -->
    <Dropdown
      :disabled="disabled"
      label="Message actions"
      menu-icon="lucide:ellipsis-vertical"
      :popup-style="{ left: 'auto', right: 'anchor(right)', minWidth: '120px' }"
      auto-close
      @select="confirm"
    >
      <template #label><span class="sr-only">Message actions</span></template>
      <DropdownItem v-if="reverted" value="Redo">Redo</DropdownItem>
      <template v-else>
        <DropdownItem value="Fork">Fork</DropdownItem>
        <DropdownItem value="Revert">Revert</DropdownItem>
      </template>
    </Dropdown>
    <Teleport to="body">
      <dialog ref="dialog" class="history-confirmation" :aria-labelledby="titleID">
        <h2 :id="titleID">{{ action }} message</h2>
        <p>{{ description }}</p>
        <pre v-if="content">{{ content.slice(0, 500) }}</pre>
        <footer>
          <button type="button" autofocus @click="dialog?.close()">Cancel</button>
          <button type="button" :disabled="disabled" @click="execute">{{ action }}</button>
        </footer>
      </dialog>
    </Teleport>
  </div>
</template>

<style scoped>
.message-history-actions {
  float: right;
  margin-left: 8px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.history-confirmation {
  width: min(440px, calc(100vw - 48px));
  max-height: calc(100dvh - 48px);
  box-sizing: border-box;
  overflow: auto;
  padding: 20px;
  border: 1px solid #475569;
  border-radius: 12px;
  background: #0f172a;
  color: #e2e8f0;
}
.history-confirmation::backdrop {
  background: #0009;
}
h2 {
  margin: 0 0 12px;
  font-size: 18px;
}
p {
  font-size: 14px;
  line-height: 1.6;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 180px;
  overflow: auto;
  padding: 12px;
  background: #020617;
  border-radius: 6px;
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}
button {
  padding: 6px 14px;
  border: 1px solid #475569;
  border-radius: 6px;
  background: #1e293b;
  color: inherit;
  cursor: pointer;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
