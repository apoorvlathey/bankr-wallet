import { useState, useEffect, useMemo, memo } from "react";
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
} from "@chakra-ui/react";
import { ArrowBackIcon, ChevronDownIcon, CopyIcon, CheckIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import { blo } from "blo";
import { useBauhausToast } from "@/hooks/useBauhausToast";
import { useAddressResolver } from "@/hooks/useAddressResolver";
import { isResolvableName } from "@/lib/ensUtils";
import { fetchPortfolio, PortfolioToken } from "@/chrome/portfolioApi";
import { buildTransferTx } from "@/chrome/transferUtils";
import { getChainConfig } from "@/constants/chainConfig";
import { CHAIN_REGISTRY, SWAP_SUPPORTED_CHAIN_IDS } from "@/constants/chainRegistry";
import type { Account } from "@/chrome/types";
import TokenSelector from "@/components/Swap/TokenSelector";

/** USDC on Base (ERC-3009 transferWithAuthorization) */
const BASE_USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

function formatUsd(value: number): string {
  if (value < 0.01 && value > 0) return "<$0.01";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTokenAmount(value: number): string {
  if (value === 0) return "0";
  if (value < 0.000001) return "<0.000001";
  return parseFloat(value.toPrecision(6)).toString();
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
  const toast = useBauhausToast();
  const [selectedChainId, setSelectedChainId] = useState(initialToken?.chainId || chainId);
  const [selectedToken, setSelectedToken] = useState<PortfolioToken | null>(initialToken || null);
  const [allTokens, setAllTokens] = useState<PortfolioToken[]>([]);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [isUsdMode, setIsUsdMode] = useState(false);
  const [sliderValue, setSliderValue] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [customTokenLoading, setCustomTokenLoading] = useState(false);

  // Fetch all holdings once
  useEffect(() => {
    let cancelled = false;
    setHoldingsLoading(true);
    fetchPortfolio(fromAddress).then((data) => {
      if (cancelled) return;
      setAllTokens(data.tokens);
      // If no token pre-selected, auto-select the first on current chain
      if (!selectedToken) {
        const onChain = data.tokens.filter((t) => t.chainId === selectedChainId);
        if (onChain.length > 0) setSelectedToken(onChain[0]);
      }
      setHoldingsLoading(false);
    }).catch(() => {
      if (!cancelled) setHoldingsLoading(false);
    });
    return () => { cancelled = true; };
  }, [fromAddress]);

  // Holdings filtered by selected chain
  const holdings = useMemo(
    () => allTokens.filter((t) => t.chainId === selectedChainId),
    [allTokens, selectedChainId],
  );

  // All chains from registry (sorted: selected first, then registry order)
  const allChains = useMemo(() => {
    const ids = CHAIN_REGISTRY.map((c) => c.chainId);
    // Move selected chain to front
    const sorted = [selectedChainId, ...ids.filter((id) => id !== selectedChainId)];
    return sorted;
  }, [selectedChainId]);

  const handleChainChange = (newChainId: number) => {
    setSelectedChainId(newChainId);
    // Auto-select first token on that chain
    const onChain = allTokens.filter((t) => t.chainId === newChainId);
    setSelectedToken(onChain.length > 0 ? onChain[0] : null);
    setAmount("");
    setIsUsdMode(false);
    setSliderValue(0);
  };

  // Resolved custom token shown in dropdown for user to click
  const [resolvedCustomToken, setResolvedCustomToken] = useState<PortfolioToken | null>(null);
  const [customTokenError, setCustomTokenError] = useState<string | null>(null);

  // Resolve a custom ERC20 address: fetch on-chain info + balance
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

      // Fetch balance via balanceOf
      const { createPublicClient, http, erc20Abi, formatUnits } = await import("viem");
      const { RPC_URLS } = await import("@/constants/chainRegistry");
      const rpcUrl = RPC_URLS[selectedChainId];
      if (!rpcUrl) {
        setCustomTokenError("No RPC for this chain");
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

      setResolvedCustomToken({
        contractAddress: tokenAddress,
        name,
        symbol,
        decimals,
        balance,
        balanceFormatted: balanceNum < 0.0001 && balanceNum > 0 ? "<0.0001" : parseFloat(balanceNum.toPrecision(6)).toString(),
        logoUrl: "",
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
  };

  const token = selectedToken;

  // Sponsored USDC transfer detection
  const isUsdcOnBase = !!(
    token &&
    token.chainId === 8453 &&
    token.contractAddress?.toLowerCase() === BASE_USDC_ADDRESS.toLowerCase()
  );
  const [premiumStatus, setPremiumStatus] = useState<{
    isPremium: boolean;
    balance: string;
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
      (result: { isPremium: boolean; balance: string } | undefined) => {
        if (result) setPremiumStatus(result);
        setPremiumLoading(false);
      }
    );
  }, [isUsdcOnBase, fromAddress]);

  const isSponsoredFlow = isUsdcOnBase && premiumStatus?.isPremium && accountType !== "impersonator";

  const { resolvedAddress, resolvedName, avatar, isResolving, isLoadingExtras, isValid: isRecipientValid, error: resolverError } =
    useAddressResolver(recipient);

  const chainConfig = getChainConfig(selectedChainId);
  const hasPrice = token ? token.priceUsd > 0 : false;

  // Other wallet accounts (excluding current sender) for recipient picker
  const otherAccounts = useMemo(
    () => (accounts || []).filter(a => a.address.toLowerCase() !== fromAddress.toLowerCase()),
    [accounts, fromAddress],
  );

  // Compute the token amount that will actually be sent
  const tokenAmount = useMemo(() => {
    if (!token || !amount) return "";
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return "";
    if (isUsdMode && hasPrice) {
      const converted = num / token.priceUsd;
      const balance = parseFloat(token.balance);
      if (converted >= balance) return token.balance;
      return converted.toFixed(token.decimals);
    }
    return amount;
  }, [amount, isUsdMode, hasPrice, token]);

  const balanceNum = token ? parseFloat(token.balance) : 0;

  const handleTokenSelect = (t: PortfolioToken) => {
    setSelectedToken(t);
    setAmount("");
    setIsUsdMode(false);
    setSliderValue(0);
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
    if (!token || !tokenAmount) return false;
    const num = parseFloat(tokenAmount);
    if (isNaN(num) || num <= 0) return false;
    const balance = parseFloat(token.balance);
    return num <= balance;
  };

  const canSubmit = !!token && isRecipientValid && !isResolving && isAmountValid() && !isSubmitting;

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
          toast({
            title: "Sponsored transfer failed",
            description: result.error || "Could not complete sponsored transfer",
            status: "error",
            duration: 3000,
          });
        }
        return;
      }

      // Normal transfer flow
      const txParts = buildTransferTx({
        to: resolvedAddress!,
        amount: tokenAmount,
        contractAddress: token.contractAddress,
        decimals: token.decimals,
        chainId: token.chainId,
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
              chainName: chainConfig.name,
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
            <Text fontWeight="900" fontSize="lg" color="text.primary" textTransform="uppercase" letterSpacing="wider">
              Send
            </Text>
          </HStack>
          {onSwapInstead && selectedToken && SWAP_SUPPORTED_CHAIN_IDS.has(selectedChainId) && (
            <Text
              fontSize="xs"
              fontWeight="700"
              color="bauhaus.blue"
              cursor="pointer"
              onClick={() => onSwapInstead(selectedToken)}
              _hover={{ textDecoration: "underline" }}
            >
              Swap instead?
            </Text>
          )}
        </HStack>

        {/* Non-premium upsell (compact, top of page) */}
        {isUsdcOnBase && !premiumLoading && premiumStatus && !premiumStatus.isPremium && accountType !== "impersonator" && (
          <HStack
            spacing={2}
            px={2.5}
            py={1.5}
            bg="bauhaus.yellow"
            border="2px solid"
            borderColor="bauhaus.black"
            justify="space-between"
          >
            <Box>
              <Text fontSize="2xs" color="bauhaus.black" fontWeight="700">
                ✨ Stake 20M+ sWCHAN for gas-free USDC sends
              </Text>
              <Text fontSize="2xs" color="blackAlpha.700" fontWeight="600">
                and other pro features!
              </Text>
            </Box>
            <Button
              size="xs"
              h="22px"
              px={2}
              bg="bauhaus.yellow"
              color="bauhaus.black"
              fontWeight="800"
              fontSize="2xs"
              borderRadius={0}
              border="2px solid"
              borderColor="bauhaus.black"
              _hover={{ bg: "#e0b01c" }}
              onClick={() => window.open("https://stake.walletchan.com", "_blank")}
              flexShrink={0}
            >
              STAKE
            </Button>
          </HStack>
        )}

        {/* Token selector card */}
        {holdingsLoading && !token ? (
          <Skeleton h="64px" />
        ) : (
          <Box
            bg="bauhaus.white"
            border="3px solid"
            borderColor="bauhaus.black"
            boxShadow="4px 4px 0px 0px #121212"
            p={3}
          >
            <HStack spacing={3}>
              {/* Chain selector */}
              <Menu>
                <MenuButton
                  as={Box}
                  cursor="pointer"
                  flexShrink={0}
                  _hover={{ opacity: 0.7 }}
                  transition="opacity 0.15s"
                >
                  <Box position="relative">
                    {chainConfig.icon ? (
                      <Image
                        src={chainConfig.icon}
                        alt={chainConfig.name}
                        boxSize="36px"
                        border="2px solid"
                        borderColor="bauhaus.black"
                        borderRadius="full"
                        bg="white"
                      />
                    ) : (
                      <Box
                        boxSize="36px"
                        border="2px solid"
                        borderColor="bauhaus.black"
                        borderRadius="full"
                        bg="bg.muted"
                      />
                    )}
                    <Box
                      position="absolute"
                      bottom="-2px"
                      right="-2px"
                      bg="bauhaus.white"
                      border="1.5px solid"
                      borderColor="bauhaus.black"
                      borderRadius="full"
                      boxSize="16px"
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                    >
                      <ChevronDownIcon boxSize="12px" />
                    </Box>
                  </Box>
                </MenuButton>
                <MenuList
                  bg="bauhaus.white"
                  border="3px solid"
                  borderColor="bauhaus.black"
                  borderRadius={0}
                  boxShadow="4px 4px 0px 0px #121212"
                  maxH="200px"
                  overflowY="auto"
                  p={0}
                  zIndex={10}
                >
                  {allChains.map((cId) => {
                    const cc = getChainConfig(cId);
                    return (
                      <MenuItem
                        key={cId}
                        onClick={() => handleChainChange(cId)}
                        bg={cId === selectedChainId ? "bg.muted" : "transparent"}
                        _hover={{ bg: "bg.hover" }}
                        px={3}
                        py={2}
                      >
                        <HStack spacing={2}>
                          {cc.icon && <Image src={cc.icon} boxSize="18px" borderRadius="full" />}
                          <Text fontWeight="700" fontSize="sm">{cc.name}</Text>
                        </HStack>
                      </MenuItem>
                    );
                  })}
                </MenuList>
              </Menu>

              {/* Token selector + balance */}
              <VStack align="start" spacing={0} flex={1} minW={0}>
                <TokenSelector
                  holdings={holdings}
                  selectedToken={token}
                  onSelect={handleTokenSelect}
                  borderless
                  onCustomAddress={resolveCustomAddress}
                  onSelectCustomToken={handleSelectCustomToken}
                  resolvedCustomToken={resolvedCustomToken}
                  customTokenLoading={customTokenLoading}
                  customTokenError={customTokenError}
                  chainName={chainConfig.name}
                />
                {token && (
                  <Text fontSize="xs" fontWeight="700" color="text.tertiary" mt={0.5} noOfLines={1}>
                    on {chainConfig.name}
                  </Text>
                )}
              </VStack>

              {/* Balance */}
              {token && (
                <VStack align="end" spacing={0} flexShrink={0}>
                  <Text fontSize="sm" fontWeight="800" color="text.primary" noOfLines={1}>
                    {token.balanceFormatted}
                  </Text>
                  {hasPrice && (
                    <Text fontSize="xs" fontWeight="700" color="text.tertiary">
                      {formatUsd(parseFloat(token.balance) * token.priceUsd)}
                    </Text>
                  )}
                </VStack>
              )}
            </HStack>
          </Box>
        )}

        {/* Recipient input */}
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
                    color="bauhaus.blue"
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
                    bg="bauhaus.white"
                    border="3px solid"
                    borderColor="bauhaus.black"
                    borderRadius="0"
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
                        <HStack spacing={2}>
                          <Image
                            src={account.type === "bankr" ? "/bankr-icon.png" : blo(account.address as `0x${string}`)}
                            alt="avatar"
                            boxSize="20px"
                            minW="20px"
                            borderRadius="sm"
                            border="2px solid"
                            borderColor="bauhaus.black"
                          />
                          <VStack align="start" spacing={0}>
                            <Text fontSize="xs" fontWeight="700" color="text.primary" noOfLines={1}>
                              {account.displayName || `${account.address.slice(0, 6)}...${account.address.slice(-4)}`}
                            </Text>
                            {account.displayName && (
                              <Text fontSize="2xs" fontFamily="mono" color="text.tertiary">
                                {account.address.slice(0, 6)}...{account.address.slice(-4)}
                              </Text>
                            )}
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
                <Spinner size="xs" color="bauhaus.blue" />
                <Text fontSize="xs" color="text.tertiary" fontWeight="700">
                  Resolving...
                </Text>
              </HStack>
            )}
            {recipient && !isResolving && isRecipientValid && isResolvableName(recipient) && resolvedAddress && (
              <HStack spacing={0.5}>
                {avatar && (
                  <Image
                    src={avatar}
                    alt="avatar"
                    boxSize="14px"
                    borderRadius="full"
                    border="1px solid"
                    borderColor="bauhaus.black"
                  />
                )}
                <Text fontSize="xs" color="text.tertiary" fontFamily="mono" fontWeight="700">
                  {resolvedAddress.slice(0, 6)}...{resolvedAddress.slice(-4)}
                </Text>
                <IconButton
                  aria-label="Copy address"
                  icon={copied ? <CheckIcon boxSize="10px" /> : <CopyIcon boxSize="10px" />}
                  size="xs"
                  variant="ghost"
                  minW="18px"
                  h="18px"
                  color={copied ? "bauhaus.yellow" : "text.tertiary"}
                  onClick={async () => {
                    await navigator.clipboard.writeText(resolvedAddress);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  _hover={{ color: "bauhaus.blue", bg: "bg.muted" }}
                />
                {chainConfig.explorer && (
                  <IconButton
                    aria-label="View on explorer"
                    icon={<ExternalLinkIcon boxSize="10px" />}
                    size="xs"
                    variant="ghost"
                    minW="18px"
                    h="18px"
                    color="text.tertiary"
                    onClick={() => window.open(`${chainConfig.explorer}/address/${resolvedAddress}`, "_blank")}
                    _hover={{ color: "bauhaus.blue", bg: "bg.muted" }}
                  />
                )}
              </HStack>
            )}
            {recipient && !isResolving && isRecipientValid && !isResolvableName(recipient) && resolvedName && (
              <HStack spacing={0.5}>
                {avatar && (
                  <Image
                    src={avatar}
                    alt="avatar"
                    boxSize="14px"
                    borderRadius="full"
                    border="1px solid"
                    borderColor="bauhaus.black"
                  />
                )}
                <Text fontSize="xs" color="text.tertiary" fontWeight="700">
                  {resolvedName}
                </Text>
              </HStack>
            )}
          </HStack>
          <Input
            placeholder="0x..., ENS, Basename, .wei, or .mega"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value.trim())}
            fontFamily="mono"
            fontSize="sm"
            border="3px solid"
            borderColor={
              recipient && !isResolving && !isRecipientValid
                ? "bauhaus.red"
                : "bauhaus.black"
            }
            borderRadius="0"
            bg="bauhaus.white"
            _hover={{ borderColor: "bauhaus.blue" }}
            _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
          />
          {recipient && !isResolving && !isRecipientValid && (
            <Text fontSize="xs" color="bauhaus.red" fontWeight="700" mt={1}>
              {resolverError || "Invalid address or name"}
            </Text>
          )}
        </Box>

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
                color="bauhaus.blue"
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
              border="3px solid"
              borderColor="bauhaus.black"
              borderRadius="0"
              bg="bauhaus.white"
              _hover={{ borderColor: "bauhaus.blue" }}
              _focus={{ borderColor: "bauhaus.blue", boxShadow: "none" }}
              pl={isUsdMode ? "28px" : undefined}
              pr="60px"
            />
            <InputRightElement w="55px" h="full">
              <Button
                size="xs"
                variant="ghost"
                color="bauhaus.blue"
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
          {amount && !isAmountValid() && parseFloat(amount) > 0 && (
            <Text fontSize="xs" color="bauhaus.red" fontWeight="700" mt={1}>
              Insufficient balance
            </Text>
          )}
        </Box>

        {/* Sponsored USDC banner */}
        {isUsdcOnBase && !premiumLoading && premiumStatus?.isPremium && accountType !== "impersonator" && (
          <Box
            bg="bauhaus.blue"
            border="3px solid"
            borderColor="bauhaus.black"
            boxShadow="3px 3px 0px 0px #121212"
            p={3}
          >
            <Text fontSize="md" color="bauhaus.white" fontWeight="900" textTransform="uppercase" textAlign="center">
              Gas Sponsored by us!
            </Text>
            <Text fontSize="xs" color="whiteAlpha.800" fontWeight="700" textAlign="center" mt={0.5}>
              Free USDC transfer for sWCHAN stakers
            </Text>
          </Box>
        )}
        {isUsdcOnBase && premiumLoading && (
          <Skeleton h="60px" />
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
              View-only account — transfers are disabled.
            </Text>
          </Box>
        )}

        {/* Action buttons */}
        <HStack spacing={3} mt={2}>
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
            bg="bauhaus.blue"
            color="white"
            border="3px solid"
            borderColor="bauhaus.black"
            boxShadow="4px 4px 0px 0px #121212"
            fontWeight="700"
            fontSize={isSponsoredFlow ? "xs" : undefined}
            _hover={{
              bg: "bauhaus.blue",
              transform: "translateY(-2px)",
              boxShadow: "6px 6px 0px 0px #121212",
            }}
            _active={{
              transform: "translate(2px, 2px)",
              boxShadow: "none",
            }}
          >
            {isSponsoredFlow ? "Sign (Gas-Free)" : "Send"}
          </Button>
        </HStack>
      </VStack>
    </Box>
  );
}

export default memo(TokenTransfer);
