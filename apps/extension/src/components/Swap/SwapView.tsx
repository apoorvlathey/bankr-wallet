import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  IconButton,
  Image,
  InputGroup,
  Input,
  InputLeftElement,
  InputRightElement,
  Icon,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  SliderMark,
} from "@chakra-ui/react";
import { ChevronDownIcon, CopyIcon, CheckIcon, ExternalLinkIcon, TimeIcon } from "@chakra-ui/icons";
import LoadingDots from "@/components/LoadingDots";
import { parseEther, parseUnits, formatUnits } from "viem";
import { useThemedToast } from "@/hooks/useThemedToast";
import { type PortfolioToken } from "@/chrome/portfolioApi";
import { formatUsd } from "@/lib/currencyFormatUtils";
import { formatTokenAmountFromBase } from "@/lib/tokenFormatUtils";
import { fetchOnchainBalances } from "@/chrome/onchainBalances";
import { loadPortfolioTokenCatalog } from "@/chrome/portfolioTokens";
import {
  NATIVE_TOKEN_ADDRESS,
  DEFAULT_SLIPPAGE_BPS,
  buildApprovalTx,
  buildPermit2ApproveTx,
  type SwapQuoteResponse,
  type TokenInfo,
} from "@/chrome/swapApi";
import {
  SWAP_SUPPORTED_CHAIN_IDS,
  BANKR_SUPPORTED_CHAIN_IDS,
} from "@/constants/chainRegistry";
import { getChainConfig } from "@/constants/chainConfig";
import {
  getStoredRpcUrl,
  getResolvedChainById,
  getNativeAssetLogoUrl,
  getNativeAssetMeta,
} from "@/lib/chains";
import { useNetworks } from "@/contexts/NetworksContext";
import { encodeBatchCalls } from "@/chrome/batchTxHandlers";
import type { ERC5792Call } from "@/chrome/erc5792Types";
import BridgeChainTokenModal from "./BridgeChainTokenModal";
import { TokenSymbolFallback } from "./TokenSymbolFallback";
import SwapQuoteDisplay from "./SwapQuoteDisplay";
import BridgeQuoteDisplay from "./BridgeQuoteDisplay";
import SlippageSettings from "./SlippageSettings";
import SwapConfirmation, {
  type PreparedSwapTxEntry,
} from "./SwapConfirmation";
import {
  getExecutableBridgeRoute,
  getExecutableBridgeRouteSelection,
} from "./bridgeRouteUtils";
import ChainIcon from "@/components/ChainIcon";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import {
  BUNGEE_NATIVE_TOKEN,
  type BungeeQuoteResponse,
} from "@walletchan/shared/bungee";
import { getCachedBungeeTokens } from "@/chrome/bridgeApi";
import { getBungeeChain } from "@/lib/bungeeChainCache";
import {
  AppHeader,
  AppScreen,
  ScreenBody,
  StickyActionBar,
} from "@/components/ui";

// Swap direction arrow icon
const SwapArrowIcon = (props: React.ComponentProps<typeof Icon>) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path
      fill="currentColor"
      d="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z"
    />
  </Icon>
);

const formatOutputAmount = (amount: string, decimals: number): string =>
  formatTokenAmountFromBase(amount, decimals);

/** Map PortfolioToken.contractAddress to 0x API token address */
function to0xToken(token: PortfolioToken): string {
  return token.contractAddress === "native"
    ? NATIVE_TOKEN_ADDRESS
    : token.contractAddress;
}

/**
 * Resolve the EIP-7702 delegate for a PK/Seed account × chain pair so the
 * swap path can decide between sequential broadcasts and an atomic 7702 tx.
 * Returns null when no usable delegate exists (chain not Pectra-supported +
 * no custom override) — caller falls back to the sequential path.
 *
 * Note: capability resolution lives entirely in the background — this is a
 * thin wrapper over the existing `getDelegationStatus` message so the swap
 * surface doesn't reach into delegate internals.
 */
function resolveSwapDelegate(
  accountId: string,
  chainId: number,
): Promise<{
  delegate: `0x${string}`;
  needsAuth: boolean;
  onchainDelegate: `0x${string}` | null;
} | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "getDelegationStatus", accountId, chainId },
      (res: any) => {
        if (chrome.runtime.lastError || !res?.success || !res?.delegate) {
          resolve(null);
          return;
        }
        resolve({
          delegate: res.delegate,
          needsAuth: Boolean(res.needsAuthorization),
          // Forwarded so SwapConfirmation can render the "Replacing existing
          // delegation" variant of the smart-account banner when the EOA is
          // already delegated to a non-7821 contract.
          onchainDelegate: res.onchainDelegate ?? null,
        });
      },
    );
  });
}

interface SwapViewProps {
  fromAddress: string;
  /** Active account ID — needed to resolve the EIP-7702 delegate for PK/Seed atomic swaps. Undefined falls back to sequential. */
  accountId?: string;
  accountType: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  chainId: number;
  chainName: string;
  onBack: () => void;
  onSwapInitiated: () => void;
  onChainChange: (chainName: string) => void;
  initialBuyToken?: { address: string; name: string; symbol: string; decimals: number; logoURI?: string };
  initialSellToken?: PortfolioToken;
}

