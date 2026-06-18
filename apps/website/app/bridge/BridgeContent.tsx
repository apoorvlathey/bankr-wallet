"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Container,
  Flex,
  HStack,
  Heading,
  Input,
  Text,
  VStack,
  Spinner,
} from "@chakra-ui/react";
import { ArrowDown } from "lucide-react";
import { useAccount, useBalance } from "wagmi";
import { parseUnits } from "viem";
import { Navigation } from "../components/Navigation";
import { SlippageSettings } from "../swap/components/SlippageSettings";
import { ChainSelector } from "./components/ChainSelector";
import { TokenSelector } from "./components/TokenSelector";
import { BridgeQuoteDisplay } from "./components/BridgeQuoteDisplay";
import { BridgeButton } from "./components/BridgeButton";
import { BridgeStatus } from "./components/BridgeStatus";
import { useBridgeChains } from "./hooks/useBridgeChains";
import { useBridgeTokens } from "./hooks/useBridgeTokens";
import { useBridgeQuote } from "./hooks/useBridgeQuote";
import { usePortfolio } from "./hooks/usePortfolio";
import { POPULAR_PER_CHAIN } from "./constants";
import { BUNGEE_NATIVE_TOKEN, type BungeeToken } from "@walletchan/shared/bungee";

/** Map chainId → block-explorer URL for tx links. */
const EXPLORERS: Record<number, string> = {
  1: "https://etherscan.io",
  10: "https://optimistic.etherscan.io",
  56: "https://bscscan.com",
  137: "https://polygonscan.com",
  130: "https://uniscan.xyz",
  8453: "https://basescan.org",
  42161: "https://arbiscan.io",
  43114: "https://snowtrace.io",
  59144: "https://lineascan.build",
  534352: "https://scrollscan.com",
  81457: "https://blastscan.io",
  5000: "https://explorer.mantle.xyz",
  146: "https://sonicscan.org",
  57073: "https://explorer.inkonchain.com",
};

const DEFAULT_FROM_CHAIN = 8453; // Base
const DEFAULT_TO_CHAIN = 1; // Ethereum

