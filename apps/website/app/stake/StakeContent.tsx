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
import { palette } from "../home-v2/design";
import { useVaultData } from "../contexts/VaultDataContext";
import { useTokenData } from "../contexts/TokenDataContext";
import { StakeFooter, StakeNavigation } from "./StakeChrome";
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
      bg="rgba(245,158,11,0.08)"
      border="1px solid rgba(245,158,11,0.30)"
      borderRadius="12px"
      p={5}
    >
      <Flex
        direction={{ base: "column", md: "row" }}
        align={{ base: "stretch", md: "center" }}
        justify="space-between"
        gap={3}
      >
        <VStack align="flex-start" spacing={1}>
          <Text
            color={palette.yellow}
            fontWeight="800"
            fontSize="12px"
            textTransform="uppercase"
            letterSpacing="wider"
          >
            Migrate from old vault
          </Text>
          <Text fontSize="13px" fontWeight="600" color={palette.muted}>
            You have{" "}
            <Text as="span" color={palette.white} fontWeight="800">
              {formatBalance(balance)}
            </Text>{" "}
            sBNKRW in the old vault.
          </Text>
          <Text fontSize="13px" fontWeight="600" color={palette.muted}>
            Move to sWCHAN and start earning{" "}
            <Text as="span" color={palette.green} fontWeight="800">
              {vaultData ? `${vaultData.totalApy.toFixed(1)}%` : "—"} APY
            </Text>
            .
          </Text>
        </VStack>
        <Button
          size="sm"
          minW="160px"
          h="42px"
          px={5}
          bg={palette.yellow}
          color={palette.ink}
          borderRadius="8px"
          fontWeight="800"
          _hover={{ bg: palette.amberSoft }}
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
              <Spinner size="xs" color={palette.yellow} />
              <Text
                color={palette.muted}
                fontSize="xs"
                fontWeight="700"
                textTransform="uppercase"
              >
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
              color={palette.yellow}
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
    <Box
      minH="100vh"
      bg={palette.ink}
      color={palette.white}
      backgroundImage="linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)"
      backgroundSize="64px 64px"
      sx={{ colorScheme: "dark" }}
    >
      <StakeNavigation />

      <Container maxW="6xl" pt={{ base: 14, md: 20 }} pb={{ base: 24, md: 32 }}>
        <VStack spacing={{ base: 8, md: 10 }} align="stretch">
          <Flex
            direction={{ base: "column", md: "row" }}
            align={{ base: "stretch", md: "flex-start" }}
            justify="space-between"
            gap={{ base: 6, md: 10 }}
          >
            {/* Header */}
            <VStack
              spacing={4}
              textAlign="left"
              align="flex-start"
              maxW="760px"
              ref={headingRef}
            >
              <MotionBox
                initial={{ opacity: 0, y: 20 }}
                animate={isHeadingInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5 }}
              >
                <HStack spacing={3}>
                  <Box boxSize="9px" bg={palette.yellow} borderRadius="full" />
                  <Text
                    color={palette.yellow}
                    fontSize="12px"
                    fontWeight="800"
                    textTransform="uppercase"
                    letterSpacing="0.14em"
                  >
                    WCHAN vault · Base
                  </Text>
                </HStack>
              </MotionBox>

              <Text
                color={palette.white}
                fontSize={{ base: "42px", md: "64px" }}
                fontWeight="750"
                letterSpacing="-0.045em"
                lineHeight="0.98"
              >
                Put your WCHAN to work.
              </Text>
              <Text
                fontSize={{ base: "16px", md: "18px" }}
                color={palette.muted}
                maxW="640px"
                lineHeight="1.7"
              >
                Deposit WCHAN into the vault to earn WETH and WCHAN rewards.
              </Text>
            </VStack>

            {/* Connect Button */}
            <HStack justify={{ base: "flex-end", md: "flex-start" }}>
              <Box
                sx={{
                  "& button": {
                    background: `${palette.ink3} !important`,
                    color: `${palette.white} !important`,
                    border: "1px solid rgba(255,255,255,0.12) !important",
                    borderRadius: "9px !important",
                    fontWeight: "700 !important",
                    fontFamily: "'Outfit', sans-serif !important",
                    boxShadow: "none !important",
                  },
                  "& button:hover": {
                    background: "rgba(255,255,255,0.12) !important",
                  },
                }}
              >
                <ConnectButton
                  chainStatus="none"
                  showBalance={false}
                  accountStatus="full"
                />
              </Box>
            </HStack>
          </Flex>

          {/* Wrong Chain Banner */}
          {isWrongChain && (
            <HStack
              justify="center"
              spacing={3}
              maxW="3xl"
              mx="auto"
              w="full"
              bg="rgba(248,113,113,0.10)"
              border="1px solid rgba(248,113,113,0.35)"
              borderRadius="10px"
              px={4}
              py={3}
            >
              <AlertTriangle size={18} color={palette.red} />
              <Text
                fontSize="sm"
                fontWeight="800"
                textTransform="uppercase"
                letterSpacing="wide"
                color={palette.red}
              >
                Wrong Network
              </Text>
              <Button
                size="sm"
                bg={palette.red}
                color={palette.ink}
                fontWeight="900"
                borderRadius="8px"
                _hover={{ bg: "#fca5a5" }}
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
            <Box maxW="3xl" mx="auto" w="full">
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
          <Box maxW="3xl" mx="auto" w="full">
            {/* Stats Row */}
            {!isVaultLoading && vaultData && (
              <Flex gap={3} mb={4}>
                {/* APY Box */}
                <Box
                  flex={1}
                  bg={palette.ink2}
                  border="1px solid rgba(255,255,255,0.10)"
                  borderRadius="12px"
                  px={{ base: 4, md: 5 }}
                  py={4}
                >
                  <Text
                    fontSize="xs"
                    fontWeight="800"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    color={palette.faint}
                  >
                    Total APY
                  </Text>
                  <Text
                    mt={1}
                    fontSize={{ base: "26px", md: "32px" }}
                    fontWeight="800"
                    color={palette.green}
                    letterSpacing="-0.03em"
                  >
                    {vaultData.totalApy.toFixed(2)}%
                  </Text>
                  <Flex gap={1.5} mt={1}>
                    <Text fontSize="xs" fontWeight="700" color={palette.muted}>
                      WCHAN {vaultData.wchanApy.toFixed(1)}%
                    </Text>
                    <Text fontSize="xs" fontWeight="900" color={palette.faint}>
                      +
                    </Text>
                    <Text fontSize="xs" fontWeight="700" color={palette.muted}>
                      WETH {vaultData.wethApy.toFixed(1)}%
                    </Text>
                  </Flex>
                </Box>

                {/* TVL Box */}
                <Flex
                  flex={1}
                  bg="#1c160d"
                  border="1px solid rgba(245,158,11,0.28)"
                  borderRadius="12px"
                  px={{ base: 4, md: 5 }}
                  py={4}
                  direction="column"
                  align="flex-start"
                  justify="center"
                >
                  <Text
                    fontSize="xs"
                    fontWeight="800"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    color={palette.faint}
                  >
                    TVL
                  </Text>
                  <Text
                    mt={1}
                    color={palette.yellow}
                    fontSize={{ base: "26px", md: "32px" }}
                    fontWeight="800"
                    letterSpacing="-0.03em"
                  >
                    {formatUsd(vaultData.tvlUsd)}
                  </Text>
                </Flex>
              </Flex>
            )}

            {/* Staked Balance + WETH Rewards */}
            {isWalletConnected && !isWrongChain && (
              <Box
                bg={palette.ink2}
                border="1px solid rgba(255,255,255,0.10)"
                borderRadius="12px"
                overflow="hidden"
                mb={4}
              >
                {/* Staked Balance */}
                <Box
                  px={4}
                  py={3}
                  borderBottom="1px solid"
                  borderColor="rgba(255,255,255,0.08)"
                >
                  <Text
                    fontSize="xs"
                    fontWeight="800"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    color={palette.faint}
                  >
                    Your Staked Balance
                  </Text>
                  <HStack spacing={2} align="baseline">
                    <Text fontSize="lg" fontWeight="800" color={palette.white}>
                      {formatBalance(stakedBalance as bigint | undefined)}{" "}
                      sWCHAN
                    </Text>
                    {tokenPrice > 0 &&
                      vaultData &&
                      stakedBalance !== undefined && (
                        <Text fontSize="xs" fontWeight="600" color={palette.faint}>
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
                      color={palette.faint}
                    >
                      Claimable WETH Rewards
                    </Text>
                    <HStack spacing={2} align="baseline">
                      <Text
                        fontSize="lg"
                        fontWeight="900"
                        color={palette.white}
                      >
                        {earnedWeth !== undefined
                          ? `${formatUnits(earnedWeth as bigint, 18).slice(0, 12)} WETH`
                          : "—"}
                      </Text>
                      {earnedWeth !== undefined &&
                        (earnedWeth as bigint) > 0n &&
                        ethPrice > 0 && (
                          <Text
                            fontSize="sm"
                            fontWeight="700"
                            color={palette.faint}
                          >
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
                    size="sm"
                    bg={palette.yellow}
                    color={palette.ink}
                    borderRadius="8px"
                    fontWeight="800"
                    _hover={{ bg: palette.amberSoft }}
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
              bg={palette.ink2}
              border="1px solid rgba(255,255,255,0.12)"
              borderRadius="14px"
              boxShadow="0 28px 80px rgba(0,0,0,0.32)"
              position="relative"
              overflow="hidden"
            >
              {/* Tabs */}
              <Flex
                p={1.5}
                m={3}
                mb={0}
                bg={palette.ink}
                border="1px solid rgba(255,255,255,0.08)"
                borderRadius="10px"
              >
                <Box
                  as="button"
                  flex={1}
                  py={3}
                  bg={activeTab === "deposit" ? palette.yellow : "transparent"}
                  color={activeTab === "deposit" ? palette.ink : palette.muted}
                  borderRadius="7px"
                  fontWeight="800"
                  fontSize="sm"
                  transition="background 180ms ease, color 180ms ease"
                  _hover={{
                    bg:
                      activeTab === "deposit"
                        ? palette.yellow
                        : "rgba(255,255,255,0.06)",
                    color:
                      activeTab === "deposit" ? palette.ink : palette.white,
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
                  bg={activeTab === "withdraw" ? palette.yellow : "transparent"}
                  color={activeTab === "withdraw" ? palette.ink : palette.muted}
                  borderRadius="7px"
                  fontWeight="800"
                  fontSize="sm"
                  transition="background 180ms ease, color 180ms ease"
                  _hover={{
                    bg:
                      activeTab === "withdraw"
                        ? palette.yellow
                        : "rgba(255,255,255,0.06)",
                    color:
                      activeTab === "withdraw" ? palette.ink : palette.white,
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
              <VStack spacing={5} p={{ base: 4, md: 6 }} position="relative">
                {/* Balance display */}
                <Flex justify="space-between" w="full" align="center">
                  <Text
                    fontSize="xs"
                    fontWeight="800"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    color={palette.faint}
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
                        color={palette.faint}
                        textTransform="uppercase"
                        letterSpacing="wider"
                      >
                        Balance:
                      </Text>
                      <Text
                        fontSize="xs"
                        fontWeight="900"
                        color={palette.white}
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
                    bg={palette.ink}
                    border="1px solid"
                    borderColor={
                      hasInsufficientBalance
                        ? "rgba(248,113,113,0.65)"
                        : "rgba(255,255,255,0.12)"
                    }
                    borderRadius="10px"
                    align="center"
                    px={4}
                    h="68px"
                    transition="border-color 160ms ease"
                    _focusWithin={{ borderColor: palette.yellow }}
                  >
                    <Input
                      value={amount}
                      onChange={(e) => handleAmountChange(e.target.value)}
                      placeholder="0.0"
                      border="none"
                      color={palette.white}
                      borderRadius="8px"
                      fontWeight="900"
                      fontSize="24px"
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
                          color={palette.faint}
                          whiteSpace="nowrap"
                        >
                          ≈ {formatUsd(parseFloat(amount) * tokenPrice)}
                        </Text>
                      )}
                      <Text
                        fontSize="sm"
                        fontWeight="900"
                        color={palette.muted}
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
                                sliderValue >= pct
                                  ? palette.yellow
                                  : palette.faint
                              }
                              whiteSpace="nowrap"
                              transform="translateX(-50%)"
                            >
                              {pct}%
                            </SliderMark>
                          ))}
                          <SliderTrack
                            bg="rgba(255,255,255,0.08)"
                            h="4px"
                            borderRadius="full"
                          >
                            <SliderFilledTrack
                              bg={palette.yellow}
                              borderRadius="full"
                            />
                          </SliderTrack>
                          <SliderThumb
                            boxSize={5}
                            bg={palette.yellow}
                            border="2px solid"
                            borderColor={palette.ink}
                            borderRadius="6px"
                            _focus={{ boxShadow: `0 0 0 3px ${palette.ink3}` }}
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
                    color={palette.red}
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
                    bg="rgba(245,158,11,0.08)"
                    border="1px solid rgba(245,158,11,0.28)"
                    borderRadius="9px"
                    px={4}
                    py={3}
                  >
                    <AlertTriangle
                      size={14}
                      color={palette.yellow}
                      style={{ flexShrink: 0 }}
                    />
                    <Box>
                      <Text fontSize="xs" fontWeight="700" color={palette.yellow}>
                        Early withdrawal penalty: {penaltyPct.toFixed(1)}%
                        (decays linearly to 0%)
                      </Text>
                      {zeroPenaltyDate && (
                        <Text fontSize="xs" fontWeight="600" color={palette.muted}>
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
                      bg={palette.ink}
                      border="1px solid rgba(255,255,255,0.09)"
                      borderRadius="9px"
                    >
                      <Flex justify="space-between" px={4} py={3}>
                        <Text
                          fontSize="xs"
                          fontWeight="700"
                          color={palette.muted}
                          textTransform="uppercase"
                          letterSpacing="wider"
                        >
                          You receive
                        </Text>
                        <Text
                          fontSize="xs"
                          fontWeight="900"
                          color={palette.white}
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
                            borderColor="rgba(255,255,255,0.08)"
                          >
                            <Text
                              fontSize="xs"
                              fontWeight="700"
                              color={palette.yellow}
                              textTransform="uppercase"
                              letterSpacing="wider"
                            >
                              0% penalty at
                            </Text>
                            <Text
                              fontSize="xs"
                              fontWeight="800"
                              color={palette.muted}
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
                      bg={palette.ink}
                      border="1px solid rgba(255,255,255,0.09)"
                      borderRadius="9px"
                      px={4}
                      py={3}
                    >
                      <Text
                        fontSize="xs"
                        fontWeight="700"
                        color={palette.muted}
                        textTransform="uppercase"
                        letterSpacing="wider"
                      >
                        You receive
                      </Text>
                      <Box textAlign="right">
                        <Text
                          fontSize="xs"
                          fontWeight="900"
                          color={palette.white}
                        >
                          {formatBalance(previewAssetsNet as bigint)} WCHAN
                        </Text>
                        {penaltyPct > 0 && (
                          <Text
                            fontSize="xs"
                            fontWeight="700"
                            color={palette.yellow}
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
                    bg={palette.ink}
                    border="1px solid rgba(255,255,255,0.09)"
                    borderRadius="9px"
                    px={4}
                    py={2}
                  >
                    {(isApproveConfirming ||
                      isDepositConfirming ||
                      isRedeemConfirming ||
                      isDepositBatchConfirming) && (
                      <>
                        <Spinner size="xs" color={palette.yellow} />
                        <Text
                          fontSize="xs"
                          fontWeight="700"
                          color={palette.muted}
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
                        color={palette.yellow}
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
                        borderRadius: "9px !important",
                        fontWeight: "800 !important",
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
                          size="lg"
                          h="52px"
                          bg={palette.yellow}
                          color={palette.ink}
                          borderRadius="9px"
                          _hover={{ bg: palette.amberSoft }}
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
                    size="lg"
                    h="52px"
                    bg={palette.yellow}
                    color={palette.ink}
                    borderRadius="9px"
                    fontWeight="800"
                    _hover={{ bg: palette.amberSoft }}
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
                    size="lg"
                    h="52px"
                    bg={palette.yellow}
                    color={palette.ink}
                    borderRadius="9px"
                    fontWeight="800"
                    _hover={{ bg: palette.amberSoft }}
                    _disabled={{
                      bg: palette.ink3,
                      color: palette.faint,
                      opacity: 1,
                      cursor: "not-allowed",
                    }}
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
                {activeTab === "deposit" && (
                  <Text
                    color={palette.faint}
                    fontSize="11px"
                    lineHeight="1.5"
                    textAlign="center"
                  >
                    The early-withdrawal penalty starts at 20% and decays to
                    zero over seven days.
                  </Text>
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
              color={palette.faint}
              _hover={{ color: palette.yellow }}
            >
              Vault
              <ExternalLink size={12} />
            </Link>
          </Center>
        </VStack>
      </Container>
      <StakeFooter />
    </Box>
  );
}
