import { isAllowedAvatarUrl } from "./policy";
import { rasterizeAvatarBlob } from "./rasterizer";
import {
  commitAvatarDataUrl,
  readCachedAvatarDataUrl,
} from "./repository";
import {
  getAvatarImageCacheEpoch,
  isAvatarImageCacheEpochCurrent,
  scheduleAvatarImageFetch,
} from "./scheduler";
import { fetchAvatarRasterBlob } from "./transport";

export async function getCachedAvatarImage(url: string): Promise<string | null> {
  if (!url || !isAllowedAvatarUrl(url)) return null;
  try {
    return await readCachedAvatarDataUrl(url);
  } catch {
    return null;
  }
}

async function fetchRasterizeAndCommit(
  url: string,
  expectedEpoch: number,
): Promise<string | null> {
  if (!isAvatarImageCacheEpochCurrent(expectedEpoch)) return null;
  const blob = await fetchAvatarRasterBlob(url);
  if (!blob || !isAvatarImageCacheEpochCurrent(expectedEpoch)) return null;
  const dataUrl = await rasterizeAvatarBlob(blob);
  if (!dataUrl || !isAvatarImageCacheEpochCurrent(expectedEpoch)) return null;

  const committed = await commitAvatarDataUrl(url, dataUrl, () =>
    isAvatarImageCacheEpochCurrent(expectedEpoch),
  );
  return committed && isAvatarImageCacheEpochCurrent(expectedEpoch)
    ? dataUrl
    : null;
}

/** Cache hit or bounded fetch/decode/cache; every failure resolves to `null`. */
export async function fetchAndCacheAvatarImage(
  url: string,
): Promise<string | null> {
  if (!url || !isAllowedAvatarUrl(url)) return null;
  try {
    const expectedEpoch = getAvatarImageCacheEpoch();
    const cached = await getCachedAvatarImage(url);
    if (!isAvatarImageCacheEpochCurrent(expectedEpoch)) return null;
    if (cached) return cached;

    return await scheduleAvatarImageFetch(url, expectedEpoch, () =>
      fetchRasterizeAndCommit(url, expectedEpoch),
    );
  } catch {
    return null;
  }
}
