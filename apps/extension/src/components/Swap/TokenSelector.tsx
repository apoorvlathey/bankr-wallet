import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import type { TokenListEntry } from "@/chrome/swapApi";
import { getNativeAssetMeta } from "@/lib/chains";
import { chainHasNativeToken } from "@/constants/chainRegistry";
import { useNetworks } from "@/contexts/NetworksContext";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";
import { FullScreenPickerLayer } from "@/components/FullScreenPickerLayer";
import { TokenPickerContent } from "@/components/Swap/TokenPickerContent";
import { TOKEN_PICKER_PAGE_SIZE } from "@/chrome/portfolio/consumerPolicy";
import { NetworkSelectorScreen } from "@/components/shared/NetworkSelector";
import { TokenSelectorTrigger } from "./TokenSelectorTrigger";
import type { TokenSelectorProps } from "./TokenSelectorTypes";
const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
/** Popular token symbols per chain — same list as BuyTokenSelector so the
 *  buy/sell dropdowns offer parity. */
const POPULAR_PER_CHAIN: Record<number, string[]> = {
  1: ["ETH", "USDC", "USDT", "WBTC", "WETH"],
  42161: ["ETH", "USDC", "USDT", "WETH"],
  8453: ["ETH", "USDC", "USDT", "WBTC"],
  56: ["BNB", "USDC", "USDT", "WBTC", "WETH"],
  137: ["POL", "USDC", "WETH"],
  130: ["ETH", "USDC", "WBTC", "WETH"],
};
function entryToPortfolioToken(
  t: TokenListEntry,
  chainId: number,
): PortfolioToken {
  const isNative =
    t.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
  return {
    contractAddress: isNative ? "native" : t.address,
    name: t.name,
    symbol: t.symbol,
    decimals: t.decimals,
    balance: "0",
    balanceFormatted: "0",
    logoUrl: t.logoURI,
    valueUsd: 0,
    priceUsd: 0,
    chainId,
  };
}
export default function TokenSelector({
  holdings,
  tokenList,
  selectedToken,
  onSelect,
  excludeAddress,
  chainId,
  onCustomAddress,
  onSelectCustomToken,
  resolvedCustomToken,
  customTokenLoading,
  customTokenError,
  chainName,
  triggerContentAlign = "left",
  isLoadingHoldings = false,
  onOpenChange,
  networkOptions,
  onSelectChain,
}: TokenSelectorProps) {
  const { networksInfo } = useNetworks();
  const [isOpen, setIsOpen] = useState(false);
  const [panel, setPanel] = useState<"tokens" | "chains">("tokens");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(TOKEN_PICKER_PAGE_SIZE);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const lastSubmittedRef = useRef("");
  const searchTerm = search.trim().toLowerCase();
  const excludeLower = excludeAddress?.toLowerCase();
  const closeDropdown = useCallback((restoreFocus = true) => {
    setIsOpen(false);
    setPanel("tokens");
    setSearch("");
    onOpenChange?.(false);
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }, [onOpenChange]);
  const handleTriggerClick = () => {
    setPanel("tokens");
    setIsOpen(true);
    onOpenChange?.(true);
  };
  useEffect(() => {
    if (isOpen) {
      setVisibleCount(TOKEN_PICKER_PAGE_SIZE);
      lastSubmittedRef.current = "";
      const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 50);
      return () => window.clearTimeout(focusTimer);
    }
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen || panel !== "tokens") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDropdown();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeDropdown, isOpen, panel]);

  useEffect(() => {
    setVisibleCount(TOKEN_PICKER_PAGE_SIZE);
  }, [searchTerm]);

  // Auto-resolve when a valid address is typed/pasted
  useEffect(() => {
    const val = search.trim();
    if (
      /^0x[a-fA-F0-9]{40}$/.test(val) &&
      onCustomAddress &&
      val !== lastSubmittedRef.current
    ) {
      lastSubmittedRef.current = val;
      onCustomAddress(val);
    }
  }, [search, onCustomAddress]);

  const heldAddresses = useMemo(() => {
    const set = new Set<string>();
    for (const h of holdings) {
      if (h.contractAddress === "native") {
        set.add(NATIVE_TOKEN_ADDRESS.toLowerCase());
      } else {
        set.add(h.contractAddress.toLowerCase());
      }
    }
    return set;
  }, [holdings]);

  const restTokens = useMemo(
    () =>
      tokenList
        .filter(
          (t) =>
            (chainHasNativeToken(chainId) ||
              t.address.toLowerCase() !== NATIVE_TOKEN_ADDRESS.toLowerCase()) &&
            !heldAddresses.has(t.address.toLowerCase()) &&
            t.address.toLowerCase() !== excludeLower,
        )
        .sort((a, b) => a.symbol.localeCompare(b.symbol)),
    [tokenList, heldAddresses, excludeLower, chainId],
  );

  const filteredHoldings = useMemo(() => {
    const base = holdings.filter((h) => {
      const addr =
        h.contractAddress === "native"
          ? NATIVE_TOKEN_ADDRESS.toLowerCase()
          : h.contractAddress.toLowerCase();
      return addr !== excludeLower;
    });
    if (!searchTerm) return base;
    return base.filter(
      (h) =>
        h.symbol.toLowerCase().includes(searchTerm) ||
        h.name.toLowerCase().includes(searchTerm) ||
        h.contractAddress.toLowerCase().includes(searchTerm),
    );
  }, [holdings, searchTerm, excludeLower]);

  const filteredRest = useMemo(() => {
    if (!searchTerm) return restTokens;
    return restTokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(searchTerm) ||
        t.name.toLowerCase().includes(searchTerm) ||
        t.address.toLowerCase().includes(searchTerm),
    );
  }, [restTokens, searchTerm]);

  const visibleRest = useMemo(
    () => filteredRest.slice(0, visibleCount),
    [filteredRest, visibleCount],
  );
  const visibleHoldings = useMemo(
    () => filteredHoldings.slice(0, visibleCount),
    [filteredHoldings, visibleCount],
  );

  // Popular tokens: ordered per-chain list, matched against holdings + token
  // list, with native token pinned to our canonical icon.
  const popularTokens = useMemo(() => {
    if (searchTerm) return [];

    const bySymbol = new Map<string, PortfolioToken>();
    for (const h of holdings) {
      const sym = h.symbol.toUpperCase();
      if (!bySymbol.has(sym)) bySymbol.set(sym, h);
    }
    for (const t of tokenList) {
      const sym = t.symbol.toUpperCase();
      if (!bySymbol.has(sym)) bySymbol.set(sym, entryToPortfolioToken(t, chainId));
    }

    // Native token: ensure presence + override its logo via getNativeAssetMeta
    // (custom-chain-aware; portfolio-API native logos can come back missing).
    const native = chainHasNativeToken(chainId)
      ? getNativeAssetMeta(chainId, networksInfo)
      : null;
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
        chainId: existing?.chainId ?? chainId,
      });
    }

    // Curated list for built-in chains; for chains we don't curate (custom
    // chains, etc.) fall back to showing at least the native token.
    const symbols =
      POPULAR_PER_CHAIN[chainId] ?? (native ? [native.symbol.toUpperCase()] : []);

    const result: PortfolioToken[] = [];
    for (const sym of symbols) {
      const entry = bySymbol.get(sym);
      if (!entry) continue;
      const addr =
        entry.contractAddress === "native"
          ? NATIVE_TOKEN_ADDRESS
          : entry.contractAddress;
      if (addr.toLowerCase() === excludeLower) continue;
      result.push(entry);
    }
    return result;
  }, [tokenList, holdings, excludeLower, searchTerm, chainId, networksInfo]);

  // Keep the closed trigger cheap, then warm only currently rendered rows.
  const cachedLogoMap = useCachedAvatarMap(
    useMemo(() => {
      const urls: Array<string | null | undefined> = [];
      if (selectedToken?.logoUrl) urls.push(selectedToken.logoUrl);
      if (!isOpen) return urls;

      for (const h of visibleHoldings) urls.push(h.logoUrl);
      for (const t of popularTokens) urls.push(t.logoUrl);
      for (const t of visibleRest) urls.push(t.logoURI);
      if (resolvedCustomToken?.logoUrl) urls.push(resolvedCustomToken.logoUrl);
      return urls;
    }, [
      selectedToken?.logoUrl,
      isOpen,
      visibleHoldings,
      popularTokens,
      visibleRest,
      resolvedCustomToken?.logoUrl,
    ]),
  );
  const resolveLogo = (url: string | undefined): string | undefined =>
    (url && cachedLogoMap.get(url)) || url;

  const handleSelectHolding = (h: PortfolioToken) => {
    onSelect(h);
    closeDropdown();
  };

  const handleSelectListEntry = (t: TokenListEntry) => {
    onSelect(entryToPortfolioToken(t, chainId));
    closeDropdown();
  };

  const handleSelectPortfolio = (p: PortfolioToken) => {
    onSelect(p);
    closeDropdown();
  };

  const handleOpenNetworkPicker = () => {
    setSearch("");
    setPanel("chains");
  };

  const handleSelectChain = (nextChainId: number | null) => {
    if (nextChainId === null || !onSelectChain) return;
    if (nextChainId !== chainId) onSelectChain(nextChainId);
    setSearch("");
    setPanel("tokens");
    window.setTimeout(() => inputRef.current?.focus(), 30);
  };

  const isSelectedAddr = (addr: string) => {
    if (!selectedToken) return false;
    const selAddr =
      selectedToken.contractAddress === "native"
        ? NATIVE_TOKEN_ADDRESS
        : selectedToken.contractAddress;
    return selAddr.toLowerCase() === addr.toLowerCase();
  };

  const hasResults =
    filteredHoldings.length > 0 || filteredRest.length > 0;
  const isAddressSearch = /^0x[a-fA-F0-9]{40}$/.test(search.trim());

  return (
    <>
      <TokenSelectorTrigger
        triggerRef={triggerRef}
        isOpen={isOpen}
        selectedToken={selectedToken}
        resolveLogo={resolveLogo}
        contentAlign={triggerContentAlign}
        onClick={handleTriggerClick}
      />

      {isOpen && (
        <FullScreenPickerLayer>
          {panel === "chains" && networkOptions && onSelectChain ? (
            <NetworkSelectorScreen
              title="Select send chain"
              networks={networkOptions}
              selectedChainId={chainId}
              onSelect={handleSelectChain}
              onBack={() => {
                setPanel("tokens");
                window.setTimeout(() => inputRef.current?.focus(), 30);
              }}
            />
          ) : (
            <TokenPickerContent
              inputRef={inputRef}
              search={search}
              onSearchChange={setSearch}
              onBack={() => closeDropdown()}
              popularTokens={popularTokens}
              visibleHoldings={visibleHoldings}
              visibleRest={visibleRest}
              remainingTokenCount={
                Math.max(0, filteredHoldings.length - visibleHoldings.length) +
                Math.max(0, filteredRest.length - visibleRest.length)
              }
              onShowMore={() =>
                setVisibleCount((count) => count + TOKEN_PICKER_PAGE_SIZE)
              }
              onSelectHolding={handleSelectHolding}
              onSelectListEntry={handleSelectListEntry}
              onSelectPortfolio={handleSelectPortfolio}
              isSelectedAddress={isSelectedAddr}
              resolveLogo={resolveLogo}
              customTokenLoading={customTokenLoading}
              customTokenError={customTokenError}
              resolvedCustomToken={resolvedCustomToken}
              onSelectResolvedCustomToken={
                resolvedCustomToken && onSelectCustomToken
                  ? () => {
                      onSelectCustomToken(resolvedCustomToken);
                      closeDropdown();
                    }
                  : undefined
              }
              isAddressSearch={isAddressSearch}
              isLoadingHoldings={isLoadingHoldings}
              hasResults={hasResults}
              chainId={chainId}
              chainName={chainName}
              onOpenNetworkPicker={
                networkOptions && onSelectChain
                  ? handleOpenNetworkPicker
                  : undefined
              }
            />
          )}
        </FullScreenPickerLayer>
      )}
    </>
  );
}
