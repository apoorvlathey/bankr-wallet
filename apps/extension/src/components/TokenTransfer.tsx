import { useState, useEffect, useLayoutEffect, useMemo, memo, useCallback, useRef } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Button,
  Image,
  IconButton,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  SliderMark,
  Spinner,
  Skeleton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Checkbox,
  Tooltip,
  Textarea,
  Collapse,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  PopoverArrow,
  Portal,
  useDisclosure,
} from "@chakra-ui/react";
import { ArrowBackIcon, ChevronDownIcon, ChevronRightIcon, CopyIcon, CheckIcon, ExternalLinkIcon, Search2Icon, SettingsIcon, WarningTwoIcon } from "@chakra-ui/icons";
import { blo } from "blo";
import { useThemedToast } from "@/hooks/useThemedToast";
import { useTheme } from "@/theme";
import { useAddressResolver } from "@/hooks/useAddressResolver";
import { useRecipientAddressKind } from "@/hooks/useRecipientAddressKind";
import { useEnsIdentities } from "@/hooks/useEnsIdentities";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import { useCachedAvatarSrc, useCachedAvatarMap } from "@/hooks/useCachedAvatarSrc";
import { isResolvableName } from "@/lib/ensUtils";
import { PortfolioToken } from "@/chrome/portfolioApi";
import { fetchOnchainBalances } from "@/chrome/onchainBalances";
import { loadPortfolioTokenCatalog } from "@/chrome/portfolioTokens";
import { buildTransferTx } from "@/chrome/transferUtils";
import { SWAP_SUPPORTED_CHAIN_IDS } from "@/constants/chainRegistry";
import type { Account } from "@/chrome/types";
import TokenSelector from "@/components/Swap/TokenSelector";
import { NativeCalldataDecodeModal } from "@/components/NativeCalldataDecodeModal";
import { NATIVE_TOKEN_ADDRESS, type TokenListEntry } from "@/chrome/swapApi";
import { WALLETCHAN_STAKE_URL } from "@/constants/externalUrls";
import { useNetworks } from "@/contexts/NetworksContext";
import ChainIcon from "@/components/ChainIcon";
import { getChainEnvironmentLabel } from "@/lib/chainIcons";
import { truncateAddress } from "@/lib/addressUtils";
import { formatUsd } from "@/lib/currencyFormatUtils";
import { formatCompact, formatWithCommas } from "@/lib/convertUtils";
import {
  getResolvedChainById,
  getStoredRpcUrl,
  getVisibleChains,
  getNativeAssetMeta,
} from "@/lib/chains";

/** USDC on Base (ERC-3009 transferWithAuthorization) */
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

function formatTokenAmount(value: number): string {
  if (value === 0) return "0";
  if (value < 0.000001) return "<0.000001";
  return parseFloat(value.toPrecision(6)).toString();
}

function getAccountTypePillStyles(account: Account) {
  if (account.type === "bankr") {
    return { label: "Bankr", bg: "accent.secondary", color: "accentFg.secondary" };
  }
  if (account.type === "privateKey") {
    return { label: "Private Key", bg: "accent.highlight", color: "accentFg.highlight" };
  }
  if (account.type === "seedPhrase") {
    return { label: "Seed Phrase", bg: "accent.primary", color: "accentFg.primary" };
  }
  return { label: "View Only", bg: "status.success.fg", color: "status.success.bg" };
}

/**
 * Balance row shown on its own line beneath the chain/token selectors so it
 * has the full card width to play with and never gets crowded by long chain
 * names. Layout: "BALANCE" label flush left, value + USD flush right.
 *
 * The value still adapts to available width — it mirrors the full
 * comma-separated number off-screen to measure its natural width and falls
 * back to a compact form (e.g. "~2.61B") if the slot is too narrow. Compact
 * mode is rare here (full card width) but kept for truly huge balances.
 * Hovering on the compact form shows the exact value.
 */
