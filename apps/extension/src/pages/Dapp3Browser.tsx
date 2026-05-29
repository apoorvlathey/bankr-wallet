import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ENS_RESOLVE_CACHE_KEY,
  listCached,
  type CachedResolve,
} from "@/chrome/ensBrowsing/cache";
import {
  ENS_BOOKMARKS_KEY,
  getAllBookmarks,
  type EnsBookmark,
} from "@/chrome/ensBrowsing/bookmarks";
import "./Dapp3Browser.css";

type ParsedTarget =
  | { kind: "ens"; host: string; rest: string }
  | { kind: "address"; address: string; rest: string };

const EXAMPLES = [
  { label: "vitalik.eth", value: "vitalik.eth" },
  { label: "zrouter.eth", value: "zrouter.eth" },
  {
    label: "OFTScan (0x…9e32)",
    value: "0x000000f7f90708c034c854efd1d5bfe8e9079e32",
  },
];

function normalizeRest(rest: string): string {
  if (!rest) return "";
  if (rest.startsWith("/") || rest.startsWith("?") || rest.startsWith("#")) {
    return rest;
  }
  return `/${rest}`;
}

function parseTarget(rawInput: string): ParsedTarget | null {
  const trimmed = rawInput
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^\/+/, "");
  if (!trimmed) return null;

  const match = trimmed.match(/^([^/?#]+)(.*)$/);
  if (!match?.[1]) return null;

  const head = match[1].toLowerCase().replace(/:\d+$/, "");
  const rest = normalizeRest(match[2] || "");

  if (/^0x[a-f0-9]{40}$/.test(head)) {
    return { kind: "address", address: head, rest };
  }

  const w3link = head.match(/^(0x[a-f0-9]{40})\.1\.w3link\.io$/);
  if (w3link?.[1]) {
    return { kind: "address", address: w3link[1], rest };
  }

  const w3eth = head.match(/^([a-z0-9-]+(?:\.[a-z0-9-]+)*)\.w3eth\.io$/);
  if (w3eth?.[1]) {
    const label = w3eth[1];
    if (/^0x[a-f0-9]{40}$/.test(label)) {
      return { kind: "address", address: label, rest };
    }
    return { kind: "ens", host: `${label}.eth`, rest };
  }

  const ethGateway = head.match(/^((?:[a-z0-9-]+\.)+eth)\.(?:limo|link)$/);
  if (ethGateway?.[1]) {
    return { kind: "ens", host: ethGateway[1], rest };
  }

  if (/^(?:[a-z0-9-]+\.)+eth\.?$/.test(head)) {
    return {
      kind: "ens",
      host: head.endsWith(".") ? head.slice(0, -1) : head,
      rest,
    };
  }

  return null;
}

function buildTargetUrl(target: ParsedTarget): string {
  const path = target.rest || "/";
  if (target.kind === "ens") {
    return `http://${target.host}${path}`;
  }
  return `https://${target.address}.w3eth.io${path}`;
}

function buildInterstitialUrl(targetUrl: string): string {
  return `${chrome.runtime.getURL("interstitial.html")}#${targetUrl}`;
}

function formatKind(kind: CachedResolve["kind"]): string {
  if (kind === "web3") return "HTML";
  return kind.toUpperCase();
}

type FaviconSource = {
  ensName: string;
  kind?: CachedResolve["kind"];
  favicon?: string;
};

function defaultFaviconUrl(site: FaviconSource): string {
  if (site.kind === "web3" || /^0x[a-f0-9]{40}$/.test(site.ensName)) {
    const label = site.ensName.endsWith(".eth")
      ? site.ensName.slice(0, -4)
      : site.ensName;
    return `https://${label}.w3eth.io/favicon.ico`;
  }
  return `https://${site.ensName}.limo/favicon.ico`;
}

export default function Dapp3Browser() {
  const inputRef = useRef<HTMLInputElement>(null);
  const clearInvalidRef = useRef<number | null>(null);
  const [targetInput, setTargetInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [bookmarks, setBookmarks] = useState<EnsBookmark[]>([]);
  const [cachedSites, setCachedSites] = useState<CachedResolve[]>([]);
  const [failedFavicons, setFailedFavicons] = useState<Set<string>>(
    () => new Set(),
  );

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
      const entries = await listCached(8).catch(() => []);
      if (active) setCachedSites(entries);
    };

    const loadBookmarks = async () => {
      const entries = await getAllBookmarks().catch(() => []);
      if (active) setBookmarks(entries);
    };

    void loadCachedSites();
    void loadBookmarks();

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
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(handleStorageChange);
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
    const parsed = parseTarget(raw);
    if (!parsed) {
      flashError("Couldn't parse that. Try `name.eth` or a 0x… contract address.");
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }

    setError(null);
    location.assign(buildInterstitialUrl(buildTargetUrl(parsed)));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    openTarget();
  };

  const markFaviconFailed = (key: string) => {
    setFailedFavicons((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });
  };

  const bookmarkedNames = new Set(bookmarks.map((bookmark) => bookmark.ensName));
  const visibleCachedSites = cachedSites.filter(
    (site) => !bookmarkedNames.has(site.ensName),
  );

  const bookmarkTarget = (bookmark: EnsBookmark) => {
    if (bookmark.path === "/") return bookmark.ensName;
    return `${bookmark.ensName}${bookmark.path}`;
  };

  const bookmarkSubtitle = (bookmark: EnsBookmark) => {
    if (bookmark.path === "/") return "Saved";
    return bookmark.path;
  };

  return (
    <>
      <main>
        <div className="search-panel">
          <div className="hero">
            <span className="brand-mark" aria-hidden="true">
              <img src="/walletchan-icon.png" alt="" />
            </span>
            <h1>WalletChan Browser</h1>
            <p className="hero-subtitle">
              Resolve & Browse ENS + IPFS and Onchain HTML sites locally
            </p>
          </div>

          <form className="go-form" autoComplete="off" onSubmit={submit}>
            <div className="input-row">
              <input
                ref={inputRef}
                id="target"
                type="text"
                placeholder="name.eth or 0x… address"
                value={targetInput}
                onChange={(event) => {
                  setTargetInput(event.target.value);
                  if (error) setError(null);
                }}
                className={invalid ? "invalid" : undefined}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
              <button type="submit" id="open" className="primary">
                Open
              </button>
            </div>
            <p className="hint" id="hint" hidden={!error}>
              {error}
            </p>
          </form>

          <div className="examples">
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

        {bookmarks.length > 0 && (
          <section
            className="cached-sites bookmarked-sites"
            aria-labelledby="bookmarked-sites-title"
          >
            <h2 id="bookmarked-sites-title">Favorite dapps</h2>
            <div className="site-grid">
              {bookmarks.map((bookmark) => {
                const key = `${bookmark.ensName}${bookmark.path}`;
                const faviconSrc = failedFavicons.has(key)
                  ? null
                  : bookmark.favicon || defaultFaviconUrl(bookmark);
                const target = bookmarkTarget(bookmark);
                return (
                  <button
                    key={key}
                    type="button"
                    className="site-tile"
                    title={bookmark.title || target}
                    onClick={() => {
                      setTargetInput(target);
                      setError(null);
                      openTarget(target);
                    }}
                  >
                    <span className="site-icon" aria-hidden="true">
                      {faviconSrc ? (
                        <img
                          className="site-favicon"
                          src={faviconSrc}
                          alt=""
                          onError={() => markFaviconFailed(key)}
                        />
                      ) : (
                        <span className="site-letter">
                          {bookmark.ensName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="site-name">
                      {bookmark.title?.trim() || bookmark.ensName}
                    </span>
                    <span className="site-kind">
                      {bookmarkSubtitle(bookmark)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {visibleCachedSites.length > 0 && (
          <section className="cached-sites" aria-labelledby="cached-sites-title">
            <h2 id="cached-sites-title">Recently cached dapps</h2>
            <div className="site-grid">
              {visibleCachedSites.map((site) => {
                const faviconSrc = failedFavicons.has(site.ensName)
                  ? null
                  : site.favicon || defaultFaviconUrl(site);
                return (
                  <button
                    key={site.ensName}
                    type="button"
                    className="site-tile"
                    title={site.title || site.ensName}
                    onClick={() => {
                      setTargetInput(site.ensName);
                      setError(null);
                      openTarget(site.ensName);
                    }}
                  >
                    <span className="site-icon" aria-hidden="true">
                      {faviconSrc ? (
                        <img
                          className="site-favicon"
                          src={faviconSrc}
                          alt=""
                          onError={() => markFaviconFailed(site.ensName)}
                        />
                      ) : (
                        <span className="site-letter">
                          {site.ensName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="site-name">{site.ensName}</span>
                    <span className="site-kind">{formatKind(site.kind)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
