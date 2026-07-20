import { useEffect, useMemo, useRef, useState } from "react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import {
  getBridgeSourceChains,
  getBridgeDestinationChains,
  type EnrichedBridgeChain,
} from "@/chrome/bridgeChainsResolver";
import { getCachedBungeeTokens } from "@/chrome/bridgeApi";
import { secureHttpTransport } from "@/chrome/network/rpcClient";
import type { BungeeToken } from "@walletchan/shared/bungee";
import {
  getStoredRpcUrl,
  getNativeAssetLogoUrl,
  getNativeAssetMeta,
  getResolvedChainById,
  type ChainAccountType,
  type NativeAssetMeta,
} from "@/lib/chains";
import { useNetworks } from "@/contexts/NetworksContext";
import { KNOWN_TOKEN_LOGOS } from "@/chrome/txSimulation";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";
import { chainHasNativeToken } from "@/constants/chainRegistry";
import { BridgeChainTokenPickerScreen } from "./BridgeChainTokenPickerScreen";
import { pickDefaultSwapSellToken } from "./swapViewUtils";
import { TOKEN_PICKER_PAGE_SIZE } from "@/chrome/portfolio/consumerPolicy";

const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Popular token symbols per chain — shown as trending chips above the list. */
const POPULAR_PER_CHAIN: Record<number, string[]> = {
  1: ["ETH", "USDC", "USDT", "WBTC", "WETH"],
  42161: ["ETH", "USDC", "USDT", "WETH"],
  8453: ["ETH", "WCHAN", "USDC", "USDT", "WBTC"],
  56: ["BNB", "USDC", "USDT", "WBTC", "WETH"],
  137: ["POL", "USDC", "WETH"],
  130: ["ETH", "USDC", "WBTC", "WETH"],
};

/** Adapt a Bungee token (chain-agnostic shape) into the parent's PortfolioToken. */
function bungeeToPortfolio(t: BungeeToken, chainId: number): PortfolioToken {
  const addr = t.address ?? "";
  const isNative = isNativeAddress(addr);
  return {
    contractAddress: isNative ? "native" : addr,
    name: t.name ?? "",
    symbol: t.symbol ?? "",
    decimals: t.decimals ?? 18,
    balance: "0",
    balanceFormatted: "0",
    logoUrl: t.logoURI ?? t.icon ?? KNOWN_TOKEN_LOGOS[addr.toLowerCase()],
    valueUsd: 0,
    priceUsd: 0,
    chainId,
  };
}
function isNativeAddress(addr: string): boolean {
  const lower = addr.toLowerCase();
  return (
    lower === NATIVE_TOKEN_ADDRESS.toLowerCase() ||
    lower === ZERO_ADDRESS
  );
}

function nativeMetaFromBungeeChain(
  chain: EnrichedBridgeChain | undefined,
): NativeAssetMeta | null {
  const currency = chain?.currency;
  if (!currency?.symbol) return null;
  const symbol = currency.symbol;
  const fallbackLogo =
    currency.logoURI || currency.icon || chain?.icon || chain?.logoURI;
  return {
    name: currency.name || symbol,
    symbol,
    decimals: currency.decimals ?? 18,
    logoUrl: getNativeAssetLogoUrl(symbol, fallbackLogo),
    chainName: chain?.name || "this chain",
  };
}

function buildNativePortfolioToken(
  native: NativeAssetMeta,
  chainId: number,
  existing?: PortfolioToken,
): PortfolioToken {
  return {
    contractAddress: "native",
    name: native.name,
    symbol: native.symbol,
    decimals: native.decimals,
    balance: existing?.balance ?? "0",
    balanceFormatted: existing?.balanceFormatted ?? "0",
    logoUrl: native.logoUrl || existing?.logoUrl || "",
    valueUsd: existing?.valueUsd ?? 0,
    priceUsd: existing?.priceUsd ?? 0,
    chainId: existing?.chainId ?? chainId,
  };
}

