import { useEffect, useMemo, useState } from "react";
import {
  getCachedAvatarDataUrl,
  requestAvatarImageFetch,
} from "@/lib/avatarCacheClient";

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

/**
 * Returns an image src for the given avatar URL, substituting a cached data
 * URL when one is available (loads instantly on reopen, no network request).
 * Falls back to the original URL while the background worker fetches + caches
 * it. Safe to call with null/undefined — returns the same value unchanged.
 *
 * Security: the cached data URL is guaranteed to be a raster image that the
 * background re-encoded via createImageBitmap + OffscreenCanvas, so SVG/
 * polyglot payloads from a malicious avatar host can't reach the DOM.
 */
export function useCachedAvatarSrc(
  url: string | null | undefined,
): string | null | undefined {
  const [resolved, setResolved] = useState<string | null | undefined>(url);

  useEffect(() => {
    if (!url) {
      setResolved(url);
      return;
    }
    // Only http(s) URLs can be cached — leave others untouched.
    if (!isHttpUrl(url)) {
      setResolved(url);
      return;
    }

    let cancelled = false;
    // Start with the raw URL so <img> has something to render immediately.
    setResolved(url);

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
    };
  }, [url]);

  return resolved;
}

/**
 * Batched variant: accepts a list of URLs, returns a Map<url, dataUrl-or-url>
 * populated with cached data URLs when available. Raw URLs are used until the
 * background worker fills the cache. Useful when avatars are rendered inside
 * a list/callback where you can't call a hook per item.
 */
export function useCachedAvatarMap(
  urls: Array<string | null | undefined>,
): Map<string, string> {
  const [resolved, setResolved] = useState<Map<string, string>>(new Map());

  const uniqueUrls = useMemo(() => {
    const set = new Set<string>();
    for (const u of urls) {
      if (u && isHttpUrl(u)) set.add(u);
    }
    return Array.from(set);
  }, [urls]);

  const urlsKey = uniqueUrls.join("|");

  useEffect(() => {
    if (uniqueUrls.length === 0) {
      setResolved(new Map());
      return;
    }
    let cancelled = false;

    (async () => {
      const next = new Map<string, string>();
      const toFetch: string[] = [];

      for (const u of uniqueUrls) {
        const cached = await getCachedAvatarDataUrl(u);
        if (cached) next.set(u, cached);
        else toFetch.push(u);
      }
      if (!cancelled) setResolved(new Map(next));

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
    };
  }, [urlsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return resolved;
}
