"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Flex,
  Button,
  Input,
  Collapse,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  useToast,
} from "@chakra-ui/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, parseEther } from "viem";
import { erc20Abi, wchanVaultAbi } from "./abi";

const POLL_MS = 5_000;

function fmtBal(wei: bigint | undefined): string {
  if (!wei) return "0";
  const num = parseFloat(formatUnits(wei, 18));
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  });
}

interface VaultStakeProps {
  wchanAddress: `0x${string}`;
  vaultAddress: `0x${string}`;
  chainId: number;
  chainName: string;
  isWalletConnected: boolean;
  isWrongChain: boolean;
  explorerUrl: string;
  onSuccess: () => void;
}

export default function VaultStake({
  wchanAddress,
  vaultAddress,
  chainId,
  chainName,
  isWalletConnected,
  isWrongChain,
  explorerUrl,
  onSuccess,
}: VaultStakeProps) {
  const toast = useToast();
  const { address } = useAccount();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [sliderPct, setSliderPct] = useState(0);

  const parsedAmount = useMemo(() => {
    try {
      if (!amount || parseFloat(amount) <= 0) return undefined;
      return parseEther(amount);
    } catch {
      return undefined;
    }
  }, [amount]);

  // Balances
  const { data: wchanBalance, refetch: refetchWchan } = useReadContract({
    address: wchanAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: !!address, refetchInterval: POLL_MS },
  });

  const { data: sWchanBalance, refetch: refetchSWchan } = useReadContract({
    address: vaultAddress,
    abi: wchanVaultAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: !!address, refetchInterval: POLL_MS },
  });

  // Allowance (WCHAN → vault)
  const { data: wchanAllowance, refetch: refetchAllowance } = useReadContract({
    address: wchanAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, vaultAddress] : undefined,
    chainId,
    query: { enabled: !!address, refetchInterval: POLL_MS },
  });

  // Previews
  const { data: previewShares } = useReadContract({
    address: vaultAddress,
    abi: wchanVaultAbi,
    functionName: "previewDeposit",
    args: parsedAmount ? [parsedAmount] : undefined,
    chainId,
    query: { enabled: activeTab === "deposit" && !!parsedAmount },
  });

  const { data: previewAssets } = useReadContract({
    address: vaultAddress,
    abi: wchanVaultAbi,
    functionName: "previewRedeem",
    args: parsedAmount ? [parsedAmount] : undefined,
    chainId,
    query: { enabled: activeTab === "withdraw" && !!parsedAmount },
  });

  const currentBalance =
    activeTab === "deposit"
      ? (wchanBalance as bigint | undefined)
      : (sWchanBalance as bigint | undefined);
  const currentSymbol = activeTab === "deposit" ? "WCHAN" : "sWCHAN";

  const hasInsufficientBalance =
    parsedAmount !== undefined &&
    currentBalance !== undefined &&
    parsedAmount > currentBalance;

  const needsApproval =
    activeTab === "deposit" &&
    parsedAmount !== undefined &&
    wchanAllowance !== undefined &&
    (wchanAllowance as bigint) < parsedAmount;

  // --- Transaction hooks ---

  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: isApproving,
    reset: resetApprove,
  } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  const {
    writeContract: writeDeposit,
    data: depositTxHash,
    isPending: isDepositing,
    reset: resetDeposit,
  } = useWriteContract();
  const { isLoading: isDepositConfirming, isSuccess: isDepositConfirmed } =
    useWaitForTransactionReceipt({ hash: depositTxHash });

  const {
    writeContract: writeRedeem,
    data: redeemTxHash,
    isPending: isRedeeming,
    reset: resetRedeem,
  } = useWriteContract();
  const { isLoading: isRedeemConfirming, isSuccess: isRedeemConfirmed } =
    useWaitForTransactionReceipt({ hash: redeemTxHash });

  const isBusy =
    isApproving ||
    isApproveConfirming ||
    isDepositing ||
    isDepositConfirming ||
    isRedeeming ||
    isRedeemConfirming;

  const refetchAll = useCallback(() => {
    refetchWchan();
    refetchSWchan();
    refetchAllowance();
    onSuccess();
  }, [refetchWchan, refetchSWchan, refetchAllowance, onSuccess]);

  const txLink = (hash: string | undefined) =>
    explorerUrl && hash ? (
      <a href={`${explorerUrl}/tx/${hash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
        View on explorer
      </a>
    ) : null;

  // Success effects
  useEffect(() => {
    if (isApproveConfirmed) {
      toast({
        title: "WCHAN approved",
        description: txLink(approveTxHash),
        status: "success",
        duration: 10000,
        isClosable: true,
        position: "bottom-right",
      });
      resetApprove();
      refetchAllowance();
    }
  }, [isApproveConfirmed, approveTxHash, toast, resetApprove, refetchAllowance]);

  useEffect(() => {
    if (isDepositConfirmed) {
      toast({
        title: "Staked successfully",
        description: (<>WCHAN deposited into vault. {txLink(depositTxHash)}</>),
        status: "success",
        duration: 10000,
        isClosable: true,
        position: "bottom-right",
      });
      resetDeposit();
      setAmount("");
      setSliderPct(0);
      refetchAll();
    }
  }, [isDepositConfirmed, depositTxHash, toast, resetDeposit, refetchAll]);

  useEffect(() => {
    if (isRedeemConfirmed) {
      toast({
        title: "Unstaked successfully",
        description: (<>sWCHAN redeemed for WCHAN. {txLink(redeemTxHash)}</>),
        status: "success",
        duration: 10000,
        isClosable: true,
        position: "bottom-right",
      });
      resetRedeem();
      setAmount("");
      setSliderPct(0);
      refetchAll();
    }
  }, [isRedeemConfirmed, redeemTxHash, toast, resetRedeem, refetchAll]);

  const onError = useCallback(
    (err: Error) => {
      toast({
        title: "Transaction failed",
        description: err.message.split("\n")[0],
        status: "error",
        duration: 5000,
        isClosable: true,
        position: "bottom-right",
      });
    },
    [toast],
  );

  const handleAction = useCallback(() => {
    if (!parsedAmount || !address) return;

    if (activeTab === "deposit") {
      if (needsApproval) {
        writeApprove(
          {
            address: wchanAddress,
            abi: erc20Abi,
            functionName: "approve",
            args: [vaultAddress, parsedAmount],
            chainId,
          },
          { onError },
        );
      } else {
        writeDeposit(
          {
            address: vaultAddress,
            abi: wchanVaultAbi,
            functionName: "deposit",
            args: [parsedAmount, address],
            chainId,
          },
          { onError },
        );
      }
    } else {
      writeRedeem(
        {
          address: vaultAddress,
          abi: wchanVaultAbi,
          functionName: "redeem",
          args: [parsedAmount, address, address],
          chainId,
        },
        { onError },
      );
    }
  }, [
    parsedAmount,
    address,
    activeTab,
    needsApproval,
    writeApprove,
    writeDeposit,
    writeRedeem,
    wchanAddress,
    vaultAddress,
    chainId,
    onError,
  ]);

  const buttonLabel = useMemo(() => {
    if (isApproving || isApproveConfirming) return "Approving...";
    if (isDepositing || isDepositConfirming) return "Staking...";
    if (isRedeeming || isRedeemConfirming) return "Unstaking...";
    if (activeTab === "deposit") {
      return needsApproval ? "Approve WCHAN" : "Stake";
    }
    return "Unstake";
  }, [
    isApproving,
    isApproveConfirming,
    isDepositing,
    isDepositConfirming,
    isRedeeming,
    isRedeemConfirming,
    activeTab,
    needsApproval,
  ]);

  return (
    <Box mt={4} border="2px solid" borderColor="bauhaus.border">
      {/* Collapsible header */}
      <Flex
        as="button"
        onClick={() => setIsOpen(!isOpen)}
        w="full"
        px={4}
        py={2}
        align="center"
        justify="space-between"
        bg="gray.50"
        _hover={{ bg: "gray.100" }}
        cursor="pointer"
      >
        <HStack spacing={2}>
          <Box
            as={isOpen ? ChevronDown : ChevronRight}
            size={14}
            color="gray.500"
          />
          <Text
            fontSize="xs"
            fontWeight="800"
            textTransform="uppercase"
            letterSpacing="widest"
            color="gray.500"
          >
            Vault Stake / Unstake ({chainName})
          </Text>
        </HStack>
        {isWalletConnected && sWchanBalance !== undefined && (sWchanBalance as bigint) > 0n && (
          <Text fontSize="xs" fontWeight="900" color="bauhaus.blue">
            {fmtBal(sWchanBalance as bigint)} sWCHAN
          </Text>
        )}
      </Flex>

      <Collapse in={isOpen} animateOpacity>
        <Box p={4} borderTop="2px solid" borderColor="bauhaus.border">
          {/* Deposit / Withdraw tabs */}
          <HStack spacing={0} mb={4} border="2px solid" borderColor="bauhaus.border" w="fit-content">
            {(["deposit", "withdraw"] as const).map((tab) => (
              <Button
                key={tab}
                size="xs"
                borderRadius={0}
                bg={activeTab === tab ? "bauhaus.black" : "white"}
                color={activeTab === tab ? "white" : "bauhaus.black"}
                fontWeight="900"
                textTransform="uppercase"
                letterSpacing="wide"
                fontSize="xs"
                _hover={{ bg: activeTab === tab ? "bauhaus.black" : "gray.100" }}
                onClick={() => {
                  setActiveTab(tab);
                  setAmount("");
                  setSliderPct(0);
                }}
                px={4}
              >
                {tab === "deposit" ? "Stake" : "Unstake"}
              </Button>
            ))}
          </HStack>

          {/* Balance */}
          {isWalletConnected && (
            <HStack mb={2} spacing={1}>
              <Text fontSize="xs" fontWeight="700" color="gray.500" textTransform="uppercase">
                Balance:
              </Text>
              <Text fontSize="xs" fontWeight="900">
                {fmtBal(currentBalance)} {currentSymbol}
              </Text>
              <Button
                variant="link"
                size="xs"
                fontSize="xs"
                fontWeight="700"
                color="bauhaus.blue"
                textTransform="uppercase"
                onClick={() => {
                  if (currentBalance) {
                    setAmount(formatUnits(currentBalance, 18));
                    setSliderPct(100);
                  }
                }}
                ml={1}
              >
                Max
              </Button>
            </HStack>
          )}

          {/* Amount input + slider */}
          <VStack spacing={2} align="stretch" mb={2}>
            <Input
              placeholder="0.0"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setSliderPct(0);
              }}
              size="sm"
              fontWeight="bold"
              borderRadius={0}
              border="2px solid"
              borderColor={hasInsufficientBalance ? "red.400" : "bauhaus.border"}
              _focus={{ borderColor: "bauhaus.blue" }}
            />
            <Slider
              value={sliderPct}
              focusThumbOnChange={false}
              onChange={(val) => {
                setSliderPct(val);
                if (!currentBalance || currentBalance === 0n) return;
                const scaled = (currentBalance * BigInt(val)) / 100n;
                setAmount(formatUnits(scaled, 18));
              }}
              min={0}
              max={100}
              step={1}
              size="sm"
            >
              <SliderTrack bg="gray.200" h="4px" borderRadius={0}>
                <SliderFilledTrack bg="bauhaus.blue" />
              </SliderTrack>
              <SliderThumb boxSize={3} borderRadius={0} bg="bauhaus.blue" />
            </Slider>
          </VStack>

          {hasInsufficientBalance && (
            <Text fontSize="xs" fontWeight="700" color="red.500" textTransform="uppercase" mb={2}>
              Insufficient {currentSymbol} balance
            </Text>
          )}

          {/* Preview */}
          {parsedAmount && !hasInsufficientBalance && (
            <Text fontSize="xs" color="gray.500" mb={2}>
              {activeTab === "deposit"
                ? `You'll receive ~${fmtBal(previewShares as bigint | undefined)} sWCHAN`
                : `You'll receive ~${fmtBal(previewAssets as bigint | undefined)} WCHAN`}
            </Text>
          )}

          {/* Action button */}
          <Button
            w="full"
            variant="primary"
            size="md"
            onClick={handleAction}
            isLoading={isBusy}
            loadingText={buttonLabel}
            isDisabled={
              !isWalletConnected ||
              isWrongChain ||
              !parsedAmount ||
              hasInsufficientBalance ||
              isBusy
            }
          >
            {buttonLabel}
          </Button>
        </Box>
      </Collapse>
    </Box>
  );
}