interface BridgeChainTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** "sell" picks source chains; "buy" picks destination chains. */
  mode: "sell" | "buy";
  initialPanel: "chains" | "tokens";
  /** Active account type. Sell-side chains are filtered to what can sign. */
  accountType: ChainAccountType;
  /** Chain shown selected when the dropdown opens. */
  initialChainId: number;
  /** Already-selected token on this side, used to highlight + as exclude. */
  selectedTokenAddress?: string;
  /** Chain the selected token belongs to. Required for correct highlight
   *  attribution when the user navigates to OTHER chains — e.g. native ETH
   *  shares the same sentinel address on every chain, so without this the
   *  ETH pill would falsely highlight on every chain in the strip. */
  selectedTokenChainId?: number;
  /** Exclude this token from the list (the OTHER side's selection). */
  excludeAddress?: string;
  /** Chain for `excludeAddress`; exclusion only applies when it matches the viewed chain. */
  excludeChainId?: number;
  /** Fires when the user picks a token. Carries the chain they navigated to. */
  onSelect: (chainId: number, token: PortfolioToken) => void;
  /** Wallet address — for onchain balance lookup of pasted custom tokens. */
  fromAddress: string;
  /** Catalog of held tokens across ALL chains. Drives portfolio totals on the
   *  chain list AND the "Your Tokens" section on the right pane. */
  holdingsAllChains: PortfolioToken[];
  /** Deterministic preview/testing seed; production leaves this empty. */
  initialTokenSearch?: string;
}

interface ResolvedCustomToken {
  token: PortfolioToken;
  chainId: number;
}

