import { useState, useEffect, useCallback } from "react";

export const FAVORITES_STORAGE_KEY = "kirei_toilet_favorites_v1";

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    return window.localStorage;
  }
  return null;
}

export function loadFavoritesFromStorage(storage?: Storage | null): string[] {
  const store = storage !== undefined ? storage : getStorage();
  if (!store) return [];
  try {
    const raw = store.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function saveFavoritesToStorage(ids: string[], storage?: Storage | null): void {
  const store = storage !== undefined ? storage : getStorage();
  if (!store) return;
  try {
    store.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
  } catch (e) {
    console.warn("Failed to persist favorites:", e);
  }
}

export function toggleFavoriteId(ids: string[], id: string): { next: string[]; added: boolean } {
  if (ids.includes(id)) {
    return { next: ids.filter((item) => item !== id), added: false };
  }
  return { next: [...ids, id], added: true };
}

export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() =>
    loadFavoritesFromStorage()
  );

  const saveIds = useCallback((ids: string[]) => {
    setFavoriteIds(ids);
    saveFavoritesToStorage(ids);
    try {
      window.dispatchEvent(new CustomEvent("kirei-favorites-changed", { detail: ids }));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const handleCustom = (e: any) => {
      if (Array.isArray(e.detail)) {
        setFavoriteIds(e.detail);
      }
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === FAVORITES_STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setFavoriteIds(parsed);
        } catch {}
      }
    };
    window.addEventListener("kirei-favorites-changed", handleCustom);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("kirei-favorites-changed", handleCustom);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const isFavorite = useCallback(
    (id: string) => favoriteIds.includes(id),
    [favoriteIds]
  );

  const toggleFavorite = useCallback(
    (id: string): boolean => {
      const { next, added } = toggleFavoriteId(favoriteIds, id);
      saveIds(next);
      return added;
    },
    [favoriteIds, saveIds]
  );

  return {
    favoriteIds,
    favoritesCount: favoriteIds.length,
    isFavorite,
    toggleFavorite,
  };
}
