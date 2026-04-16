/**
 * Pre-React theme bootstrap.
 *
 * Called from `index.tsx` and `onboarding.tsx` BEFORE `ReactDOM.render`. Its
 * job is to synchronously set `document.documentElement.dataset.theme` so the
 * very first paint matches the user's selection — no flash of the wrong theme.
 *
 * `chrome.storage.local` is async-only, so we can't read it synchronously.
 * We mirror the canonical preference in `window.localStorage` (which IS
 * synchronous) on every write, then read from there on bootstrap. The mirror
 * is opportunistic — if it's missing or out of sync, we fall back to default
 * and rely on the async hydration in `useThemeSelection` to catch up.
 */

import { DEFAULT_THEME_ID, loadSelectedThemeId } from "./useThemeSelection";
import type { ThemeId } from "./tokens";

export const LOCALSTORAGE_THEME_KEY = "selectedThemeId";

function readLocalStorageThemeId(): ThemeId {
  try {
    const cached = window.localStorage.getItem(LOCALSTORAGE_THEME_KEY);
    if (cached === "bauhaus" || cached === "midnight" || cached === "astra")
      return cached;
  } catch {
    // localStorage may be unavailable in some Chrome contexts; ignore.
  }
  return DEFAULT_THEME_ID;
}

/**
 * Apply the active theme ID to `<html data-theme=...>` synchronously, then
 * reconcile against `chrome.storage.local` asynchronously (in case the user
 * changed themes from a different popup window).
 */
export function bootstrapThemeAttribute(): void {
  if (typeof document === "undefined") return;

  // 1. Synchronous: read localStorage mirror, set the attribute.
  const initial = readLocalStorageThemeId();
  document.documentElement.dataset.theme = initial;

  // 2. Async: pull the canonical value from chrome.storage and update if it
  //    differs. This handles the (rare) case where localStorage and
  //    chrome.storage drifted apart.
  loadSelectedThemeId()
    .then((stored) => {
      if (stored !== initial) {
        document.documentElement.dataset.theme = stored;
        try {
          window.localStorage.setItem(LOCALSTORAGE_THEME_KEY, stored);
        } catch {
          // ignore
        }
      }
    })
    .catch(() => {
      // Storage failures shouldn't break the app.
    });
}
