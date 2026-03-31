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
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Skeleton,
  Image,
  useToast,
} from "@chakra-ui/react";
import { AlertTriangle } from "lucide-react";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useBalance,
} from "wagmi";
import { formatUnits, parseEther } from "viem";
import { DRIP_ADDRESSES as DRIP_CHAINS } from "@walletchan/contract-addresses";
import { erc20Abi, weth9Abi, wchanVaultAbi, dripRewardsAbi } from "./abi";
import VaultStake from "./VaultStake";
import VaultStats from "./VaultStats";
import { useTokenData } from "../../contexts/TokenDataContext";

const POLL_MS = 5_000;

const VAULT_INDEXER_URL =
  process.env.NEXT_PUBLIC_WCHAN_VAULT_INDEXER_API_URL || "";
const VAULT_INDEXER_CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_WCHAN_VAULT_INDEXER_CHAIN_ID || "0"
);

interface IndexerApyData {
  wchanAPY: number;
  wethDistributed: string;
  totalStaked: string;
  secondsElapsed: number;
}

function computeCurrentWethApy(
  data: IndexerApyData,
  ethPrice: number | null,
  wchanPrice: number | null,
): number | null {
  if (!ethPrice || !wchanPrice || data.secondsElapsed <= 0) return null;
  const wethUsd =
    parseFloat(formatUnits(BigInt(data.wethDistributed || "0"), 18)) * ethPrice;
  const stakedUsd =
    parseFloat(formatUnits(BigInt(data.totalStaked || "0"), 18)) * wchanPrice;
  if (stakedUsd === 0) return null;
  return (wethUsd / stakedUsd) * (31_536_000 / data.secondsElapsed) * 100;
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (value >= 0.01) return `$${value.toFixed(2)}`;
  if (value > 0) return `<$0.01`;
  return `$0.00`;
}

function weiToUsd(wei: bigint | undefined, price: number | null): string | null {
  if (!wei || !price) return null;
  const num = parseFloat(formatUnits(wei, 18));
  if (num === 0) return null;
  return formatUsd(num * price);
}

function fmtBal(wei: bigint | undefined, decimals = 4): string {
  if (!wei) return "0";
  const num = parseFloat(formatUnits(wei, 18));
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: 6,
  });
}

function dateToTimestamp(dateStr: string): bigint {
  const ms = new Date(dateStr).getTime();
  return BigInt(Math.floor(ms / 1000));
}

function toLocalDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowDateStr(): string {
  return toLocalDateStr(new Date());
}

function futureDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalDateStr(d);
}

// Compute APY from stream parameters.
// For WCHAN stream: same denomination, so annualDrip / totalAssets.
// For WETH stream: cross-denomination, so (annualDrip * ethPrice) / (totalAssets * wchanPrice).
function computeApy(
  newAmount: bigint,
  endTimestamp: bigint,
  existingStream: { endTimestamp: bigint; amountRemaining: bigint } | undefined,
  vaultTotalAssets: bigint | undefined,
  dripTokenPrice: number | null, // USD price of the drip token (WCHAN or ETH)
  vaultAssetPrice: number | null, // USD price of the vault asset (WCHAN)
): number | null {
  if (!vaultTotalAssets || vaultTotalAssets === 0n) return null;
  if (!dripTokenPrice || !vaultAssetPrice) return null;

  const now = BigInt(Math.floor(Date.now() / 1000));
  if (endTimestamp <= now) return null;

  let effectiveAmount = newAmount;
  let effectiveEnd = endTimestamp;

  // Merge with existing active stream
  if (existingStream && existingStream.amountRemaining > 0n && existingStream.endTimestamp > now) {
    effectiveAmount += existingStream.amountRemaining;
    if (existingStream.endTimestamp > effectiveEnd) {
      effectiveEnd = existingStream.endTimestamp;
    }
  }

  const duration = effectiveEnd - now;
  if (duration <= 0n) return null;

  const annualSeconds = 86400n * 365n;
  const annualDrip =
    (Number(effectiveAmount) / Number(duration)) * Number(annualSeconds);

  // APY = (annualDrip * dripPrice) / (totalAssets * vaultAssetPrice) * 100
  const annualDripUsd = (annualDrip / 1e18) * dripTokenPrice;
  const totalAssetsUsd = (Number(vaultTotalAssets) / 1e18) * vaultAssetPrice;
  if (totalAssetsUsd === 0) return null;

  return (annualDripUsd / totalAssetsUsd) * 100;
}

