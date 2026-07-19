import {
  addBookmark,
  isBookmarked,
  normalizeBookmarkPath,
  onBookmarksChanged,
  removeBookmark,
  type EnsBookmark,
} from "../bookmarks";
import {
  currentPagePath,
  scrapePageMetadata,
} from "./pageState";
import { buildBrowserFaviconUrl } from "@/lib/browserFavicon";
import type { BannerRefs, BannerTabContext } from "./types";

function applyStarState(refs: BannerRefs, favorited: boolean): void {
  const icon = refs.starBtn.querySelector("svg");
  refs.starBtn.classList.toggle("favorited", favorited);
  refs.starBtn.setAttribute("aria-pressed", favorited ? "true" : "false");
  refs.starBtn.setAttribute(
    "aria-label",
    favorited ? "Remove from favorites" : "Favorite this dapp",
  );
  refs.starBtn.title = favorited
    ? "Remove from favorites"
    : "Favorite this dapp";
  icon?.setAttribute("fill", favorited ? "currentColor" : "none");
}

function currentBookmarkPath(): string {
  return normalizeBookmarkPath(currentPagePath());
}

function buildBookmark(
  context: BannerTabContext,
  path: string,
): EnsBookmark {
  const metadata = scrapePageMetadata();
  return {
    ensName: context.ensName.toLowerCase(),
    path,
    kind: context.kind,
    contractAddress: context.contractAddress,
    title: metadata.title,
    favicon: buildBrowserFaviconUrl(location.href) || metadata.favicon,
    addedAt: Date.now(),
  };
}

export function wireBookmarkAction(
  refs: BannerRefs,
  context: BannerTabContext,
): () => void {
  const ensName = context.ensName.toLowerCase();
  const refresh = () => {
    isBookmarked(ensName, currentBookmarkPath())
      .then((favorited) => applyStarState(refs, favorited))
      .catch(() => applyStarState(refs, false));
  };
  refresh();
  onBookmarksChanged(refresh);
  refs.starBtn.addEventListener("click", async (event) => {
    event.stopPropagation();
    const path = currentBookmarkPath();
    const favorited = refs.starBtn.classList.contains("favorited");
    if (favorited) await removeBookmark(ensName, path);
    else await addBookmark(buildBookmark(context, path));
    refresh();
  });
  return refresh;
}
