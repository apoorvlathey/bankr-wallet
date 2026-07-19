// User-pinned dapp3 sites, keyed by underlying identity + path. This mirrors
// dapp3's bookmark model while using a WalletChan-specific storage key.

import type { ResolveKind } from "./types";

export type EnsBookmark = {
  ensName: string;
  path: string;
  /** Safe HTTP(S) origin for favorites created from connected dapps. */
  launchUrl?: string;
  kind?: ResolveKind;
  contractAddress?: `0x${string}`;
  title?: string;
  favicon?: string;
  addedAt: number;
  /** Zero-based user-defined position; unranked new entries sort first. */
  sortOrder?: number;
};

export const ENS_BOOKMARKS_KEY = "ensBookmarks";

type BookmarkMap = Record<string, EnsBookmark>;

export function normalizeBookmarkLaunchUrl(
  value: string | undefined | null,
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function normalizeName(name: string): string {
  const lower = name.toLowerCase().replace(/\.$/, "");
  const rawAddressLabel = lower.match(/^(0x[a-f0-9]{40})\.eth$/);
  if (rawAddressLabel?.[1]) return rawAddressLabel[1];
  return lower;
}

export function normalizeBookmarkPath(path: string | undefined | null): string {
  if (!path) return "/";
  if (!path.startsWith("/") && !path.startsWith("?") && !path.startsWith("#")) {
    return `/${path}`;
  }
  return path;
}

function makeKey(ensName: string, path: string): string {
  return `${normalizeName(ensName)}${normalizeBookmarkPath(path)}`;
}

export function bookmarkKey(
  bookmark: Pick<EnsBookmark, "ensName" | "path">,
): string {
  return makeKey(bookmark.ensName, bookmark.path);
}

export function sortBookmarks(bookmarks: readonly EnsBookmark[]): EnsBookmark[] {
  return [...bookmarks].sort((a, b) => {
    const aOrder = typeof a.sortOrder === "number" && Number.isSafeInteger(a.sortOrder)
      ? a.sortOrder : null;
    const bOrder = typeof b.sortOrder === "number" && Number.isSafeInteger(b.sortOrder)
      ? b.sortOrder : null;
    if (aOrder !== null && bOrder !== null) return aOrder - bOrder;
    if (aOrder !== null) return 1;
    if (bOrder !== null) return -1;
    return b.addedAt - a.addedAt;
  });
}

async function readMap(): Promise<BookmarkMap> {
  const raw = await chrome.storage.local.get(ENS_BOOKMARKS_KEY);
  return (raw[ENS_BOOKMARKS_KEY] as BookmarkMap | undefined) ?? {};
}

export async function getAllBookmarks(): Promise<EnsBookmark[]> {
  const map = await readMap();
  return sortBookmarks(Object.values(map));
}

export async function isBookmarked(
  ensName: string,
  path: string,
): Promise<boolean> {
  const map = await readMap();
  return makeKey(ensName, path) in map;
}

export async function addBookmark(entry: EnsBookmark): Promise<void> {
  const launchUrl = normalizeBookmarkLaunchUrl(entry.launchUrl);
  const normalized: EnsBookmark = {
    ...entry,
    ensName: normalizeName(entry.ensName),
    path: normalizeBookmarkPath(entry.path),
    ...(launchUrl ? { launchUrl } : {}),
  };
  if (!launchUrl) delete normalized.launchUrl;
  const map = await readMap();
  map[makeKey(normalized.ensName, normalized.path)] = normalized;
  await chrome.storage.local.set({ [ENS_BOOKMARKS_KEY]: map });
}

export async function removeBookmark(
  ensName: string,
  path: string,
): Promise<void> {
  const key = makeKey(ensName, path);
  const map = await readMap();
  if (!(key in map)) return;
  delete map[key];
  await chrome.storage.local.set({ [ENS_BOOKMARKS_KEY]: map });
}

export async function reorderBookmarks(
  orderedBookmarks: ReadonlyArray<Pick<EnsBookmark, "ensName" | "path">>,
): Promise<void> {
  const map = await readMap();
  const requestedKeys = orderedBookmarks
    .map(bookmarkKey)
    .filter((key, index, keys) => key in map && keys.indexOf(key) === index);
  const requestedSet = new Set(requestedKeys);
  const unlistedKeys = sortBookmarks(Object.values(map))
    .map(bookmarkKey)
    .filter((key) => !requestedSet.has(key));

  [...unlistedKeys, ...requestedKeys].forEach((key, sortOrder) => {
    map[key] = { ...map[key], sortOrder };
  });
  await chrome.storage.local.set({ [ENS_BOOKMARKS_KEY]: map });
}

export function onBookmarksChanged(cb: (bookmarks: EnsBookmark[]) => void) {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local" || !(ENS_BOOKMARKS_KEY in changes)) return;
    const map =
      (changes[ENS_BOOKMARKS_KEY]?.newValue as BookmarkMap | undefined) ?? {};
    cb(sortBookmarks(Object.values(map)));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