export default function BridgeChainTokenModal({
  isOpen,
  onClose,
  mode,
  initialPanel,
  accountType,
  initialChainId,
  selectedTokenAddress,
  selectedTokenChainId,
  excludeAddress,
  excludeChainId,
  onSelect,
  fromAddress,
  holdingsAllChains,
  initialTokenSearch = "",
}: BridgeChainTokenModalProps) {
  const { networksInfo } = useNetworks();
  const [currentChainId, setCurrentChainId] = useState(initialChainId);
  const [panel, setPanel] = useState<"chains" | "tokens">(initialPanel);
  const [chains, setChains] = useState<EnrichedBridgeChain[]>([]);
  const [chainsLoading, setChainsLoading] = useState(true);

  const [tokens, setTokens] = useState<BungeeToken[]>([]);
  // Which chain the `tokens` array was fetched for. Compared against
  // `currentChainId` to suppress stale rows while a new chain's tokens are
  // in-flight — the difference is what drives the skeleton state.
  const [tokensChainId, setTokensChainId] = useState<number | null>(null);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokenSearch, setTokenSearch] = useState("");
  const [visibleTokenCount, setVisibleTokenCount] = useState(
    TOKEN_PICKER_PAGE_SIZE,
  );

  const [resolvedCustom, setResolvedCustom] = useState<ResolvedCustomToken | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const lastResolvedAddrRef = useRef<string>("");

  const tokenSearchRef = useRef<HTMLInputElement>(null);

  // Reset state every time the dropdown opens. Honours the parent's
  // `initialChainId` so reopening from a different side picks up.
  useEffect(() => {
    if (!isOpen) return;
    setCurrentChainId(initialChainId);
    setPanel(initialPanel);
    setTokenSearch(initialTokenSearch);
    setResolvedCustom(null);
    setCustomError(null);
    setCustomLoading(false);
    setVisibleTokenCount(TOKEN_PICKER_PAGE_SIZE);
    lastResolvedAddrRef.current = "";
    // Defer focus past the dropdown's mount animation.
    const id = window.setTimeout(() => {
      tokenSearchRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(id);
  }, [isOpen, initialChainId, initialPanel, initialTokenSearch]);

  useEffect(() => {
    setVisibleTokenCount(TOKEN_PICKER_PAGE_SIZE);
  }, [currentChainId, tokenSearch]);

  // Load chain list once per open + mode flip.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setChainsLoading(true);
    (async () => {
      try {
        const list = mode === "sell"
          ? await getBridgeSourceChains(accountType)
          : await getBridgeDestinationChains();
        if (cancelled) return;
        setChains(list);
      } finally {
        if (!cancelled) setChainsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, mode, accountType]);

  // Load tokens whenever the in-modal chain changes.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setTokensLoading(true);
    setResolvedCustom(null);
    setCustomError(null);
    lastResolvedAddrRef.current = "";
    (async () => {
      try {
        const list = await getCachedBungeeTokens(currentChainId);
        if (cancelled) return;
        setTokens(list);
        setTokensChainId(currentChainId);
      } finally {
        if (!cancelled) setTokensLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentChainId]);

  // Stale-tokens guard — true the instant `currentChainId` changes (the
  // fetched-for chain hasn't caught up yet). Drives skeleton rows instead
  // of leaving the previous chain's tokens visible during the in-flight
  // fetch.
  const tokensStale = tokensChainId !== currentChainId;

  // ---- Portfolio totals by chain (used by both sell + buy sorts) ----
  // Drives chip ordering: in sell mode it also paints the inline $ total
  // on each chip; in buy mode it only influences sort priority so chains
  // the user already holds balances on float to the front.
  const portfolioByChain = useMemo(() => {
    const map = new Map<number, number>();
    for (const h of holdingsAllChains) {
      const cur = map.get(h.chainId) ?? 0;
      map.set(h.chainId, cur + (h.valueUsd || 0));
    }
    return map;
  }, [holdingsAllChains]);

  const fundedChainIds = useMemo(
    () =>
      new Set(
        holdingsAllChains
          .filter(
            (token) =>
              token.valueUsd > 0 || parseFloat(token.balance || "0") > 0,
          )
          .map((token) => token.chainId),
      ),
    [holdingsAllChains],
  );

  // Full Bungee entry for the selected chain — drives both the section
  // header label AND the inline logo so all three section headers paint
  // identical "on <chain>" badges.
  const currentChain = useMemo(
    () => chains.find((c) => c.chainId === currentChainId),
    [chains, currentChainId],
  );

  // Display name for the selected chain. Bungee's list is authoritative
  // here (covers every chain in the picker, including those missing from
  // our local CHAIN_REGISTRY — Abstract, Plume, Sonic, etc.). Fall back to
  // getResolvedChainById for registry + user-added custom chains we surface
  // in sell mode, then to a neutral "this chain" so we never paint
  // "Unknown" in a label.
  const currentChainName = useMemo(() => {
    if (currentChain?.name) return currentChain.name;
    const resolved = getResolvedChainById(currentChainId, networksInfo)?.name;
    if (resolved && resolved.toLowerCase() !== "unknown") return resolved;
    return "this chain";
  }, [currentChain, currentChainId, networksInfo]);

  const nativeAsset = useMemo(
    () =>
      chainHasNativeToken(currentChainId)
        ? nativeMetaFromBungeeChain(currentChain) ??
          getNativeAssetMeta(currentChainId, networksInfo)
        : null,
    [currentChain, currentChainId, networksInfo],
  );

  // ---- Tokens for the right pane ----
  const holdingsOnChain = useMemo(
    () => holdingsAllChains.filter((h) => h.chainId === currentChainId),
    [holdingsAllChains, currentChainId],
  );

  const heldAddressSet = useMemo(() => {
    const set = new Set<string>();
    for (const h of holdingsOnChain) {
      const a = h.contractAddress === "native"
        ? NATIVE_TOKEN_ADDRESS.toLowerCase()
        : h.contractAddress.toLowerCase();
      set.add(a);
    }
    return set;
  }, [holdingsOnChain]);

  // Guard against the stale-tokens window — when the user just switched
  // chains, the in-memory `tokens` array still holds the previous chain's
  // data. Treat it as empty until `tokensChainId` catches up so derived
  // sections (popular, "Tokens on X") don't flash old rows.
  const tokensAsPortfolio = useMemo(() => {
    if (tokensStale) return [];
    const mapped = tokens.map((t) => bungeeToPortfolio(t, currentChainId));
    if (!nativeAsset) {
      return mapped.filter((token) => token.contractAddress !== "native");
    }

    const nativeIndex = mapped.findIndex((t) => t.contractAddress === "native");
    if (nativeIndex >= 0) {
      const next = [...mapped];
      next[nativeIndex] = buildNativePortfolioToken(
        nativeAsset,
        currentChainId,
        mapped[nativeIndex],
      );
      return next;
    }

    return [buildNativePortfolioToken(nativeAsset, currentChainId), ...mapped];
  }, [tokens, currentChainId, tokensStale, nativeAsset]);

  const activeExcludeAddress =
    excludeChainId === undefined || excludeChainId === currentChainId
      ? excludeAddress
      : undefined;

  const excludeLower = activeExcludeAddress
    ? isNativeAddress(activeExcludeAddress) || activeExcludeAddress === "native"
      ? NATIVE_TOKEN_ADDRESS.toLowerCase()
      : activeExcludeAddress.toLowerCase()
    : undefined;

  const restTokens = useMemo(() => {
    return tokensAsPortfolio
      .filter((t) => {
        const a = t.contractAddress === "native"
          ? NATIVE_TOKEN_ADDRESS.toLowerCase()
          : t.contractAddress.toLowerCase();
        return !heldAddressSet.has(a) && a !== excludeLower;
      })
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [tokensAsPortfolio, heldAddressSet, excludeLower]);

  const term = tokenSearch.trim().toLowerCase();
  const isAddressSearch = /^0x[a-fA-F0-9]{40}$/.test(tokenSearch.trim());

  const filteredHoldings = useMemo(() => {
    const base = holdingsOnChain.filter((h) => {
      const a = h.contractAddress === "native"
        ? NATIVE_TOKEN_ADDRESS.toLowerCase()
        : h.contractAddress.toLowerCase();
      return a !== excludeLower;
    });
    const matched = term
      ? base.filter(
          (h) =>
            h.symbol.toLowerCase().includes(term) ||
            h.name.toLowerCase().includes(term) ||
            (h.contractAddress === "native"
              ? NATIVE_TOKEN_ADDRESS.toLowerCase()
              : h.contractAddress.toLowerCase()
            ).includes(term),
        )
      : base;
    // Sort by USD value desc so funded tokens dominate the visible region;
    // ties fall back to balance desc, then symbol asc for stability.
    return [...matched].sort((a, b) => {
      if (b.valueUsd !== a.valueUsd) return b.valueUsd - a.valueUsd;
      const ab = parseFloat(a.balance) || 0;
      const bb = parseFloat(b.balance) || 0;
      if (bb !== ab) return bb - ab;
      return a.symbol.localeCompare(b.symbol);
    });
  }, [holdingsOnChain, term, excludeLower]);

  const filteredRest = useMemo(() => {
    if (!term) return restTokens;
    return restTokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(term) ||
        t.name.toLowerCase().includes(term) ||
        (t.contractAddress === "native"
          ? NATIVE_TOKEN_ADDRESS.toLowerCase()
          : t.contractAddress.toLowerCase()
        ).includes(term),
    );
  }, [restTokens, term]);
  const visibleHoldings = useMemo(
    () => filteredHoldings.slice(0, visibleTokenCount),
    [filteredHoldings, visibleTokenCount],
  );
  const visibleRest = useMemo(
    () => filteredRest.slice(0, visibleTokenCount),
    [filteredRest, visibleTokenCount],
  );
  const remainingTokenCount =
    Math.max(0, filteredHoldings.length - visibleHoldings.length) +
    Math.max(0, filteredRest.length - visibleRest.length);

  // Popular / trending chips — same dataset as the legacy selectors so the
  // user sees a consistent quick-pick set. Drops the last entry from each
  // per-chain list (it's the lowest-priority pick) and caps at 4 chips so
  // the row stays a single line in the narrow popup.
  const popularTokens = useMemo(() => {
    if (term) return [];
    const bySymbol = new Map<string, PortfolioToken>();
    for (const h of holdingsOnChain) {
      const sym = h.symbol.toUpperCase();
      if (!bySymbol.has(sym)) bySymbol.set(sym, h);
    }
    for (const t of tokensAsPortfolio) {
      const sym = (t.symbol || "").toUpperCase();
      if (sym && !bySymbol.has(sym)) bySymbol.set(sym, t);
    }
    // Native token — always present, using Bungee currency metadata first so
    // user-added custom chains like Plasma still get a usable token row/chip.
    const native = nativeAsset;
    if (native) {
      const nativeSym = native.symbol.toUpperCase();
      const existing = bySymbol.get(nativeSym);
      bySymbol.set(nativeSym, {
        contractAddress: existing?.contractAddress ?? "native",
        name: existing?.name ?? native.name,
        symbol: existing?.symbol ?? native.symbol,
        decimals: existing?.decimals ?? native.decimals,
        balance: existing?.balance ?? "0",
        balanceFormatted: existing?.balanceFormatted ?? "0",
        logoUrl: native.logoUrl,
        valueUsd: existing?.valueUsd ?? 0,
        priceUsd: existing?.priceUsd ?? 0,
        chainId: existing?.chainId ?? currentChainId,
      });
    }
    const fullList = POPULAR_PER_CHAIN[currentChainId];
    const symbols = fullList
      ? fullList.slice(0, -1).slice(0, 4)
      : native
        ? [native.symbol.toUpperCase()]
        : [];
    const out: PortfolioToken[] = [];
    for (const sym of symbols) {
      const entry = bySymbol.get(sym);
      if (!entry) continue;
      const addr =
        entry.contractAddress === "native"
          ? NATIVE_TOKEN_ADDRESS
          : entry.contractAddress;
      if (addr.toLowerCase() === excludeLower) continue;
      out.push(entry);
    }
    return out;
  }, [
    tokensAsPortfolio,
    holdingsOnChain,
    term,
    currentChainId,
    excludeLower,
    nativeAsset,
  ]);

  // ---- Custom address resolution (paste 0x in token search) ----
  useEffect(() => {
    const val = tokenSearch.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(val)) return;
    if (val === lastResolvedAddrRef.current) return;
    lastResolvedAddrRef.current = val;

    let cancelled = false;
    setCustomLoading(true);
    setCustomError(null);
    setResolvedCustom(null);

    (async () => {
      try {
        const info = await new Promise<{ success: boolean; data?: { name: string; symbol: string; decimals: number } }>((resolve) => {
          chrome.runtime.sendMessage(
            { type: "fetchTokenInfo", tokenAddress: val, chainId: currentChainId },
            resolve,
          );
        });
        if (cancelled) return;
        if (!info.success || !info.data) {
          setCustomError("Not a valid ERC20 contract");
          setCustomLoading(false);
          return;
        }

        const addrLower = val.toLowerCase();
        const isNative =
          addrLower === "0x0000000000000000000000000000000000000000" ||
          addrLower === NATIVE_TOKEN_ADDRESS.toLowerCase();

        const rpcUrl = await getStoredRpcUrl(currentChainId);
        let balance = "0";
        if (rpcUrl && fromAddress) {
          try {
            const { createPublicClient, erc20Abi, formatUnits } = await import("viem");
            const client = createPublicClient({ transport: secureHttpTransport(rpcUrl, { timeout: 8000, retryCount: 0 }) });
            const raw = isNative
              ? await client.getBalance({ address: fromAddress as `0x${string}` })
              : await client.readContract({
                  address: val as `0x${string}`,
                  abi: erc20Abi,
                  functionName: "balanceOf",
                  args: [fromAddress as `0x${string}`],
                });
            balance = formatUnits(raw, info.data.decimals);
          } catch {
            // Keep balance "0" on RPC failure — let user proceed anyway.
          }
        }
        if (cancelled) return;

        const listMatch = tokens.find(
          (t) => (t.address ?? "").toLowerCase() === addrLower,
        );
        const logo = isNative
          ? nativeAsset?.logoUrl ?? ""
          : (listMatch?.logoURI || listMatch?.icon || KNOWN_TOKEN_LOGOS[addrLower] || "");

        const balanceNum = parseFloat(balance);
        const token: PortfolioToken = {
          contractAddress: isNative ? "native" : val,
          name: info.data.name,
          symbol: info.data.symbol,
          decimals: info.data.decimals,
          balance,
          balanceFormatted:
            balanceNum < 0.0001 && balanceNum > 0
              ? "<0.0001"
              : parseFloat(balanceNum.toPrecision(6)).toString(),
          logoUrl: logo,
          valueUsd: 0,
          priceUsd: 0,
          chainId: currentChainId,
        };
        setResolvedCustom({ token, chainId: currentChainId });
      } catch {
        if (!cancelled) setCustomError("Failed to fetch token info");
      } finally {
        if (!cancelled) setCustomLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tokenSearch, currentChainId, fromAddress, tokens, nativeAsset]);

  // ---- Logo cache (chain icons + token logos) ----
  const tokenLogoUrls = useMemo(() => {
    const urls: Array<string | null | undefined> = [];
    for (const h of visibleHoldings) urls.push(h.logoUrl);
    for (const t of visibleRest) urls.push(t.logoUrl);
    for (const t of popularTokens) urls.push(t.logoUrl);
    if (resolvedCustom) urls.push(resolvedCustom.token.logoUrl);
    return urls;
  }, [visibleHoldings, visibleRest, popularTokens, resolvedCustom]);
  const logoCache = useCachedAvatarMap(tokenLogoUrls);
  const resolveLogo = (url: string | undefined): string | undefined =>
    (url && logoCache.get(url)) || url;

  // ---- Helpers ----
  const isSelectedAddr = (addr: string) => {
    if (!selectedTokenAddress) return false;
    // Native sentinel + USDC-style multi-chain ERC20s share an address across
    // chains, so a pure string compare highlights the wrong chain. Anchor the
    // highlight to the chain the user actually picked on.
    if (
      selectedTokenChainId !== undefined &&
      selectedTokenChainId !== currentChainId
    ) {
      return false;
    }
    return selectedTokenAddress.toLowerCase() === addr.toLowerCase();
  };

  const handlePickToken = (t: PortfolioToken) => {
    onSelect(currentChainId, t);
    onClose();
  };
  const handleSelectChain = (chainId: number) => {
    const chain = chains.find((item) => item.chainId === chainId);
    const native = chainHasNativeToken(chainId)
      ? nativeMetaFromBungeeChain(chain) ?? getNativeAssetMeta(chainId, networksInfo)
      : null;
    const excluded = (token: PortfolioToken) => {
      if (excludeChainId !== chainId || !excludeAddress) return false;
      const tokenAddress =
        token.contractAddress === "native" ? NATIVE_TOKEN_ADDRESS : token.contractAddress;
      return tokenAddress.toLowerCase() === excludeAddress.toLowerCase();
    };
    const eligibleHoldings = holdingsAllChains.filter(
      (token) => token.chainId === chainId && !excluded(token),
    );
    const heldDefault = pickDefaultSwapSellToken(eligibleHoldings, chainId);
    const existingNative = eligibleHoldings.find(
      (token) => token.contractAddress === "native",
    );
    const nativeDefault =
      native &&
      buildNativePortfolioToken(native, chainId, existingNative);
    const picked = mode === "sell" ? heldDefault ?? nativeDefault : nativeDefault ?? heldDefault;
    if (picked && !excluded(picked)) {
      onSelect(chainId, picked);
      onClose();
      return;
    }
    setCurrentChainId(chainId);
    setPanel("tokens");
    setTokenSearch("");
  };

  const isSelectedToken = (token: PortfolioToken) => {
    const address =
      token.contractAddress === "native"
        ? NATIVE_TOKEN_ADDRESS
        : token.contractAddress;
    return isSelectedAddr(address);
  };

  if (!isOpen) return null;

  return (
    <BridgeChainTokenPickerScreen
      mode={mode}
      panel={panel}
      onBack={onClose}
      tokenSearch={tokenSearch}
      onTokenSearchChange={setTokenSearch}
      tokenSearchRef={tokenSearchRef}
      chains={chains}
      chainsLoading={chainsLoading}
      currentChainId={currentChainId}
      currentChain={currentChain}
      currentChainName={currentChainName}
      chainTotals={portfolioByChain}
      fundedChainIds={fundedChainIds}
      onSelectChain={handleSelectChain}
      popularTokens={popularTokens}
      customToken={
        resolvedCustom?.chainId === currentChainId
          ? resolvedCustom.token
          : undefined
      }
      customLoading={customLoading}
      customError={customError ?? undefined}
      isAddressSearch={isAddressSearch}
      visibleHoldings={visibleHoldings}
      remainingTokens={visibleRest}
      remainingTokenCount={remainingTokenCount}
      onShowMore={() =>
        setVisibleTokenCount((count) => count + TOKEN_PICKER_PAGE_SIZE)
      }
      tokensLoading={tokensLoading}
      tokensStale={tokensStale}
      isSelectedToken={isSelectedToken}
      resolveLogo={resolveLogo}
      onSelectToken={handlePickToken}
    />
  );
}
