"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Box,
  Container,
  VStack,
  HStack,
  Text,
  Input,
  Button,
  Flex,
  Spinner,
  Link,
  IconButton,
  useToast,
} from "@chakra-ui/react";
import {
  ExternalLink as ExternalLinkIcon,
  Copy,
  Check,
  ArrowLeft,
  ArrowRight,
  Search,
  CircleCheck,
  Clock,
  Loader,
  RefreshCw,
} from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import {
  createPublicClient,
  http,
  formatUnits,
  type Hash,
  type TransactionReceipt,
  decodeAbiParameters,
  type Address,
} from "viem";
import { mainnet, base } from "viem/chains";
import {
  publicActionsL1,
  publicActionsL2,
  getWithdrawals,
  getWithdrawalStatus,
  buildProveWithdrawal,
  getGame,
  getTimeToFinalize,
} from "viem/op-stack";
import { Navigation } from "../../components/Navigation";
import { CHAIN_RPC_URLS } from "../../wagmiConfig";
import { useBridgeHistory } from "../useBridgeHistory";
import { BridgeHistoryWidget } from "../BridgeHistoryButton";
import { mainnetHref } from "../useMainnetUrl";

// --- ABIs ---

const erc20MetadataAbi = [
  {
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const optimismPortal2Abi = [
  {
    name: "provenWithdrawals",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_withdrawalHash", type: "bytes32" },
      { name: "_proofSubmitter", type: "address" },
    ],
    outputs: [
      { name: "disputeGameProxy", type: "address" },
      { name: "timestamp", type: "uint64" },
    ],
  },
  {
    name: "finalizedWithdrawals",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const proveWithdrawalAbi = [
  {
    name: "proveWithdrawalTransaction",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_tx",
        type: "tuple",
        components: [
          { name: "nonce", type: "uint256" },
          { name: "sender", type: "address" },
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "gasLimit", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
      { name: "_disputeGameIndex", type: "uint256" },
      {
        name: "_outputRootProof",
        type: "tuple",
        components: [
          { name: "version", type: "bytes32" },
          { name: "stateRoot", type: "bytes32" },
          { name: "messagePasserStorageRoot", type: "bytes32" },
          { name: "latestBlockhash", type: "bytes32" },
        ],
      },
      { name: "_withdrawalProof", type: "bytes[]" },
    ],
    outputs: [],
  },
] as const;

const finalizeWithdrawalAbi = [
  {
    name: "finalizeWithdrawalTransaction",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_tx",
        type: "tuple",
        components: [
          { name: "nonce", type: "uint256" },
          { name: "sender", type: "address" },
          { name: "target", type: "address" },
          { name: "value", type: "uint256" },
          { name: "gasLimit", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

// --- Constants ---

const OPTIMISM_PORTAL =
  "0x49048044D57e1C92A77f79988d21Fa8fAF74E97e" as const;

// --- Types ---

type WithdrawalStatus =
  | "waiting-to-prove"
  | "ready-to-prove"
  | "waiting-to-finalize"
  | "ready-to-finalize"
  | "finalized";

interface TokenInfo {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
}

interface WithdrawalData {
  receipt: TransactionReceipt;
  withdrawal: {
    nonce: bigint;
    sender: Address;
    target: Address;
    value: bigint;
    gasLimit: bigint;
    data: Hash;
    withdrawalHash: Hash;
  };
  amount: bigint;
  localToken: TokenInfo;
  remoteToken: TokenInfo;
  status: WithdrawalStatus;
  proofTimestamp?: number;
  timeToFinalize?: { seconds: number; timestamp: number };
}

// --- Clients ---

const l1Client = createPublicClient({
  chain: mainnet,
  transport: http(CHAIN_RPC_URLS[1]),
}).extend(publicActionsL1());

const l2Client = createPublicClient({
  chain: base,
  transport: http(CHAIN_RPC_URLS[8453]),
}).extend(publicActionsL2());

// --- Helpers ---

function parseTxHash(input: string): Hash | null {
  const match = input.match(/(0x[a-fA-F0-9]{64})/);
  return match ? (match[1] as Hash) : null;
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "Ready now";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(" ");
}

async function fetchTokenInfo(
  client: typeof l1Client | typeof l2Client,
  address: Address
): Promise<TokenInfo> {
  const [name, symbol, decimals] = await Promise.all([
    client
      .readContract({ address, abi: erc20MetadataAbi, functionName: "name" })
      .catch(() => "Unknown"),
    client
      .readContract({
        address,
        abi: erc20MetadataAbi,
        functionName: "symbol",
      })
      .catch(() => "???"),
    client
      .readContract({
        address,
        abi: erc20MetadataAbi,
        functionName: "decimals",
      })
      .catch(() => 18),
  ]);
  return {
    address,
    name: name as string,
    symbol: symbol as string,
    decimals: decimals as number,
  };
}

/**
 * Decode finalizeBridgeERC20 calldata nested inside the withdrawal data.
 * Path: MessagePassed.data → relayMessage → finalizeBridgeERC20
 * Selector: 0x0166a07a
 */
function decodeBridgeTokens(data: Hash): {
  localToken: Address;
  remoteToken: Address;
  amount: bigint;
} | null {
  try {
    const hex = data.toLowerCase();
    const idx = hex.indexOf("0166a07a");
    if (idx === -1) return null;

    const params = `0x${hex.slice(idx + 8)}` as Hash;
    const decoded = decodeAbiParameters(
      [
        { name: "_localToken", type: "address" },
        { name: "_remoteToken", type: "address" },
        { name: "_from", type: "address" },
        { name: "_to", type: "address" },
        { name: "_amount", type: "uint256" },
        { name: "_extraData", type: "bytes" },
      ],
      params
    );
    // In finalizeBridgeERC20 on L1: _localToken = L1 token, _remoteToken = L2 token
    return {
      remoteToken: decoded[0] as Address, // L1 token
      localToken: decoded[1] as Address, // L2 token (Base)
      amount: decoded[4] as bigint,
    };
  } catch {
    return null;
  }
}

// --- Sub-Components ---

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Box
      as="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      cursor="pointer"
      ml={1}
      display="inline-flex"
      alignItems="center"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </Box>
  );
}

function AddressDisplay({
  address,
  explorer,
}: {
  address: string;
  explorer: string;
}) {
  return (
    <HStack spacing={1} fontSize="sm">
      <Text fontFamily="mono" fontSize="xs">
        {shortenAddress(address)}
      </Text>
      <CopyButton text={address} />
      <Link href={`${explorer}/address/${address}`} isExternal>
        <ExternalLinkIcon size={12} />
      </Link>
    </HStack>
  );
}

function StepIndicator({ currentStatus }: { currentStatus: WithdrawalStatus }) {
  const steps = [
    { label: "Initiated", key: "initiated" },
    { label: "Prove", key: "prove" },
    { label: "Finalize", key: "finalize" },
  ];

  const statusToStep: Record<WithdrawalStatus, number> = {
    "waiting-to-prove": 1,
    "ready-to-prove": 1,
    "waiting-to-finalize": 2,
    "ready-to-finalize": 2,
    finalized: 3,
  };
  const current = statusToStep[currentStatus];

  return (
    <HStack spacing={0} w="full" justify="center">
      {steps.map((step, i) => {
        const stepNum = i + 1;
        const isComplete = stepNum < current;
        const isCurrent = stepNum === current;
        const isFinalized =
          currentStatus === "finalized" && stepNum === steps.length;
        const bg = isComplete || isFinalized
          ? "bauhaus.blue"
          : isCurrent
          ? "bauhaus.red"
          : "bauhaus.muted";
        const color =
          isComplete || isCurrent || isFinalized
            ? "white"
            : "bauhaus.foreground";

        return (
          <HStack key={step.key} spacing={0}>
            <VStack spacing={1}>
              <Flex
                w={10}
                h={10}
                align="center"
                justify="center"
                bg={bg}
                color={color}
                border="2px solid"
                borderColor="bauhaus.border"
                fontWeight="black"
                fontSize="lg"
              >
                {isComplete || isFinalized ? (
                  <CircleCheck size={20} />
                ) : (
                  stepNum
                )}
              </Flex>
              <Text
                fontSize="xs"
                fontWeight="bold"
                textTransform="uppercase"
                whiteSpace="nowrap"
              >
                {step.label}
              </Text>
            </VStack>
            {i < steps.length - 1 && (
              <Box
                w={{ base: 8, md: 16 }}
                h="2px"
                bg={isComplete ? "bauhaus.blue" : "bauhaus.muted"}
                mb={5}
              />
            )}
          </HStack>
        );
      })}
    </HStack>
  );
}

function StatusBadge({ status }: { status: WithdrawalStatus }) {
  const config: Record<
    WithdrawalStatus,
    { bg: string; color: string; label: string; icon: React.ReactNode }
  > = {
    "waiting-to-prove": {
      bg: "bauhaus.yellow",
      color: "bauhaus.foreground",
      label: "Waiting to Prove",
      icon: <Clock size={16} />,
    },
    "ready-to-prove": {
      bg: "bauhaus.blue",
      color: "white",
      label: "Ready to Prove",
      icon: <ArrowRight size={16} />,
    },
    "waiting-to-finalize": {
      bg: "bauhaus.yellow",
      color: "bauhaus.foreground",
      label: "Waiting to Finalize",
      icon: <Clock size={16} />,
    },
    "ready-to-finalize": {
      bg: "bauhaus.blue",
      color: "white",
      label: "Ready to Finalize",
      icon: <ArrowRight size={16} />,
    },
    finalized: {
      bg: "green.500",
      color: "white",
      label: "Finalized",
      icon: <CircleCheck size={16} />,
    },
  };
  const c = config[status];

  return (
    <HStack
      bg={c.bg}
      color={c.color}
      px={4}
      py={2}
      border="2px solid"
      borderColor="bauhaus.border"
      boxShadow="3px 3px 0px 0px #121212"
      fontWeight="bold"
      textTransform="uppercase"
      fontSize="xs"
      spacing={2}
    >
      {c.icon}
      <Text>{c.label}</Text>
    </HStack>
  );
}

// --- Main Component ---

export default function ClaimContent() {
  const [txInput, setTxInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [withdrawalData, setWithdrawalData] = useState<WithdrawalData | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const bridgeHistory = useBridgeHistory();
  const { addEntry, updateEntry, markDone } = bridgeHistory;
  const autoFetchedRef = useRef(false);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const {
    writeContractAsync,
    data: txHash,
    isPending: isWritePending,
  } = useWriteContract();
  const { isLoading: isTxConfirming, isSuccess: isTxConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });
  const toast = useToast();

  const fetchWithdrawal = useCallback(async () => {
    const hash = parseTxHash(txInput);
    if (!hash) {
      setError("Invalid transaction hash or Basescan URL");
      return;
    }

    // Sync URL with current tx hash
    const url = new URL(window.location.href);
    url.searchParams.set("tx", hash);
    window.history.replaceState({}, "", url.toString());

    addEntry(hash);
    setLoading(true);
    setError(null);
    setWithdrawalData(null);

    try {
      // 1. Fetch receipt from Base
      const receipt = await l2Client.getTransactionReceipt({ hash });
      if (!receipt) throw new Error("Transaction not found on Base");

      // 2. Extract withdrawal from receipt
      const withdrawals = getWithdrawals(receipt);
      if (withdrawals.length === 0)
        throw new Error(
          "No withdrawal (MessagePassed) event found in this transaction"
        );
      const withdrawal = withdrawals[0];

      // 3. Decode bridge token info from the withdrawal data
      const bridgeTokens = decodeBridgeTokens(withdrawal.data as Hash);

      // 4. Fetch token info on both chains
      let localToken: TokenInfo;
      let remoteToken: TokenInfo;
      let amount: bigint;

      if (bridgeTokens) {
        const [local, remote] = await Promise.all([
          fetchTokenInfo(l2Client, bridgeTokens.localToken),
          fetchTokenInfo(l1Client, bridgeTokens.remoteToken),
        ]);
        localToken = local;
        remoteToken = remote;
        amount = bridgeTokens.amount;
      } else {
        // ETH bridge (no token data in calldata)
        localToken = {
          address: "0x0000000000000000000000000000000000000000",
          name: "Ether",
          symbol: "ETH",
          decimals: 18,
        };
        remoteToken = { ...localToken };
        amount = withdrawal.value;
      }

      // 5. Check withdrawal status on L1
      const status = await getWithdrawalStatus(l1Client, {
        receipt,
        targetChain: base,
      });

      // 6. Get timing info if applicable
      let proofTimestamp: number | undefined;
      let timeToFinalizeInfo:
        | { seconds: number; timestamp: number }
        | undefined;

      if (
        status === "waiting-to-finalize" ||
        status === "ready-to-finalize"
      ) {
        if (address) {
          try {
            const proven = await l1Client.readContract({
              address: OPTIMISM_PORTAL,
              abi: optimismPortal2Abi,
              functionName: "provenWithdrawals",
              args: [withdrawal.withdrawalHash as `0x${string}`, address],
            });
            proofTimestamp = Number(proven[1]);
          } catch {
            // proof might have been submitted by another address
          }
        }

        if (status === "waiting-to-finalize") {
          try {
            const ttf = await getTimeToFinalize(l1Client, {
              targetChain: base,
              withdrawalHash:
                withdrawal.withdrawalHash as `0x${string}`,
            });
            timeToFinalizeInfo = {
              seconds: Number(ttf.seconds),
              timestamp: Number(ttf.timestamp),
            };
          } catch {
            // dispute game may not be resolved yet
          }
        }
      }

      // Get onchain timestamp for history display
      let txTimestamp: number | undefined;
      try {
        const block = await l2Client.getBlock({
          blockNumber: receipt.blockNumber,
        });
        txTimestamp = Number(block.timestamp) * 1000;
      } catch {
        // ignore
      }

      // Compute time estimate for waiting states
      let estimateSeconds: number | null = null;
      let estimateTimestamp: number | null = null;
      if (status === "waiting-to-finalize" && timeToFinalizeInfo) {
        estimateSeconds = timeToFinalizeInfo.seconds;
        estimateTimestamp = timeToFinalizeInfo.timestamp * 1000;
      } else if (status === "waiting-to-prove" && txTimestamp) {
        const estimatedReadyAt = txTimestamp + 60 * 60 * 1000;
        estimateSeconds = Math.max(
          0,
          Math.floor((estimatedReadyAt - Date.now()) / 1000)
        );
        estimateTimestamp = estimatedReadyAt;
      }

      // Update history entry with metadata
      const displayAmount = formatUnits(amount, localToken.decimals);
      const num = parseFloat(displayAmount);
      const formattedAmount =
        num < 0.01 && num > 0
          ? "<0.01"
          : num.toLocaleString(undefined, { maximumFractionDigits: 2 });
      updateEntry(hash, {
        lastStatus: status,
        lastCheckedAt: Date.now(),
        tokenSymbol: localToken.symbol,
        amount: formattedAmount,
        done: status === "finalized",
        estimateSeconds,
        estimateTimestamp,
        ...(txTimestamp ? { txTimestamp } : {}),
      });

      setWithdrawalData({
        receipt,
        withdrawal: withdrawal as WithdrawalData["withdrawal"],
        amount,
        localToken,
        remoteToken,
        status,
        proofTimestamp,
        timeToFinalize: timeToFinalizeInfo,
      });
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Failed to fetch withdrawal data";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [txInput, address, addEntry, updateEntry]);

  // Auto-fill from URL query param
  useEffect(() => {
    if (autoFetchedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const tx = params.get("tx");
    if (tx) {
      autoFetchedRef.current = true;
      setTxInput(tx);
    }
  }, []);

  // Trigger fetch when txInput is set from URL
  useEffect(() => {
    if (autoFetchedRef.current && txInput && !withdrawalData && !loading) {
      autoFetchedRef.current = false;
      fetchWithdrawal();
    }
    // Only run when txInput changes after URL autofill
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txInput]);

  const ensureMainnet = useCallback(async () => {
    if (chainId !== 1) {
      await switchChainAsync({ chainId: 1 });
    }
  }, [chainId, switchChainAsync]);

  const handleProve = useCallback(async () => {
    if (!withdrawalData || !address) return;
    setActionLoading(true);

    try {
      await ensureMainnet();

      // Get dispute game for the L2 block
      const game = await getGame(l1Client, {
        l2BlockNumber: withdrawalData.receipt.blockNumber,
        targetChain: base,
      });

      // Build prove args from L2 client (use `game` for fault proof chains)
      const proveArgs = await buildProveWithdrawal(l2Client, {
        game,
        withdrawal: withdrawalData.withdrawal,
      });

      await writeContractAsync({
        address: OPTIMISM_PORTAL,
        abi: proveWithdrawalAbi,
        functionName: "proveWithdrawalTransaction",
        args: [
          {
            nonce: withdrawalData.withdrawal.nonce,
            sender: withdrawalData.withdrawal.sender,
            target: withdrawalData.withdrawal.target,
            value: withdrawalData.withdrawal.value,
            gasLimit: withdrawalData.withdrawal.gasLimit,
            data: withdrawalData.withdrawal.data,
          },
          proveArgs.l2OutputIndex,
          proveArgs.outputRootProof,
          proveArgs.withdrawalProof,
        ],
        chainId: 1,
      });

      toast({
        title: "Prove transaction submitted",
        description:
          "Once confirmed, the ~7 day challenge period begins before you can finalize.",
        status: "success",
        duration: 10000,
        position: "bottom-right",
      });
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message.split("\n")[0] : "Prove failed";
      toast({
        title: "Prove failed",
        description: msg,
        status: "error",
        duration: 6000,
        position: "bottom-right",
      });
    } finally {
      setActionLoading(false);
    }
  }, [withdrawalData, address, ensureMainnet, writeContractAsync, toast]);

  const handleFinalize = useCallback(async () => {
    if (!withdrawalData) return;
    setActionLoading(true);

    try {
      await ensureMainnet();

      await writeContractAsync({
        address: OPTIMISM_PORTAL,
        abi: finalizeWithdrawalAbi,
        functionName: "finalizeWithdrawalTransaction",
        args: [
          {
            nonce: withdrawalData.withdrawal.nonce,
            sender: withdrawalData.withdrawal.sender,
            target: withdrawalData.withdrawal.target,
            value: withdrawalData.withdrawal.value,
            gasLimit: withdrawalData.withdrawal.gasLimit,
            data: withdrawalData.withdrawal.data,
          },
        ],
        chainId: 1,
      });

      toast({
        title: "Finalize transaction submitted",
        description:
          "Your tokens will arrive on Ethereum Mainnet once confirmed.",
        status: "success",
        duration: 10000,
        position: "bottom-right",
      });
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message.split("\n")[0] : "Finalize failed";
      toast({
        title: "Finalize failed",
        description: msg,
        status: "error",
        duration: 6000,
        position: "bottom-right",
      });
    } finally {
      setActionLoading(false);
    }
  }, [withdrawalData, ensureMainnet, writeContractAsync, toast]);

  const refreshStatus = useCallback(async () => {
    if (!withdrawalData) return;
    setLoading(true);
    try {
      const status = await getWithdrawalStatus(l1Client, {
        receipt: withdrawalData.receipt,
        targetChain: base,
      });

      let timeToFinalizeInfo: WithdrawalData["timeToFinalize"];
      if (status === "waiting-to-finalize") {
        try {
          const ttf = await getTimeToFinalize(l1Client, {
            targetChain: base,
            withdrawalHash:
              withdrawalData.withdrawal.withdrawalHash as `0x${string}`,
          });
          timeToFinalizeInfo = {
            seconds: Number(ttf.seconds),
            timestamp: Number(ttf.timestamp),
          };
        } catch {
          // ignore
        }
      }

      setWithdrawalData((prev) =>
        prev ? { ...prev, status, timeToFinalize: timeToFinalizeInfo } : null
      );

      // Update history
      const txHash = withdrawalData.receipt.transactionHash;
      if (status === "finalized") {
        markDone(txHash);
      } else {
        let estSeconds: number | null = null;
        let estTimestamp: number | null = null;
        if (status === "waiting-to-finalize" && timeToFinalizeInfo) {
          estSeconds = timeToFinalizeInfo.seconds;
          estTimestamp = timeToFinalizeInfo.timestamp * 1000;
        }
        updateEntry(txHash, {
          lastStatus: status,
          lastCheckedAt: Date.now(),
          estimateSeconds: estSeconds,
          estimateTimestamp: estTimestamp,
        });
      }

      toast({
        title: "Status refreshed",
        status: "info",
        duration: 2000,
        position: "bottom-right",
      });
    } catch {
      toast({
        title: "Failed to refresh",
        status: "error",
        duration: 3000,
        position: "bottom-right",
      });
    } finally {
      setLoading(false);
    }
  }, [withdrawalData, toast, markDone, updateEntry]);

  // Auto-refresh status after prove/finalize tx confirms
  useEffect(() => {
    if (isTxConfirmed && withdrawalData) {
      refreshStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTxConfirmed]);

  const isBusy = actionLoading || isWritePending || isTxConfirming;

  return (
    <Box minH="100vh" bg="bauhaus.background">
      <Navigation />

      <Container maxW="2xl" px={{ base: 4, md: 6 }} py={{ base: 8, md: 16 }}>
        <VStack spacing={6} align="stretch">
          {/* Header */}
          <Box position="relative">
            <Box position="absolute" left={0} top={0}>
              <Link href={mainnetHref("/mainnet")}>
                <IconButton
                  aria-label="Back to bridge"
                  icon={<ArrowLeft size={20} />}
                  variant="ghost"
                  size="sm"
                />
              </Link>
            </Box>
            <VStack spacing={2}>
              <Text
                fontSize={{ base: "2xl", md: "3xl" }}
                fontWeight="900"
                textTransform="uppercase"
                letterSpacing="tight"
                textAlign="center"
              >
                Claim on Mainnet
              </Text>
              <Text
                fontSize="sm"
                fontWeight="700"
                color="gray.500"
                textTransform="uppercase"
                letterSpacing="wide"
                textAlign="center"
              >
                Prove &amp; finalize Base → Ethereum withdrawals
              </Text>
            </VStack>
            <Box position="absolute" right={0} top={0}>
              <BridgeHistoryWidget history={bridgeHistory} />
            </Box>
          </Box>

          {/* Input Card */}
          <Box
            bg="white"
            border="4px solid"
            borderColor="bauhaus.border"
            boxShadow="8px 8px 0px 0px #121212"
            p={{ base: 5, md: 8 }}
          >
            <VStack spacing={4} align="stretch">
              <Text
                fontSize="xs"
                fontWeight="800"
                textTransform="uppercase"
                letterSpacing="widest"
              >
                Base Bridge Transaction
              </Text>
              <HStack spacing={3}>
                <Input
                  placeholder="https://basescan.org/tx/0x... or 0x..."
                  value={txInput}
                  onChange={(e) => setTxInput(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !loading && fetchWithdrawal()
                  }
                  border="3px solid"
                  borderColor="bauhaus.border"
                  borderRadius={0}
                  fontFamily="mono"
                  fontSize="sm"
                  h="48px"
                  _focus={{
                    borderColor: "bauhaus.blue",
                    boxShadow: "none",
                  }}
                />
                <Button
                  variant="secondary"
                  onClick={fetchWithdrawal}
                  isLoading={loading && !withdrawalData}
                  h="48px"
                  px={6}
                  flexShrink={0}
                >
                  <Search size={18} />
                </Button>
              </HStack>
              {error && (
                <Text color="bauhaus.red" fontSize="sm" fontWeight="bold">
                  {error}
                </Text>
              )}
            </VStack>
          </Box>

          {/* Loading */}
          {loading && !withdrawalData && (
            <Flex justify="center" py={8}>
              <Spinner size="xl" color="bauhaus.blue" thickness="4px" />
            </Flex>
          )}

          {/* Results */}
          {withdrawalData && (
            <VStack spacing={5} align="stretch">
              {/* Step Indicator */}
              <Box
                bg="white"
                border="4px solid"
                borderColor="bauhaus.border"
                boxShadow="8px 8px 0px 0px #121212"
                py={6}
                px={4}
              >
                <StepIndicator currentStatus={withdrawalData.status} />
              </Box>

              {/* Token Info Card */}
              <Box
                bg="white"
                border="4px solid"
                borderColor="bauhaus.border"
                boxShadow="8px 8px 0px 0px #121212"
                p={{ base: 5, md: 6 }}
              >
                <VStack spacing={4} align="stretch">
                  <Flex justify="space-between" align="center" flexWrap="wrap" gap={2}>
                    <Text
                      fontSize="xs"
                      fontWeight="800"
                      textTransform="uppercase"
                      letterSpacing="widest"
                    >
                      Bridge Details
                    </Text>
                    <StatusBadge status={withdrawalData.status} />
                  </Flex>

                  {/* Amount */}
                  <Box
                    bg="bauhaus.background"
                    border="2px solid"
                    borderColor="bauhaus.border"
                    p={4}
                  >
                    <Text
                      fontSize="xs"
                      fontWeight="800"
                      textTransform="uppercase"
                      letterSpacing="widest"
                      color="gray.500"
                    >
                      Amount
                    </Text>
                    <Text fontSize="2xl" fontWeight="900" fontFamily="mono">
                      {Number(
                        formatUnits(
                          withdrawalData.amount,
                          withdrawalData.localToken.decimals
                        )
                      ).toLocaleString()}{" "}
                      <Text as="span" fontSize="lg">
                        {withdrawalData.localToken.symbol}
                      </Text>
                    </Text>
                  </Box>

                  {/* Token addresses row */}
                  <Flex
                    direction={{ base: "column", md: "row" }}
                    gap={4}
                    align={{ base: "stretch", md: "center" }}
                    justify="space-between"
                  >
                    <VStack align="start" spacing={1}>
                      <Text
                        fontSize="xs"
                        fontWeight="800"
                        textTransform="uppercase"
                        letterSpacing="widest"
                        color="gray.500"
                      >
                        L2 Token (Base)
                      </Text>
                      <Text fontWeight="bold" fontSize="sm">
                        {withdrawalData.localToken.name} (
                        {withdrawalData.localToken.symbol})
                      </Text>
                      <AddressDisplay
                        address={withdrawalData.localToken.address}
                        explorer="https://basescan.org"
                      />
                    </VStack>

                    <Flex
                      align="center"
                      justify="center"
                      display={{ base: "none", md: "flex" }}
                    >
                      <ArrowRight size={24} />
                    </Flex>

                    <VStack align="start" spacing={1}>
                      <Text
                        fontSize="xs"
                        fontWeight="800"
                        textTransform="uppercase"
                        letterSpacing="widest"
                        color="gray.500"
                      >
                        L1 Token (Ethereum)
                      </Text>
                      <Text fontWeight="bold" fontSize="sm">
                        {withdrawalData.remoteToken.name} (
                        {withdrawalData.remoteToken.symbol})
                      </Text>
                      <AddressDisplay
                        address={withdrawalData.remoteToken.address}
                        explorer="https://etherscan.io"
                      />
                    </VStack>
                  </Flex>

                  {/* Withdrawal hash */}
                  <HStack spacing={1} fontSize="xs" color="gray.500">
                    <Text fontWeight="800" textTransform="uppercase">
                      Withdrawal Hash:
                    </Text>
                    <Text fontFamily="mono">
                      {shortenAddress(
                        withdrawalData.withdrawal.withdrawalHash
                      )}
                    </Text>
                    <CopyButton
                      text={withdrawalData.withdrawal.withdrawalHash}
                    />
                  </HStack>
                </VStack>
              </Box>

              {/* Action Card */}
              <Box
                bg="white"
                border="4px solid"
                borderColor="bauhaus.border"
                boxShadow="8px 8px 0px 0px #121212"
                p={{ base: 5, md: 6 }}
              >
                <VStack spacing={4} align="stretch">
                  <Text
                    fontSize="xs"
                    fontWeight="800"
                    textTransform="uppercase"
                    letterSpacing="widest"
                  >
                    Actions
                  </Text>

                  {/* Waiting to prove */}
                  {withdrawalData.status === "waiting-to-prove" && (
                    <Box
                      bg="#FFF9C4"
                      border="2px solid"
                      borderColor="bauhaus.border"
                      p={4}
                    >
                      <HStack spacing={3}>
                        <Loader size={18} />
                        <Text fontWeight="bold" fontSize="sm">
                          Waiting for a dispute game to be posted for this L2
                          block. This usually takes ~1 hour.
                        </Text>
                      </HStack>
                    </Box>
                  )}

                  {/* Ready to prove */}
                  {withdrawalData.status === "ready-to-prove" && (
                    <VStack spacing={3} align="stretch">
                      <Text fontSize="sm">
                        A dispute game has been posted. You can now prove your
                        withdrawal on Ethereum Mainnet.
                      </Text>
                      {!isConnected ? (
                        <Flex justify="center">
                          <ConnectButton />
                        </Flex>
                      ) : (
                        <Button
                          variant="secondary"
                          size="lg"
                          w="full"
                          onClick={handleProve}
                          isLoading={isBusy}
                          loadingText={
                            isTxConfirming ? "Confirming..." : "Proving..."
                          }
                        >
                          Prove Withdrawal
                        </Button>
                      )}
                    </VStack>
                  )}

                  {/* Waiting to finalize */}
                  {withdrawalData.status === "waiting-to-finalize" && (
                    <Box
                      bg="#FFF9C4"
                      border="2px solid"
                      borderColor="bauhaus.border"
                      p={4}
                    >
                      <VStack align="start" spacing={2}>
                        <HStack spacing={3}>
                          <Clock size={18} />
                          <Text fontWeight="bold" fontSize="sm">
                            Proven. Waiting for challenge period to end.
                          </Text>
                        </HStack>
                        {withdrawalData.timeToFinalize && (
                          <Text fontSize="sm" color="gray.600">
                            Time remaining:{" "}
                            <Text
                              as="span"
                              fontWeight="900"
                              color="bauhaus.foreground"
                            >
                              {formatDuration(
                                withdrawalData.timeToFinalize.seconds
                              )}
                            </Text>{" "}
                            (≈{" "}
                            {new Date(
                              withdrawalData.timeToFinalize.timestamp * 1000
                            ).toLocaleString()}
                            )
                          </Text>
                        )}
                      </VStack>
                    </Box>
                  )}

                  {/* Ready to finalize */}
                  {withdrawalData.status === "ready-to-finalize" && (
                    <VStack spacing={3} align="stretch">
                      <Text fontSize="sm">
                        Challenge period is over. Finalize your withdrawal to
                        claim tokens on Ethereum Mainnet.
                      </Text>
                      {!isConnected ? (
                        <Flex justify="center">
                          <ConnectButton />
                        </Flex>
                      ) : (
                        <Button
                          variant="primary"
                          size="lg"
                          w="full"
                          onClick={handleFinalize}
                          isLoading={isBusy}
                          loadingText={
                            isTxConfirming
                              ? "Confirming..."
                              : "Finalizing..."
                          }
                        >
                          Finalize Withdrawal
                        </Button>
                      )}
                    </VStack>
                  )}

                  {/* Finalized */}
                  {withdrawalData.status === "finalized" && (
                    <Box
                      bg="green.50"
                      border="2px solid"
                      borderColor="green.500"
                      p={4}
                    >
                      <HStack spacing={3}>
                        <CircleCheck size={18} color="#38A169" />
                        <Text
                          fontWeight="bold"
                          fontSize="sm"
                          color="green.700"
                        >
                          Withdrawal finalized! Tokens claimed on Ethereum
                          Mainnet.
                        </Text>
                      </HStack>
                    </Box>
                  )}

                  {/* Tx confirmed toast */}
                  {isTxConfirmed && txHash && (
                    <Box
                      bg="green.50"
                      border="2px solid"
                      borderColor="green.500"
                      p={4}
                    >
                      <VStack align="start" spacing={1}>
                        <HStack spacing={2}>
                          <CircleCheck size={16} color="#38A169" />
                          <Text
                            fontWeight="bold"
                            fontSize="sm"
                            color="green.700"
                          >
                            Transaction confirmed!
                          </Text>
                        </HStack>
                        <Link
                          href={`https://etherscan.io/tx/${txHash}`}
                          isExternal
                          fontSize="sm"
                          color="bauhaus.blue"
                          fontWeight="bold"
                          display="inline-flex"
                          alignItems="center"
                          gap={1}
                        >
                          View on Etherscan <ExternalLinkIcon size={12} />
                        </Link>
                      </VStack>
                    </Box>
                  )}

                  {/* Refresh */}
                  {withdrawalData.status !== "finalized" && (
                    <Button
                      variant="outline"
                      size="md"
                      w="full"
                      onClick={refreshStatus}
                      isLoading={loading}
                      leftIcon={<RefreshCw size={16} />}
                    >
                      Refresh Status
                    </Button>
                  )}
                </VStack>
              </Box>

              {/* Source link */}
              <Flex justify="center">
                <Link
                  href={`https://basescan.org/tx/${withdrawalData.receipt.transactionHash}`}
                  isExternal
                  fontSize="xs"
                  fontWeight="700"
                  color="bauhaus.blue"
                  textTransform="uppercase"
                  display="inline-flex"
                  alignItems="center"
                  gap={1}
                >
                  View Bridge TX on Basescan <ExternalLinkIcon size={12} />
                </Link>
              </Flex>
            </VStack>
          )}
        </VStack>
      </Container>
    </Box>
  );
}
