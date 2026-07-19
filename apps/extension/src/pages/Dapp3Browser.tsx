import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ENS_RESOLVE_CACHE_KEY,
  listCached,
  type CachedResolve,
} from "@/chrome/ensBrowsing/cache";
import {
  addBookmark,
  ENS_BOOKMARKS_KEY,
  getAllBookmarks,
  type EnsBookmark,
} from "@/chrome/ensBrowsing/bookmarks";
import BookmarkPageReminder from "@/components/Dapp3Browser/BookmarkPageReminder";
import ConnectedDappsSection from "@/components/Dapp3Browser/ConnectedDappsSection";
import DappDirectorySuggestions from "@/components/Dapp3Browser/DappDirectorySuggestions";
import FavoriteDappsSection from "@/components/Dapp3Browser/FavoriteDappsSection";
import Dapp3SiteCard, { CloseIcon } from "@/components/Dapp3Browser/Dapp3SiteCard";
import {
  bookmarkForCachedDapp,
  navigationUrlForTarget,
  parseDapp3Target,
} from "@/components/Dapp3Browser/dapp3BrowserModel";
import { useDappDirectorySearch } from "@/components/Dapp3Browser/useDappDirectorySearch";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { buildBrowserFaviconUrl } from "@/lib/browserFavicon";
import "./Dapp3Browser.css";

const EXAMPLES = [
  { label: "vitalik.eth", value: "vitalik.eth" },
  { label: "apoorv.gwei", value: "apoorv.gwei" },
  { label: "zrouter.eth", value: "zrouter.eth" },
  {
    label: "OFTScan (0x…9e32)",
    value: "0x000000f7f90708c034c854efd1d5bfe8e9079e32",
  },
];

function buildInterstitialUrl(targetUrl: string): string {
  return `${chrome.runtime.getURL("interstitial.html")}#${targetUrl}`;
}

function formatKind(kind: CachedResolve["kind"]): string {
  if (kind === "web3") return "HTML";
  return kind.toUpperCase();
}

function cachedFaviconUrl(site: CachedResolve): string {
  if (site.kind === "web3" || /^0x[a-f0-9]{40}$/.test(site.ensName)) {
    const label = site.ensName.endsWith(".eth")
      ? site.ensName.slice(0, -4)
      : site.ensName;
    return `https://${label}.w3eth.io/favicon.ico`;
  }
  if (site.ensName.endsWith(".gwei")) {
    return `https://${site.ensName}.domains/favicon.ico`;
  }
  return `https://${site.ensName}.limo/favicon.ico`;
}

function cachedFaviconFallbackUrl(site: CachedResolve): string {
  const gatewayUrl = cachedFaviconUrl(site).replace(/\/favicon\.ico$/, "/");
  return (
    buildBrowserFaviconUrl(gatewayUrl) ||
    googleFaviconUrl(new URL(gatewayUrl).hostname, 64)
  );
}

