import { useEffect, useMemo, useState } from "react";
import {
  getCachedAvatarDataUrlSync,
  getCachedAvatarDataUrl,
  requestAvatarImageFetch,
  subscribeAvatarCache,
} from "@/lib/avatarCacheClient";
import {
  isAllowedRemoteImageUrl,
  sanitizeTrustedRendererImageSrc,
} from "@/lib/remoteImagePolicy";

// A truthy inert source prevents callers that use `cached || rawUrl` from
// falling back to an untrusted network URL before sanitization completes.
export const INERT_IMAGE_SRC =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

/**
 * Returns an image src for the given avatar URL, substituting a cached data
 * URL when one is available (loads instantly on reopen, no network request).
 * Uses an inert pixel while the background worker fetches + rasterizes it.
 * Safe to call with null/undefined — returns the same value unchanged.
 *
 * Security: the cached data URL is guaranteed to be a raster image that the
 * background re-encoded via createImageBitmap + OffscreenCanvas, so SVG/
 * polyglot payloads from a malicious avatar host can't reach the DOM.
 */
export function useCachedAvatarSrc(
  url: string | null | undefined,
): string | null | undefined {
  const [resolved, setResolved] = useState<string | null | undefined>(() => {
    if (!url) return url;
    if (isAllowedRemoteImageUrl(url)) {
      return getCachedAvatarDataUrlSync(url) || INERT_IMAGE_SRC;
    }
    return sanitizeTrustedRendererImageSrc(url) || INERT_IMAGE_SRC;
  });

  useEffect(() => {
    if (!url) {
      setResolved(url);
      return;
    }
    // Only public HTTPS URLs can be fetched. Never let a metadata-controlled
    // image source issue a renderer request to localhost/private networks.
    if (!isHttpUrl(url)) {
      setResolved(sanitizeTrustedRendererImageSrc(url) || INERT_IMAGE_SRC);
      return;
    }
    if (!isAllowedRemoteImageUrl(url)) {
      setResolved(INERT_IMAGE_SRC);
      return;
    }

    let cancelled = false;
    const applyCached = () => {
      const cached = getCachedAvatarDataUrlSync(url);
      if (cached) setResolved(cached);
      return cached;
    };
    const unsubscribe = subscribeAvatarCache(() => {
      if (!cancelled) applyCached();
    });

    // Remote bytes are shown only after background decoding + rasterization.
    setResolved(applyCached() || INERT_IMAGE_SRC);

    (async () => {
      const cached = await getCachedAvatarDataUrl(url);
      if (cancelled) return;
      if (cached) {
        setResolved(cached);
        return;
      }
      const fetched = await requestAvatarImageFetch(url);
      if (cancelled) return;
      if (fetched) setResolved(fetched);
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [url]);

  return resolved;
}

/**
 * Batched variant: accepts a list of URLs, returns a Map<url, dataUrl-or-url>
 * populated with cached data URLs when available. An inert pixel is used until
 * the background worker fills the cache. Useful when avatars are rendered inside
 * a list/callback where you can't call a hook per item.
 */
export function useCachedAvatarMap(
  urls: Array<string | null | undefined>,
): Map<string, string> {
  const [resolved, setResolved] = useState<Map<string, string>>(new Map());

  const allUrls = useMemo(() => {
    const set = new Set<string>();
    for (const u of urls) {
      if (u) set.add(u);
    }
    return Array.from(set);
  }, [urls]);

  const uniqueUrls = useMemo(
    () => allUrls.filter(isAllowedRemoteImageUrl),
    [allUrls],
  );

  const urlsKey = allUrls.join("|");

  const buildSyncMap = () => {
    const next = new Map<string, string>();
    for (const u of allUrls) {
      next.set(
        u,
        sanitizeTrustedRendererImageSrc(u) || INERT_IMAGE_SRC,
      );
    }
    for (const u of uniqueUrls) {
      next.set(u, INERT_IMAGE_SRC);
      const cached = getCachedAvatarDataUrlSync(u);
      if (cached) next.set(u, cached);
    }
    return next;
  };

  useEffect(() => {
    if (uniqueUrls.length === 0) {
      setResolved(buildSyncMap());
      return;
    }
    let cancelled = false;
    const unsubscribe = subscribeAvatarCache(() => {
      if (!cancelled) setResolved(buildSyncMap());
    });

    setResolved(buildSyncMap());

    (async () => {
      const next = new Map<string, string>();
      const toFetch: string[] = [];

      for (const u of uniqueUrls) {
        const cached = await getCachedAvatarDataUrl(u);
        if (cached) next.set(u, cached);
        else toFetch.push(u);
      }
      if (!cancelled) {
        const sync = buildSyncMap();
        for (const [url, src] of next) sync.set(url, src);
        setResolved(sync);
      }

      for (const u of toFetch) {
        const fetched = await requestAvatarImageFetch(u);
        if (cancelled) return;
        if (fetched) {
          setResolved((prev) => {
            const copy = new Map(prev);
            copy.set(u, fetched);
            return copy;
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [urlsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(() => {
    const merged = buildSyncMap();
    for (const [url, src] of resolved) merged.set(url, src);
    return merged;
  }, [resolved, urlsKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
