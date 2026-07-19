import { useMemo, useState } from "react";
import {
  addBookmark,
  normalizeBookmarkLaunchUrl,
  removeBookmark,
  type EnsBookmark,
} from "@/chrome/ensBrowsing/bookmarks";
import type { BrowserDappDirectoryResult } from "@/chrome/ensBrowsing/dappDirectorySearch";
import { MidnightDotPulseLoader } from "@/components/MidnightDotPulseLoader";
import { googleFaviconUrl } from "@/constants/externalUrls";
import Dapp3SiteIcon from "./Dapp3SiteIcon";
import { StarIcon } from "./Dapp3SiteCard";
import { bookmarkForDirectoryDapp } from "./dapp3BrowserModel";

interface DappDirectorySuggestionsProps {
  directUrl?: string;
  results: BrowserDappDirectoryResult[];
  bookmarks: EnsBookmark[];
  loading: boolean;
  failed: boolean;
  activeIndex: number;
  onSelectUrl: (url: string) => void;
}

interface SuggestionRowProps {
  index: number;
  name: string;
  hostname: string;
  logo?: string;
  source: string;
  active: boolean;
  favorited: boolean;
  favoriteDisabled: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
}

function SuggestionRow({
  index,
  name,
  hostname,
  logo,
  source,
  active,
  favorited,
  favoriteDisabled,
  onOpen,
  onToggleFavorite,
}: SuggestionRowProps) {
  return (
    <div
      id={`dapp-suggestion-${index}`}
      role="row"
      aria-selected={active}
      className={`search-suggestion${active ? " is-active" : ""}`}
    >
      <div role="gridcell" className="search-suggestion-main-cell">
        <button
          type="button"
          tabIndex={-1}
          className="search-suggestion-open"
          aria-label={`Open ${name} in a new tab`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onOpen}
        >
          <Dapp3SiteIcon src={logo} label={name} />
          <span className="search-suggestion-copy">
            <span className="search-suggestion-name">{name}</span>
            <span className="search-suggestion-host">{hostname}</span>
          </span>
          <span className="search-suggestion-source">{source}</span>
        </button>
      </div>
      <div role="gridcell" className="search-suggestion-action-cell">
        <button
          type="button"
          className={`search-suggestion-favorite${favorited ? " is-active" : ""}`}
          aria-label={
            favorited
              ? `Remove ${name} from favorites`
              : `Add ${name} to favorites`
          }
          title={favorited ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={favorited}
          disabled={favoriteDisabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleFavorite}
        >
          <StarIcon filled={favorited} />
        </button>
      </div>
    </div>
  );
}

export default function DappDirectorySuggestions({
  directUrl,
  results,
  bookmarks,
  loading,
  failed,
  activeIndex,
  onSelectUrl,
}: DappDirectorySuggestionsProps) {
  const [pendingFavorite, setPendingFavorite] = useState<string | null>(null);
  const [favoriteFailed, setFavoriteFailed] = useState(false);
  const favoriteOrigins = useMemo(
    () =>
      new Set(
        bookmarks
          .map((bookmark) => normalizeBookmarkLaunchUrl(bookmark.launchUrl))
          .filter((url): url is string => Boolean(url)),
      ),
    [bookmarks],
  );
  const directHost = directUrl ? new URL(directUrl).hostname : "";
  const hasRows = Boolean(directUrl) || results.length > 0;
  if (!hasRows && !loading && !failed) return null;

  const toggleFavorite = async (suggestion: {
    url: string;
    name: string;
    logo?: string;
  }) => {
    const bookmark = bookmarkForDirectoryDapp(suggestion);
    if (!bookmark) return;
    setPendingFavorite(bookmark.launchUrl ?? bookmark.ensName);
    setFavoriteFailed(false);
    try {
      if (favoriteOrigins.has(bookmark.launchUrl ?? "")) {
        await removeBookmark(bookmark.ensName, bookmark.path);
      } else {
        await addBookmark(bookmark);
      }
    } catch {
      setFavoriteFailed(true);
    } finally {
      setPendingFavorite(null);
    }
  };

  return (
    <div className="search-suggestions">
      <div
        id="dapp-directory-suggestions"
        role="grid"
        aria-label="Dapp and URL suggestions"
      >
        {directUrl && (
          <SuggestionRow
            index={0}
            name={directHost}
            hostname={directHost}
            logo={googleFaviconUrl(directHost, 64)}
            source="HTTPS"
            active={activeIndex === 0}
            favorited={favoriteOrigins.has(new URL(directUrl).origin)}
            favoriteDisabled={pendingFavorite !== null}
            onOpen={() => onSelectUrl(directUrl)}
            onToggleFavorite={() =>
              void toggleFavorite({
                url: directUrl,
                name: directHost,
                logo: googleFaviconUrl(directHost, 64),
              })
            }
          />
        )}

        {results.map((result, index) => {
          const itemIndex = index + (directUrl ? 1 : 0);
          return (
            <SuggestionRow
              key={result.url}
              index={itemIndex}
              name={result.name}
              hostname={result.hostname}
              logo={result.logo}
              source="DefiLlama"
              active={activeIndex === itemIndex}
              favorited={favoriteOrigins.has(new URL(result.url).origin)}
              favoriteDisabled={pendingFavorite !== null}
              onOpen={() => onSelectUrl(result.url)}
              onToggleFavorite={() => void toggleFavorite(result)}
            />
          );
        })}
      </div>

      {loading && (
        <span className="search-suggestion-status" role="status">
          <MidnightDotPulseLoader size="6px" color="var(--amber)" />
          Searching the dapp directory…
        </span>
      )}
      {failed && !loading && (
        <span
          className="search-suggestion-status search-suggestion-error"
          role="status"
        >
          Directory search is temporarily unavailable.
        </span>
      )}
      {favoriteFailed && (
        <span
          className="search-suggestion-status search-suggestion-error"
          role="status"
        >
          That favorite could not be saved.
        </span>
      )}
    </div>
  );
}
