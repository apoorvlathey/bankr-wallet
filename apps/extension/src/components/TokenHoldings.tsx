import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  memo,
} from "react";
import {
  Box,
  Button,
  Collapse,
  Flex,
  HStack,
  Image,
  Text,
  Skeleton,
  IconButton,
  Tooltip,
  Spinner,
  usePrefersReducedMotion,
} from "@chakra-ui/react";
import { ChevronDownIcon, RepeatIcon, ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
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
import EditCustomTokenModal from "@/components/EditCustomTokenModal";
import HideTokenModal from "@/components/HideTokenModal";
import {
  DefiPositionRow,
  PortfolioTokenRow,
} from "@/components/PortfolioHoldingRows";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateHeader,
  EmptyStateTitle,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
  ListSurface,
  SkeletonRow,
} from "@/components/ui";
import {
  LOW_VALUE_TOKEN_THRESHOLD_USD,
  getDefiTotal,
  getTokenKeySet,
  getWalletTokenTotal,
  hasPositiveBalance,
  getReceiptTokenRefresh,
  getPortfolioTokenBalance,
  isNativePortfolioToken,
  mergeVerifiedTokenBalances,
  shouldFetchOnInitialPortfolioLoad,
  sortTokensByValue,
} from "@/components/tokenHoldingsUtils";
import { useNetworks } from "@/contexts/NetworksContext";
import { getVisibleChains } from "@/lib/chains";
import { CHAIN_REGISTRY } from "@/constants/chainRegistry";
import {
  CANONICAL_USDC_BY_CHAIN_ID,
  CANONICAL_USDT_BY_CHAIN_ID,
} from "@/constants/canonicalTokens";
import { formatUsd as formatUsdShared } from "@/lib/currencyFormatUtils";
import { useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";
import type { NetworksInfo } from "@/types";

// Module-level cache so navigating away and back to the homepage doesn't flash
// a skeleton. We seed state from here on mount and refetch in the background.
const MIN_PRIMARY_TOKEN_ROWS = 4;
const BUILT_IN_ETH_MAINNET_CHAIN_IDS = new Set(
  CHAIN_REGISTRY
    .filter((chain) => chain.nativeCurrency.symbol === "ETH")
    .map((chain) => chain.chainId),
);

type AssetDisplayRow =
  | { kind: "token"; token: PortfolioToken; valueUsd: number }
  | {
      kind: "aggregate";
      symbol: "ETH" | "USDC" | "USDT";
      tokens: PortfolioToken[];
      valueUsd: number;
    };

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
  searchQuery?: string;
  onSnapshotsChanged?: () => void;
  view?: "all" | "assets" | "positions";
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
    chainTotals: ReadonlyMap<number, number>;
  }) => void;
}

interface LoadPortfolioOptions {
  forceSnapshot?: boolean;
  forceRefreshTokenKeys?: Set<string>;
  forceRefreshTokens?: PortfolioToken[];
  suppressSkeleton?: boolean;
}

interface TokenRowProps {
  token: PortfolioToken;
  customTokenKeys: Set<string>;
  networksInfo: NetworksInfo;
  onTokenClick?: (token: PortfolioToken) => void;
  onSwapClick?: (token: PortfolioToken) => void;
  onEditToken: (token: PortfolioToken) => void;
  onHideToken: (token: PortfolioToken) => void;
  resolveLogo: (url: string | undefined) => string | undefined;
  hideValue: boolean;
  formatUsd: (value: number) => string;
  displayMode?: "token" | "chainBreakdown";
}

function TokenRow({
  token,
  customTokenKeys,
  networksInfo,
  onTokenClick,
  onSwapClick,
  onEditToken,
  onHideToken,
  resolveLogo,
  hideValue,
  formatUsd,
  displayMode,
}: TokenRowProps) {
  return (
    <PortfolioTokenRow
      token={token}
      tokenKey={getPortfolioTokenKey(token.chainId, token.contractAddress)}
      customTokenKeys={customTokenKeys}
      networksInfo={networksInfo}
      onTokenClick={onTokenClick}
      onSwapClick={onSwapClick}
      onEditToken={onEditToken}
      onHideToken={onHideToken}
      resolveLogo={resolveLogo}
      hideValue={hideValue}
      formatUsd={formatUsd}
      displayMode={displayMode}
    />
  );
}

