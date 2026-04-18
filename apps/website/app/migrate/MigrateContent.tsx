"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Box,
  Container,
  VStack,
  HStack,
  Text,
  Button,
  Input,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  SliderMark,
  Flex,
  Image,
  Link,
  Spinner,
  SimpleGrid,
  Icon,
  useToast,
  useClipboard,
} from "@chakra-ui/react";
import { motion, useInView } from "framer-motion";
import {
  AlertTriangle,
  ExternalLink,
  Zap,
  Hash,
  ArrowLeftRight,
  KeyRound,
  Globe,
  Copy,
  Check,
} from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useCapabilities,
  useSendCalls,
  useCallsStatus,
} from "wagmi";
import { formatUnits, parseUnits, encodeFunctionData, maxUint256 } from "viem";
import { Navigation } from "../components/Navigation";
import { TokenBanner } from "../components/TokenBanner";
import { Footer } from "../components/Footer";
import { useTokenData } from "../contexts/TokenDataContext";
import { erc20Abi, wchanAbi } from "./abi";
import {
  MIGRATE_CHAIN_ID,
  BNKRW_TOKEN_ADDRESS,
  WCHAN_TOKEN_ADDRESS,
} from "./constants";
import {
  GECKOTERMINAL_EMBED_URL_30s,
  BNKRW_GECKOTERMINAL_EMBED_URL,
} from "../constants";

const MotionBox = motion(Box);

const TOKEN_ADDR = BNKRW_TOKEN_ADDRESS as `0x${string}`;
const WCHAN_ADDR = WCHAN_TOKEN_ADDRESS as `0x${string}`;

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

