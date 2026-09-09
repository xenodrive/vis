import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { createDraftStore, type ComposerDraft } from '../v2/drafts';
import { StorageKeys, storageKey } from '../utils/storageKeys';
import { randomUUID } from '../utils/uuid';

export function useComposerDraft(
  sessionID: Ref<string | undefined>,
  report: (error: unknown) => void,
) {
  const key = storageKey(StorageKeys.drafts.composer);
  const writer = randomUUID();
  const draft = ref<ComposerDraft>({ messageInput: '' });
  function store() {
    return createDraftStore(window.localStorage, key, writer);
  }
  function restore() {
    draft.value = { messageInput: '' };
    if (!sessionID.value) return;
    try {
      draft.value = store().get(sessionID.value) ?? { messageInput: '' };
    } catch (cause) {
      report(cause);
    }
  }
  function save() {
    if (!sessionID.value) return;
    try {
      draft.value = store().write(sessionID.value, {
        messageInput: draft.value.messageInput,
      });
    } catch (cause) {
      report(cause);
    }
  }
  const messageInput = computed({
    get: () => draft.value.messageInput,
    set: (value: string) => {
      draft.value = { ...draft.value, messageInput: value };
      save();
    },
  });
  function snapshot() {
    return { ...draft.value };
  }
  function clearSent(id: string, sent: ComposerDraft) {
    try {
      if (store().clearSent(id, sent) && sessionID.value === id) restore();
    } catch (cause) {
      report(cause);
    }
  }
  function storageChanged(event: StorageEvent) {
    if (event.storageArea === window.localStorage && (event.key === key || event.key === null))
      restore();
  }
  watch(sessionID, restore, { immediate: true, flush: 'sync' });
  window.addEventListener('storage', storageChanged);
  onBeforeUnmount(() => window.removeEventListener('storage', storageChanged));
  return { messageInput, snapshot, clearSent };
}
