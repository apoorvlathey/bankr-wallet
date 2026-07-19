import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import {
  bookmarkKey,
  normalizeBookmarkLaunchUrl,
  removeBookmark,
  reorderBookmarks,
  type EnsBookmark,
} from "@/chrome/ensBrowsing/bookmarks";
import type { CachedResolve } from "@/chrome/ensBrowsing/cache";
import SortableDapp3SiteCard from "./SortableDapp3SiteCard";
import { buildBrowserFaviconUrl } from "@/lib/browserFavicon";
import { useDappOriginFormatter } from "@/hooks/useDappOriginDisplay";
import {
  favoriteDappBrowserFaviconPageUrl,
  favoriteDappDisplayUrl,
  favoriteDappFaviconFallbackUrl,
  favoriteDappFaviconUrl,
} from "./dapp3BrowserModel";

type FavoriteDappsSectionProps = {
  bookmarks: EnsBookmark[];
  cachedSites: CachedResolve[];
  onOpenResolvedTarget: (target: string) => void;
  onOpenHttpsUrl: (url: string) => void;
};

function bookmarkTarget(bookmark: EnsBookmark): string {
  if (bookmark.path === "/") return bookmark.ensName;
  return `${bookmark.ensName}${bookmark.path}`;
}

export default function FavoriteDappsSection({
  bookmarks,
  cachedSites,
  onOpenResolvedTarget,
  onOpenHttpsUrl,
}: FavoriteDappsSectionProps) {
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [orderedBookmarks, setOrderedBookmarks] = useState(bookmarks);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const formatOrigin = useDappOriginFormatter();
  const bookmarkIds = useMemo(
    () => orderedBookmarks.map(bookmarkKey),
    [orderedBookmarks],
  );
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => setOrderedBookmarks(bookmarks), [bookmarks]);

  const saveOrder = (previous: EnsBookmark[], next: EnsBookmark[]) => {
    if (savingOrder) return;
    setOrderedBookmarks(next);
    setReorderError(null);
    setSavingOrder(true);
    void reorderBookmarks(next)
      .catch(() => {
        setOrderedBookmarks(previous);
        setReorderError("Couldn’t save favorite order. Try again.");
      })
      .finally(() => setSavingOrder(false));
  };

  const moveBookmark = (index: number, offset: -1 | 1) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= orderedBookmarks.length) return;
    saveOrder(
      orderedBookmarks,
      arrayMove(orderedBookmarks, index, nextIndex),
    );
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const previous = orderedBookmarks;
    const from = previous.findIndex(
      (bookmark) => bookmarkKey(bookmark) === active.id,
    );
    const to = previous.findIndex(
      (bookmark) => bookmarkKey(bookmark) === over.id,
    );
    if (from < 0 || to < 0) return;

    saveOrder(previous, arrayMove(previous, from, to));
  };

  if (bookmarks.length === 0) return null;

  return (
    <section
      className="cached-sites bookmarked-sites"
      aria-labelledby="bookmarked-sites-title"
    >
      <h2 id="bookmarked-sites-title">Favorite dapps</h2>
      {reorderError && (
        <p className="connected-sites-error" role="alert">
          {reorderError}
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={bookmarkIds} strategy={rectSortingStrategy}>
          <div className="site-grid">
            {orderedBookmarks.map((bookmark, index) => {
              const key = bookmarkKey(bookmark);
              const launchUrl = normalizeBookmarkLaunchUrl(bookmark.launchUrl);
              const target = bookmarkTarget(bookmark);
              const title = bookmark.title?.trim() || bookmark.ensName;
              const displayUrl = launchUrl
                ? formatOrigin(launchUrl).label
                : favoriteDappDisplayUrl(bookmark);
              const cachedFavicon = cachedSites.find(
                (site) => site.ensName === bookmark.ensName,
              )?.favicon;
              const iconBookmark = cachedFavicon
                ? { ...bookmark, favicon: cachedFavicon }
                : bookmark;
              const browserFaviconPageUrl =
                favoriteDappBrowserFaviconPageUrl(iconBookmark);
              return (
                <SortableDapp3SiteCard
                  key={key}
                  sortId={key}
                  isFirst={index === 0}
                  isLast={index === orderedBookmarks.length - 1}
                  reorderDisabled={savingOrder}
                  onMovePrevious={() => moveBookmark(index, -1)}
                  onMoveNext={() => moveBookmark(index, 1)}
                  iconSrc={favoriteDappFaviconUrl(iconBookmark)}
                  iconFallbackSrc={
                    (browserFaviconPageUrl &&
                      buildBrowserFaviconUrl(browserFaviconPageUrl)) ||
                    favoriteDappFaviconFallbackUrl(iconBookmark)
                  }
                  label={bookmark.ensName}
                  title={title}
                  subtitle={displayUrl}
                  onOpen={() =>
                    launchUrl
                      ? launchUrl.startsWith("https://")
                        ? onOpenHttpsUrl(launchUrl)
                        : location.assign(launchUrl)
                      : onOpenResolvedTarget(target)
                  }
                  removeAction={{
                    label: `Remove ${title} from favorites`,
                    destructive: true,
                    disabled: removingKey !== null,
                    onClick: () => {
                      setRemovingKey(key);
                      void removeBookmark(
                        bookmark.ensName,
                        bookmark.path,
                      ).finally(() => setRemovingKey(null));
                    },
                  }}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}
