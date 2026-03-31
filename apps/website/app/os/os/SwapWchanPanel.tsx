"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  VStack,
  HStack,
  Text,
  Input,
  Box,
  Flex,
  Icon,
  Link,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  SliderMark,
} from "@chakra-ui/react";
import {
  useAccount,
  useBalance,
  useChainId,
  useSwitchChain,
  useReadContract,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { formatEther, formatUnits, parseUnits, erc20Abi } from "viem";
import { base } from "wagmi/chains";
import {
  DEFAULT_SLIPPAGE_BPS,
  getAddresses,
  type SwapDirection,
} from "../../../lib/wchan-swap";
import { ExternalLink } from "lucide-react";
import { WchanBuyContent } from "../../coins/components/WchanBuyContent";
import { useTokenData } from "../../contexts/TokenDataContext";
import { TOKEN_ADDRESS } from "../../constants";

const CHAIN_ID = base.id;
const ETH_PRESETS = ["1", "0.1", "0.01", "0.001"];

function ArrowDownIcon(props: React.ComponentProps<typeof Icon>) {
  return (
    <Icon viewBox="0 0 24 24" {...props}>
      <path
        fill="currentColor"
        d="M12 4v12.17l-4.59-4.58L6 13l6 6 6-6-1.41-1.41L12 16.17V4z"
      />
    </Icon>
  );
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  if (value > 0) return "<$0.01";
  return "$0.00";
}

export function SwapWchanPanel() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const isWrongChain = isConnected && chainId !== CHAIN_ID;

  const [sellAmount, setSellAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [ethUsdPrice, setEthUsdPrice] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<SwapDirection>("buy");
  const [sliderValue, setSliderValue] = useState(0);

  const { tokenData } = useTokenData();
  const wchanPrice = tokenData?.priceRaw ?? 0;

  // Fetch ETH/USD price
  useEffect(() => {
    let cancelled = false;
    async function fetchPrice() {
      try {
        const res = await fetch("/api/eth-price");
        const data = await res.json();
        if (!cancelled && data?.ethereum?.usd) {
          setEthUsdPrice(data.ethereum.usd);
        }
      } catch {
        // ignore
      }
    }
    fetchPrice();
    return () => {
      cancelled = true;
    };
  }, []);

  // ETH balance
  const { data: ethBalance, refetch: refetchBalance } = useBalance({
    address,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  });

  // WCHAN balance
  const wchanAddrs = getAddresses(CHAIN_ID);
  const { data: wchanBalance, refetch: refetchWchanBalance } = useReadContract({
    address: wchanAddrs.wchan,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  });

  const sellAmountValid = useMemo(() => {
    if (!sellAmount) return false;
    const num = parseFloat(sellAmount);
    return !isNaN(num) && num > 0;
  }, [sellAmount]);

  const formattedBalance = ethBalance
    ? parseFloat(formatEther(ethBalance.value)).toFixed(4)
    : null;

  const formattedWchanBalance =
    wchanBalance !== undefined
      ? parseFloat(formatEther(wchanBalance as bigint)).toFixed(4)
      : null;

  const handleSellAmountChange = useCallback(
    (val: string) => {
      if (val === "" || /^\d*\.?\d*$/.test(val)) {
        setSellAmount(val);
        if (
          activeTab === "sell" &&
          wchanBalance !== undefined &&
          (wchanBalance as bigint) > 0n
        ) {
          if (val === "" || parseFloat(val) === 0) {
            setSliderValue(0);
          } else {
            try {
              const parsed = parseUnits(val, 18);
              const bal = wchanBalance as bigint;
              const pct = Number((parsed * 100n) / bal);
              setSliderValue(Math.min(pct, 100));
            } catch {
              setSliderValue(0);
            }
          }
        }
      }
    },
    [activeTab, wchanBalance]
  );

  const handleMaxClick = useCallback(() => {
    if (activeTab === "sell") {
      if (wchanBalance !== undefined) {
        const bal = wchanBalance as bigint;
        if (bal > 0n) {
          setSellAmount(parseFloat(formatEther(bal)).toString());
          setSliderValue(100);
        }
      }
    } else if (ethBalance) {
      const max = ethBalance.value - BigInt(5e15);
      if (max > 0n) {
        setSellAmount(parseFloat(formatEther(max)).toString());
      }
    }
  }, [ethBalance, wchanBalance, activeTab]);

  const handleTxConfirmed = useCallback(() => {
    refetchBalance();
    refetchWchanBalance();
  }, [refetchBalance, refetchWchanBalance]);

  return (
    <Box h="100%" overflowY="auto" bg="white">
      <VStack spacing={5} align="stretch" p={5} pb={8}>
        {/* Heading */}
        <Text
          fontSize="lg"
          fontWeight="900"
          textTransform="uppercase"
          letterSpacing="wide"
          textAlign="center"
        >
          Swap $WCHAN
        </Text>

        {/* Buy/Sell tabs */}
        <HStack spacing={0}>
          {(["buy", "sell"] as const).map((tab) => (
            <Box
              key={tab}
              as="button"
              flex={1}
              py={2}
              bg={activeTab === tab ? "bauhaus.black" : "white"}
              color={activeTab === tab ? "white" : "bauhaus.black"}
              border="2px solid"
              borderColor="bauhaus.black"
              borderRight={tab === "buy" ? "none" : undefined}
              fontSize="sm"
              fontWeight="900"
              textTransform="uppercase"
              letterSpacing="wide"
              onClick={() => {
                if (activeTab !== tab) {
                  setActiveTab(tab);
                  setSellAmount("");
                  setSliderValue(0);
                }
              }}
              _hover={{
                bg: activeTab === tab ? "bauhaus.black" : "gray.100",
              }}
            >
              {tab}
            </Box>
          ))}
        </HStack>

        {/* You Pay */}
        <Box>
          <Box>
            <HStack justify="space-between" mb={2}>
              <Text
                fontSize="xs"
                fontWeight="bold"
                textTransform="uppercase"
                letterSpacing="widest"
              >
                You Pay
              </Text>
              {isConnected &&
                (activeTab === "sell"
                  ? formattedWchanBalance && (
                      <HStack spacing={1}>
                        <Text
                          fontSize="xs"
                          color="gray.500"
                          fontWeight="medium"
                        >
                          Balance: {formattedWchanBalance} WCHAN
                        </Text>
                        <Box
                          as="button"
                          fontSize="xs"
                          fontWeight="bold"
                          color="bauhaus.blue"
                          textTransform="uppercase"
                          onClick={handleMaxClick}
                          _hover={{ textDecoration: "underline" }}
                        >
                          Max
                        </Box>
                      </HStack>
                    )
                  : formattedBalance && (
                      <HStack spacing={1}>
                        <Text
                          fontSize="xs"
                          color="gray.500"
                          fontWeight="medium"
                        >
                          Balance: {formattedBalance} ETH
                        </Text>
                        <Box
                          as="button"
                          fontSize="xs"
                          fontWeight="bold"
                          color="bauhaus.blue"
                          textTransform="uppercase"
                          onClick={handleMaxClick}
                          _hover={{ textDecoration: "underline" }}
                        >
                          Max
                        </Box>
                      </HStack>
                    ))}
            </HStack>
            <HStack
              border="2px solid"
              borderColor="bauhaus.border"
              p={3}
              spacing={3}
            >
              <Input
                placeholder="0.0"
                value={sellAmount}
                onChange={(e) => handleSellAmountChange(e.target.value)}
                border="none"
                _focus={{ boxShadow: "none" }}
                fontSize="xl"
                fontWeight="black"
                p={0}
                flex={1}
              />
              {activeTab === "sell"
                ? sellAmountValid &&
                  wchanPrice > 0 && (
                    <Text
                      fontSize="xs"
                      fontWeight="700"
                      color="gray.400"
                      whiteSpace="nowrap"
                      flexShrink={0}
                    >
                      ≈ {formatUsd(parseFloat(sellAmount) * wchanPrice)}
                    </Text>
                  )
                : sellAmountValid &&
                  ethUsdPrice && (
                    <Text
                      fontSize="xs"
                      fontWeight="700"
                      color="gray.400"
                      whiteSpace="nowrap"
                      flexShrink={0}
                    >
                      ≈ $
                      {(
                        parseFloat(sellAmount) * ethUsdPrice
                      ).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                  )}
            </HStack>

            {/* Sell mode: WCHAN percentage slider */}
            {activeTab === "sell" &&
              wchanBalance !== undefined &&
              (wchanBalance as bigint) > 0n && (
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
                        (s) => Math.abs(val - s) <= SNAP_THRESHOLD
                      );
                      const snapped = nearest !== undefined ? nearest : val;
                      setSliderValue(snapped);
                      if (snapped === 0) {
                        setSellAmount("");
                      } else {
                        const bal = wchanBalance as bigint;
                        const pctAmount = (bal * BigInt(snapped)) / 100n;
                        setSellAmount(formatUnits(pctAmount, 18));
                      }
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

            {/* Buy mode: ETH preset buttons */}
            {activeTab === "buy" && (
              <HStack spacing={{ base: 1, sm: 2 }} mt={2}>
                {ETH_PRESETS.map((preset) => (
                  <Box
                    key={preset}
                    as="button"
                    flex={1}
                    py={1}
                    px={1}
                    border="2px solid"
                    borderColor={
                      sellAmount === preset ? "bauhaus.blue" : "bauhaus.black"
                    }
                    bg={sellAmount === preset ? "bauhaus.blue" : "white"}
                    color={sellAmount === preset ? "white" : "bauhaus.black"}
                    fontSize={{ base: "10px", sm: "xs" }}
                    fontWeight="800"
                    textAlign="center"
                    textTransform="uppercase"
                    whiteSpace="nowrap"
                    onClick={() => setSellAmount(preset)}
                    _hover={{
                      bg:
                        sellAmount === preset ? "bauhaus.blue" : "gray.100",
                    }}
                  >
                    {preset} ETH
                  </Box>
                ))}
              </HStack>
            )}
          </Box>

          {/* Arrow separator */}
          <Flex justify="center" mt={3} zIndex={2} position="relative">
            <Flex
              w={8}
              h={8}
              bg="bauhaus.blue"
              color="white"
              align="center"
              justify="center"
              border="3px solid white"
            >
              <ArrowDownIcon boxSize={4} />
            </Flex>
          </Flex>
        </Box>

        {/* WchanBuyContent handles: You Receive, quote, swap button */}
        <WchanBuyContent
          direction={activeTab}
          sellAmount={sellAmount}
          sellAmountValid={sellAmountValid}
          slippageBps={slippageBps}
          onSlippageChange={setSlippageBps}
          outputTokenSymbol={activeTab === "buy" ? "WCHAN" : "ETH"}
          inputBalanceWei={
            activeTab === "buy"
              ? ethBalance?.value
              : (wchanBalance as bigint | undefined)
          }
          onTxConfirmed={handleTxConfirmed}
        />

        {/* Token link */}
        <Flex justify="center">
          <Link
            href={`https://basescan.org/token/${TOKEN_ADDRESS}`}
            isExternal
            display="inline-flex"
            alignItems="center"
            gap={1}
            fontSize="xs"
            fontWeight="700"
            color="gray.500"
            _hover={{ color: "bauhaus.blue" }}
          >
            $WCHAN
            <ExternalLink size={12} />
          </Link>
        </Flex>
      </VStack>
    </Box>
  );
}
