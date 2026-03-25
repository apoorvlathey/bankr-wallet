"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Container,
  VStack,
  HStack,
  Text,
  Skeleton,
  Flex,
  IconButton,
  Button,
  Image,
  Link,
  Tooltip,
  useToast,
} from "@chakra-ui/react";
import { RefreshCw, AlertTriangle, ExternalLink as ExternalLinkIcon, Info } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, encodeFunctionData, encodeAbiParameters } from "viem";
import { Navigation } from "../components/Navigation";
import { WCHAN_TOKEN_ADDRESS } from "@walletchan/shared/contracts";
import { erc20Abi, weth9Abi } from "./drip/abi";
import { ADDRESSES } from "@/lib/wchan-swap/addresses";
import { useTokenData } from "../contexts/TokenDataContext";
import {
  useV4PositionFees,
  POSITION_MANAGER,
  positionManagerAbi,
  buildClaimCalldata,
  V4_CHAIN_ID,
} from "./useV4PositionFees";
import ClaimHistory from "./ClaimHistory";
import DripSection from "./drip/DripSection";

const BASE_CHAIN_ID = 8453;
const HOOK_ADDRESS = ADDRESSES[BASE_CHAIN_ID].hook as `0x${string}`;

const HOOK_ABI = [
  {
    inputs: [],
    name: "pendingFees",
    outputs: [
      { name: "wethAmount", type: "uint256" },
      { name: "wchanAmount", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "claimFees",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const CLANKER_FEE_LOCKER = "0xF3622742b1E446D92e45E22923Ef11C2fcD55D68" as `0x${string}`;
const CLANKER_FEE_OWNER = "0x74992be74bc3c3a72e97df34a2c3a62c15f55970" as `0x${string}`;
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006" as `0x${string}`;
const BNKRW_ADDRESS = "0xf48bC234855aB08ab2EC0cfaaEb2A80D065a3b07" as `0x${string}`;

const CLANKER_FEE_ABI = [
  {
    inputs: [
      { name: "feeOwner", type: "address" },
      { name: "token", type: "address" },
    ],
    name: "availableFees",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "feeOwner", type: "address" },
      { name: "token", type: "address" },
    ],
    name: "claim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const ETH_PRICE_POLL_MS = 30_000; // 30s
const FEES_POLL_MS = 5_000; // 5s

const WCHAN_ADDR = WCHAN_TOKEN_ADDRESS as `0x${string}`;
const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD" as `0x${string}`;
const WCHAN_TOTAL_SUPPLY = 100_000_000_000; // 100B
const DESTINATION_ADDRESS = "0xab7def16d63c49422bd8692e118ab780eb5410e6" as `0x${string}`; // walletchan.eth
const MAX_UINT256 = 2n ** 256n - 1n;

const ERC7821Abi = [
  {
    inputs: [
      { name: "mode", type: "bytes32" },
      { name: "executionData", type: "bytes" },
    ],
    name: "execute",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

const ERC7821_BATCH_MODE =
  "0x0100000000007821000100000000000000000000000000000000000000000000" as `0x${string}`;

const wchanWrapAbi = [
  {
    inputs: [{ name: "amount_", type: "uint256" }],
    name: "wrap",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;


function formatEth(wei: bigint | undefined): string {
  if (!wei) return "0";
  const eth = formatUnits(wei, 18);
  const num = parseFloat(eth);
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  });
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (value < 0.01 && value > 0) return `<$0.01`;
  return `$${value.toFixed(2)}`;
}

export default function AdminContent() {
  const toast = useToast();
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [ethPriceLoading, setEthPriceLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { tokenData } = useTokenData();

  // refreshKey incremented after claims confirm to trigger ClaimHistory refetch
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  // Chain detection
  const { address, isConnected: isWalletConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const isWrongChain = isWalletConnected && chainId !== BASE_CHAIN_ID;

  // Poll pendingFees from the hook contract
  const { data: pendingFees, isLoading: feesLoading, refetch: refetchFees } = useReadContract({
    address: HOOK_ADDRESS,
    abi: HOOK_ABI,
    functionName: "pendingFees",
    chainId: BASE_CHAIN_ID,
    query: {
      refetchInterval: FEES_POLL_MS,
    },
  });

  // Fetch ETH price from CoinGecko
  const fetchEthPrice = useCallback(async () => {
    try {
      const res = await fetch("/api/eth-price");
      const data = await res.json();
      if (data?.ethereum?.usd) {
        setEthPrice(data.ethereum.usd);
      }
    } catch (err) {
      console.error("Failed to fetch ETH price:", err);
    } finally {
      setEthPriceLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEthPrice();
    const interval = setInterval(fetchEthPrice, ETH_PRICE_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchEthPrice]);

  // Claim fees
  const { writeContract, data: claimTxHash, isPending: isClaiming } = useWriteContract();
  const { isLoading: isClaimConfirming, isSuccess: isClaimConfirmed } =
    useWaitForTransactionReceipt({ hash: claimTxHash });

  // Force refetch after claim confirms (with delay for indexing)
  useEffect(() => {
    if (isClaimConfirmed && claimTxHash) {
      const txUrl = `https://basescan.org/tx/${claimTxHash}`;
      toast({
        title: "Hook fees claimed",
        description: (
          <>
            ETH fees have been claimed.{" "}
            <a href={txUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
              View on BaseScan
            </a>
          </>
        ),
        status: "success",
        duration: 10000,
        isClosable: true,
        position: "bottom-right",
      });
      const timeout = setTimeout(() => {
        refetchFees();
        fetchEthPrice();
        setHistoryRefreshKey((k) => k + 1);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [isClaimConfirmed, claimTxHash, refetchFees, fetchEthPrice, toast]);

  const handleClaim = () => {
    writeContract({
      address: HOOK_ADDRESS,
      abi: HOOK_ABI,
      functionName: "claimFees",
      chainId: BASE_CHAIN_ID,
    });
  };

  // Clanker fee reads
  const {
    data: clankerWethFees,
    isLoading: clankerWethLoading,
    refetch: refetchClankerWeth,
  } = useReadContract({
    address: CLANKER_FEE_LOCKER,
    abi: CLANKER_FEE_ABI,
    functionName: "availableFees",
    args: [CLANKER_FEE_OWNER, WETH_ADDRESS],
    chainId: BASE_CHAIN_ID,
    query: { refetchInterval: FEES_POLL_MS },
  });

  const {
    data: clankerBnkrwFees,
    isLoading: clankerBnkrwLoading,
    refetch: refetchClankerBnkrw,
  } = useReadContract({
    address: CLANKER_FEE_LOCKER,
    abi: CLANKER_FEE_ABI,
    functionName: "availableFees",
    args: [CLANKER_FEE_OWNER, BNKRW_ADDRESS],
    chainId: BASE_CHAIN_ID,
    query: { refetchInterval: FEES_POLL_MS },
  });

  // Burned WCHAN balance
  const { data: burnedWchanRaw, isLoading: burnedWchanLoading } = useReadContract({
    address: WCHAN_ADDR,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [BURN_ADDRESS],
    chainId: BASE_CHAIN_ID,
    query: { refetchInterval: FEES_POLL_MS },
  });

  // BNKRW allowance for WCHAN (needed for batch claim)
  const { data: bnkrwAllowanceForWchan } = useReadContract({
    address: BNKRW_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, WCHAN_ADDR] : undefined,
    chainId: BASE_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: FEES_POLL_MS },
  });

  // Clanker claim WETH
  const {
    writeContract: claimClankerWeth,
    data: clankerWethTxHash,
    isPending: isClankerWethClaiming,
  } = useWriteContract();
  const { isLoading: isClankerWethConfirming, isSuccess: isClankerWethConfirmed } =
    useWaitForTransactionReceipt({ hash: clankerWethTxHash });

  // Clanker claim BNKRW
  const {
    writeContract: claimClankerBnkrw,
    data: clankerBnkrwTxHash,
    isPending: isClankerBnkrwClaiming,
  } = useWriteContract();
  const { isLoading: isClankerBnkrwConfirming, isSuccess: isClankerBnkrwConfirmed } =
    useWaitForTransactionReceipt({ hash: clankerBnkrwTxHash });

  // Batch claim
  const {
    writeContract: writeBatchClaim,
    data: batchClaimTxHash,
    isPending: isBatchClaiming,
  } = useWriteContract();
  const { isLoading: isBatchConfirming, isSuccess: isBatchConfirmed } =
    useWaitForTransactionReceipt({ hash: batchClaimTxHash });

  // Refetch after Clanker claims confirm
  useEffect(() => {
    if (isClankerWethConfirmed && clankerWethTxHash) {
      const txUrl = `https://basescan.org/tx/${clankerWethTxHash}`;
      toast({
        title: "Clanker WETH claimed",
        description: (
          <>
            WETH fees have been claimed.{" "}
            <a href={txUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
              View on BaseScan
            </a>
          </>
        ),
        status: "success",
        duration: 10000,
        isClosable: true,
        position: "bottom-right",
      });
      const timeout = setTimeout(() => {
        refetchClankerWeth();
        setHistoryRefreshKey((k) => k + 1);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [isClankerWethConfirmed, clankerWethTxHash, refetchClankerWeth, toast]);

  useEffect(() => {
    if (isClankerBnkrwConfirmed && clankerBnkrwTxHash) {
      const txUrl = `https://basescan.org/tx/${clankerBnkrwTxHash}`;
      toast({
        title: "Clanker BNKRW claimed",
        description: (
          <>
            BNKRW fees have been claimed.{" "}
            <a href={txUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
              View on BaseScan
            </a>
          </>
        ),
        status: "success",
        duration: 10000,
        isClosable: true,
        position: "bottom-right",
      });
      const timeout = setTimeout(() => {
        refetchClankerBnkrw();
        setHistoryRefreshKey((k) => k + 1);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [isClankerBnkrwConfirmed, clankerBnkrwTxHash, refetchClankerBnkrw, toast]);

  const handleClaimClankerWeth = () => {
    claimClankerWeth({
      address: CLANKER_FEE_LOCKER,
      abi: CLANKER_FEE_ABI,
      functionName: "claim",
      args: [CLANKER_FEE_OWNER, WETH_ADDRESS],
      chainId: BASE_CHAIN_ID,
    });
  };

  const handleClaimClankerBnkrw = () => {
    claimClankerBnkrw({
      address: CLANKER_FEE_LOCKER,
      abi: CLANKER_FEE_ABI,
      functionName: "claim",
      args: [CLANKER_FEE_OWNER, BNKRW_ADDRESS],
      chainId: BASE_CHAIN_ID,
    });
  };

  // V4 LP position fees
  const {
    ethFees: v4EthFees,
    wchanFees: v4WchanFees,
    isLoading: v4Loading,
    hasClaimable: hasV4Claimable,
    refetch: refetchV4,
  } = useV4PositionFees();

  // V4 claim
  const {
    writeContract: claimV4,
    data: v4TxHash,
    isPending: isV4Claiming,
  } = useWriteContract();
  const { isLoading: isV4Confirming, isSuccess: isV4Confirmed } =
    useWaitForTransactionReceipt({ hash: v4TxHash });

  const v4ToastedTxRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (isV4Confirmed && v4TxHash && v4ToastedTxRef.current !== v4TxHash) {
      v4ToastedTxRef.current = v4TxHash;
      const txUrl = `https://basescan.org/tx/${v4TxHash}`;
      toast({
        title: "V4 LP fees claimed",
        description: (
          <>
            LP fees have been claimed.{" "}
            <a href={txUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
              View on BaseScan
            </a>
          </>
        ),
        status: "success",
        duration: 10000,
        isClosable: true,
        position: "bottom-right",
      });
      const timeout = setTimeout(() => {
        refetchV4();
        fetchEthPrice();
        setHistoryRefreshKey((k) => k + 1);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [isV4Confirmed, v4TxHash, refetchV4, fetchEthPrice, toast]);

  const handleClaimV4 = () => {
    const { unlockData, deadline } = buildClaimCalldata();
    claimV4({
      address: POSITION_MANAGER,
      abi: positionManagerAbi,
      functionName: "modifyLiquidities",
      args: [unlockData, deadline],
      chainId: V4_CHAIN_ID,
    });
  };

  // Batch claim: only enabled for the fee owner address
  const isOwner = address?.toLowerCase() === CLANKER_FEE_OWNER.toLowerCase();

  // Batch claim handler — builds a single ERC-7821 batched tx that:
  //   1. Claims WETH fees from Clanker fee locker
  //   2. Claims BNKRW fees from Clanker fee locker
  //   3. Approves BNKRW spend on WCHAN contract (if allowance insufficient)
  //   4. Wraps claimed BNKRW → WCHAN (1:1)
  //   5. Unwraps claimed WETH → ETH
  //   6. Transfers WCHAN to walletchan.eth (DESTINATION_ADDRESS)
  //   7. Sends ETH to walletchan.eth (DESTINATION_ADDRESS)
  // Steps are conditionally included based on whether each token amount > 0.
  const handleBatchClaim = () => {
    if (!address) return;

    const wethAmount = clankerWethFees ?? 0n;
    const bnkrwAmount = clankerBnkrwFees ?? 0n;
    const hasWeth = wethAmount > 0n;
    const hasBnkrw = bnkrwAmount > 0n;

    const calls: { to: `0x${string}`; value: bigint; data: `0x${string}` }[] = [];

    // 1. Claim WETH from Clanker fee locker
    if (hasWeth) {
      calls.push({
        to: CLANKER_FEE_LOCKER,
        value: 0n,
        data: encodeFunctionData({ abi: CLANKER_FEE_ABI, functionName: "claim", args: [CLANKER_FEE_OWNER, WETH_ADDRESS] }),
      });
    }

    // 2. Claim BNKRW from Clanker fee locker
    if (hasBnkrw) {
      calls.push({
        to: CLANKER_FEE_LOCKER,
        value: 0n,
        data: encodeFunctionData({ abi: CLANKER_FEE_ABI, functionName: "claim", args: [CLANKER_FEE_OWNER, BNKRW_ADDRESS] }),
      });
    }

    // 3. Approve BNKRW → WCHAN contract (infinite allowance, only if current allowance < claimed amount)
    if (hasBnkrw) {
      const currentAllowance = (bnkrwAllowanceForWchan as bigint) ?? 0n;
      if (currentAllowance < bnkrwAmount) {
        calls.push({
          to: BNKRW_ADDRESS,
          value: 0n,
          data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [WCHAN_ADDR, MAX_UINT256] }),
        });
      }
    }

    // 4. Wrap BNKRW → WCHAN (1:1 ratio)
    if (hasBnkrw) {
      calls.push({
        to: WCHAN_ADDR,
        value: 0n,
        data: encodeFunctionData({ abi: wchanWrapAbi, functionName: "wrap", args: [bnkrwAmount] }),
      });
    }

    // 5. Unwrap WETH → ETH
    if (hasWeth) {
      calls.push({
        to: WETH_ADDRESS,
        value: 0n,
        data: encodeFunctionData({ abi: weth9Abi, functionName: "withdraw", args: [wethAmount] }),
      });
    }

    // 6. Transfer WCHAN to walletchan.eth
    if (hasBnkrw) {
      calls.push({
        to: WCHAN_ADDR,
        value: 0n,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [DESTINATION_ADDRESS, bnkrwAmount] }),
      });
    }

    // 7. Send ETH (native) to walletchan.eth
    if (hasWeth) {
      calls.push({
        to: DESTINATION_ADDRESS,
        value: wethAmount,
        data: "0x" as `0x${string}`,
      });
    }

    // Encode all calls as a single ERC-7821 batched execution on the connected wallet
    writeBatchClaim({
      address: address,
      abi: ERC7821Abi,
      functionName: "execute",
      args: [
        ERC7821_BATCH_MODE,
        encodeAbiParameters(
          [
            {
              type: "tuple[]",
              components: [
                { type: "address", name: "to" },
                { type: "uint256", name: "value" },
                { type: "bytes", name: "data" },
              ],
            },
          ],
          [calls],
        ),
      ],
      chainId: BASE_CHAIN_ID,
    });
  };

  // Refetch after batch claim confirms
  const batchToastedTxRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (isBatchConfirmed && batchClaimTxHash && batchToastedTxRef.current !== batchClaimTxHash) {
      batchToastedTxRef.current = batchClaimTxHash;
      const txUrl = `https://basescan.org/tx/${batchClaimTxHash}`;
      toast({
        title: "Batch claim & send complete",
        description: (
          <>
            Fees claimed, wrapped, and sent to walletchan.eth.{" "}
            <a href={txUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
              View on BaseScan
            </a>
          </>
        ),
        status: "success",
        duration: 10000,
        isClosable: true,
        position: "bottom-right",
      });
      const timeout = setTimeout(() => {
        refetchClankerWeth();
        refetchClankerBnkrw();
        fetchEthPrice();
        setHistoryRefreshKey((k) => k + 1);
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [isBatchConfirmed, batchClaimTxHash, refetchClankerWeth, refetchClankerBnkrw, fetchEthPrice, toast]);

  // Clanker derived values
  const clankerWethFloat = clankerWethFees
    ? parseFloat(formatUnits(clankerWethFees, 18))
    : 0;
  const clankerWethUsd = ethPrice ? clankerWethFloat * ethPrice : null;
  const hasClankerWeth = clankerWethFees !== undefined && clankerWethFees > 0n;

  const clankerBnkrwFloat = clankerBnkrwFees
    ? parseFloat(formatUnits(clankerBnkrwFees, 18))
    : 0;
  const bnkrwPrice = tokenData?.priceRaw ?? null;
  const clankerBnkrwUsd = bnkrwPrice ? clankerBnkrwFloat * bnkrwPrice : null;
  const hasClankerBnkrw = clankerBnkrwFees !== undefined && clankerBnkrwFees > 0n;

  const wethAmount = pendingFees?.[0];
  const ethFloat = wethAmount ? parseFloat(formatUnits(wethAmount, 18)) : 0;
  const usdValue = ethPrice ? ethFloat * ethPrice : null;
  const wchanAmount = pendingFees?.[1];
  const wchanFloat = wchanAmount ? parseFloat(formatUnits(wchanAmount, 18)) : 0;
  const wchanUsd = bnkrwPrice ? wchanFloat * bnkrwPrice : null;
  const hasClaimable = wethAmount !== undefined && wethAmount > 0n;

  // V4 derived values
  const v4EthFloat = v4EthFees ? parseFloat(formatUnits(v4EthFees, 18)) : 0;
  const v4EthUsd = ethPrice ? v4EthFloat * ethPrice : null;
  const v4WchanFloat = v4WchanFees ? parseFloat(formatUnits(v4WchanFees, 18)) : 0;
  const v4WchanUsd = bnkrwPrice ? v4WchanFloat * bnkrwPrice : null;
  const v4TotalUsd =
    v4EthUsd !== null || v4WchanUsd !== null
      ? (v4EthUsd ?? 0) + (v4WchanUsd ?? 0)
      : null;

  // Totals across all sources
  const totalEthFloat = ethFloat + clankerWethFloat + v4EthFloat;
  const totalEthUsd = ethPrice ? totalEthFloat * ethPrice : null;
  const totalBnkrwUsd = clankerBnkrwUsd;
  const totalClaimableUsd =
    totalEthUsd !== null || totalBnkrwUsd !== null || v4WchanUsd !== null
      ? (totalEthUsd ?? 0) + (totalBnkrwUsd ?? 0) + (v4WchanUsd ?? 0)
      : null;
  const allFeesLoading = feesLoading || clankerWethLoading || clankerBnkrwLoading || v4Loading;

  return (
    <Box minH="100vh" bg="bauhaus.background">
      <Navigation />

      <Container maxW="4xl" py={12}>
        <VStack spacing={8} align="stretch">
          {/* Header */}
          <Flex justify="space-between" align="center">
            <HStack spacing={4}>
              {/* Geometric logo cluster */}
              <VStack spacing={0}>
                <Box w={3} h={3} bg="bauhaus.red" borderRadius="full" />
                <Box w={3} h={3} bg="bauhaus.blue" transform="rotate(45deg)" mt={-0.5} />
              </VStack>
              <Box>
                <Text
                  fontWeight="black"
                  fontSize={{ base: "2xl", lg: "3xl" }}
                  textTransform="uppercase"
                  letterSpacing="tighter"
                  lineHeight="0.9"
                >
                  Admin
                </Text>
                <Text
                  fontSize="xs"
                  fontWeight="bold"
                  textTransform="uppercase"
                  letterSpacing="widest"
                  color="gray.500"
                  mt={1}
                >
                  Fee Dashboard &middot; Base
                </Text>
              </Box>
            </HStack>
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
          </Flex>

          {/* Wrong Chain Banner */}
          {isWrongChain && (
            <HStack
              justify="center"
              spacing={3}
              bg="bauhaus.red"
              border={{ base: "2px solid", lg: "4px solid" }}
              borderColor="bauhaus.border"
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
                onClick={() => switchChain({ chainId: BASE_CHAIN_ID })}
                leftIcon={<Image src="/images/base.svg" alt="Base" w="18px" h="18px" />}
              >
                Switch to Base
              </Button>
            </HStack>
          )}

          {/* Total Claimable (parent card with nested sub-cards) */}
          <Box
            bg="white"
            border={{ base: "2px solid", lg: "4px solid" }}
            borderColor="bauhaus.border"
            boxShadow={{ base: "3px 3px 0px 0px #121212", lg: "8px 8px 0px 0px #121212" }}
            position="relative"
            overflow="hidden"
          >
            {/* Yellow accent bar at top */}
            <Box h="6px" bg="bauhaus.yellow" />

            <Box p={{ base: 5, lg: 8 }}>
              {/* Total Summary */}
              <HStack mb={4} spacing={3}>
                <Box w={2} h={2} bg="bauhaus.yellow" borderRadius="full" />
                <Text
                  fontWeight="bold"
                  fontSize="xs"
                  textTransform="uppercase"
                  letterSpacing="widest"
                  color="gray.500"
                >
                  Total Claimable
                </Text>
                <IconButton
                  aria-label="Refresh all fees"
                  icon={
                    <Box
                      as={RefreshCw}
                      size={14}
                      animation={isRefreshing ? "spin 1s linear infinite" : undefined}
                      sx={{
                        "@keyframes spin": {
                          from: { transform: "rotate(0deg)" },
                          to: { transform: "rotate(360deg)" },
                        },
                      }}
                    />
                  }
                  size="xs"
                  variant="ghost"
                  color="gray.400"
                  _hover={{ color: "bauhaus.black" }}
                  onClick={() => {
                    setIsRefreshing(true);
                    refetchFees();
                    refetchClankerWeth();
                    refetchClankerBnkrw();
                    refetchV4();
                    fetchEthPrice();
                    setTimeout(() => setIsRefreshing(false), 1500);
                  }}
                />
              </HStack>

              {allFeesLoading || ethPriceLoading ? (
                <Skeleton h="56px" w="280px" mb={4} />
              ) : totalClaimableUsd !== null ? (
                <Text
                  fontWeight="black"
                  fontSize={{ base: "4xl", lg: "6xl" }}
                  lineHeight="1"
                  mb={4}
                  letterSpacing="tighter"
                >
                  {formatUsd(totalClaimableUsd)}
                </Text>
              ) : (
                <Text fontSize="lg" color="gray.400" mb={4}>
                  USD price unavailable
                </Text>
              )}

              <HStack spacing={6} mb={8}>
                {allFeesLoading ? (
                  <Skeleton h="20px" w="200px" />
                ) : (
                  <>
                    <Text fontWeight="bold" fontSize="sm" color="bauhaus.blue">
                      {totalEthFloat.toLocaleString(undefined, {
                        minimumFractionDigits: 4,
                        maximumFractionDigits: 6,
                      })}{" "}
                      ETH
                      {totalEthUsd !== null && (
                        <Text as="span" color="gray.400" fontWeight="normal" ml={1}>
                          ({formatUsd(totalEthUsd)})
                        </Text>
                      )}
                    </Text>
                    <Text fontWeight="bold" fontSize="sm" color="bauhaus.red">
                      {clankerBnkrwFloat.toLocaleString(undefined, {
                        minimumFractionDigits: 4,
                        maximumFractionDigits: 6,
                      })}{" "}
                      BNKRW
                      {clankerBnkrwUsd !== null && (
                        <Text as="span" color="gray.400" fontWeight="normal" ml={1}>
                          ({formatUsd(clankerBnkrwUsd)})
                        </Text>
                      )}
                    </Text>
                    <Text fontWeight="bold" fontSize="sm" color="bauhaus.yellow">
                      {v4WchanFloat.toLocaleString(undefined, {
                        minimumFractionDigits: 4,
                        maximumFractionDigits: 6,
                      })}{" "}
                      WCHAN
                      {v4WchanUsd !== null && (
                        <Text as="span" color="gray.400" fontWeight="normal" ml={1}>
                          ({formatUsd(v4WchanUsd)})
                        </Text>
                      )}
                    </Text>
                  </>
                )}
              </HStack>

              {/* Nested Fee Cards Side by Side */}
              <Flex gap={{ base: 4, lg: 6 }} direction={{ base: "column", lg: "row" }}>
                {/* Pending ETH Fees */}
                <Box
                  flex={1}
                  bg="white"
                  border="2px solid"
                  borderColor="bauhaus.border"
                  boxShadow="3px 3px 0px 0px #121212"
                  position="relative"
                  overflow="hidden"
                >
                  {/* Blue left accent */}
                  <Box
                    position="absolute"
                    left={0}
                    top={0}
                    bottom={0}
                    w="4px"
                    bg="bauhaus.blue"
                  />
                  <Box p={5} pl={6}>
                    <HStack mb={4} spacing={2}>
                      <Box w={1.5} h={1.5} bg="bauhaus.blue" borderRadius="full" />
                      <Text
                        fontWeight="bold"
                        fontSize="xs"
                        textTransform="uppercase"
                        letterSpacing="widest"
                        color="gray.500"
                      >
                        Pending ETH Fees
                      </Text>
                    </HStack>

                    <VStack spacing={3} align="stretch">
                      {feesLoading || ethPriceLoading ? (
                        <Skeleton h="32px" w="140px" />
                      ) : usdValue !== null ? (
                        <Text fontWeight="black" fontSize="2xl" lineHeight="1">
                          {formatUsd(usdValue)}
                        </Text>
                      ) : (
                        <Text fontSize="md" color="gray.400">
                          USD price unavailable
                        </Text>
                      )}

                      {feesLoading ? (
                        <Skeleton h="18px" w="100px" />
                      ) : (
                        <Text fontWeight="bold" fontSize="sm" color="bauhaus.blue">
                          {formatEth(wethAmount)} ETH
                        </Text>
                      )}

                      <Button
                        variant="primary"
                        size="md"
                        onClick={handleClaim}
                        isLoading={isClaiming || isClaimConfirming}
                        loadingText={isClaimConfirming ? "Confirming..." : "Claiming..."}
                        isDisabled={!isWalletConnected || isWrongChain || !hasClaimable}
                        mt={2}
                        w="full"
                      >
                        Claim Fees
                      </Button>

                      {/* WCHAN FYI (not included in total) */}
                      {!feesLoading && wchanFloat > 0 && (
                        <Text fontSize="xs" color="gray.400" mt={1}>
                          ISP: {formatEth(wchanAmount)} WCHAN
                          {wchanUsd !== null && ` (${formatUsd(wchanUsd)})`}
                        </Text>
                      )}
                    </VStack>
                  </Box>
                </Box>

                {/* Clanker Fees */}
                <Box
                  flex={1}
                  bg="white"
                  border="2px solid"
                  borderColor="bauhaus.border"
                  boxShadow="3px 3px 0px 0px #121212"
                  position="relative"
                  overflow="hidden"
                >
                  {/* Red left accent */}
                  <Box
                    position="absolute"
                    left={0}
                    top={0}
                    bottom={0}
                    w="4px"
                    bg="bauhaus.red"
                  />
                  <Box p={5} pl={6}>
                    <HStack mb={4} spacing={2}>
                      <Box w={1.5} h={1.5} bg="bauhaus.red" borderRadius="full" />
                      <Text
                        fontWeight="bold"
                        fontSize="xs"
                        textTransform="uppercase"
                        letterSpacing="widest"
                        color="gray.500"
                      >
                        Clanker Fees (BNKRW)
                      </Text>
                    </HStack>

                    <VStack spacing={5} align="stretch">
                      {/* WETH Row */}
                      <Flex justify="space-between" align="center">
                        <VStack spacing={1} align="stretch">
                          <Text
                            fontWeight="bold"
                            fontSize="xs"
                            textTransform="uppercase"
                            letterSpacing="wider"
                            color="gray.400"
                          >
                            WETH
                          </Text>
                          {clankerWethLoading || ethPriceLoading ? (
                            <Skeleton h="24px" w="100px" />
                          ) : clankerWethUsd !== null ? (
                            <Text fontWeight="black" fontSize="lg" lineHeight="1">
                              {formatUsd(clankerWethUsd)}
                            </Text>
                          ) : (
                            <Text fontSize="sm" color="gray.400">
                              USD price unavailable
                            </Text>
                          )}
                          {clankerWethLoading ? (
                            <Skeleton h="14px" w="80px" />
                          ) : (
                            <Text fontWeight="bold" fontSize="sm" color="bauhaus.blue">
                              {formatEth(clankerWethFees)} ETH
                            </Text>
                          )}
                        </VStack>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleClaimClankerWeth}
                          isLoading={isClankerWethClaiming || isClankerWethConfirming}
                          loadingText={isClankerWethConfirming ? "Confirming..." : "Claiming..."}
                          isDisabled={!isWalletConnected || isWrongChain || !hasClankerWeth}
                        >
                          Claim
                        </Button>
                      </Flex>

                      <Box h="2px" bg="bauhaus.border" opacity={0.1} />

                      {/* BNKRW Row */}
                      <Flex justify="space-between" align="center">
                        <VStack spacing={1} align="stretch">
                          <Text
                            fontWeight="bold"
                            fontSize="xs"
                            textTransform="uppercase"
                            letterSpacing="wider"
                            color="gray.400"
                          >
                            BNKRW
                          </Text>
                          {clankerBnkrwLoading || !bnkrwPrice ? (
                            <Skeleton h="24px" w="100px" />
                          ) : clankerBnkrwUsd !== null ? (
                            <Text fontWeight="black" fontSize="lg" lineHeight="1">
                              {formatUsd(clankerBnkrwUsd)}
                            </Text>
                          ) : (
                            <Text fontSize="sm" color="gray.400">
                              USD price unavailable
                            </Text>
                          )}
                          {clankerBnkrwLoading ? (
                            <Skeleton h="14px" w="80px" />
                          ) : (
                            <Text fontWeight="bold" fontSize="sm" color="bauhaus.red">
                              {formatEth(clankerBnkrwFees)} BNKRW
                            </Text>
                          )}
                        </VStack>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleClaimClankerBnkrw}
                          isLoading={isClankerBnkrwClaiming || isClankerBnkrwConfirming}
                          loadingText={isClankerBnkrwConfirming ? "Confirming..." : "Claiming..."}
                          isDisabled={!isWalletConnected || isWrongChain || !hasClankerBnkrw}
                        >
                          Claim
                        </Button>
                      </Flex>

                      <Box h="2px" bg="bauhaus.border" opacity={0.1} />

                      {/* Batch Claim & Send */}
                      <Flex justify="center" align="center" gap={2}>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleBatchClaim}
                          isLoading={isBatchClaiming || isBatchConfirming}
                          loadingText={isBatchConfirming ? "Confirming..." : "Claiming..."}
                          isDisabled={
                            !isWalletConnected ||
                            isWrongChain ||
                            !isOwner ||
                            (!hasClankerWeth && !hasClankerBnkrw)
                          }
                        >
                          Batch Claim & Send
                        </Button>
                        {isWalletConnected && !isOwner && (
                          <Tooltip
                            label={`Only the fee owner (${CLANKER_FEE_OWNER.slice(0, 6)}...${CLANKER_FEE_OWNER.slice(-4)}) can batch claim`}
                            fontSize="xs"
                            hasArrow
                          >
                            <Box as="span" cursor="help" color="gray.400">
                              <Info size={14} />
                            </Box>
                          </Tooltip>
                        )}
                      </Flex>
                    </VStack>
                  </Box>
                </Box>

                {/* V4 LP Fees */}
                <Box
                  flex={1}
                  bg="white"
                  border="2px solid"
                  borderColor="bauhaus.border"
                  boxShadow="3px 3px 0px 0px #121212"
                  position="relative"
                  overflow="hidden"
                >
                  {/* Yellow left accent */}
                  <Box
                    position="absolute"
                    left={0}
                    top={0}
                    bottom={0}
                    w="4px"
                    bg="bauhaus.yellow"
                  />
                  <Box p={5} pl={6}>
                    <HStack mb={4} spacing={2}>
                      <Box w={1.5} h={1.5} bg="bauhaus.yellow" borderRadius="full" />
                      <Text
                        fontWeight="bold"
                        fontSize="xs"
                        textTransform="uppercase"
                        letterSpacing="widest"
                        color="gray.500"
                      >
                        Uniswap V4 LP (WCHAN)
                      </Text>
                      <Link
                        href="https://app.uniswap.org/positions/v4/base/1956399"
                        isExternal
                        color="gray.500"
                        _hover={{ color: "bauhaus.yellow" }}
                      >
                        <ExternalLinkIcon size={14} />
                      </Link>
                    </HStack>

                    <VStack spacing={3} align="stretch">
                      {v4Loading || ethPriceLoading ? (
                        <Skeleton h="32px" w="140px" />
                      ) : v4TotalUsd !== null ? (
                        <Text fontWeight="black" fontSize="2xl" lineHeight="1">
                          {formatUsd(v4TotalUsd)}
                        </Text>
                      ) : (
                        <Text fontSize="md" color="gray.400">
                          USD price unavailable
                        </Text>
                      )}

                      {v4Loading ? (
                        <Skeleton h="18px" w="100px" />
                      ) : (
                        <>
                          <Text fontWeight="bold" fontSize="sm" color="bauhaus.blue">
                            {formatEth(v4EthFees)} ETH
                          </Text>
                          <Text fontWeight="bold" fontSize="sm" color="bauhaus.yellow">
                            {formatEth(v4WchanFees)} WCHAN
                            {v4WchanUsd !== null && (
                              <Text as="span" color="gray.400" fontWeight="normal" ml={1}>
                                ({formatUsd(v4WchanUsd)})
                              </Text>
                            )}
                          </Text>
                        </>
                      )}

                      <Button
                        variant="primary"
                        size="md"
                        onClick={handleClaimV4}
                        isLoading={isV4Claiming || isV4Confirming}
                        loadingText={isV4Confirming ? "Confirming..." : "Claiming..."}
                        isDisabled={!isWalletConnected || isWrongChain || !hasV4Claimable}
                        mt={2}
                        w="full"
                      >
                        Claim Fees
                      </Button>
                    </VStack>
                  </Box>
                </Box>
              </Flex>

              {/* Price references */}
              <HStack mt={5} spacing={4} opacity={0.6}>
                {ethPrice && (
                  <Text fontSize="xs" color="gray.500" fontWeight="medium">
                    ETH: ${ethPrice.toLocaleString()}
                  </Text>
                )}
                {tokenData && (
                  <Text fontSize="xs" color="gray.500" fontWeight="medium">
                    BNKRW MCap: {tokenData.marketCap}
                  </Text>
                )}
              </HStack>
            </Box>
          </Box>
          {/* WCHAN Drip Configuration */}
          <DripSection />
          {/* Historical Claims */}
          <ClaimHistory
            ethPrice={ethPrice}
            bnkrwPrice={bnkrwPrice}
            wchanPrice={bnkrwPrice}
            refreshKey={historyRefreshKey}
          />
          {/* Burned WCHAN */}
          <Box w="100%" mt={4}>
            <HStack justify="center" spacing={3} opacity={0.7}>
              <Text fontSize="sm" fontWeight="700" color="gray.500">
                🔥 Burned WCHAN:
              </Text>
              {burnedWchanLoading ? (
                <Skeleton h="16px" w="200px" />
              ) : burnedWchanRaw != null ? (
                <Text fontSize="sm" fontWeight="700" color="gray.500">
                  {parseFloat(formatUnits(burnedWchanRaw as bigint, 18)).toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                  {" "}
                  ({(() => {
                    const pct = (parseFloat(formatUnits(burnedWchanRaw as bigint, 18)) / WCHAN_TOTAL_SUPPLY) * 100;
                    if (pct >= 0.01) return pct.toFixed(2);
                    if (pct === 0) return "0";
                    // Show enough decimals to get first non-zero digit + 1
                    const digits = Math.max(2, -Math.floor(Math.log10(pct)) + 1);
                    return pct.toFixed(digits);
                  })()}%)
                  {bnkrwPrice != null && (
                    <>
                      {" · "}
                      {formatUsd(parseFloat(formatUnits(burnedWchanRaw as bigint, 18)) * bnkrwPrice)}
                    </>
                  )}
                </Text>
              ) : null}
              <Link
                href={`https://basescan.org/token/${WCHAN_TOKEN_ADDRESS}?a=${BURN_ADDRESS}`}
                isExternal
              >
                <ExternalLinkIcon size={14} color="gray" />
              </Link>
            </HStack>
          </Box>
          {/* Internal Pages */}
          <HStack justify="center" pt={4} spacing={4} flexWrap="wrap" opacity={0.6}>
            {[
              { href: "/swap", label: "Swap" },
              { href: "/swap-wchan", label: "Swap WCHAN" },
              { href: "/verify", label: "Verify" },
              { href: "/os", label: "OS" },
              { href: "/migrate", label: "Migrate" },
              { href: "/mainnet", label: "Bridge to Mainnet" },
              { href: "/l1-base-deploy", label: "L1 Base Token Deploy" },
              {
                href:
                  typeof window !== "undefined" &&
                  window.location.hostname === "localhost"
                    ? "/compare"
                    : "https://compare.walletchan.com",
                label: "Compare",
              },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                fontSize="xs"
                fontWeight="700"
                textTransform="uppercase"
                letterSpacing="wider"
                color="gray.500"
                _hover={{ color: "bauhaus.blue" }}
              >
                {label}
              </Link>
            ))}
          </HStack>
        </VStack>
      </Container>
    </Box>
  );
}
