import { ref, watch } from 'vue';
import type { ModelRef } from '@opencode-ai/client';
import {
  StorageKeys,
  storageGet,
  storageGetJSON,
  storageKey,
  storageSet,
  storageSetJSON,
} from '../utils/storageKeys';

const enterToSend = ref(storageGet(StorageKeys.settings.enterToSend) === 'true');
const suppressAutoWindows = ref(storageGet(StorageKeys.settings.suppressAutoWindows) === 'true');
const commitModel = ref<ModelRef | null>(
  storageGetJSON<ModelRef>(StorageKeys.settings.commitModel),
);

watch(commitModel, (value) => {
  storageSetJSON(StorageKeys.settings.commitModel, value);
});

watch(enterToSend, (value) => {
  storageSet(StorageKeys.settings.enterToSend, String(value));
});

watch(suppressAutoWindows, (value) => {
  storageSet(StorageKeys.settings.suppressAutoWindows, String(value));
});

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey(StorageKeys.settings.enterToSend)) {
      enterToSend.value = event.newValue === 'true';
    }
    if (event.key === storageKey(StorageKeys.settings.suppressAutoWindows)) {
      suppressAutoWindows.value = event.newValue === 'true';
    }
    if (event.key === storageKey(StorageKeys.settings.commitModel)) {
      commitModel.value = storageGetJSON<ModelRef>(StorageKeys.settings.commitModel);
    }
  });
}

export function useSettings() {
  return { enterToSend, suppressAutoWindows, commitModel };
}
