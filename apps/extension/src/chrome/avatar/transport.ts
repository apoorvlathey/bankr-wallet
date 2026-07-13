import {
  AVATAR_FETCH_TIMEOUT_MS,
  AVATAR_MAX_DOWNLOAD_BYTES,
  AVATAR_MAX_REDIRECTS,
} from "./constants";
import { readAvatarBlobBounded } from "./bodyReader";
import {
  isAllowedAvatarUrl,
  normalizeAvatarRasterContentType,
} from "./policy";
import { trackAvatarImageFetchController } from "./scheduler";

/** Fetch a public raster through a manually revalidated redirect chain. */
export async function fetchAvatarRasterBlob(url: string): Promise<Blob | null> {
  if (!isAllowedAvatarUrl(url)) return null;

  const controller = new AbortController();
  const untrack = trackAvatarImageFetchController(controller);
  const timer = setTimeout(() => controller.abort(), AVATAR_FETCH_TIMEOUT_MS);
  try {
    let currentUrl = url;
    let response: Response | null = null;
    for (
      let redirectCount = 0;
      redirectCount <= AVATAR_MAX_REDIRECTS;
      redirectCount += 1
    ) {
      if (!isAllowedAvatarUrl(currentUrl)) return null;
      response = await fetch(currentUrl, {
        signal: controller.signal,
        credentials: "omit",
        referrerPolicy: "no-referrer",
        redirect: "manual",
      });
      if (response.status < 300 || response.status >= 400) break;
      if (redirectCount === AVATAR_MAX_REDIRECTS) return null;
      const location = response.headers.get("location");
      if (!location) return null;
      currentUrl = new URL(location, currentUrl).toString();
    }

    if (!response?.ok) return null;
    const contentType = normalizeAvatarRasterContentType(
      response.headers.get("content-type"),
    );
    if (!contentType) return null;

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > AVATAR_MAX_DOWNLOAD_BYTES) return null;
    return await readAvatarBlobBounded(
      response,
      AVATAR_MAX_DOWNLOAD_BYTES,
      contentType,
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    untrack();
  }
}