interface AggregatedAssetRowProps
  extends Omit<TokenRowProps, "token" | "displayMode"> {
  symbol: "ETH" | "USDC" | "USDT";
  tokens: PortfolioToken[];
}

function AggregatedAssetRow({
  symbol,
  tokens,
  customTokenKeys,
  networksInfo,
  onTokenClick,
  onSwapClick,
  onEditToken,
  onHideToken,
  resolveLogo,
  hideValue,
  formatUsd,
}: AggregatedAssetRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const totalBalance = tokens.reduce(
    (sum, token) => sum + getPortfolioTokenBalance(token),
    0,
  );
  const totalValueUsd = tokens.reduce((sum, token) => sum + token.valueUsd, 0);
  const logoUrl = tokens.find((token) => token.logoUrl)?.logoUrl;
  const sortedTokens = [...tokens].sort((a, b) => b.valueUsd - a.valueUsd);

  return (
    <Box as="li" listStyleType="none" borderBottomWidth="1px" borderBottomColor="border.subtle">
      <Flex
        as="button"
        type="button"
        role="group"
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? "Collapse" : "Expand"} ${symbol} balances across chains`}
        w="full"
        minH="56px"
        px={4}
        py={3}
        gap={3}
        align="center"
        textAlign="start"
        color="fg.primary"
        bg="transparent"
        border={0}
        cursor="pointer"
        transitionProperty="background-color, box-shadow"
        transitionDuration="fast"
        _hover={{ bg: "surface.raisedHover" }}
        _active={{ bg: "surface.sunken" }}
        _focus={{ outline: "none" }}
        _focusVisible={{
          boxShadow: "inset 0 0 0 2px var(--chakra-colors-border-focus)",
        }}
        onClick={() => setIsExpanded((expanded) => !expanded)}
      >
        <ListItemMedia>
          <Flex
            boxSize="28px"
            align="center"
            justify="center"
            overflow="hidden"
            bg="surface.sunken"
            borderRadius="full"
          >
            {logoUrl ? (
              <Image
                src={resolveLogo(logoUrl)}
                alt=""
                boxSize="28px"
                borderRadius="full"
              />
            ) : (
              <Text fontSize="2xs" fontWeight={700} color="fg.secondary">
                {symbol}
              </Text>
            )}
          </Flex>
        </ListItemMedia>
        <ListItemContent>
          <HStack spacing={1.5}>
            <ListItemTitle fontSize="sm">{symbol}</ListItemTitle>
            <Text as="span" fontSize="2xs" color="fg.muted" whiteSpace="nowrap">
              {tokens.length} networks
            </Text>
            <Flex boxSize="18px" flexShrink={0} align="center" justify="center">
              <ChevronDownIcon
                boxSize="18px"
                color="fg.secondary"
                opacity={isExpanded ? 1 : 0}
                transform={isExpanded ? "rotate(180deg)" : "rotate(0deg)"}
                transitionProperty="opacity, transform"
                transitionDuration="fast"
                _groupHover={{ opacity: 1 }}
                _groupFocusVisible={{ opacity: 1 }}
              />
            </Flex>
          </HStack>
          <ListItemDescription fontSize="xs" noOfLines={1}>
            {hideValue ? "••••" : totalBalance.toLocaleString("en-US", {
              maximumFractionDigits: 8,
            })}
          </ListItemDescription>
        </ListItemContent>
        <ListItemMeta flex="0 0 auto" minW="76px">
          <Text
            as="span"
            display="block"
            color="fg.primary"
            fontSize="sm"
            fontWeight={600}
            sx={{ fontVariantNumeric: "tabular-nums" }}
            noOfLines={1}
          >
            {formatUsd(totalValueUsd)}
          </Text>
        </ListItemMeta>
      </Flex>
      <Collapse in={isExpanded} animateOpacity>
        {isExpanded && (
          <Box
            as="ul"
            role="list"
            w="full"
            m={0}
            p={0}
            overflow="hidden"
            listStyleType="none"
            bg="surface.raisedHover"
            borderRadius={0}
            sx={{
              "& > li:first-of-type > *": { borderTopRadius: 0 },
              "& > li:last-of-type > *": { borderBottomRadius: 0 },
            }}
          >
            {sortedTokens.map((token) => (
              <TokenRow
                key={`${symbol.toLowerCase()}-chain-${token.chainId}`}
                token={token}
                customTokenKeys={customTokenKeys}
                networksInfo={networksInfo}
                onTokenClick={onTokenClick}
                onSwapClick={onSwapClick}
                onEditToken={onEditToken}
                onHideToken={onHideToken}
                resolveLogo={resolveLogo}
                hideValue={hideValue}
                formatUsd={formatUsd}
                displayMode="chainBreakdown"
              />
            ))}
          </Box>
        )}
      </Collapse>
    </Box>
  );
}

function TokenHoldings({ address, onTokenClick, onSwapClick, hideHeader, hideCard, onRpcIssuesChange, filterChainId, searchQuery = "", onSnapshotsChanged, onStateChange, view = "all" }: TokenHoldingsProps) {
  const { networksInfo } = useNetworks();
  const prefersReducedMotion = usePrefersReducedMotion();
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
  const [showLowValueTokens, setShowLowValueTokens] = useState(false);
  const lowValueDisclosureRef = useRef<HTMLDivElement | null>(null);
  const [portfolioBalanceRefreshing, setPortfolioBalanceRefreshing] = useState(false);
  const [lowValueLoading, setLowValueLoading] = useState(false);
  const editModal = useDisclosure();
  const loadVersionRef = useRef(0);
  const verifiedBalanceTokensRef = useRef(new Map<string, PortfolioToken>());
  const verifiedBalanceKeysRef = useRef(new Set<string>());

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
      verifiedBalanceKeysRef.current = new Set(snapshot.onchainFetchedTokenKeys);
      verifiedBalanceTokensRef.current = new Map(
        snapshot.tokens
          .filter((token) =>
            snapshot.onchainFetchedTokenKeys.has(
              getPortfolioTokenKey(token.chainId, token.contractAddress),
            ),
          )
          .map((token) => [
            getPortfolioTokenKey(token.chainId, token.contractAddress),
            token,
          ]),
      );
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
        const applyVerifiedBalances = (baseTokens: PortfolioToken[]) =>
          mergeVerifiedTokenBalances(
            baseTokens,
            Array.from(verifiedBalanceTokensRef.current.values()),
            verifiedBalanceKeysRef.current,
          );

        setCustomTokenKeys(catalog.customTokenKeys);
        setAllTokenKeys(catalog.allTokenKeys);
        setHiddenTokenKeys(catalog.hiddenTokenKeys);
        setOnchainFetchedTokenKeys(new Set(verifiedBalanceKeysRef.current));
        setApiUnavailable(catalog.apiUnavailable);

        // Paint API-backed rows immediately. Zero-value native placeholders are
        // kept out until the detached RPC pass can replace them with real
        // balances.
        const initialDisplayTokens = applyVerifiedBalances(
          mergedTokens.filter(hasRenderablePortfolioToken),
        );
        const initialTotal =
          getWalletTokenTotal(initialDisplayTokens) +
          getDefiTotal(catalog.defiPositions || []);

        // Show merged data immediately so user isn't stuck on skeleton loader
        setTokens(initialDisplayTokens);
        setDefiPositions(catalog.defiPositions || []);
        setTotalValueUsd(initialTotal);
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
            const enrichedTokens = applyVerifiedBalances(
              mergeTokenEnrichment(baseTokens, enrichedCatalog.tokens),
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
        if (tokensToRefresh.length === 0) {
          setLoading(false);
          setPortfolioBalanceRefreshing(false);
          writeHoldingsSnapshot(cacheKey, {
            tokens: initialDisplayTokens,
            defiPositions: catalog.defiPositions || [],
            totalValueUsd: initialTotal,
            customTokenKeys: catalog.customTokenKeys,
            allTokenKeys: catalog.allTokenKeys,
            hiddenTokenKeys: catalog.hiddenTokenKeys,
            onchainFetchedTokenKeys: new Set(verifiedBalanceKeysRef.current),
            rpcIssueChainIds: [],
            apiUnavailable: catalog.apiUnavailable,
            timestamp: fetchedAt,
          });
          recordLoadedSnapshot(initialTotal);
          schedulePortfolioBackgroundTask(() =>
            applyEnrichedCatalog(
              initialDisplayTokens,
              new Set(verifiedBalanceKeysRef.current),
              [],
            ),
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
            for (const token of onchain.tokens) {
              const key = getPortfolioTokenKey(
                token.chainId,
                token.contractAddress,
              );
              if (!onchain.verifiedTokenKeys.has(key)) continue;
              verifiedBalanceTokensRef.current.set(key, token);
              verifiedBalanceKeysRef.current.add(key);
            }
            const verifiedKeys = new Set(verifiedBalanceKeysRef.current);
            const displayTokens = mergeVerifiedTokenBalances(
              mergedTokens,
              Array.from(verifiedBalanceTokensRef.current.values()),
              verifiedKeys,
            );
            setTokens(displayTokens);
            setOnchainFetchedTokenKeys(verifiedKeys);
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
              onchainFetchedTokenKeys: verifiedKeys,
              rpcIssueChainIds: onchain.rpcIssueChainIds,
              apiUnavailable: catalog.apiUnavailable,
              timestamp: fetchedAt,
            });
            recordLoadedSnapshot(total);
            void applyEnrichedCatalog(
              displayTokens,
              verifiedKeys,
              onchain.rpcIssueChainIds,
            );
          } catch {
            if (!isCurrentLoad()) return;
            onRpcIssuesChange?.([]);
            setLoading(false);
            const verifiedKeys = new Set(verifiedBalanceKeysRef.current);
            setOnchainFetchedTokenKeys(verifiedKeys);
            // RPC failed entirely — keep only the known non-zero tokens in
            // the cache too, so a refresh from cache doesn't bring back the
            // zero-balance placeholder rows we just suppressed.
            writeHoldingsSnapshot(cacheKey, {
              tokens: initialDisplayTokens,
              defiPositions: catalog.defiPositions || [],
              totalValueUsd: initialTotal,
              customTokenKeys: catalog.customTokenKeys,
              allTokenKeys: catalog.allTokenKeys,
              hiddenTokenKeys: catalog.hiddenTokenKeys,
              onchainFetchedTokenKeys: verifiedKeys,
              rpcIssueChainIds: [],
              apiUnavailable: catalog.apiUnavailable,
              timestamp: fetchedAt,
            });
            recordLoadedSnapshot(initialTotal);
            schedulePortfolioBackgroundTask(() =>
              applyEnrichedCatalog(initialDisplayTokens, verifiedKeys, []),
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
    verifiedBalanceTokensRef.current.clear();
    verifiedBalanceKeysRef.current.clear();
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

  // Apply network and asset-search filters before building aggregate rows.
  const filteredTokens = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    return tokens.filter((token) => {
      if (filterChainId != null && token.chainId !== filterChainId) return false;
      if (!normalizedQuery) return true;
      return (
        token.name.toLocaleLowerCase().includes(normalizedQuery) ||
        token.symbol.toLocaleLowerCase().includes(normalizedQuery)
      );
    });
  }, [filterChainId, searchQuery, tokens]);

  const { primaryAssetRows, lowValueAssetRows, lowValueTotalUsd } = useMemo(() => {
    const ethTokens = filterChainId == null
      ? filteredTokens.filter(
          (token) =>
            isNativePortfolioToken(token) &&
            token.symbol.toUpperCase() === "ETH" &&
            BUILT_IN_ETH_MAINNET_CHAIN_IDS.has(token.chainId),
        )
      : [];
    const usdcTokens = filterChainId == null
      ? filteredTokens.filter(
          (token) =>
            CANONICAL_USDC_BY_CHAIN_ID.get(token.chainId) ===
            token.contractAddress.toLowerCase(),
        )
      : [];
    const usdtTokens = filterChainId == null
      ? filteredTokens.filter(
          (token) =>
            CANONICAL_USDT_BY_CHAIN_ID.get(token.chainId) ===
            token.contractAddress.toLowerCase(),
        )
      : [];
    const aggregateGroups = [
      { symbol: "ETH" as const, tokens: ethTokens },
      { symbol: "USDC" as const, tokens: usdcTokens },
      { symbol: "USDT" as const, tokens: usdtTokens },
    ].filter((group) => group.tokens.length > 1);
    const aggregatedTokenKeys = new Set(
      aggregateGroups.flatMap((group) =>
        group.tokens.map((token) =>
          getPortfolioTokenKey(token.chainId, token.contractAddress),
        ),
      ),
    );
    const displayRows: AssetDisplayRow[] = filteredTokens
      .filter(
        (token) =>
          !aggregatedTokenKeys.has(
            getPortfolioTokenKey(token.chainId, token.contractAddress),
          ),
      )
      .map((token) => ({ kind: "token", token, valueUsd: token.valueUsd }));

    for (const group of aggregateGroups) {
      displayRows.push({
        kind: "aggregate",
        symbol: group.symbol,
        tokens: group.tokens,
        valueUsd: group.tokens.reduce((sum, token) => sum + token.valueUsd, 0),
      });
    }

    displayRows.sort((a, b) => b.valueUsd - a.valueUsd);
    const primary: AssetDisplayRow[] = [];
    const lowValue: AssetDisplayRow[] = [];

    for (const [index, row] of displayRows.entries()) {
      const belongsInLowValueGroup =
        displayRows.length > MIN_PRIMARY_TOKEN_ROWS &&
        index >= MIN_PRIMARY_TOKEN_ROWS &&
        row.valueUsd < LOW_VALUE_TOKEN_THRESHOLD_USD;

      if (belongsInLowValueGroup) {
        lowValue.push(row);
      } else {
        primary.push(row);
      }
    }

    return {
      primaryAssetRows: primary,
      lowValueAssetRows: lowValue,
      lowValueTotalUsd: lowValue.reduce(
        (sum, row) => sum + row.valueUsd,
        0,
      ),
    };
  }, [filterChainId, filteredTokens]);

  const primaryTokens = useMemo(
    () =>
      primaryAssetRows.flatMap((row) =>
        row.kind === "token" ? [row.token] : row.tokens,
      ),
    [primaryAssetRows],
  );
  const lowValueTokens = useMemo(
    () =>
      lowValueAssetRows.flatMap((row) =>
        row.kind === "token" ? [row.token] : row.tokens,
      ),
    [lowValueAssetRows],
  );

  const refreshLowValueTokenBalances = useCallback(async () => {
    if (!address || portfolioBalanceRefreshing || lowValueLoading) return;

    const tokensToRefresh = lowValueTokens.filter((token) => {
      const key = getPortfolioTokenKey(token.chainId, token.contractAddress);
      return !hiddenTokenKeys.has(key) && !onchainFetchedTokenKeys.has(key);
    });
    if (tokensToRefresh.length === 0) return;

    setLowValueLoading(true);

    try {
      const onchain = await fetchOnchainBalances(address, tokensToRefresh, {
        preserveZeroBalanceTokens: true,
      });
      onRpcIssuesChange?.(onchain.rpcIssueChainIds);

      for (const token of onchain.tokens) {
        const key = getPortfolioTokenKey(token.chainId, token.contractAddress);
        if (!onchain.verifiedTokenKeys.has(key)) continue;
        verifiedBalanceTokensRef.current.set(key, token);
        verifiedBalanceKeysRef.current.add(key);
      }
      const nextFetchedKeys = new Set(verifiedBalanceKeysRef.current);
      const nextTokens = mergeVerifiedTokenBalances(
        tokens,
        Array.from(verifiedBalanceTokensRef.current.values()),
        nextFetchedKeys,
      );
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

  const scrollLowValueDisclosureIntoView = useCallback(() => {
    if (!showLowValueTokens) return;

    lowValueDisclosureRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [prefersReducedMotion, showLowValueTokens]);

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
  const chainTotals = useMemo(() => {
    const totals = new Map<number, number>();
    for (const token of tokens) {
      totals.set(
        token.chainId,
        (totals.get(token.chainId) ?? 0) + Math.max(0, token.valueUsd || 0),
      );
    }
    for (const position of defiPositions) {
      totals.set(
        position.chainId,
        (totals.get(position.chainId) ?? 0) + Math.max(0, position.valueUsd || 0),
      );
    }
    return totals;
  }, [defiPositions, tokens]);
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
      chainTotals,
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
    chainTotals,
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
    return (
      <EmptyState minH="144px">
        <EmptyStateHeader>
          <EmptyStateTitle>Portfolio unavailable</EmptyStateTitle>
          <EmptyStateDescription>
            WalletChan could not load your balances. Your wallet is still safe.
          </EmptyStateDescription>
        </EmptyStateHeader>
        <EmptyStateActions>
          <Button
            leftIcon={<RepeatIcon />}
            variant="secondary"
            onClick={() => loadPortfolio(true)}
          >
            Try again
          </Button>
        </EmptyStateActions>
      </EmptyState>
    );
  }

  const showAssets = view !== "positions";
  const showPositions = view !== "assets";
  const hasVisibleAssets =
    showAssets && (primaryAssetRows.length > 0 || lowValueAssetRows.length > 0);
  const hasVisiblePositions =
    showPositions && filteredDefiPositions.length > 0;
  const hasVisibleRows = hasVisibleAssets || hasVisiblePositions;

  const tokenList = (
    <ListSurface
      borderWidth={hideCard ? 0 : "1px"}
      borderRadius={hideCard ? 0 : "lg"}
      bg={hideCard ? "transparent" : "surface.raised"}
    >
      {loading && tokens.length === 0 ? (
        Array.from({ length: 3 }).map((_, index) => (
          <SkeletonRow key={index} density="default" />
        ))
      ) : !hasVisibleRows ? (
        <Box as="li" listStyleType="none">
          <EmptyState minH="144px">
            <EmptyStateHeader>
              <EmptyStateTitle>
                {view === "assets" && searchQuery.trim()
                  ? "No matching assets"
                  : view === "positions"
                  ? "No DeFi positions"
                  : view === "assets"
                    ? "No assets found"
                    : "No assets or positions"}
              </EmptyStateTitle>
              <EmptyStateDescription>
                {view === "assets" && searchQuery.trim()
                  ? "Try another token name or symbol."
                  : view === "positions"
                  ? "Positions from supported protocols will appear here."
                  : "Tokens with a balance will appear here."}
              </EmptyStateDescription>
            </EmptyStateHeader>
          </EmptyState>
        </Box>
      ) : (
        <>
          {showAssets &&
            primaryAssetRows.map((row, index) =>
              row.kind === "aggregate" ? (
                <AggregatedAssetRow
                  key={`aggregated-${row.symbol.toLowerCase()}`}
                  symbol={row.symbol}
                  tokens={row.tokens}
                  customTokenKeys={customTokenKeys}
                  networksInfo={networksInfo ?? {}}
                  onTokenClick={onTokenClick}
                  onSwapClick={onSwapClick}
                  onEditToken={(nextToken) => {
                    setEditingToken(nextToken);
                    editModal.onOpen();
                  }}
                  onHideToken={openHideTokenModal}
                  resolveLogo={resolveLogo}
                  hideValue={hideValue}
                  formatUsd={formatUsd}
                />
              ) : (
                <TokenRow
                  key={`${row.token.chainId}-${row.token.contractAddress}-${index}`}
                  token={row.token}
                  customTokenKeys={customTokenKeys}
                  networksInfo={networksInfo ?? {}}
                  onTokenClick={onTokenClick}
                  onSwapClick={onSwapClick}
                  onEditToken={(nextToken) => {
                    setEditingToken(nextToken);
                    editModal.onOpen();
                  }}
                  onHideToken={openHideTokenModal}
                  resolveLogo={resolveLogo}
                  hideValue={hideValue}
                  formatUsd={formatUsd}
                />
              ),
            )}

          {showAssets && lowValueAssetRows.length > 0 && (
            <Box
              ref={lowValueDisclosureRef}
              as="li"
              w="full"
              listStyleType="none"
              borderBottomWidth={hasVisiblePositions ? "1px" : 0}
              borderBottomColor="border.subtle"
            >
              <Flex
                as="button"
                type="button"
                aria-expanded={showLowValueTokens}
                w="full"
                minH="52px"
                px={4}
                py={2.5}
                gap={3}
                align="center"
                textAlign="start"
                color="fg.primary"
                bg="transparent"
                border={0}
                cursor="pointer"
                transitionProperty="background-color, box-shadow"
                transitionDuration="fast"
                _hover={{ bg: "surface.raisedHover" }}
                _active={{ bg: "surface.sunken" }}
                _focus={{ outline: "none" }}
                _focusVisible={{
                  boxShadow:
                    "inset 0 0 0 2px var(--chakra-colors-border-focus)",
                }}
                onClick={() => setShowLowValueTokens((open) => !open)}
              >
                <ChevronDownIcon
                  boxSize="18px"
                  flexShrink={0}
                  color="fg.secondary"
                  transform={
                    showLowValueTokens ? "rotate(0deg)" : "rotate(-90deg)"
                  }
                  transitionProperty="transform"
                  transitionDuration="fast"
                />
                <ListItemContent>
                  <HStack spacing={2}>
                    <ListItemTitle fontSize="sm">Low-value assets</ListItemTitle>
                    {lowValueLoading && (
                      <Spinner
                        thickness="2px"
                        speed="0.65s"
                        color="fg.secondary"
                        boxSize="12px"
                      />
                    )}
                  </HStack>
                </ListItemContent>
                <ListItemMeta flex="0 0 auto">
                  <Text
                    as="span"
                    display="block"
                    color="fg.primary"
                    fontSize="sm"
                    fontWeight={600}
                  >
                    {formatUsd(lowValueTotalUsd)}
                  </Text>
                  <Text as="span" display="block" fontSize="xs" whiteSpace="nowrap">
                    {lowValueAssetRows.length}{" "}
                    {lowValueAssetRows.length === 1 ? "asset" : "assets"}
                  </Text>
                </ListItemMeta>
              </Flex>
              <Collapse
                in={showLowValueTokens}
                animateOpacity
                onAnimationComplete={scrollLowValueDisclosureIntoView}
              >
                {showLowValueTokens && (
                  <Box>
                    <ListSurface
                      borderWidth={0}
                      borderRadius={0}
                      bg="surface.sunken"
                    >
                      {lowValueAssetRows.map((row, index) =>
                        row.kind === "aggregate" ? (
                          <AggregatedAssetRow
                            key={`low-aggregated-${row.symbol.toLowerCase()}`}
                            symbol={row.symbol}
                            tokens={row.tokens}
                            customTokenKeys={customTokenKeys}
                            networksInfo={networksInfo ?? {}}
                            onTokenClick={onTokenClick}
                            onSwapClick={onSwapClick}
                            onEditToken={(nextToken) => {
                              setEditingToken(nextToken);
                              editModal.onOpen();
                            }}
                            onHideToken={openHideTokenModal}
                            resolveLogo={resolveLogo}
                            hideValue={hideValue}
                            formatUsd={formatUsd}
                          />
                        ) : (
                          <TokenRow
                            key={`low-${row.token.chainId}-${row.token.contractAddress}-${index}`}
                            token={row.token}
                            customTokenKeys={customTokenKeys}
                            networksInfo={networksInfo ?? {}}
                            onTokenClick={onTokenClick}
                            onSwapClick={onSwapClick}
                            onEditToken={(nextToken) => {
                              setEditingToken(nextToken);
                              editModal.onOpen();
                            }}
                            onHideToken={openHideTokenModal}
                            resolveLogo={resolveLogo}
                            hideValue={hideValue}
                            formatUsd={formatUsd}
                          />
                        ),
                      )}
                    </ListSurface>
                  </Box>
                )}
              </Collapse>
            </Box>
          )}

          {hasVisiblePositions && view === "all" && (
            <Box
              as="li"
              px={4}
              pt={4}
              pb={2}
              listStyleType="none"
              borderBottomWidth="1px"
              borderBottomColor="border.subtle"
            >
              <Text color="fg.secondary" fontSize="sm" fontWeight={600}>
                DeFi positions
              </Text>
            </Box>
          )}

          {hasVisiblePositions &&
            filteredDefiPositions.map((position, index) => (
              <DefiPositionRow
                key={`defi-${position.protocol}-${position.name}-${index}`}
                position={position}
                hideValue={hideValue}
                formatUsd={formatUsd}
                resolveLogo={resolveLogo}
              />
            ))}
        </>
      )}
    </ListSurface>
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
    <Box position="relative">
      {!hideHeader && (
        <HStack px={1} pb={3} justify="space-between">
          <HStack spacing={2}>
            <Text fontSize="md" fontWeight={600} color="fg.primary">
              {view === "positions" ? "Positions" : "Assets"}
            </Text>
            {loading && <Skeleton h="14px" w="60px" />}
            {!loading && (
              <Text
                fontSize="sm"
                fontWeight={500}
                color="fg.secondary"
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatUsd(totalValueUsd)}
              </Text>
            )}
          </HStack>
          <HStack spacing={1}>
            <Tooltip label={hideValue ? "Show values" : "Hide values"} hasArrow>
              <IconButton
                aria-label={hideValue ? "Show values" : "Hide values"}
                icon={hideValue ? <ViewOffIcon /> : <ViewIcon />}
                size="sm"
                variant="ghost"
                color="fg.secondary"
                onClick={toggleHideValue}
              />
            </Tooltip>
            <Tooltip label="Refresh" hasArrow>
              <IconButton
                aria-label="Refresh portfolio"
                icon={<RepeatIcon />}
                size="sm"
                variant="ghost"
                color="fg.secondary"
                onClick={() => loadPortfolio(true)}
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
