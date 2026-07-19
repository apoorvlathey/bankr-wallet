import { useMemo, useState } from "react";
import {
  addBookmark,
  removeBookmark,
  type EnsBookmark,
} from "@/chrome/ensBrowsing/bookmarks";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { useDappOriginFormatter } from "@/hooks/useDappOriginDisplay";
import Dapp3SiteCard from "./Dapp3SiteCard";
import {
  bookmarkForConnectedDapp,
  connectedFavoriteOrigins,
  filterConnectedDapps,
} from "./dapp3BrowserModel";
import { useConnectedDapps } from "./useConnectedDapps";
import { usePersistentScrollbar } from "./usePersistentScrollbar";

function lastUsedLabel(timestamp: number): string {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (elapsed < minute) return "Used just now";
  if (elapsed < hour) return `Used ${Math.floor(elapsed / minute)}m ago`;
  if (elapsed < day) return `Used ${Math.floor(elapsed / hour)}h ago`;
  if (elapsed < 7 * day) return `Used ${Math.floor(elapsed / day)}d ago`;
  return `Used ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year:
      new Date(timestamp).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  }).format(new Date(timestamp))}`;
}

interface ConnectedDappsSectionProps {
  bookmarks: EnsBookmark[];
  query: string;
  onOpenHttpsUrl: (url: string) => void;
}

interface RevokeConnectedDappResponse {
  ok?: boolean;
  revoked?: boolean;
}

export default function ConnectedDappsSection({
  bookmarks,
  query,
  onOpenHttpsUrl,
}: ConnectedDappsSectionProps) {
  const dapps = useConnectedDapps();
  const formatOrigin = useDappOriginFormatter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const filteredDapps = useMemo(
    () =>
      filterConnectedDapps(
        dapps,
        query,
        (dapp) => formatOrigin(dapp.origin).label,
      ),
    [dapps, formatOrigin, query],
  );
  const favoriteOrigins = useMemo(
    () => connectedFavoriteOrigins(bookmarks),
    [bookmarks],
  );
  const scrollbar = usePersistentScrollbar(filteredDapps.length);
  if (dapps.length === 0) return null;

  const runAction = async (key: string, action: () => Promise<unknown>) => {
    setPendingAction(key);
    setActionError(null);
    try {
      await action();
    } catch {
      setActionError("That change could not be saved. Please try again.");
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <section
      className="cached-sites connected-sites"
      aria-labelledby="connected-sites-title"
    >
      <h2 id="connected-sites-title">Connected dapps</h2>
      {actionError && (
        <p className="connected-sites-error" role="alert">
          {actionError}
        </p>
      )}
      {filteredDapps.length === 0 ? (
        <p className="connected-sites-empty" role="status">
          No connected dapps match “{query.trim()}”.
        </p>
      ) : (
        <div className="connected-sites-scroll">
          <div
            ref={scrollbar.scrollRef}
            className="site-grid connected-sites-grid"
            onScroll={scrollbar.onScroll}
          >
          {filteredDapps.map((dapp) => {
            const favorited = favoriteOrigins.has(dapp.origin);
            const title = dapp.title || dapp.hostname;
            const displayOrigin = formatOrigin(dapp.origin);
            return (
              <Dapp3SiteCard
                key={dapp.origin}
                iconSrc={
                  displayOrigin.faviconSrc ||
                  dapp.favicon ||
                  googleFaviconUrl(dapp.hostname, 64)
                }
                iconFallbackSrc={
                  displayOrigin.faviconFallbackSrc ||
                  googleFaviconUrl(dapp.hostname, 64)
                }
                label={displayOrigin.label}
                title={displayOrigin.label}
                subtitle={lastUsedLabel(dapp.lastConnectedAt)}
                onOpen={() =>
                  dapp.origin.startsWith("https://")
                    ? onOpenHttpsUrl(dapp.origin)
                    : location.assign(dapp.origin)
                }
                favoriteAction={{
                  label: favorited
                    ? `Remove ${title} from favorites`
                    : `Add ${title} to favorites`,
                  pressed: favorited,
                  disabled: pendingAction !== null,
                  onClick: () =>
                    void runAction(`favorite:${dapp.origin}`, () =>
                      favorited
                        ? removeBookmark(dapp.hostname, "/")
                        : addBookmark({
                            ...bookmarkForConnectedDapp(dapp),
                            favicon:
                              dapp.favicon ||
                              googleFaviconUrl(dapp.hostname, 64),
                          }),
                    ),
                }}
                removeAction={{
                  label: `Disconnect ${title}`,
                  destructive: true,
                  disabled: pendingAction !== null,
                  onClick: () =>
                    void runAction(`remove:${dapp.origin}`, async () => {
                      const response = (await chrome.runtime.sendMessage({
                        type: "ens-revoke-connected-dapp",
                        origin: dapp.origin,
                      })) as RevokeConnectedDappResponse;
                      if (!response?.ok) {
                        throw new Error("Failed to disconnect dapp");
                      }
                    }),
                }}
              />
            );
          })}
          </div>
          {scrollbar.metrics.visible && (
            <span className="connected-sites-scrollbar" aria-hidden="true">
              <span
                className="connected-sites-scrollbar-thumb"
                style={{
                  height: scrollbar.metrics.thumbHeight,
                  transform: `translateY(${scrollbar.metrics.thumbOffset}px)`,
                }}
              />
            </span>
          )}
        </div>
      )}
    </section>
  );
}
