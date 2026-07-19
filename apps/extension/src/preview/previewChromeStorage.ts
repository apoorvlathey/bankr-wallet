import { SELECTED_THEME_STORAGE_KEY } from "@/theme";
import type {
  PreviewEnvironment,
  PreviewStorageAreaName,
  PreviewStorageRecord,
} from "./previewEnvironment";

export type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: PreviewStorageAreaName,
) => void;

function normalizeStorageKeys(
  keys?: string | string[] | PreviewStorageRecord | null,
): string[] | null {
  if (!keys) return null;
  if (typeof keys === "string") return [keys];
  if (Array.isArray(keys)) return keys;
  return Object.keys(keys);
}

function getStorage(
  environment: PreviewEnvironment,
  area: PreviewStorageAreaName,
  keys?: string | string[] | PreviewStorageRecord | null,
) {
  const source = environment.storage[area];
  const normalized = normalizeStorageKeys(keys);
  if (!normalized) return { ...source };
  const result: PreviewStorageRecord = {};
  for (const key of normalized) {
    if (key in source) result[key] = source[key];
    else if (keys && typeof keys === "object" && !Array.isArray(keys)) {
      result[key] = keys[key];
    }
  }
  return result;
}

export function makeStorageArea(
  environment: PreviewEnvironment,
  listeners: Set<StorageListener>,
  area: PreviewStorageAreaName,
  schedule: (callback: () => void) => void,
  onThemeChange?: (theme: string) => void,
) {
  return {
    get: (
      keys?: string | string[] | PreviewStorageRecord | null,
      callback?: (items: PreviewStorageRecord) => void,
    ) => {
      const { scenario, route } = environment.parsed.state;
      const requestedKeys = normalizeStorageKeys(keys) ?? [];
      if (
        route === "swap-picker" && scenario === "loading" && area === "local" &&
        requestedKeys.some((key) =>
          key === "bungeeChains" || key.startsWith("bungeeTokens:"))
      ) return new Promise<PreviewStorageRecord>(() => {});
      const result = getStorage(environment, area, keys);
      if (callback) schedule(() => callback(result));
      return Promise.resolve(result);
    },
    set: (values: PreviewStorageRecord, callback?: () => void) => {
      const changes: Record<string, chrome.storage.StorageChange> = {};
      for (const [key, value] of Object.entries(values)) {
        const oldValue = environment.storage[area][key];
        environment.storage[area][key] = value;
        changes[key] = { oldValue, newValue: value };
        if (area === "local" && key === SELECTED_THEME_STORAGE_KEY &&
            typeof value === "string") onThemeChange?.(value);
      }
      for (const listener of listeners) listener(changes, area);
      if (callback) schedule(callback);
      return Promise.resolve();
    },
    remove: (keys: string | string[], callback?: () => void) => {
      const changes: Record<string, chrome.storage.StorageChange> = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        const oldValue = environment.storage[area][key];
        delete environment.storage[area][key];
        changes[key] = { oldValue, newValue: undefined };
      }
      for (const listener of listeners) listener(changes, area);
      if (callback) schedule(callback);
      return Promise.resolve();
    },
    clear: (callback?: () => void) => {
      const changes: Record<string, chrome.storage.StorageChange> = {};
      for (const key of Object.keys(environment.storage[area])) {
        changes[key] = { oldValue: environment.storage[area][key], newValue: undefined };
        delete environment.storage[area][key];
      }
      for (const listener of listeners) listener(changes, area);
      if (callback) schedule(callback);
      return Promise.resolve();
    },
  };
}
