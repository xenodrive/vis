import { ref, watch } from 'vue';
import { StorageKeys, storageGetJSON, storageKey, storageSetJSON } from '../utils/storageKeys';

export type FavoriteMessageEntry = {
  text: string;
  agent?: string;
  agentColor?: string;
  model?: string | null;
  variant?: string | null;
};

const favorites = ref<FavoriteMessageEntry[]>(
  storageGetJSON<FavoriteMessageEntry[]>(StorageKeys.favorites.messages) ?? [],
);

watch(
  favorites,
  (value) => {
    storageSetJSON(StorageKeys.favorites.messages, value);
  },
  { deep: true },
);

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey(StorageKeys.favorites.messages)) return;
    favorites.value = storageGetJSON<FavoriteMessageEntry[]>(StorageKeys.favorites.messages) ?? [];
  });
}

function normalizeText(text: string) {
  return text.trim();
}

export function useFavoriteMessages() {
  function isFavorite(entry: {
    text: string;
    agent?: string;
    model?: string | null;
    variant?: string | null;
  }) {
    const normalized = normalizeText(entry.text);
    if (!normalized) return false;
    return favorites.value.some(
      (fav) =>
        normalizeText(fav.text) === normalized &&
        (fav.agent ?? '') === (entry.agent ?? '') &&
        fav.model === entry.model &&
        fav.variant === entry.variant,
    );
  }

  function addFavorite(entry: FavoriteMessageEntry) {
    const normalized = normalizeText(entry.text);
    if (!normalized) return;
    if (isFavorite({ ...entry, text: normalized })) return;
    favorites.value = [...favorites.value, { ...entry, text: normalized }];
  }

  function removeFavorite(index: number) {
    if (index < 0 || index >= favorites.value.length) return;
    favorites.value = favorites.value.filter((_, currentIndex) => currentIndex !== index);
  }

  return {
    favorites,
    isFavorite,
    addFavorite,
    removeFavorite,
  };
}