export default function MigrateContent() {
  const [amount, setAmount] = useState("");
  const [sliderValue, setSliderValue] = useState(0);
  const headingRef = useRef(null);
  const isHeadingInView = useInView(headingRef, { once: true });
  const infoRef = useRef(null);
  const isInfoInView = useInView(infoRef, { once: true, margin: "-100px" });
  const toast = useToast();
  const { onCopy: onCopyWchan, hasCopied: hasCopiedWchan } =
    useClipboard(WCHAN_TOKEN_ADDRESS);

  // Wallet
  const { address, isConnected: isWalletConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const isWrongChain = isWalletConnected && chainId !== MIGRATE_CHAIN_ID;

  // Token price (WCHAN = BNKRW at 1:1)
  const { tokenData } = useTokenData();
  const tokenPrice = tokenData?.priceRaw ?? 0;

  // BNKRW balance
  const { data: bnkrwBalance, refetch: refetchBnkrw } = useReadContract({
    address: TOKEN_ADDR,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: MIGRATE_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 2000 },
  });

  // WCHAN balance
  const { data: wchanBalance, refetch: refetchWchan } = useReadContract({
    address: WCHAN_ADDR,
    abi: wchanAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: MIGRATE_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 2000 },
  });

  // BNKRW allowance for WCHAN contract
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: TOKEN_ADDR,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, WCHAN_ADDR] : undefined,
    chainId: MIGRATE_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 2000 },
  });

  // Parsed amount
  const parsedAmount =
    amount && parseFloat(amount) > 0 ? parseUnits(amount, 18) : undefined;

  // Write contracts
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: isApproving,
    reset: resetApprove,
  } = useWriteContract();

  const {
    writeContract: writeWrap,
    data: wrapTxHash,
    isPending: isWrapping,
    reset: resetWrap,
  } = useWriteContract();

  // Wait for tx receipts
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  const { isLoading: isWrapConfirming, isSuccess: isWrapConfirmed } =
    useWaitForTransactionReceipt({ hash: wrapTxHash });

  // ERC-5792 capability check: does the connected wallet support atomic batching?
  // When supported, we bundle approve (if needed) + wrap into a single popup.
  const { data: walletCapabilities } = useCapabilities({
    account: address,
    chainId: MIGRATE_CHAIN_ID,
    query: { enabled: !!address },
  });
  const atomicStatus = walletCapabilities?.atomic?.status;
  const supportsAtomicBatch =
    atomicStatus === "supported" || atomicStatus === "ready";

  // Batched approve+wrap via ERC-5792 sendCalls
  const {
    sendCalls: sendBatchedCalls,
    data: batchSendData,
    isPending: isBatchSending,
    reset: resetBatch,
  } = useSendCalls();
  const batchBundleId = batchSendData?.id;
  const { data: batchStatusData } = useCallsStatus({
    id: batchBundleId ?? "",
    query: {
      enabled: !!batchBundleId,
      refetchInterval: ({ state }) =>
        state.data?.status === "pending" || state.data?.status === undefined
          ? 1500
          : false,
    },
  });
  const batchStatus = batchStatusData?.status;
  const isBatchConfirming =
    !!batchBundleId &&
    (batchStatus === "pending" || batchStatus === undefined);
  const isBatchConfirmed = batchStatus === "success";
  const batchTxHash = batchStatusData?.receipts?.[0]?.transactionHash;

  // Derived state
  const needsApproval =
    parsedAmount !== undefined &&
    allowance !== undefined &&
    (allowance as bigint) < parsedAmount;

  const hasInsufficientBalance =
    parsedAmount !== undefined &&
    bnkrwBalance !== undefined &&
    parsedAmount > (bnkrwBalance as bigint);

  const isBusy =
    isApproving ||
    isApproveConfirming ||
    isWrapping ||
    isWrapConfirming ||
    isBatchSending ||
    isBatchConfirming;

  // After approve confirms, refetch allowance then reset
  useEffect(() => {
    if (isApproveConfirmed) {
      refetchAllowance().then(() => {
        toast({
          title: "Approval confirmed",
          description: "You can now migrate your BNKRW.",
          status: "success",
          duration: 3000,
          isClosable: true,
          position: "bottom-right",
        });
        resetApprove();
      });
    }
  }, [isApproveConfirmed, refetchAllowance, toast, resetApprove]);

  // After wrap confirms, refetch balances and reset
  useEffect(() => {
    if (isWrapConfirmed && wrapTxHash) {
      refetchBnkrw();
      refetchWchan();
      refetchAllowance();
      setAmount("");
      setSliderValue(0);
      const txUrl = `https://basescan.org/tx/${wrapTxHash}`;
      toast({
        title: "Migration successful",
        description: (
          <>
            Your BNKRW has been wrapped to WCHAN.{" "}
            <a
              href={txUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "underline" }}
            >
              View on BaseScan
            </a>
          </>
        ),
        status: "success",
        duration: 10000,
        isClosable: true,
        position: "bottom-right",
      });
      resetWrap();
    }
  }, [
    isWrapConfirmed,
    wrapTxHash,
    refetchBnkrw,
    refetchWchan,
    refetchAllowance,
    toast,
    resetWrap,
  ]);

  const handleAmountChange = (val: string) => {
    if (val === "" || /^\d*\.?\d*$/.test(val)) {
      setAmount(val);
      if (
        val === "" ||
        parseFloat(val) === 0 ||
        !bnkrwBalance ||
        (bnkrwBalance as bigint) === 0n
      ) {
        setSliderValue(0);
      } else {
        try {
          const parsed = parseUnits(val, 18);
          const bal = bnkrwBalance as bigint;
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
        address: TOKEN_ADDR,
        abi: erc20Abi,
        functionName: "approve",
        args: [WCHAN_ADDR, parsedAmount!],
        chainId: MIGRATE_CHAIN_ID,
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

  const handleWrap = useCallback(() => {
    if (!parsedAmount) return;
    writeWrap(
      {
        address: WCHAN_ADDR,
        abi: wchanAbi,
        functionName: "wrap",
        args: [parsedAmount],
        chainId: MIGRATE_CHAIN_ID,
      },
      {
        onError: (err) => {
          toast({
            title: "Migration failed",
            description: err.message.split("\n")[0],
            status: "error",
            duration: 5000,
            isClosable: true,
            position: "bottom-right",
          });
        },
      },
    );
  }, [parsedAmount, writeWrap, toast]);

  const handleBatchedMigrate = useCallback(() => {
    if (!parsedAmount) return;

    const calls: { to: `0x${string}`; value: bigint; data: `0x${string}` }[] =
      [];

    if (needsApproval) {
      // Use max approval in the bundle so a future top-up doesn't require a
      // second batch — same UX as a normal "approve once" pattern.
      calls.push({
        to: TOKEN_ADDR,
        value: 0n,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [WCHAN_ADDR, maxUint256],
        }),
      });
    }

    calls.push({
      to: WCHAN_ADDR,
      value: 0n,
      data: encodeFunctionData({
        abi: wchanAbi,
        functionName: "wrap",
        args: [parsedAmount],
      }),
    });

    sendBatchedCalls(
      {
        calls,
        chainId: MIGRATE_CHAIN_ID,
        forceAtomic: true,
      },
      {
        onError: (err) => {
          toast({
            title: "Migration failed",
            description: err.message.split("\n")[0],
            status: "error",
            duration: 5000,
            isClosable: true,
            position: "bottom-right",
          });
        },
      },
    );
  }, [parsedAmount, needsApproval, sendBatchedCalls, toast]);

  // After batched migrate confirms, refetch balances and reset
  const batchToastedRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      isBatchConfirmed &&
      batchBundleId &&
      batchToastedRef.current !== batchBundleId
    ) {
      batchToastedRef.current = batchBundleId;
      refetchBnkrw();
      refetchWchan();
      refetchAllowance();
      setAmount("");
      setSliderValue(0);
      const txUrl = batchTxHash
        ? `https://basescan.org/tx/${batchTxHash}`
        : undefined;
      toast({
        title: "Migration successful",
        description: (
          <>
            Your BNKRW has been wrapped to WCHAN.
            {txUrl && (
              <>
                {" "}
                <a
                  href={txUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: "underline" }}
                >
                  View on BaseScan
                </a>
              </>
            )}
          </>
        ),
        status: "success",
        duration: 10000,
        isClosable: true,
        position: "bottom-right",
      });
      resetBatch();
    }
  }, [
    isBatchConfirmed,
    batchBundleId,
    batchTxHash,
    refetchBnkrw,
    refetchWchan,
    refetchAllowance,
    toast,
    resetBatch,
  ]);

  const handleAction = () => {
    if (supportsAtomicBatch) {
      handleBatchedMigrate();
    } else if (needsApproval) {
      handleApprove();
    } else {
      handleWrap();
    }
  };

  const getButtonLabel = (): string => {
    if (isBatchSending || isBatchConfirming) return "Migrating...";
    if (isApproving || isApproveConfirming) return "Approving...";
    if (isWrapping || isWrapConfirming) return "Migrating...";
    if (needsApproval && !supportsAtomicBatch) return "Approve BNKRW";
    return "Migrate";
  };

  return (
    <Box minH="100vh" bg="bauhaus.background">
      <Navigation />
      <TokenBanner />

      <Container maxW="7xl" pt={1} pb={40}>
        <VStack spacing={6} align="stretch">
          {/* New Token, Same Vision Banner */}
          <Flex
            bg="bauhaus.blue"
            borderTop="6px solid"
            borderColor="bauhaus.black"
            px={{ base: 6, md: 10 }}
            py={{ base: 8, md: 10 }}
            align="center"
            justify="space-between"
          >
            <VStack spacing={3} align="flex-start">
              <HStack
                fontSize={{ base: "2xl", md: "3xl" }}
                fontWeight="900"
                textTransform="uppercase"
                letterSpacing="wider"
                color="bauhaus.yellow"
                lineHeight="1.1"
              >
                <Text color="black" bg="bauhaus.yellow">
                  New Ticker,
                </Text>
                <Text> Same Vision</Text>
              </HStack>
              <Text
                fontSize={{ base: "md", md: "lg" }}
                fontWeight="600"
                color="white"
              >
                AI Wallet for Humans + Bots
              </Text>
              <Box w="120px" h="4px" bg="bauhaus.yellow" mt={1} />
            </VStack>
            <Image
              src="/images/walletchan-icon-nobg.png"
              alt="WalletChan"
              boxSize={{ base: "60px", md: "90px" }}
              flexShrink={0}
              ml={4}
            />
          </Flex>

          {/* Header */}
          <VStack spacing={1} textAlign="center" ref={headingRef}>
            <MotionBox
              initial={{ opacity: 0, y: 20 }}
              animate={isHeadingInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5 }}
            >
              <HStack spacing={3} justify="center">
                <Box
                  w="16px"
                  h="16px"
                  bg="bauhaus.blue"
                  border="3px solid"
                  borderColor="bauhaus.black"
                  borderRadius="full"
                />
                <Text
                  fontSize={{ base: "2xl", md: "3xl" }}
                  fontWeight="900"
                  textTransform="uppercase"
                  letterSpacing="wider"
                >
                  Wrap 1:1 BNKRW to WCHAN
                </Text>
                <Box
                  w="16px"
                  h="16px"
                  bg="bauhaus.yellow"
                  border="3px solid"
                  borderColor="bauhaus.black"
                  transform="rotate(45deg)"
                />
              </HStack>
            </MotionBox>

            <Text fontSize="md" color="gray.600" maxW="500px" fontWeight="500">
              Migrate to a more{" "}
              <Text as="span" fontWeight="800">
                feature rich
              </Text>{" "}
              token: WalletChan ($WCHAN)
            </Text>
            <HStack spacing={2} justify="center">
              <Link
                href={`https://basescan.org/address/${WCHAN_TOKEN_ADDRESS}`}
                isExternal
                display="inline-flex"
                alignItems="center"
                gap={1}
                fontSize="xs"
                fontWeight="700"
                color="gray.500"
                _hover={{ color: "bauhaus.red" }}
              >
                WCHAN Contract
                <ExternalLink size={12} />
              </Link>
            </HStack>
          </VStack>

          {/* Connect Button */}
          <HStack justify="flex-end" maxW="lg" mx="auto" w="full">
            <Box
              sx={{
                "& button": {
                  borderRadius: "0 !important",
                  fontWeight: "bold !important",
                  textTransform: "uppercase",
                  fontFamily: "'Outfit', sans-serif !important",
                },
              }}
            >
              <ConnectButton
                chainStatus="none"
                showBalance={false}
                accountStatus="address"
              />
            </Box>
          </HStack>

          {/* Wrong Chain Banner */}
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
                onClick={() => switchChain({ chainId: MIGRATE_CHAIN_ID })}
                leftIcon={
                  <Image src="/images/base.svg" alt="Base" w="18px" h="18px" />
                }
              >
                Switch to Base
              </Button>
            </HStack>
          )}

          {/* Migrate Card */}
          <Box maxW="lg" mx="auto" w="full">
            <Box
              bg="white"
              border="4px solid"
              borderColor="bauhaus.black"
              boxShadow="8px 8px 0px 0px #121212"
              position="relative"
              overflow="hidden"
            >
              {/* Geometric decorator */}
              <Box
                position="absolute"
                top={-6}
                right={-6}
                w={16}
                h={16}
                bg="bauhaus.yellow"
                opacity={0.15}
                borderRadius="full"
              />
              <Box
                position="absolute"
                bottom={-4}
                left={-4}
                w={12}
                h={12}
                bg="bauhaus.red"
                opacity={0.1}
                transform="rotate(45deg)"
              />

              {/* Content */}
              <VStack spacing={5} p={6} position="relative" zIndex={1}>
                {/* BNKRW Balance display */}
                <Flex justify="space-between" w="full" align="center">
                  <Text
                    fontSize="xs"
                    fontWeight="800"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    color="gray.500"
                  >
                    Wrap BNKRW
                  </Text>
                  {isWalletConnected && (
                    <HStack spacing={1}>
                      <Text
                        fontSize="xs"
                        fontWeight="700"
                        color="gray.500"
                        textTransform="uppercase"
                        letterSpacing="wider"
                      >
                        Balance:
                      </Text>
                      <Text
                        fontSize="xs"
                        fontWeight="900"
                        color="bauhaus.black"
                      >
                        {formatBalance(bnkrwBalance as bigint | undefined)}{" "}
                        BNKRW
                      </Text>
                    </HStack>
                  )}
                </Flex>

                {/* Input */}
                <Box w="full">
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
                      isDisabled={isBusy}
                    />
                    <HStack spacing={3} flexShrink={0} ml={3}>
                      {amount && parseFloat(amount) > 0 && tokenPrice > 0 && (
                        <Text
                          fontSize="xs"
                          fontWeight="700"
                          color="gray.400"
                          whiteSpace="nowrap"
                        >
                          ≈ {formatUsd(parseFloat(amount) * tokenPrice)}
                        </Text>
                      )}
                      <Text
                        fontSize="sm"
                        fontWeight="900"
                        color="gray.400"
                        textTransform="uppercase"
                      >
                        BNKRW
                      </Text>
                    </HStack>
                  </Flex>

                  {/* Percentage slider */}
                  {isWalletConnected &&
                    bnkrwBalance !== undefined &&
                    (bnkrwBalance as bigint) > 0n && (
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
                            const snapped =
                              nearest !== undefined ? nearest : val;
                            setSliderValue(snapped);
                            if (snapped === 0) {
                              setAmount("");
                            } else {
                              const bal = bnkrwBalance as bigint;
                              const pctAmount = (bal * BigInt(snapped)) / 100n;
                              setAmount(formatUnits(pctAmount, 18));
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
                              color={
                                sliderValue >= pct ? "bauhaus.blue" : "gray.400"
                              }
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
                </Box>

                {/* Insufficient balance warning */}
                {hasInsufficientBalance && (
                  <Text
                    fontSize="xs"
                    fontWeight="700"
                    color="red.500"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    alignSelf="flex-start"
                  >
                    Insufficient BNKRW balance
                  </Text>
                )}

                {/* Tx status indicator */}
                {(approveTxHash || wrapTxHash || batchTxHash || isBatchConfirming) && (
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
                    {(isApproveConfirming || isWrapConfirming || isBatchConfirming) && (
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
                    {(approveTxHash || wrapTxHash || batchTxHash) && (
                      <Link
                        href={`https://basescan.org/tx/${batchTxHash || approveTxHash || wrapTxHash}`}
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
                    )}
                  </HStack>
                )}

                {/* Action Button */}
                {!isWalletConnected ? (
                  <Box
                    w="full"
                    sx={{
                      "& button": {
                        w: "full",
                        borderRadius: "0 !important",
                        fontWeight: "bold !important",
                        textTransform: "uppercase",
                        fontFamily: "'Outfit', sans-serif !important",
                        h: "52px",
                        fontSize: "md !important",
                      },
                    }}
                  >
                    <ConnectButton.Custom>
                      {({ openConnectModal }) => (
                        <Button
                          w="full"
                          variant="primary"
                          size="lg"
                          h="52px"
                          onClick={openConnectModal}
                        >
                          Connect Wallet
                        </Button>
                      )}
                    </ConnectButton.Custom>
                  </Box>
                ) : isWrongChain ? (
                  <Button
                    w="full"
                    variant="secondary"
                    size="lg"
                    h="52px"
                    onClick={() => switchChain({ chainId: MIGRATE_CHAIN_ID })}
                    leftIcon={
                      <Image
                        src="/images/base.svg"
                        alt="Base"
                        w="18px"
                        h="18px"
                      />
                    }
                  >
                    Switch to Base
                  </Button>
                ) : (
                  <Button
                    w="full"
                    variant={
                      needsApproval && !supportsAtomicBatch
                        ? "yellow"
                        : "secondary"
                    }
                    size="lg"
                    h="52px"
                    isDisabled={
                      !amount ||
                      parseFloat(amount) <= 0 ||
                      hasInsufficientBalance ||
                      isBusy
                    }
                    isLoading={isBusy}
                    loadingText={getButtonLabel()}
                    onClick={handleAction}
                  >
                    {getButtonLabel()}
                  </Button>
                )}

                {/* WCHAN Balance */}
                {isWalletConnected && (
                  <Flex
                    w="full"
                    justify="space-between"
                    bg="gray.50"
                    border="2px solid"
                    borderColor="gray.200"
                    px={4}
                    py={3}
                  >
                    <Text
                      fontSize="xs"
                      fontWeight="700"
                      color="gray.500"
                      textTransform="uppercase"
                      letterSpacing="wider"
                    >
                      Your WCHAN Balance
                    </Text>
                    <HStack spacing={2}>
                      {wchanBalance &&
                        (wchanBalance as bigint) > 0n &&
                        tokenPrice > 0 && (
                          <Text fontSize="xs" fontWeight="700" color="gray.400">
                            ≈{" "}
                            {formatUsd(
                              parseFloat(
                                formatUnits(wchanBalance as bigint, 18),
                              ) * tokenPrice,
                            )}
                          </Text>
                        )}
                      <Text
                        fontSize="xs"
                        fontWeight="900"
                        color="bauhaus.black"
                      >
                        {formatBalance(wchanBalance as bigint | undefined)}{" "}
                        WCHAN
                      </Text>
                    </HStack>
                  </Flex>
                )}
              </VStack>
            </Box>
          </Box>

          {/* Charts */}
          <Text
            fontSize={{ base: "xl", md: "2xl" }}
            fontWeight="900"
            textTransform="uppercase"
            letterSpacing="wider"
            textAlign="left"
            pt={{ base: 4, md: 6 }}
          >
            Same Marketcap across Tokens
          </Text>
          <Text fontSize="sm" fontWeight="500" color="gray.600" mt={-4}>
            $WCHAN is just a 1:1 wrapped version of $BNKRW
          </Text>
          <SimpleGrid
            columns={{ base: 1, md: 2 }}
            spacing={{ base: 4, md: 6 }}
            w="full"
          >
            <Box
              bg="bauhaus.black"
              border="4px solid"
              borderColor="bauhaus.black"
              p={{ base: 2, md: 4 }}
            >
              <Text
                color="bauhaus.yellow"
                fontSize="sm"
                fontWeight="900"
                textTransform="uppercase"
                letterSpacing="wider"
                mb={2}
              >
                $WCHAN
              </Text>
              <Box
                as="iframe"
                title="WCHAN GeckoTerminal"
                src={GECKOTERMINAL_EMBED_URL_30s}
                w="full"
                h={{ base: "300px", md: "400px" }}
                border="none"
                allow="clipboard-write"
                allowFullScreen
              />
            </Box>
            <Box
              bg="bauhaus.black"
              border="4px solid"
              borderColor="bauhaus.black"
              p={{ base: 2, md: 4 }}
            >
              <Text
                color="bauhaus.yellow"
                fontSize="sm"
                fontWeight="900"
                textTransform="uppercase"
                letterSpacing="wider"
                mb={2}
              >
                $BNKRW
              </Text>
              <Box
                as="iframe"
                title="BNKRW GeckoTerminal"
                src={BNKRW_GECKOTERMINAL_EMBED_URL}
                w="full"
                h={{ base: "300px", md: "400px" }}
                border="none"
                allow="clipboard-write"
                allowFullScreen
              />
            </Box>
          </SimpleGrid>

          {/* WCHAN Benefits Section */}
          <Text
            fontSize={{ base: "xl", md: "2xl" }}
            fontWeight="900"
            textTransform="uppercase"
            letterSpacing="wider"
            textAlign="left"
            pt={{ base: 4, md: 6 }}
          >
            $WCHAN Features
          </Text>
          <Box ref={infoRef} w="full">
            <MotionBox
              initial={{ opacity: 0, y: 30 }}
              animate={isInfoInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6 }}
            >
              {/* Benefits Grid */}
              <SimpleGrid
                columns={{ base: 1, md: 2 }}
                spacing={{ base: 4, md: 6 }}
              >
                {[
                  {
                    icon: Zap,
                    title: "x402 Enabled",
                    description:
                      "$WCHAN supports ERC-3009, allowing it to be used for x402 payments for our API endpoints in the future",
                    color: "bauhaus.red",
                  },
                  {
                    icon: Hash,
                    title: "Vanity Address",
                    description: "vanity",
                    color: "bauhaus.blue",
                  },
                  {
                    icon: ArrowLeftRight,
                    title: "Custom Uniswap V4 Hook",
                    description:
                      "Swap fees accumulate in ETH and a portion of it will be used for periodic buybacks via walletchan.eth",
                    color: "bauhaus.yellow",
                  },
                  {
                    icon: KeyRound,
                    title: "Multi-Wallet Support",
                    description:
                      "Not limited to a single Bankr address — import private keys or seed phrases and use any address!",
                    color: "bauhaus.red",
                  },
                  {
                    icon: Globe,
                    title: "Open Ecosystem",
                    description:
                      "Open to experimentation & integrations with other AI providers, instead of locking us into a single API",
                    color: "bauhaus.blue",
                  },
                ].map((benefit, i) => (
                  <MotionBox
                    key={benefit.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={isInfoInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.4, delay: 0.1 * (i + 1) }}
                    bg="white"
                    border={{ base: "2px solid", md: "4px solid" }}
                    borderColor="bauhaus.black"
                    boxShadow="6px 6px 0px 0px #121212"
                    position="relative"
                    overflow="hidden"
                    cursor="default"
                    _hover={{
                      transform: "translateY(-4px)",
                      boxShadow: "8px 10px 0px 0px #121212",
                    }}
                    sx={{
                      transition: "all 0.2s ease-out",
                    }}
                  >
                    <Flex h="full" flex={1}>
                      {/* Left accent bar */}
                      <Box
                        w={{ base: "6px", md: "8px" }}
                        bg={benefit.color}
                        flexShrink={0}
                      />
                      <Box p={{ base: 4, md: 5 }} flex={1}>
                        <HStack spacing={3} mb={3} align="center">
                          {/* Icon container */}
                          <Flex
                            w={{ base: "36px", md: "42px" }}
                            h={{ base: "36px", md: "42px" }}
                            align="center"
                            justify="center"
                            border="3px solid"
                            borderColor="bauhaus.black"
                            bg={benefit.color}
                            flexShrink={0}
                          >
                            <Icon
                              as={benefit.icon}
                              boxSize={{ base: 4, md: 5 }}
                              color="white"
                            />
                          </Flex>
                          <Text
                            fontSize={{ base: "sm", md: "md" }}
                            fontWeight="900"
                            textTransform="uppercase"
                            letterSpacing="wide"
                          >
                            {benefit.title}
                          </Text>
                        </HStack>

                        {benefit.description === "vanity" ? (
                          <VStack spacing={2} align="flex-start">
                            <Text
                              fontSize="sm"
                              color="gray.600"
                              fontWeight="500"
                            >
                              Deployed at a memorable vanity address for easy
                              recognition.
                            </Text>
                            <HStack
                              spacing={0}
                              bg="gray.50"
                              border="3px solid"
                              borderColor="bauhaus.black"
                              cursor="pointer"
                              onClick={onCopyWchan}
                              role="group"
                              w="full"
                              _hover={{
                                boxShadow: "3px 3px 0px 0px #121212",
                              }}
                              transition="all 0.15s ease-out"
                            >
                              <Flex
                                px={3}
                                py={2}
                                align="center"
                                flex={1}
                                minW={0}
                              >
                                <Text
                                  fontFamily="mono"
                                  fontSize={{
                                    base: "2xs",
                                    md: "2xs",
                                    lg: "sm",
                                  }}
                                  fontWeight="medium"
                                  isTruncated
                                >
                                  <Text
                                    as="span"
                                    fontWeight="black"
                                    color="bauhaus.blue"
                                    fontSize={{
                                      base: "xs",
                                      md: "xs",
                                      lg: "md",
                                    }}
                                  >
                                    0xBa5ED0000
                                  </Text>
                                  {WCHAN_TOKEN_ADDRESS.slice(11)}
                                </Text>
                              </Flex>
                              <Flex
                                bg={hasCopiedWchan ? "bauhaus.red" : "gray.400"}
                                minW="40px"
                                align="center"
                                justify="center"
                                alignSelf="stretch"
                                borderLeft="3px solid"
                                borderColor="bauhaus.black"
                                _groupHover={{
                                  bg: hasCopiedWchan
                                    ? "bauhaus.red"
                                    : "bauhaus.blue",
                                }}
                                transition="background 0.2s ease-out"
                              >
                                {hasCopiedWchan ? (
                                  <Check size={14} stroke="white" />
                                ) : (
                                  <Copy size={14} stroke="white" />
                                )}
                              </Flex>
                            </HStack>
                          </VStack>
                        ) : (
                          <Text fontSize="sm" color="gray.600" fontWeight="500">
                            {benefit.description}
                          </Text>
                        )}
                      </Box>
                    </Flex>
                  </MotionBox>
                ))}
              </SimpleGrid>
            </MotionBox>
          </Box>
        </VStack>
      </Container>
      <Footer />
    </Box>
  );
}