export default function Dapp3Browser() {
  const inputRef = useRef<HTMLInputElement>(null);
  const clearInvalidRef = useRef<number | null>(null);
  const cacheLoadVersionRef = useRef(0);
  const bookmarkLoadVersionRef = useRef(0);
  const [targetInput, setTargetInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [bookmarks, setBookmarks] = useState<EnsBookmark[]>([]);
  const [cachedSites, setCachedSites] = useState<CachedResolve[]>([]);
  const [pendingCachedFavorite, setPendingCachedFavorite] = useState<
    string | null
  >(null);
  const [cachedFavoriteError, setCachedFavoriteError] = useState<string | null>(
    null,
  );
  const directorySearch = useDappDirectorySearch(targetInput);
  const parsedInput = parseDapp3Target(targetInput);
  const directUrl = parsedInput?.kind === "https" ? parsedInput.url : undefined;
  const suggestionCount = directorySearch.results.length + (directUrl ? 1 : 0);
  const suggestionsVisible =
    searchFocused &&
    !suggestionsDismissed &&
    targetInput.trim().length >= 2 &&
    (suggestionCount > 0 || directorySearch.loading || directorySearch.failed);

  useEffect(() => {
    document.title = "WalletChan Browser";
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      if (clearInvalidRef.current !== null) {
        window.clearTimeout(clearInvalidRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadCachedSites = async () => {
      const loadVersion = ++cacheLoadVersionRef.current;
      const entries = await listCached(8).catch(() => []);
      if (active && loadVersion === cacheLoadVersionRef.current) {
        setCachedSites(entries);
      }
    };

    const loadBookmarks = async () => {
      const loadVersion = ++bookmarkLoadVersionRef.current;
      const entries = await getAllBookmarks().catch(() => []);
      if (active && loadVersion === bookmarkLoadVersionRef.current) {
        setBookmarks(entries);
      }
    };

    void loadCachedSites();
    void loadBookmarks();

    const refresh = () => {
      void loadCachedSites();
      void loadBookmarks();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local") return;
      if (ENS_RESOLVE_CACHE_KEY in changes) void loadCachedSites();
      if (ENS_BOOKMARKS_KEY in changes) {
        void loadBookmarks();
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      active = false;
      cacheLoadVersionRef.current += 1;
      bookmarkLoadVersionRef.current += 1;
      chrome.storage.onChanged.removeListener(handleStorageChange);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const flashError = (message: string) => {
    setError(message);
    setInvalid(false);
    requestAnimationFrame(() => setInvalid(true));
    if (clearInvalidRef.current !== null) {
      window.clearTimeout(clearInvalidRef.current);
    }
    clearInvalidRef.current = window.setTimeout(() => {
      setInvalid(false);
      clearInvalidRef.current = null;
    }, 450);
  };

  const openTarget = (raw: string = targetInput) => {
    const parsed = parseDapp3Target(raw);
    if (!parsed) {
      flashError(
        "Choose a suggested dapp, or enter an https:// URL, name.eth, name.gwei, or 0x... address.",
      );
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }

    setError(null);
    const targetUrl = navigationUrlForTarget(parsed);
    location.assign(
      parsed.kind === "https" ? targetUrl : buildInterstitialUrl(targetUrl),
    );
  };

  const openHttpsInNewTab = (url: string) => {
    setError(null);
    setSuggestionsDismissed(true);
    void chrome.runtime
      .sendMessage({ type: "ens-open-dapp-url", url })
      .then((response: { ok?: boolean }) => {
        if (!response?.ok) flashError("That dapp could not be opened.");
      })
      .catch(() => flashError("That dapp could not be opened."));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeSuggestion >= 0) {
      if (directUrl && activeSuggestion === 0) {
        openHttpsInNewTab(directUrl);
        return;
      }
      const resultIndex = activeSuggestion - (directUrl ? 1 : 0);
      const result = directorySearch.results[resultIndex];
      if (result) {
        openHttpsInNewTab(result.url);
        return;
      }
    }
    if (!parsedInput && directorySearch.results[0]) {
      openHttpsInNewTab(directorySearch.results[0].url);
      return;
    }
    openTarget();
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setSuggestionsDismissed(true);
      setActiveSuggestion(-1);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (suggestionCount === 0) return;
    event.preventDefault();
    setSuggestionsDismissed(false);
    setActiveSuggestion((current) => {
      if (event.key === "ArrowDown") {
        return current < suggestionCount - 1 ? current + 1 : 0;
      }
      return current > 0 ? current - 1 : suggestionCount - 1;
    });
  };

  const bookmarkedNames = new Set(bookmarks.map((bookmark) => bookmark.ensName));
  const visibleCachedSites = cachedSites.filter(
    (site) => !bookmarkedNames.has(site.ensName),
  );

  return (
    <>
      <main>
        <BookmarkPageReminder />

        <div className="search-panel">
          <div className="hero">
            <span className="brand-mark" aria-hidden="true">
              <img src="/walletchan-icon.png" alt="" />
            </span>
            <h1>WalletChan Browser</h1>
            <p className="hero-subtitle">
              Search dapps or resolve ENS, GNS, IPFS, and onchain sites
            </p>
          </div>

          <form className="go-form" autoComplete="off" onSubmit={submit}>
            <div className="search-control">
              <div className="input-row">
                <input
                  ref={inputRef}
                  id="target"
                  type="text"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-haspopup="grid"
                  aria-label="Search dapps or enter URL or .eth, .gwei or 0x address for onchain dapps"
                  aria-expanded={suggestionsVisible}
                  aria-controls="dapp-directory-suggestions"
                  aria-activedescendant={
                    activeSuggestion >= 0
                      ? `dapp-suggestion-${activeSuggestion}`
                      : undefined
                  }
                  aria-busy={directorySearch.loading}
                  placeholder="Search dapps / enter URL / .eth, .gwei, 0x.. for onchain dapps"
                  value={targetInput}
                  onFocus={() => {
                    setSearchFocused(true);
                    setSuggestionsDismissed(false);
                  }}
                  onBlur={() => setSearchFocused(false)}
                  onKeyDown={handleSearchKeyDown}
                  onChange={(event) => {
                    setTargetInput(event.target.value);
                    setSuggestionsDismissed(false);
                    setActiveSuggestion(-1);
                    if (error) setError(null);
                  }}
                  className={invalid ? "invalid" : undefined}
                  aria-describedby={error ? "hint" : undefined}
                  aria-invalid={Boolean(error)}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                <span className="input-actions">
                  {targetInput && (
                    <button
                      type="button"
                      className="search-clear"
                      aria-label="Clear search"
                      title="Clear search"
                      onClick={() => {
                        setTargetInput("");
                        setError(null);
                        setInvalid(false);
                        setSuggestionsDismissed(false);
                        setActiveSuggestion(-1);
                        inputRef.current?.focus();
                      }}
                    >
                      <CloseIcon />
                    </button>
                  )}
                  <button type="submit" id="open" className="primary">
                    Open
                  </button>
                </span>
              </div>
              {suggestionsVisible && (
                <DappDirectorySuggestions
                  directUrl={directUrl}
                  results={directorySearch.results}
                  bookmarks={bookmarks}
                  loading={directorySearch.loading}
                  failed={directorySearch.failed}
                  activeIndex={activeSuggestion}
                  onSelectUrl={openHttpsInNewTab}
                />
              )}
            </div>
            <p className="hint" id="hint" role="alert" hidden={!error}>
              {error}
            </p>
          </form>

          <div className="examples">
            <span className="examples-label">Eg:</span>
            {EXAMPLES.map((example) => (
              <button
                key={example.value}
                type="button"
                className="chip"
                onClick={() => {
                  setTargetInput(example.value);
                  setError(null);
                  openTarget(example.value);
                }}
              >
                {example.label}
              </button>
            ))}
          </div>
        </div>

        <FavoriteDappsSection
          bookmarks={bookmarks}
          cachedSites={cachedSites}
          onOpenHttpsUrl={openHttpsInNewTab}
          onOpenResolvedTarget={(target) => {
            setTargetInput(target);
            setError(null);
            openTarget(target);
          }}
        />

        <ConnectedDappsSection
          bookmarks={bookmarks}
          query={targetInput}
          onOpenHttpsUrl={openHttpsInNewTab}
        />

        {visibleCachedSites.length > 0 && (
          <section className="cached-sites" aria-labelledby="cached-sites-title">
            <h2 id="cached-sites-title">Recently cached dapps</h2>
            {cachedFavoriteError && (
              <p className="connected-sites-error" role="alert">
                {cachedFavoriteError}
              </p>
            )}
            <div className="site-grid">
              {visibleCachedSites.map((site) => {
                return (
                  <Dapp3SiteCard
                    key={site.ensName}
                    iconSrc={site.favicon || cachedFaviconUrl(site)}
                    iconFallbackSrc={cachedFaviconFallbackUrl(site)}
                    label={site.ensName}
                    title={site.ensName}
                    subtitle={formatKind(site.kind)}
                    onOpen={() => {
                      setTargetInput(site.ensName);
                      setError(null);
                      openTarget(site.ensName);
                    }}
                    favoriteAction={{
                      label: `Add ${site.title?.trim() || site.ensName} to favorites`,
                      pressed: false,
                      disabled: pendingCachedFavorite !== null,
                      onClick: () => {
                        setPendingCachedFavorite(site.ensName);
                        setCachedFavoriteError(null);
                        void addBookmark(bookmarkForCachedDapp(site))
                          .catch(() => {
                            setCachedFavoriteError(
                              "That favorite could not be saved. Please try again.",
                            );
                          })
                          .finally(() => setPendingCachedFavorite(null));
                      },
                    }}
                  />
                );
              })}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
