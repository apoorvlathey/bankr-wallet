import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  HStack,
  Image,
  Input,
  InputGroup,
  InputLeftElement,
  Skeleton,
  SkeletonCircle,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon, CloseIcon, Search2Icon } from "@chakra-ui/icons";
import type { PortfolioToken } from "@/chrome/portfolioApi";
import {
  getBridgeSourceChains,
  getBridgeDestinationChains,
  type EnrichedBridgeChain,
} from "@/chrome/bridgeChainsResolver";
import { getCachedBungeeTokens } from "@/chrome/bridgeApi";
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
import ChainIcon from "@/components/ChainIcon";
import { useTheme } from "@/theme";
import { TokenSymbolFallback } from "./TokenSymbolFallback";
import { truncateAddress } from "@/lib/addressUtils";
import { formatTokenBalance } from "@/lib/tokenFormatUtils";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";

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
  /** DOM node of the trigger button — used to anchor the dropdown below it.
   *  When null, the dropdown does not render even if `isOpen` is true. */
  triggerEl: HTMLElement | null;
}

interface ResolvedCustomToken {
  token: PortfolioToken;
  chainId: number;
}

export default function BridgeChainTokenModal({
  isOpen,
  onClose,
  mode,
  accountType,
  initialChainId,
  selectedTokenAddress,
  selectedTokenChainId,
  excludeAddress,
  excludeChainId,
  onSelect,
  fromAddress,
  holdingsAllChains,
  triggerEl,
}: BridgeChainTokenModalProps) {
  const { themeId } = useTheme();
  const { networksInfo } = useNetworks();
  const [currentChainId, setCurrentChainId] = useState(initialChainId);
  const [chains, setChains] = useState<EnrichedBridgeChain[]>([]);
  const [chainsLoading, setChainsLoading] = useState(true);

  const [tokens, setTokens] = useState<BungeeToken[]>([]);
  // Which chain the `tokens` array was fetched for. Compared against
  // `currentChainId` to suppress stale rows while a new chain's tokens are
  // in-flight — the difference is what drives the skeleton state.
  const [tokensChainId, setTokensChainId] = useState<number | null>(null);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokenSearch, setTokenSearch] = useState("");

  const [resolvedCustom, setResolvedCustom] = useState<ResolvedCustomToken | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const lastResolvedAddrRef = useRef<string>("");

  const tokenSearchRef = useRef<HTMLInputElement>(null);
  const selectedChainChipRef = useRef<HTMLButtonElement>(null);

  // Inline chain-name filter. Closed by default to keep the strip compact;
  // a leading search icon button expands an input pill on click.
  const [chainSearchOpen, setChainSearchOpen] = useState(false);
  const [chainSearchTerm, setChainSearchTerm] = useState("");
  const chainSearchInputRef = useRef<HTMLInputElement>(null);

  // Spam-suppression: holdings worth less than $0.10 USD collapse into a
  // disclosure row at the bottom of "Your Tokens". Default closed because
  // every Base wallet that's ever touched a memecoin/airdrop has 30+ of
  // these and they'd otherwise dominate the section.
  const LOW_VALUE_USD_THRESHOLD = 0.1;
  const [showLowValue, setShowLowValue] = useState(false);

  // Reset state every time the dropdown opens. Honours the parent's
  // `initialChainId` so reopening from a different side picks up.
  useEffect(() => {
    if (!isOpen) return;
    setCurrentChainId(initialChainId);
    setTokenSearch("");
    setResolvedCustom(null);
    setCustomError(null);
    setCustomLoading(false);
    setShowLowValue(false);
    setChainSearchOpen(false);
    setChainSearchTerm("");
    lastResolvedAddrRef.current = "";
    // Defer focus past the dropdown's mount animation.
    const id = window.setTimeout(() => {
      tokenSearchRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(id);
  }, [isOpen, initialChainId]);

  // Reset the low-value disclosure when the user switches chain — each
  // chain's "Your Tokens" set should start collapsed.
  useEffect(() => {
    setShowLowValue(false);
  }, [currentChainId]);

  // Focus the chain-search input once its inline-expand transition has
  // settled. Otherwise the focus ring jumps in before the input has its
  // final width and looks janky.
  useEffect(() => {
    if (!chainSearchOpen) return;
    const id = window.setTimeout(() => {
      chainSearchInputRef.current?.focus();
    }, 260);
    return () => window.clearTimeout(id);
  }, [chainSearchOpen]);

  // Auto-scroll the chain strip to the selected chip whenever it changes.
  // Keeps the active chain visible after picking a chain or reopening the
  // dropdown with a chain that lives further down the horizontally scrolled row.
  useEffect(() => {
    if (!isOpen) return;
    const id = window.setTimeout(() => {
      selectedChainChipRef.current?.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }, 80);
    return () => window.clearTimeout(id);
  }, [isOpen, currentChainId, chains.length]);

  // Re-center on search CLOSE only — picking a chain via search leaves the
  // selected chip outside the visible window once the full strip re-renders.
  // We deliberately don't scroll on search OPEN: the user is heading to the
  // search box, not back to the previously-selected chip — yanking the
  // viewport away from their target is jarring.
  const wasChainSearchOpenRef = useRef(false);
  useEffect(() => {
    const justClosed = wasChainSearchOpenRef.current && !chainSearchOpen;
    wasChainSearchOpenRef.current = chainSearchOpen;
    if (!isOpen || !justClosed) return;
    const id = window.setTimeout(() => {
      selectedChainChipRef.current?.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }, 80);
    return () => window.clearTimeout(id);
  }, [chainSearchOpen, isOpen]);

  // ---- Position the dropdown directly below the trigger ----
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxH: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!isOpen || !triggerEl) {
      setDropdownPos(null);
      return;
    }
    const compute = () => {
      const rect = triggerEl.getBoundingClientRect();
      const padding = 8;
      const viewportW = document.documentElement.clientWidth;
      const viewportH = document.documentElement.clientHeight;
      // Match the SWAP / BRIDGE card's column width when the popup is
      // embedded in a wide web view (full-screen mode hits ~1900px and the
      // dropdown would otherwise span the entire viewport). The Chrome
      // popup at ~360px is well under this cap so it stays unchanged.
      const MAX_DROPDOWN_W = 480;
      const width = Math.min(
        MAX_DROPDOWN_W,
        Math.max(220, viewportW - padding * 2),
      );
      let left = rect.left;
      if (left + width > viewportW - padding) left = viewportW - padding - width;
      if (left < padding) left = padding;
      const top = rect.bottom + 4;
      const maxH = Math.max(180, viewportH - top - padding);
      setDropdownPos({ top, left, width, maxH });
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [isOpen, triggerEl]);

  // Close on outside click or Escape — but ignore clicks on the trigger
  // itself (so the trigger's own onClick toggle keeps working).
  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (dropdownRef.current?.contains(target)) return;
      if (triggerEl && triggerEl.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, triggerEl, onClose]);

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

  // Chain-strip sort (same logic in both modes now): chains the user holds
  // a balance on float to the front (sorted by USD value desc); the rest
  // sort alphabetically by name. "Balance-first" was already the sell-mode
  // behaviour and the user wants the same priority in buy mode so destination
  // chains they already have funds on are surfaced first. No Ethereum pin —
  // if they hold ETH, it naturally floats up; if not, it lands in the
  // alphabetical group.
  const sortedChains = useMemo(() => {
    const withTotals = chains.map((c) => ({
      ...c,
      _total: portfolioByChain.get(c.chainId) ?? 0,
    }));
    withTotals.sort((a, b) => {
      const aHas = a._total > 0;
      const bHas = b._total > 0;
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (aHas && bHas) return b._total - a._total;
      return a.name.localeCompare(b.name);
    });
    return withTotals;
  }, [chains, portfolioByChain]);

  // Apply the inline chain-search filter. Case-insensitive substring on
  // chain name covers "abst"→Abstract, "eth"→Ethereum, etc. Bungee chainId
  // is also matchable for power users that know it offhand.
  const visibleChains = useMemo(() => {
    const term = chainSearchTerm.trim().toLowerCase();
    if (!term) return sortedChains;
    return sortedChains.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        String(c.chainId).includes(term),
    );
  }, [sortedChains, chainSearchTerm]);

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
      nativeMetaFromBungeeChain(currentChain) ??
      getNativeAssetMeta(currentChainId, networksInfo),
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
    if (!nativeAsset) return mapped;

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

  // Split holdings into "funded" (>= threshold) and "low value" (< threshold).
  // When the user is searching, skip the split — they're explicitly looking
  // for something and folding it behind a disclosure would be hostile.
  const { fundedHoldings, lowValueHoldings } = useMemo(() => {
    if (term) {
      return { fundedHoldings: filteredHoldings, lowValueHoldings: [] };
    }
    const funded: PortfolioToken[] = [];
    const lowValue: PortfolioToken[] = [];
    for (const h of filteredHoldings) {
      if (h.valueUsd >= LOW_VALUE_USD_THRESHOLD) funded.push(h);
      else lowValue.push(h);
    }
    return { fundedHoldings: funded, lowValueHoldings: lowValue };
  }, [filteredHoldings, term]);

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
            const { createPublicClient, http, erc20Abi, formatUnits } = await import("viem");
            const client = createPublicClient({ transport: http(rpcUrl, { timeout: 8000, retryCount: 0 }) });
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
    for (const h of holdingsOnChain) urls.push(h.logoUrl);
    for (const t of tokensAsPortfolio) urls.push(t.logoUrl);
    for (const t of popularTokens) urls.push(t.logoUrl);
    if (resolvedCustom) urls.push(resolvedCustom.token.logoUrl);
    return urls;
  }, [holdingsOnChain, tokensAsPortfolio, popularTokens, resolvedCustom]);
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

  const formatChainTotal = (n: number) => {
    if (n >= 1000) {
      return `$${(n / 1000).toFixed(n >= 10_000 ? 1 : 2)}K`;
    }
    if (n >= 1) return `$${n.toFixed(2)}`;
    return `<$1`;
  };

  if (!isOpen || !dropdownPos) return null;

  return (
    <Box
      ref={dropdownRef}
      position="fixed"
      top={`${dropdownPos.top}px`}
      left={`${dropdownPos.left}px`}
      w={`${dropdownPos.width}px`}
      maxH={`${dropdownPos.maxH}px`}
      bg="surface.base"
      border="2px solid"
      borderColor="border.default"
      borderRadius="lg"
      boxShadow="cardHover"
      zIndex={30}
      display="flex"
      flexDirection="column"
      overflow="hidden"
    >
          {/* Top: token search. Sits inside the dropdown (no separate modal
              wrapper); the trigger itself acts as the toggle. */}
          <Box p={2} borderBottom="2px solid" borderColor="border.default" flexShrink={0}>
            <InputGroup size="sm">
              <InputLeftElement pointerEvents="none">
                <Search2Icon color="text.tertiary" boxSize={3} />
              </InputLeftElement>
              <Input
                ref={tokenSearchRef}
                placeholder="Search or paste address"
                value={tokenSearch}
                onChange={(e) => setTokenSearch(e.target.value)}
                border="2px solid"
                borderColor="border.default"
                bg="surface.raised"
                fontSize="xs"
                fontWeight="600"
                pl={8}
                _focus={{ borderColor: "accent.secondary", boxShadow: "none" }}
              />
            </InputGroup>
          </Box>

          {/* Horizontal chain strip. Scrolls horizontally because vertical
              real estate is precious in the popup; chains are sorted by
              portfolio value (sell mode) so the user's chains gravitate to
              the visible-on-open prefix. The selected chip auto-scrolls into
              view via selectedChainChipRef. */}
          <Box
            borderBottom="2px solid"
            borderColor="border.default"
            overflowX="auto"
            overflowY="hidden"
            flexShrink={0}
            sx={{
              // Slim, theme-friendly horizontal scrollbar.
              "&::-webkit-scrollbar": { height: "6px" },
              "&::-webkit-scrollbar-thumb": {
                background: "var(--chakra-colors-border-default)",
                borderRadius: "3px",
              },
            }}
          >
            <HStack spacing={1.5} px={2} py={2} minW="max-content" align="stretch">
              {/* Leading chain-search affordance. Collapsed: a small search
                  icon button. When opened, an input pill grows to its right
                  via a width transition; chain chips re-flow / filter live. */}
              <HStack
                spacing={chainSearchOpen ? 1 : 0}
                flexShrink={0}
                border="2px solid"
                borderColor={
                  chainSearchOpen ? "accent.secondary" : "border.default"
                }
                bg="surface.raised"
                borderRadius="md"
                px={chainSearchOpen ? 2 : 1.5}
                py={1}
                transition="all 0.25s ease"
                cursor={chainSearchOpen ? "text" : "pointer"}
                onClick={() => {
                  if (!chainSearchOpen) setChainSearchOpen(true);
                }}
              >
                <Search2Icon
                  color="text.tertiary"
                  boxSize={3}
                  flexShrink={0}
                />
                <Box
                  w={chainSearchOpen ? "60px" : "0"}
                  overflow="hidden"
                  transition="width 0.25s ease"
                >
                  <Input
                    ref={chainSearchInputRef}
                    value={chainSearchTerm}
                    onChange={(e) => setChainSearchTerm(e.target.value)}
                    placeholder="Search chains"
                    variant="unstyled"
                    fontSize="2xs"
                    fontWeight="700"
                    textTransform="uppercase"
                    h="20px"
                    px={0}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setChainSearchTerm("");
                        setChainSearchOpen(false);
                      }
                    }}
                  />
                </Box>
                {chainSearchOpen && (
                  <CloseIcon
                    boxSize="8px"
                    color="text.tertiary"
                    cursor="pointer"
                    flexShrink={0}
                    onClick={(e) => {
                      // Stop bubble so the parent's open-on-click doesn't
                      // reopen us right after we close.
                      e.stopPropagation();
                      setChainSearchTerm("");
                      setChainSearchOpen(false);
                    }}
                    _hover={{ color: "text.primary" }}
                  />
                )}
              </HStack>

              {chainsLoading && (
                <HStack spacing={2} px={2}>
                  <Spinner size="xs" />
                  <Text fontSize="xs" color="text.tertiary" fontWeight="700">
                    Loading chains…
                  </Text>
                </HStack>
              )}
              {!chainsLoading && visibleChains.length === 0 && chainSearchTerm && (
                <Text
                  fontSize="2xs"
                  color="text.tertiary"
                  fontWeight="700"
                  px={2}
                  py={1.5}
                  alignSelf="center"
                >
                  No chain matches "{chainSearchTerm}"
                </Text>
              )}
              {!chainsLoading &&
                visibleChains.map((c) => {
                  const total = portfolioByChain.get(c.chainId);
                  const isSelected = c.chainId === currentChainId;
                  return (
                    <HStack
                      key={c.chainId}
                      ref={isSelected ? selectedChainChipRef : undefined}
                      as="button"
                      flexShrink={0}
                      spacing={1.5}
                      px={2.5}
                      py={1.5}
                      border="2px solid"
                      borderColor={isSelected ? "accent.secondary" : "border.default"}
                      bg={isSelected ? "surface.sunken" : "surface.raised"}
                      borderRadius="md"
                      cursor="pointer"
                      _hover={{ borderColor: "accent.secondary" }}
                      onClick={() => {
                        setCurrentChainId(c.chainId);
                        // If the user found this chain via search, auto-close
                        // + clear the search input. The close-only scroll
                        // effect then recenters the selected chip in the full
                        // un-filtered strip.
                        if (chainSearchOpen) {
                          setChainSearchTerm("");
                          setChainSearchOpen(false);
                        }
                        // Hand keyboard focus to the token search so the user
                        // can immediately type to filter the freshly-loaded
                        // token list without a second click.
                        window.setTimeout(() => {
                          tokenSearchRef.current?.focus();
                        }, 0);
                      }}
                    >
                      <ChainStripLogo chain={c} themeId={themeId} />
                      <Text fontSize="2xs" fontWeight="800" textTransform="uppercase">
                        {c.name}
                      </Text>
                      {total !== undefined && total > 0 && (
                        <Text
                          fontSize="2xs"
                          fontWeight="700"
                          color="text.tertiary"
                          fontFamily="mono"
                        >
                          {formatChainTotal(total)}
                        </Text>
                      )}
                    </HStack>
                  );
                })}
            </HStack>
          </Box>

          {/* Tokens — full width below the strip. */}
          <Box flex={1} overflowY="auto" minH={0}>
              {/* Trending chips */}
              {popularTokens.length > 0 && (
                <Box px={3} pt={3} pb={2}>
                  <HStack spacing={1.5} mb={1.5}>
                    {currentChain && (
                      <ChainStripLogo
                        chain={currentChain}
                        themeId={themeId}
                        size="12px"
                      />
                    )}
                    <Text
                      fontSize="2xs"
                      fontWeight="800"
                      color="text.tertiary"
                      textTransform="uppercase"
                    >
                      Popular Tokens on {currentChainName}
                    </Text>
                  </HStack>
                  <HStack spacing={1.5} wrap="wrap">
                    {popularTokens.map((t) => {
                      const addr = t.contractAddress === "native"
                        ? NATIVE_TOKEN_ADDRESS
                        : t.contractAddress;
                      const sel = isSelectedAddr(addr);
                      return (
                        <HStack
                          key={addr}
                          as="button"
                          spacing={1}
                          px={2}
                          py={1}
                          border="2px solid"
                          borderColor={sel ? "accent.secondary" : "border.default"}
                          borderRadius="md"
                          bg={sel ? "surface.raisedHover" : "surface.raised"}
                          _hover={{ borderColor: "accent.secondary" }}
                          onClick={() => handlePickToken(t)}
                        >
                          {t.logoUrl ? (
                            <Image
                              src={resolveLogo(t.logoUrl)}
                              alt={t.symbol}
                              boxSize="16px"
                              borderRadius="full"
                              fallback={
                                <TokenSymbolFallback
                                  symbol={t.symbol}
                                  size="16px"
                                  nativeChainId={t.contractAddress === "native" ? t.chainId : undefined}
                                  nativeChainName={currentChainName}
                                />
                              }
                            />
                          ) : (
                            <TokenSymbolFallback
                              symbol={t.symbol}
                              size="16px"
                              nativeChainId={t.contractAddress === "native" ? t.chainId : undefined}
                              nativeChainName={currentChainName}
                            />
                          )}
                          <Text fontSize="xs" fontWeight="700" textTransform="uppercase">
                            {t.symbol}
                          </Text>
                          {t.valueUsd > 0 && (
                            <Text
                              fontSize="2xs"
                              fontWeight="700"
                              color="text.tertiary"
                              fontFamily="mono"
                            >
                              {formatChainTotal(t.valueUsd)}
                            </Text>
                          )}
                        </HStack>
                      );
                    })}
                  </HStack>
                </Box>
              )}

              {/* Custom-address resolution row (highlighted) */}
              {customLoading && isAddressSearch && (
                <HStack px={3} py={3} spacing={2} justify="center">
                  <Spinner size="xs" color="accent.secondary" />
                  <Text fontSize="xs" fontWeight="700" color="text.tertiary">
                    Loading token…
                  </Text>
                </HStack>
              )}
              {customError && !customLoading && isAddressSearch && (
                <Box px={3} py={2}>
                  <Text fontSize="xs" fontWeight="700" color="chart.negative">
                    {customError}
                  </Text>
                </Box>
              )}
              {resolvedCustom && !customLoading && isAddressSearch && (
                <HStack
                  px={3}
                  py={2}
                  cursor="pointer"
                  bg="accent.highlight"
                  color="accentFg.highlight"
                  _hover={{ filter: "brightness(0.85)" }}
                  onClick={() => handlePickToken(resolvedCustom.token)}
                  spacing={2}
                >
                  {resolvedCustom.token.logoUrl ? (
                    <Image
                      src={resolveLogo(resolvedCustom.token.logoUrl)}
                      alt={resolvedCustom.token.symbol}
                      boxSize="20px"
                      borderRadius="full"
                      fallback={
                        <TokenSymbolFallback
                          symbol={resolvedCustom.token.symbol}
                          size="20px"
                        />
                      }
                    />
                  ) : (
                    <TokenSymbolFallback
                      symbol={resolvedCustom.token.symbol}
                      size="20px"
                    />
                  )}
                  <Box flex={1} minW={0}>
                    <Text
                      fontWeight="700"
                      fontSize="sm"
                      textTransform="uppercase"
                      isTruncated
                      lineHeight="short"
                    >
                      {resolvedCustom.token.symbol}
                    </Text>
                    <Text
                      fontSize="2xs"
                      color="accentFg.highlight"
                      opacity={0.75}
                      fontFamily="mono"
                      isTruncated
                      lineHeight="short"
                    >
                      {formatTokenBalance(resolvedCustom.token.balance)}
                    </Text>
                  </Box>
                  <Text fontSize="xs" color="accentFg.highlight" fontWeight="700">
                    Choose
                  </Text>
                </HStack>
              )}

              {/* "Your Tokens" — funded holdings first; low-value (< $0.10)
                  tokens collapse into a disclosure row so Base wallets full
                  of airdropped spam don't bury the funded tokens. */}
              {filteredHoldings.length > 0 && (() => {
                const renderHoldingRow = (h: PortfolioToken) => {
                  const addr = h.contractAddress === "native"
                    ? NATIVE_TOKEN_ADDRESS
                    : h.contractAddress;
                  return (
                    <HStack
                      key={`held-${h.contractAddress}`}
                      px={3}
                      py={1.5}
                      cursor="pointer"
                      bg={isSelectedAddr(addr) ? "surface.sunken" : "transparent"}
                      _hover={{ bg: "surface.raisedHover" }}
                      onClick={() => handlePickToken(h)}
                      spacing={2}
                    >
                      {h.logoUrl ? (
                        <Image
                          src={resolveLogo(h.logoUrl)}
                          alt={h.symbol}
                          boxSize="22px"
                          borderRadius="full"
                          fallback={
                            <TokenSymbolFallback
                              symbol={h.symbol}
                              size="22px"
                              nativeChainId={h.contractAddress === "native" ? h.chainId : undefined}
                              nativeChainName={currentChainName}
                            />
                          }
                        />
                      ) : (
                        <TokenSymbolFallback
                          symbol={h.symbol}
                          size="22px"
                          nativeChainId={h.contractAddress === "native" ? h.chainId : undefined}
                          nativeChainName={currentChainName}
                        />
                      )}
                      <Box flex={1} minW={0}>
                        <Text
                          fontWeight="700"
                          fontSize="sm"
                          textTransform="uppercase"
                          isTruncated
                          lineHeight="short"
                        >
                          {h.symbol}
                        </Text>
                        <Text
                          fontSize="2xs"
                          color="text.tertiary"
                          fontFamily="mono"
                          isTruncated
                          lineHeight="short"
                        >
                          {h.contractAddress === "native"
                            ? h.name
                            : truncateAddress(h.contractAddress)}
                        </Text>
                      </Box>
                      <Box textAlign="right" flexShrink={0}>
                        <Text fontSize="xs" fontWeight="700" lineHeight="short">
                          {formatTokenBalance(h.balance)}
                        </Text>
                        {h.valueUsd > 0 && (
                          <Text fontSize="2xs" color="text.tertiary" lineHeight="short">
                            ${h.valueUsd.toFixed(2)}
                          </Text>
                        )}
                      </Box>
                    </HStack>
                  );
                };
                return (
                  <Box>
                    <HStack spacing={1.5} px={3} pt={2} pb={1}>
                      {currentChain && (
                        <ChainStripLogo
                          chain={currentChain}
                          themeId={themeId}
                          size="12px"
                        />
                      )}
                      <Text
                        fontSize="2xs"
                        fontWeight="800"
                        color="text.tertiary"
                        textTransform="uppercase"
                      >
                        Your Tokens on {currentChainName}
                      </Text>
                    </HStack>
                    {fundedHoldings.map(renderHoldingRow)}
                    {lowValueHoldings.length > 0 && (
                      <>
                        <HStack
                          as="button"
                          w="full"
                          px={3}
                          py={2}
                          spacing={1.5}
                          cursor="pointer"
                          bg="transparent"
                          _hover={{ bg: "surface.raisedHover" }}
                          onClick={() => setShowLowValue((v) => !v)}
                          borderTop={fundedHoldings.length > 0 ? "1px dashed" : undefined}
                          borderColor="border.subtle"
                        >
                          {showLowValue ? (
                            <ChevronDownIcon color="text.tertiary" boxSize={3.5} />
                          ) : (
                            <ChevronRightIcon color="text.tertiary" boxSize={3.5} />
                          )}
                          <Text
                            fontSize="2xs"
                            fontWeight="800"
                            color="text.tertiary"
                            textTransform="uppercase"
                          >
                            Low value tokens ({lowValueHoldings.length})
                          </Text>
                        </HStack>
                        {showLowValue && lowValueHoldings.map(renderHoldingRow)}
                      </>
                    )}
                  </Box>
                );
              })()}

              {/* All tokens header — show even when skeleton-loading so the
                  user sees an immediate visual cue that the chain switch
                  registered, rather than a header-less spinner. */}
              {(filteredRest.length > 0 || tokensStale || tokensLoading) && (
                <HStack spacing={1.5} px={3} pt={3} pb={1}>
                  {currentChain && (
                    <ChainStripLogo
                      chain={currentChain}
                      themeId={themeId}
                      size="12px"
                    />
                  )}
                  <Text
                    fontSize="2xs"
                    fontWeight="800"
                    color="text.tertiary"
                    textTransform="uppercase"
                  >
                    Tokens on {currentChainName}
                  </Text>
                </HStack>
              )}

              {/* Skeleton rows render the instant chain changes — driven by
                  `tokensStale` (currentChainId !== tokensChainId), not by
                  the slow `tokensLoading` flag, so there's never a gap of
                  stale-rows after a chain pick. */}
              {(tokensStale || (tokensLoading && filteredRest.length === 0)) && (
                <VStack spacing={0} align="stretch">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <TokenRowSkeleton key={`tok-skel-${i}`} />
                  ))}
                </VStack>
              )}

              {filteredRest.map((t) => {
                const addr = t.contractAddress === "native"
                  ? NATIVE_TOKEN_ADDRESS
                  : t.contractAddress;
                return (
                  <HStack
                    key={addr}
                    px={3}
                    py={1.5}
                    cursor="pointer"
                    bg={isSelectedAddr(addr) ? "surface.sunken" : "transparent"}
                    _hover={{ bg: "surface.raisedHover" }}
                    onClick={() => handlePickToken(t)}
                    spacing={2}
                  >
                    {t.logoUrl ? (
                      <Image
                        src={resolveLogo(t.logoUrl)}
                        alt={t.symbol}
                        boxSize="22px"
                        borderRadius="full"
                        fallback={
                          <TokenSymbolFallback
                            symbol={t.symbol}
                            size="22px"
                            nativeChainId={t.contractAddress === "native" ? t.chainId : undefined}
                            nativeChainName={currentChainName}
                          />
                        }
                      />
                    ) : (
                      <TokenSymbolFallback
                        symbol={t.symbol}
                        size="22px"
                        nativeChainId={t.contractAddress === "native" ? t.chainId : undefined}
                        nativeChainName={currentChainName}
                      />
                    )}
                    <Box flex={1} minW={0}>
                      <Text
                        fontWeight="700"
                        fontSize="sm"
                        textTransform="uppercase"
                        isTruncated
                        lineHeight="short"
                      >
                        {t.symbol}
                      </Text>
                      <Text fontSize="2xs" color="text.tertiary" isTruncated lineHeight="short">
                        {t.name}
                      </Text>
                    </Box>
                    {t.contractAddress !== "native" && (
                      <Text
                        fontSize="2xs"
                        color="text.tertiary"
                        fontFamily="mono"
                        flexShrink={0}
                      >
                        {truncateAddress(t.contractAddress)}
                      </Text>
                    )}
                  </HStack>
                );
              })}

              {!tokensLoading &&
                filteredHoldings.length === 0 &&
                filteredRest.length === 0 &&
                !resolvedCustom &&
                !customLoading &&
                !customError && (
                  <Box px={3} py={6}>
                    <Text fontSize="xs" color="text.tertiary" textAlign="center" fontWeight="700">
                      {term ? "No tokens match" : `No tokens on ${currentChainName}`}
                    </Text>
                  </Box>
                )}
          </Box>
    </Box>
  );
}

