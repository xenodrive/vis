import { ref } from 'vue';
import type { Connection } from '../utils/protocol/client';
import {
  StorageKeys,
  storageGet,
  storageKey,
  storageRemove,
  storageSet,
} from '../utils/storageKeys';

const connection = ref<Connection>();

function parseCredentials(raw: string | null): Connection | undefined {
  if (!raw) return;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return;
    if (!('url' in data) || typeof data.url !== 'string' || !data.url) return;
    if (!('token' in data) || typeof data.token !== 'string' || !data.token) return;
    return { url: data.url, token: data.token };
  } catch {
    return;
  }
}

export function useCredentials() {
  function save(value: Connection) {
    connection.value = { ...value };
    storageSet(StorageKeys.auth.credentials, JSON.stringify(connection.value));
  }

  function load() {
    connection.value = parseCredentials(storageGet(StorageKeys.auth.credentials));
  }

  function clear() {
    connection.value = undefined;
    storageRemove(StorageKeys.auth.credentials);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== storageKey(StorageKeys.auth.credentials)) return;
      connection.value = parseCredentials(event.newValue);
    });
  }

  return { connection, save, load, clear };
}
