/**
 * useThemeSelection — read and write the user's selected theme.
 *
 * Storage location: `chrome.storage.local.selectedThemeId`
 *   - Default: `"bauhaus"` (legacy users get the existing visuals on first load)
 *   - Updated synchronously across popup instances via the `chrome.storage.onChanged` listener
 *
 * The hook is intentionally minimal: it only deals with the persisted preference
 * and doesn't know about the actual theme objects. The `ThemeProvider` is what
 * resolves an ID into a Chakra theme.
 */

import { useEffect, useState, useCallback } from "react";
import type { ThemeId } from "./tokens";

export const SELECTED_THEME_STORAGE_KEY = "selectedThemeId";
export const DEFAULT_THEME_ID: ThemeId = "bauhaus";

/**
 * Synchronously read the cached theme ID from `document.documentElement.dataset.theme`.
 * The bootstrap in `index.tsx` writes this attribute before React mounts so the
 * first render avoids a flash. Falls back to the default if the attribute is
 * missing or invalid.
 */
export function readBootstrapThemeId(): ThemeId {
  if (typeof document === "undefined") return DEFAULT_THEME_ID;
  const attr = document.documentElement.dataset.theme;
  if (attr === "bauhaus" || attr === "midnight") return attr;
  return DEFAULT_THEME_ID;
}

/**
 * Async read of the persisted theme ID from chrome.storage.local.
 */
export async function loadSelectedThemeId(): Promise<ThemeId> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return DEFAULT_THEME_ID;
  }
  return new Promise((resolve) => {
    chrome.storage.local.get(SELECTED_THEME_STORAGE_KEY, (result) => {
      const value = result?.[SELECTED_THEME_STORAGE_KEY];
      if (value === "bauhaus" || value === "midnight") {
        resolve(value);
      } else {
        resolve(DEFAULT_THEME_ID);
      }
    });
  });
}

/**
 * Persist the user's chosen theme. Writes to:
 *   1. `document.documentElement.dataset.theme` — immediate effect for any
 *      CSS variables hooked off `[data-theme=...]`
 *   2. `window.localStorage` — synchronous mirror for the next pre-React boot
 *   3. `chrome.storage.local` — canonical store, syncs across popup instances
 */
export async function saveSelectedThemeId(id: ThemeId): Promise<void> {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = id;
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SELECTED_THEME_STORAGE_KEY, id);
    } catch {
      // localStorage may be unavailable in some contexts; safe to ignore.
    }
  }
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SELECTED_THEME_STORAGE_KEY]: id }, () => resolve());
  });
}

/**
 * React hook for reading + updating the selected theme.
 *
 * - First render returns the bootstrap value (no flash).
 * - Hydrates from storage on mount in case the bootstrap missed something.
 * - Listens to `chrome.storage.onChanged` so multiple popup/sidepanel instances
 *   stay in sync if the user changes themes from one window.
 */
export function useThemeSelection(): {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => Promise<void>;
} {
  const [themeId, setThemeIdState] = useState<ThemeId>(() => readBootstrapThemeId());

  useEffect(() => {
    let cancelled = false;
    loadSelectedThemeId().then((stored) => {
      if (!cancelled && stored !== themeId) {
        setThemeIdState(stored);
      }
    });
    return () => {
      cancelled = true;
    };
    // Run once on mount only — we don't want to re-fetch every time themeId changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return;
    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName !== "local") return;
      const change = changes[SELECTED_THEME_STORAGE_KEY];
      if (!change) return;
      const next = change.newValue;
      if (next === "bauhaus" || next === "midnight") {
        setThemeIdState(next);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const setThemeId = useCallback(async (id: ThemeId) => {
    setThemeIdState(id);
    await saveSelectedThemeId(id);
  }, []);

  return { themeId, setThemeId };
}
