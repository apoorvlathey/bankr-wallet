import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Image,
  Skeleton,
  IconButton,
  Tooltip,
} from "@chakra-ui/react";
import { CheckIcon, CopyIcon, ExternalLinkIcon, RepeatIcon, ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import { useDisclosure } from "@chakra-ui/react";
import { PortfolioToken, DefiPosition } from "@/chrome/portfolioApi";
import { fetchOnchainBalances } from "@/chrome/onchainBalances";
import { loadPortfolioTokenCatalog } from "@/chrome/portfolioTokens";
import { recordSnapshot } from "@/chrome/portfolioSnapshotStorage";
import { getChainConfig } from "@/constants/chainConfig";
import { getChainEnvironmentLabel } from "@/lib/chainIcons";
import EditCustomTokenModal from "@/components/EditCustomTokenModal";
import ChainIcon from "@/components/ChainIcon";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById, getVisibleChains } from "@/lib/chains";
import { Decorator } from "@/theme";
import { formatUsd as formatUsdShared } from "@/lib/currencyFormatUtils";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";

// Module-level cache so navigating away and back to the homepage doesn't flash
// a skeleton. We seed state from here on mount and refetch in the background.
interface HoldingsSnapshot {
  tokens: PortfolioToken[];
  defiPositions: DefiPosition[];
  totalValueUsd: number;
  customTokenKeys: Set<string>;
  rpcIssueChainIds: number[];
  apiUnavailable: boolean;
  timestamp: number;
}
const holdingsCache = new Map<string, HoldingsSnapshot>();
const holdingsCacheKey = (address: string, reloadKey: string) =>
  `${address.toLowerCase()}|${reloadKey}`;

interface TokenHoldingsProps {
  address: string;
  onTokenClick?: (token: PortfolioToken) => void;
  onSwapClick?: (token: PortfolioToken) => void;
  hideHeader?: boolean;
  hideCard?: boolean;
  onRpcIssuesChange?: (chainIds: number[]) => void;
  filterChainId?: number | null;
  onStateChange?: (state: {
    totalValueUsd: number;
    loading: boolean;
    hideValue: boolean;
    toggleHideValue: () => void;
    refresh: () => void;
    tokenKeys: Set<string>;
    apiUnavailable: boolean;
  }) => void;
}

