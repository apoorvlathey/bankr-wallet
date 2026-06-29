import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  memo,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Box,
  Collapse,
  VStack,
  HStack,
  Text,
  Image,
  Skeleton,
  IconButton,
  Tooltip,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Portal,
  Icon,
  Spinner,
} from "@chakra-ui/react";
import { CheckIcon, ChevronDownIcon, CopyIcon, ExternalLinkIcon, RepeatIcon, ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import { useDisclosure } from "@chakra-ui/react";
import { PortfolioToken, DefiPosition } from "@/chrome/portfolioApi";
import { fetchOnchainBalances } from "@/chrome/onchainBalances";
import {
  getPortfolioTokenKey,
  hidePortfolioToken,
} from "@/chrome/hiddenPortfolioTokens";
import { loadPortfolioTokenCatalog } from "@/chrome/portfolioTokens";
import {
  clearPortfolioHoldingsCache,
  getPortfolioHoldingsSnapshot,
  getPortfolioHoldingsSnapshotSync,
  savePortfolioHoldingsSnapshot,
  type PortfolioHoldingsCacheSnapshot,
} from "@/chrome/portfolioHoldingsCache";
import { recordSnapshot } from "@/chrome/portfolioSnapshotStorage";
import { getChainConfig } from "@/constants/chainConfig";
import { getChainEnvironmentLabel } from "@/lib/chainIcons";
import EditCustomTokenModal from "@/components/EditCustomTokenModal";
import HideTokenModal from "@/components/HideTokenModal";
import ChainIcon from "@/components/ChainIcon";
import {
  LOW_VALUE_TOKEN_THRESHOLD_USD,
  getDefiTotal,
  getTokenKeySet,
  getWalletTokenTotal,
  hasPositiveBalance,
  getReceiptTokenRefresh,
  mergeTokenBalanceRefresh,
  shouldFetchOnInitialPortfolioLoad,
  sortTokensByValue,
} from "@/components/tokenHoldingsUtils";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById, getVisibleChains } from "@/lib/chains";
import { Decorator } from "@/theme";
import { formatUsd as formatUsdShared } from "@/lib/currencyFormatUtils";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";
import type { NetworksInfo } from "@/types";

// Module-level cache so navigating away and back to the homepage doesn't flash
// a skeleton. We seed state from here on mount and refetch in the background.
interface HoldingsSnapshot {
  tokens: PortfolioToken[];
  defiPositions: DefiPosition[];
  totalValueUsd: number;
  customTokenKeys: Set<string>;
  allTokenKeys: Set<string>;
  hiddenTokenKeys: Set<string>;
  onchainFetchedTokenKeys: Set<string>;
  rpcIssueChainIds: number[];
  apiUnavailable: boolean;
  timestamp: number;
}
const holdingsCache = new Map<string, HoldingsSnapshot>();
const holdingsCacheKey = (address: string, reloadKey: string) =>
  `${address.toLowerCase()}|${reloadKey}`;
const PORTFOLIO_BACKGROUND_TASK_DELAY_MS = 250;

function toStoredHoldingsSnapshot(
  snapshot: HoldingsSnapshot,
): PortfolioHoldingsCacheSnapshot {
  return {
    ...snapshot,
    customTokenKeys: Array.from(snapshot.customTokenKeys),
    allTokenKeys: Array.from(snapshot.allTokenKeys),
    hiddenTokenKeys: Array.from(snapshot.hiddenTokenKeys),
    onchainFetchedTokenKeys: Array.from(snapshot.onchainFetchedTokenKeys),
  };
}

function fromStoredHoldingsSnapshot(
  snapshot: PortfolioHoldingsCacheSnapshot,
): HoldingsSnapshot {
  return {
    ...snapshot,
    customTokenKeys: new Set(snapshot.customTokenKeys),
    allTokenKeys: new Set(snapshot.allTokenKeys),
    hiddenTokenKeys: new Set(snapshot.hiddenTokenKeys),
    onchainFetchedTokenKeys: new Set(snapshot.onchainFetchedTokenKeys),
  };
}

function writeHoldingsSnapshot(
  cacheKey: string,
  snapshot: HoldingsSnapshot,
): void {
  holdingsCache.set(cacheKey, snapshot);
  void savePortfolioHoldingsSnapshot(
    cacheKey,
    toStoredHoldingsSnapshot(snapshot),
  ).catch(() => undefined);
}

async function clearHoldingsCaches(): Promise<void> {
  holdingsCache.clear();
  try {
    await clearPortfolioHoldingsCache();
  } catch {
    // Best-effort display cache; live portfolio loading must continue.
  }
}

function hasHoldingsSnapshotContent(snapshot: HoldingsSnapshot): boolean {
  return snapshot.tokens.length > 0 || snapshot.defiPositions.length > 0;
}

function readCachedHoldingsSnapshot(cacheKey: string): HoldingsSnapshot | null {
  const cached = holdingsCache.get(cacheKey);
  if (cached && hasHoldingsSnapshotContent(cached)) return cached;
  if (cached) holdingsCache.delete(cacheKey);

  const mirrored = getPortfolioHoldingsSnapshotSync(cacheKey);
  if (!mirrored) return null;

  const snapshot = fromStoredHoldingsSnapshot(mirrored);
  if (!hasHoldingsSnapshotContent(snapshot)) return null;
  holdingsCache.set(cacheKey, snapshot);
  return snapshot;
}

