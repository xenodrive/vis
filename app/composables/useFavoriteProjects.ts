import { ref } from 'vue';
import { StorageKeys, storageGetJSON, storageSetJSON } from '../utils/storageKeys';

const favorites = ref<string[]>(storageGetJSON<string[]>(StorageKeys.favorites.projects) ?? []);

export function useFavoriteProjects() {
  function isFavorite(projectID: string) {
    return favorites.value.includes(projectID);
  }

  function toggleFavorite(projectID: string) {
    favorites.value = isFavorite(projectID)
      ? favorites.value.filter((id) => id !== projectID)
      : [...favorites.value, projectID];
    storageSetJSON(StorageKeys.favorites.projects, favorites.value);
  }

  return { isFavorite, toggleFavorite };
}