function TokenHoldings({ address, onTokenClick, onSwapClick, hideHeader, hideCard, onRpcIssuesChange, filterChainId, onStateChange }: TokenHoldingsProps) {
  const { networksInfo } = useNetworks();
  const chainReloadKey = useMemo(
    () =>
      getVisibleChains(networksInfo)
        .map(
          (chain) =>
            `${chain.chainId}:${chain.name}:${chain.rpcUrl}:${chain.nativeCurrency.symbol}:${chain.hidden}`,
        )
        .sort()
        .join("|"),
    [networksInfo],
  );
  // Hydrate from the module cache so the homepage doesn't flash a skeleton
  // every time the user navigates back. The background refetch in the effect
  // below keeps the data fresh.
  const initialSnapshot = holdingsCache.get(holdingsCacheKey(address, chainReloadKey));
  const [tokens, setTokens] = useState<PortfolioToken[]>(() => initialSnapshot?.tokens ?? []);
  const [defiPositions, setDefiPositions] = useState<DefiPosition[]>(() => initialSnapshot?.defiPositions ?? []);
  const [totalValueUsd, setTotalValueUsd] = useState(() => initialSnapshot?.totalValueUsd ?? 0);
  const [loading, setLoading] = useState(() => !initialSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [hideValue, setHideValue] = useState(false);
  const [lastFetched, setLastFetched] = useState(() => initialSnapshot?.timestamp ?? 0);
  const [customTokenKeys, setCustomTokenKeys] = useState<Set<string>>(() => initialSnapshot?.customTokenKeys ?? new Set());
  const [apiUnavailable, setApiUnavailable] = useState(() => initialSnapshot?.apiUnavailable ?? false);
  const [editingToken, setEditingToken] = useState<PortfolioToken | null>(null);
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const editModal = useDisclosure();

  // Load hide preference
  useEffect(() => {
    chrome.storage.sync.get("hidePortfolioValue", (result) => {
      if (result.hidePortfolioValue) setHideValue(true);
    });
  }, []);

  const toggleHideValue = () => {
    const newVal = !hideValue;
    setHideValue(newVal);
    chrome.storage.sync.set({ hidePortfolioValue: newVal });
  };

  // Stable refs for callbacks to avoid triggering effect on every render
  const toggleHideValueRef = useRef(toggleHideValue);
  toggleHideValueRef.current = toggleHideValue;

  const loadPortfolio = useCallback(
    async (force = false) => {
      if (!address) return;
      // Cache for 60s unless forced
      if (!force && Date.now() - lastFetched < 60_000 && tokens.length > 0) return;

      // Only show the skeleton when we have nothing on screen yet. If we're
      // revalidating cached data, keep the old values visible until the fresh
      // ones land so the homepage feels instantly ready.
      const hasExistingData = tokens.length > 0;
      if (!hasExistingData) {
        setLoading(true);
      }
      setError(null);

      try {
        const catalog = await loadPortfolioTokenCatalog(address);
        const mergedTokens = catalog.tokens;

        setCustomTokenKeys(catalog.customTokenKeys);
        setApiUnavailable(catalog.apiUnavailable);

        // Hide tokens whose balance is still 0 in the catalog. The catalog
        // injects a native placeholder per visible chain (so onchain balance
        // resolution has something to fetch for) but those placeholders show
        // up as a row of "0 ETH / $0" entries that vanish a second later
        // when RPC reports the real balance — a flicker the user definitely
        // notices. Render only the tokens we already know are non-zero, then
        // let `fetchOnchainBalances` (still receiving the full `mergedTokens`)
        // fill the rest in.
        const knownNonZeroTokens = mergedTokens.filter(
          (t) => parseFloat(t.balance) > 0,
        );

        // Show merged data immediately so user isn't stuck on skeleton loader
        setTokens(knownNonZeroTokens);
        setDefiPositions(catalog.defiPositions || []);
        setTotalValueUsd(catalog.totalValueUsd);
        // Only flip out of the skeleton state if we already have something
        // to render. When the portfolio API is down (or returned nothing
        // useful), `knownNonZeroTokens` is empty and the onchain pass is
        // about to fill in native balances — flipping `loading` off here
        // would briefly show "No tokens found" until that pass resolves.
        const hasInitialContent =
          knownNonZeroTokens.length > 0 ||
          (catalog.defiPositions || []).length > 0;
        if (hasInitialContent) setLoading(false);
        const fetchedAt = Date.now();
        setLastFetched(fetchedAt);
        const cacheKey = holdingsCacheKey(address, chainReloadKey);

        // Enhance with onchain balances in the background.
        // If RPCs are rate-limited or slow, user already sees API values.
        try {
          const onchain = await fetchOnchainBalances(address, mergedTokens);
          onRpcIssuesChange?.(onchain.rpcIssueChainIds);
          setTokens(onchain.tokens);
          setLoading(false);
          // Total = onchain corrected wallet tokens + DeFi positions
          const defiTotal = (catalog.defiPositions || []).reduce((s: number, p: DefiPosition) => s + p.valueUsd, 0);
          const total = onchain.totalValueUsd + defiTotal;
          setTotalValueUsd(total);
          holdingsCache.set(cacheKey, {
            tokens: onchain.tokens,
            defiPositions: catalog.defiPositions || [],
            totalValueUsd: total,
            customTokenKeys: catalog.customTokenKeys,
            rpcIssueChainIds: onchain.rpcIssueChainIds,
            apiUnavailable: catalog.apiUnavailable,
            timestamp: fetchedAt,
          });
          // Record snapshot with onchain enhanced value
          recordSnapshot(address, total).catch(() => {});
        } catch (err) {
          onRpcIssuesChange?.([]);
          setLoading(false);
          // RPC failed entirely — keep only the known non-zero tokens in
          // the cache too, so a refresh from cache doesn't bring back the
          // zero-balance placeholder rows we just suppressed.
          holdingsCache.set(cacheKey, {
            tokens: knownNonZeroTokens,
            defiPositions: catalog.defiPositions || [],
            totalValueUsd: catalog.totalValueUsd,
            customTokenKeys: catalog.customTokenKeys,
            rpcIssueChainIds: [],
            apiUnavailable: catalog.apiUnavailable,
            timestamp: fetchedAt,
          });
          // Record snapshot with API-only value
          recordSnapshot(address, catalog.totalValueUsd).catch(() => {});
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load portfolio");
        onRpcIssuesChange?.([]);
        setLoading(false);
      }
    },
    [address, chainReloadKey, lastFetched, onRpcIssuesChange, tokens.length]
  );

  // Reload when address or the set of visible chains changes. Seed from the
  // module cache if we have a snapshot for this (address, chains) pair so the
  // list doesn't flash empty before the refetch completes.
  useEffect(() => {
    const cached = holdingsCache.get(holdingsCacheKey(address, chainReloadKey));
    if (cached) {
      setTokens(cached.tokens);
      setDefiPositions(cached.defiPositions);
      setTotalValueUsd(cached.totalValueUsd);
      setCustomTokenKeys(cached.customTokenKeys);
      setApiUnavailable(cached.apiUnavailable);
      setLastFetched(cached.timestamp);
      setLoading(false);
      onRpcIssuesChange?.(cached.rpcIssueChainIds);
    } else {
      setTokens([]);
      setDefiPositions([]);
      setTotalValueUsd(0);
      setCustomTokenKeys(new Set());
      setApiUnavailable(false);
      setLastFetched(0);
      setLoading(true);
    }
    loadPortfolio(true);
  }, [address, chainReloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hot-refresh portfolio whenever a confirmed tx writes asset changes —
  // the receipt poller fires `txHistoryUpdated` with the updated entry, and
  // any inbound ERC-20 has already been added to `recentlyReceivedTokens`,
  // so a forced reload picks it up before the upstream portfolio API
  // catches up.
  useEffect(() => {
    if (!address) return;
    const listener = (message: any) => {
      if (message?.type !== "txHistoryUpdated") return;
      const updated = message.updatedTx;
      if (!updated) return;
      if (
        updated.tx?.from?.toLowerCase?.() !== address.toLowerCase() &&
        updated.bridge?.receiverAddress?.toLowerCase?.() !== address.toLowerCase()
      )
        return;
      if (!updated.assetChanges && !updated.destAssetChanges) return;
      loadPortfolio(true);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [address, loadPortfolio]);

  // Set of "chainId-address" keys for dedup in AddTokenModal
  const tokenKeys = useMemo(
    () => new Set(tokens.map((t) => `${t.chainId}-${t.contractAddress.toLowerCase()}`)),
    [tokens]
  );

  // Apply network filter
  const filteredTokens = useMemo(
    () => filterChainId != null ? tokens.filter((t) => t.chainId === filterChainId) : tokens,
    [tokens, filterChainId]
  );

  // Batch the logo-cache lookup across every token + nested staking position
  // so all rows benefit from the same `ensAvatarImageCache` data-URL cache
  // ENS avatars use. Renders synchronously on reopen for everything cached.
  const cachedLogoMap = useCachedAvatarMap(
    useMemo(() => {
      const urls: Array<string | null | undefined> = [];
      for (const t of tokens) {
        urls.push(t.logoUrl);
        for (const pos of t.defiPositions ?? []) {
          for (const a of pos.assets ?? []) urls.push(a.logoUrl);
          for (const a of pos.rewardAssets ?? []) urls.push(a.logoUrl);
        }
      }
      return urls;
    }, [tokens]),
  );
  const resolveLogo = useCallback(
    (url: string | undefined): string | undefined =>
      (url && cachedLogoMap.get(url)) || url,
    [cachedLogoMap],
  );
  const filteredDefiPositions = useMemo(
    () => filterChainId != null ? defiPositions.filter((p) => p.chainId === filterChainId) : defiPositions,
    [defiPositions, filterChainId]
  );

  // Notify parent of state changes for tab header display
  const loadPortfolioRef = useRef(loadPortfolio);
  loadPortfolioRef.current = loadPortfolio;

  useEffect(() => {
    onStateChange?.({
      totalValueUsd,
      loading,
      hideValue,
      toggleHideValue: () => toggleHideValueRef.current(),
      refresh: () => loadPortfolioRef.current(true),
      tokenKeys,
      apiUnavailable,
    });
  }, [totalValueUsd, loading, hideValue, onStateChange, tokenKeys, apiUnavailable]);

  const formatUsd = (value: number): string =>
    formatUsdShared(value, { hide: hideValue });

  if (error && tokens.length === 0) {
    const errorContent = (
      <HStack justify="space-between" p={hideCard ? 0 : 3}>
        <Text fontSize="sm" color="text.tertiary" fontWeight="700">
          Portfolio unavailable
        </Text>
        <IconButton
          aria-label="Retry"
          icon={<RepeatIcon />}
          size="xs"
          variant="ghost"
          onClick={() => loadPortfolio(true)}
        />
      </HStack>
    );
    if (hideCard) return errorContent;
    return (
      <Box
        bg="surface.raised"
        border="3px solid"
        borderColor="border.default"
        boxShadow="card"
        p={0}
      >
        <Box p={3}>{errorContent}</Box>
      </Box>
    );
  }

  const tokenList = (
    <VStack spacing={0}>
      {loading && tokens.length === 0 ? (
        // Loading skeletons
        Array.from({ length: 3 }).map((_, i) => (
          <HStack key={i} w="full" p={2.5} px={3} borderBottom="1px solid" borderColor="border.subtle">
            <Skeleton boxSize="24px" borderRadius="sm" />
            <VStack align="start" spacing={0} flex={1}>
              <Skeleton h="14px" w="60px" />
              <Skeleton h="12px" w="40px" mt={1} />
            </VStack>
            <VStack align="end" spacing={0}>
              <Skeleton h="14px" w="50px" />
              <Skeleton h="12px" w="30px" mt={1} />
            </VStack>
          </HStack>
        ))
      ) : filteredTokens.length === 0 && filteredDefiPositions.length === 0 ? (
        <Box p={3} minH="140px" display="flex" alignItems="center" justifyContent="center">
          <Text fontSize="sm" color="text.tertiary" textAlign="center">
            No tokens found
          </Text>
        </Box>
      ) : (
        <>
          {filteredTokens.map((token, i) => {
            const isCustom = customTokenKeys.has(
              `${token.chainId}-${token.contractAddress.toLowerCase()}`
            );
            const resolvedChain = getResolvedChainById(token.chainId, networksInfo);
            const canSwap = !!onSwapClick && resolvedChain?.isSwapSupported === true;
            const hasHover = !!(onTokenClick || canSwap || isCustom);
            return (
            <HStack
              key={`${token.chainId}-${token.contractAddress}-${i}`}
              w="full"
              p={2.5}
              px={3}
              borderBottom={i < filteredTokens.length - 1 || filteredDefiPositions.length > 0 ? "1px solid" : "none"}
              borderColor="border.subtle"
              cursor={hasHover ? "pointer" : "default"}
              _hover={{ bg: "bg.muted", "& > .hover-actions": { opacity: 1 }, "& > .edit-label": { opacity: 1, pointerEvents: "auto" }, "& > .value-col": { opacity: 0 }, "& .copy-addr-btn": { opacity: 1 } }}
              onClick={() => onTokenClick?.(token)}
              transition="background 0.15s"
              position="relative"
            >
              {(onTokenClick || canSwap) && (
                <HStack
                  className="hover-actions"
                  position="absolute"
                  right={isCustom ? "52px" : 3}
                  top="50%"
                  transform="translateY(-50%)"
                  spacing={3}
                  opacity={0}
                  transition="opacity 0.15s"
                  pointerEvents="none"
                  sx={{ "& > *": { pointerEvents: "auto" } }}
                >
                  {canSwap && (
                    <Text
                      fontSize="10px"
                      fontWeight="800"
                      color="accent.highlight"
                      textTransform="uppercase"
                      letterSpacing="wider"
                      cursor="pointer"
                      _hover={{ textDecoration: "underline" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSwapClick?.(token);
                      }}
                    >
                      Swap
                    </Text>
                  )}
                  {onTokenClick && (
                    <Text
                      fontSize="10px"
                      fontWeight="800"
                      color="accent.secondary"
                      textTransform="uppercase"
                      letterSpacing="wider"
                      pointerEvents="none"
                    >
                      Send
                    </Text>
                  )}
                </HStack>
              )}
              {isCustom && (
                <Text
                  className="edit-label"
                  position="absolute"
                  right={3}
                  fontSize="10px"
                  fontWeight="800"
                  color="accent.primary"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  opacity={0}
                  pointerEvents="none"
                  transition="opacity 0.15s"
                  cursor="pointer"
                  top="50%"
                  transform="translateY(-50%)"
                  zIndex={1}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingToken(token);
                    editModal.onOpen();
                  }}
                  _hover={{ textDecoration: "underline" }}
                >
                  Edit
                </Text>
              )}
              {/* Token icon */}
              <Box position="relative">
                <Box
                  bg="bg.muted"
                  borderRadius="full"
                  w="28px"
                  h="28px"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  overflow="hidden"
                >
                  {token.logoUrl ? (
                    <Image
                      src={resolveLogo(token.logoUrl)}
                      alt={token.symbol}
                      boxSize="28px"
                      borderRadius="full"
                      fallback={
                        <Text fontSize="9px" fontWeight="800" color="text.secondary">
                          {token.symbol.slice(0, 3)}
                        </Text>
                      }
                    />
                  ) : (
                    <Text fontSize="9px" fontWeight="800" color="text.secondary">
                      {token.symbol.slice(0, 3)}
                    </Text>
                  )}
                </Box>
                {/* Chain badge */}
                {(() => {
                  const resolvedChain = getResolvedChainById(token.chainId, networksInfo);
                  const chainName = resolvedChain?.name ?? getChainConfig(token.chainId).name ?? `Chain ${token.chainId}`;
                  return (
                    <Box
                      position="absolute"
                      bottom="-2px"
                      right="-4px"
                      border="1.5px solid"
                      borderColor="surface.base"
                      borderRadius="full"
                      bg="surface.base"
                      overflow="hidden"
                      boxSize="14px"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                    >
                      <ChainIcon chainId={token.chainId} chainName={chainName} size="14px" withChip />
                    </Box>
                  );
                })()}
              </Box>

              {/* Token info */}
              <VStack align="start" spacing={0} flex={1} minW={0}>
                <HStack spacing={1.5}>
                  <Text fontSize="xs" fontWeight="700" color="text.primary" noOfLines={1} textTransform="uppercase">
                    {token.symbol}
                  </Text>
                  {token.contractAddress && token.contractAddress !== "0x0000000000000000000000000000000000000000" && token.contractAddress !== "native" && (
                    <IconButton
                      className="copy-addr-btn"
                      aria-label="Copy token address"
                      icon={copiedAddr === `${token.chainId}-${token.contractAddress}` ? <CheckIcon /> : <CopyIcon />}
                      size="xs"
                      variant="ghost"
                      color={copiedAddr === `${token.chainId}-${token.contractAddress}` ? "accent.highlight" : "text.tertiary"}
                      opacity={copiedAddr === `${token.chainId}-${token.contractAddress}` ? 1 : 0}
                      transition="opacity 0.15s"
                      minW="auto"
                      h="auto"
                      p={0}
                      fontSize="10px"
                      _hover={{ color: "accent.secondary" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(token.contractAddress);
                        const key = `${token.chainId}-${token.contractAddress}`;
                        setCopiedAddr(key);
                        setTimeout(() => setCopiedAddr((prev) => prev === key ? null : prev), 2000);
                      }}
                    />
                  )}
                </HStack>
                <Text fontSize="10px" color="text.tertiary" fontWeight="500" noOfLines={1}>
                  {hideValue ? "****" : token.balanceFormatted}
                  {resolvedChain?.name &&
                    getChainEnvironmentLabel(token.chainId, resolvedChain.name) === "TESTNET" && (
                      <>
                        {" · "}
                        <Text as="span" fontSize="9px" textTransform="uppercase" letterSpacing="wider" fontWeight="700">
                          {resolvedChain.name}
                        </Text>
                      </>
                    )}
                </Text>
              </VStack>

              {/* Value — fades on hover when clickable */}
              <VStack
                align="end"
                spacing={0}
                minW="50px"
                className={hasHover ? "value-col" : undefined}
                transition="opacity 0.15s"
              >
                <Text fontSize="xs" fontWeight="700" color="text.primary">
                  {formatUsd(token.valueUsd)}
                </Text>
                {!hideValue && token.priceUsd > 0 && (
                  <Text fontSize="10px" color="text.tertiary" fontWeight="500">
                    ${token.priceUsd < 0.01 ? "<0.01" : token.priceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                  </Text>
                )}
              </VStack>
            </HStack>
            );
          })}

          {/* DeFi Positions */}
          {filteredDefiPositions.length > 0 && (
            <>
              <HStack
                w="full"
                px={3}
                py={2}
                bg="bg.muted"
                borderBottom="1px solid"
                borderColor="border.subtle"
              >
                <Text fontSize="10px" fontWeight="800" color="text.secondary" textTransform="uppercase" letterSpacing="wider">
                  DeFi Positions
                </Text>
              </HStack>
              {filteredDefiPositions.map((pos, i) => {
                const chainConfig = getChainConfig(pos.chainId);
                return (
                  <Box
                    key={`defi-${pos.protocol}-${pos.name}-${i}`}
                    w="full"
                    borderBottom={i < filteredDefiPositions.length - 1 ? "1px solid" : "none"}
                    borderColor="border.subtle"
                  >
                    {/* Position header */}
                    <HStack w="full" p={2.5} px={3} spacing={2}>
                      <Box position="relative">
                        <Box
                          bg="bg.muted"
                          borderRadius="6px"
                          w="28px"
                          h="28px"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          overflow="hidden"
                        >
                          {pos.protocolLogo ? (
                            <Image
                              src={pos.protocolLogo}
                              alt={pos.protocol}
                              boxSize="28px"
                              borderRadius="6px"
                              fallback={
                                <Text fontSize="8px" fontWeight="800" color="text.secondary">
                                  {pos.protocol.slice(0, 3).toUpperCase()}
                                </Text>
                              }
                            />
                          ) : (
                            <Text fontSize="8px" fontWeight="800" color="text.secondary">
                              {pos.protocol.slice(0, 3).toUpperCase()}
                            </Text>
                          )}
                        </Box>
                        <Box
                          position="absolute"
                          bottom="-2px"
                          right="-4px"
                          border="1.5px solid"
                          borderColor="surface.base"
                          borderRadius="full"
                          bg="surface.base"
                        >
                          <ChainIcon
                            chainId={pos.chainId}
                            chainName={chainConfig.name}
                            size="14px"
                            withChip
                          />
                        </Box>
                      </Box>
                      <VStack align="start" spacing={0} flex={1} minW={0}>
                        <HStack spacing={1}>
                          <Text fontSize="xs" fontWeight="700" color="text.primary" noOfLines={1} textTransform="uppercase">
                            {pos.protocol}
                          </Text>
                          {pos.siteUrl && (
                            <IconButton
                              aria-label="Open in app"
                              icon={<ExternalLinkIcon />}
                              size="xs"
                              variant="ghost"
                              color="text.tertiary"
                              minW="auto"
                              h="auto"
                              p={0}
                              fontSize="10px"
                              _hover={{ color: "accent.secondary" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(pos.siteUrl, "_blank");
                              }}
                            />
                          )}
                        </HStack>
                        <Text fontSize="10px" color="text.tertiary" fontWeight="500" noOfLines={1}>
                          {pos.type === pos.name ? pos.type : `${pos.type} · ${pos.name}`}
                        </Text>
                      </VStack>
                      <Text fontSize="xs" fontWeight="700" color="text.primary">
                        {formatUsd(pos.valueUsd)}
                      </Text>
                    </HStack>

                    {/* Position assets */}
                    <VStack spacing={0} pl={9} pr={3} pb={1.5}>
                      {pos.assets.map((asset, j) => (
                        <HStack key={`asset-${j}`} w="full" py={0.5} justify="space-between">
                          <HStack spacing={1.5}>
                            <Box
                              bg="bg.muted"
                              borderRadius="full"
                              w="16px"
                              h="16px"
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                              overflow="hidden"
                              flexShrink={0}
                            >
                              {asset.logoUrl ? (
                                <Image src={resolveLogo(asset.logoUrl)} alt={asset.symbol} boxSize="13px" fallback={
                                  <Text fontSize="7px" fontWeight="800" color="text.tertiary">{asset.symbol.slice(0, 2).toUpperCase()}</Text>
                                } />
                              ) : (
                                <Text fontSize="7px" fontWeight="800" color="text.tertiary">{asset.symbol.slice(0, 2).toUpperCase()}</Text>
                              )}
                            </Box>
                            <Text fontSize="10px" color="text.tertiary" fontWeight="600" textTransform="uppercase">
                              {hideValue ? "****" : asset.balanceFormatted} {asset.symbol}
                            </Text>
                          </HStack>
                          <Text fontSize="10px" color="text.tertiary" fontWeight="500">
                            {formatUsd(asset.valueUsd)}
                          </Text>
                        </HStack>
                      ))}
                      {pos.rewardAssets.length > 0 && (
                        <>
                          <Text fontSize="9px" color="text.tertiary" fontWeight="700" textTransform="uppercase" alignSelf="start" mt={0.5} opacity={0.6}>
                            Rewards
                          </Text>
                          {pos.rewardAssets.map((asset, j) => (
                            <HStack key={`reward-${j}`} w="full" py={0.5} justify="space-between">
                              <HStack spacing={1.5}>
                                <Box
                                  bg="bg.muted"
                                  border="1.5px solid"
                                  borderColor="border.subtle"
                                  borderRadius="full"
                                  w="16px"
                                  h="16px"
                                  display="flex"
                                  alignItems="center"
                                  justifyContent="center"
                                  overflow="hidden"
                                  flexShrink={0}
                                >
                                  {asset.logoUrl ? (
                                    <Image src={resolveLogo(asset.logoUrl)} alt={asset.symbol} boxSize="13px" fallback={
                                      <Text fontSize="7px" fontWeight="800" color="text.tertiary">{asset.symbol.slice(0, 2).toUpperCase()}</Text>
                                    } />
                                  ) : (
                                    <Text fontSize="7px" fontWeight="800" color="text.tertiary">{asset.symbol.slice(0, 2).toUpperCase()}</Text>
                                  )}
                                </Box>
                                <Text fontSize="10px" color="text.tertiary" fontWeight="600" textTransform="uppercase">
                                  {asset.balanceFormatted} {asset.symbol}
                                </Text>
                              </HStack>
                              <Text fontSize="10px" color="text.tertiary" fontWeight="500">
                                {formatUsd(asset.valueUsd)}
                              </Text>
                            </HStack>
                          ))}
                        </>
                      )}
                    </VStack>
                  </Box>
                );
              })}
            </>
          )}
        </>
      )}
    </VStack>
  );

  const editModalEl = (
    <EditCustomTokenModal
      isOpen={editModal.isOpen}
      onClose={editModal.onClose}
      onUpdated={() => loadPortfolio(true)}
      token={editingToken}
    />
  );

  if (hideCard) return <>{tokenList}{editModalEl}</>;

  return (
    <Box
      bg="surface.raised"
      border="3px solid"
      borderColor="border.default"
      boxShadow="card"
      position="relative"
    >
      {/* Corner decoration — Bauhaus only; Decorator renders nothing in Midnight */}
      <Decorator corner="top-right" accent="highlight" />

      {/* Header */}
      {!hideHeader && (
        <HStack p={3} borderBottom="2px solid" borderColor="border.default" justify="space-between">
          <HStack spacing={2}>
            <Text fontSize="sm" fontWeight="700" color="text.secondary" textTransform="uppercase">
              Holdings
            </Text>
            {loading && <Skeleton h="14px" w="60px" />}
            {!loading && (
              <Text fontSize="sm" fontWeight="900" color="text.primary">
                {formatUsd(totalValueUsd)}
              </Text>
            )}
          </HStack>
          <HStack spacing={1}>
            <Tooltip label={hideValue ? "Show values" : "Hide values"} hasArrow>
              <IconButton
                aria-label={hideValue ? "Show values" : "Hide values"}
                icon={hideValue ? <ViewOffIcon /> : <ViewIcon />}
                size="xs"
                variant="ghost"
                color="text.secondary"
                onClick={toggleHideValue}
                _hover={{ color: "accent.secondary" }}
                minW="auto"
              />
            </Tooltip>
            <Tooltip label="Refresh" hasArrow>
              <IconButton
                aria-label="Refresh portfolio"
                icon={<RepeatIcon />}
                size="xs"
                variant="ghost"
                color="text.secondary"
                onClick={() => loadPortfolio(true)}
                _hover={{ color: "accent.secondary" }}
                minW="auto"
                isDisabled={loading}
              />
            </Tooltip>
          </HStack>
        </HStack>
      )}

      {tokenList}
      {editModalEl}
    </Box>
  );
}

export default memo(TokenHoldings);