function schedulePortfolioBackgroundTask(task: () => Promise<void>): void {
  window.setTimeout(() => {
    void task();
  }, PORTFOLIO_BACKGROUND_TASK_DELAY_MS);
}

function hasRenderablePortfolioToken(token: PortfolioToken): boolean {
  return hasPositiveBalance(token) || Number(token.valueUsd || 0) > 0;
}

function isVisibleTokenRow(
  token: PortfolioToken,
  includeLowValueTokens: boolean,
): boolean {
  return (
    includeLowValueTokens ||
    Number(token.valueUsd || 0) >= LOW_VALUE_TOKEN_THRESHOLD_USD
  );
}

function getVisibleTokenKeySet(
  tokens: PortfolioToken[],
  includeLowValueTokens: boolean,
): Set<string> {
  return getTokenKeySet(
    tokens.filter((token) => isVisibleTokenRow(token, includeLowValueTokens)),
  );
}

function collectTokenLogoUrls(
  token: PortfolioToken,
  urls: Array<string | null | undefined>,
): void {
  urls.push(token.logoUrl);
  for (const pos of token.defiPositions ?? []) {
    urls.push(pos.protocolLogo);
    for (const asset of pos.assets ?? []) urls.push(asset.logoUrl);
    for (const asset of pos.rewardAssets ?? []) urls.push(asset.logoUrl);
  }
}

function mergeTokenEnrichment(
  currentTokens: PortfolioToken[],
  enrichedTokens: PortfolioToken[],
): PortfolioToken[] {
  const enrichedByKey = new Map(
    enrichedTokens.map((token) => [
      getPortfolioTokenKey(token.chainId, token.contractAddress),
      token,
    ]),
  );
  const seen = new Set<string>();

  const merged = currentTokens.map((token) => {
    const key = getPortfolioTokenKey(token.chainId, token.contractAddress);
    seen.add(key);
    const enriched = enrichedByKey.get(key);
    if (!enriched) return token;

    const priceUsd = enriched.priceUsd > 0 ? enriched.priceUsd : token.priceUsd;
    const balanceNum = parseFloat(token.balance || "0");
    return {
      ...token,
      symbol: token.symbol || enriched.symbol,
      name: token.name || enriched.name,
      decimals: token.decimals ?? enriched.decimals,
      logoUrl: token.logoUrl || enriched.logoUrl,
      priceUsd,
      valueUsd:
        priceUsd > 0 && balanceNum > 0
          ? balanceNum * priceUsd
          : token.valueUsd || enriched.valueUsd,
    };
  });

  for (const enriched of enrichedTokens) {
    const key = getPortfolioTokenKey(enriched.chainId, enriched.contractAddress);
    if (!seen.has(key) && hasPositiveBalance(enriched)) {
      merged.push(enriched);
    }
  }

  return sortTokensByValue(merged.filter(hasPositiveBalance));
}

interface TokenHoldingsProps {
  address: string;
  onTokenClick?: (token: PortfolioToken) => void;
  onSwapClick?: (token: PortfolioToken) => void;
  hideHeader?: boolean;
  hideCard?: boolean;
  onRpcIssuesChange?: (chainIds: number[]) => void;
  filterChainId?: number | null;
  onSnapshotsChanged?: () => void;
  onStateChange?: (state: {
    totalValueUsd: number;
    loading: boolean;
    hideValue: boolean;
    toggleHideValue: () => void;
    refresh: (options?: LoadPortfolioOptions) => Promise<void>;
    tokenKeys: Set<string>;
    allTokenKeys: Set<string>;
    hiddenTokenKeys: Set<string>;
    apiUnavailable: boolean;
  }) => void;
}

interface LoadPortfolioOptions {
  forceSnapshot?: boolean;
  forceRefreshTokenKeys?: Set<string>;
  forceRefreshTokens?: PortfolioToken[];
  suppressSkeleton?: boolean;
}

const ERC20_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const EllipsisHorizontalIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" fill="none" {...props}>
    <circle cx="5" cy="12" r="1.75" fill="currentColor" />
    <circle cx="12" cy="12" r="1.75" fill="currentColor" />
    <circle cx="19" cy="12" r="1.75" fill="currentColor" />
  </Icon>
);

interface TokenRowProps {
  token: PortfolioToken;
  rowKey: string;
  hasBottomBorder: boolean;
  customTokenKeys: Set<string>;
  networksInfo: NetworksInfo;
  onTokenClick?: (token: PortfolioToken) => void;
  onSwapClick?: (token: PortfolioToken) => void;
  onEditToken: (token: PortfolioToken) => void;
  onHideToken: (token: PortfolioToken) => void;
  resolveLogo: (url: string | undefined) => string | undefined;
  copiedAddr: string | null;
  setCopiedAddr: Dispatch<SetStateAction<string | null>>;
  hideValue: boolean;
  formatUsd: (value: number) => string;
}

