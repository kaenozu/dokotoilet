import { describe, expect, it, beforeEach } from 'vitest';
import {
  FAVORITES_STORAGE_KEY,
  loadFavoritesFromStorage,
  saveFavoritesToStorage,
  toggleFavoriteId,
} from './useFavorites';

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
}

describe('favorites persistence & logic', () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  it('loads empty list when storage is empty', () => {
    expect(loadFavoritesFromStorage(mockStorage)).toEqual([]);
  });

  it('loads saved favorites correctly', () => {
    mockStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(['shibuya-1', 'shinjuku-2']));
    expect(loadFavoritesFromStorage(mockStorage)).toEqual(['shibuya-1', 'shinjuku-2']);
  });

  it('handles corrupted JSON safely', () => {
    mockStorage.setItem(FAVORITES_STORAGE_KEY, 'invalid-json{{{');
    expect(loadFavoritesFromStorage(mockStorage)).toEqual([]);
  });

  it('saves favorites array to storage', () => {
    saveFavoritesToStorage(['fav-a', 'fav-b'], mockStorage);
    expect(JSON.parse(mockStorage.getItem(FAVORITES_STORAGE_KEY)!)).toEqual(['fav-a', 'fav-b']);
  });

  it('toggles a favorite ID on and off', () => {
    const initial: string[] = ['fav-1'];
    // Add new favorite
    const { next: addedNext, added: wasAdded } = toggleFavoriteId(initial, 'fav-2');
    expect(wasAdded).toBe(true);
    expect(addedNext).toEqual(['fav-1', 'fav-2']);

    // Remove existing favorite
    const { next: removedNext, added: wasRemoved } = toggleFavoriteId(addedNext, 'fav-1');
    expect(wasRemoved).toBe(false);
    expect(removedNext).toEqual(['fav-2']);
  });
});