export default function BridgeContent() {
  const { address } = useAccount();

  const [fromChainId, setFromChainId] = useState<number>(DEFAULT_FROM_CHAIN);
  const [toChainId, setToChainId] = useState<number>(DEFAULT_TO_CHAIN);
  const [fromToken, setFromToken] = useState<BungeeToken | null>(null);
  const [toToken, setToToken] = useState<BungeeToken | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [slippageBps, setSlippageBps] = useState<number>(50); // 0.5%

  const [submitted, setSubmitted] = useState<{
    requestHash?: string;
    txHash?: string;
    chainId: number;
  } | null>(null);

  const { chains, isLoading: chainsLoading } = useBridgeChains();
  const { tokens: fromTokens, isLoading: fromTokensLoading } =
    useBridgeTokens(fromChainId);
  const { tokens: toTokens, isLoading: toTokensLoading } =
    useBridgeTokens(toChainId);

  // User's portfolio (multi-chain) — filter per side
  const { tokens: portfolio } = usePortfolio(address);
  const fromHoldings = useMemo(
    () => portfolio.filter((t) => t.chainId === fromChainId),
    [portfolio, fromChainId],
  );

  // Auto-pick native token on chain change if user hasn't picked anything yet
  useEffect(() => {
    if (!fromToken && fromTokens.length > 0) {
      const native = fromTokens.find(
        (t) => t.address?.toLowerCase() === BUNGEE_NATIVE_TOKEN,
      );
      if (native) setFromToken(native);
    }
  }, [fromTokens, fromToken]);

  useEffect(() => {
    if (!toToken && toTokens.length > 0) {
      const native = toTokens.find(
        (t) => t.address?.toLowerCase() === BUNGEE_NATIVE_TOKEN,
      );
      if (native) setToToken(native);
    }
  }, [toTokens, toToken]);

  // Reset token when chain changes
  const handleFromChainChange = (chainId: number) => {
    setFromChainId(chainId);
    setFromToken(null);
  };
  const handleToChainChange = (chainId: number) => {
    setToChainId(chainId);
    setToToken(null);
  };

  // Sender balance
  const isNativeFromToken =
    fromToken?.address?.toLowerCase() === BUNGEE_NATIVE_TOKEN;
  const { data: balance } = useBalance({
    address,
    chainId: fromChainId,
    token:
      !isNativeFromToken && fromToken
        ? (fromToken.address as `0x${string}`)
        : undefined,
    query: { enabled: !!address && !!fromToken },
  });

  // Parse amount to wei
  const inputAmountWei = useMemo(() => {
    if (!amount || !fromToken) return undefined;
    try {
      const decimals = fromToken.decimals ?? 18;
      const wei = parseUnits(amount, decimals);
      if (wei <= 0n) return undefined;
      return wei.toString();
    } catch {
      return undefined;
    }
  }, [amount, fromToken]);

  const isAmountValid = !!inputAmountWei;

  const slippagePercent = (slippageBps / 100).toString();

  const { quote, isLoading: isQuoteLoading, error: quoteError, fetchFirmQuote } =
    useBridgeQuote({
      userAddress: address,
      receiverAddress: address,
      originChainId: fromChainId,
      destinationChainId: toChainId,
      inputToken: fromToken?.address,
      outputToken: toToken?.address,
      inputAmount: inputAmountWei,
      slippage: slippagePercent,
      enabled: !!fromToken && !!toToken && !!inputAmountWei,
    });

  const handleMax = () => {
    if (!balance || !fromToken) return;
    const decimals = fromToken.decimals ?? 18;
    // Reserve ~0.005 of the gas token for native sends
    let max = balance.value;
    if (isNativeFromToken && max > 5_000_000_000_000_000n) {
      max -= 5_000_000_000_000_000n;
    }
    const formatted = (Number(max) / 10 ** decimals).toString();
    setAmount(formatted);
  };

  const sameChain = fromChainId === toChainId;

  return (
    <Box minH="100vh" bg="bauhaus.background">
      <Navigation />

      <Box
        bg="bauhaus.yellow"
        position="relative"
        overflow="hidden"
        minH="calc(100vh - 73px)"
      >
        {/* Geometric background decorators */}
        <Box
          position="absolute"
          top={-20}
          right={-20}
          w={{ base: 40, lg: 72 }}
          h={{ base: 40, lg: 72 }}
          bg="bauhaus.red"
          opacity={0.15}
          borderRadius="full"
        />
        <Box
          position="absolute"
          bottom={10}
          left={-10}
          w={{ base: 32, lg: 48 }}
          h={{ base: 32, lg: 48 }}
          bg="bauhaus.blue"
          opacity={0.1}
          transform="rotate(45deg)"
        />

        <Container maxW="7xl" py={{ base: 12, md: 16 }}>
          <Flex direction="column" align="center" gap={{ base: 6, md: 8 }}>
            <Heading
              fontWeight="black"
              fontSize={{ base: "2xl", md: "4xl" }}
              textTransform="uppercase"
              letterSpacing="tight"
              textAlign="center"
            >
              Bridge tokens across chains
            </Heading>
            <Text
              fontWeight="medium"
              fontSize={{ base: "sm", md: "md" }}
              textAlign="center"
              maxW="md"
            >
              Powered by Socket. Single-popup execution where your wallet
              supports atomic calls.
            </Text>

            <Box
              w="full"
              maxW="lg"
              bg="white"
              border="3px solid"
              borderColor="bauhaus.black"
              boxShadow="6px 6px 0px 0px #121212"
              p={5}
            >
              <VStack spacing={4} align="stretch">
                <HStack justify="space-between">
                  <Heading
                    as="h2"
                    fontSize="lg"
                    fontWeight="black"
                    textTransform="uppercase"
                  >
                    Bridge
                  </Heading>
                  <SlippageSettings
                    slippageBps={slippageBps}
                    onSlippageChange={setSlippageBps}
                    presets={[10, 30, 50, 100]}
                  />
                </HStack>

                {/* From section */}
                <VStack spacing={3} align="stretch">
                  <HStack spacing={3} align="flex-end">
                    <Box flex={1}>
                      <ChainSelector
                        chains={chains}
                        selectedChainId={fromChainId}
                        onChange={handleFromChainChange}
                        label="From chain"
                        isLoading={chainsLoading}
                      />
                    </Box>
                    <Box flex={1}>
                      <TokenSelector
                        tokens={fromTokens}
                        selectedAddress={fromToken?.address}
                        onChange={setFromToken}
                        label="From token"
                        isLoading={fromTokensLoading}
                        holdings={fromHoldings}
                        popularSymbols={POPULAR_PER_CHAIN[fromChainId]}
                      />
                    </Box>
                  </HStack>

                  <Box>
                    <HStack justify="space-between" mb={1}>
                      <Text
                        fontSize="2xs"
                        fontWeight="bold"
                        color="gray.500"
                        textTransform="uppercase"
                        letterSpacing="wider"
                      >
                        Amount
                      </Text>
                      {balance && (
                        <HStack
                          as="button"
                          spacing={1}
                          onClick={handleMax}
                          cursor="pointer"
                          _hover={{ opacity: 0.7 }}
                        >
                          <Text fontSize="2xs" color="gray.500" fontWeight="bold">
                            Balance: {parseFloat(balance.formatted).toFixed(4)}{" "}
                            {balance.symbol}
                          </Text>
                          <Box
                            bg="bauhaus.yellow"
                            border="1px solid"
                            borderColor="bauhaus.black"
                            px={1}
                            fontSize="2xs"
                            fontWeight="black"
                          >
                            MAX
                          </Box>
                        </HStack>
                      )}
                    </HStack>
                    <Input
                      placeholder="0.0"
                      value={amount}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || /^\d*\.?\d*$/.test(val)) {
                          setAmount(val);
                        }
                      }}
                      type="text"
                      inputMode="decimal"
                      border="2px solid"
                      borderColor="bauhaus.border"
                      borderRadius={0}
                      fontWeight="bold"
                      fontSize="lg"
                      _focus={{
                        boxShadow: "2px 2px 0px 0px #121212",
                        borderColor: "bauhaus.border",
                      }}
                    />
                  </Box>
                </VStack>

                {/* Arrow divider */}
                <Flex justify="center">
                  <Box
                    bg="bauhaus.black"
                    color="white"
                    p={1}
                    border="2px solid"
                    borderColor="bauhaus.black"
                  >
                    <ArrowDown size={16} />
                  </Box>
                </Flex>

                {/* To section */}
                <HStack spacing={3} align="flex-end">
                  <Box flex={1}>
                    <ChainSelector
                      chains={chains}
                      selectedChainId={toChainId}
                      onChange={handleToChainChange}
                      label="To chain"
                      isLoading={chainsLoading}
                    />
                  </Box>
                  <Box flex={1}>
                    <TokenSelector
                      tokens={toTokens}
                      selectedAddress={toToken?.address}
                      onChange={setToToken}
                      label="To token"
                      isLoading={toTokensLoading}
                      popularSymbols={POPULAR_PER_CHAIN[toChainId]}
                    />
                  </Box>
                </HStack>

                {sameChain && (
                  <Text fontSize="xs" color="bauhaus.red" fontWeight="bold" textAlign="center">
                    From and To chains must differ for a bridge.
                  </Text>
                )}

                {/* Loading / error / quote */}
                {isQuoteLoading && (
                  <HStack
                    bg="bauhaus.muted"
                    border="2px solid"
                    borderColor="bauhaus.border"
                    px={4}
                    py={3}
                    spacing={2}
                  >
                    <Spinner size="sm" />
                    <Text fontSize="sm" fontWeight="bold">
                      Fetching best route…
                    </Text>
                  </HStack>
                )}

                {!isQuoteLoading && quoteError && (
                  <Box
                    bg="bauhaus.muted"
                    border="2px solid"
                    borderColor="bauhaus.red"
                    px={4}
                    py={3}
                  >
                    <Text fontSize="sm" color="bauhaus.red" fontWeight="bold">
                      {quoteError}
                    </Text>
                  </Box>
                )}

                {!isQuoteLoading && !quoteError && quote && toToken && (
                  <BridgeQuoteDisplay quote={quote} outputToken={toToken} />
                )}

                {/* Bridge button */}
                {fromToken && (
                  <BridgeButton
                    inputAmount={inputAmountWei ?? "0"}
                    originChainId={fromChainId}
                    inputToken={fromToken.address}
                    quote={quote}
                    fetchFirmQuote={fetchFirmQuote}
                    onSubmitted={setSubmitted}
                    isAmountValid={!sameChain && isAmountValid && !!quote}
                  />
                )}

                {/* Status poller */}
                {submitted && (
                  <BridgeStatus
                    requestHash={submitted.requestHash}
                    txHash={submitted.txHash}
                    explorers={EXPLORERS}
                    chains={chains}
                  />
                )}
              </VStack>
            </Box>
          </Flex>
        </Container>
      </Box>
    </Box>
  );
}