function TokenRow({
  token,
  rowKey,
  hasBottomBorder,
  customTokenKeys,
  networksInfo,
  onTokenClick,
  onSwapClick,
  onEditToken,
  onHideToken,
  resolveLogo,
  copiedAddr,
  setCopiedAddr,
  hideValue,
  formatUsd,
}: TokenRowProps) {
  const tokenKey = getPortfolioTokenKey(token.chainId, token.contractAddress);
  const isCustom = customTokenKeys.has(tokenKey);
  const resolvedChain = getResolvedChainById(token.chainId, networksInfo);
  const canSwap = !!onSwapClick && resolvedChain?.isSwapSupported === true;
  const canHide =
    ERC20_ADDRESS_REGEX.test(token.contractAddress) &&
    token.contractAddress.toLowerCase() !== ZERO_ADDRESS;
  const hasHover = !!(onTokenClick || canSwap || isCustom || canHide);
  const copiedKey = `${token.chainId}-${token.contractAddress}`;

  return (
    <HStack
      key={rowKey}
      w="full"
      p={2.5}
      px={3}
      borderBottom={hasBottomBorder ? "1px solid" : "none"}
      borderColor="border.subtle"
      cursor={hasHover ? "pointer" : "default"}
      _hover={{
        bg: "bg.muted",
        "& > .hover-actions": { opacity: 1 },
        "& > .value-col": { opacity: 0 },
        "& .copy-addr-btn": { opacity: 1 },
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-token-menu-action]")) return;
        onTokenClick?.(token);
      }}
      transition="background 0.15s"
      position="relative"
    >
      {hasHover && (
        <HStack
          className="hover-actions"
          position="absolute"
          right={3}
          top="50%"
          transform="translateY(-50%)"
          spacing={3}
          bg="bg.muted"
          pl={2}
          opacity={0}
          transition="opacity 0.15s"
          pointerEvents="none"
          zIndex={2}
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
          {isCustom && (
            <Text
              fontSize="10px"
              fontWeight="800"
              color="accent.primary"
              textTransform="uppercase"
              letterSpacing="wider"
              cursor="pointer"
              onClick={(e) => {
                e.stopPropagation();
                onEditToken(token);
              }}
              _hover={{ textDecoration: "underline" }}
            >
              Edit
            </Text>
          )}
          {canHide && (
            <Box
              data-token-menu-action
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <Menu placement="bottom-end">
                <MenuButton
                  as={IconButton}
                  aria-label={`More actions for ${token.symbol}`}
                  icon={<EllipsisHorizontalIcon boxSize="16px" />}
                  size="xs"
                  variant="ghost"
                  color="text.tertiary"
                  minW="28px"
                  h="28px"
                  p={0}
                  _hover={{
                    color: "accent.secondary",
                    bg: "surface.raisedHover",
                  }}
                />
                <Portal>
                  <MenuList minW="150px" zIndex="popover">
                    <MenuItem
                      fontWeight="800"
                      fontSize="xs"
                      color="text.primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onHideToken(token);
                      }}
                    >
                      <HStack spacing={2}>
                        <Box
                          bg="bg.muted"
                          borderRadius="full"
                          w="18px"
                          h="18px"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          overflow="hidden"
                          flexShrink={0}
                        >
                          <ViewOffIcon
                            boxSize="12px"
                            color="text.secondary"
                          />
                        </Box>
                        <Text>Hide token</Text>
                      </HStack>
                    </MenuItem>
                  </MenuList>
                </Portal>
              </Menu>
            </Box>
          )}
        </HStack>
      )}

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
        {(() => {
          const chainName =
            resolvedChain?.name ??
            getChainConfig(token.chainId).name ??
            `Chain ${token.chainId}`;
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
              <ChainIcon
                chainId={token.chainId}
                chainName={chainName}
                size="14px"
                withChip
              />
            </Box>
          );
        })()}
      </Box>

      <VStack align="start" spacing={0} flex={1} minW={0}>
        <HStack spacing={1.5}>
          <Text
            fontSize="xs"
            fontWeight="700"
            color="text.primary"
            noOfLines={1}
            textTransform="uppercase"
          >
            {token.symbol}
          </Text>
          {token.contractAddress &&
            token.contractAddress !== ZERO_ADDRESS &&
            token.contractAddress !== "native" && (
              <IconButton
                className="copy-addr-btn"
                aria-label="Copy token address"
                icon={copiedAddr === copiedKey ? <CheckIcon /> : <CopyIcon />}
                size="xs"
                variant="ghost"
                color={
                  copiedAddr === copiedKey ? "accent.highlight" : "text.tertiary"
                }
                opacity={copiedAddr === copiedKey ? 1 : 0}
                transition="opacity 0.15s"
                minW="auto"
                h="auto"
                p={0}
                fontSize="10px"
                _hover={{ color: "accent.secondary" }}
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(token.contractAddress);
                  setCopiedAddr(copiedKey);
                  setTimeout(
                    () =>
                      setCopiedAddr((prev) =>
                        prev === copiedKey ? null : prev,
                      ),
                    2000,
                  );
                }}
              />
            )}
        </HStack>
        <Text fontSize="10px" color="text.tertiary" fontWeight="500" noOfLines={1}>
          {hideValue ? "****" : token.balanceFormatted}
          {resolvedChain?.name &&
            getChainEnvironmentLabel(token.chainId, resolvedChain.name) ===
              "TESTNET" && (
              <>
                {" · "}
                <Text
                  as="span"
                  fontSize="9px"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  fontWeight="700"
                >
                  {resolvedChain.name}
                </Text>
              </>
            )}
        </Text>
      </VStack>

      <VStack
        align="end"
        spacing={0}
        minW="50px"
        className={hasHover ? "value-col" : undefined}
        transition="opacity 0.15s"
        pointerEvents={hasHover ? "none" : undefined}
      >
        <Text fontSize="xs" fontWeight="700" color="text.primary">
          {formatUsd(token.valueUsd)}
        </Text>
        {!hideValue && token.priceUsd > 0 && (
          <Text fontSize="10px" color="text.tertiary" fontWeight="500">
            $
            {token.priceUsd < 0.01
              ? "<0.01"
              : token.priceUsd.toLocaleString("en-US", {
                  maximumFractionDigits: 2,
                })}
          </Text>
        )}
      </VStack>
    </HStack>
  );
}

