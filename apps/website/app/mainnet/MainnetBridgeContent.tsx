"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Container,
  VStack,
  HStack,
  Text,
  Button,
  Input,
  Flex,
  Link,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  SliderMark,
  Spinner,
  Image,
  useToast,
  useClipboard,
} from "@chakra-ui/react";
import {
  AlertTriangle,
  ExternalLink,
  ArrowUpRight,
  Copy,
  Check,
} from "lucide-react";
import { useBridgeHistory } from "./useBridgeHistory";
import { BridgeHistoryWidget } from "./BridgeHistoryButton";
import { mainnetHref } from "./useMainnetUrl";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { base } from "wagmi/chains";
import { WCHAN_TOKEN_ADDRESS } from "@walletchan/shared/contracts";
import { Navigation } from "../components/Navigation";
import { Footer } from "../components/Footer";
import { WCHAN_L1_ETH_MAINNET } from "../constants";
import { useTokenData } from "../contexts/TokenDataContext";
import { erc20Abi, l2StandardBridgeAbi } from "./abi";

const TARGET_CHAIN_ID = base.id; // 8453
const WCHAN_ADDR = WCHAN_TOKEN_ADDRESS as `0x${string}`;
const WCHAN_L1_ADDR = WCHAN_L1_ETH_MAINNET as `0x${string}`;
const L2_BRIDGE_ADDR = "0x4200000000000000000000000000000000000010" as const;