function AdaptiveBalance({
  balanceStr,
  balanceFormatted,
  priceUsd,
}: {
  balanceStr: string;
  balanceFormatted: string;
  priceUsd: number | null;
}) {
  const balanceNum = parseFloat(balanceStr);
  const fullBalance = !isNaN(balanceNum)
    ? formatWithCommas(balanceNum.toString())
    : balanceFormatted;
  const compactBalance = !isNaN(balanceNum)
    ? formatCompact(balanceStr)
    : balanceFormatted;
  const usdLabel =
    priceUsd !== null && !isNaN(balanceNum)
      ? formatUsd(balanceNum * priceUsd)
      : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [showCompact, setShowCompact] = useState(false);

  useLayoutEffect(() => {
    const check = () => {
      const c = containerRef.current;
      const m = measureRef.current;
      if (!c || !m) return;
      // The hidden mirror always renders the full balance — its scrollWidth
      // is the width the visible text would need. If that exceeds the slot
      // flex assigned us, fall back to compact.
      setShowCompact(m.scrollWidth > c.clientWidth + 0.5);
    };
    check();
    const ro = new ResizeObserver(check);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [fullBalance]);

  const displayedBalance = showCompact ? `~${compactBalance}` : fullBalance;

  return (
    <HStack spacing={2} align="center" w="full" minW={0}>
      <Text
        fontSize="2xs"
        fontWeight="800"
        color="text.tertiary"
        textTransform="uppercase"
        letterSpacing="0.06em"
        lineHeight="1"
        flexShrink={0}
      >
        Balance
      </Text>
      <Box
        ref={containerRef}
        ml="auto"
        position="relative"
        overflow="hidden"
        textAlign="right"
        flex="1 1 0"
        minW={0}
      >
        {/* Off-screen mirror of the full text used only for width measurement. */}
        <Text
          ref={measureRef}
          position="absolute"
          top={0}
          right={0}
          visibility="hidden"
          pointerEvents="none"
          whiteSpace="nowrap"
          fontSize="sm"
          fontWeight="800"
          aria-hidden="true"
        >
          {fullBalance}
        </Text>
        <Tooltip
          label={fullBalance}
          placement="top"
          hasArrow
          openDelay={200}
          isDisabled={!showCompact}
        >
          <Text
            fontSize="sm"
            fontWeight="800"
            color="text.primary"
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
          >
            {displayedBalance}
          </Text>
        </Tooltip>
      </Box>
      {usdLabel && (
        <Text
          fontSize="xs"
          fontWeight="700"
          color="text.tertiary"
          lineHeight="1"
          flexShrink={0}
        >
          {usdLabel}
        </Text>
      )}
    </HStack>
  );
}

interface TokenTransferProps {
  token?: PortfolioToken | null;
  fromAddress: string;
  chainId: number;
  accountType: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  accounts?: Account[];
  onBack: () => void;
  onTransferInitiated: (sponsored?: boolean) => void;
  onSwapInstead?: (token: PortfolioToken) => void;
}

function TokenTransfer({
  token: initialToken,
  fromAddress,
  chainId,
  accountType,
  accounts,
  onBack,
  onTransferInitiated,
  onSwapInstead,
}: TokenTransferProps) {
  const toast = useThemedToast();
  const { tokens } = useTheme();
  const { networksInfo } = useNetworks();
  const [selectedChainId, setSelectedChainId] = useState(initialToken?.chainId || chainId);
  const [selectedToken, setSelectedToken] = useState<PortfolioToken | null>(initialToken || null);
  const [allTokens, setAllTokens] = useState<PortfolioToken[]>([]);
  const [tokenList, setTokenList] = useState<TokenListEntry[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [isUsdMode, setIsUsdMode] = useState(false);
  const [sliderValue, setSliderValue] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sponsoredFailed, setSponsoredFailed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [customTokenLoading, setCustomTokenLoading] = useState(false);
  // Optional hex calldata appended to a native-token send. Collapsed by
  // default — power-user feature for calling payable contracts directly from
  // the Send page without dapp involvement.
  const [hexData, setHexData] = useState("");
  const [isHexDataExpanded, setIsHexDataExpanded] = useState(false);
  // Advanced setting: treat the hex data as deployment bytecode and send the
  // tx with `to: null`. Only meaningful for native + valid non-empty hex
  // data; auto-clears whenever that precondition no longer holds.
  const [isContractDeployment, setIsContractDeployment] = useState(false);
  const deployToggle = useDisclosure();
  const calldataDecodeModal = useDisclosure();

  // Fetch all holdings once
  useEffect(() => {
    let cancelled = false;
    setHoldingsLoading(true);
    (async () => {
      try {
        const catalog = await loadPortfolioTokenCatalog(fromAddress);
        if (cancelled) return;

        let tokens = catalog.tokens;
        try {
          const onchain = await fetchOnchainBalances(fromAddress, catalog.tokens, {
            preserveZeroBalanceTokens: true,
          });
          if (!cancelled) {
            tokens = onchain.tokens;
          }
        } catch {
          // Fall back to API/catalog tokens.
        }

        if (cancelled) return;
        setAllTokens(tokens);
      } finally {
        if (!cancelled) setHoldingsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fromAddress]);

  // Holdings filtered by selected chain
  const holdings = useMemo(
    () => allTokens.filter((t) => t.chainId === selectedChainId),
    [allTokens, selectedChainId],
  );

  // Swap token list for the selected chain — feeds the Send dropdown's "All
  // tokens" group and lets popular chips (USDC, USDT, ...) appear even when
  // the user has zero onchain balance of them. Mirrors SwapView's fetch.
  useEffect(() => {
    if (!SWAP_SUPPORTED_CHAIN_IDS.has(selectedChainId)) {
      setTokenList([]);
      return;
    }
    let cancelled = false;
    chrome.runtime.sendMessage(
      { type: "fetchSwapTokenList", chainId: selectedChainId },
      (res) => {
        if (cancelled) return;
        if (res?.success && Array.isArray(res.data)) setTokenList(res.data);
        else setTokenList([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedChainId]);

  // -----------------------------------------------------------------------
  // Onchain balance fallback for the selected token. Mirrors SwapView's
  // verification: when the chosen token reports a 0 balance (either because
  // the portfolio API hasn't picked it up yet, or because the user picked
  // it from the swap token list which defaults balance to "0"), fall back
  // to a direct `balanceOf` / `eth_getBalance` so the user sees the truth.
  // Memoized per (chain, token, owner) so it doesn't refetch on every render.
  // -----------------------------------------------------------------------
  const verifiedZeroBalancesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedToken || !fromAddress) return;
    if (parseFloat(selectedToken.balance) > 0) return;

    const tokenAddr = selectedToken.contractAddress;
    const tokenChainId = selectedToken.chainId;
    const tokenDecimals = selectedToken.decimals;
    const key = `${tokenChainId}:${tokenAddr.toLowerCase()}:${fromAddress.toLowerCase()}`;
    if (verifiedZeroBalancesRef.current.has(key)) return;
    verifiedZeroBalancesRef.current.add(key);

    let cancelled = false;
    (async () => {
      try {
        const rpcUrl = await getStoredRpcUrl(tokenChainId);
        if (!rpcUrl || cancelled) return;
        const { createPublicClient, http, erc20Abi, formatUnits } = await import("viem");
        const client = createPublicClient({
          transport: http(rpcUrl, { timeout: 8000, retryCount: 0 }),
        });
        const isNative = tokenAddr === "native";
        const rawBalance = isNative
          ? await client.getBalance({ address: fromAddress as `0x${string}` })
          : ((await client.readContract({
              address: tokenAddr as `0x${string}`,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [fromAddress as `0x${string}`],
            })) as bigint);
        if (cancelled || rawBalance === 0n) return;

        const balance = formatUnits(rawBalance, tokenDecimals);
        const balanceNum = parseFloat(balance);
        const balanceFormatted =
          balanceNum > 0 && balanceNum < 0.0001
            ? "<0.0001"
            : parseFloat(balanceNum.toPrecision(6)).toString();

        setSelectedToken((prev) => {
          if (
            !prev ||
            prev.contractAddress.toLowerCase() !== tokenAddr.toLowerCase() ||
            prev.chainId !== tokenChainId
          ) {
            return prev;
          }
          return {
            ...prev,
            balance,
            balanceFormatted,
            valueUsd: balanceNum * prev.priceUsd,
          };
        });
      } catch {
        // Silent: keep showing 0 if RPC fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedToken, fromAddress]);

  // -----------------------------------------------------------------------
  // USD price fallback for the selected ERC-20. The portfolio API supplies
  // priceUsd for known tokens but may be down (priceUsd=0 for everything)
  // or simply not price a custom/exotic token. Resolve directly through
  // `fetchTokenPrice` (proxy → CoinGecko → GeckoTerminal fallback chain) so
  // USD-mode and the value display still work. Native tokens already get
  // prices through the catalog's native resolver.
  //
  // We deliberately do NOT use a `cancelled` flag here: the onchain balance
  // fallback above also calls `setSelectedToken`, and any state update that
  // changes `selectedToken` would trigger this effect's cleanup mid-flight
  // and silently drop the price response. The `setSelectedToken` updater
  // below already guards staleness by matching (chainId, address), so a
  // late response for a token the user has since switched away from is a
  // no-op. Combined with `resolvedTokenPriceRef`, each (chainId, address)
  // is fetched at most once per mount.
  // -----------------------------------------------------------------------
  const resolvedTokenPriceRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!selectedToken) return;
    if (selectedToken.priceUsd > 0) return;
    if (selectedToken.contractAddress === "native") return;
    if (!/^0x[a-fA-F0-9]{40}$/.test(selectedToken.contractAddress)) return;

    const tokenAddr = selectedToken.contractAddress;
    const tokenChainId = selectedToken.chainId;
    const key = `${tokenChainId}:${tokenAddr.toLowerCase()}`;
    if (resolvedTokenPriceRef.current.has(key)) return;
    resolvedTokenPriceRef.current.add(key);

    chrome.runtime.sendMessage(
      { type: "fetchTokenPrice", chainId: tokenChainId, address: tokenAddr },
      (res) => {
        const priceUsd = Number(res?.priceUsd ?? 0);
        if (!res?.success || !(priceUsd > 0)) return;
        setSelectedToken((prev) => {
          if (
            !prev ||
            prev.contractAddress.toLowerCase() !== tokenAddr.toLowerCase() ||
            prev.chainId !== tokenChainId
          ) {
            return prev;
          }
          const balanceNum = parseFloat(prev.balance || "0");
          return {
            ...prev,
            priceUsd,
            valueUsd: balanceNum > 0 ? balanceNum * priceUsd : 0,
          };
        });
      },
    );
  }, [selectedToken]);

  // Centralized chain list: built-ins + custom overrides/custom additions.
  const allChains = useMemo(() => {
    const ids = getVisibleChains(networksInfo).map((chain) => chain.chainId);
    // Move selected chain to front
    return [selectedChainId, ...ids.filter((id) => id !== selectedChainId)];
  }, [selectedChainId, networksInfo]);

  // All UI labels resolve through the shared chain helper so custom chains do
  // not need per-screen fallback code.
  const getChainName = useCallback((cId: number): string => {
    return getResolvedChainById(cId, networksInfo)?.name ?? `Chain ${cId}`;
  }, [networksInfo]);

  const handleChainChange = (newChainId: number) => {
    setSelectedChainId(newChainId);
    // Auto-select first token on that chain
    const onChain = allTokens.filter((t) => t.chainId === newChainId);
    setSelectedToken(onChain.length > 0 ? onChain[0] : null);
    setAmount("");
    setIsUsdMode(false);
    setSliderValue(0);
    setHexData("");
    setIsHexDataExpanded(false);
  };

  // Resolved custom token shown in dropdown for user to click
  const [resolvedCustomToken, setResolvedCustomToken] = useState<PortfolioToken | null>(null);
  const [customTokenError, setCustomTokenError] = useState<string | null>(null);

  // Resolve a custom ERC20 address: fetch onchain info + balance
  const resolveCustomAddress = async (tokenAddress: string) => {
    setCustomTokenLoading(true);
    setResolvedCustomToken(null);
    setCustomTokenError(null);
    try {
      // Fetch token info via background
      const infoResult = await new Promise<{ success: boolean; data?: { name: string; symbol: string; decimals: number } }>((resolve) => {
        chrome.runtime.sendMessage({ type: "fetchTokenInfo", tokenAddress, chainId: selectedChainId }, resolve);
      });
      if (!infoResult.success || !infoResult.data) {
        setCustomTokenError("Not a valid ERC20 contract");
        return;
      }
      const { name, symbol, decimals } = infoResult.data;

      const addrLower = tokenAddress.toLowerCase();
      const isNative =
        addrLower === "0x0000000000000000000000000000000000000000" ||
        addrLower === NATIVE_TOKEN_ADDRESS.toLowerCase();

      const { createPublicClient, http, erc20Abi, formatUnits } = await import("viem");
      const rpcUrl = await getStoredRpcUrl(selectedChainId);
      if (!rpcUrl) {
        setCustomTokenError("No RPC for this chain");
        return;
      }
      const client = createPublicClient({ transport: http(rpcUrl, { timeout: 8000, retryCount: 0 }) });
      const rawBalance = isNative
        ? await client.getBalance({ address: fromAddress as `0x${string}` })
        : await client.readContract({
            address: tokenAddress as `0x${string}`,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [fromAddress as `0x${string}`],
          });
      const balance = formatUnits(rawBalance, decimals);
      const balanceNum = parseFloat(balance);

      const logoUrl = isNative
        ? getNativeAssetMeta(selectedChainId, networksInfo)?.logoUrl ?? ""
        : "";

      setResolvedCustomToken({
        contractAddress: isNative ? "native" : tokenAddress,
        name,
        symbol,
        decimals,
        balance,
        balanceFormatted: balanceNum < 0.0001 && balanceNum > 0 ? "<0.0001" : parseFloat(balanceNum.toPrecision(6)).toString(),
        logoUrl,
        valueUsd: 0,
        priceUsd: 0,
        chainId: selectedChainId,
      });
    } catch {
      setCustomTokenError("Failed to fetch token info");
    } finally {
      setCustomTokenLoading(false);
    }
  };

  // When user selects the resolved custom token from the dropdown
  const handleSelectCustomToken = (customToken: PortfolioToken) => {
    setSelectedToken(customToken);
    setResolvedCustomToken(null);
    setCustomTokenError(null);
    setAmount("");
    setIsUsdMode(false);
    setSliderValue(0);
    setHexData("");
    setIsHexDataExpanded(false);
  };

  const token = selectedToken;

  // Native + optional hex calldata. When the user attaches calldata to a
  // native send (e.g. calling a payable contract), a 0-value tx is legitimate
  // — the amount field can be empty. These derivations need to sit ABOVE
  // `tokenAmount` / `isAmountValid` so those can relax their checks.
  const isNativeToken = token?.contractAddress === "native";
  const trimmedHexData = hexData.trim();
  const hexDataIsEmpty =
    trimmedHexData === "" || trimmedHexData === "0x" || trimmedHexData === "0X";
  const isHexDataValid =
    !isNativeToken ||
    hexDataIsEmpty ||
    /^0x([0-9a-fA-F]{2})+$/.test(trimmedHexData);
  const hasNativeCalldata = isNativeToken && !hexDataIsEmpty && isHexDataValid;
  // Contract deployment is only meaningful when hex data (the deployment
  // bytecode) is valid and present. Auto-clear it whenever the precondition
  // disappears so a stale `to: null` can't slip into a normal transfer.
  useEffect(() => {
    if (isContractDeployment && !hasNativeCalldata) {
      setIsContractDeployment(false);
    }
  }, [isContractDeployment, hasNativeCalldata]);
  // Gear visibility — native token + no recipient entered. When deploy is
  // already on the recipient input is hidden, so OR with `isContractDeployment`
  // guarantees the user always has a way to toggle it back off.
  const canShowDeployToggle =
    isNativeToken && (isContractDeployment || !recipient.trim());

  // Sponsored USDC transfer detection
  const isUsdcOnBase = !!(
    token &&
    token.chainId === 8453 &&
    token.contractAddress?.toLowerCase() === BASE_USDC_ADDRESS.toLowerCase()
  );
  const [premiumStatus, setPremiumStatus] = useState<{
    isPremium: boolean;
    balance: string;
    sponsoredTransfersEnabled: boolean;
  } | null>(null);
  const [premiumLoading, setPremiumLoading] = useState(false);

  useEffect(() => {
    if (!isUsdcOnBase) {
      setPremiumStatus(null);
      return;
    }
    setPremiumLoading(true);
    chrome.runtime.sendMessage(
      { type: "checkPremiumStatus", address: fromAddress },
      (result: { isPremium: boolean; balance: string; sponsoredTransfersEnabled: boolean } | undefined) => {
        if (result) setPremiumStatus(result);
        setPremiumLoading(false);
      }
    );
  }, [isUsdcOnBase, fromAddress]);

  const isSponsoredFlow = isUsdcOnBase && premiumStatus?.isPremium && premiumStatus?.sponsoredTransfersEnabled && accountType !== "impersonator";

  const { resolvedAddress, resolvedName, avatar, isResolving, isLoadingExtras, isValid: isRecipientValid, error: resolverError } =
    useAddressResolver(recipient);
  const cachedRecipientAvatar = useCachedAvatarSrc(avatar);

  // Contract-recipient detection. Tokens sent to a generic contract can be
  // stuck; 7702-delegated EOAs are safe. Block submit on `contract` until the
  // user acknowledges via the checkbox below.
  const { kind: recipientKind, isChecking: isCheckingRecipientKind } =
    useRecipientAddressKind(
      isRecipientValid && !isResolving ? resolvedAddress : null,
      selectedChainId,
    );
  const isRecipientContract = recipientKind === "contract";
  const [acknowledgeContract, setAcknowledgeContract] = useState(false);
  useEffect(() => {
    setAcknowledgeContract(false);
  }, [resolvedAddress, selectedChainId]);

  const chainName = getChainName(selectedChainId);
  const chainEnvironmentLabel = getChainEnvironmentLabel(selectedChainId, chainName);
  // Trigger label mirrors the dropdown rows: full chain name beside the
  // icon, with a trailing "Testnet" word stripped when the testnet pill
  // already conveys it (avoids "RISE Testnet [TESTNET]" piling up).
  const triggerChainLabel = chainEnvironmentLabel
    ? chainName.replace(/\s+testnet$/i, "").trim() || chainName
    : chainName;
  const explorerUrl = getResolvedChainById(selectedChainId, networksInfo)?.explorer ?? "";
  const decodeCalldataDisabledReason = (() => {
    if (!hasNativeCalldata) {
      return hexDataIsEmpty ? "Add calldata to decode." : "Fix calldata hex first.";
    }
    if (!recipient.trim()) return "Enter a recipient to decode against.";
    if (isResolving) return "Resolving recipient.";
    if (!isRecipientValid || !resolvedAddress) return "Use a valid recipient.";
    return null;
  })();
  const canOpenCalldataDecoder =
    !isContractDeployment && decodeCalldataDisabledReason === null;
  const [chainSearch, setChainSearch] = useState("");
  const chainSearchInputRef = useRef<HTMLInputElement>(null);
  const [isChainMenuOpen, setIsChainMenuOpen] = useState(false);
  const [highlightedChainIndex, setHighlightedChainIndex] = useState(0);
  const normalizedChainSearch = chainSearch.trim().toLowerCase();
  const filteredChains = normalizedChainSearch
    ? allChains.filter((cId) => {
        const name = getChainName(cId);
        return (
          name.toLowerCase().includes(normalizedChainSearch) ||
          String(cId).includes(normalizedChainSearch)
        );
      })
    : allChains;
  const hasPrice = token ? token.priceUsd > 0 : false;

  useEffect(() => {
    if (!isChainMenuOpen) return;
    const timeoutId = window.setTimeout(() => {
      chainSearchInputRef.current?.focus();
      chainSearchInputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(timeoutId);
  }, [isChainMenuOpen]);
  useEffect(() => {
    setHighlightedChainIndex(0);
  }, [chainSearch, isChainMenuOpen]);

  // Other wallet accounts (excluding current sender) for recipient picker
  const otherAccounts = useMemo(
    () => (accounts || []).filter(a => a.address.toLowerCase() !== fromAddress.toLowerCase()),
    [accounts, fromAddress],
  );
  const otherAccountAddresses = useMemo(
    () => otherAccounts.map((account) => account.address),
    [otherAccounts],
  );
  const { identities: otherAccountIdentities } = useEnsIdentities(otherAccountAddresses);
  const otherAccountAvatarUrls = useMemo(
    () =>
      otherAccounts
        .map((a) => otherAccountIdentities.get(a.address.toLowerCase())?.avatar)
        .filter((u): u is string => !!u),
    [otherAccounts, otherAccountIdentities],
  );
  const cachedOtherAccountAvatars = useCachedAvatarMap(otherAccountAvatarUrls);

  const getAccountDisplayName = useCallback((account: Account): string => {
    if (account.displayName) return account.displayName;
    const ens = otherAccountIdentities.get(account.address.toLowerCase());
    if (ens?.name) return ens.name;
    return truncateAddress(account.address);
  }, [otherAccountIdentities]);

  const hasSecondaryAddressLine = useCallback((account: Account): boolean => {
    if (account.displayName) return true;
    const ens = otherAccountIdentities.get(account.address.toLowerCase());
    return !!ens?.name;
  }, [otherAccountIdentities]);

  const getAccountAvatar = useCallback((account: Account): string => {
    const ensAvatar = otherAccountIdentities.get(account.address.toLowerCase())?.avatar;
    if (ensAvatar) return cachedOtherAccountAvatars.get(ensAvatar) || ensAvatar;
    if (account.type === "bankr") return "/bankr-icon.png";
    return blo(account.address as `0x${string}`);
  }, [otherAccountIdentities, cachedOtherAccountAvatars]);

  // Compute the token amount that will actually be sent. When the user has
  // attached valid hex calldata to a native send, a 0-value tx is a real use
  // case (calling a non-payable contract), so empty / "0" amount is allowed
  // and normalized to "0".
  const tokenAmount = useMemo(() => {
    if (!token) return "";
    if (!amount) return hasNativeCalldata ? "0" : "";
    const num = parseFloat(amount);
    if (isNaN(num) || num < 0) return "";
    if (num === 0) return hasNativeCalldata ? "0" : "";
    if (isUsdMode && hasPrice) {
      const converted = num / token.priceUsd;
      const balance = parseFloat(token.balance);
      if (converted >= balance) return token.balance;
      return converted.toFixed(token.decimals);
    }
    return amount;
  }, [amount, isUsdMode, hasPrice, token, hasNativeCalldata]);

  const balanceNum = token ? parseFloat(token.balance) : 0;

  const handleTokenSelect = (t: PortfolioToken) => {
    setSelectedToken(t);
    setAmount("");
    setIsUsdMode(false);
    setSliderValue(0);
    // Hex calldata is only meaningful for native sends — clear it whenever
    // the token changes so a stale value can't leak into the next tx.
    setHexData("");
    setIsHexDataExpanded(false);
  };

  const setAmountFromSlider = (pct: number) => {
    if (!token) return;
    if (pct === 0) {
      setAmount("");
    } else if (pct === 100) {
      if (isUsdMode && hasPrice) {
        setAmount((balanceNum * token.priceUsd).toFixed(2));
      } else {
        setAmount(token.balance);
      }
    } else {
      const tokenAmt = (balanceNum * pct) / 100;
      if (isUsdMode && hasPrice) {
        setAmount((tokenAmt * token.priceUsd).toFixed(2));
      } else {
        const formatted = tokenAmt === 0 ? "0" : parseFloat(tokenAmt.toPrecision(6)).toString();
        setAmount(formatted);
      }
    }
  };

  const syncSliderFromAmount = (val: string) => {
    if (!token) return;
    const num = parseFloat(val);
    if (!val || isNaN(num) || num <= 0 || balanceNum <= 0) {
      setSliderValue(0);
      return;
    }
    let tokenVal = num;
    if (isUsdMode && hasPrice) {
      tokenVal = num / token.priceUsd;
    }
    const pct = Math.min(100, Math.round((tokenVal / balanceNum) * 100));
    setSliderValue(pct);
  };

  const handleMaxAmount = () => {
    if (!token) return;
    setSliderValue(100);
    if (isUsdMode && hasPrice) {
      const usdValue = balanceNum * token.priceUsd;
      setAmount(usdValue.toFixed(2));
    } else {
      setAmount(token.balance);
    }
  };

  const handleToggleMode = () => {
    if (!token || !hasPrice) return;
    const num = parseFloat(amount);
    if (amount && !isNaN(num) && num > 0) {
      if (isUsdMode) {
        const converted = num / token.priceUsd;
        setAmount(converted >= balanceNum ? token.balance : formatTokenAmount(converted));
      } else {
        setAmount((num * token.priceUsd).toFixed(2));
      }
    }
    setIsUsdMode(!isUsdMode);
  };

  const isAmountValid = (): boolean => {
    if (!token || tokenAmount === "") return false;
    const num = parseFloat(tokenAmount);
    if (isNaN(num) || num < 0) return false;
    // Native + calldata: 0-value is allowed (e.g. invoking a non-payable
    // contract function). Without calldata, require a positive amount.
    if (num === 0) return hasNativeCalldata;
    const balance = parseFloat(token.balance);
    return num <= balance;
  };

  // Contract deployments don't have a recipient at all — `to` is null. Skip
  // the recipient validation/contract-warning gates in that case.
  const recipientGatesPass = isContractDeployment
    ? true
    : isRecipientValid &&
      !isResolving &&
      !isCheckingRecipientKind &&
      (!isRecipientContract || acknowledgeContract);

  const canSubmit =
    !!token &&
    recipientGatesPass &&
    isAmountValid() &&
    !isSubmitting &&
    isHexDataValid;

  const handleSubmit = async () => {
    if (!canSubmit || !token) return;
    if (accountType === "impersonator") {
      toast({
        title: "View-only account",
        description: "Impersonator accounts cannot send transactions",
        status: "error",
        duration: 3000,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Sponsored ERC-3009 flow for USDC on Base
      if (isSponsoredFlow) {
        const result = await new Promise<{ success: boolean; txId?: string; error?: string }>(
          (resolve) => {
            chrome.runtime.sendMessage(
              {
                type: "sponsoredTransfer",
                to: resolvedAddress!,
                amount: tokenAmount,
                decimals: token.decimals,
                fromAddress,
              },
              resolve
            );
          }
        );

        if (result.success) {
          onTransferInitiated(true);
        } else {
          setSponsoredFailed(result.error || "Could not complete sponsored transfer");
        }
        return;
      }

      // Normal transfer flow (or contract deployment when toggled). For a
      // deployment, hex data IS the bytecode and `to` must be null — the tx
      // confirmation modal already handles the "no recipient" case as a deploy.
      const txParts = buildTransferTx({
        to: isContractDeployment ? "0x" : resolvedAddress!,
        amount: tokenAmount,
        contractAddress: token.contractAddress,
        decimals: token.decimals,
        chainId: token.chainId,
        data: isNativeToken ? trimmedHexData : undefined,
      });

      const result = await new Promise<{ success: boolean; txId?: string; error?: string }>(
        (resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "initiateTransfer",
              tx: {
                from: fromAddress,
                to: isContractDeployment ? null : txParts.to,
                data: txParts.data,
                value: txParts.value,
                chainId: token.chainId,
              },
              chainName: chainName,
              tokenName: isContractDeployment
                ? "Contract Deployment"
                : token.symbol.toUpperCase(),
              tokenLogo: token.logoUrl || null,
            },
            resolve
          );
        }
      );

      if (result.success) {
        onTransferInitiated();
      } else {
        toast({
          title: "Transfer failed",
          description: result.error || "Could not initiate transfer",
          status: "error",
          duration: 3000,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to initiate transfer",
        status: "error",
        duration: 3000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Fallback: send as a normal transfer (user pays gas) when sponsored route fails */
  const handleFallbackSend = async () => {
    if (!token || !resolvedAddress || !tokenAmount) return;
    setIsSubmitting(true);
    setSponsoredFailed(null);

    try {
      const txParts = buildTransferTx({
        to: resolvedAddress,
        amount: tokenAmount,
        contractAddress: token.contractAddress,
        decimals: token.decimals,
        chainId: token.chainId,
        data: isNativeToken ? trimmedHexData : undefined,
      });

      const result = await new Promise<{ success: boolean; txId?: string; error?: string }>(
        (resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "initiateTransfer",
              tx: {
                from: fromAddress,
                to: txParts.to,
                data: txParts.data,
                value: txParts.value,
                chainId: token.chainId,
              },
              chainName: chainName,
              tokenName: token.symbol.toUpperCase(),
              tokenLogo: token.logoUrl || null,
            },
            resolve
          );
        }
      );

      if (result.success) {
        onTransferInitiated();
      } else {
        toast({
          title: "Transfer failed",
          description: result.error || "Could not initiate transfer",
          status: "error",
          duration: 3000,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to initiate transfer",
        status: "error",
        duration: 3000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box
      p={4}
      h="100%"
      maxH="100%"
      flex="1"
      minH={0}
      overflowY="auto"
      overflowX="hidden"
      bg="surface.base"
      css={{
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorY: "contain",
      }}
    >
      <VStack spacing={3} align="stretch">
        {/* Header */}
        <HStack spacing={2} justify="space-between" align="flex-start">
          <HStack spacing={2}>
            <IconButton
              aria-label="Back"
              icon={<ArrowBackIcon />}
              variant="ghost"
              size="sm"
              onClick={onBack}
            />
            <Text fontWeight="900" fontSize="lg" color="text.primary" textTransform="uppercase" letterSpacing="wider">
              Send
            </Text>
          </HStack>
          {/* Right side — active account chip on top, "Swap instead?" below
              when applicable. Matches the Swap/Bridge header treatment so
              the user always sees which account will sign. */}
          <VStack align="flex-end" spacing={1} minW={0}>
            {fromAddress && <FromAccountDisplay address={fromAddress} />}
            {onSwapInstead && selectedToken && SWAP_SUPPORTED_CHAIN_IDS.has(selectedChainId) && (
              <Text
                fontSize="xs"
                fontWeight="700"
                color="accent.secondary"
                cursor="pointer"
                onClick={() => onSwapInstead(selectedToken)}
                _hover={{ textDecoration: "underline" }}
              >
                Swap instead?
              </Text>
            )}
          </VStack>
        </HStack>

        {/* Non-premium upsell (compact, top of page) */}
        {isUsdcOnBase && !premiumLoading && premiumStatus && !premiumStatus.isPremium && accountType !== "impersonator" && (
          <HStack
            spacing={2}
            px={2.5}
            py={1.5}
            bg="accent.highlight"
            border={tokens.borders.thin}
            borderColor="border.default"
            borderRadius="md"
            justify="space-between"
          >
            <Box>
              <Text fontSize="2xs" color="accentFg.highlight" fontWeight="700">
                ✨ Stake 20M+ sWCHAN for gas-free USDC sends
              </Text>
              <Text fontSize="2xs" color="accentFg.highlight" opacity={0.7} fontWeight="600">
                and other pro features!
              </Text>
            </Box>
            <Button
              size="xs"
              h="22px"
              px={2}
              variant="highlight"
              fontSize="2xs"
              onClick={() => window.open(WALLETCHAN_STAKE_URL, "_blank")}
              flexShrink={0}
            >
              STAKE
            </Button>
          </HStack>
        )}

        {/* Token selector card */}
        <Box
            bg="surface.raised"
            border={tokens.borders.medium}
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="card"
            p={3}
          >
            <HStack spacing={3} align="center">
              {/* Chain selector + (optional) testnet pill stacked below it.
                  Stacking instead of inlining the pill gives the chain name
                  more horizontal room on custom chains without sacrificing
                  the row-level "this is a testnet" safety signal. */}
              <VStack align="flex-start" spacing={1} flexShrink={0} minW={0}>
              <Menu
                isOpen={isChainMenuOpen}
                initialFocusRef={chainSearchInputRef}
                onOpen={() => {
                  setIsChainMenuOpen(true);
                  setHighlightedChainIndex(0);
                }}
                onClose={() => {
                  setIsChainMenuOpen(false);
                  setChainSearch("");
                  setHighlightedChainIndex(0);
                }}
              >
                <MenuButton
                  as={Box}
                  cursor="pointer"
                  flexShrink={0}
                  minW={0}
                  _hover={{ opacity: 0.7 }}
                  transition="opacity 0.15s"
                >
                  <HStack spacing={1.5} minW={0}>
                    <ChainIcon
                      chainId={selectedChainId}
                      chainName={chainName}
                      size="24px"
                      withChip
                    />
                    {/* Chain name shown beside the icon for every chain so
                        the user can read it at a glance — not just custom
                        chains. Truncated with a tooltip so a name longer
                        than the available space doesn't push the SELECT
                        button off-screen. */}
                    <Text
                      fontSize="sm"
                      fontWeight="800"
                      color="text.primary"
                      maxW="180px"
                      noOfLines={1}
                      title={chainName}
                    >
                      {triggerChainLabel}
                    </Text>
                    <Box
                      bg="surface.raised"
                      border="1.5px solid"
                      borderColor="border.default"
                      borderRadius="md"
                      minW="18px"
                      h="18px"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      boxShadow="card"
                      flexShrink={0}
                    >
                      <ChevronDownIcon boxSize="12px" />
                    </Box>
                  </HStack>
                </MenuButton>
                <MenuList
                  bg="surface.raised"
                  border={tokens.borders.medium}
                  borderColor="border.default"
                  borderRadius="lg"
                  boxShadow="card"
                  p={0}
                  zIndex={10}
                >
                  <Box p={2} borderBottom={tokens.borders.thin} borderColor="border.default">
                    <InputGroup size="sm">
                      <InputLeftElement pointerEvents="none">
                        <Search2Icon color="text.tertiary" boxSize={3} />
                      </InputLeftElement>
                      <Input
                        ref={chainSearchInputRef}
                        value={chainSearch}
                        onChange={(e) => setChainSearch(e.target.value)}
                        placeholder="Search chains"
                        fontWeight="600"
                        pl={9}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            e.stopPropagation();
                            if (filteredChains.length > 0) {
                              setHighlightedChainIndex((prev) =>
                                Math.min(prev + 1, filteredChains.length - 1),
                              );
                            }
                            return;
                          }
                          if (e.key === "ArrowUp") {
                            e.preventDefault();
                            e.stopPropagation();
                            if (filteredChains.length > 0) {
                              setHighlightedChainIndex((prev) => Math.max(prev - 1, 0));
                            }
                            return;
                          }
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            const highlighted = filteredChains[highlightedChainIndex];
                            if (highlighted !== undefined) {
                              handleChainChange(highlighted);
                              setIsChainMenuOpen(false);
                              setChainSearch("");
                            }
                            return;
                          }
                          e.stopPropagation();
                        }}
                      />
                    </InputGroup>
                  </Box>
                  <Box maxH="200px" overflowY="auto">
                    {filteredChains.map((cId, index) => (
                      <MenuItem
                        key={cId}
                        onClick={() => {
                          handleChainChange(cId);
                          setIsChainMenuOpen(false);
                          setChainSearch("");
                        }}
                        onMouseEnter={() => setHighlightedChainIndex(index)}
                        bg={
                          index === highlightedChainIndex || cId === selectedChainId
                            ? "bg.muted"
                            : "transparent"
                        }
                        _hover={{ bg: "bg.hover" }}
                        px={3}
                        py={2}
                      >
                        <HStack spacing={2}>
                          <ChainIcon chainId={cId} chainName={getChainName(cId)} size="18px" withChip />
                          <HStack spacing={1.5}>
                            <Text fontWeight="700" fontSize="sm">{getChainName(cId)}</Text>
                            {getChainEnvironmentLabel(cId, getChainName(cId)) && (
                              <Text
                                fontSize="8px"
                                fontWeight="900"
                                letterSpacing="0.08em"
                                textTransform="uppercase"
                                px={1.5}
                                py={0.5}
                                bg="accent.highlight"
                                color="accentFg.highlight"
                                border="1px solid"
                                borderColor="border.default"
                                borderRadius={tokens.radii.badge}
                                lineHeight="1"
                              >
                                Testnet
                              </Text>
                            )}
                          </HStack>
                        </HStack>
                      </MenuItem>
                    ))}
                    {filteredChains.length === 0 && (
                      <Box px={3} py={3}>
                        <Text fontSize="sm" fontWeight="700" color="text.secondary">
                          No chains match "{chainSearch.trim()}".
                        </Text>
                      </Box>
                    )}
                  </Box>
                </MenuList>
              </Menu>

              {/* Testnet pill — only on non-mainnet chains. Sits directly
                  beneath the chain selector and is centered against the
                  selector column (alignSelf overrides VStack's flex-start so
                  the icon/name row above stays left-aligned). Radius is
                  driven by the theme badge token — square on Bauhaus,
                  rounded on Midnight. */}
              {chainEnvironmentLabel && (
                <Text
                  alignSelf="center"
                  fontSize="8px"
                  fontWeight="900"
                  letterSpacing="0.08em"
                  textTransform="uppercase"
                  px={1.5}
                  py={0.5}
                  bg="accent.highlight"
                  color="accentFg.highlight"
                  border="1px solid"
                  borderColor="border.default"
                  borderRadius={tokens.radii.badge}
                  lineHeight="1"
                  flexShrink={0}
                >
                  {chainEnvironmentLabel}
                </Text>
              )}
              </VStack>

              {/* Token selector — sits flush right via ml="auto" so long
                  chain names on the left can grow up to the SELECT trigger
                  without fighting the balance row (now a row of its own
                  below). */}
              <Box ml="auto" flexShrink={0}>
                <TokenSelector
                  holdings={holdings}
                  tokenList={tokenList}
                  chainId={selectedChainId}
                  selectedToken={token}
                  onSelect={handleTokenSelect}
                  onCustomAddress={resolveCustomAddress}
                  onSelectCustomToken={handleSelectCustomToken}
                  resolvedCustomToken={resolvedCustomToken}
                  customTokenLoading={customTokenLoading}
                  customTokenError={customTokenError}
                  chainName={chainName}
                  dropdownAlign="right"
                  isLoadingHoldings={holdingsLoading}
                />
              </Box>
            </HStack>

            {/* Balance row — full card width so big numbers + USD always
                fit. Adaptive compact still kicks in for truly huge balances;
                hovering the compact form reveals the exact value. */}
            {token && (
              <>
                <Box
                  mt={2.5}
                  pt={2.5}
                  borderTop={tokens.borders.thin}
                  borderColor="border.subtle"
                >
                  <AdaptiveBalance
                    balanceStr={token.balance}
                    balanceFormatted={token.balanceFormatted}
                    priceUsd={hasPrice ? token.priceUsd : null}
                  />
                </Box>
              </>
            )}
          </Box>

        {/* Contract deployment banner. Replaces the recipient input when the
            "Deploy contract" toggle inside the Hex Data section is on, so the
            "no recipient" semantics are visible at a glance. */}
        {isContractDeployment && (
          <Box
            border={tokens.borders.medium}
            borderColor="accent.secondary"
            borderRadius="lg"
            bg="surface.raised"
            boxShadow="card"
            px={3}
            py={2.5}
          >
            <VStack align="stretch" spacing={0.5}>
              <Text fontSize="xs" fontWeight="800" color="text.primary">
                Contract deployment
              </Text>
              <Text fontSize="2xs" fontWeight="600" color="text.tertiary" lineHeight="short">
                No recipient. The hex data below is sent as the deployment
                bytecode. Use the gear in the Hex Data section to switch
                back to a normal send.
              </Text>
            </VStack>
          </Box>
        )}

        {/* Recipient input. Hidden during contract deployment since `to` is null. */}
        {!isContractDeployment && (
        <Box>
          <HStack justify="space-between" align="center" mb={1}>
            <HStack spacing={1}>
              <Text fontSize="sm" fontWeight="700" color="text.secondary" textTransform="uppercase">
                Recipient
              </Text>
              {otherAccounts.length > 0 && (
                <Menu placement="bottom-start">
                  <MenuButton
                    as={Button}
                    size="xs"
                    variant="ghost"
                    rightIcon={<ChevronDownIcon boxSize="14px" />}
                    fontWeight="800"
                    fontSize="10px"
                    color="accent.secondary"
                    textTransform="uppercase"
                    letterSpacing="wide"
                    px={1}
                    h="20px"
                    iconSpacing={0.5}
                    _hover={{ bg: "bg.muted" }}
                  >
                    My Wallets
                  </MenuButton>
                  <MenuList
                    bg="surface.raised"
                    border={tokens.borders.medium}
                    borderColor="border.default"
                    borderRadius="lg"
                    boxShadow="card"
                    py={1}
                    maxH="200px"
                    overflowY="auto"
                    zIndex={10}
                    minW="220px"
                  >
                    {otherAccounts.map((account) => (
                      <MenuItem
                        key={account.id}
                        onClick={() => setRecipient(account.address)}
                        bg="transparent"
                        _hover={{ bg: "bg.muted" }}
                        py={1.5}
                        px={3}
                      >
                        <HStack spacing={2} align="start">
                          <Image
                            src={getAccountAvatar(account)}
                            alt="avatar"
                            boxSize="20px"
                            minW="20px"
                            borderRadius={getAccountAvatar(account) === "/bankr-icon.png" ? "sm" : "full"}
                            border="2px solid"
                            borderColor="border.default"
                          />
                          <VStack align="start" spacing={0.5}>
                            <Text fontSize="xs" fontWeight="700" color="text.primary" noOfLines={1}>
                              {getAccountDisplayName(account)}
                            </Text>
                            {hasSecondaryAddressLine(account) && (
                              <Text fontSize="2xs" fontFamily="mono" color="text.tertiary">
                                {truncateAddress(account.address)}
                              </Text>
                            )}
                            <Box
                              bg={getAccountTypePillStyles(account).bg}
                              px={1.5}
                              py={0}
                              borderRadius="sm"
                              border="1px solid"
                              borderColor="border.default"
                            >
                              <Text
                                fontSize="8px"
                                color={getAccountTypePillStyles(account).color}
                                fontWeight="800"
                                textTransform="uppercase"
                                letterSpacing="wide"
                              >
                                {getAccountTypePillStyles(account).label}
                              </Text>
                            </Box>
                          </VStack>
                        </HStack>
                      </MenuItem>
                    ))}
                  </MenuList>
                </Menu>
              )}
            </HStack>
            {/* Resolution status - top right */}
            {recipient && (isResolving || isLoadingExtras) && (
              <HStack spacing={1}>
                <Spinner size="xs" color="accent.secondary" />
                <Text fontSize="xs" color="text.tertiary" fontWeight="700">
                  Resolving...
                </Text>
              </HStack>
            )}
            {recipient && !isResolving && isRecipientValid && resolvedAddress && (
              <HStack spacing={0.5}>
                {avatar && (
                  <Image
                    src={cachedRecipientAvatar || avatar}
                    alt="avatar"
                    boxSize="14px"
                    borderRadius="full"
                    border="1px solid"
                    borderColor="border.default"
                  />
                )}
                {isResolvableName(recipient) ? (
                  <Text fontSize="xs" color="text.tertiary" fontFamily="mono" fontWeight="700">
                    {resolvedAddress.slice(0, 6)}...{resolvedAddress.slice(-4)}
                  </Text>
                ) : resolvedName ? (
                  <Text fontSize="xs" color="text.tertiary" fontWeight="700">
                    {resolvedName}
                  </Text>
                ) : null}
                <IconButton
                  aria-label="Copy address"
                  icon={copied ? <CheckIcon boxSize="10px" /> : <CopyIcon boxSize="10px" />}
                  size="xs"
                  variant="ghost"
                  minW="18px"
                  h="18px"
                  color={copied ? "accent.highlight" : "text.tertiary"}
                  onClick={async () => {
                    await navigator.clipboard.writeText(resolvedAddress);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                />
                {explorerUrl && (
                  <IconButton
                    aria-label="View on explorer"
                    icon={<ExternalLinkIcon boxSize="10px" />}
                    size="xs"
                    variant="ghost"
                    minW="18px"
                    h="18px"
                    color="text.tertiary"
                    onClick={() => window.open(`${explorerUrl}/address/${resolvedAddress}`, "_blank")}
                    _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                  />
                )}
              </HStack>
            )}
          </HStack>
          <Input
            placeholder="0x..., ENS, Basename, .wei, .gwei, or .mega"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value.trim())}
            fontFamily="mono"
            fontSize="sm"
            isInvalid={!!recipient && !isResolving && !isRecipientValid}
          />
          {recipient && !isResolving && !isRecipientValid && (
            <Text fontSize="xs" color="chart.negative" fontWeight="700" mt={1}>
              {resolverError || "Invalid address or name"}
            </Text>
          )}
          {/* Contract recipient warning. EIP-7702 delegated EOAs are excluded —
              they still control their own private key, so sending to them is
              equivalent to sending to a regular EOA. */}
          {isRecipientContract && (
            <Box
              mt={2}
              border={tokens.borders.medium}
              borderColor="status.warning.border"
              borderRadius="lg"
              bg="status.warning.bg"
              boxShadow="card"
              px={3}
              py={2.5}
            >
              <HStack spacing={2} align="flex-start">
                <WarningTwoIcon
                  boxSize="14px"
                  color="status.warning.fg"
                  mt="2px"
                  flexShrink={0}
                />
                <VStack align="stretch" spacing={2} flex={1}>
                  <Text fontSize="xs" fontWeight="800" color="status.warning.fg" lineHeight="short">
                    Recipient is a smart contract.
                  </Text>
                  <Text fontSize="xs" fontWeight="600" color="status.warning.fg" lineHeight="short">
                    Tokens sent directly to a contract may be permanently stuck.
                  </Text>
                  <Box
                    bg="surface.raised"
                    border={tokens.borders.thin}
                    borderColor="border.default"
                    borderRadius="md"
                    px={2}
                    py={1.5}
                  >
                    <Checkbox
                      isChecked={acknowledgeContract}
                      onChange={(e) => setAcknowledgeContract(e.target.checked)}
                      size="sm"
                      colorScheme="orange"
                      sx={{
                        "& .chakra-checkbox__control": {
                          borderWidth: "2px",
                          borderColor: "border.default",
                          bg: "surface.base",
                        },
                        "& .chakra-checkbox__label": {
                          fontSize: "xs",
                          fontWeight: 800,
                          color: "text.primary",
                        },
                      }}
                    >
                      I understand and want to continue
                    </Checkbox>
                  </Box>
                </VStack>
              </HStack>
            </Box>
          )}
        </Box>
        )}

        {/* Amount input */}
        <Box>
          <HStack justify="space-between" align="center" mb={1}>
            <Text fontSize="sm" fontWeight="700" color="text.secondary" textTransform="uppercase">
              Amount
            </Text>
            {hasPrice && (
              <Button
                size="xs"
                variant="ghost"
                color="accent.secondary"
                fontWeight="800"
                fontSize="xs"
                h="20px"
                px={1}
                onClick={handleToggleMode}
                _hover={{ bg: "bg.muted" }}
              >
                {isUsdMode ? token.symbol.toUpperCase() : "USD"}
              </Button>
            )}
          </HStack>
          <InputGroup>
            {isUsdMode && (
              <InputLeftElement pointerEvents="none" h="full" w="28px" pl={2}>
                <Text fontFamily="mono" fontSize="sm" color="text.tertiary" fontWeight="700">$</Text>
              </InputLeftElement>
            )}
            <Input
              placeholder="0.0"
              value={amount}
              onChange={(e) => {
                const val = e.target.value;
                if (/^\d*\.?\d*$/.test(val)) {
                  setAmount(val);
                  syncSliderFromAmount(val);
                }
              }}
              fontFamily="mono"
              fontSize="sm"
              pl={isUsdMode ? "28px" : undefined}
              pr="60px"
            />
            <InputRightElement w="55px" h="full">
              <Button
                size="xs"
                variant="ghost"
                color="accent.secondary"
                fontWeight="800"
                onClick={handleMaxAmount}
                _hover={{ bg: "bg.muted" }}
              >
                MAX
              </Button>
            </InputRightElement>
          </InputGroup>
          {/* Conversion display */}
          {amount && parseFloat(amount) > 0 && hasPrice && (
            <Text fontSize="xs" color="text.tertiary" fontWeight="700" mt={1}>
              {isUsdMode
                ? `${formatTokenAmount(parseFloat(amount) / token.priceUsd)} ${token.symbol.toUpperCase()}`
                : formatUsd(parseFloat(amount) * token.priceUsd)
              }
            </Text>
          )}
          {/* Percentage slider */}
          {balanceNum > 0 && (
            <Box px={2} pt={2} pb={6}>
              <Slider
                min={0}
                max={100}
                step={1}
                value={sliderValue}
                focusThumbOnChange={false}
                onChange={(val) => {
                  const SNAP_THRESHOLD = 3;
                  const snaps = [0, 25, 50, 75, 100];
                  const nearest = snaps.find((s) => Math.abs(val - s) <= SNAP_THRESHOLD);
                  const snapped = nearest !== undefined ? nearest : val;
                  setSliderValue(snapped);
                  setAmountFromSlider(snapped);
                }}
              >
                {[0, 25, 50, 75, 100].map((pct) => (
                  <SliderMark
                    key={pct}
                    value={pct}
                    mt={3}
                    fontSize="xs"
                    fontWeight="800"
                    color={sliderValue >= pct ? "accent.secondary" : "fg.muted"}
                    whiteSpace="nowrap"
                    transform="translateX(-50%)"
                  >
                    {pct}%
                  </SliderMark>
                ))}
                {/* Slider baseStyle (createTheme.ts) drives track/thumb radii
                    from theme tokens — Bauhaus square, Midnight rounded. */}
                <SliderTrack bg="bg.muted" h="6px">
                  <SliderFilledTrack bg="accent.secondary" />
                </SliderTrack>
                <SliderThumb
                  boxSize={5}
                  bg="accent.secondary"
                  border={tokens.borders.medium}
                  borderColor="border.default"
                  _focus={{ boxShadow: "none" }}
                />
              </Slider>
            </Box>
          )}
          {amount && !isAmountValid() && parseFloat(amount) > 0 && (
            <Text fontSize="xs" color="chart.negative" fontWeight="700" mt={1}>
              Insufficient balance
            </Text>
          )}
        </Box>

        {/* Optional hex calldata for native sends. Native-only because the
            ERC20 transfer path synthesizes its own calldata — letting the user
            override it there would just produce a broken tx. */}
        {isNativeToken && (
          <Box>
            <HStack
              as="button"
              type="button"
              w="full"
              spacing={1}
              align="center"
              onClick={() => setIsHexDataExpanded((v) => !v)}
              cursor="pointer"
              _hover={{ opacity: 0.8 }}
              transition="opacity 0.15s"
            >
              {isHexDataExpanded ? (
                <ChevronDownIcon boxSize="14px" color="text.secondary" />
              ) : (
                <ChevronRightIcon boxSize="14px" color="text.secondary" />
              )}
              <Text
                fontSize="sm"
                fontWeight="700"
                color="text.secondary"
                textTransform="uppercase"
              >
                Hex Data
              </Text>
              <Text
                fontSize="2xs"
                fontWeight="700"
                color="text.tertiary"
                textTransform="uppercase"
                letterSpacing="wide"
              >
                (optional)
              </Text>
              {/* Only surface the invalid state when collapsed so the user
                  isn't told "hey, you typed something" for the happy path —
                  but is still warned about a broken value they can't see. */}
              {!isHexDataExpanded && !hexDataIsEmpty && !isHexDataValid && (
                <Text
                  ml="auto"
                  fontSize="2xs"
                  fontWeight="800"
                  color="chart.negative"
                  textTransform="uppercase"
                  letterSpacing="wide"
                >
                  Invalid
                </Text>
              )}
            </HStack>
            <Collapse in={isHexDataExpanded} animateOpacity>
              <Box mt={1.5}>
                {/* Top-right hex-data action. The deploy gear owns this slot
                    while deployment settings are available; otherwise the
                    native calldata decoder uses the same compact position. */}
                {(canShowDeployToggle || !isContractDeployment) && (
                  <HStack justify="flex-end" spacing={1.5} mb={1}>
                    {canShowDeployToggle ? (
                      <Popover
                        isOpen={deployToggle.isOpen}
                        onOpen={deployToggle.onOpen}
                        onClose={deployToggle.onClose}
                        placement="bottom-end"
                      >
                        <PopoverTrigger>
                          {/* When deploy is active, the trigger expands to
                              include the "Deploy Contract" label so the whole
                              group (gear + text) is one tap target. Otherwise
                              it stays a compact icon-only button. */}
                          {isContractDeployment ? (
                            <Button
                              aria-label="Advanced hex data settings"
                              size="xs"
                              variant="ghost"
                              h="22px"
                              px={1.5}
                              leftIcon={<SettingsIcon boxSize="12px" />}
                              iconSpacing={1.5}
                              color="accent.secondary"
                              fontSize="2xs"
                              fontWeight="800"
                              textTransform="uppercase"
                              letterSpacing="0.06em"
                              _hover={{ bg: "bg.muted" }}
                            >
                              Deploy Contract
                            </Button>
                          ) : (
                            <IconButton
                              aria-label="Advanced hex data settings"
                              icon={<SettingsIcon boxSize="12px" />}
                              size="xs"
                              variant="ghost"
                              minW="22px"
                              h="22px"
                              color="text.tertiary"
                              _hover={{ bg: "bg.muted" }}
                            />
                          )}
                        </PopoverTrigger>
                        <Portal>
                          <PopoverContent
                            bg="surface.raised"
                            border={tokens.borders.medium}
                            borderColor="border.default"
                            borderRadius="lg"
                            boxShadow="card"
                            w="240px"
                            zIndex="popover"
                            _focus={{ outline: "none", boxShadow: "card" }}
                          >
                            <PopoverArrow bg="surface.raised" />
                            <PopoverBody p={3}>
                              <VStack align="stretch" spacing={2}>
                                <Text
                                  fontSize="2xs"
                                  fontWeight="800"
                                  color="text.tertiary"
                                  textTransform="uppercase"
                                  letterSpacing="0.06em"
                                >
                                  Advanced
                                </Text>
                                {/* Whole card is the tap target so users can
                                    click anywhere — checkbox, heading, or
                                    description — to toggle. The Checkbox below
                                    is pointer-event-disabled so it never fights
                                    the Box's onClick; the Box owns toggling. */}
                                <Box
                                  bg="surface.base"
                                  border={tokens.borders.thin}
                                  borderColor="border.default"
                                  borderRadius="md"
                                  px={2.5}
                                  py={2}
                                  opacity={hasNativeCalldata ? 1 : 0.55}
                                  cursor={hasNativeCalldata ? "pointer" : "not-allowed"}
                                  role={hasNativeCalldata ? "button" : undefined}
                                  aria-pressed={isContractDeployment}
                                  onClick={() => {
                                    if (!hasNativeCalldata) return;
                                    setIsContractDeployment((prev) => !prev);
                                    deployToggle.onClose();
                                  }}
                                  _hover={hasNativeCalldata ? { bg: "bg.muted" } : undefined}
                                  transition="background 0.15s"
                                >
                                  <Checkbox
                                    isChecked={isContractDeployment}
                                    isDisabled={!hasNativeCalldata}
                                    pointerEvents="none"
                                    size="sm"
                                    sx={{
                                      "& .chakra-checkbox__control": {
                                        borderWidth: "2px",
                                        borderColor: "border.default",
                                        bg: "surface.base",
                                      },
                                      "& .chakra-checkbox__label": {
                                        fontSize: "xs",
                                        fontWeight: 800,
                                        color: "text.primary",
                                      },
                                    }}
                                  >
                                    Deploy contract
                                  </Checkbox>
                                  <Text fontSize="2xs" color="text.tertiary" fontWeight="600" mt={1}>
                                    {hasNativeCalldata
                                      ? "Send as a contract deployment. Recipient is set to null and the bytes below are treated as the deployment bytecode."
                                      : "Add valid hex data to enable. The bytes below will be the deployment bytecode."}
                                  </Text>
                                </Box>
                              </VStack>
                            </PopoverBody>
                          </PopoverContent>
                        </Portal>
                      </Popover>
                    ) : (
                      <Tooltip
                        label={decodeCalldataDisabledReason || "Decode calldata"}
                        fontSize="xs"
                        hasArrow
                        isDisabled={canOpenCalldataDecoder}
                      >
                        <Box as="span" display="inline-block">
                          <Button
                            size="xs"
                            variant="ghost"
                            h="22px"
                            px={1.5}
                            leftIcon={<Search2Icon boxSize="12px" />}
                            iconSpacing={1.5}
                            color="accent.secondary"
                            fontSize="2xs"
                            fontWeight="800"
                            textTransform="uppercase"
                            letterSpacing="0.06em"
                            isDisabled={!canOpenCalldataDecoder}
                            onClick={calldataDecodeModal.onOpen}
                            _hover={{ bg: "bg.muted" }}
                          >
                            Decode
                          </Button>
                        </Box>
                      </Tooltip>
                    )}
                  </HStack>
                )}
                <Textarea
                  placeholder="0x..."
                  value={hexData}
                  onChange={(e) => setHexData(e.target.value)}
                  fontFamily="mono"
                  fontSize="xs"
                  rows={3}
                  resize="vertical"
                  isInvalid={!isHexDataValid}
                  bg="surface.raised"
                  color="fg.primary"
                  border={tokens.borders.thin}
                  borderColor="border.default"
                  borderRadius={tokens.radii.input}
                  _placeholder={{ color: "fg.muted" }}
                  _hover={{ bg: "surface.raised", borderColor: "border.default" }}
                  _focus={{
                    bg: "surface.raised",
                    borderColor: "border.focus",
                    boxShadow: "focus",
                  }}
                  _invalid={{
                    borderColor: "chart.negative",
                    boxShadow: "3px 3px 0px 0px var(--chakra-colors-chart-negative)",
                  }}
                />
                <Text fontSize="2xs" color="text.tertiary" fontWeight="600" mt={1}>
                  Bytes appended as tx calldata. Leave blank for a plain transfer.
                </Text>
                {!isHexDataValid && (
                  <Text fontSize="xs" color="chart.negative" fontWeight="700" mt={1}>
                    Must be a 0x-prefixed hex string with an even number of hex chars.
                  </Text>
                )}
              </Box>
            </Collapse>
          </Box>
        )}

        {/* Sponsored USDC banner */}
        {isUsdcOnBase && !premiumLoading && premiumStatus?.isPremium && accountType !== "impersonator" && (
          <Box
            bg="accent.secondary"
            border={tokens.borders.medium}
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="card"
            p={3}
          >
            <Text fontSize="md" color="accentFg.secondary" fontWeight="900" textTransform="uppercase" textAlign="center">
              Gas Sponsored by us!
            </Text>
            <Text fontSize="xs" color="accentFg.secondary" opacity={0.8} fontWeight="700" textAlign="center" mt={0.5}>
              Free USDC transfer for sWCHAN stakers
            </Text>
          </Box>
        )}
        {isUsdcOnBase && premiumLoading && (
          <Skeleton h="60px" />
        )}

        {/* Sponsored transfer failed — fallback to normal send */}
        {sponsoredFailed && (
          <Box
            bg="status.error.bg"
            border={tokens.borders.medium}
            borderColor="status.error.border"
            borderRadius="lg"
            boxShadow="card"
            p={3}
          >
            <Text fontSize="xs" color="status.error.fg" fontWeight="800">
              ⚠️ Gas-free transfer is temporarily unavailable.
            </Text>
            <Text fontSize="xs" color="status.error.fg" opacity={0.8} fontWeight="700" mt={1}>
              You can still send by paying gas yourself.
            </Text>
            <Button
              mt={2}
              w="full"
              size="sm"
              variant="highlight"
              fontSize="xs"
              isLoading={isSubmitting}
              onClick={handleFallbackSend}
              animation="fallbackBounce 1.5s ease-in-out infinite"
              sx={{
                "@keyframes fallbackBounce": {
                  "0%, 100%": { transform: "translateY(0)" },
                  "50%": { transform: "translateY(-3px)" },
                },
              }}
              _hover={{ animation: "none", opacity: 0.9 }}
              _active={{ animation: "none" }}
            >
              ⛽ Send (Pay Gas)
            </Button>
          </Box>
        )}

        {/* Impersonator warning */}
        {accountType === "impersonator" && (
          <Box
            bg="accent.highlight"
            border={tokens.borders.medium}
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="card"
            p={3}
          >
            <Text fontSize="sm" color="accentFg.highlight" fontWeight="700">
              View-only account — transfers are disabled.
            </Text>
          </Box>
        )}

        {/* Action buttons — sticky when the form content exceeds the viewport.
            This mirrors the confirmation screens while remaining in normal
            document flow when the form is short. */}
        <Box
          position="sticky"
          bottom={0}
          bg="surface.base"
          pt={2}
          pb={4}
          mx={-4}
          px={4}
          zIndex={1}
        >
          <HStack spacing={3}>
            <Button
              variant="secondary"
              flex={1}
              onClick={onBack}
              isDisabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              flex={1}
              onClick={handleSubmit}
              isLoading={isSubmitting}
              isDisabled={!canSubmit || accountType === "impersonator"}
              bg="accent.secondary"
              color="accentFg.secondary"
              border={tokens.borders.medium}
              borderColor="border.default"
              boxShadow="card"
              fontWeight="700"
              fontSize={isSponsoredFlow ? "xs" : undefined}
              _hover={{
                bg: "accent.secondary",
                opacity: 0.9,
                boxShadow: "cardHover",
              }}
            >
              {isSponsoredFlow ? "Sign (Gas-Free)" : "Send"}
            </Button>
          </HStack>
        </Box>

        {canOpenCalldataDecoder && resolvedAddress && (
          <NativeCalldataDecodeModal
            isOpen={calldataDecodeModal.isOpen}
            onClose={calldataDecodeModal.onClose}
            calldata={trimmedHexData}
            from={fromAddress}
            to={resolvedAddress}
            chainId={selectedChainId}
          />
        )}
      </VStack>
    </Box>
  );
}

export default memo(TokenTransfer);