function TokenHoldings({ address, onTokenClick, onSwapClick, hideHeader, hideCard, onRpcIssuesChange, filterChainId, onSnapshotsChanged, onStateChange }: TokenHoldingsProps) {
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
  // Hydrate synchronously from memory or the renderer localStorage mirror so a
  // reopened popup can paint before async chrome.storage reads complete.
  const initialCacheKey = holdingsCacheKey(address, chainReloadKey);
  const initialSnapshot = readCachedHoldingsSnapshot(initialCacheKey);
  const [tokens, setTokens] = useState<PortfolioToken[]>(() => initialSnapshot?.tokens ?? []);
  const [defiPositions, setDefiPositions] = useState<DefiPosition[]>(() => initialSnapshot?.defiPositions ?? []);
  const [totalValueUsd, setTotalValueUsd] = useState(() => initialSnapshot?.totalValueUsd ?? 0);
  const [loading, setLoading] = useState(() => !initialSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [hideValue, setHideValue] = useState(false);
  const [lastFetched, setLastFetched] = useState(() => initialSnapshot?.timestamp ?? 0);
  const [customTokenKeys, setCustomTokenKeys] = useState<Set<string>>(() => initialSnapshot?.customTokenKeys ?? new Set());
  const [allTokenKeys, setAllTokenKeys] = useState<Set<string>>(() => initialSnapshot?.allTokenKeys ?? new Set());
  const [hiddenTokenKeys, setHiddenTokenKeys] = useState<Set<string>>(() => initialSnapshot?.hiddenTokenKeys ?? new Set());
  const [onchainFetchedTokenKeys, setOnchainFetchedTokenKeys] = useState<Set<string>>(
    () => initialSnapshot?.onchainFetchedTokenKeys ?? new Set(),
  );
  const [apiUnavailable, setApiUnavailable] = useState(() => initialSnapshot?.apiUnavailable ?? false);
  const [editingToken, setEditingToken] = useState<PortfolioToken | null>(null);
  const [tokenToHide, setTokenToHide] = useState<PortfolioToken | null>(null);
  const [hidingToken, setHidingToken] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const [showLowValueTokens, setShowLowValueTokens] = useState(false);
  const [portfolioBalanceRefreshing, setPortfolioBalanceRefreshing] = useState(false);
  const [lowValueLoading, setLowValueLoading] = useState(false);
  const editModal = useDisclosure();
  const loadVersionRef = useRef(0);

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

  const applyHoldingsSnapshot = useCallback(
    (snapshot: HoldingsSnapshot) => {
      setTokens(snapshot.tokens);
      setDefiPositions(snapshot.defiPositions);
      setTotalValueUsd(snapshot.totalValueUsd);
      setCustomTokenKeys(snapshot.customTokenKeys);
      setAllTokenKeys(snapshot.allTokenKeys);
      setHiddenTokenKeys(snapshot.hiddenTokenKeys);
      setOnchainFetchedTokenKeys(snapshot.onchainFetchedTokenKeys);
      setApiUnavailable(snapshot.apiUnavailable);
      setLastFetched(snapshot.timestamp);
      setLoading(false);
      setPortfolioBalanceRefreshing(false);
      setLowValueLoading(false);
      onRpcIssuesChange?.(snapshot.rpcIssueChainIds);
    },
    [onRpcIssuesChange],
  );

  const loadPortfolio = useCallback(
    async (force = false, options: LoadPortfolioOptions = {}) => {
      if (!address) return;
      if (options.forceSnapshot) await clearHoldingsCaches();
      // Cache for 60s unless forced
      if (!force && Date.now() - lastFetched < 60_000 && tokens.length > 0) return;
      const loadVersion = loadVersionRef.current + 1;
      loadVersionRef.current = loadVersion;
      const isCurrentLoad = () => loadVersionRef.current === loadVersion;

      // Only show the skeleton when we have nothing on screen yet. If we're
      // revalidating cached data, keep the old values visible until the fresh
      // ones land so the homepage feels instantly ready.
      const hasExistingData = tokens.length > 0 || options.suppressSkeleton;
      if (!hasExistingData) {
        setLoading(true);
      }
      setError(null);

      try {
        const catalog = await loadPortfolioTokenCatalog(address, {
          enrich: false,
        });
        if (!isCurrentLoad()) return;
        const catalogTokenKeys = getTokenKeySet(catalog.tokens);
        const receiptTokenStubs = (options.forceRefreshTokens ?? []).filter(
          (token) =>
            !catalogTokenKeys.has(
              getPortfolioTokenKey(token.chainId, token.contractAddress),
            ) &&
            !catalog.hiddenTokenKeys.has(
              getPortfolioTokenKey(token.chainId, token.contractAddress),
            ),
        );
        const mergedTokens = [...catalog.tokens, ...receiptTokenStubs].filter(
          (token) =>
            !catalog.hiddenTokenKeys.has(
              getPortfolioTokenKey(token.chainId, token.contractAddress),
            ),
        );
        const forcedRefreshTokenKeys = new Set([
          ...catalog.recentReceivedTokenKeys,
          ...(options.forceRefreshTokenKeys ?? []),
        ]);

        setCustomTokenKeys(catalog.customTokenKeys);
        setAllTokenKeys(catalog.allTokenKeys);
        setHiddenTokenKeys(catalog.hiddenTokenKeys);
        setOnchainFetchedTokenKeys(new Set());
        setApiUnavailable(catalog.apiUnavailable);

        // Paint API-backed rows immediately. Zero-value native placeholders are
        // kept out until the detached RPC pass can replace them with real
        // balances.
        const initialDisplayTokens = sortTokensByValue(
          mergedTokens.filter(hasRenderablePortfolioToken),
        );

        // Show merged data immediately so user isn't stuck on skeleton loader
        setTokens(initialDisplayTokens);
        setDefiPositions(catalog.defiPositions || []);
        setTotalValueUsd(catalog.totalValueUsd);
        setLoading(false);
        const fetchedAt = Date.now();
        setLastFetched(fetchedAt);
        const cacheKey = holdingsCacheKey(address, chainReloadKey);
        const applyEnrichedCatalog = async (
          baseTokens: PortfolioToken[],
          fetchedTokenKeys: Set<string>,
          rpcIssueChainIds: number[],
        ) => {
          try {
            const enrichedCatalog = await loadPortfolioTokenCatalog(address, {
              includeErc20PriceFallback: false,
              enrichTokenKeys: getVisibleTokenKeySet(
                baseTokens,
                showLowValueTokens,
              ),
            });
            if (!isCurrentLoad()) return;
            const enrichedTokens = mergeTokenEnrichment(
              baseTokens,
              enrichedCatalog.tokens,
            );
            const enrichedTotal =
              getWalletTokenTotal(enrichedTokens) +
              getDefiTotal(enrichedCatalog.defiPositions || []);
            const enrichedAt = Date.now();

            setTokens(enrichedTokens);
            setDefiPositions(enrichedCatalog.defiPositions || []);
            setTotalValueUsd(enrichedTotal);
            setCustomTokenKeys(enrichedCatalog.customTokenKeys);
            setAllTokenKeys(enrichedCatalog.allTokenKeys);
            setHiddenTokenKeys(enrichedCatalog.hiddenTokenKeys);
            setApiUnavailable(enrichedCatalog.apiUnavailable);
            setLastFetched(enrichedAt);
            writeHoldingsSnapshot(cacheKey, {
              tokens: enrichedTokens,
              defiPositions: enrichedCatalog.defiPositions || [],
              totalValueUsd: enrichedTotal,
              customTokenKeys: enrichedCatalog.customTokenKeys,
              allTokenKeys: enrichedCatalog.allTokenKeys,
              hiddenTokenKeys: enrichedCatalog.hiddenTokenKeys,
              onchainFetchedTokenKeys: fetchedTokenKeys,
              rpcIssueChainIds,
              apiUnavailable: enrichedCatalog.apiUnavailable,
              timestamp: enrichedAt,
            });
          } catch {
            // Metadata/price enrichment is best-effort; keep the fast catalog.
          }
        };
        const recordLoadedSnapshot = (total: number) => {
          schedulePortfolioBackgroundTask(async () => {
            try {
              await recordSnapshot(address, total, {
                force: options.forceSnapshot,
              });
              onSnapshotsChanged?.();
            } catch {
              // Snapshot failures should not block holdings rendering.
            }
          });
        };

        const tokensToRefresh = mergedTokens.filter((token) =>
          forcedRefreshTokenKeys.has(
            getPortfolioTokenKey(token.chainId, token.contractAddress),
          ) ||
          shouldFetchOnInitialPortfolioLoad(token, showLowValueTokens),
        );
        const refreshedKeys = getTokenKeySet(tokensToRefresh);

        if (tokensToRefresh.length === 0) {
          setLoading(false);
          setPortfolioBalanceRefreshing(false);
          writeHoldingsSnapshot(cacheKey, {
            tokens: initialDisplayTokens,
            defiPositions: catalog.defiPositions || [],
            totalValueUsd: catalog.totalValueUsd,
            customTokenKeys: catalog.customTokenKeys,
            allTokenKeys: catalog.allTokenKeys,
            hiddenTokenKeys: catalog.hiddenTokenKeys,
            onchainFetchedTokenKeys: new Set(),
            rpcIssueChainIds: [],
            apiUnavailable: catalog.apiUnavailable,
            timestamp: fetchedAt,
          });
          recordLoadedSnapshot(catalog.totalValueUsd);
          schedulePortfolioBackgroundTask(() =>
            applyEnrichedCatalog(initialDisplayTokens, new Set(), []),
          );
          return;
        }

        // Enhance visible primary balances in the background. Low-value ERC-20s
        // stay on catalog/API values until the collapsed group is expanded.
        setPortfolioBalanceRefreshing(true);
        schedulePortfolioBackgroundTask(async () => {
          try {
            const onchain = await fetchOnchainBalances(address, tokensToRefresh, {
              preserveZeroBalanceTokens: true,
            });
            if (!isCurrentLoad()) return;
            onRpcIssuesChange?.(onchain.rpcIssueChainIds);
            const displayTokens = mergeTokenBalanceRefresh(
              mergedTokens,
              onchain.tokens,
              refreshedKeys,
            );
            setTokens(displayTokens);
            setOnchainFetchedTokenKeys(refreshedKeys);
            setLoading(false);
            // Total = refreshed visible wallet tokens + deferred low-value API
            // values + DeFi positions.
            const total =
              getWalletTokenTotal(displayTokens) +
              getDefiTotal(catalog.defiPositions || []);
            setTotalValueUsd(total);
            writeHoldingsSnapshot(cacheKey, {
              tokens: displayTokens,
              defiPositions: catalog.defiPositions || [],
              totalValueUsd: total,
              customTokenKeys: catalog.customTokenKeys,
              allTokenKeys: catalog.allTokenKeys,
              hiddenTokenKeys: catalog.hiddenTokenKeys,
              onchainFetchedTokenKeys: refreshedKeys,
              rpcIssueChainIds: onchain.rpcIssueChainIds,
              apiUnavailable: catalog.apiUnavailable,
              timestamp: fetchedAt,
            });
            recordLoadedSnapshot(total);
            void applyEnrichedCatalog(
              displayTokens,
              refreshedKeys,
              onchain.rpcIssueChainIds,
            );
          } catch {
            if (!isCurrentLoad()) return;
            onRpcIssuesChange?.([]);
            setLoading(false);
            setOnchainFetchedTokenKeys(new Set());
            // RPC failed entirely — keep only the known non-zero tokens in
            // the cache too, so a refresh from cache doesn't bring back the
            // zero-balance placeholder rows we just suppressed.
            writeHoldingsSnapshot(cacheKey, {
              tokens: initialDisplayTokens,
              defiPositions: catalog.defiPositions || [],
              totalValueUsd: catalog.totalValueUsd,
              customTokenKeys: catalog.customTokenKeys,
              allTokenKeys: catalog.allTokenKeys,
              hiddenTokenKeys: catalog.hiddenTokenKeys,
              onchainFetchedTokenKeys: new Set(),
              rpcIssueChainIds: [],
              apiUnavailable: catalog.apiUnavailable,
              timestamp: fetchedAt,
            });
            recordLoadedSnapshot(catalog.totalValueUsd);
            schedulePortfolioBackgroundTask(() =>
              applyEnrichedCatalog(initialDisplayTokens, new Set(), []),
            );
          } finally {
            if (isCurrentLoad()) setPortfolioBalanceRefreshing(false);
          }
        });
        return;
      } catch (err) {
        if (!isCurrentLoad()) return;
        setError(err instanceof Error ? err.message : "Failed to load portfolio");
        onRpcIssuesChange?.([]);
        setPortfolioBalanceRefreshing(false);
        setLoading(false);
      }
    },
    [address, chainReloadKey, lastFetched, onRpcIssuesChange, onSnapshotsChanged, showLowValueTokens, tokens.length]
  );

  // Reload when address or the set of visible chains changes. Seed from the
  // module cache first, then from storage on fresh popup/sidepanel mounts, so
  // the list paints before the live API/RPC revalidation completes.
  useEffect(() => {
    let cancelled = false;
    const cacheKey = holdingsCacheKey(address, chainReloadKey);
    const cached = readCachedHoldingsSnapshot(cacheKey);
    if (cached) {
      applyHoldingsSnapshot(cached);
      void loadPortfolio(true, { suppressSkeleton: true });
      return () => {
        cancelled = true;
      };
    } else {
      setTokens([]);
      setDefiPositions([]);
      setTotalValueUsd(0);
      setCustomTokenKeys(new Set());
      setAllTokenKeys(new Set());
      setHiddenTokenKeys(new Set());
      setOnchainFetchedTokenKeys(new Set());
      setApiUnavailable(false);
      setLastFetched(0);
      setLoading(true);
      setPortfolioBalanceRefreshing(false);
      setLowValueLoading(false);
    }

    void (async () => {
      let hydrated = false;
      try {
        const storedSnapshot = await getPortfolioHoldingsSnapshot(cacheKey);
        if (cancelled || !storedSnapshot) return;
        const snapshot = fromStoredHoldingsSnapshot(storedSnapshot);
        if (!hasHoldingsSnapshotContent(snapshot)) return;
        holdingsCache.set(cacheKey, snapshot);
        applyHoldingsSnapshot(snapshot);
        hydrated = true;
      } catch {
        // Persistent holdings cache is optional; fall through to live loading.
      } finally {
        if (!cancelled) {
          void loadPortfolio(true, { suppressSkeleton: hydrated });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, chainReloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hot-refresh portfolio whenever a confirmed tx writes asset changes. The
  // receipt's ERC-20s bypass the low-value deferral so the just-touched rows
  // get immediate RPC balances even while "Under $0.10" stays collapsed.
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
      const receiptRefresh = getReceiptTokenRefresh(updated);
      loadPortfolio(true, {
        forceRefreshTokenKeys: receiptRefresh.tokenKeys,
        forceRefreshTokens: receiptRefresh.tokenStubs,
      });
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [address, loadPortfolio]);

  // Set of "chainId-address" keys for dedup in AddTokenModal
  const tokenKeys = useMemo(
    () =>
      new Set(
        tokens.map((token) =>
          getPortfolioTokenKey(token.chainId, token.contractAddress),
        ),
      ),
    [tokens]
  );

  // Apply network filter
  const filteredTokens = useMemo(
    () => filterChainId != null ? tokens.filter((t) => t.chainId === filterChainId) : tokens,
    [tokens, filterChainId]
  );

  const { primaryTokens, lowValueTokens, lowValueTotalUsd } = useMemo(() => {
    const primary: PortfolioToken[] = [];
    const lowValue: PortfolioToken[] = [];

    for (const token of filteredTokens) {
      if (token.valueUsd < LOW_VALUE_TOKEN_THRESHOLD_USD) {
        lowValue.push(token);
      } else {
        primary.push(token);
      }
    }

    return {
      primaryTokens: primary,
      lowValueTokens: lowValue,
      lowValueTotalUsd: lowValue.reduce(
        (sum, token) => sum + token.valueUsd,
        0,
      ),
    };
  }, [filteredTokens]);

  const refreshLowValueTokenBalances = useCallback(async () => {
    if (!address || portfolioBalanceRefreshing || lowValueLoading) return;

    const tokensToRefresh = lowValueTokens.filter((token) => {
      const key = getPortfolioTokenKey(token.chainId, token.contractAddress);
      return !hiddenTokenKeys.has(key) && !onchainFetchedTokenKeys.has(key);
    });
    if (tokensToRefresh.length === 0) return;

    const refreshedKeys = getTokenKeySet(tokensToRefresh);
    setLowValueLoading(true);

    try {
      const onchain = await fetchOnchainBalances(address, tokensToRefresh, {
        preserveZeroBalanceTokens: true,
      });
      onRpcIssuesChange?.(onchain.rpcIssueChainIds);

      const nextTokens = mergeTokenBalanceRefresh(
        tokens,
        onchain.tokens,
        refreshedKeys,
      );
      const nextFetchedKeys = new Set(onchainFetchedTokenKeys);
      refreshedKeys.forEach((key) => nextFetchedKeys.add(key));
      const total = getWalletTokenTotal(nextTokens) + getDefiTotal(defiPositions);
      const fetchedAt = Date.now();
      const cacheKey = holdingsCacheKey(address, chainReloadKey);

      setTokens(nextTokens);
      setOnchainFetchedTokenKeys(nextFetchedKeys);
      setTotalValueUsd(total);
      setLastFetched(fetchedAt);
      writeHoldingsSnapshot(cacheKey, {
        tokens: nextTokens,
        defiPositions,
        totalValueUsd: total,
        customTokenKeys,
        allTokenKeys,
        hiddenTokenKeys,
        onchainFetchedTokenKeys: nextFetchedKeys,
        rpcIssueChainIds: onchain.rpcIssueChainIds,
        apiUnavailable,
        timestamp: fetchedAt,
      });

      try {
        await recordSnapshot(address, total);
        onSnapshotsChanged?.();
      } catch {
        // Snapshot failures should not block expanded low-value rows.
      }
    } catch {
      // Keep catalog/API balances for the collapsed group if RPC refresh fails.
    } finally {
      setLowValueLoading(false);
    }
  }, [
    address,
    allTokenKeys,
    apiUnavailable,
    chainReloadKey,
    customTokenKeys,
    defiPositions,
    hiddenTokenKeys,
    lowValueLoading,
    lowValueTokens,
    onRpcIssuesChange,
    onSnapshotsChanged,
    onchainFetchedTokenKeys,
    portfolioBalanceRefreshing,
    tokens,
  ]);

  useEffect(() => {
    if (!showLowValueTokens || portfolioBalanceRefreshing) return;
    void refreshLowValueTokenBalances();
  }, [
    portfolioBalanceRefreshing,
    refreshLowValueTokenBalances,
    showLowValueTokens,
  ]);

  const filteredDefiPositions = useMemo(
    () => filterChainId != null ? defiPositions.filter((p) => p.chainId === filterChainId) : defiPositions,
    [defiPositions, filterChainId]
  );

  // Batch the logo-cache lookup across only the rows currently visible. The
  // collapsed <$0.10 section can contain many dust tokens; warming those images
  // while hidden creates background network and storage churn for no UI value.
  const cachedLogoMap = useCachedAvatarMap(
    useMemo(() => {
      const urls: Array<string | null | undefined> = [];
      for (const token of primaryTokens) {
        collectTokenLogoUrls(token, urls);
      }
      if (showLowValueTokens) {
        for (const token of lowValueTokens) {
          collectTokenLogoUrls(token, urls);
        }
      }
      for (const position of filteredDefiPositions) {
        urls.push(position.protocolLogo);
        for (const asset of position.assets ?? []) urls.push(asset.logoUrl);
        for (const asset of position.rewardAssets ?? []) urls.push(asset.logoUrl);
      }
      return urls;
    }, [filteredDefiPositions, lowValueTokens, primaryTokens, showLowValueTokens]),
  );
  const resolveLogo = useCallback(
    (url: string | undefined): string | undefined =>
      (url && cachedLogoMap.get(url)) || url,
    [cachedLogoMap],
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
      refresh: (options?: LoadPortfolioOptions) =>
        loadPortfolioRef.current(true, options),
      tokenKeys,
      allTokenKeys,
      hiddenTokenKeys,
      apiUnavailable,
    });
  }, [
    totalValueUsd,
    loading,
    hideValue,
    onStateChange,
    tokenKeys,
    allTokenKeys,
    hiddenTokenKeys,
    apiUnavailable,
  ]);

  const formatUsd = (value: number): string =>
    formatUsdShared(value, { hide: hideValue });

  const openHideTokenModal = (token: PortfolioToken) => {
    setTokenToHide(token);
  };

  const closeHideTokenModal = () => {
    if (hidingToken) return;
    setTokenToHide(null);
  };

  const confirmHideToken = async () => {
    if (!tokenToHide) return;
    const tokenKey = getPortfolioTokenKey(
      tokenToHide.chainId,
      tokenToHide.contractAddress,
    );
    setHidingToken(true);
    try {
      await hidePortfolioToken(tokenToHide);
      await clearHoldingsCaches();
      setTokens((prev) =>
        prev.filter(
          (token) =>
            getPortfolioTokenKey(token.chainId, token.contractAddress) !==
            tokenKey,
        ),
      );
      setHiddenTokenKeys((prev) => new Set(prev).add(tokenKey));
      setOnchainFetchedTokenKeys((prev) => {
        const next = new Set(prev);
        next.delete(tokenKey);
        return next;
      });
      setTotalValueUsd((prev) =>
        Math.max(0, prev - Math.max(0, tokenToHide.valueUsd || 0)),
      );
      setTokenToHide(null);
      await loadPortfolio(true, { forceSnapshot: true });
    } finally {
      setHidingToken(false);
    }
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
      ) : primaryTokens.length === 0 && lowValueTokens.length === 0 && filteredDefiPositions.length === 0 ? (
        <Box p={3} minH="140px" display="flex" alignItems="center" justifyContent="center">
          <Text fontSize="sm" color="text.tertiary" textAlign="center">
            No tokens found
          </Text>
        </Box>
      ) : (
        <>
          {primaryTokens.map((token, i) => (
            <TokenRow
              key={`${token.chainId}-${token.contractAddress}-${i}`}
              rowKey={`${token.chainId}-${token.contractAddress}-${i}`}
              token={token}
              hasBottomBorder={
                i < primaryTokens.length - 1 ||
                lowValueTokens.length > 0 ||
                filteredDefiPositions.length > 0
              }
              customTokenKeys={customTokenKeys}
              networksInfo={networksInfo}
              onTokenClick={onTokenClick}
              onSwapClick={onSwapClick}
              onEditToken={(nextToken) => {
                setEditingToken(nextToken);
                editModal.onOpen();
              }}
              onHideToken={openHideTokenModal}
              resolveLogo={resolveLogo}
              copiedAddr={copiedAddr}
              setCopiedAddr={setCopiedAddr}
              hideValue={hideValue}
              formatUsd={formatUsd}
            />
          ))}

          {lowValueTokens.length > 0 && (
            <Box w="full">
              <HStack
                w="full"
                px={3}
                py={2}
                bg="bg.muted"
                borderBottom={
                  showLowValueTokens || filteredDefiPositions.length > 0
                    ? "1px solid"
                    : "none"
                }
                borderColor="border.subtle"
                justify="space-between"
                cursor="pointer"
                onClick={() => setShowLowValueTokens((open) => !open)}
                _hover={{ bg: "bg.hover" }}
              >
                <HStack spacing={1.5} minW={0}>
                  <ChevronDownIcon
                    boxSize="14px"
                    color="text.secondary"
                    transform={
                      showLowValueTokens ? "rotate(0deg)" : "rotate(-90deg)"
                    }
                    transition="transform 0.15s"
                    flexShrink={0}
                  />
                  <Text
                    fontSize="10px"
                    fontWeight="800"
                    color="text.secondary"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    noOfLines={1}
                  >
                    Under $0.10
                  </Text>
                  {lowValueLoading && (
                    <Spinner
                      thickness="2px"
                      speed="0.65s"
                      color="text.secondary"
                      boxSize="12px"
                      flexShrink={0}
                    />
                  )}
                </HStack>
                <Text
                  fontSize="10px"
                  fontWeight="700"
                  color="text.tertiary"
                  noOfLines={1}
                >
                  {lowValueTokens.length}{" "}
                  {lowValueTokens.length === 1 ? "token" : "tokens"} ·{" "}
                  {formatUsd(lowValueTotalUsd)}
                </Text>
                </HStack>
                <Collapse in={showLowValueTokens} animateOpacity>
                  {showLowValueTokens ? (
                    <VStack spacing={0} w="full">
                      {lowValueTokens.map((token, i) => (
                        <TokenRow
                          key={`low-${token.chainId}-${token.contractAddress}-${i}`}
                          rowKey={`low-${token.chainId}-${token.contractAddress}-${i}`}
                          token={token}
                          hasBottomBorder={
                            i < lowValueTokens.length - 1 ||
                            filteredDefiPositions.length > 0
                          }
                          customTokenKeys={customTokenKeys}
                          networksInfo={networksInfo}
                          onTokenClick={onTokenClick}
                          onSwapClick={onSwapClick}
                          onEditToken={(nextToken) => {
                            setEditingToken(nextToken);
                            editModal.onOpen();
                          }}
                          onHideToken={openHideTokenModal}
                          resolveLogo={resolveLogo}
                          copiedAddr={copiedAddr}
                          setCopiedAddr={setCopiedAddr}
                          hideValue={hideValue}
                          formatUsd={formatUsd}
                        />
                      ))}
                    </VStack>
                  ) : null}
                </Collapse>
              </Box>
            )}

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
                              src={resolveLogo(pos.protocolLogo)}
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
    <>
      <EditCustomTokenModal
        isOpen={editModal.isOpen}
        onClose={editModal.onClose}
        onUpdated={() => loadPortfolio(true, { forceSnapshot: true })}
        token={editingToken}
      />
      <HideTokenModal
        isOpen={!!tokenToHide}
        token={tokenToHide}
        isLoading={hidingToken}
        onClose={closeHideTokenModal}
        onConfirm={confirmHideToken}
      />
    </>
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
