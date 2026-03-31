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
  Spinner,
  Icon,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  SliderMark,
} from "@chakra-ui/react";
import { ArrowBackIcon, ChevronDownIcon, CopyIcon, CheckIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import { parseEther, parseUnits, formatUnits } from "viem";
import { useBauhausToast } from "@/hooks/useBauhausToast";
import { fetchPortfolio, type PortfolioToken } from "@/chrome/portfolioApi";
import { getCustomTokens } from "@/chrome/customTokenStorage";
import {
  NATIVE_TOKEN_ADDRESS,
  DEFAULT_SLIPPAGE_BPS,
  buildApprovalTx,
  buildPermit2ApproveTx,
  type SwapQuoteResponse,
  type TokenInfo,
  type TokenListEntry,
} from "@/chrome/swapApi";
import {
  SWAP_SUPPORTED_CHAIN_IDS,
  BANKR_SUPPORTED_CHAIN_IDS,
  CHAIN_REGISTRY,
} from "@/constants/chainRegistry";
import { getChainConfig } from "@/constants/chainConfig";
import { encodeBatchCalls } from "@/chrome/batchTxHandlers";
import type { ERC5792Call } from "@/chrome/erc5792Types";
import type { SwapTxEntry } from "@/chrome/txHandlers";
import TokenSelector from "./TokenSelector";
import BuyTokenSelector from "./BuyTokenSelector";
import SwapQuoteDisplay from "./SwapQuoteDisplay";
import SlippageSettings from "./SlippageSettings";
import SwapConfirmation from "./SwapConfirmation";

// Swap direction arrow icon
const SwapArrowIcon = (props: React.ComponentProps<typeof Icon>) => (
  <Icon viewBox="0 0 24 24" {...props}>
    <path
      fill="currentColor"
      d="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z"
    />
  </Icon>
);

function formatUsd(value: number): string {
  if (value < 0.01 && value > 0) return "<$0.01";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatOutputAmount(amount: string, decimals: number): string {
  const formatted = formatUnits(BigInt(amount), decimals);
  const num = parseFloat(formatted);
  if (num === 0) return "0";
  if (num < 0.000001) return "< 0.000001";
  return num.toFixed(6).replace(/\.?0+$/, "");
}

/** Map PortfolioToken.contractAddress to 0x API token address */
function to0xToken(token: PortfolioToken): string {
  return token.contractAddress === "native"
    ? NATIVE_TOKEN_ADDRESS
    : token.contractAddress;
}

interface SwapViewProps {
  fromAddress: string;
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
  accountType,
  chainId,
  chainName,
  onBack,
  onSwapInitiated,
  onChainChange,
  initialBuyToken,
  initialSellToken,
}: SwapViewProps) {
  const toast = useBauhausToast();
  const chainConfig = getChainConfig(chainId);

  // Holdings
  const [holdings, setHoldings] = useState<PortfolioToken[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(true);

  // Token list
  const [tokenList, setTokenList] = useState<TokenListEntry[]>([]);

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
  const [buyTokenLoading, setBuyTokenLoading] = useState(false);
  const [buyTokenPriceUsd, setBuyTokenPriceUsd] = useState<number>(0);
  // Pending custom token (resolved but not yet selected by user)
  const [pendingBuyToken, setPendingBuyToken] = useState<TokenListEntry | null>(null);
  const [pendingBuyLoading, setPendingBuyLoading] = useState(false);
  // Pending custom sell token (resolved but not yet selected by user)
  const [resolvedSellToken, setResolvedSellToken] = useState<PortfolioToken | null>(null);
  const [sellCustomLoading, setSellCustomLoading] = useState(false);
  const [sellCustomError, setSellCustomError] = useState<string | null>(null);
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const [isMaxMode, setIsMaxMode] = useState(false);

  // Quote
  const [quote, setQuote] = useState<SwapQuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Settings
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);

  // Submit
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Confirmation step
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [preparedTransactions, setPreparedTransactions] = useState<SwapTxEntry[] | null>(null);
  const [preparedBatchTx, setPreparedBatchTx] = useState<{ to: string; data: string; value: string } | null>(null);
  const [preparedQuote, setPreparedQuote] = useState<SwapQuoteResponse | null>(null);

  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenInfoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set true when handleBuyTokenSelect already provides token info — skips useEffect re-fetch */
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
        const [data, customTokens] = await Promise.all([
          fetchPortfolio(fromAddress),
          getCustomTokens(),
        ]);
        if (cancelled) return;

        // Merge custom tokens not already in API response
        const apiTokenKeys = new Set(
          data.tokens.map((t) => `${t.chainId}-${t.contractAddress.toLowerCase()}`)
        );
        const customOnlyTokens = customTokens
          .filter((ct) => !apiTokenKeys.has(`${ct.chainId}-${ct.contractAddress}`))
          .filter((ct) => ct.chainId === chainId);

        // Fetch on-chain balances for custom tokens
        const customBalances = await Promise.all(
          customOnlyTokens.map((ct) =>
            new Promise<bigint>((resolve) => {
              chrome.runtime.sendMessage(
                { type: "getTokenBalanceWei", tokenAddress: ct.contractAddress, owner: fromAddress, chainId },
                (res) => resolve(res?.balance ? BigInt(res.balance) : 0n),
              );
            }),
          ),
        );
        if (cancelled) return;

        const customAsPortfolio: PortfolioToken[] = customOnlyTokens.map((ct, i) => {
          const balWei = customBalances[i];
          const formatted = formatUnits(balWei, ct.decimals);
          return {
            symbol: ct.symbol,
            name: ct.name,
            contractAddress: ct.contractAddress,
            chainId: ct.chainId,
            decimals: ct.decimals,
            balance: formatted,
            balanceFormatted: formatted,
            priceUsd: 0,
            valueUsd: 0,
            logoUrl: undefined,
          };
        });

        const chainTokens = [...data.tokens.filter((t) => t.chainId === chainId), ...customAsPortfolio];
        setHoldings(chainTokens);
        // If initialSellToken provided, find the matching token from portfolio
        if (initialSellToken) {
          const match = chainTokens.find(
            (t) => t.contractAddress.toLowerCase() === initialSellToken.contractAddress.toLowerCase(),
          );
          if (match) {
            setSellToken(match);
          } else {
            setSellToken(initialSellToken);
          }
        } else {
          const native = chainTokens.find(
            (t) => t.contractAddress === "native",
          );
          if (native) setSellToken(native);
          else if (chainTokens.length > 0) setSellToken(chainTokens[0]);
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
  }, [fromAddress, chainId, isSwapSupported]);

  // -----------------------------------------------------------------------
  // Load token list for current chain
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isSwapSupported) return;
    chrome.runtime.sendMessage(
      { type: "fetchSwapTokenList", chainId },
      (res) => {
        if (res?.success && res.data) {
          setTokenList(res.data);
        }
      },
    );
  }, [chainId, isSwapSupported]);

  // -----------------------------------------------------------------------
  // Resolve buy token info
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (tokenInfoTimerRef.current) clearTimeout(tokenInfoTimerRef.current);

    // Skip re-fetch if handleBuyTokenSelect already provided the info
    if (buyInfoSetBySelectRef.current) {
      buyInfoSetBySelectRef.current = false;
      return;
    }

    setBuyTokenInfo(null);

    const addr = buyTokenAddress.trim();
    if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) return;

    setBuyTokenLoading(true);
    tokenInfoTimerRef.current = setTimeout(() => {
      chrome.runtime.sendMessage(
        { type: "fetchTokenInfo", tokenAddress: addr, chainId },
        (res) => {
          setBuyTokenLoading(false);
          if (res?.success && res.data) {
            setBuyTokenInfo(res.data);
          } else {
            setBuyTokenInfo(null);
          }
        },
      );
    }, 300);
  }, [buyTokenAddress, chainId]);

  // -----------------------------------------------------------------------
  // Fetch buy token USD price
  // -----------------------------------------------------------------------
  useEffect(() => {
    setBuyTokenPriceUsd(0);
    const addr = buyTokenAddress.trim();
    if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) return;

    // Check if user holds this token — use portfolio price
    const held = holdings.find(
      (h) => h.contractAddress.toLowerCase() === addr.toLowerCase(),
    );
    if (held && held.priceUsd > 0) {
      setBuyTokenPriceUsd(held.priceUsd);
      return;
    }

    // Fetch from CoinGecko via walletchan proxy
    chrome.runtime.sendMessage(
      { type: "fetchTokenPrice", chainId, address: addr },
      (res) => {
        if (res?.success && res.priceUsd > 0) {
          setBuyTokenPriceUsd(res.priceUsd);
        }
      },
    );
  }, [buyTokenAddress, chainId, holdings]);

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
      setQuoteError(null);
      return;
    }

    let sellAmountWei: string;
    try {
      const isNative = sellToken.contractAddress === "native";
      const parsed = isNative
        ? parseEther(sellTokenAmount)
        : parseUnits(sellTokenAmount, sellToken.decimals);
      if (parsed <= 0n) {
        setQuote(null);
        return;
      }
      sellAmountWei = parsed.toString();
    } catch {
      return;
    }

    setQuoteLoading(true);
    setQuoteError(null);

    quoteTimerRef.current = setTimeout(() => {
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
  }, [sellToken, buyTokenAddress, sellTokenAmount, fromAddress, slippageBps, chainId]);

  useEffect(() => {
    fetchQuote();
    return () => {
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
    };
  }, [fetchQuote]);

  // -----------------------------------------------------------------------
  // Swap direction toggle
  // -----------------------------------------------------------------------
  const handleFlip = () => {
    if (!buyTokenInfo || !buyTokenAddress) return;
    const addr = buyTokenAddress.trim().toLowerCase();
    const buyInHoldings = holdings.find(
      (t) =>
        t.contractAddress.toLowerCase() === addr ||
        (addr === NATIVE_TOKEN_ADDRESS.toLowerCase() &&
          t.contractAddress === "native"),
    );
    if (!buyInHoldings) return;

    const prevSellToken = sellToken;
    setSellToken(buyInHoldings);
    setBuyTokenAddress(prevSellToken ? to0xToken(prevSellToken) : "");
    if (prevSellToken) {
      setBuyTokenInfo({
        name: prevSellToken.name,
        symbol: prevSellToken.symbol,
        decimals: prevSellToken.decimals,
      });
      setBuyTokenLogoURI(prevSellToken.logoUrl);
    }
    setSellAmount("");
    setSliderValue(0);
    setQuote(null);
  };

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  // Custom sell token resolution (paste address in sell dropdown)
  // -----------------------------------------------------------------------
  const resolveSellCustomAddress = async (tokenAddress: string) => {
    setSellCustomLoading(true);
    setResolvedSellToken(null);
    setSellCustomError(null);
    try {
      const infoResult = await new Promise<{ success: boolean; data?: { name: string; symbol: string; decimals: number } }>((resolve) => {
        chrome.runtime.sendMessage({ type: "fetchTokenInfo", tokenAddress, chainId }, resolve);
      });
      if (!infoResult.success || !infoResult.data) {
        setSellCustomError("Not a valid ERC20 contract");
        return;
      }
      const { name, symbol, decimals } = infoResult.data;

      const { createPublicClient, http, erc20Abi, formatUnits } = await import("viem");
      const { RPC_URLS } = await import("@/constants/chainRegistry");
      const rpcUrl = RPC_URLS[chainId];
      if (!rpcUrl) {
        setSellCustomError("No RPC for this chain");
        return;
      }
      const client = createPublicClient({ transport: http(rpcUrl, { timeout: 8000, retryCount: 0 }) });
      const rawBalance = await client.readContract({
        address: tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [fromAddress as `0x${string}`],
      });
      const balance = formatUnits(rawBalance, decimals);
      const balanceNum = parseFloat(balance);

      setResolvedSellToken({
        contractAddress: tokenAddress,
        name,
        symbol,
        decimals,
        balance,
        balanceFormatted: balanceNum < 0.0001 && balanceNum > 0 ? "<0.0001" : parseFloat(balanceNum.toPrecision(6)).toString(),
        logoUrl: "",
        valueUsd: 0,
        priceUsd: 0,
        chainId,
      });
    } catch {
      setSellCustomError("Failed to fetch token info");
    } finally {
      setSellCustomLoading(false);
    }
  };

  const handleSelectCustomSellToken = (customToken: PortfolioToken) => {
    setSellToken(customToken);
    setResolvedSellToken(null);
    setSellCustomError(null);
    setSellAmount("");
    setIsUsdMode(false);
    setSliderValue(0);
    setQuote(null);
  };

  // Handle token list selection
  // -----------------------------------------------------------------------
  const handleBuyTokenSelect = (token: TokenListEntry) => {
    buyInfoSetBySelectRef.current = true;
    setBuyTokenAddress(token.address);
    setBuyTokenInfo({
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals,
    });
    setBuyTokenLogoURI(token.logoURI);
    setBuyTokenLoading(false);
    setQuote(null);
  };

  /** Handle raw address entered in the buy dropdown — resolve without selecting */
  const handleBuyAddressSubmit = (address: string) => {
    // Check if it's already in the token list
    const found = tokenList.find(
      (t) => t.address.toLowerCase() === address.toLowerCase(),
    );
    if (found) {
      setPendingBuyToken(found);
      setPendingBuyLoading(false);
      return;
    }
    // Resolve on-chain
    setPendingBuyToken(null);
    setPendingBuyLoading(true);
    chrome.runtime.sendMessage(
      { type: "fetchTokenInfo", tokenAddress: address, chainId },
      (res) => {
        setPendingBuyLoading(false);
        if (res?.success && res.data) {
          setPendingBuyToken({
            address,
            name: res.data.name,
            symbol: res.data.symbol,
            decimals: res.data.decimals,
            logoURI: "",
          });
        }
      },
    );
  };

  /** User clicked "Choose" on the pending token */
  const handleConfirmPendingBuy = (token: TokenListEntry) => {
    handleBuyTokenSelect(token);
    setPendingBuyToken(null);
  };

  // -----------------------------------------------------------------------
  // Submit: Prepare transactions, then show confirmation screen
  // -----------------------------------------------------------------------
  const handlePrepareSwap = async () => {
    if (!sellToken || !quote || !buyTokenInfo) return;
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

      // 1b. For non-native tokens, cap at on-chain balance to avoid rounding
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
      const transactions: SwapTxEntry[] = [];

      const swapMeta = {
        sellTokenSymbol: sellToken.symbol,
        sellTokenLogo: sellToken.logoUrl || null,
        buyTokenSymbol: buyTokenInfo.symbol,
        buyTokenLogo: buyTokenLogoURI || null,
      };

      // Check on-chain allowance and add approval TX if needed.
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
          gasPrice: swapTx.gasPrice,
        },
        origin: `Swap ${sellToken.symbol.toUpperCase()} to ${buyTokenInfo.symbol.toUpperCase()}`,
        favicon: sellToken.logoUrl || null,
        swapMeta,
      });

      // 4. Prepare batch encoding for Bankr accounts with multiple txs
      const isBatchSupported =
        (accountType === "bankr" || accountType === "impersonator") &&
        BANKR_SUPPORTED_CHAIN_IDS.has(chainId);

      let batchTx: { to: string; data: string; value: string } | null = null;
      if (isBatchSupported && transactions.length > 1) {
        const calls: ERC5792Call[] = transactions.map((t) => ({
          to: t.tx.to as `0x${string}`,
          data: (t.tx.data || "0x") as `0x${string}`,
          value: (t.tx.value || "0x0") as `0x${string}`,
        }));
        batchTx = encodeBatchCalls(calls, fromAddress);
      }

      // 5. Store prepared data and show confirmation
      setPreparedTransactions(transactions);
      setPreparedBatchTx(batchTx);
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
      if (preparedBatchTx) {
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
    setPreparedQuote(null);
  };

  // -----------------------------------------------------------------------
  // Validations
  // -----------------------------------------------------------------------
  const sellAmountNum = parseFloat(sellTokenAmount) || 0;
  const insufficientBalance = sellAmountNum > sellBalance;
  const isValidBuyAddress = /^0x[a-fA-F0-9]{40}$/.test(
    buyTokenAddress.trim(),
  );

  const canSwap =
    sellToken &&
    isValidBuyAddress &&
    buyTokenInfo &&
    sellAmountNum > 0 &&
    !insufficientBalance &&
    quote &&
    !quoteLoading &&
    !isSubmitting &&
    accountType !== "impersonator";

  // Price impact
  const inputUsd =
    sellToken && sellAmountNum > 0 && sellToken.priceUsd > 0
      ? sellAmountNum * sellToken.priceUsd
      : 0;
  const outputUsd = useMemo(() => {
    if (!quote || !buyTokenInfo || buyTokenPriceUsd <= 0) return 0;
    const buyAmountNum = parseFloat(
      formatUnits(BigInt(quote.buyAmount), buyTokenInfo.decimals),
    );
    return buyAmountNum * buyTokenPriceUsd;
  }, [quote, buyTokenInfo, buyTokenPriceUsd]);

  const priceImpact =
    inputUsd > 0 && outputUsd > 0
      ? ((inputUsd - outputUsd) / inputUsd) * 100
      : null;

  // -----------------------------------------------------------------------
  // Unsupported chain
  // -----------------------------------------------------------------------
  if (!isSwapSupported) {
    return (
      <Box p={4} minH="100%" bg="bg.base">
        <VStack spacing={4} align="stretch">
          <HStack spacing={2} justify="space-between">
            <HStack spacing={2}>
              <IconButton
                aria-label="Back"
                icon={<ArrowBackIcon />}
                variant="ghost"
                size="sm"
                onClick={onBack}
              />
              <Text
                fontWeight="900"
                fontSize="lg"
                color="text.primary"
                textTransform="uppercase"
                letterSpacing="wider"
              >
                Swap
              </Text>
            </HStack>
            {/* Chain selector */}
            <Menu>
              <MenuButton
                as={Box}
                cursor="pointer"
                bg={chainConfig.bg}
                border="2px solid"
                borderColor={chainConfig.border}
                px={2}
                py={1}
                _hover={{ opacity: 0.8 }}
              >
                <HStack spacing={1.5}>
                  {chainConfig.icon && (
                    <Image src={chainConfig.icon} boxSize="16px" />
                  )}
                  <Text
                    fontSize="xs"
                    fontWeight="700"
                    color={chainConfig.text}
                    textTransform="uppercase"
                  >
                    {chainName}
                  </Text>
                  <ChevronDownIcon color={chainConfig.text} boxSize={3} />
                </HStack>
              </MenuButton>
              <MenuList
                bg="bauhaus.white"
                border="3px solid"
                borderColor="bauhaus.black"
                boxShadow="4px 4px 0px 0px #121212"
                borderRadius="0"
                py={0}
                minW="160px"
                zIndex={30}
              >
                {CHAIN_REGISTRY.filter((c) => c.isSwapSupported).map(
                  (c, i, arr) => {
                    const cfg = getChainConfig(c.chainId);
                    return (
                      <MenuItem
                        key={c.chainId}
                        bg="bauhaus.white"
                        _hover={{ bg: "bg.hover" }}
                        borderBottom={
                          i < arr.length - 1 ? "2px solid" : "none"
                        }
                        borderColor="bauhaus.black"
                        py={2.5}
                        onClick={() => onChainChange(c.name)}
                      >
                        <HStack spacing={2}>
                          {cfg.icon && (
                            <Image src={cfg.icon} boxSize="18px" />
                          )}
                          <Text fontWeight="700" fontSize="sm">
                            {c.name}
                          </Text>
                        </HStack>
                      </MenuItem>
                    );
                  },
                )}
              </MenuList>
            </Menu>
          </HStack>
          <Box
            bg="bauhaus.yellow"
            border="3px solid"
            borderColor="bauhaus.black"
            boxShadow="4px 4px 0px 0px #121212"
            p={4}
          >
            <Text
              fontSize="sm"
              color="bauhaus.black"
              fontWeight="700"
              textAlign="center"
            >
              Swap is not available on {chainName}.
            </Text>
            <Text
              fontSize="xs"
              color="bauhaus.black"
              fontWeight="500"
              textAlign="center"
              mt={1}
            >
              Select a supported chain above.
            </Text>
          </Box>
        </VStack>
      </Box>
    );
  }

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
        buyTokenLogoURI={buyTokenLogoURI}
        buyUsd={outputUsd}
        chainId={chainId}
        chainName={chainName}
        fromAddress={fromAddress}
        accountType={accountType}
        isBatched={!!preparedBatchTx}
        batchedTx={preparedBatchTx ?? undefined}
        onConfirm={handleConfirmSwap}
        onCancel={handleCancelConfirmation}
        isSubmitting={isSubmitting}
      />
    );
  }

  // -----------------------------------------------------------------------
  // Loading
  // -----------------------------------------------------------------------
  if (holdingsLoading) {
    return (
      <Box
        p={4}
        minH="100%"
        bg="bg.base"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Spinner size="lg" color="bauhaus.blue" thickness="3px" />
      </Box>
    );
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <Box p={4} minH="100%" bg="bg.base">
      <VStack spacing={3} align="stretch">
        {/* Header */}
        <HStack spacing={2} justify="space-between">
          <HStack spacing={2}>
            <IconButton
              aria-label="Back"
              icon={<ArrowBackIcon />}
              variant="ghost"
              size="sm"
              onClick={onBack}
            />
            <Text
              fontWeight="900"
              fontSize="lg"
              color="text.primary"
              textTransform="uppercase"
              letterSpacing="wider"
            >
              Swap
            </Text>
          </HStack>
          {/* Chain selector */}
          <Menu>
            <MenuButton
              as={Box}
              cursor="pointer"
              bg={chainConfig.bg}
              border="2px solid"
              borderColor={chainConfig.border}
              px={2}
              py={1}
              _hover={{ opacity: 0.8 }}
            >
              <HStack spacing={1.5}>
                {chainConfig.icon && (
                  <Image src={chainConfig.icon} boxSize="16px" />
                )}
                <Text
                  fontSize="xs"
                  fontWeight="700"
                  color={chainConfig.text}
                  textTransform="uppercase"
                >
                  {chainName}
                </Text>
                <ChevronDownIcon color={chainConfig.text} boxSize={3} />
              </HStack>
            </MenuButton>
            <MenuList
              bg="bauhaus.white"
              border="3px solid"
              borderColor="bauhaus.black"
              boxShadow="4px 4px 0px 0px #121212"
              borderRadius="0"
              py={0}
              minW="160px"
              zIndex={30}
            >
              {CHAIN_REGISTRY.filter((c) => c.isSwapSupported).map(
                (c, i, arr) => {
                  const cfg = getChainConfig(c.chainId);
                  return (
                    <MenuItem
                      key={c.chainId}
                      bg={
                        c.chainId === chainId
                          ? "bg.muted"
                          : "bauhaus.white"
                      }
                      _hover={{ bg: "bg.hover" }}
                      borderBottom={
                        i < arr.length - 1 ? "2px solid" : "none"
                      }
                      borderColor="bauhaus.black"
                      py={2.5}
                      onClick={() => onChainChange(c.name)}
                    >
                      <HStack spacing={2}>
                        {cfg.icon && (
                          <Image
                            src={cfg.icon}
                            boxSize="18px"
                          />
                        )}
                        <Text fontWeight="700" fontSize="sm">
                          {c.name}
                        </Text>
                      </HStack>
                    </MenuItem>
                  );
                },
              )}
            </MenuList>
          </Menu>
        </HStack>

        {/* You Sell */}
        <Box
          bg="bauhaus.white"
          border="3px solid"
          borderColor="bauhaus.black"
          boxShadow="4px 4px 0px 0px #121212"
          p={3}
        >
          <Text
            fontSize="xs"
            fontWeight="700"
            color="text.secondary"
            textTransform="uppercase"
            mb={1}
          >
            You Sell
          </Text>
          {/* Balance + USD value | USD toggle */}
          {sellToken && (
            <HStack justify="space-between" mb={2}>
              <HStack spacing={2} align="baseline">
                <Text fontSize="xs" color="text.tertiary" fontWeight="500" textTransform="uppercase">
                  Balance: {Number(parseFloat(sellToken.balance).toPrecision(6)).toLocaleString("en-US", { maximumFractionDigits: 6 })}{" "}
                  {sellToken.symbol}
                </Text>
                {hasPrice && (
                  <Text fontSize="2xs" color="text.tertiary" fontWeight="500">
                    ({formatUsd(sellBalance * sellToken.priceUsd)})
                  </Text>
                )}
              </HStack>
              {hasPrice && (
                <Button
                  size="xs"
                  variant="ghost"
                  color="bauhaus.blue"
                  fontWeight="800"
                  fontSize="xs"
                  h="20px"
                  px={1}
                  onClick={handleToggleMode}
                  _hover={{ bg: "bg.muted" }}
                >
                  {isUsdMode ? sellToken.symbol.toUpperCase() : "USD"}
                </Button>
              )}
            </HStack>
          )}
          <HStack spacing={2}>
            <TokenSelector
              holdings={holdings}
              selectedToken={sellToken}
              excludeAddress={buyTokenAddress || undefined}
              onSelect={(t) => {
                setSellToken(t);
                setSellAmount("");
                setIsUsdMode(false);
                setSliderValue(0);
                setQuote(null);
              }}
              onCustomAddress={resolveSellCustomAddress}
              onSelectCustomToken={handleSelectCustomSellToken}
              resolvedCustomToken={resolvedSellToken}
              customTokenLoading={sellCustomLoading}
              customTokenError={sellCustomError}
              chainName={chainName}
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
                border="3px solid"
                borderColor="bauhaus.black"
                borderRadius="0"
                bg="bauhaus.white"
                _hover={{ borderColor: "bauhaus.blue" }}
                _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
                pl={isUsdMode ? "28px" : undefined}
                pr="50px"
              />
              <InputRightElement w="45px" h="calc(100% - 6px)" top="3px" right="3px">
                <Button
                  size="xs"
                  variant="ghost"
                  color="bauhaus.blue"
                  fontWeight="800"
                  borderRadius="0"
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
                  _hover={{ bg: "bg.muted" }}
                >
                  MAX
                </Button>
              </InputRightElement>
            </InputGroup>
          </HStack>
          {/* Conversion display — right-aligned */}
          {sellToken && sellAmount && parseFloat(sellAmount) > 0 && hasPrice && (
            <Text fontSize="xs" color="text.tertiary" fontWeight="700" mt={1} textAlign="right">
              {isUsdMode
                ? `${Number(parseFloat(sellTokenAmount).toPrecision(6)).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${sellToken.symbol.toUpperCase()}`
                : formatUsd(parseFloat(sellAmount) * sellToken.priceUsd)}
            </Text>
          )}
          {/* Sell token address */}
          {sellToken && sellToken.contractAddress !== "native" && (
            <TokenAddressRow
              address={sellToken.contractAddress}
              explorer={chainConfig.explorer}
              copied={copiedAddr === sellToken.contractAddress}
              onCopy={async () => {
                await navigator.clipboard.writeText(sellToken.contractAddress);
                setCopiedAddr(sellToken.contractAddress);
                setTimeout(() => setCopiedAddr(null), 2000);
              }}
            />
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
                    color={sliderValue >= pct ? "bauhaus.blue" : "gray.400"}
                    whiteSpace="nowrap"
                    transform="translateX(-50%)"
                  >
                    {pct}%
                  </SliderMark>
                ))}
                <SliderTrack bg="gray.200" h="6px" borderRadius={0}>
                  <SliderFilledTrack bg="bauhaus.blue" />
                </SliderTrack>
                <SliderThumb
                  boxSize={5}
                  bg="bauhaus.blue"
                  border="3px solid"
                  borderColor="bauhaus.black"
                  borderRadius={0}
                  _focus={{ boxShadow: "none" }}
                />
              </Slider>
            </Box>
          )}
          {insufficientBalance && sellAmountNum > 0 && (
            <Text fontSize="xs" color="bauhaus.red" fontWeight="700" mt={1}>
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
            bg="bauhaus.blue"
            color="bauhaus.white"
            border="3px solid"
            borderColor="bauhaus.black"
            borderRadius={0}
            _hover={{ bg: "bauhaus.blue", transform: "translateY(-1px)" }}
            _active={{ transform: "translate(1px, 1px)" }}
            onClick={handleFlip}
            isDisabled={!buyTokenInfo}
          />
        </Box>

        {/* You Receive */}
        <Box
          bg="bauhaus.white"
          border="3px solid"
          borderColor="bauhaus.black"
          boxShadow="4px 4px 0px 0px #121212"
          p={3}
        >
          <Text
            fontSize="xs"
            fontWeight="700"
            color="text.secondary"
            textTransform="uppercase"
            mb={2}
          >
            You Receive
          </Text>
          <HStack spacing={2} position="relative">
            <BuyTokenSelector
              tokenList={tokenList}
              holdings={holdings}
              selectedToken={
                buyTokenInfo
                  ? {
                      address: buyTokenAddress,
                      symbol: buyTokenInfo.symbol,
                      name: buyTokenInfo.name,
                      decimals: buyTokenInfo.decimals,
                      logoURI: buyTokenLogoURI,
                    }
                  : null
              }
              excludeAddress={sellToken ? to0xToken(sellToken) : undefined}
              chainId={chainId}
              onTokenSelect={handleBuyTokenSelect}
              onAddressSubmit={handleBuyAddressSubmit}
              buyTokenLoading={pendingBuyLoading}
              pendingToken={pendingBuyToken}
              onConfirmPending={handleConfirmPendingBuy}
            />
            {/* Output amount — read-only, mirrors the sell amount input */}
            <InputGroup flex={1}>
              <Input
                placeholder={quoteLoading ? "..." : "0.0"}
                value={
                  quote && buyTokenInfo
                    ? formatOutputAmount(
                        quote.buyAmount,
                        buyTokenInfo.decimals,
                      )
                    : ""
                }
                readOnly
                fontFamily="mono"
                fontSize="sm"
                border="3px solid"
                borderColor="bauhaus.black"
                borderRadius="0"
                bg="bg.muted"
                _hover={{}}
                _focus={{ boxShadow: "none" }}
                cursor="default"
              />
            </InputGroup>
          </HStack>
          {/* Token address */}
          {buyTokenAddress && buyTokenInfo && (
            <TokenAddressRow
              address={buyTokenAddress}
              explorer={chainConfig.explorer}
              copied={copiedAddr === buyTokenAddress}
              onCopy={async () => {
                await navigator.clipboard.writeText(buyTokenAddress);
                setCopiedAddr(buyTokenAddress);
                setTimeout(() => setCopiedAddr(null), 2000);
              }}
            />
          )}
          {/* Output USD value + price impact */}
          {quote && buyTokenInfo && (
            <HStack justify="flex-end" mt={1} spacing={1}>
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
                      ? "bauhaus.red"
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
        </Box>

        {/* Quote error */}
        {quoteError && (
          <Text fontSize="xs" color="bauhaus.red" fontWeight="700">
            {quoteError}
          </Text>
        )}

        {/* Slippage settings */}
        <HStack justify="flex-end">
          <SlippageSettings
            slippageBps={slippageBps}
            onSlippageChange={setSlippageBps}
          />
        </HStack>

        {/* Quote details */}
        {quote && buyTokenInfo && sellToken && (
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

        {/* Price impact warning */}
        {priceImpact !== null && priceImpact > 3 && (
          <Box
            bg={priceImpact > 10 ? "red.50" : "orange.50"}
            border="3px solid"
            borderColor={priceImpact > 10 ? "bauhaus.red" : "orange.400"}
            boxShadow="3px 3px 0px 0px #121212"
            p={3}
          >
            <Text
              fontSize="sm"
              color={priceImpact > 10 ? "bauhaus.red" : "orange.700"}
              fontWeight="700"
            >
              {priceImpact > 10
                ? `High price impact (~${priceImpact.toFixed(1)}%). You may receive significantly fewer tokens.`
                : `Price impact is ~${priceImpact.toFixed(1)}%.`}
            </Text>
          </Box>
        )}

        {/* Impersonator warning */}
        {accountType === "impersonator" && (
          <Box
            bg="bauhaus.yellow"
            border="3px solid"
            borderColor="bauhaus.black"
            boxShadow="3px 3px 0px 0px #121212"
            p={3}
          >
            <Text fontSize="sm" color="bauhaus.black" fontWeight="700">
              View-only account — swaps are disabled.
            </Text>
          </Box>
        )}

        {/* Action button */}
        <Box mt={2}>
          <Button
            w="100%"
            onClick={handlePrepareSwap}
            isLoading={isSubmitting}
            loadingText="Preparing..."
            isDisabled={!canSwap}
            bg="bauhaus.red"
            color="bauhaus.white"
            border="3px solid"
            borderColor="bauhaus.black"
            boxShadow="4px 4px 0px 0px #121212"
            fontWeight="700"
            _hover={{
              transform: "translateY(-2px)",
              boxShadow: "6px 6px 0px 0px #121212",
            }}
            _active={{
              transform: "translate(2px, 2px)",
              boxShadow: "none",
            }}
          >
            Swap
          </Button>
        </Box>
      </VStack>
    </Box>
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
    <HStack mt={1} spacing={1}>
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
        color={copied ? "bauhaus.yellow" : "text.tertiary"}
        onClick={onCopy}
        _hover={{ color: "bauhaus.blue", bg: "bg.muted" }}
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
          _hover={{ color: "bauhaus.blue", bg: "bg.muted" }}
        />
      )}
    </HStack>
  );
}

export default memo(SwapView);
