import { ref, watch } from 'vue';
import { StorageKeys, storageGet, storageKey, storageSet } from '../utils/storageKeys';

const enterToSend = ref(storageGet(StorageKeys.settings.enterToSend) === 'true');

watch(enterToSend, (value) => {
  storageSet(StorageKeys.settings.enterToSend, String(value));
});

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey(StorageKeys.settings.enterToSend)) {
      enterToSend.value = event.newValue === 'true';
    }
  });
}

export function useSettings() {
  return { enterToSend };
}