function formatBalance(raw: bigint | undefined, decimals: number = 18): string {
  if (!raw) return "0";
  const formatted = formatUnits(raw, decimals);
  const num = parseFloat(formatted);
  if (num === 0) return "0";
  if (num < 0.01) return "<0.01";
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function TokenAddressCard({
  chainLabel,
  address,
  explorer,
  accentColor,
}: {
  chainLabel: string;
  address: string;
  explorer: string;
  accentColor: string;
}) {
  const { hasCopied, onCopy } = useClipboard(address);
  return (
    <Box
      bg="white"
      border="4px solid"
      borderColor="bauhaus.border"
      boxShadow="6px 6px 0px 0px #121212"
      p={{ base: 4, md: 5 }}
      flex={1}
      minW={0}
      position="relative"
      _hover={{ transform: "translateY(-2px)" }}
      transition="transform 0.2s ease-out"
    >
      {/* Geometric decorator */}
      <Box
        position="absolute"
        top={2}
        right={2}
        w={2.5}
        h={2.5}
        bg={accentColor}
        borderRadius="full"
      />
      <VStack spacing={3} align="stretch">
        <Text
          fontSize="xs"
          fontWeight="900"
          textTransform="uppercase"
          letterSpacing="widest"
          color={accentColor}
        >
          {chainLabel}
        </Text>
        <HStack spacing={0}>
          <Flex
            px={3}
            py={2}
            bg="gray.50"
            border="3px solid"
            borderColor="bauhaus.border"
            borderRight="none"
            align="center"
            flex={1}
            minW={0}
          >
            <Text
              fontFamily="mono"
              fontSize={{ base: "2xs", md: "xs" }}
              fontWeight="medium"
              isTruncated
            >
              {address}
            </Text>
          </Flex>
          <Flex
            as="button"
            onClick={onCopy}
            bg={hasCopied ? "bauhaus.red" : accentColor}
            minW="36px"
            align="center"
            justify="center"
            alignSelf="stretch"
            border="3px solid"
            borderColor="bauhaus.border"
            borderRight="none"
            px={2}
            cursor="pointer"
            _hover={{ opacity: 0.85 }}
            transition="all 0.15s ease-out"
          >
            {hasCopied ? (
              <Check size={14} stroke="white" />
            ) : (
              <Copy size={14} stroke="white" />
            )}
          </Flex>
          <Link
            href={`${explorer}/address/${address}`}
            isExternal
            display="flex"
            alignItems="center"
            justifyContent="center"
            bg={accentColor}
            minW="36px"
            alignSelf="stretch"
            border="3px solid"
            borderColor="bauhaus.border"
            px={2}
            _hover={{ opacity: 0.85 }}
            transition="all 0.15s ease-out"
          >
            <ExternalLink size={14} stroke="white" />
          </Link>
        </HStack>
      </VStack>
    </Box>
  );
}

function TokenAddresses() {
  return (
    <Flex gap={{ base: 4, md: 6 }} direction={{ base: "column", md: "row" }}>
      <TokenAddressCard
        chainLabel="WCHAN on Base"
        address={WCHAN_ADDR}
        explorer="https://basescan.org"
        accentColor="bauhaus.blue"
      />
      <TokenAddressCard
        chainLabel="WCHAN on Ethereum"
        address={WCHAN_L1_ADDR}
        explorer="https://etherscan.io"
        accentColor="bauhaus.red"
      />
    </Flex>
  );
}

export default function MainnetBridgeContent() {
  const toast = useToast();
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [sliderValue, setSliderValue] = useState(0);
  const bridgeHistory = useBridgeHistory();
  const { addEntry } = bridgeHistory;

  // Wallet
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const isWrongChain = isConnected && chainId !== TARGET_CHAIN_ID;

  // WCHAN price (same as BNKRW at 1:1)
  const { tokenData } = useTokenData();
  const tokenPrice = tokenData?.priceRaw ?? 0;

  // WCHAN balance on Base
  const { data: wchanBalance, refetch: refetchBalance } = useReadContract({
    address: WCHAN_ADDR,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 2000 },
  });

  // WCHAN allowance for L2 Bridge
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: WCHAN_ADDR,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, L2_BRIDGE_ADDR] : undefined,
    chainId: TARGET_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 2000 },
  });

  const parsedAmount =
    amount && parseFloat(amount) > 0 ? parseUnits(amount, 18) : undefined;

  const needsApproval =
    parsedAmount !== undefined &&
    allowance !== undefined &&
    (allowance as bigint) < parsedAmount;

  const hasInsufficientBalance =
    parsedAmount !== undefined &&
    wchanBalance !== undefined &&
    parsedAmount > (wchanBalance as bigint);

  // Approve
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: isApproving,
    reset: resetApprove,
  } = useWriteContract();

  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  // Bridge
  const {
    writeContract: writeBridge,
    data: bridgeTxHash,
    isPending: isBridging,
    reset: resetBridge,
  } = useWriteContract();

  const { isLoading: isBridgeConfirming, isSuccess: isBridgeConfirmed } =
    useWaitForTransactionReceipt({ hash: bridgeTxHash });

  const isBusy =
    isApproving || isApproveConfirming || isBridging || isBridgeConfirming;

  // After approve confirms
  useEffect(() => {
    if (isApproveConfirmed) {
      refetchAllowance().then(() => {
        toast({
          title: "Approval confirmed",
          description: "You can now bridge your WCHAN.",
          status: "success",
          duration: 3000,
          isClosable: true,
          position: "bottom-right",
        });
        resetApprove();
      });
    }
  }, [isApproveConfirmed, refetchAllowance, toast, resetApprove]);

  // Toast on bridge tx submitted
  useEffect(() => {
    if (bridgeTxHash) {
      toast({
        title: "Bridge transaction submitted",
        description: (
          <>
            Bridging WCHAN to Ethereum Mainnet.{" "}
            <a
              href={`https://basescan.org/tx/${bridgeTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "underline" }}
            >
              View on BaseScan
            </a>
          </>
        ),
        status: "info",
        duration: 10000,
        isClosable: true,
        position: "bottom-right",
      });
    }
  }, [bridgeTxHash, toast]);

  // After bridge confirms
  useEffect(() => {
    if (isBridgeConfirmed && bridgeTxHash) {
      addEntry(bridgeTxHash);
      refetchBalance();
      refetchAllowance();
      setAmount("");
      setSliderValue(0);
      toast({
        title: "Bridge successful",
        description:
          "Withdrawal initiated! You can prove it in ~1 hour. Redirecting to claim page...",
        status: "success",
        duration: 5000,
        isClosable: true,
        position: "bottom-right",
      });
      resetBridge();
      // Navigate to claim page after a short delay so toast is visible
      setTimeout(() => {
        router.push(mainnetHref(`/mainnet/claim?tx=${bridgeTxHash}`));
      }, 1500);
    }
  }, [
    isBridgeConfirmed,
    bridgeTxHash,
    refetchBalance,
    refetchAllowance,
    toast,
    resetBridge,
    addEntry,
    router,
  ]);

  const handleAmountChange = (val: string) => {
    if (val === "" || /^\d*\.?\d*$/.test(val)) {
      setAmount(val);
      if (
        val === "" ||
        parseFloat(val) === 0 ||
        !wchanBalance ||
        (wchanBalance as bigint) === 0n
      ) {
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
  };

  const handleApprove = useCallback(() => {
    writeApprove(
      {
        address: WCHAN_ADDR,
        abi: erc20Abi,
        functionName: "approve",
        args: [L2_BRIDGE_ADDR, parsedAmount!],
        chainId: TARGET_CHAIN_ID,
      },
      {
        onError: (err) => {
          toast({
            title: "Approval failed",
            description: err.message.split("\n")[0],
            status: "error",
            duration: 5000,
            isClosable: true,
            position: "bottom-right",
          });
        },
      },
    );
  }, [writeApprove, parsedAmount, toast]);

  const handleBridge = useCallback(() => {
    if (!parsedAmount) return;
    writeBridge(
      {
        address: L2_BRIDGE_ADDR,
        abi: l2StandardBridgeAbi,
        functionName: "bridgeERC20",
        args: [WCHAN_ADDR, WCHAN_L1_ADDR, parsedAmount, 0, "0x00"],
        chainId: TARGET_CHAIN_ID,
      },
      {
        onError: (err) => {
          toast({
            title: "Bridge failed",
            description: err.message.split("\n")[0],
            status: "error",
            duration: 5000,
            isClosable: true,
            position: "bottom-right",
          });
        },
      },
    );
  }, [writeBridge, parsedAmount, toast]);

  const handleAction = () => {
    if (needsApproval) {
      handleApprove();
    } else {
      handleBridge();
    }
  };

  const getButtonLabel = (): string => {
    if (isApproving || isApproveConfirming) return "Approving...";
    if (isBridging || isBridgeConfirming) return "Bridging...";
    if (needsApproval) return "Approve WCHAN";
    return "Bridge to Ethereum";
  };

  return (
    <Box minH="100vh" bg="bauhaus.background">
      <Navigation />

      <Container maxW="2xl" px={{ base: 4, md: 6 }} py={{ base: 8, md: 16 }}>
        <VStack spacing={6} align="stretch">
          {/* Header */}
          <Box position="relative">
            <VStack spacing={2}>
              <Text
                fontSize={{ base: "2xl", md: "3xl" }}
                fontWeight="900"
                textTransform="uppercase"
                letterSpacing="tight"
                textAlign="center"
              >
                Bridge WCHAN to ETH Mainnet
              </Text>
              <Text
                fontSize="sm"
                fontWeight="700"
                color="gray.500"
                textTransform="uppercase"
                letterSpacing="wide"
                textAlign="center"
              >
                (Return to Mainnet)
              </Text>
            </VStack>
            <Box position="absolute" right={0} top={0}>
              <BridgeHistoryWidget history={bridgeHistory} />
            </Box>
          </Box>

          {/* Connect Wallet */}
          <Flex justify="center">
            <ConnectButton />
          </Flex>

          {/* Wrong Network Banner */}
          {isWrongChain && (
            <HStack
              justify="center"
              spacing={3}
              bg="bauhaus.red"
              border="3px solid"
              borderColor="bauhaus.black"
              px={4}
              py={3}
            >
              <AlertTriangle size={18} color="white" />
              <Text
                fontSize="sm"
                fontWeight="800"
                textTransform="uppercase"
                letterSpacing="wide"
                color="white"
              >
                Wrong Network
              </Text>
              <Button
                size="sm"
                bg="white"
                color="bauhaus.black"
                fontWeight="900"
                textTransform="uppercase"
                letterSpacing="wide"
                borderRadius={0}
                border="2px solid"
                borderColor="bauhaus.black"
                _hover={{ bg: "gray.100" }}
                onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
                leftIcon={
                  <Image src="/images/base.svg" alt="Base" w="18px" h="18px" />
                }
              >
                Switch to Base
              </Button>
            </HStack>
          )}

          {/* Main Card */}
          <Box
            bg="white"
            border="4px solid"
            borderColor="bauhaus.border"
            boxShadow="8px 8px 0px 0px #121212"
            p={{ base: 5, md: 8 }}
          >
            <VStack spacing={6} align="stretch">
              {/* Amount Input */}
              <VStack spacing={2} align="stretch">
                <Flex justify="space-between" w="full" align="center">
                  <Text
                    fontSize="xs"
                    fontWeight="800"
                    textTransform="uppercase"
                    letterSpacing="widest"
                  >
                    Amount
                  </Text>
                  {isConnected && (
                    <HStack spacing={1}>
                      <Text fontSize="xs" fontWeight="700" color="gray.500">
                        Balance:
                      </Text>
                      <Text fontSize="xs" fontWeight="900">
                        {formatBalance(wchanBalance as bigint | undefined)}{" "}
                        WCHAN
                      </Text>
                    </HStack>
                  )}
                </Flex>
                <Flex
                  border="3px solid"
                  borderColor={
                    hasInsufficientBalance ? "red.400" : "bauhaus.black"
                  }
                  align="center"
                  px={4}
                  h="60px"
                >
                  <Input
                    value={amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="0.0"
                    border="none"
                    borderRadius={0}
                    fontWeight="900"
                    fontSize="xl"
                    h="full"
                    p={0}
                    flex={1}
                    _focus={{ boxShadow: "none" }}
                    _placeholder={{ color: "gray.400" }}
                    isDisabled={isBusy}
                  />
                  <HStack spacing={3} flexShrink={0} ml={3}>
                    {amount && parseFloat(amount) > 0 && tokenPrice > 0 && (
                      <Text fontSize="xs" fontWeight="700" color="gray.400">
                        ≈ {formatUsd(parseFloat(amount) * tokenPrice)}
                      </Text>
                    )}
                    <Text
                      fontSize="sm"
                      fontWeight="900"
                      color="gray.400"
                      textTransform="uppercase"
                    >
                      WCHAN
                    </Text>
                  </HStack>
                </Flex>
                {hasInsufficientBalance && (
                  <Text fontSize="xs" color="red.500" fontWeight="700">
                    Insufficient balance
                  </Text>
                )}
              </VStack>

              {/* Slider */}
              {isConnected &&
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
                          (s) => Math.abs(val - s) <= SNAP_THRESHOLD,
                        );
                        const snapped = nearest !== undefined ? nearest : val;
                        setSliderValue(snapped);
                        if (snapped === 0) {
                          setAmount("");
                        } else {
                          const bal = wchanBalance as bigint;
                          const pctAmount = (bal * BigInt(snapped)) / 100n;
                          setAmount(formatUnits(pctAmount, 18));
                        }
                      }}
                      isDisabled={isBusy}
                    >
                      {[0, 25, 50, 75, 100].map((pct) => (
                        <SliderMark
                          key={pct}
                          value={pct}
                          mt={3}
                          fontSize="xs"
                          fontWeight="800"
                          color={
                            sliderValue >= pct ? "bauhaus.blue" : "gray.400"
                          }
                          ml={pct === 100 ? "-2.5" : pct === 0 ? "0" : "-1"}
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
                      />
                    </Slider>
                  </Box>
                )}

              {/* Tx Status */}
              {(approveTxHash || bridgeTxHash) && (
                <HStack
                  w="full"
                  justify="center"
                  spacing={2}
                  bg="gray.50"
                  border="2px solid"
                  borderColor="gray.200"
                  px={4}
                  py={2}
                >
                  {(isApproveConfirming || isBridgeConfirming) && (
                    <>
                      <Spinner size="xs" color="bauhaus.blue" />
                      <Text
                        fontSize="xs"
                        fontWeight="700"
                        color="gray.500"
                        textTransform="uppercase"
                      >
                        Confirming...
                      </Text>
                    </>
                  )}
                  <Link
                    href={`https://basescan.org/tx/${approveTxHash || bridgeTxHash}`}
                    isExternal
                    fontSize="xs"
                    fontWeight="700"
                    color="bauhaus.blue"
                    textTransform="uppercase"
                    display="inline-flex"
                    alignItems="center"
                    gap={1}
                  >
                    View on BaseScan
                    <ExternalLink size={10} />
                  </Link>
                </HStack>
              )}

              {/* Action Button */}
              <Button
                w="full"
                variant={needsApproval ? "yellow" : "secondary"}
                size="lg"
                h="52px"
                isDisabled={
                  !isConnected ||
                  !amount ||
                  parseFloat(amount) <= 0 ||
                  hasInsufficientBalance ||
                  isBusy ||
                  isWrongChain
                }
                isLoading={isBusy}
                loadingText={getButtonLabel()}
                onClick={handleAction}
                leftIcon={
                  needsApproval ? undefined : <ArrowUpRight size={18} />
                }
              >
                {getButtonLabel()}
              </Button>

              {!isConnected && (
                <Text
                  fontSize="xs"
                  fontWeight="700"
                  color="gray.400"
                  textAlign="center"
                  textTransform="uppercase"
                >
                  Connect wallet to bridge
                </Text>
              )}
            </VStack>
          </Box>
          {/* Claim link */}
          <Link
            href={mainnetHref("/mainnet/claim")}
            display="flex"
            alignItems="center"
            justifyContent="center"
            gap={2}
            fontSize="sm"
            fontWeight="800"
            color="bauhaus.blue"
            textTransform="uppercase"
            letterSpacing="wide"
            _hover={{ color: "bauhaus.red", textDecoration: "none" }}
          >
            Already bridged? Claim tokens on Mainnet
            <ArrowUpRight size={16} />
          </Link>

          {/* Token Addresses */}
          <TokenAddresses />
        </VStack>
      </Container>

      <Footer />
    </Box>
  );
}
