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
import EditCustomTokenModal from "@/components/EditCustomTokenModal";
import ChainIcon from "@/components/ChainIcon";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById, getVisibleChains } from "@/lib/chains";

interface TokenHoldingsProps {
  address: string;
  onTokenClick?: (token: PortfolioToken) => void;
  onSwapClick?: (token: PortfolioToken) => void;
  hideHeader?: boolean;
  hideCard?: boolean;
  onRpcIssuesChange?: (chainIds: number[]) => void;
  onStateChange?: (state: {
    totalValueUsd: number;
    loading: boolean;
    hideValue: boolean;
    toggleHideValue: () => void;
    refresh: () => void;
    tokenKeys: Set<string>;
  }) => void;
}

function TokenHoldings({ address, onTokenClick, onSwapClick, hideHeader, hideCard, onRpcIssuesChange, onStateChange }: TokenHoldingsProps) {
  const { networksInfo } = useNetworks();
  const [tokens, setTokens] = useState<PortfolioToken[]>([]);
  const [defiPositions, setDefiPositions] = useState<DefiPosition[]>([]);
  const [totalValueUsd, setTotalValueUsd] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hideValue, setHideValue] = useState(false);
  const [lastFetched, setLastFetched] = useState(0);
  const [customTokenKeys, setCustomTokenKeys] = useState<Set<string>>(new Set());
  const [editingToken, setEditingToken] = useState<PortfolioToken | null>(null);
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const editModal = useDisclosure();
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

      setLoading(true);
      setError(null);

      try {
        const catalog = await loadPortfolioTokenCatalog(address);
        const mergedTokens = catalog.tokens;

        setCustomTokenKeys(catalog.customTokenKeys);

        // Show merged data immediately so user isn't stuck on skeleton loader
        setTokens(mergedTokens);
        setDefiPositions(catalog.defiPositions || []);
        setTotalValueUsd(catalog.totalValueUsd);
        setLoading(false);
        setLastFetched(Date.now());

        // Enhance with on-chain balances in the background.
        // If RPCs are rate-limited or slow, user already sees API values.
        try {
          const onchain = await fetchOnchainBalances(address, mergedTokens);
          onRpcIssuesChange?.(onchain.rpcIssueChainIds);
          setTokens(onchain.tokens);
          // Total = on-chain corrected wallet tokens + DeFi positions
          const defiTotal = (catalog.defiPositions || []).reduce((s: number, p: DefiPosition) => s + p.valueUsd, 0);
          const total = onchain.totalValueUsd + defiTotal;
          setTotalValueUsd(total);
          // Record snapshot with on-chain enhanced value
          recordSnapshot(address, total).catch(() => {});
        } catch (err) {
          onRpcIssuesChange?.([]);
          // Record snapshot with API-only value
          recordSnapshot(address, catalog.totalValueUsd).catch(() => {});
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load portfolio");
        onRpcIssuesChange?.([]);
        setLoading(false);
      }
    },
    [address, lastFetched, tokens.length]
  );

  // Reset cache and reload when address changes
  useEffect(() => {
    setLastFetched(0);
    setTokens([]);
    setDefiPositions([]);
    setTotalValueUsd(0);
    loadPortfolio(true);
  }, [address, chainReloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Set of "chainId-address" keys for dedup in AddTokenModal
  const tokenKeys = useMemo(
    () => new Set(tokens.map((t) => `${t.chainId}-${t.contractAddress.toLowerCase()}`)),
    [tokens]
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
    });
  }, [totalValueUsd, loading, hideValue, onStateChange, tokenKeys]);

  const formatUsd = (value: number): string => {
    if (hideValue) return "****";
    if (value === 0) return "$0.00";
    if (value < 0.01) return "<$0.01";
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

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
        bg="bauhaus.white"
        border="3px solid"
        borderColor="bauhaus.black"
        boxShadow="4px 4px 0px 0px #121212"
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
          <HStack key={i} w="full" p={2.5} px={3} borderBottom="1px solid" borderColor="gray.200">
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
      ) : tokens.length === 0 && defiPositions.length === 0 ? (
        <Box p={3}>
          <Text fontSize="sm" color="text.tertiary" textAlign="center">
            No tokens found
          </Text>
        </Box>
      ) : (
        <>
          {tokens.map((token, i) => {
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
              borderBottom={i < tokens.length - 1 || defiPositions.length > 0 ? "1px solid" : "none"}
              borderColor="gray.200"
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
                      color="bauhaus.red"
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
                      color="bauhaus.blue"
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
                  color="bauhaus.red"
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
                      src={token.logoUrl}
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
                      borderColor="white"
                      borderRadius="full"
                      bg="white"
                      overflow="hidden"
                      boxSize="14px"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                    >
                      <ChainIcon chainId={token.chainId} chainName={chainName} size="14px" />
                    </Box>
                  );
                })()}
              </Box>

              {/* Token info */}
              <VStack align="start" spacing={0} flex={1} minW={0}>
                <HStack spacing={0.5}>
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
                      color={copiedAddr === `${token.chainId}-${token.contractAddress}` ? "bauhaus.yellow" : "text.tertiary"}
                      opacity={copiedAddr === `${token.chainId}-${token.contractAddress}` ? 1 : 0}
                      transition="opacity 0.15s"
                      minW="auto"
                      h="auto"
                      p={0}
                      fontSize="10px"
                      _hover={{ color: "bauhaus.blue" }}
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
                  {token.balanceFormatted}
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
          {defiPositions.length > 0 && (
            <>
              <HStack
                w="full"
                px={3}
                py={2}
                bg="bg.muted"
                borderBottom="1px solid"
                borderColor="gray.200"
              >
                <Text fontSize="10px" fontWeight="800" color="text.secondary" textTransform="uppercase" letterSpacing="wider">
                  DeFi Positions
                </Text>
              </HStack>
              {defiPositions.map((pos, i) => {
                const chainConfig = getChainConfig(pos.chainId);
                return (
                  <Box
                    key={`defi-${pos.protocol}-${pos.name}-${i}`}
                    w="full"
                    borderBottom={i < defiPositions.length - 1 ? "1px solid" : "none"}
                    borderColor="gray.200"
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
                          borderColor="white"
                          borderRadius="full"
                          bg="white"
                        >
                          <ChainIcon
                            chainId={pos.chainId}
                            chainName={chainConfig.name}
                            size="14px"
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
                              _hover={{ color: "bauhaus.blue" }}
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
                                <Image src={asset.logoUrl} alt={asset.symbol} boxSize="13px" fallback={
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
                                  borderColor="gray.300"
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
                                    <Image src={asset.logoUrl} alt={asset.symbol} boxSize="13px" fallback={
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
      bg="bauhaus.white"
      border="3px solid"
      borderColor="bauhaus.black"
      boxShadow="4px 4px 0px 0px #121212"
      position="relative"
    >
      {/* Corner decoration */}
      <Box
        position="absolute"
        top="-3px"
        right="-3px"
        w="10px"
        h="10px"
        bg="bauhaus.yellow"
        border="2px solid"
        borderColor="bauhaus.black"
      />

      {/* Header */}
      {!hideHeader && (
        <HStack p={3} borderBottom="2px solid" borderColor="bauhaus.black" justify="space-between">
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
                _hover={{ color: "bauhaus.blue" }}
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
                _hover={{ color: "bauhaus.blue" }}
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