function SwapView({
  fromAddress,
  accountId,
  accountType,
  chainId: initialChainId,
  chainName: initialChainName,
  onBack,
  onSwapInitiated,
  // The top-level chain selector outside the Swap surface still owns the
  // global / per-tab chain (dapps reference it). We deliberately do NOT call
  // onChainChange from any picker inside this surface — the swap/bridge tx
  // is decided by sellChainId/buyChainId here, independent of dapps. Prop
  // is kept in the signature for shape stability.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onChainChange: _onChainChange,
  initialBuyToken,
  initialSellToken,
}: SwapViewProps) {
  // Internal per-side chain state. Buy defaults to sell so a same-chain swap
  // is one click away; the user changes buyChainId only when they want to
  // bridge. Neither writes back to the global chain.
  //
  // If the user lands here with an unsupported global chain (e.g. a custom
  // testnet), fall back to Ethereum so the form is immediately usable. The
  // per-side chain pickers inside the token selectors then let them retarget
  // to whichever supported chain they actually want.
  const initialSwapChainId = SWAP_SUPPORTED_CHAIN_IDS.has(initialChainId)
    ? initialChainId
    : 1;
  const [sellChainId, setSellChainId] = useState<number>(initialSwapChainId);
  const [buyChainId, setBuyChainId] = useState<number>(initialSwapChainId);
  // Shadow the prop with the internal sell-side chain. Existing references
  // throughout the file (token list, allowance checks, portfolio loads…)
  // continue to read `chainId` and naturally retarget to the source chain.
  const chainId = sellChainId;
  const { networksInfo } = useNetworks();
  const sellChainConfig = getChainConfig(sellChainId);
  const resolvedSellChainName =
    getResolvedChainById(sellChainId, networksInfo)?.name;
  const chainName =
    resolvedSellChainName || sellChainConfig.name || initialChainName;
  const resolvedBuyChainName =
    getResolvedChainById(buyChainId, networksInfo)?.name ??
    getChainConfig(buyChainId).name;
  const isBridge = sellChainId !== buyChainId;
  const toast = useThemedToast();

  // Holdings (filtered to the current sell chain)
  const [, setHoldings] = useState<PortfolioToken[]>([]);
  const [, setHoldingsLoading] = useState(true);
  // Cross-chain catalog — drives chain portfolio totals + Your Tokens in the
  // nested chain/token picker. Filled by the same effect that
  // populates `holdings`, so it's free.
  const [holdingsAllChains, setHoldingsAllChains] = useState<PortfolioToken[]>([]);

  // Sell side
  const [sellToken, setSellToken] = useState<PortfolioToken | null>(null);
  const [sellAmount, setSellAmount] = useState(""); // display value (token or USD)
  const [isUsdMode, setIsUsdMode] = useState(false);
  const [sliderValue, setSliderValue] = useState(0);

  // Buy side
  const [buyTokenAddress, setBuyTokenAddress] = useState(initialBuyToken?.address ?? "");
  const [buyTokenInfo, setBuyTokenInfo] = useState<TokenInfo | null>(
    initialBuyToken ? { name: initialBuyToken.name, symbol: initialBuyToken.symbol, decimals: initialBuyToken.decimals } : null,
  );
  const [buyTokenLogoURI, setBuyTokenLogoURI] = useState<string | undefined>(initialBuyToken?.logoURI);
  const [, setBuyTokenLoading] = useState(false);
  const [buyTokenPriceUsd, setBuyTokenPriceUsd] = useState<number>(0);
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const [isMaxMode, setIsMaxMode] = useState(false);

  // Nested chain/token picker opened by either side. SwapView retains all form
  // state, so Back simply unmounts the picker and preserves the current value.
  const [chainTokenModalSide, setChainTokenModalSide] = useState<"sell" | "buy" | null>(null);

  // Quote (same-chain via 0x)
  const [quote, setQuote] = useState<SwapQuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  // Cross-chain quote (via Bungee).
  const [bridgeQuote, setBridgeQuote] = useState<BungeeQuoteResponse | null>(null);

  // Powers the "Swap to NATIVE on CHAIN instead?" recovery affordance shown
  // under a failed bridge quote. Resolved from the local CHAIN_REGISTRY when
  // available, otherwise from the Bungee tokens cache (covers RWA / non-EVM-
  // mainnet destinations like Plume / Tempo that we don't carry registry
  // entries for).
  const [destNativeInfo, setDestNativeInfo] = useState<{
    symbol: string;
    name: string;
    decimals: number;
    logoUrl: string;
    chainName: string;
  } | null>(null);

  // Settings — slippage persists in chrome.storage.sync so a user who
  // explicitly tunes it once (e.g. down from the 5% default) doesn't have it
  // reset on the next session / popup reopen.
  const [slippageBps, setSlippageBpsState] = useState(DEFAULT_SLIPPAGE_BPS);
  useEffect(() => {
    chrome.storage.sync.get("swapSlippageBps", (result) => {
      const stored = result.swapSlippageBps;
      if (typeof stored === "number" && stored > 0 && stored <= 10_000) {
        setSlippageBpsState(stored);
      }
    });
  }, []);
  const setSlippageBps = useCallback((bps: number) => {
    setSlippageBpsState(bps);
    chrome.storage.sync.set({ swapSlippageBps: bps });
  }, []);

  // Submit
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Confirmation step
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [preparedTransactions, setPreparedTransactions] = useState<
    PreparedSwapTxEntry[] | null
  >(null);
  const [preparedBatchTx, setPreparedBatchTx] = useState<{ to: string; data: string; value: string } | null>(null);
  const [preparedAccountLock, setPreparedAccountLock] = useState<{
    accountId: string;
    fromAddress: string;
  } | null>(null);
  // For PK/SP atomic-7702 swaps: the delegate resolved at prepare time +
  // whether the EOA needs a fresh authorization tuple bundled into the
  // broadcast. `delegate` is null on Bankr atomic (server-side) and on
  // PK/SP flows that fell back to sequential. `needsAuth` matters only for
  // gas estimation — when true, MultiTxGasEstimateDisplay applies the
  // delegate's code as a state override so the wrapped tx simulates
  // correctly pre-authorization.
  const [prepared7702, setPrepared7702] = useState<{
    delegate: `0x${string}`;
    needsAuth: boolean;
    onchainDelegate: `0x${string}` | null;
  } | null>(null);
  const [preparedQuote, setPreparedQuote] = useState<SwapQuoteResponse | null>(null);
  // Per-call gas estimates from the SwapConfirmation tier picker. Bubbled
  // up from MultiTxGasEstimateDisplay → SwapConfirmation → here, then
  // forwarded to handleExecuteSwapDirect so the user's tier choice
  // actually takes effect at signing time. Bankr atomic swaps don't use
  // this — Bankr API computes gas server-side.
  const [swapGasEstimates, setSwapGasEstimates] = useState<
    import("@/chrome/gasEstimation").GasEstimate[] | null
  >(null);
  const [swapGasValid, setSwapGasValid] = useState(true);

  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenInfoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set true when token picker selection already provides token info — skips useEffect re-fetch */
  const buyInfoSetBySelectRef = useRef(false);

  const isSwapSupported = SWAP_SUPPORTED_CHAIN_IDS.has(chainId);
  const hasPrice = sellToken ? sellToken.priceUsd > 0 : false;
  const sellBalance = sellToken ? parseFloat(sellToken.balance) : 0;

  /** Actual token amount to swap (converts from USD if in USD mode) */
  const sellTokenAmount = useMemo(() => {
    if (!sellAmount) return "";
    const num = parseFloat(sellAmount);
    if (isNaN(num) || num <= 0) return "";
    if (isUsdMode && hasPrice && sellToken) {
      const converted = num / sellToken.priceUsd;
      // Cap at balance only for MAX/slider to avoid rounding overshoot
      const final = isMaxMode ? Math.min(converted, sellBalance) : converted;
      return final.toFixed(sellToken.decimals);
    }
    return sellAmount;
  }, [sellAmount, isUsdMode, hasPrice, sellToken, sellBalance, isMaxMode]);

  const setAmountFromSlider = (pct: number) => {
    if (!sellToken) return;
    setIsMaxMode(pct === 100);
    if (pct === 0) {
      setSellAmount("");
    } else if (pct === 100) {
      if (isUsdMode && hasPrice) {
        setSellAmount((sellBalance * sellToken.priceUsd).toFixed(2));
      } else {
        setSellAmount(sellToken.balance);
      }
    } else {
      const tokenAmt = (sellBalance * pct) / 100;
      if (isUsdMode && hasPrice) {
        setSellAmount((tokenAmt * sellToken.priceUsd).toFixed(2));
      } else {
        setSellAmount(
          tokenAmt === 0 ? "0" : parseFloat(tokenAmt.toPrecision(6)).toString(),
        );
      }
    }
  };

  const syncSliderFromAmount = (val: string) => {
    const num = parseFloat(val);
    if (!val || isNaN(num) || num <= 0 || sellBalance <= 0) {
      setSliderValue(0);
      return;
    }
    let tokenVal = num;
    if (isUsdMode && hasPrice && sellToken) {
      tokenVal = num / sellToken.priceUsd;
    }
    setSliderValue(Math.min(100, Math.round((tokenVal / sellBalance) * 100)));
  };

  const handleToggleMode = () => {
    if (!hasPrice || !sellToken) return;
    const num = parseFloat(sellAmount);
    if (sellAmount && !isNaN(num) && num > 0) {
      if (isUsdMode) {
        const converted = num / sellToken.priceUsd;
        setSellAmount(parseFloat(converted.toPrecision(6)).toString());
      } else {
        setSellAmount((num * sellToken.priceUsd).toFixed(2));
      }
    }
    setIsUsdMode(!isUsdMode);
  };

  // -----------------------------------------------------------------------
  // Load holdings for current chain
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isSwapSupported) {
      setHoldingsLoading(false);
      return;
    }
    let cancelled = false;
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

        const chainTokens = tokens.filter((t) => t.chainId === chainId);
        setHoldings(chainTokens);
        setHoldingsAllChains(tokens);
        // If initialSellToken provided, find the matching token from portfolio.
        // Otherwise leave the sell token unselected — the user picks one explicitly.
        if (initialSellToken) {
          const match = chainTokens.find(
            (t) => t.contractAddress.toLowerCase() === initialSellToken.contractAddress.toLowerCase(),
          );
          if (match) {
            setSellToken(match);
          } else {
            setSellToken(initialSellToken);
          }
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setHoldingsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Initial sell token is applied only while loading the holdings snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAddress, chainId, isSwapSupported]);

  // -----------------------------------------------------------------------
  // Verify zero balances via direct RPC.
  //
  // The portfolio API can return an empty/incomplete catalog (rate-limit, 5xx,
  // etc.) which leaves the user looking at "Balance: 0" for a token they
  // actually hold. It can also happen any time the user selects a token from
  // the token-list dropdown that isn't in their holdings — `entryToPortfolio
  // Token` defaults balance to "0" because we don't know yet.
  //
  // To avoid that footgun, whenever a sellToken has a 0 reported balance we
  // fall back to a direct onchain `balanceOf` (or `eth_getBalance` for
  // native) — same RPC path the custom-token resolver already uses. We
  // memoize per (chainId, token, owner) so we don't refetch repeatedly when
  // the user types into the amount field.
  // -----------------------------------------------------------------------
  const verifiedZeroBalancesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!sellToken || !fromAddress) return;
    if (parseFloat(sellToken.balance) > 0) return;

    const tokenAddr = sellToken.contractAddress;
    const tokenChainId = sellToken.chainId;
    const tokenDecimals = sellToken.decimals;
    const key = `${tokenChainId}:${tokenAddr.toLowerCase()}:${fromAddress.toLowerCase()}`;
    if (verifiedZeroBalancesRef.current.has(key)) return;
    verifiedZeroBalancesRef.current.add(key);

    let cancelled = false;
    (async () => {
      try {
        const rpcUrl = await getStoredRpcUrl(tokenChainId);
        if (!rpcUrl || cancelled) return;
        const { createPublicClient, http, erc20Abi } = await import("viem");
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

        setSellToken((prev) => {
          // Only patch if user is still on the same token. Avoid clobbering
          // a more recent selection.
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
        // Silent: keep showing 0 if the RPC call fails. The submit-time
        // balance check at line ~668 will still cap onchain.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sellToken, fromAddress]);

  // -----------------------------------------------------------------------
  // USD price fallback for the sell token. The portfolio API is the primary
  // price source but it can be down (then every token comes back with
  // priceUsd=0) or it may simply not price an exotic ERC-20. Either way,
  // resolve the price directly through `fetchTokenPrice` (proxy → CoinGecko
  // → GeckoTerminal fallback chain) so USD-mode entry stays usable. Native
  // tokens already have their own resolution path inside
  // `loadPortfolioTokenCatalog`.
  //
  // We deliberately do NOT use a `cancelled` flag here: the onchain
  // balance verification effect above also calls `setSellToken`, and any
  // state update that changes `sellToken` would trigger this effect's
  // cleanup mid-flight and silently drop the price response (which can
  // take 1-2s when CoinGecko misses and we fall through to GeckoTerminal).
  // The `setSellToken` updater below already guards staleness by matching
  // (chainId, address), so a late response for a token the user has since
  // switched away from is a no-op. Combined with `resolvedSellPriceRef`,
  // each (chainId, address) is fetched at most once per mount.
  // -----------------------------------------------------------------------
  const resolvedSellPriceRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!sellToken) return;
    if (sellToken.priceUsd > 0) return;
    if (sellToken.contractAddress === "native") return;
    if (!/^0x[a-fA-F0-9]{40}$/.test(sellToken.contractAddress)) return;

    const tokenAddr = sellToken.contractAddress;
    const tokenChainId = sellToken.chainId;
    const key = `${tokenChainId}:${tokenAddr.toLowerCase()}`;
    if (resolvedSellPriceRef.current.has(key)) return;
    resolvedSellPriceRef.current.add(key);

    chrome.runtime.sendMessage(
      { type: "fetchTokenPrice", chainId: tokenChainId, address: tokenAddr },
      (res) => {
        const priceUsd = Number(res?.priceUsd ?? 0);
        if (!res?.success || !(priceUsd > 0)) return;
        setSellToken((prev) => {
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
  }, [sellToken]);

  // -----------------------------------------------------------------------
  // Resolve buy token info on the receive chain. In bridge mode, native-token
  // sentinel metadata must come from `buyChainId`, not the source `chainId`.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (tokenInfoTimerRef.current) clearTimeout(tokenInfoTimerRef.current);

    // Skip re-fetch if the token picker already provided the info
    if (buyInfoSetBySelectRef.current) {
      buyInfoSetBySelectRef.current = false;
      setBuyTokenLoading(false);
      return;
    }

    setBuyTokenInfo(null);

    const addr = buyTokenAddress.trim();
    if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      setBuyTokenLoading(false);
      return;
    }

    let cancelled = false;
    const lookupChainId = buyChainId;
    setBuyTokenLoading(true);
    const timerId = setTimeout(() => {
      chrome.runtime.sendMessage(
        { type: "fetchTokenInfo", tokenAddress: addr, chainId: lookupChainId },
        (res) => {
          if (cancelled) return;
          setBuyTokenLoading(false);
          if (res?.success && res.data) {
            setBuyTokenInfo(res.data);
          } else {
            setBuyTokenInfo(null);
          }
        },
      );
    }, 300);
    tokenInfoTimerRef.current = timerId;
    return () => {
      cancelled = true;
      clearTimeout(timerId);
      if (tokenInfoTimerRef.current === timerId) {
        tokenInfoTimerRef.current = null;
      }
    };
  }, [buyTokenAddress, buyChainId]);

  // -----------------------------------------------------------------------
  // Fetch buy token USD price
  // -----------------------------------------------------------------------
  useEffect(() => {
    setBuyTokenPriceUsd(0);
    const addr = buyTokenAddress.trim();
    if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) return;

    // Check if user holds this token on the BUY chain (not the global per-
    // tab chain — for bridges those diverge). `holdingsAllChains` is the
    // multi-chain catalog populated alongside `holdings` for exactly this
    // case; filtering it to `buyChainId` covers same-chain swaps too since
    // `buyChainId` defaults to the current chain.
    const isNative = addr.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
    const held = holdingsAllChains.find(
      (h) =>
        h.chainId === buyChainId &&
        (h.contractAddress.toLowerCase() === addr.toLowerCase() ||
          (isNative && h.contractAddress === "native")),
    );
    if (held && held.priceUsd > 0) {
      setBuyTokenPriceUsd(held.priceUsd);
      return;
    }

    // Fetch from CoinGecko via walletchan proxy — scoped to the BUY chain
    // so ETH-on-Ethereum vs ETH-on-Base etc. resolve to the right pool.
    chrome.runtime.sendMessage(
      { type: "fetchTokenPrice", chainId: buyChainId, address: addr },
      (res) => {
        if (res?.success && res.priceUsd > 0) {
          setBuyTokenPriceUsd(res.priceUsd);
        }
      },
    );
  }, [buyTokenAddress, buyChainId, holdingsAllChains]);

  // -----------------------------------------------------------------------
  // Auto-fetch quote (debounced)
  // -----------------------------------------------------------------------
  const fetchQuote = useCallback(() => {
    if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);

    const addr = buyTokenAddress.trim();
    if (
      !sellToken ||
      !addr ||
      !/^0x[a-fA-F0-9]{40}$/.test(addr) ||
      !sellTokenAmount
    ) {
      setQuote(null);
      setBridgeQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }

    let sellAmountWei: string;
    try {
      const isNative = sellToken.contractAddress === "native";
      const parsed = isNative
        ? parseEther(sellTokenAmount)
        : parseUnits(sellTokenAmount, sellToken.decimals);
      if (parsed <= 0n) {
        // Slider dragged back to 0 — kill any in-flight loader so the
        // YOU RECEIVE field doesn't stay stuck on bouncing dots.
        setQuote(null);
        setBridgeQuote(null);
        setQuoteError(null);
        setQuoteLoading(false);
        return;
      }
      sellAmountWei = parsed.toString();
    } catch {
      setQuoteLoading(false);
      return;
    }

    setQuoteLoading(true);
    setQuoteError(null);
    // Clear the previous quote immediately so its stale `output.amount`
    // (still encoded in the OLD buy token's decimals) doesn't get re-rendered
    // through the NEW buyTokenInfo.decimals during the 500ms debounce — that
    // produced bogus "<0.000001" min-received flashes on output-token swaps.
    setQuote(null);
    setBridgeQuote(null);

    quoteTimerRef.current = setTimeout(() => {
      if (isBridge) {
        // Cross-chain → Bungee. Map our native sentinel to Bungee's
        // universal sentinel; the server proxy normalizes the casing.
        const sellAddr =
          sellToken.contractAddress === "native"
            ? BUNGEE_NATIVE_TOKEN
            : sellToken.contractAddress;
        const buyAddrForBungee =
          addr.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()
            ? BUNGEE_NATIVE_TOKEN
            : addr;
        // Bungee's `slippage` is in percent (e.g. 1 = 1%); our internal
        // representation is bps (100 = 1%). Divide before sending.
        const slippagePct = slippageBps / 100;
        chrome.runtime.sendMessage(
          {
            type: "fetchBridgeQuote",
            userAddress: fromAddress,
            receiverAddress: fromAddress,
            originChainId: sellChainId,
            destinationChainId: buyChainId,
            inputToken: sellAddr,
            outputToken: buyAddrForBungee,
            inputAmount: sellAmountWei,
            slippage: slippagePct,
          },
          (res) => {
            setQuoteLoading(false);
            setQuote(null);
            if (res?.success && getExecutableBridgeRoute(res.data)) {
              setBridgeQuote(res.data);
              setQuoteError(null);
            } else {
              setBridgeQuote(null);
              setQuoteError(res?.error || "No bridge route available");
            }
          },
        );
        return;
      }
      chrome.runtime.sendMessage(
        {
          type: "fetchSwapPrice",
          chainId,
          sellToken: to0xToken(sellToken),
          buyToken: addr,
          sellAmount: sellAmountWei,
          taker: fromAddress,
          slippageBps,
        },
        (res) => {
          setQuoteLoading(false);
          setBridgeQuote(null);
          if (res?.success && res.data) {
            if (!res.data.liquidityAvailable) {
              setQuoteError("No liquidity available for this pair");
              setQuote(null);
            } else {
              setQuote(res.data);
              setQuoteError(null);
            }
          } else {
            setQuoteError("Unable to find swap quote");
            setQuote(null);
          }
        },
      );
    }, 500);
  }, [sellToken, buyTokenAddress, sellTokenAmount, fromAddress, slippageBps, chainId, isBridge, sellChainId, buyChainId]);

  useEffect(() => {
    fetchQuote();
    return () => {
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
    };
  }, [fetchQuote]);

  // Resolve the destination chain's native token for the bridge-failure
  // recovery affordance. Local registry first; falls back to the Bungee
  // tokens list so chains we don't carry registry entries for (Plume / Tempo
  // / Plasma / Sonic / Abstract / HyperEVM / …) still get a working
  // suggestion.
  useEffect(() => {
    if (!isBridge || !quoteError || quoteLoading) {
      setDestNativeInfo(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const meta = getNativeAssetMeta(buyChainId, networksInfo);
      if (meta) {
        if (!cancelled) setDestNativeInfo(meta);
        return;
      }
      try {
        const tokens = await getCachedBungeeTokens(buyChainId);
        const native = tokens.find(
          (t) =>
            (t.address ?? "").toLowerCase() ===
            BUNGEE_NATIVE_TOKEN.toLowerCase(),
        );
        if (cancelled || !native) return;
        const bChain = getBungeeChain(buyChainId);
        setDestNativeInfo({
          symbol: native.symbol || "",
          name: native.name || native.symbol || "",
          decimals: native.decimals ?? 18,
          logoUrl: getNativeAssetLogoUrl(
            native.symbol,
            native.logoURI || native.icon,
          ),
          chainName: bChain?.name ?? getChainConfig(buyChainId).name,
        });
      } catch {
        // Cache miss / proxy error — silently skip the suggestion.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isBridge, quoteError, quoteLoading, buyChainId, networksInfo]);

  // -----------------------------------------------------------------------
  // Swap direction toggle
  // -----------------------------------------------------------------------
  const handleFlip = () => {
    if (!buyTokenInfo || !buyTokenAddress) return;
    const addr = buyTokenAddress.trim();
    const addrLower = addr.toLowerCase();
    const isNative = addrLower === NATIVE_TOKEN_ADDRESS.toLowerCase();
    // The buy token lives on `buyChainId`, NOT the (sell) `chainId` — search
    // the cross-chain catalog so bridge flips can still locate a held buy
    // token instead of falling through to a zero-balance stub.
    const buyInHoldings = holdingsAllChains.find(
      (t) =>
        t.chainId === buyChainId &&
        (t.contractAddress.toLowerCase() === addrLower ||
          (isNative && t.contractAddress === "native")),
    );

    // If the buy token isn't in the user's holdings, build a stub PortfolioToken
    // from the metadata we already have. SwapView's onchain balance + price
    // hydration effects will fill `balance` / `priceUsd` after the flip.
    const nextSellToken: PortfolioToken =
      buyInHoldings ?? {
        symbol: buyTokenInfo.symbol,
        name: buyTokenInfo.name,
        contractAddress: isNative ? "native" : addr,
        chainId: buyChainId,
        decimals: buyTokenInfo.decimals,
        balance: "0",
        balanceFormatted: "0",
        priceUsd: buyTokenPriceUsd,
        valueUsd: 0,
        logoUrl: buyTokenLogoURI,
      };

    const prevSellToken = sellToken;
    const prevSellChainId = sellChainId;
    const prevBuyChainId = buyChainId;
    // Flip both sides of the chain pair so a bridge stays a bridge (and a
    // same-chain swap stays same-chain) after the toggle.
    setSellChainId(prevBuyChainId);
    setBuyChainId(prevSellChainId);
    setSellToken(nextSellToken);
    if (prevSellToken) {
      // Skip the buyTokenAddress useEffect that would otherwise refetch and
      // wipe the metadata we already have for prevSellToken.
      buyInfoSetBySelectRef.current = true;
      setBuyTokenAddress(to0xToken(prevSellToken));
      setBuyTokenInfo({
        name: prevSellToken.name,
        symbol: prevSellToken.symbol,
        decimals: prevSellToken.decimals,
      });
      setBuyTokenLogoURI(prevSellToken.logoUrl);
    } else {
      setBuyTokenAddress("");
      setBuyTokenInfo(null);
      setBuyTokenLogoURI(undefined);
    }
    setSellAmount("");
    setSliderValue(0);
    setQuote(null);
    setBridgeQuote(null);
  };

  /** BridgeChainTokenModal commit. Routes (chainId, token) to either the sell
   *  or buy side depending on which trigger opened the modal. */
  const handleChainTokenModalSelect = (
    pickedChainId: number,
    picked: PortfolioToken,
  ) => {
    const side = chainTokenModalSide;
    if (side === "sell") {
      const oldSellChainId = sellChainId;
      setSellChainId(pickedChainId);
      // Same-chain swap default: only auto-sync the buy chain to the new
      // sell chain when the buy was *implicitly* tracking the old sell
      // chain (no explicit buy token picked AND buyChainId still mirrors
      // the old sell). If the user has already picked a buy token — even
      // on the same chain as the old sell — they've made an explicit
      // choice and we leave it alone. Picking a brand-new sell chain
      // while a buy token exists therefore enters bridge mode rather than
      // wiping the receive side.
      const buyWasImplicit =
        buyChainId === oldSellChainId && !buyTokenAddress;
      if (buyWasImplicit && pickedChainId !== oldSellChainId) {
        setBuyChainId(pickedChainId);
        // No buy token was set in this branch — the wipe block from the
        // old logic was redundant. Leave buyToken* alone.
      }
      setSellToken(picked);
      setSellAmount("");
      setIsUsdMode(false);
      setSliderValue(0);
      setIsMaxMode(false);
      setQuote(null);
    } else if (side === "buy") {
      if (pickedChainId !== buyChainId) {
        setBuyChainId(pickedChainId);
      }
      buyInfoSetBySelectRef.current = true;
      const addr =
        picked.contractAddress === "native"
          ? NATIVE_TOKEN_ADDRESS
          : picked.contractAddress;
      setBuyTokenAddress(addr);
      setBuyTokenInfo({
        name: picked.name,
        symbol: picked.symbol,
        decimals: picked.decimals,
      });
      setBuyTokenLogoURI(picked.logoUrl);
      setBuyTokenLoading(false);
      setBuyTokenPriceUsd(0);
      setQuote(null);
    }
  };

  // -----------------------------------------------------------------------
  // Submit (cross-chain): refresh the Bungee quote at confirm time
  // (quoteIds expire ~60s), call /bridge/build-tx for the firm calldata,
  // and stage [approve?, bridge] for the existing SwapConfirmation surface.
  // -----------------------------------------------------------------------
  const handlePrepareBridge = async () => {
    if (!sellToken || !buyTokenInfo || !bridgeRoute) return;
    setIsSubmitting(true);

    try {
      // 1. Compute sell amount in wei
      let sellAmountWei: string;
      try {
        const isNative = sellToken.contractAddress === "native";
        sellAmountWei = isNative
          ? parseEther(sellTokenAmount).toString()
          : parseUnits(sellTokenAmount, sellToken.decimals).toString();
      } catch {
        toast({ title: "Invalid amount", status: "error", duration: 3000 });
        return;
      }
      // Cap at onchain balance (same safety as same-chain).
      if (sellToken.contractAddress !== "native") {
        const balRes = await new Promise<{ success: boolean; balance?: string }>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "getTokenBalanceWei",
              tokenAddress: sellToken.contractAddress,
              owner: fromAddress,
              chainId: sellChainId,
            },
            resolve,
          );
        });
        if (balRes.success && balRes.balance) {
          const onChainBalance = BigInt(balRes.balance);
          const parsed = BigInt(sellAmountWei);
          if (parsed > onChainBalance) {
            sellAmountWei = onChainBalance.toString();
          }
        }
      }

      // 2. Refresh quote — Bungee quote IDs expire ~60s, so re-fetch
      // before building tx data.
      const sellAddrForBungee =
        sellToken.contractAddress === "native"
          ? BUNGEE_NATIVE_TOKEN
          : sellToken.contractAddress;
      const buyAddrForBungee =
        buyTokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()
          ? BUNGEE_NATIVE_TOKEN
          : buyTokenAddress;
      const slippagePct = slippageBps / 100;
      const fresh = await new Promise<{ success: boolean; data?: BungeeQuoteResponse; error?: string }>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "fetchBridgeQuote",
            userAddress: fromAddress,
            receiverAddress: fromAddress,
            originChainId: sellChainId,
            destinationChainId: buyChainId,
            inputToken: sellAddrForBungee,
            outputToken: buyAddrForBungee,
            inputAmount: sellAmountWei,
            slippage: slippagePct,
          },
          resolve,
        );
      });
      const routeSelection = fresh?.success
        ? getExecutableBridgeRouteSelection(fresh.data)
        : null;
      const route = routeSelection?.route;
      if (!fresh?.success || !route) {
        toast({
          title: "Bridge quote failed",
          description: fresh?.error || "Could not refresh bridge quote",
          status: "error",
          duration: 3000,
        });
        return;
      }

      // 3. Socket Swap V3 returns executable txData directly in the quote.
      const built_txData = route.txData;
      const built_approval = route.approvalData ?? null;
      if (!route.quoteId) {
        toast({
          title: "Bridge quote failed",
          description: "Socket did not return a quote id",
          status: "error",
          duration: 3000,
        });
        return;
      }
      if (!built_txData) {
        toast({
          title: "Bridge build failed",
          description: "Socket did not return bridge transaction data",
          status: "error",
          duration: 3000,
        });
        return;
      }

      const swapMeta = {
        sellTokenSymbol: sellToken.symbol,
        sellTokenLogo: sellToken.logoUrl || null,
        buyTokenSymbol: buyTokenInfo.symbol,
        buyTokenLogo: buyTokenLogoURI || null,
      };

      const transactions: PreparedSwapTxEntry[] = [];

      // 4a. Approval (if Bungee says we need one and current allowance < amount)
      if (built_approval && sellToken.contractAddress !== "native") {
        const allowanceRes = await new Promise<{ success: boolean; allowance?: string }>(
          (resolve) => {
            chrome.runtime.sendMessage(
              {
                type: "checkTokenAllowance",
                tokenAddress: built_approval.tokenAddress,
                owner: fromAddress,
                spender: built_approval.spenderAddress,
                chainId: sellChainId,
              },
              resolve,
            );
          },
        );
        const currentAllowance = BigInt(allowanceRes.allowance || "0");
        const neededAllowance = BigInt(built_approval.amount);
        if (currentAllowance < neededAllowance) {
          const { data: approvalData } = buildApprovalTx(
            built_approval.tokenAddress,
            built_approval.spenderAddress,
            neededAllowance,
          );
          transactions.push({
            tx: {
              from: fromAddress,
              to: built_approval.tokenAddress,
              data: approvalData,
              value: "0x0",
              chainId: sellChainId,
            },
            origin: `Approve ${sellToken.symbol.toUpperCase()} for bridge`,
            favicon: sellToken.logoUrl || null,
            functionName: "approve",
          });
        }
      }

      // 4b. The bridge call itself. Bridge meta rides on this entry so the
      // post-success hookup in txHandlers / txReceiptPoller picks it up.
      transactions.push({
        tx: {
          from: fromAddress,
          to: built_txData.to,
          data: built_txData.data,
          value: `0x${BigInt(built_txData.value || "0").toString(16)}`,
          chainId: sellChainId,
        },
        origin: `Bridge ${sellToken.symbol.toUpperCase()} → ${resolvedBuyChainName}`,
        favicon: sellToken.logoUrl || null,
        swapMeta,
        bridge: {
          sourceChainId: sellChainId,
          destinationChainId: buyChainId,
          destinationChainName: resolvedBuyChainName,
          routeName: route.routeDetails?.name,
          receiverAddress: fromAddress,
          requestHash: route.quoteId,
        },
      });

      // 5. Decide atomicity path (mirror of the swap-path logic above). For
      // cross-chain bridges, the inner txs are typically `[approve, bridge]`
      // and the batch tx carries the bridge meta forward so destination
      // polling kicks off on confirm.
      const isBankrBatchSupported =
        accountType === "bankr" && BANKR_SUPPORTED_CHAIN_IDS.has(sellChainId);
      let batchTx: { to: string; data: string; value: string } | null = null;
      let pkAtomic: Awaited<ReturnType<typeof resolveSwapDelegate>> = null;
      if (transactions.length > 1) {
        if (isBankrBatchSupported) {
          const calls: ERC5792Call[] = transactions.map((t) => ({
            to: t.tx.to as `0x${string}`,
            data: (t.tx.data || "0x") as `0x${string}`,
            value: (t.tx.value || "0x0") as `0x${string}`,
          }));
          batchTx = encodeBatchCalls(calls, fromAddress);
        } else if (
          (accountType === "privateKey" || accountType === "seedPhrase") &&
          accountId
        ) {
          const resolved = await resolveSwapDelegate(accountId, sellChainId);
          if (resolved) {
            const calls: ERC5792Call[] = transactions.map((t) => ({
              to: t.tx.to as `0x${string}`,
              data: (t.tx.data || "0x") as `0x${string}`,
              value: (t.tx.value || "0x0") as `0x${string}`,
            }));
            batchTx = encodeBatchCalls(calls, fromAddress);
            pkAtomic = resolved;
          }
        }
      }

      setPreparedTransactions(transactions);
      setPreparedBatchTx(batchTx);
      setPreparedAccountLock(accountId ? { accountId, fromAddress } : null);
      setPrepared7702(pkAtomic);
      // Reuse the same `preparedQuote` slot so SwapConfirmation's
      // existing buy-amount renderer works. We synthesize a 0x-shaped
      // payload from the bridge route so the existing fields the
      // confirmation reads (`buyAmount`) point at the right thing.
      setPreparedQuote({
        buyAmount: route.output.amount,
        sellAmount: sellAmountWei,
        buyToken: built_txData.to,
        sellToken: sellToken.contractAddress,
        gas: "0",
        gasPrice: "0",
        totalNetworkFee: "0",
        liquidityAvailable: true,
        minBuyAmount: route.output.minAmountOut ?? route.output.amount,
        allowanceTarget: built_approval?.spenderAddress ?? "",
        issues: {},
        fees: {},
        route: { fills: [] },
      } as SwapQuoteResponse);
      setShowConfirmation(true);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Bridge prep failed",
        status: "error",
        duration: 3000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Submit: Prepare transactions, then show confirmation screen
  // -----------------------------------------------------------------------
  const handlePrepareSwap = async () => {
    if (!sellToken || !buyTokenInfo) return;
    if (accountType === "impersonator") {
      toast({
        title: "View-only account",
        description: "Impersonator accounts cannot send transactions",
        status: "error",
        duration: 3000,
      });
      return;
    }
    if (isBridge) {
      await handlePrepareBridge();
      return;
    }
    if (!quote) return;

    setIsSubmitting(true);

    try {
      // 1. Compute sell amount in wei
      let sellAmountWei: string;
      try {
        const isNative = sellToken.contractAddress === "native";
        sellAmountWei = isNative
          ? parseEther(sellTokenAmount).toString()
          : parseUnits(sellTokenAmount, sellToken.decimals).toString();
      } catch {
        toast({ title: "Invalid amount", status: "error", duration: 3000 });
        return;
      }

      // 1b. For non-native tokens, cap at onchain balance to avoid rounding
      // issues where parseUnits(formattedBalance) > actual wei balance
      if (sellToken.contractAddress !== "native") {
        const balRes = await new Promise<{ success: boolean; balance?: string }>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "getTokenBalanceWei",
              tokenAddress: sellToken.contractAddress,
              owner: fromAddress,
              chainId,
            },
            resolve,
          );
        });
        if (balRes.success && balRes.balance) {
          const onChainBalance = BigInt(balRes.balance);
          const parsed = BigInt(sellAmountWei);
          if (parsed > onChainBalance) {
            sellAmountWei = onChainBalance.toString();
          }
        }
      }

      // 2. Get firm quote (with transaction object)
      const firmQuote = await new Promise<{
        success: boolean;
        data?: SwapQuoteResponse;
        error?: string;
      }>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "fetchSwapQuote",
            chainId,
            sellToken: to0xToken(sellToken),
            buyToken: buyTokenAddress.trim(),
            sellAmount: sellAmountWei,
            taker: fromAddress,
            slippageBps,
          },
          resolve,
        );
      });

      if (!firmQuote.success || !firmQuote.data?.transaction) {
        toast({
          title: "Quote failed",
          description: firmQuote.error || "Could not get swap quote",
          status: "error",
          duration: 3000,
        });
        return;
      }

      // 3. Build transaction list (approval + swap)
      const transactions: PreparedSwapTxEntry[] = [];

      const swapMeta = {
        sellTokenSymbol: sellToken.symbol,
        sellTokenLogo: sellToken.logoUrl || null,
        buyTokenSymbol: buyTokenInfo.symbol,
        buyTokenLogo: buyTokenLogoURI || null,
      };

      // Check onchain allowance and add approval TX if needed.
      // Spender comes from the indicative price quote's issues.allowance.spender
      // (authoritative per 0x docs — address varies by chain/flow).
      const allowanceSpender = quote.issues?.allowance?.spender;

      if (sellToken.contractAddress !== "native" && allowanceSpender) {
        const allowanceRes = await new Promise<{
          success: boolean;
          allowance?: string;
        }>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "checkTokenAllowance",
              tokenAddress: sellToken.contractAddress,
              owner: fromAddress,
              spender: allowanceSpender,
              chainId,
            },
            resolve,
          );
        });

        const currentAllowance = BigInt(allowanceRes.allowance || "0");

        if (currentAllowance < BigInt(sellAmountWei)) {
          const { data: approvalData } = buildApprovalTx(
            sellToken.contractAddress,
            allowanceSpender,
            BigInt(sellAmountWei),
          );
          transactions.push({
            tx: {
              from: fromAddress,
              to: sellToken.contractAddress,
              data: approvalData,
              value: "0x0",
              chainId,
            },
            origin: `Approve ${sellToken.symbol.toUpperCase()} for swap`,
            favicon: sellToken.logoUrl || null,
            functionName: "approve",
          });
        }
      }

      // Check Permit2 allowance to UniversalRouter (for custom WCHAN sell routes)
      const permit2Approval = quote.issues?.permit2Approval;
      if (permit2Approval) {
        const permit2Res = await new Promise<{
          success: boolean;
          amount?: string;
          expiration?: number;
        }>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "checkPermit2Allowance",
              token: permit2Approval.token,
              owner: fromAddress,
              spender: permit2Approval.spender,
              chainId,
            },
            resolve,
          );
        });

        const permit2Amount = BigInt(permit2Res.amount || "0");
        const permit2Expiration = permit2Res.expiration || 0;
        const now = Math.floor(Date.now() / 1000);

        if (
          permit2Amount < BigInt(sellAmountWei) ||
          permit2Expiration < now
        ) {
          const { data: permit2Data } = buildPermit2ApproveTx(
            allowanceSpender!, // Permit2 contract address
            permit2Approval.token,
            permit2Approval.spender,
            BigInt(sellAmountWei),
          );
          transactions.push({
            tx: {
              from: fromAddress,
              to: allowanceSpender!,
              data: permit2Data,
              value: "0x0",
              chainId,
            },
            origin: `Approve ${sellToken.symbol.toUpperCase()} on Permit2`,
            favicon: sellToken.logoUrl || null,
            functionName: "approve",
          });
        }
      }

      // Add swap TX
      const swapTx = firmQuote.data.transaction;
      transactions.push({
        tx: {
          from: fromAddress,
          to: swapTx.to,
          data: swapTx.data,
          value: `0x${BigInt(swapTx.value).toString(16)}`,
          chainId,
          gas: swapTx.gas,
          // Only forward gasPrice when the API returned one (0x). The WCHAN
          // route omits it so viem/Bankr can pick the right EIP-1559 fees.
          ...(swapTx.gasPrice ? { gasPrice: swapTx.gasPrice } : {}),
        },
        origin: `Swap ${sellToken.symbol.toUpperCase()} to ${buyTokenInfo.symbol.toUpperCase()}`,
        favicon: sellToken.logoUrl || null,
        swapMeta,
      });

      // 4. Decide atomicity path.
      //   - Bankr accounts on Bankr-supported chains: batch via Bankr API.
      //   - PK / Seed where the resolver returns a usable 7702 delegate
      //     (Pectra-supported chain default OR a user-configured custom
      //     delegate): batch atomically via EIP-7702 + ERC-7821.
      //   - Otherwise: fall back to sequential broadcasts (existing behavior).
      const isBankrBatchSupported =
        accountType === "bankr" &&
        BANKR_SUPPORTED_CHAIN_IDS.has(chainId);

      let batchTx: { to: string; data: string; value: string } | null = null;
      let pkAtomic: Awaited<ReturnType<typeof resolveSwapDelegate>> = null;

      if (transactions.length > 1) {
        if (isBankrBatchSupported) {
          const calls: ERC5792Call[] = transactions.map((t) => ({
            to: t.tx.to as `0x${string}`,
            data: (t.tx.data || "0x") as `0x${string}`,
            value: (t.tx.value || "0x0") as `0x${string}`,
          }));
          batchTx = encodeBatchCalls(calls, fromAddress);
        } else if (
          (accountType === "privateKey" || accountType === "seedPhrase") &&
          accountId
        ) {
          const resolved = await resolveSwapDelegate(accountId, chainId);
          if (resolved) {
            const calls: ERC5792Call[] = transactions.map((t) => ({
              to: t.tx.to as `0x${string}`,
              data: (t.tx.data || "0x") as `0x${string}`,
              value: (t.tx.value || "0x0") as `0x${string}`,
            }));
            batchTx = encodeBatchCalls(calls, fromAddress);
            pkAtomic = resolved;
          }
        }
      }

      // 5. Store prepared data and show confirmation
      setSwapGasEstimates(null);
      setSwapGasValid(true);
      setPreparedTransactions(transactions);
      setPreparedBatchTx(batchTx);
      setPreparedAccountLock(accountId ? { accountId, fromAddress } : null);
      setPrepared7702(pkAtomic);
      setPreparedQuote(firmQuote.data);
      setShowConfirmation(true);
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Swap failed",
        status: "error",
        duration: 3000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Confirm: broadcast prepared transactions
  // -----------------------------------------------------------------------
  const handleConfirmSwap = async () => {
    if (!preparedTransactions || preparedTransactions.length === 0) return;

    setIsSubmitting(true);

    try {
      if (preparedBatchTx && prepared7702) {
        // PK/Seed atomic via EIP-7702 — same one-hash UX as Bankr, signed
        // locally. The handler resolves the password from cached session
        // (or falls back to the standard unlock prompt); the tier-picker
        // gas overrides flow through `gasOverrides`.
        const overrides =
          swapGasEstimates && swapGasEstimates.length > 0
            ? {
                // For atomic-7702 the gas component emits one wrapped ERC-7821
                // tx estimate; for sequential swaps it emits per-call estimates.
                // Sum keeps both shapes compatible with the handler contract.
                gasLimit: String(
                  swapGasEstimates.reduce(
                    (acc, e) => acc + (Number(e?.gasLimit) || 0),
                    0,
                  ),
                ),
                maxFeePerGas: swapGasEstimates[0].maxFeePerGas,
                maxPriorityFeePerGas: swapGasEstimates[0].maxPriorityFeePerGas,
              }
            : undefined;
        const result = await new Promise<{
          success: boolean;
          txIds?: string[];
          error?: string;
        }>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "executeSwapAtomicPK",
              originalTransactions: preparedTransactions,
              chainId,
              chainName,
              accountId: preparedAccountLock?.accountId,
              fromAddress: preparedAccountLock?.fromAddress,
              gasOverrides: overrides,
            },
            resolve,
          );
        });

        if (result.success) {
          onSwapInitiated();
        } else {
          toast({
            title: "Swap failed",
            description: result.error || "Could not execute swap",
            status: "error",
            duration: 3000,
          });
        }
      } else if (preparedBatchTx) {
        // Batch path: single atomic tx via Bankr API
        const result = await new Promise<{
          success: boolean;
          txIds?: string[];
          error?: string;
        }>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "executeSwapBatch",
              batchTx: preparedBatchTx,
              originalTransactions: preparedTransactions,
              chainId,
              chainName,
              accountId: preparedAccountLock?.accountId,
              fromAddress: preparedAccountLock?.fromAddress,
            },
            resolve,
          );
        });

        if (result.success) {
          onSwapInitiated();
        } else {
          toast({
            title: "Swap failed",
            description: result.error || "Could not execute swap",
            status: "error",
            duration: 3000,
          });
        }
      } else {
        // Sequential path: individual txs
        const result = await new Promise<{
          success: boolean;
          txIds?: string[];
          error?: string;
        }>((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "executeSwapDirect",
              transactions: preparedTransactions,
              chainName,
              accountId: preparedAccountLock?.accountId,
              fromAddress: preparedAccountLock?.fromAddress,
              // Forward the tier-picker selections so each tx gets the
              // user's chosen Priority / Max Fee. Falls back to viem's
              // built-in estimate when null.
              gasEstimates: swapGasEstimates
                ? swapGasEstimates.map((e) => ({
                    gasLimit: e.gasLimit,
                    maxFeePerGas: e.maxFeePerGas,
                    maxPriorityFeePerGas: e.maxPriorityFeePerGas,
                  }))
                : undefined,
            },
            resolve,
          );
        });

        if (result.success) {
          onSwapInitiated();
        } else {
          toast({
            title: "Swap failed",
            description: result.error || "Could not execute swap",
            status: "error",
            duration: 3000,
          });
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Swap failed",
        status: "error",
        duration: 3000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
    setPreparedTransactions(null);
    setPreparedBatchTx(null);
    setPreparedAccountLock(null);
    setPrepared7702(null);
    setPreparedQuote(null);
    setSwapGasEstimates(null);
    setSwapGasValid(true);
  };

  // -----------------------------------------------------------------------
  // Validations
  // -----------------------------------------------------------------------
  const sellAmountNum = parseFloat(sellTokenAmount) || 0;
  const insufficientBalance = sellAmountNum > sellBalance;
  const isValidBuyAddress = /^0x[a-fA-F0-9]{40}$/.test(
    buyTokenAddress.trim(),
  );

  // Bridge route: prefer manual build-tx routes, but accept Bungee auto routes
  // that already include executable txData. Auto Permit2 signature routes
  // remain unsupported in the extension.
  const bridgeRoute = getExecutableBridgeRoute(bridgeQuote);
  /** Output amount in wei for either same-chain (0x) or cross-chain (Bungee). */
  const unifiedBuyAmount = isBridge
    ? bridgeRoute?.output?.amount
    : quote?.buyAmount;

  const canSwap =
    sellToken &&
    isValidBuyAddress &&
    buyTokenInfo &&
    sellAmountNum > 0 &&
    !insufficientBalance &&
    (isBridge ? !!bridgeRoute : !!quote) &&
    !quoteLoading &&
    !isSubmitting &&
    accountType !== "impersonator";

  // Price impact
  const inputUsd =
    sellToken && sellAmountNum > 0 && sellToken.priceUsd > 0
      ? sellAmountNum * sellToken.priceUsd
      : 0;
  const outputUsd = useMemo(() => {
    if (!buyTokenInfo || buyTokenPriceUsd <= 0) return 0;
    if (isBridge) {
      if (!bridgeRoute?.output?.amount) return 0;
      const buyAmountNum = parseFloat(
        formatUnits(BigInt(bridgeRoute.output.amount), buyTokenInfo.decimals),
      );
      return buyAmountNum * buyTokenPriceUsd;
    }
    if (!quote) return 0;
    const buyAmountNum = parseFloat(
      formatUnits(BigInt(quote.buyAmount), buyTokenInfo.decimals),
    );
    return buyAmountNum * buyTokenPriceUsd;
  }, [quote, bridgeRoute, buyTokenInfo, buyTokenPriceUsd, isBridge]);

  // Suppress price impact while a fresh quote is in flight — otherwise the
  // OLD quote's outputUsd is compared against the NEW inputUsd (or vice versa)
  // for the brief window between user-action and fetch-resolve, which flashes a
  // bogus "high price impact" warning on token/chain/amount switches.
  const priceImpact =
    !quoteLoading && inputUsd > 0 && outputUsd > 0
      ? ((inputUsd - outputUsd) / inputUsd) * 100
      : null;

  // -----------------------------------------------------------------------
  // Confirmation screen
  // -----------------------------------------------------------------------
  if (showConfirmation && preparedTransactions && sellToken && buyTokenInfo && preparedQuote) {
    return (
      <SwapConfirmation
        transactions={preparedTransactions}
        sellToken={sellToken}
        sellAmount={sellTokenAmount}
        sellUsd={inputUsd}
        buyTokenInfo={buyTokenInfo}
        buyAmount={preparedQuote.buyAmount}
        buyTokenDecimals={buyTokenInfo.decimals}
        buyTokenLogoURI={
          buyTokenLogoURI ||
          (buyTokenAddress.toLowerCase() ===
          NATIVE_TOKEN_ADDRESS.toLowerCase()
            ? getNativeAssetMeta(buyChainId, networksInfo)?.logoUrl
            : undefined)
        }
        isBuyNative={
          buyTokenAddress.toLowerCase() ===
          NATIVE_TOKEN_ADDRESS.toLowerCase()
        }
        buyUsd={outputUsd}
        chainId={chainId}
        chainName={chainName}
        fromAddress={fromAddress}
        accountType={accountType}
        isBatched={!!preparedBatchTx}
        batchedTx={preparedBatchTx ?? undefined}
        eip7702Delegate={
          prepared7702?.needsAuth ? prepared7702.delegate : undefined
        }
        eip7702OnchainDelegate={
          prepared7702?.needsAuth ? prepared7702.onchainDelegate : undefined
        }
        onConfirm={handleConfirmSwap}
        onCancel={handleCancelConfirmation}
        isSubmitting={isSubmitting}
        onGasEstimates={setSwapGasEstimates}
        onValidityChange={setSwapGasValid}
        isConfirmDisabled={!swapGasValid}
        bridgeMeta={
          isBridge
            ? {
                destinationChainId: buyChainId,
                destinationChainName: resolvedBuyChainName,
                routeName: bridgeRoute?.routeDetails?.name,
                estimatedTime: bridgeRoute?.estimatedTime,
                sourceNativePriceUsd: holdingsAllChains.find(
                  (h) =>
                    h.chainId === sellChainId &&
                    h.contractAddress === "native",
                )?.priceUsd,
              }
            : undefined
        }
      />
    );
  }

  if (chainTokenModalSide) {
    return (
      <BridgeChainTokenModal
        isOpen
        onClose={() => setChainTokenModalSide(null)}
        mode={chainTokenModalSide}
        accountType={accountType}
        initialChainId={chainTokenModalSide === "buy" ? buyChainId : sellChainId}
        selectedTokenAddress={
          chainTokenModalSide === "buy"
            ? buyTokenAddress || undefined
            : sellToken
              ? sellToken.contractAddress === "native"
                ? NATIVE_TOKEN_ADDRESS
                : sellToken.contractAddress
              : undefined
        }
        selectedTokenChainId={
          chainTokenModalSide === "buy" ? buyChainId : sellChainId
        }
        excludeAddress={
          chainTokenModalSide === "buy"
            ? sellToken
              ? sellToken.contractAddress === "native"
                ? NATIVE_TOKEN_ADDRESS
                : sellToken.contractAddress
              : undefined
            : buyTokenAddress || undefined
        }
        excludeChainId={
          chainTokenModalSide === "buy" ? sellChainId : buyChainId
        }
        onSelect={handleChainTokenModalSelect}
        fromAddress={fromAddress}
        holdingsAllChains={holdingsAllChains}
      />
    );
  }

  // -----------------------------------------------------------------------
  // Render — frame renders immediately; holdings fill in as they arrive.
  // -----------------------------------------------------------------------
  return (
    <AppScreen>
      <AppHeader
        title="Swap or bridge"
        onBack={onBack}
        trailing={fromAddress ? <FromAccountDisplay address={fromAddress} /> : undefined}
      />
      <ScreenBody pb={4}>
      <VStack spacing={4} align="stretch">

        {/* You Sell */}
        <Box
          bg="surface.raised"
          border="2px solid"
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="card"
          p={3}
        >
          {/* Label + USD/token conversion + mode toggle. Balance lives below
              the input now (right-aligned under it) to declutter this top row
              — the section header + an actionable conversion are enough up
              here. */}
          <HStack justify="space-between" mb={2} align="center">
            <Text
              fontSize="xs"
              fontWeight="600"
              color="fg.secondary"
            >
              You sell
            </Text>
            {sellToken && hasPrice && (
              <HStack spacing={1}>
                {sellAmount && parseFloat(sellAmount) > 0 && (
                  <Text fontSize="xs" color="text.tertiary" fontWeight="700">
                    {isUsdMode
                      ? `${Number(parseFloat(sellTokenAmount).toPrecision(6)).toLocaleString("en-US", { maximumFractionDigits: 6 })}`
                      : formatUsd(parseFloat(sellAmount) * sellToken.priceUsd)}
                  </Text>
                )}
                <Button
                  size="xs"
                  variant="ghost"
                  color="accent.secondary"
                  fontWeight="800"
                  fontSize="xs"
                  h="20px"
                  px={1}
                  onClick={handleToggleMode}
                  rightIcon={<SwapArrowIcon boxSize={3} />}
                  _hover={{ bg: "surface.sunken" }}
                  sx={{ "& .chakra-button__icon": { marginInlineStart: "2px" } }}
                >
                  {isUsdMode ? sellToken.symbol.toUpperCase() : "USD"}
                </Button>
              </HStack>
            )}
          </HStack>
          <HStack spacing={2}>
            <TokenChainTrigger
              token={sellToken}
              chainId={sellChainId}
              onClick={() => {
                if (chainTokenModalSide === "sell") {
                  setChainTokenModalSide(null);
                } else {
                  setChainTokenModalSide("sell");
                }
              }}
            />
            <InputGroup flex={1} isolation="isolate">
              {isUsdMode && (
                <InputLeftElement pointerEvents="none" h="full" w="28px" pl={2}>
                  <Text fontFamily="mono" fontSize="sm" color="text.tertiary" fontWeight="700">$</Text>
                </InputLeftElement>
              )}
              <Input
                placeholder="0.0"
                value={sellAmount}
                onChange={(e) => {
                  if (/^\d*\.?\d*$/.test(e.target.value)) {
                    setIsMaxMode(false);
                    setSellAmount(e.target.value);
                    syncSliderFromAmount(e.target.value);
                  }
                }}
                fontFamily="mono"
                fontSize="sm"
                border="2px solid"
                borderColor="border.default"
                bg="surface.raised"
                _hover={{ borderColor: "accent.secondary" }}
                _focus={{ borderColor: "accent.secondary", boxShadow: "none" }}
                pl={isUsdMode ? "28px" : undefined}
                pr="50px"
              />
              <InputRightElement w="45px" h="calc(100% - 6px)" top="3px" right="3px">
                <Button
                  size="xs"
                  variant="ghost"
                  color="accent.secondary"
                  fontWeight="800"
                  h="full"
                  onClick={() => {
                    if (sellToken) {
                      setSliderValue(100);
                      setIsMaxMode(true);
                      if (isUsdMode && hasPrice) {
                        setSellAmount(
                          (sellBalance * sellToken.priceUsd).toFixed(2),
                        );
                      } else {
                        setSellAmount(sellToken.balance);
                      }
                    }
                  }}
                  _hover={{ bg: "surface.sunken" }}
                >
                  MAX
                </Button>
              </InputRightElement>
            </InputGroup>
          </HStack>
          {/* Address (left, under dropdown) + balance (right, under input)
              live on the same row directly beneath the input pair so neither
              piece of metadata floats alone. Hide the whole row only if we
              have nothing to show on either side. */}
          {sellToken && (
            <HStack align="center" spacing={2} mt={1}>
              {sellToken.contractAddress !== "native" && (
                <TokenAddressRow
                  address={sellToken.contractAddress}
                  explorer={sellChainConfig.explorer}
                  copied={copiedAddr === sellToken.contractAddress}
                  onCopy={async () => {
                    await navigator.clipboard.writeText(sellToken.contractAddress);
                    setCopiedAddr(sellToken.contractAddress);
                    setTimeout(() => setCopiedAddr(null), 2000);
                  }}
                />
              )}
              <HStack ml="auto" spacing={1} align="baseline" whiteSpace="nowrap">
                <Text
                  fontSize="xs"
                  color="text.tertiary"
                  fontWeight="500"
                  textTransform="uppercase"
                >
                  Bal:{" "}
                  {Number(parseFloat(sellToken.balance).toPrecision(6)).toLocaleString("en-US", { maximumFractionDigits: 6 })}
                </Text>
                {hasPrice && (
                  <Text fontSize="2xs" color="text.tertiary" fontWeight="500">
                    ({formatUsd(sellBalance * sellToken.priceUsd)})
                  </Text>
                )}
              </HStack>
            </HStack>
          )}
          {/* Percentage slider */}
          {sellToken && sellBalance > 0 && (
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
                  const nearest = snaps.find(
                    (s) => Math.abs(val - s) <= SNAP_THRESHOLD,
                  );
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
                    color={sliderValue >= pct ? "accent.secondary" : "text.tertiary"}
                    whiteSpace="nowrap"
                    transform="translateX(-50%)"
                  >
                    {pct}%
                  </SliderMark>
                ))}
                {/* Slider baseStyle (createTheme.ts) drives track/thumb radii
                    from theme tokens — Bauhaus square, Midnight rounded. */}
                <SliderTrack bg="surface.sunken" h="6px">
                  <SliderFilledTrack bg="accent.secondary" />
                </SliderTrack>
                <SliderThumb
                  boxSize={5}
                  bg="accent.secondary"
                  border="2px solid"
                  borderColor="border.default"
                  _focus={{ boxShadow: "none" }}
                />
              </Slider>
            </Box>
          )}
          {insufficientBalance && sellAmountNum > 0 && (
            <Text fontSize="xs" color="chart.negative" fontWeight="700" mt={1}>
              Insufficient balance
            </Text>
          )}
        </Box>

        {/* Swap direction button */}
        <Box display="flex" justifyContent="center" my={-1}>
          <IconButton
            aria-label="Swap direction"
            icon={<SwapArrowIcon boxSize={5} />}
            size="sm"
            bg="accent.primary"
            color="accentFg.primary"
            border="2px solid"
            borderColor="border.default"
            borderRadius="md"
            _hover={{ bg: "accent.primary", transform: "translateY(-1px)" }}
            _active={{ transform: "translate(1px, 1px)" }}
            onClick={handleFlip}
            isDisabled={!buyTokenInfo}
          />
        </Box>

        {/* You Receive */}
        <Box
          bg="surface.raised"
          border="2px solid"
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="card"
          p={3}
        >
          <Text
            fontSize="xs"
            fontWeight="600"
            color="fg.secondary"
            mb={2}
          >
            You receive
          </Text>
          {/* Token+chain pick uses the same nested screen as the sell trigger,
              in destination mode (including Bungee-only receive chains). */}
          <HStack spacing={2} position="relative">
            <TokenChainTrigger
              token={
                buyTokenInfo
                  ? {
                      contractAddress:
                        buyTokenAddress &&
                        buyTokenAddress.toLowerCase() ===
                          NATIVE_TOKEN_ADDRESS.toLowerCase()
                          ? "native"
                          : buyTokenAddress,
                      symbol: buyTokenInfo.symbol,
                      name: buyTokenInfo.name,
                      decimals: buyTokenInfo.decimals,
                      logoUrl: buyTokenLogoURI,
                      balance: "0",
                      balanceFormatted: "0",
                      valueUsd: 0,
                      priceUsd: 0,
                      chainId: buyChainId,
                    }
                  : null
              }
              chainId={buyChainId}
              onClick={() => {
                if (chainTokenModalSide === "buy") {
                  setChainTokenModalSide(null);
                } else {
                  setChainTokenModalSide("buy");
                }
              }}
            />
            {/* Output amount — read-only, mirrors the sell amount input.
                When a quote is being fetched and there's nothing to render
                yet, an absolute-positioned `LoadingDots` paints a 3-dot
                bouncing animation over the empty field. The output USD
                value and price-impact percent sit inline on the right edge
                of the field so the read-only amount + its market context
                share one row instead of stacking. */}
            <InputGroup flex={1} position="relative">
              <Input
                placeholder={quoteLoading ? "" : "0.0"}
                value={
                  unifiedBuyAmount && buyTokenInfo
                    ? formatOutputAmount(
                        unifiedBuyAmount,
                        buyTokenInfo.decimals,
                      )
                    : ""
                }
                readOnly
                fontFamily="mono"
                fontSize="sm"
                border="2px solid"
                borderColor="border.default"
                bg="surface.sunken"
                _hover={{}}
                _focus={{ boxShadow: "none" }}
                cursor="default"
              />
              {quoteLoading && !unifiedBuyAmount && (
                <Box
                  position="absolute"
                  left="14px"
                  top="50%"
                  transform="translateY(-50%)"
                  pointerEvents="none"
                  zIndex={1}
                >
                  <LoadingDots />
                </Box>
              )}
            </InputGroup>
          </HStack>
          {/* Address (left, under dropdown) + USD value / price-impact
              (right, under the read-only amount). Mirrors the YOU SELL
              metadata row so both sides feel symmetric and the receive
              amount itself can use the full input width. */}
          {(buyTokenInfo ||
            ((quote || bridgeQuote) && (outputUsd > 0 || priceImpact !== null))) && (
            <HStack align="center" spacing={2} mt={1}>
              {buyTokenAddress &&
                buyTokenInfo &&
                buyTokenAddress.toLowerCase() !==
                  NATIVE_TOKEN_ADDRESS.toLowerCase() && (
                  <TokenAddressRow
                    address={buyTokenAddress}
                    explorer={getChainConfig(buyChainId)?.explorer ?? ""}
                    copied={copiedAddr === buyTokenAddress}
                    onCopy={async () => {
                      await navigator.clipboard.writeText(buyTokenAddress);
                      setCopiedAddr(buyTokenAddress);
                      setTimeout(() => setCopiedAddr(null), 2000);
                    }}
                  />
                )}
              {(quote || bridgeQuote) && buyTokenInfo &&
                (outputUsd > 0 || priceImpact !== null) && (
                  <HStack ml="auto" spacing={1} align="baseline" whiteSpace="nowrap">
                    {outputUsd > 0 && (
                      <Text fontSize="xs" color="text.tertiary" fontWeight="500">
                        ~{formatUsd(outputUsd)}
                      </Text>
                    )}
                    {priceImpact !== null && (
                      <Text
                        fontSize="xs"
                        fontWeight="700"
                        color={
                          priceImpact > 10
                            ? "chart.negative"
                            : priceImpact > 3
                              ? "orange.500"
                              : "text.tertiary"
                        }
                      >
                        {priceImpact > 0
                          ? `(-${priceImpact.toFixed(2)}%)`
                          : `(+${Math.abs(priceImpact).toFixed(2)}%)`}
                      </Text>
                    )}
                  </HStack>
                )}
            </HStack>
          )}
        </Box>

        {/* Quote error */}
        {quoteError && (
          <Text fontSize="xs" color="chart.negative" fontWeight="700">
            {quoteError}
          </Text>
        )}

        {/* Bridge-route-not-available recovery affordance. When Bungee can't
            route the chosen sell→buy pair, suggest swapping the receive side
            to the DESTINATION chain's native — exotic destination tokens
            frequently lack routes while the destination chain's native almost
            always does. Keeps the bridge intent; only the destination token
            flips. Hidden when destination is already its chain's native or
            when we don't know the destination chain's native currency. */}
        {isBridge &&
          quoteError &&
          !quoteLoading &&
          sellToken &&
          destNativeInfo &&
          destNativeInfo.symbol &&
          buyTokenAddress.toLowerCase() !== NATIVE_TOKEN_ADDRESS.toLowerCase() && (
            <HStack
              as="button"
              onClick={() => {
                buyInfoSetBySelectRef.current = true;
                setBuyTokenAddress(NATIVE_TOKEN_ADDRESS);
                setBuyTokenInfo({
                  name: destNativeInfo.name,
                  symbol: destNativeInfo.symbol,
                  decimals: destNativeInfo.decimals,
                });
                setBuyTokenLogoURI(destNativeInfo.logoUrl);
                setBuyTokenLoading(false);
                setBuyTokenPriceUsd(0);
                setQuote(null);
                setBridgeQuote(null);
                setQuoteError(null);
              }}
              px={3}
              py={2}
              border="2px solid"
              borderColor="border.default"
              borderRadius="md"
              bg="surface.raised"
              spacing={2}
              cursor="pointer"
              _hover={{ borderColor: "accent.secondary" }}
            >
              <Box position="relative" boxSize="20px" flexShrink={0}>
                {destNativeInfo.logoUrl ? (
                  <Image
                    src={destNativeInfo.logoUrl}
                    alt={destNativeInfo.symbol}
                    boxSize="20px"
                    borderRadius="full"
                  />
                ) : (
                  <Box
                    boxSize="20px"
                    borderRadius="full"
                    bg="surface.sunken"
                  />
                )}
                <Box position="absolute" right="-3px" bottom="-3px">
                  <ChainIcon
                    chainId={buyChainId}
                    chainName={destNativeInfo.chainName}
                    size="10px"
                    withChip
                  />
                </Box>
              </Box>
              <Text fontSize="xs" fontWeight="700" textTransform="uppercase">
                Swap to {destNativeInfo.symbol.toUpperCase()} on {destNativeInfo.chainName} instead?
              </Text>
            </HStack>
          )}

        {/* Bridge ETA (left) + slippage settings (right) */}
        <HStack justify="space-between">
          {isBridge && bridgeRoute?.estimatedTime ? (
            <HStack spacing={1} color="text.tertiary">
              <TimeIcon boxSize={3} />
              <Text fontSize="xs" fontWeight="700">
                Est. time:{" "}
                {bridgeRoute.estimatedTime < 60
                  ? `${bridgeRoute.estimatedTime}s`
                  : `${Math.round(bridgeRoute.estimatedTime / 60)} min`}
              </Text>
            </HStack>
          ) : (
            <Box />
          )}
          <SlippageSettings
            slippageBps={slippageBps}
            onSlippageChange={setSlippageBps}
          />
        </HStack>

        {/* Quote details */}
        {quote && buyTokenInfo && sellToken && !isBridge && (
          <SwapQuoteDisplay
            quote={quote}
            buyTokenSymbol={buyTokenInfo.symbol}
            buyTokenDecimals={buyTokenInfo.decimals}
            sellTokenSymbol={sellToken.symbol}
            sellTokenDecimals={
              sellToken.contractAddress === "native"
                ? 18
                : sellToken.decimals
            }
            buyTokenPriceUsd={buyTokenPriceUsd}
          />
        )}
        {bridgeQuote && buyTokenInfo && isBridge && (
          <BridgeQuoteDisplay
            quote={bridgeQuote}
            buyTokenSymbol={buyTokenInfo.symbol}
            buyTokenDecimals={buyTokenInfo.decimals}
            buyTokenPriceUsd={buyTokenPriceUsd}
            slippageBps={slippageBps}
            sourceNativeSymbol={
              getNativeAssetMeta(sellChainId, networksInfo)?.symbol ?? "ETH"
            }
            sourceNativePriceUsd={
              holdingsAllChains.find(
                (h) =>
                  h.chainId === sellChainId && h.contractAddress === "native",
              )?.priceUsd
            }
          />
        )}

        {/* Price impact warning — high impact uses semantic error surface,
            medium impact uses warning. Both intent tokens flip cleanly between
            Bauhaus's saturated red/yellow and Midnight's recessed tints. */}
        {priceImpact !== null && priceImpact > 3 && (
          <Box
            bg={priceImpact > 10 ? "status.error.bg" : "status.warning.bg"}
            color={priceImpact > 10 ? "status.error.fg" : "status.warning.fg"}
            border="2px solid"
            borderColor={
              priceImpact > 10 ? "status.error.border" : "status.warning.border"
            }
            borderRadius="lg"
            boxShadow="card"
            p={3}
          >
            <Text fontSize="sm" fontWeight="700">
              {priceImpact > 10
                ? `High price impact (~${priceImpact.toFixed(1)}%). You may receive significantly fewer tokens.`
                : `Price impact is ~${priceImpact.toFixed(1)}%.`}
            </Text>
          </Box>
        )}

        {/* Impersonator warning */}
        {accountType === "impersonator" && (
          <Box
            bg="status.warning.bg"
            color="status.warning.fg"
            border="2px solid"
            borderColor="status.warning.border"
            borderRadius="lg"
            boxShadow="card"
            p={3}
          >
            <Text fontSize="sm" fontWeight="700">
              View-only account — swaps are disabled.
            </Text>
          </Box>
        )}

      </VStack>
      </ScreenBody>
      <StickyActionBar
        primaryAction={
          <Button
            w="100%"
            variant="primary"
            onClick={handlePrepareSwap}
            isLoading={isSubmitting}
            loadingText="Preparing…"
            isDisabled={!canSwap}
          >
            {sellAmountNum <= 0
              ? "Enter an amount"
              : isBridge
                ? "Review bridge"
                : "Review swap"}
          </Button>
        }
      />
    </AppScreen>
  );
}

