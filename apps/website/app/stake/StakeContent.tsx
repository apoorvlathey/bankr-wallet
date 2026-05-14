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
  Image,
  Flex,
  Center,
  Link,
  Spinner,
  useToast,
} from "@chakra-ui/react";
import { motion, useInView } from "framer-motion";
import { AlertTriangle, ExternalLink } from "lucide-react";
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
import { useVaultData } from "../contexts/VaultDataContext";
import { useTokenData } from "../contexts/TokenDataContext";
import { erc20Abi, wchanVaultAbi, migrateZapAbi } from "./abi";
import {
  STAKE_CHAIN_ID,
  WCHAN_VAULT_ADDR,
  WCHAN_TOKEN_ADDR,
  OLD_VAULT_ADDR,
  MIGRATE_ZAP_ADDR,
} from "./constants";

const MotionBox = motion(Box);

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
  if (value > 0) return `<$0.01`;
  return `$0.00`;
}

// ═══════════════════════════════════════════════════════
//               Migration Banner
// ═══════════════════════════════════════════════════════

function MigrationBanner({
  address,
  onMigrated,
}: {
  address: `0x${string}`;
  onMigrated: () => void;
}) {
  const toast = useToast();
  const { vaultData } = useVaultData();

  // Old vault (sBNKRW) balance
  const { data: oldVaultBalance, refetch: refetchOldBalance } = useReadContract(
    {
      address: OLD_VAULT_ADDR,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
      chainId: STAKE_CHAIN_ID,
      query: { enabled: true, refetchInterval: 5000 },
    },
  );

  // Old vault shares allowance for zap
  const { data: zapAllowance, refetch: refetchZapAllowance } = useReadContract({
    address: OLD_VAULT_ADDR,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address, MIGRATE_ZAP_ADDR],
    chainId: STAKE_CHAIN_ID,
    query: { enabled: true, refetchInterval: 5000 },
  });

  const balance = oldVaultBalance as bigint | undefined;
  const allowance = zapAllowance as bigint | undefined;

  const needsApproval =
    balance !== undefined &&
    balance > 0n &&
    allowance !== undefined &&
    allowance < balance;

  // Approve
  const {
    writeContract: writeApprove,
    data: approveTxHash,
    isPending: isApproving,
    reset: resetApprove,
  } = useWriteContract();

  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  // Migrate
  const {
    writeContract: writeMigrate,
    data: migrateTxHash,
    isPending: isMigrating,
    reset: resetMigrate,
  } = useWriteContract();

  const { isLoading: isMigrateConfirming, isSuccess: isMigrateConfirmed } =
    useWaitForTransactionReceipt({ hash: migrateTxHash });

  // ERC-5792 capability check — bundle approve+migrate into a single popup when supported
  const { data: walletCapabilities } = useCapabilities({
    account: address,
    chainId: STAKE_CHAIN_ID,
    query: { enabled: !!address },
  });
  const atomicStatus = walletCapabilities?.atomic?.status;
  const supportsAtomicBatch =
    atomicStatus === "supported" || atomicStatus === "ready";

  const {
    sendCalls: sendMigrateCalls,
    data: migrateBatchData,
    isPending: isMigrateBatchSending,
    reset: resetMigrateBatch,
  } = useSendCalls();
  const migrateBundleId = migrateBatchData?.id;
  const { data: migrateBatchStatus } = useCallsStatus({
    id: migrateBundleId ?? "",
    query: {
      enabled: !!migrateBundleId,
      refetchInterval: ({ state }) =>
        state.data?.status === "pending" || state.data?.status === undefined
          ? 1500
          : false,
    },
  });
  const isMigrateBatchConfirming =
    !!migrateBundleId &&
    (migrateBatchStatus?.status === "pending" ||
      migrateBatchStatus?.status === undefined);
  const isMigrateBatchConfirmed = migrateBatchStatus?.status === "success";
  const migrateBatchTxHash =
    migrateBatchStatus?.receipts?.[0]?.transactionHash;

  const isBusy =
    isApproving ||
    isApproveConfirming ||
    isMigrating ||
    isMigrateConfirming ||
    isMigrateBatchSending ||
    isMigrateBatchConfirming;

  useEffect(() => {
    if (isApproveConfirmed) {
      refetchZapAllowance().then(() => {
        toast({
          title: "Approval confirmed",
          description: "You can now migrate your sBNKRW.",
          status: "success",
          duration: 3000,
          isClosable: true,
          position: "bottom-right",
        });
        resetApprove();
      });
    }
  }, [isApproveConfirmed, refetchZapAllowance, toast, resetApprove]);

  useEffect(() => {
    if (isMigrateConfirmed && migrateTxHash) {
      refetchOldBalance();
      onMigrated();
      const txUrl = `https://basescan.org/tx/${migrateTxHash}`;
      toast({
        title: "Migration successful",
        description: (
          <>
            Your sBNKRW has been migrated to sWCHAN.{" "}
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
      resetMigrate();
    }
  }, [
    isMigrateConfirmed,
    migrateTxHash,
    refetchOldBalance,
    onMigrated,
    toast,
    resetMigrate,
  ]);

  const handleApprove = useCallback(() => {
    if (!balance) return;
    writeApprove(
      {
        address: OLD_VAULT_ADDR,
        abi: erc20Abi,
        functionName: "approve",
        args: [MIGRATE_ZAP_ADDR, balance],
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
      },
    );
  }, [balance, writeApprove, toast]);

  const handleMigrate = useCallback(() => {
    if (!balance) return;
    writeMigrate(
      {
        address: MIGRATE_ZAP_ADDR,
        abi: migrateZapAbi,
        functionName: "migrate",
        args: [balance],
        chainId: STAKE_CHAIN_ID,
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
  }, [balance, writeMigrate, toast]);

  const handleBatchedMigrate = useCallback(() => {
    if (!balance) return;

    const calls: { to: `0x${string}`; value: bigint; data: `0x${string}` }[] =
      [];

    if (needsApproval) {
      calls.push({
        to: OLD_VAULT_ADDR,
        value: 0n,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [MIGRATE_ZAP_ADDR, balance],
        }),
      });
    }

    calls.push({
      to: MIGRATE_ZAP_ADDR,
      value: 0n,
      data: encodeFunctionData({
        abi: migrateZapAbi,
        functionName: "migrate",
        args: [balance],
      }),
    });

    sendMigrateCalls(
      {
        calls,
        chainId: STAKE_CHAIN_ID,
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
  }, [balance, needsApproval, sendMigrateCalls, toast]);

  // After batched migrate confirms
  const migrateBatchToastedRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      isMigrateBatchConfirmed &&
      migrateBundleId &&
      migrateBatchToastedRef.current !== migrateBundleId
    ) {
      migrateBatchToastedRef.current = migrateBundleId;
      refetchOldBalance();
      onMigrated();
      const txUrl = migrateBatchTxHash
        ? `https://basescan.org/tx/${migrateBatchTxHash}`
        : undefined;
      toast({
        title: "Migration successful",
        description: (
          <>
            Your sBNKRW has been migrated to sWCHAN.
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
      resetMigrateBatch();
    }
  }, [
    isMigrateBatchConfirmed,
    migrateBundleId,
    migrateBatchTxHash,
    refetchOldBalance,
    onMigrated,
    toast,
    resetMigrateBatch,
  ]);

  // Don't show if no balance
  if (!balance || balance === 0n) return null;

  const buttonLabel = (() => {
    if (isMigrateBatchSending || isMigrateBatchConfirming) return "Migrating...";
    if (isApproving || isApproveConfirming) return "Approving...";
    if (isMigrating || isMigrateConfirming) return "Migrating...";
    if (needsApproval && !supportsAtomicBatch) return "Approve sBNKRW";
    return "Migrate All to sWCHAN";
  })();

  return (
    <Box
      bg="bauhaus.yellow"
      border="3px solid"
      borderColor="bauhaus.black"
      boxShadow="4px 4px 0px 0px #121212"
      p={4}
    >
      <Flex
        direction={{ base: "column", md: "row" }}
        align={{ base: "stretch", md: "center" }}
        justify="space-between"
        gap={3}
      >
        <VStack align="flex-start" spacing={1}>
          <Text
            fontWeight="900"
            fontSize="sm"
            textTransform="uppercase"
            letterSpacing="wider"
          >
            Migrate from old vault
          </Text>
          <Text fontSize="xs" fontWeight="600" color="gray.700">
            You have{" "}
            <Text as="span" fontWeight="900">
              {formatBalance(balance)}
            </Text>{" "}
            sBNKRW in the old vault.
          </Text>
          <Text fontSize="xs" fontWeight="600" color="gray.700">
            Migrate to sWCHAN in one click and
          </Text>
          <Text fontSize="xs" fontWeight="600" color="gray.700">
            start earning{" "}
            <Text as="span" fontWeight="900">
              {vaultData ? `${vaultData.totalApy.toFixed(1)}%` : "—"} APY.
            </Text>
          </Text>
        </VStack>
        <Button
          variant="secondary"
          size="sm"
          minW="160px"
          isDisabled={isBusy}
          isLoading={isBusy}
          loadingText={buttonLabel}
          onClick={
            supportsAtomicBatch
              ? handleBatchedMigrate
              : needsApproval
                ? handleApprove
                : handleMigrate
          }
        >
          {buttonLabel}
        </Button>
      </Flex>

      {/* Tx status */}
      {(approveTxHash ||
        migrateTxHash ||
        migrateBatchTxHash ||
        isMigrateBatchConfirming) && (
        <HStack justify="center" mt={2} spacing={2}>
          {(isApproveConfirming ||
            isMigrateConfirming ||
            isMigrateBatchConfirming) && (
            <>
              <Spinner size="xs" />
              <Text fontSize="xs" fontWeight="700" textTransform="uppercase">
                Confirming...
              </Text>
            </>
          )}
          {(approveTxHash || migrateTxHash || migrateBatchTxHash) && (
            <Link
              href={`https://basescan.org/tx/${migrateBatchTxHash || approveTxHash || migrateTxHash}`}
              isExternal
              fontSize="xs"
              fontWeight="700"
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
    </Box>
  );
}

// ═══════════════════════════════════════════════════════
//               Main Stake Content
// ═══════════════════════════════════════════════════════

export default function StakeContent() {
  const [activeTab, setActiveTab] = useState<TabType>("deposit");
  const [amount, setAmount] = useState("");
  const [sliderValue, setSliderValue] = useState(0);
  const headingRef = useRef(null);
  const isHeadingInView = useInView(headingRef, { once: true });
  const toast = useToast();

  // Wallet
  const { address, isConnected: isWalletConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const isWrongChain = isWalletConnected && chainId !== STAKE_CHAIN_ID;

  // Vault data from indexer
  const {
    vaultData,
    isLoading: isVaultLoading,
    refetchVaultData,
  } = useVaultData();

  // Token price
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

  // Penalty info (needed on both deposit and withdraw tabs)
  const { data: penaltyBps } = useReadContract({
    address: WCHAN_VAULT_ADDR,
    abi: wchanVaultAbi,
    functionName: "getPenaltyBps",
    args: address ? [address] : undefined,
    chainId: STAKE_CHAIN_ID,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
  });

  // Last deposit timestamp (for penalty countdown)
  const { data: lastDepositTs } = useReadContract({
    address: WCHAN_VAULT_ADDR,
    abi: wchanVaultAbi,
    functionName: "lastDepositTimestamp",
    args: address ? [address] : undefined,
    chainId: STAKE_CHAIN_ID,
    query: {
      enabled: !!address,
      refetchInterval: 5000,
    },
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
    query: { enabled: activeTab === "withdraw" && !!parsedAmount && !!address },
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

  // Wait for tx receipts
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  const { isLoading: isDepositConfirming, isSuccess: isDepositConfirmed } =
    useWaitForTransactionReceipt({ hash: depositTxHash });

  const { isLoading: isRedeemConfirming, isSuccess: isRedeemConfirmed } =
    useWaitForTransactionReceipt({ hash: redeemTxHash });

  // ERC-5792 capability check: does the connected wallet support atomic batching?
  // When supported, deposit bundles approve+deposit into a single popup.
  const { data: walletCapabilities } = useCapabilities({
    account: address,
    chainId: STAKE_CHAIN_ID,
    query: { enabled: !!address },
  });
  const atomicStatus = walletCapabilities?.atomic?.status;
  const supportsAtomicBatch =
    atomicStatus === "supported" || atomicStatus === "ready";

  // Batched deposit (ERC-5792)
  const {
    sendCalls: sendDepositCalls,
    data: depositBatchData,
    isPending: isDepositBatchSending,
    reset: resetDepositBatch,
  } = useSendCalls();
  const depositBundleId = depositBatchData?.id;
  const { data: depositBatchStatus } = useCallsStatus({
    id: depositBundleId ?? "",
    query: {
      enabled: !!depositBundleId,
      refetchInterval: ({ state }) =>
        state.data?.status === "pending" || state.data?.status === undefined
          ? 1500
          : false,
    },
  });
  const isDepositBatchConfirming =
    !!depositBundleId &&
    (depositBatchStatus?.status === "pending" ||
      depositBatchStatus?.status === undefined);
  const isDepositBatchConfirmed = depositBatchStatus?.status === "success";
  const depositBatchTxHash =
    depositBatchStatus?.receipts?.[0]?.transactionHash;

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
    isRedeemConfirming ||
    isDepositBatchSending ||
    isDepositBatchConfirming;

  const penaltyPct =
    penaltyBps !== undefined ? Number(penaltyBps as bigint) / 100 : 0;

  const PENALTY_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds
  const zeroPenaltyDate =
    lastDepositTs !== undefined && (lastDepositTs as bigint) > 0n
      ? new Date((Number(lastDepositTs as bigint) + PENALTY_DURATION) * 1000)
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
      },
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
      },
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
      },
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
      },
    );
  }, [writeClaim, toast]);

  const handleBatchedDeposit = useCallback(() => {
    if (!parsedAmount || !address) return;

    const calls: { to: `0x${string}`; value: bigint; data: `0x${string}` }[] =
      [];

    if (needsApproval) {
      calls.push({
        to: WCHAN_TOKEN_ADDR,
        value: 0n,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [WCHAN_VAULT_ADDR, maxUint256],
        }),
      });
    }

    calls.push({
      to: WCHAN_VAULT_ADDR,
      value: 0n,
      data: encodeFunctionData({
        abi: wchanVaultAbi,
        functionName: "deposit",
        args: [parsedAmount, address],
      }),
    });

    sendDepositCalls(
      {
        calls,
        chainId: STAKE_CHAIN_ID,
        forceAtomic: true,
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
      },
    );
  }, [parsedAmount, address, needsApproval, sendDepositCalls, toast]);

  // After batched deposit confirms
  const depositBatchToastedRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      isDepositBatchConfirmed &&
      depositBundleId &&
      depositBatchToastedRef.current !== depositBundleId
    ) {
      depositBatchToastedRef.current = depositBundleId;
      refetchWchan();
      refetchStaked();
      refetchAllowance();
      refetchVaultData();
      setAmount("");
      const txUrl = depositBatchTxHash
        ? `https://basescan.org/tx/${depositBatchTxHash}`
        : undefined;
      toast({
        title: "Deposit successful",
        description: (
          <>
            Your WCHAN has been staked.
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
      resetDepositBatch();
    }
  }, [
    isDepositBatchConfirmed,
    depositBundleId,
    depositBatchTxHash,
    refetchWchan,
    refetchStaked,
    refetchAllowance,
    refetchVaultData,
    toast,
    resetDepositBatch,
  ]);

  const handleAction = () => {
    if (activeTab === "deposit") {
      if (supportsAtomicBatch) {
        handleBatchedDeposit();
      } else if (needsApproval) {
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
      if (isDepositBatchSending || isDepositBatchConfirming)
        return "Depositing...";
      if (isApproving || isApproveConfirming) return "Approving...";
      if (isDepositing || isDepositConfirming) return "Depositing...";
      if (needsApproval && !supportsAtomicBatch) return "Approve WCHAN";
      return "Deposit";
    }
    if (isRedeeming || isRedeemConfirming) return "Withdrawing...";
    return "Withdraw";
  };

  return (
    <Box minH="100vh" bg="bauhaus.background">
      <Navigation />
      <TokenBanner />

      <Container maxW="7xl" pt={10} pb={40}>
        <VStack spacing={6} align="stretch">
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
                  WCHAN Staking
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

            <Text
              fontSize="lg"
              color="gray.600"
              maxW="500px"
              fontWeight="500"
              textAlign="center"
            >
              Stake & earn{" "}
              <Text as="span" fontWeight="800">
                WETH + WCHAN
              </Text>{" "}
              rewards.
            </Text>
            <Text
              fontSize="xs"
              color="gray.400"
              maxW="500px"
              fontWeight="500"
              textAlign="center"
            >
              (20% early withdrawal penalty before 7 days, linearly decays to
              0%)
            </Text>
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
                onClick={() => switchChain({ chainId: STAKE_CHAIN_ID })}
                leftIcon={
                  <Image src="/images/base.svg" alt="Base" w="18px" h="18px" />
                }
              >
                Switch to Base
              </Button>
            </HStack>
          )}

          {/* Migration Banner */}
          {isWalletConnected && !isWrongChain && address && (
            <Box maxW="lg" mx="auto" w="full">
              <MigrationBanner
                address={address}
                onMigrated={() => {
                  refetchWchan();
                  refetchStaked();
                  refetchVaultData();
                }}
              />
            </Box>
          )}

          {/* Staking Card */}
          <Box maxW="lg" mx="auto" w="full">
            {/* Stats Row */}
            {!isVaultLoading && vaultData && (
              <Flex gap={3} mb={4}>
                {/* APY Box */}
                <Box
                  flex={1}
                  bg="white"
                  border="3px solid"
                  borderColor="bauhaus.black"
                  boxShadow="4px 4px 0px 0px #121212"
                  px={4}
                  py={3}
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
                  <Text fontSize="xl" fontWeight="900" color="bauhaus.blue">
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
                  px={4}
                  py={3}
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
                  <Text fontSize="xl" fontWeight="900" color="bauhaus.black">
                    {formatUsd(vaultData.tvlUsd)}
                  </Text>
                </Flex>
              </Flex>
            )}

            {/* Staked Balance + WETH Rewards */}
            {isWalletConnected && !isWrongChain && (
              <Box
                bg="white"
                border="3px solid"
                borderColor="bauhaus.black"
                boxShadow="4px 4px 0px 0px #121212"
                mb={4}
              >
                {/* Staked Balance */}
                <Box
                  px={4}
                  py={3}
                  borderBottom="2px solid"
                  borderColor="gray.100"
                >
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
                      {formatBalance(stakedBalance as bigint | undefined)}{" "}
                      sWCHAN
                    </Text>
                    {tokenPrice > 0 &&
                      vaultData &&
                      stakedBalance !== undefined && (
                        <Text fontSize="xs" fontWeight="600" color="gray.400">
                          {formatUsd(
                            parseFloat(
                              formatUnits(stakedBalance as bigint, 18),
                            ) *
                              parseFloat(
                                formatUnits(
                                  BigInt(vaultData.sharePrice || "0"),
                                  18,
                                ),
                              ) *
                              tokenPrice,
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
                      Claimable WETH Rewards
                    </Text>
                    <HStack spacing={2} align="baseline">
                      <Text
                        fontSize="lg"
                        fontWeight="900"
                        color="bauhaus.black"
                      >
                        {earnedWeth !== undefined
                          ? `${formatUnits(earnedWeth as bigint, 18).slice(0, 12)} WETH`
                          : "—"}
                      </Text>
                      {earnedWeth !== undefined &&
                        (earnedWeth as bigint) > 0n &&
                        ethPrice > 0 && (
                          <Text fontSize="sm" fontWeight="700" color="gray.400">
                            {formatUsd(
                              parseFloat(
                                formatUnits(earnedWeth as bigint, 18),
                              ) * ethPrice,
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

              {/* Tabs */}
              <Flex borderBottom="4px solid" borderColor="bauhaus.black">
                <Box
                  as="button"
                  flex={1}
                  py={4}
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
                  py={4}
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
              <VStack spacing={5} p={6} position="relative" zIndex={1}>
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
                      <Text
                        fontSize="xs"
                        fontWeight="900"
                        color="bauhaus.black"
                      >
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
                              (s) => Math.abs(val - s) <= SNAP_THRESHOLD,
                            );
                            const snapped =
                              nearest !== undefined ? nearest : val;
                            setSliderValue(snapped);
                            if (snapped === 0) {
                              setAmount("");
                            } else {
                              const bal = currentBalance as bigint;
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
                            const diff = zeroPenaltyDate.getTime() - Date.now();
                            const days = Math.max(
                              0,
                              Math.ceil(diff / (1000 * 60 * 60 * 24)),
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
                              },
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
                                  Math.floor(Date.now() / 1000),
                                );
                                const newTs =
                                  existing > 0n && oldTs > 0n
                                    ? (oldTs * existing + nowSec * newShares) /
                                      (existing + newShares)
                                    : nowSec;
                                const zeroPenalty = new Date(
                                  (Number(newTs) + PENALTY_DURATION) * 1000,
                                );
                                const diff = zeroPenalty.getTime() - Date.now();
                                const days = Math.max(
                                  0,
                                  Math.ceil(diff / (1000 * 60 * 60 * 24)),
                                );
                                const formatted = zeroPenalty.toLocaleString(
                                  "en-GB",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                    hour12: false,
                                  },
                                );
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
                {(approveTxHash ||
                  depositTxHash ||
                  redeemTxHash ||
                  depositBatchTxHash ||
                  isDepositBatchConfirming) && (
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
                      isRedeemConfirming ||
                      isDepositBatchConfirming) && (
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
                    {(approveTxHash ||
                      depositTxHash ||
                      redeemTxHash ||
                      depositBatchTxHash) && (
                      <Link
                        href={`https://basescan.org/tx/${depositBatchTxHash || approveTxHash || depositTxHash || redeemTxHash}`}
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
                        ? needsApproval && !supportsAtomicBatch
                          ? "yellow"
                          : "secondary"
                        : "primary"
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
              </VStack>
            </Box>
          </Box>
          <Center>
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
          </Center>
        </VStack>
      </Container>
      <Footer />
    </Box>
  );
}
