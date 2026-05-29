// User-pinned dapp3 sites, keyed by underlying identity + path. This mirrors
// dapp3's bookmark model while using a WalletChan-specific storage key.

import type { ResolveKind } from "./types";

export type EnsBookmark = {
  ensName: string;
  path: string;
  kind?: ResolveKind;
  contractAddress?: `0x${string}`;
  title?: string;
  favicon?: string;
  addedAt: number;
};

export const ENS_BOOKMARKS_KEY = "ensBookmarks";

type BookmarkMap = Record<string, EnsBookmark>;

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

async function readMap(): Promise<BookmarkMap> {
  const raw = await chrome.storage.local.get(ENS_BOOKMARKS_KEY);
  return (raw[ENS_BOOKMARKS_KEY] as BookmarkMap | undefined) ?? {};
}

export async function getAllBookmarks(): Promise<EnsBookmark[]> {
  const map = await readMap();
  return Object.values(map).sort((a, b) => b.addedAt - a.addedAt);
}

export async function isBookmarked(
  ensName: string,
  path: string,
): Promise<boolean> {
  const map = await readMap();
  return makeKey(ensName, path) in map;
}

export async function addBookmark(entry: EnsBookmark): Promise<void> {
  const normalized: EnsBookmark = {
    ...entry,
    ensName: normalizeName(entry.ensName),
    path: normalizeBookmarkPath(entry.path),
  };
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

export function onBookmarksChanged(cb: (bookmarks: EnsBookmark[]) => void) {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => {
    if (areaName !== "local" || !(ENS_BOOKMARKS_KEY in changes)) return;
    const map =
      (changes[ENS_BOOKMARKS_KEY]?.newValue as BookmarkMap | undefined) ?? {};
    cb(Object.values(map).sort((a, b) => b.addedAt - a.addedAt));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
