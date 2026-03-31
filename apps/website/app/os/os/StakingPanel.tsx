"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Box,
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
  useToast,
} from "@chakra-ui/react";
import { AlertTriangle, ExternalLink } from "lucide-react";
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
import { useVaultData } from "../../contexts/VaultDataContext";
import { useTokenData } from "../../contexts/TokenDataContext";
import { erc20Abi, wchanVaultAbi } from "../../stake/abi";
import {
  STAKE_CHAIN_ID,
  WCHAN_VAULT_ADDR,
  WCHAN_TOKEN_ADDR,
} from "../../stake/constants";

type TabType = "deposit" | "withdraw";

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
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  if (value > 0) return "<$0.01";
  return "$0.00";
}

const PENALTY_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

export function StakingPanel() {
  const [activeTab, setActiveTab] = useState<TabType>("deposit");
  const [amount, setAmount] = useState("");
  const [sliderValue, setSliderValue] = useState(0);
  const toast = useToast();

  const { address, isConnected: isWalletConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const isWrongChain = isWalletConnected && chainId !== STAKE_CHAIN_ID;

  const {
    vaultData,
    isLoading: isVaultLoading,
    refetchVaultData,
  } = useVaultData();

  const { tokenData } = useTokenData();
  const tokenPrice = tokenData?.priceRaw ?? 0;

  // ETH price for WETH rewards USD display
  const [ethPrice, setEthPrice] = useState<number>(0);
  useEffect(() => {
    const fetchEthPrice = async () => {
      try {
        const res = await fetch("/api/eth-price");
        const data = await res.json();
        if (data?.ethereum?.usd) setEthPrice(data.ethereum.usd);
      } catch {
        // silent
      }
    };
    fetchEthPrice();
    const interval = setInterval(fetchEthPrice, 30_000);
    return () => clearInterval(interval);
  }, []);

  // WCHAN balance
  const { data: wchanBalance, refetch: refetchWchan } = useReadContract({
    address: WCHAN_TOKEN_ADDR,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: STAKE_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 2000 },
  });

  // sWCHAN (staked) balance
  const { data: stakedBalance, refetch: refetchStaked } = useReadContract({
    address: WCHAN_VAULT_ADDR,
    abi: wchanVaultAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: STAKE_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 2000 },
  });

  // WCHAN allowance for vault
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: WCHAN_TOKEN_ADDR,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, WCHAN_VAULT_ADDR] : undefined,
    chainId: STAKE_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 2000 },
  });

  // Penalty info
  const { data: penaltyBps } = useReadContract({
    address: WCHAN_VAULT_ADDR,
    abi: wchanVaultAbi,
    functionName: "getPenaltyBps",
    args: address ? [address] : undefined,
    chainId: STAKE_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  const { data: lastDepositTs } = useReadContract({
    address: WCHAN_VAULT_ADDR,
    abi: wchanVaultAbi,
    functionName: "lastDepositTimestamp",
    args: address ? [address] : undefined,
    chainId: STAKE_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  // Preview deposit (WCHAN -> sWCHAN)
  const parsedAmount =
    amount && parseFloat(amount) > 0 ? parseUnits(amount, 18) : undefined;

  const { data: previewShares } = useReadContract({
    address: WCHAN_VAULT_ADDR,
    abi: wchanVaultAbi,
    functionName: "previewDeposit",
    args: parsedAmount ? [parsedAmount] : undefined,
    chainId: STAKE_CHAIN_ID,
    query: { enabled: activeTab === "deposit" && !!parsedAmount },
  });

  // Preview redeem net (sWCHAN -> WCHAN, after penalty)
  const { data: previewAssetsNet } = useReadContract({
    address: WCHAN_VAULT_ADDR,
    abi: wchanVaultAbi,
    functionName: "previewRedeemNet",
    args: parsedAmount && address ? [parsedAmount, address] : undefined,
    chainId: STAKE_CHAIN_ID,
    query: {
      enabled: activeTab === "withdraw" && !!parsedAmount && !!address,
    },
  });

  // Write contracts
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: isApproving,
    reset: resetApprove,
  } = useWriteContract();

  const {
    writeContract: writeDeposit,
    data: depositTxHash,
    isPending: isDepositing,
    reset: resetDeposit,
  } = useWriteContract();

  const {
    writeContract: writeRedeem,
    data: redeemTxHash,
    isPending: isRedeeming,
    reset: resetRedeem,
  } = useWriteContract();

  // WETH rewards
  const { data: earnedWeth, refetch: refetchEarned } = useReadContract({
    address: WCHAN_VAULT_ADDR,
    abi: wchanVaultAbi,
    functionName: "earned",
    args: address ? [address] : undefined,
    chainId: STAKE_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  const {
    writeContract: writeClaim,
    data: claimTxHash,
    isPending: isClaiming,
    reset: resetClaim,
  } = useWriteContract();

  const { isLoading: isClaimConfirming, isSuccess: isClaimConfirmed } =
    useWaitForTransactionReceipt({ hash: claimTxHash });

  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  const { isLoading: isDepositConfirming, isSuccess: isDepositConfirmed } =
    useWaitForTransactionReceipt({ hash: depositTxHash });

  const { isLoading: isRedeemConfirming, isSuccess: isRedeemConfirmed } =
    useWaitForTransactionReceipt({ hash: redeemTxHash });

  // Derived state
  const currentBalance = activeTab === "deposit" ? wchanBalance : stakedBalance;
  const currentSymbol = activeTab === "deposit" ? "WCHAN" : "sWCHAN";

  const needsApproval =
    activeTab === "deposit" &&
    parsedAmount !== undefined &&
    allowance !== undefined &&
    (allowance as bigint) < parsedAmount;

  const hasInsufficientBalance =
    parsedAmount !== undefined &&
    currentBalance !== undefined &&
    parsedAmount > (currentBalance as bigint);

  const isBusy =
    isApproving ||
    isApproveConfirming ||
    isDepositing ||
    isDepositConfirming ||
    isRedeeming ||
    isRedeemConfirming;

  const penaltyPct =
    penaltyBps !== undefined ? Number(penaltyBps as bigint) / 100 : 0;

  const zeroPenaltyDate =
    lastDepositTs !== undefined && (lastDepositTs as bigint) > 0n
      ? new Date(
          (Number(lastDepositTs as bigint) + PENALTY_DURATION) * 1000
        )
      : null;

  // After approve confirms
  useEffect(() => {
    if (isApproveConfirmed) {
      refetchAllowance().then(() => {
        toast({
          title: "Approval confirmed",
          description: "You can now deposit your WCHAN.",
          status: "success",
          duration: 3000,
          isClosable: true,
          position: "bottom-right",
        });
        resetApprove();
      });
    }
  }, [isApproveConfirmed, refetchAllowance, toast, resetApprove]);

  // After deposit confirms
  useEffect(() => {
    if (isDepositConfirmed && depositTxHash) {
      refetchWchan();
      refetchStaked();
      refetchAllowance();
      refetchVaultData();
      setAmount("");
      const txUrl = `https://basescan.org/tx/${depositTxHash}`;
      toast({
        title: "Deposit successful",
        description: (
          <>
            Your WCHAN has been staked.{" "}
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
      resetDeposit();
    }
  }, [
    isDepositConfirmed,
    depositTxHash,
    refetchWchan,
    refetchStaked,
    refetchAllowance,
    refetchVaultData,
    toast,
    resetDeposit,
  ]);

  // After redeem confirms
  useEffect(() => {
    if (isRedeemConfirmed && redeemTxHash) {
      refetchWchan();
      refetchStaked();
      refetchVaultData();
      setAmount("");
      const txUrl = `https://basescan.org/tx/${redeemTxHash}`;
      toast({
        title: "Withdrawal successful",
        description: (
          <>
            Your WCHAN has been unstaked.{" "}
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
      resetRedeem();
    }
  }, [
    isRedeemConfirmed,
    redeemTxHash,
    refetchWchan,
    refetchStaked,
    refetchVaultData,
    toast,
    resetRedeem,
  ]);

  // After claim confirms
  useEffect(() => {
    if (isClaimConfirmed && claimTxHash) {
      refetchEarned();
      const txUrl = `https://basescan.org/tx/${claimTxHash}`;
      toast({
        title: "WETH claimed",
        description: (
          <>
            Your WETH rewards have been claimed.{" "}
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
      resetClaim();
    }
  }, [isClaimConfirmed, claimTxHash, refetchEarned, toast, resetClaim]);

  const handleAmountChange = (val: string) => {
    if (val === "" || /^\d*\.?\d*$/.test(val)) {
      setAmount(val);
      if (
        val === "" ||
        parseFloat(val) === 0 ||
        !currentBalance ||
        (currentBalance as bigint) === 0n
      ) {
        setSliderValue(0);
      } else {
        try {
          const parsed = parseUnits(val, 18);
          const bal = currentBalance as bigint;
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
        address: WCHAN_TOKEN_ADDR,
        abi: erc20Abi,
        functionName: "approve",
        args: [WCHAN_VAULT_ADDR, parsedAmount!],
        chainId: STAKE_CHAIN_ID,
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
      }
    );
  }, [writeApprove, parsedAmount, toast]);

  const handleDeposit = useCallback(() => {
    if (!parsedAmount || !address) return;
    writeDeposit(
      {
        address: WCHAN_VAULT_ADDR,
        abi: wchanVaultAbi,
        functionName: "deposit",
        args: [parsedAmount, address],
        chainId: STAKE_CHAIN_ID,
      },
      {
        onError: (err) => {
          toast({
            title: "Deposit failed",
            description: err.message.split("\n")[0],
            status: "error",
            duration: 5000,
            isClosable: true,
            position: "bottom-right",
          });
        },
      }
    );
  }, [parsedAmount, address, writeDeposit, toast]);

  const handleRedeem = useCallback(() => {
    if (!parsedAmount || !address) return;
    writeRedeem(
      {
        address: WCHAN_VAULT_ADDR,
        abi: wchanVaultAbi,
        functionName: "redeem",
        args: [parsedAmount, address, address],
        chainId: STAKE_CHAIN_ID,
      },
      {
        onError: (err) => {
          toast({
            title: "Withdrawal failed",
            description: err.message.split("\n")[0],
            status: "error",
            duration: 5000,
            isClosable: true,
            position: "bottom-right",
          });
        },
      }
    );
  }, [parsedAmount, address, writeRedeem, toast]);

  const handleClaim = useCallback(() => {
    writeClaim(
      {
        address: WCHAN_VAULT_ADDR,
        abi: wchanVaultAbi,
        functionName: "claimRewards",
        chainId: STAKE_CHAIN_ID,
      },
      {
        onError: (err) => {
          toast({
            title: "Claim failed",
            description: err.message.split("\n")[0],
            status: "error",
            duration: 5000,
            isClosable: true,
            position: "bottom-right",
          });
        },
      }
    );
  }, [writeClaim, toast]);

  const handleAction = () => {
    if (activeTab === "deposit") {
      if (needsApproval) {
        handleApprove();
      } else {
        handleDeposit();
      }
    } else {
      handleRedeem();
    }
  };

  const getButtonLabel = (): string => {
    if (activeTab === "deposit") {
      if (isApproving || isApproveConfirming) return "Approving...";
      if (isDepositing || isDepositConfirming) return "Depositing...";
      if (needsApproval) return "Approve WCHAN";
      return "Deposit";
    }
    if (isRedeeming || isRedeemConfirming) return "Withdrawing...";
    return "Withdraw";
  };

  return (
    <Box h="100%" overflowY="auto" bg="white">
      <VStack spacing={4} align="stretch" px={5} pt={4} pb={8}>
        {/* Heading */}
        <Text
          fontSize="lg"
          fontWeight="900"
          textTransform="uppercase"
          letterSpacing="wide"
          textAlign="center"
        >
          WCHAN Staking
        </Text>

        {/* Stats Row */}
        {!isVaultLoading && vaultData && (
          <Flex gap={3}>
            {/* APY Box */}
            <Box
              flex={1}
              bg="white"
              border="3px solid"
              borderColor="bauhaus.black"
              boxShadow="4px 4px 0px 0px #121212"
              px={3}
              py={2}
              textAlign="center"
            >
              <Text
                fontSize="xs"
                fontWeight="800"
                textTransform="uppercase"
                letterSpacing="wider"
                color="gray.500"
              >
                Total APY
              </Text>
              <Text fontSize="lg" fontWeight="900" color="bauhaus.blue">
                {vaultData.totalApy.toFixed(2)}%
              </Text>
              <Flex gap={1.5} justify="center" mt={1}>
                <Text fontSize="xs" fontWeight="800" color="gray.500">
                  WCHAN {vaultData.wchanApy.toFixed(1)}%
                </Text>
                <Text fontSize="xs" fontWeight="900" color="gray.400">
                  +
                </Text>
                <Text fontSize="xs" fontWeight="800" color="gray.500">
                  WETH {vaultData.wethApy.toFixed(1)}%
                </Text>
              </Flex>
            </Box>

            {/* TVL Box */}
            <Flex
              flex={1}
              bg="bauhaus.yellow"
              border="3px solid"
              borderColor="bauhaus.black"
              boxShadow="4px 4px 0px 0px #121212"
              px={3}
              py={2}
              textAlign="center"
              direction="column"
              align="center"
              justify="center"
            >
              <Text
                fontSize="xs"
                fontWeight="800"
                textTransform="uppercase"
                letterSpacing="wider"
                color="bauhaus.black"
              >
                TVL
              </Text>
              <Text fontSize="lg" fontWeight="900" color="bauhaus.black">
                {formatUsd(vaultData.tvlUsd)}
              </Text>
            </Flex>
          </Flex>
        )}

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
              onClick={() => switchChain({ chainId: STAKE_CHAIN_ID })}
              leftIcon={
                <Image src="/images/base.svg" alt="Base" w="18px" h="18px" />
              }
            >
              Switch to Base
            </Button>
          </HStack>
        )}

        {/* Staked Balance + WETH Rewards */}
        {isWalletConnected && !isWrongChain && (
          <Box
            bg="white"
            border="3px solid"
            borderColor="bauhaus.black"
            boxShadow="4px 4px 0px 0px #121212"
          >
            {/* Staked Balance */}
            <Box px={4} py={3} borderBottom="2px solid" borderColor="gray.100">
              <Text
                fontSize="xs"
                fontWeight="800"
                textTransform="uppercase"
                letterSpacing="wider"
                color="gray.500"
              >
                Your Staked Balance
              </Text>
              <HStack spacing={2} align="baseline">
                <Text fontSize="lg" fontWeight="900" color="bauhaus.black">
                  {formatBalance(stakedBalance as bigint | undefined)} sWCHAN
                </Text>
                {tokenPrice > 0 &&
                  vaultData &&
                  stakedBalance !== undefined && (
                    <Text fontSize="xs" fontWeight="600" color="gray.400">
                      {formatUsd(
                        parseFloat(
                          formatUnits(stakedBalance as bigint, 18)
                        ) *
                          parseFloat(
                            formatUnits(
                              BigInt(vaultData.sharePrice || "0"),
                              18
                            )
                          ) *
                          tokenPrice
                      )}
                    </Text>
                  )}
              </HStack>
            </Box>

            {/* Claimable WETH Rewards */}
            <Flex px={4} py={3} align="center" justify="space-between">
              <Box>
                <Text
                  fontSize="xs"
                  fontWeight="800"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  color="gray.500"
                >
                  Claimable WETH
                </Text>
                <HStack spacing={2} align="baseline">
                  <Text fontSize="lg" fontWeight="900" color="bauhaus.black">
                    {earnedWeth !== undefined
                      ? `${formatUnits(earnedWeth as bigint, 18).slice(0, 12)} WETH`
                      : "\u2014"}
                  </Text>
                  {earnedWeth !== undefined &&
                    (earnedWeth as bigint) > 0n &&
                    ethPrice > 0 && (
                      <Text fontSize="sm" fontWeight="700" color="gray.400">
                        {formatUsd(
                          parseFloat(
                            formatUnits(earnedWeth as bigint, 18)
                          ) * ethPrice
                        )}
                      </Text>
                    )}
                </HStack>
              </Box>
              <Button
                variant="primary"
                size="sm"
                onClick={handleClaim}
                isLoading={isClaiming || isClaimConfirming}
                loadingText="Claiming..."
                isDisabled={
                  isClaiming ||
                  isClaimConfirming ||
                  !earnedWeth ||
                  (earnedWeth as bigint) === 0n
                }
              >
                Claim
              </Button>
            </Flex>
          </Box>
        )}

        {/* Staking Card */}
        <Box
          bg="white"
          border="4px solid"
          borderColor="bauhaus.black"
          boxShadow="8px 8px 0px 0px #121212"
          position="relative"
          overflow="hidden"
        >
          {/* Tabs */}
          <Flex borderBottom="4px solid" borderColor="bauhaus.black">
            <Box
              as="button"
              flex={1}
              py={3}
              bg={activeTab === "deposit" ? "bauhaus.blue" : "white"}
              color={activeTab === "deposit" ? "white" : "bauhaus.black"}
              fontWeight="900"
              fontSize="sm"
              textTransform="uppercase"
              letterSpacing="wider"
              borderRight="2px solid"
              borderColor="bauhaus.black"
              transition="all 0.15s ease-out"
              _hover={{
                bg: activeTab === "deposit" ? "bauhaus.blue" : "gray.50",
              }}
              onClick={() => {
                setActiveTab("deposit");
                setAmount("");
                setSliderValue(0);
              }}
            >
              Deposit
            </Box>
            <Box
              as="button"
              flex={1}
              py={3}
              bg={activeTab === "withdraw" ? "bauhaus.blue" : "white"}
              color={activeTab === "withdraw" ? "white" : "bauhaus.black"}
              fontWeight="900"
              fontSize="sm"
              textTransform="uppercase"
              letterSpacing="wider"
              borderLeft="2px solid"
              borderColor="bauhaus.black"
              transition="all 0.15s ease-out"
              _hover={{
                bg: activeTab === "withdraw" ? "bauhaus.blue" : "gray.50",
              }}
              onClick={() => {
                setActiveTab("withdraw");
                setAmount("");
                setSliderValue(0);
              }}
            >
              Withdraw
            </Box>
          </Flex>

          {/* Content */}
          <VStack spacing={4} p={5} position="relative" zIndex={1}>
            {/* Balance display */}
            <Flex justify="space-between" w="full" align="center">
              <Text
                fontSize="xs"
                fontWeight="800"
                textTransform="uppercase"
                letterSpacing="wider"
                color="gray.500"
              >
                {activeTab === "deposit"
                  ? "Deposit WCHAN"
                  : "Withdraw sWCHAN"}
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
                  <Text fontSize="xs" fontWeight="900" color="bauhaus.black">
                    {formatBalance(currentBalance as bigint | undefined)}{" "}
                    {currentSymbol}
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
                h="52px"
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
                    {currentSymbol}
                  </Text>
                </HStack>
              </Flex>

              {/* Percentage slider */}
              {isWalletConnected &&
                currentBalance !== undefined &&
                (currentBalance as bigint) > 0n && (
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
                        const snapped =
                          nearest !== undefined ? nearest : val;
                        setSliderValue(snapped);
                        if (snapped === 0) {
                          setAmount("");
                        } else {
                          const bal = currentBalance as bigint;
                          const pctAmount =
                            (bal * BigInt(snapped)) / 100n;
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
                            sliderValue >= pct
                              ? "bauhaus.blue"
                              : "gray.400"
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
                Insufficient {currentSymbol} balance
              </Text>
            )}

            {/* Penalty warning */}
            {activeTab === "withdraw" && penaltyPct > 0 && (
              <HStack
                w="full"
                spacing={2}
                bg="orange.50"
                border="2px solid"
                borderColor="orange.300"
                px={4}
                py={3}
              >
                <AlertTriangle
                  size={14}
                  color="#DD6B20"
                  style={{ flexShrink: 0 }}
                />
                <Box>
                  <Text fontSize="xs" fontWeight="700" color="orange.700">
                    Early withdrawal penalty: {penaltyPct.toFixed(1)}%
                    (decays linearly to 0%)
                  </Text>
                  {zeroPenaltyDate && (
                    <Text fontSize="xs" fontWeight="600" color="orange.600">
                      0% penalty in{" "}
                      {(() => {
                        const diff =
                          zeroPenaltyDate.getTime() - Date.now();
                        const days = Math.max(
                          0,
                          Math.ceil(diff / (1000 * 60 * 60 * 24))
                        );
                        const formatted = zeroPenaltyDate.toLocaleString(
                          "en-GB",
                          {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false,
                          }
                        );
                        return `${days} day${days !== 1 ? "s" : ""} (${formatted})`;
                      })()}
                    </Text>
                  )}
                </Box>
              </HStack>
            )}

            {/* Preview info row */}
            {activeTab === "deposit" &&
              parsedAmount &&
              previewShares !== undefined && (
                <Box
                  w="full"
                  bg="gray.50"
                  border="2px solid"
                  borderColor="gray.200"
                >
                  <Flex justify="space-between" px={4} py={3}>
                    <Text
                      fontSize="xs"
                      fontWeight="700"
                      color="gray.500"
                      textTransform="uppercase"
                      letterSpacing="wider"
                    >
                      You receive
                    </Text>
                    <Text
                      fontSize="xs"
                      fontWeight="900"
                      color="bauhaus.black"
                    >
                      {formatBalance(previewShares as bigint)} sWCHAN
                    </Text>
                  </Flex>
                  {stakedBalance !== undefined &&
                    lastDepositTs !== undefined && (
                      <Flex
                        justify="space-between"
                        px={4}
                        py={2}
                        borderTop="1px solid"
                        borderColor="gray.200"
                      >
                        <Text
                          fontSize="xs"
                          fontWeight="700"
                          color="orange.500"
                          textTransform="uppercase"
                          letterSpacing="wider"
                        >
                          0% penalty at
                        </Text>
                        <Text
                          fontSize="xs"
                          fontWeight="800"
                          color="orange.600"
                        >
                          {(() => {
                            const existing = stakedBalance as bigint;
                            const newShares = previewShares as bigint;
                            const oldTs = lastDepositTs as bigint;
                            const nowSec = BigInt(
                              Math.floor(Date.now() / 1000)
                            );
                            const newTs =
                              existing > 0n && oldTs > 0n
                                ? (oldTs * existing +
                                    nowSec * newShares) /
                                  (existing + newShares)
                                : nowSec;
                            const zeroPenalty = new Date(
                              (Number(newTs) + PENALTY_DURATION) * 1000
                            );
                            const diff =
                              zeroPenalty.getTime() - Date.now();
                            const days = Math.max(
                              0,
                              Math.ceil(diff / (1000 * 60 * 60 * 24))
                            );
                            const formatted =
                              zeroPenalty.toLocaleString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                                hour12: false,
                              });
                            return `in ${days} day${days !== 1 ? "s" : ""} (${formatted})`;
                          })()}
                        </Text>
                      </Flex>
                    )}
                </Box>
              )}

            {activeTab === "withdraw" &&
              parsedAmount &&
              previewAssetsNet !== undefined && (
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
                    You receive
                  </Text>
                  <Box textAlign="right">
                    <Text
                      fontSize="xs"
                      fontWeight="900"
                      color="bauhaus.black"
                    >
                      {formatBalance(previewAssetsNet as bigint)} WCHAN
                    </Text>
                    {penaltyPct > 0 && (
                      <Text
                        fontSize="xs"
                        fontWeight="700"
                        color="orange.500"
                      >
                        ({penaltyPct.toFixed(1)}% penalty)
                      </Text>
                    )}
                  </Box>
                </Flex>
              )}

            {/* Tx status indicator */}
            {(approveTxHash || depositTxHash || redeemTxHash) && (
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
                {(isApproveConfirming ||
                  isDepositConfirming ||
                  isRedeemConfirming) && (
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
                  href={`https://basescan.org/tx/${approveTxHash || depositTxHash || redeemTxHash}`}
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
                    h: "48px",
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
                      h="48px"
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
                h="48px"
                onClick={() => switchChain({ chainId: STAKE_CHAIN_ID })}
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
                  activeTab === "deposit"
                    ? needsApproval
                      ? "yellow"
                      : "secondary"
                    : "primary"
                }
                size="lg"
                h="48px"
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
          </VStack>
        </Box>

        {/* Vault link */}
        <Flex justify="center">
          <Link
            href={`https://basescan.org/address/${WCHAN_VAULT_ADDR}`}
            isExternal
            display="inline-flex"
            alignItems="center"
            gap={1}
            fontSize="xs"
            fontWeight="700"
            color="gray.500"
            _hover={{ color: "bauhaus.red" }}
          >
            Vault
            <ExternalLink size={12} />
          </Link>
        </Flex>
      </VStack>
    </Box>
  );
}