/**
 * Compact "select token" pill rendered in the YOU SELL / YOU RECEIVE rows.
 * Click opens the nested chain/token picker. When a token is selected, the
 * pill shows the token logo + symbol;
 * an unselected pill reads "SELECT".
 *
 * A small chain badge in the corner of the token logo lets the user see at a
 * glance which chain the token is on — important once cross-chain bridge mode
 * is engaged and the two sides can live on different chains.
 */
/**
 * Three-dot bouncing indicator used in the YOU RECEIVE field while a swap
 * or bridge quote is being fetched. Replaces the previous static "..."
 * placeholder so the user sees an active signal that work is in flight.
 *
 * Each dot reuses one keyframe and offsets via `animation-delay` so the
 * wave reads as continuous motion rather than three independent loops.
 */
function TokenChainTrigger({
  token,
  chainId,
  onClick,
}: {
  token: PortfolioToken | null;
  chainId: number;
  onClick: () => void;
}) {
  return (
    <HStack
      as="button"
      cursor="pointer"
      border="2px solid"
      borderColor="border.default"
      borderRadius="md"
      bg="surface.base"
      px={2}
      py={1.5}
      spacing={2}
      _hover={{ borderColor: "accent.secondary" }}
      onClick={onClick}
      minW="100px"
    >
      {token && (
        <Box position="relative" boxSize="22px" flexShrink={0}>
          {token.logoUrl ? (
            <Image
              src={token.logoUrl}
              alt={token.symbol}
              boxSize="22px"
              borderRadius="full"
              fallback={<TokenSymbolFallback symbol={token.symbol} size="22px" />}
            />
          ) : (
            <TokenSymbolFallback symbol={token.symbol} size="22px" />
          )}
          {/* Small chain badge bottom-right of the token logo. */}
          <Box
            position="absolute"
            right="-3px"
            bottom="-3px"
            bg="surface.base"
            borderRadius="full"
            p="1px"
          >
            <ChainIcon chainId={chainId} size="10px" withChip />
          </Box>
        </Box>
      )}
      <Text fontWeight="700" fontSize="sm" textTransform="uppercase">
        {token?.symbol || "Select"}
      </Text>
      <ChevronDownIcon />
    </HStack>
  );
}

function TokenAddressRow({
  address,
  explorer,
  copied,
  onCopy,
}: {
  address: string;
  explorer: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <HStack spacing={1}>
      <Text fontSize="2xs" color="text.tertiary" fontFamily="mono">
        {address.slice(0, 6)}...{address.slice(-4)}
      </Text>
      <IconButton
        aria-label="Copy address"
        icon={
          copied ? (
            <CheckIcon boxSize="10px" />
          ) : (
            <CopyIcon boxSize="10px" />
          )
        }
        size="xs"
        variant="ghost"
        minW="18px"
        h="18px"
        color={copied ? "accent.highlight" : "text.tertiary"}
        onClick={onCopy}
        _hover={{ color: "accent.secondary", bg: "surface.sunken" }}
      />
      {explorer && (
        <IconButton
          aria-label="View on explorer"
          icon={<ExternalLinkIcon boxSize="10px" />}
          size="xs"
          variant="ghost"
          minW="18px"
          h="18px"
          color="text.tertiary"
          onClick={() =>
            chrome.tabs.create({
              url: `${explorer}/token/${address}`,
            })
          }
          _hover={{ color: "accent.secondary", bg: "surface.sunken" }}
        />
      )}
    </HStack>
  );
}

export default memo(SwapView);