/**
 * Chain logo for the horizontal chain strip. Prefers the icon URL Bungee
 * returns (covers far more chains than our local CHAIN_REGISTRY + alias
 * map) and falls through to ChainIcon (deterministic initials) when Bungee
 * doesn't provide one.
 *
 * Background:
 * - When the API marks a chain with `bgColor` (curated for dark-glyph-on-
 *   transparent SVGs like Linea / zkSync), paint a same-size circle behind
 *   the icon so the glyph stays legible on Midnight surfaces.
 * - Otherwise no backdrop — opaque-circular logos (Berachain, Optimism,
 *   etc.) paint themselves cleanly and don't need a white ring that would
 *   spill around their edges.
 */
/**
 * Skeleton row mirroring the real token row layout (22px avatar + 2 stacked
 * text lines + right-side balance placeholder). Rendered the instant the
 * user picks a new chain so previous-chain tokens never linger while the
 * cross-chain fetch is in flight.
 */
function TokenRowSkeleton() {
  return (
    <HStack px={3} py={1.5} spacing={2}>
      <SkeletonCircle size="22px" />
      <Box flex={1} minW={0}>
        <Skeleton h="10px" w="55%" mb={1} borderRadius="sm" />
        <Skeleton h="8px" w="35%" borderRadius="sm" />
      </Box>
      <Box textAlign="right" flexShrink={0}>
        <Skeleton h="10px" w="40px" borderRadius="sm" />
      </Box>
    </HStack>
  );
}

function ChainStripLogo({
  chain,
  themeId,
  size = "16px",
}: {
  chain: EnrichedBridgeChain;
  themeId: string;
  size?: string;
}) {
  const iconUrl = chain.icon ?? chain.logoURI;
  if (!iconUrl) {
    // No URL from Bungee → ChainIcon paints initials in a colored box.
    return (
      <ChainIcon chainId={chain.chainId} chainName={chain.name} size={size} withChip />
    );
  }
  // Suppress unused-var warning in light theme builds — kept for future use
  // (e.g., a curated bg color hint that should only apply in dark mode).
  void themeId;
  return (
    <Box
      position="relative"
      boxSize={size}
      borderRadius="full"
      bg={chain.bgColor}
      flexShrink={0}
      overflow="hidden"
    >
      <Image
        src={iconUrl}
        alt={chain.name}
        boxSize={size}
        borderRadius="full"
        fallback={
          <ChainIcon chainId={chain.chainId} chainName={chain.name} size={size} withChip />
        }
      />
    </Box>
  );
}