interface StreamInputProps {
  label: string;
  tokenSymbol: string;
  accentColor: string;
  balance: bigint | undefined;
  ethBalance: bigint | undefined; // only for WETH stream
  isWeth: boolean;
  existingStream:
    | { endTimestamp: bigint; amountRemaining: bigint }
    | undefined;
  vaultTotalAssets: bigint | undefined;
  allowance: bigint | undefined;
  dripAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  wethAddress: `0x${string}`;
  selectedChainId: number;
  isWalletConnected: boolean;
  isWrongChain: boolean;
  isNotOwner: boolean;
  dripTokenPrice: number | null;
  wchanPrice: number | null;
  explorerUrl: string;
  currentApy: number | null;
  onSuccess: () => void;
}

function StreamInput({
  label,
  tokenSymbol,
  accentColor,
  balance,
  ethBalance,
  isWeth,
  existingStream,
  vaultTotalAssets,
  allowance,
  dripAddress,
  tokenAddress,
  wethAddress,
  selectedChainId,
  isWalletConnected,
  isWrongChain,
  dripTokenPrice,
  isNotOwner,
  wchanPrice,
  explorerUrl,
  currentApy,
  onSuccess,
}: StreamInputProps) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [sliderPct, setSliderPct] = useState(0);
  const [startDate, setStartDate] = useState(nowDateStr());
  const [endDate, setEndDate] = useState(futureDate(30));

  // Minimum end date: contract only extends, never shortens.
  const minEndDate = useMemo(() => {
    if (
      existingStream &&
      existingStream.amountRemaining > 0n &&
      existingStream.endTimestamp > BigInt(Math.floor(Date.now() / 1000))
    ) {
      return toLocalDateStr(new Date(Number(existingStream.endTimestamp) * 1000));
    }
    return nowDateStr();
  }, [existingStream]);

  // Auto-set start to now, end to active stream's end date (or default +30d)
  useEffect(() => {
    setStartDate(nowDateStr());
    if (
      existingStream &&
      existingStream.amountRemaining > 0n &&
      existingStream.endTimestamp > BigInt(Math.floor(Date.now() / 1000))
    ) {
      setEndDate(toLocalDateStr(new Date(Number(existingStream.endTimestamp) * 1000)));
    }
  }, [existingStream]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsedAmount = useMemo(() => {
    try {
      if (!amount || parseFloat(amount) <= 0) return undefined;
      return parseEther(amount);
    } catch {
      return undefined;
    }
  }, [amount]);

  const endTimestamp = useMemo(() => dateToTimestamp(endDate), [endDate]);

  // APY preview
  const apy = useMemo(
    () =>
      computeApy(
        parsedAmount ?? 0n,
        endTimestamp,
        existingStream,
        vaultTotalAssets,
        dripTokenPrice,
        wchanPrice,
      ),
    [parsedAmount, endTimestamp, existingStream, vaultTotalAssets, dripTokenPrice, wchanPrice],
  );

  // How much ETH needs wrapping
  const wrapNeeded = useMemo(() => {
    if (!isWeth || !parsedAmount) return 0n;
    const wethBal = balance ?? 0n;
    if (parsedAmount > wethBal) {
      const diff = parsedAmount - wethBal;
      const ethBal = ethBalance ?? 0n;
      return diff > ethBal ? ethBal : diff;
    }
    return 0n;
  }, [isWeth, parsedAmount, balance, ethBalance]);

  const needsWrap = isWeth && wrapNeeded > 0n;
  const needsApproval =
    parsedAmount !== undefined &&
    allowance !== undefined &&
    allowance < parsedAmount;

  // Total available = token balance + (ETH for wrap if WETH)
  const totalAvailable = useMemo(() => {
    const bal = balance ?? 0n;
    if (isWeth) return bal + (ethBalance ?? 0n);
    return bal;
  }, [balance, ethBalance, isWeth]);

  const hasInsufficientBalance =
    parsedAmount !== undefined && parsedAmount > totalAvailable;

  // --- Transaction hooks ---

  // Wrap ETH
  const {
    writeContract: writeWrap,
    data: wrapTxHash,
    isPending: isWrapping,
    reset: resetWrap,
  } = useWriteContract();
  const { isLoading: isWrapConfirming, isSuccess: isWrapConfirmed } =
    useWaitForTransactionReceipt({ hash: wrapTxHash });

  // Approve
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: isApproving,
    reset: resetApprove,
  } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  // Configure drip
  const {
    writeContract: writeDrip,
    data: dripTxHash,
    isPending: isDripping,
    reset: resetDrip,
  } = useWriteContract();
  const { isLoading: isDripConfirming, isSuccess: isDripConfirmed } =
    useWaitForTransactionReceipt({ hash: dripTxHash });

  const isBusy =
    isWrapping ||
    isWrapConfirming ||
    isApproving ||
    isApproveConfirming ||
    isDripping ||
    isDripConfirming;

  // Success handlers
  const txLink = (hash: string | undefined) =>
    explorerUrl && hash ? (
      <a href={`${explorerUrl}/tx/${hash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
        View on explorer
      </a>
    ) : null;

  useEffect(() => {
    if (isWrapConfirmed) {
      toast({
        title: "ETH wrapped",
        description: (<>Wrapped {fmtBal(wrapNeeded)} ETH to WETH. {txLink(wrapTxHash)}</>),
        status: "success",
        duration: 10000,
        isClosable: true,
        position: "bottom-right",
      });
      resetWrap();
      onSuccess();
    }
  }, [isWrapConfirmed, wrapNeeded, wrapTxHash, toast, resetWrap, onSuccess]);

  useEffect(() => {
    if (isApproveConfirmed) {
      toast({
        title: `${tokenSymbol} approved`,
        description: txLink(approveTxHash),
        status: "success",
        duration: 10000,
        isClosable: true,
        position: "bottom-right",
      });
      resetApprove();
      onSuccess();
    }
  }, [isApproveConfirmed, approveTxHash, tokenSymbol, toast, resetApprove, onSuccess]);

  useEffect(() => {
    if (isDripConfirmed) {
      toast({
        title: "Drip configured",
        description: (<>{tokenSymbol} stream configured. {txLink(dripTxHash)}</>),
        status: "success",
        duration: 10000,
        isClosable: true,
        position: "bottom-right",
      });
      resetDrip();
      setAmount("");
      setSliderPct(0);
      onSuccess();
    }
  }, [isDripConfirmed, dripTxHash, tokenSymbol, toast, resetDrip, onSuccess]);

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
    if (!parsedAmount) return;

    if (needsWrap) {
      writeWrap(
        {
          address: wethAddress,
          abi: weth9Abi,
          functionName: "deposit",
          value: wrapNeeded,
          chainId: selectedChainId,
        },
        { onError },
      );
    } else if (needsApproval) {
      writeApprove(
        {
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [dripAddress, parsedAmount],
          chainId: selectedChainId,
        },
        { onError },
      );
    } else {
      writeDrip(
        {
          address: dripAddress,
          abi: dripRewardsAbi,
          functionName: "configureDrip",
          args: [isWeth, parsedAmount, endTimestamp],
          chainId: selectedChainId,
        },
        { onError },
      );
    }
  }, [
    parsedAmount,
    needsWrap,
    needsApproval,
    wrapNeeded,
    writeWrap,
    writeApprove,
    writeDrip,
    wethAddress,
    tokenAddress,
    dripAddress,
    selectedChainId,
    endTimestamp,
    isWeth,
    onError,
  ]);

  const buttonLabel = useMemo(() => {
    if (isWrapping || isWrapConfirming) return "Wrapping ETH...";
    if (isApproving || isApproveConfirming) return `Approving ${tokenSymbol}...`;
    if (isDripping || isDripConfirming) return "Configuring...";
    if (needsWrap) return `Wrap ${fmtBal(wrapNeeded)} ETH`;
    if (needsApproval) return `Approve ${tokenSymbol}`;
    return "Configure Drip";
  }, [
    isWrapping,
    isWrapConfirming,
    isApproving,
    isApproveConfirming,
    isDripping,
    isDripConfirming,
    needsWrap,
    needsApproval,
    wrapNeeded,
    tokenSymbol,
  ]);

  // Slider handler
  const handleSlider = useCallback(
    (val: number) => {
      setSliderPct(val);
      if (!balance && !ethBalance) return;
      const total = totalAvailable;
      if (total === 0n) return;
      const scaled = (total * BigInt(val)) / 100n;
      setAmount(formatUnits(scaled, 18));
    },
    [balance, ethBalance, totalAvailable],
  );

  // Existing stream info
  const streamActive =
    existingStream &&
    existingStream.amountRemaining > 0n &&
    existingStream.endTimestamp > BigInt(Math.floor(Date.now() / 1000));

  return (
    <Box
      flex={1}
      bg="white"
      border="2px solid"
      borderColor="bauhaus.border"
      boxShadow="3px 3px 0px 0px #121212"
      position="relative"
      overflow="hidden"
    >
      <Box position="absolute" left={0} top={0} bottom={0} w="4px" bg={accentColor} />
      <Box p={5} pl={6}>
        <HStack mb={3} spacing={2}>
          <Box w={1.5} h={1.5} bg={accentColor} borderRadius="full" />
          <Text
            fontWeight="bold"
            fontSize="xs"
            textTransform="uppercase"
            letterSpacing="widest"
            color="gray.500"
          >
            {label}
          </Text>
        </HStack>

        {/* Existing stream info */}
        {streamActive && (
          <Box
            mb={3}
            p={2}
            bg="gray.50"
            border="1px solid"
            borderColor="gray.200"
          >
            <Text fontSize="xs" fontWeight="700" color="gray.500" textTransform="uppercase">
              Active Stream
            </Text>
            <HStack spacing={1}>
              <Text fontSize="xs" fontWeight="bold">
                {fmtBal(existingStream!.amountRemaining)} remaining
              </Text>
              {weiToUsd(existingStream!.amountRemaining, dripTokenPrice) && (
                <Text fontSize="xs" fontWeight="700" color="gray.400">
                  {weiToUsd(existingStream!.amountRemaining, dripTokenPrice)}
                </Text>
              )}
            </HStack>
            <Text fontSize="xs" color="gray.400">
              Ends: {new Date(Number(existingStream!.endTimestamp) * 1000).toLocaleString()}
            </Text>
          </Box>
        )}

        {/* Balance display */}
        <HStack mb={2} spacing={1} flexWrap="wrap">
          <Text fontSize="xs" fontWeight="700" color="gray.500" textTransform="uppercase">
            Your {tokenSymbol}:
          </Text>
          <Text fontSize="xs" fontWeight="900">
            {fmtBal(balance)}
          </Text>
          {weiToUsd(balance, dripTokenPrice) && (
            <Text fontSize="xs" fontWeight="700" color="gray.400">
              {weiToUsd(balance, dripTokenPrice)}
            </Text>
          )}
          {isWeth && ethBalance !== undefined && (
            <Text fontSize="xs" fontWeight="700" color="gray.400">
              (+ {fmtBal(ethBalance)} ETH{weiToUsd(ethBalance, dripTokenPrice) ? ` ${weiToUsd(ethBalance, dripTokenPrice)}` : ""})
            </Text>
          )}
        </HStack>

        {/* Amount input + slider */}
        <VStack spacing={2} align="stretch" mb={3}>
          <Flex
            align="center"
            border="2px solid"
            borderColor={hasInsufficientBalance ? "red.400" : "bauhaus.border"}
            _focusWithin={{ borderColor: accentColor }}
            px={2}
          >
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
              border="none"
              p={0}
              flex={1}
              _focus={{ boxShadow: "none" }}
            />
            {amount && parseFloat(amount) > 0 && dripTokenPrice && (
              <Text
                fontSize="xs"
                fontWeight="700"
                color="gray.400"
                whiteSpace="nowrap"
                ml={2}
              >
                ≈ {formatUsd(parseFloat(amount) * dripTokenPrice)}
              </Text>
            )}
          </Flex>
          <Slider
            value={sliderPct}
            onChange={handleSlider}
            min={0}
            max={100}
            step={1}
            size="sm"
            focusThumbOnChange={false}
          >
            <SliderTrack bg="gray.200" h="4px" borderRadius={0}>
              <SliderFilledTrack bg={accentColor} />
            </SliderTrack>
            <SliderThumb boxSize={3} borderRadius={0} bg={accentColor} />
          </Slider>
          {hasInsufficientBalance && (
            <Text fontSize="xs" fontWeight="700" color="red.500" textTransform="uppercase">
              Insufficient balance
            </Text>
          )}
        </VStack>

        {/* Duration inputs */}
        <VStack spacing={2} align="stretch" mb={3}>
          <HStack>
            <Text fontSize="xs" fontWeight="700" color="gray.500" w="50px">
              Start
            </Text>
            <Input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
              size="xs"
              fontWeight="bold"
              borderRadius={0}
              border="2px solid"
              borderColor="bauhaus.border"
              cursor="pointer"
            />
          </HStack>
          <HStack>
            <Text fontSize="xs" fontWeight="700" color="gray.500" w="50px">
              End
            </Text>
            <Input
              type="datetime-local"
              value={endDate}
              min={minEndDate}
              onChange={(e) => {
                // Enforce min in case browser doesn't block it
                if (e.target.value < minEndDate) return;
                setEndDate(e.target.value);
              }}
              onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
              size="xs"
              fontWeight="bold"
              borderRadius={0}
              border="2px solid"
              borderColor="bauhaus.border"
              cursor="pointer"
            />
          </HStack>
        </VStack>

        {/* APY Preview */}
        <Box
          mb={3}
          p={3}
          bg="gray.50"
          border="2px solid"
          borderColor="bauhaus.border"
        >
          <HStack justify="space-between" mb={1}>
            <Text
              fontSize="xs"
              fontWeight="bold"
              textTransform="uppercase"
              letterSpacing="widest"
              color="gray.500"
            >
              Current APY (7d)
            </Text>
            <Text fontSize="sm" fontWeight="black" color="gray.600">
              {currentApy !== null ? `${currentApy.toFixed(2)}%` : "—"}
            </Text>
          </HStack>
          <HStack justify="space-between" mb={2}>
            <Text
              fontSize="xs"
              fontWeight="bold"
              textTransform="uppercase"
              letterSpacing="widest"
              color="gray.500"
            >
              Est. New Config APY
            </Text>
            <Text fontSize="sm" fontWeight="black" color={accentColor}>
              {apy !== null ? `${apy.toFixed(2)}%` : "—"}
            </Text>
          </HStack>
          {streamActive && parsedAmount && (
            <Text fontSize="xs" color="gray.400" mb={1}>
              Includes existing stream remainder
            </Text>
          )}
        </Box>

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
            isNotOwner ||
            !parsedAmount ||
            (hasInsufficientBalance && !needsWrap) ||
            isBusy
          }
        >
          {buttonLabel}
        </Button>
      </Box>
    </Box>
  );
}

// ─── Main DripSection ───

export default function DripSection() {
  const toast = useToast();
  const { address, isConnected: isWalletConnected } = useAccount();
  const walletChainId = useChainId();
  const { switchChain, chains } = useSwitchChain();
  const { tokenData } = useTokenData();
  const wchanPrice = tokenData?.priceRaw ?? null;

  // Fetch mainnet ETH price for WETH APY calculation
  const [ethPrice, setEthPrice] = useState<number | null>(null);
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

  // Fetch current APY from vault indexer (7d)
  const [indexerApy, setIndexerApy] = useState<IndexerApyData | null>(null);
  useEffect(() => {
    if (!VAULT_INDEXER_URL) return;
    const fetchApy = async () => {
      try {
        const res = await fetch(`${VAULT_INDEXER_URL}/apy?window=7d`);
        if (res.ok) setIndexerApy(await res.json());
      } catch {
        // silent
      }
    };
    fetchApy();
    const interval = setInterval(fetchApy, 30_000);
    return () => clearInterval(interval);
  }, []);

  const [selectedChainId, setSelectedChainId] = useState(8453);
  const chain = DRIP_CHAINS[selectedChainId]!;
  const isWrongChain = isWalletConnected && walletChainId !== selectedChainId;
  const getChainName = (id: number) => chains.find((c) => c.id === id)?.name ?? String(id);
  const explorerUrl = chains.find((c) => c.id === selectedChainId)?.blockExplorers?.default?.url ?? "";

  const wchanAddr = chain.wchan as `0x${string}`;
  const wethAddr = chain.weth as `0x${string}`;
  const vaultAddr = chain.wchanVault as `0x${string}`;
  const dripAddr = chain.dripWchanRewards as `0x${string}`;

  // Check contract owner
  const { data: dripOwner } = useReadContract({
    address: dripAddr,
    abi: dripRewardsAbi,
    functionName: "owner",
    chainId: selectedChainId,
  });
  const isNotOwner =
    isWalletConnected &&
    !!address &&
    !!dripOwner &&
    address.toLowerCase() !== (dripOwner as string).toLowerCase();

  // On-chain reads
  const { data: vaultTotalAssets, refetch: refetchAssets } = useReadContract({
    address: vaultAddr,
    abi: wchanVaultAbi,
    functionName: "totalAssets",
    chainId: selectedChainId,
    query: { refetchInterval: POLL_MS },
  });

  const { data: wchanBalance, refetch: refetchWchan } = useReadContract({
    address: wchanAddr,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!address, refetchInterval: POLL_MS },
  });

  const { data: wethBalance, refetch: refetchWeth } = useReadContract({
    address: wethAddr,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!address, refetchInterval: POLL_MS },
  });

  const { data: ethBalanceData, refetch: refetchEth } = useBalance({
    address,
    chainId: selectedChainId,
    query: { enabled: !!address, refetchInterval: POLL_MS },
  });
  const ethBalance = ethBalanceData?.value;

  const { data: wchanAllowance, refetch: refetchWchanAllow } = useReadContract({
    address: wchanAddr,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, dripAddr] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!address, refetchInterval: POLL_MS },
  });

  const { data: wethAllowance, refetch: refetchWethAllow } = useReadContract({
    address: wethAddr,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, dripAddr] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!address, refetchInterval: POLL_MS },
  });

  // Stream states
  const { data: wchanStreamRaw } = useReadContract({
    address: dripAddr,
    abi: dripRewardsAbi,
    functionName: "wchanStream",
    chainId: selectedChainId,
    query: { refetchInterval: POLL_MS },
  });

  const { data: wethStreamRaw } = useReadContract({
    address: dripAddr,
    abi: dripRewardsAbi,
    functionName: "wethStream",
    chainId: selectedChainId,
    query: { refetchInterval: POLL_MS },
  });

  const wchanStream = wchanStreamRaw
    ? {
        endTimestamp: wchanStreamRaw[1],
        amountRemaining: wchanStreamRaw[3],
      }
    : undefined;

  const wethStream = wethStreamRaw
    ? {
        endTimestamp: wethStreamRaw[1],
        amountRemaining: wethStreamRaw[3],
      }
    : undefined;

  // Current APYs from indexer (only when on the right chain)
  const hasIndexer =
    !!VAULT_INDEXER_URL && VAULT_INDEXER_CHAIN_ID === selectedChainId;
  const currentWchanApy = useMemo(
    () => (hasIndexer && indexerApy ? indexerApy.wchanAPY : null),
    [hasIndexer, indexerApy],
  );
  const currentWethApy = useMemo(
    () =>
      hasIndexer && indexerApy
        ? computeCurrentWethApy(indexerApy, ethPrice, wchanPrice)
        : null,
    [hasIndexer, indexerApy, ethPrice, wchanPrice],
  );

  // canDrip check
  const { data: canDripData, refetch: refetchCanDrip } = useReadContract({
    address: dripAddr,
    abi: dripRewardsAbi,
    functionName: "canDrip",
    chainId: selectedChainId,
    query: { refetchInterval: POLL_MS },
  });
  const canDripEither =
    canDripData !== undefined &&
    ((canDripData as [boolean, boolean])[0] || (canDripData as [boolean, boolean])[1]);

  // Drip transaction
  const {
    writeContract: writeDripTx,
    data: dripTriggerTxHash,
    isPending: isDripTriggering,
    reset: resetDripTrigger,
  } = useWriteContract();
  const { isLoading: isDripTriggerConfirming, isSuccess: isDripTriggerConfirmed } =
    useWaitForTransactionReceipt({ hash: dripTriggerTxHash });

  useEffect(() => {
    if (isDripTriggerConfirmed) {
      toast({
        title: "Drip executed",
        description: (
          <>
            Tokens dripped into the vault.{" "}
            {explorerUrl && dripTriggerTxHash && (
              <a href={`${explorerUrl}/tx/${dripTriggerTxHash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
                View on explorer
              </a>
            )}
          </>
        ),
        status: "success",
        duration: 10000,
        isClosable: true,
        position: "bottom-right",
      });
      resetDripTrigger();
      refetchCanDrip();
      refetchAssets();
    }
  }, [isDripTriggerConfirmed, dripTriggerTxHash, explorerUrl, toast, resetDripTrigger, refetchCanDrip, refetchAssets]);

  const handleDripTrigger = useCallback(() => {
    writeDripTx(
      {
        address: dripAddr,
        abi: dripRewardsAbi,
        functionName: "drip",
        chainId: selectedChainId,
      },
      {
        onError: (err) => {
          toast({
            title: "Drip failed",
            description: err.message.split("\n")[0],
            status: "error",
            duration: 5000,
            isClosable: true,
            position: "bottom-right",
          });
        },
      },
    );
  }, [writeDripTx, dripAddr, selectedChainId, toast]);

  // Compute next drip time (lastDripTimestamp + 1 hour)
  const nextDripTime = useMemo(() => {
    const MIN_INTERVAL = 3600n; // 1 hour
    const times: bigint[] = [];
    if (wchanStreamRaw && wchanStreamRaw[3] > 0n) {
      times.push(wchanStreamRaw[2] + MIN_INTERVAL); // lastDripTimestamp + 1h
    }
    if (wethStreamRaw && wethStreamRaw[3] > 0n) {
      times.push(wethStreamRaw[2] + MIN_INTERVAL);
    }
    if (times.length === 0) return null;
    // Earliest of the two
    const earliest = times.reduce((a, b) => (a < b ? a : b));
    return new Date(Number(earliest) * 1000);
  }, [wchanStreamRaw, wethStreamRaw]);

  const isDripBusy = isDripTriggering || isDripTriggerConfirming;

  const refetchAll = useCallback(() => {
    refetchAssets();
    refetchWchan();
    refetchWeth();
    refetchEth();
    refetchWchanAllow();
    refetchWethAllow();
    refetchCanDrip();
  }, [refetchAssets, refetchWchan, refetchWeth, refetchEth, refetchWchanAllow, refetchWethAllow, refetchCanDrip]);

  return (
    <Box
      bg="white"
      border={{ base: "2px solid", lg: "4px solid" }}
      borderColor="bauhaus.border"
      boxShadow={{ base: "3px 3px 0px 0px #121212", lg: "8px 8px 0px 0px #121212" }}
      position="relative"
      overflow="hidden"
    >
      {/* Yellow accent bar */}
      <Box h="6px" bg="bauhaus.yellow" />

      <Box p={{ base: 5, lg: 8 }}>
        {/* Header with chain selector */}
        <Flex justify="space-between" align="center" mb={4} flexWrap="wrap" gap={2}>
          <HStack spacing={3}>
            <Box w={2} h={2} bg="bauhaus.yellow" borderRadius="full" />
            <Text
              fontWeight="bold"
              fontSize="xs"
              textTransform="uppercase"
              letterSpacing="widest"
              color="gray.500"
            >
              WCHAN Drip Configuration
            </Text>
          </HStack>

          {/* Chain selector pills */}
          <HStack spacing={0} border="2px solid" borderColor="bauhaus.border">
            {Object.keys(DRIP_CHAINS).map((id) => {
              const chainId = Number(id);
              const isActive = chainId === selectedChainId;
              return (
                <Button
                  key={id}
                  size="xs"
                  borderRadius={0}
                  bg={isActive ? "bauhaus.black" : "white"}
                  color={isActive ? "white" : "bauhaus.black"}
                  fontWeight="900"
                  textTransform="uppercase"
                  letterSpacing="wide"
                  fontSize="xs"
                  _hover={{ bg: isActive ? "bauhaus.black" : "gray.100" }}
                  onClick={() => setSelectedChainId(chainId)}
                  px={3}
                >
                  {getChainName(chainId)}
                </Button>
              );
            })}
          </HStack>
        </Flex>

        {/* Wrong chain banner */}
        {isWrongChain && (
          <HStack
            justify="center"
            spacing={3}
            bg="bauhaus.red"
            border="2px solid"
            borderColor="bauhaus.border"
            px={4}
            py={2}
            mb={4}
          >
            <AlertTriangle size={16} color="white" />
            <Text
              fontSize="xs"
              fontWeight="800"
              textTransform="uppercase"
              letterSpacing="wide"
              color="white"
            >
              Wrong Network
            </Text>
            <Button
              size="xs"
              bg="white"
              color="bauhaus.black"
              fontWeight="900"
              textTransform="uppercase"
              letterSpacing="wide"
              borderRadius={0}
              border="2px solid"
              borderColor="bauhaus.black"
              _hover={{ bg: "gray.100" }}
              onClick={() => switchChain({ chainId: selectedChainId })}
            >
              Switch to {getChainName(selectedChainId)}
            </Button>
          </HStack>
        )}

        {/* Not owner banner */}
        {isNotOwner && (
          <HStack
            justify="center"
            spacing={3}
            bg="orange.400"
            border="2px solid"
            borderColor="bauhaus.border"
            px={4}
            py={2}
            mb={4}
          >
            <AlertTriangle size={16} color="white" />
            <Text
              fontSize="xs"
              fontWeight="800"
              textTransform="uppercase"
              letterSpacing="wide"
              color="white"
            >
              Not Contract Owner
            </Text>
            <Text fontSize="xs" fontWeight="700" color="white">
              Owner: {(dripOwner as string).slice(0, 6)}...{(dripOwner as string).slice(-4)}
            </Text>
          </HStack>
        )}

        {/* Vault stats + drip trigger */}
        <Flex mb={4} justify="space-between" align="center" flexWrap="wrap" gap={2}>
          <Text fontSize="xs" fontWeight="700" color="gray.500">
            Vault Total Assets:{" "}
            <Text as="span" fontWeight="900" color="bauhaus.black">
              {vaultTotalAssets ? fmtBal(vaultTotalAssets) : "—"} WCHAN
            </Text>
            {weiToUsd(vaultTotalAssets as bigint | undefined, wchanPrice) && (
              <Text as="span" fontWeight="700" color="gray.400">
                {" "}{weiToUsd(vaultTotalAssets as bigint | undefined, wchanPrice)}
              </Text>
            )}
          </Text>
          <HStack spacing={3}>
            {!canDripEither && nextDripTime && (
              <Text fontSize="xs" fontWeight="700" color="gray.400">
                Next drip: {nextDripTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            )}
            <Button
              size="xs"
              variant="primary"
              borderRadius={0}
              fontWeight="900"
              textTransform="uppercase"
              letterSpacing="wide"
              onClick={handleDripTrigger}
              isLoading={isDripBusy}
              loadingText="Dripping..."
              isDisabled={!isWalletConnected || isWrongChain || !canDripEither || isDripBusy}
            >
              Drip
            </Button>
          </HStack>
        </Flex>

        {/* Current net APY summary */}
        {hasIndexer && (currentWchanApy !== null || currentWethApy !== null) && (
          <Box
            mb={4}
            p={4}
            bg="gray.50"
            border="2px solid"
            borderColor="bauhaus.border"
          >
            <Text
              fontSize="xs"
              fontWeight="bold"
              textTransform="uppercase"
              letterSpacing="widest"
              color="gray.500"
              mb={2}
            >
              Current Net APY (7d)
            </Text>
            <HStack spacing={4} align="baseline">
              <Text fontWeight="black" fontSize="2xl" lineHeight="1" color="bauhaus.black">
                {((currentWchanApy ?? 0) + (currentWethApy ?? 0)).toFixed(2)}%
              </Text>
              <HStack spacing={1}>
                <Text fontSize="xs" fontWeight="700" color="gray.400" textTransform="uppercase">
                  WCHAN
                </Text>
                <Text fontSize="xs" fontWeight="black" color="bauhaus.blue">
                  {currentWchanApy !== null ? `${currentWchanApy.toFixed(2)}%` : "—"}
                </Text>
              </HStack>
              <Text fontSize="xs" fontWeight="900" color="gray.400">+</Text>
              <HStack spacing={1}>
                <Text fontSize="xs" fontWeight="700" color="gray.400" textTransform="uppercase">
                  WETH
                </Text>
                <Text fontSize="xs" fontWeight="black" color="bauhaus.red">
                  {currentWethApy !== null ? `${currentWethApy.toFixed(2)}%` : "—"}
                </Text>
              </HStack>
            </HStack>
          </Box>
        )}

        {/* Two stream columns */}
        <Flex gap={{ base: 4, lg: 6 }} direction={{ base: "column", lg: "row" }}>
          <StreamInput
            label="WCHAN Stream"
            tokenSymbol="WCHAN"
            accentColor="bauhaus.blue"
            balance={wchanBalance as bigint | undefined}
            ethBalance={undefined}
            isWeth={false}
            existingStream={wchanStream}
            vaultTotalAssets={vaultTotalAssets as bigint | undefined}
            allowance={wchanAllowance as bigint | undefined}
            dripAddress={dripAddr}
            tokenAddress={wchanAddr}
            wethAddress={wethAddr}
            selectedChainId={selectedChainId}
            isWalletConnected={isWalletConnected}
            isWrongChain={isWrongChain}
            isNotOwner={!!isNotOwner}
            dripTokenPrice={wchanPrice}
            wchanPrice={wchanPrice}
            explorerUrl={explorerUrl}
            currentApy={currentWchanApy}
            onSuccess={refetchAll}
          />
          <StreamInput
            label="WETH Stream"
            tokenSymbol="WETH"
            accentColor="bauhaus.red"
            balance={wethBalance as bigint | undefined}
            ethBalance={ethBalance}
            isWeth={true}
            existingStream={wethStream}
            vaultTotalAssets={vaultTotalAssets as bigint | undefined}
            allowance={wethAllowance as bigint | undefined}
            dripAddress={dripAddr}
            tokenAddress={wethAddr}
            wethAddress={wethAddr}
            selectedChainId={selectedChainId}
            isWalletConnected={isWalletConnected}
            isWrongChain={isWrongChain}
            isNotOwner={!!isNotOwner}
            dripTokenPrice={ethPrice}
            wchanPrice={wchanPrice}
            explorerUrl={explorerUrl}
            currentApy={currentWethApy}
            onSuccess={refetchAll}
          />
        </Flex>

        {/* Vault stake/unstake */}
        <VaultStake
            wchanAddress={wchanAddr}
            vaultAddress={vaultAddr}
            chainId={selectedChainId}
            chainName={getChainName(selectedChainId)}
            isWalletConnected={isWalletConnected}
            isWrongChain={isWrongChain}
            explorerUrl={explorerUrl}
            onSuccess={refetchAll}
          />

        {/* Vault indexer stats */}
        <VaultStats
          selectedChainId={selectedChainId}
          ethPrice={ethPrice}
          wchanPrice={wchanPrice}
        />
      </Box>
    </Box>
  );
}
