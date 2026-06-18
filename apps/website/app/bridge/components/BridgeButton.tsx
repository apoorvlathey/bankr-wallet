"use client";

import { useEffect, useState } from "react";
import { Button, Text, VStack } from "@chakra-ui/react";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useSendTransaction,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useCapabilities,
  useSendCalls,
  useWaitForCallsStatus,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { erc20Abi, maxUint256, type Address } from "viem";
import {
  BUNGEE_NATIVE_TOKEN,
  type BungeeQuoteResponse,
} from "@walletchan/shared/bungee";

type Step =
  | "idle"
  | "switching"
  | "quoting"
  | "approving"
  | "broadcasting"
  | "confirming";

interface BridgeButtonProps {
  /** Wei string of the input amount the user wants to bridge. */
  inputAmount: string;
  /** From chain. */
  originChainId: number;
  /** Sell token address on the origin chain. */
  inputToken: string;
  /** Latest indicative quote (used to short-circuit when not ready). */
  quote: BungeeQuoteResponse | null;
  /** Function that re-quotes and returns the firm response (with new quoteId). */
  fetchFirmQuote: (taker: string) => Promise<BungeeQuoteResponse | null>;
  /** Notify parent when we have a requestHash / source txHash to poll. */
  onSubmitted: (params: {
    requestHash?: string;
    txHash?: string;
    chainId: number;
  }) => void;
  isAmountValid: boolean;
}

function isNative(token: string): boolean {
  return token.toLowerCase() === BUNGEE_NATIVE_TOKEN;
}

export function BridgeButton({
  inputAmount,
  originChainId,
  inputToken,
  quote,
  fetchFirmQuote,
  onSubmitted,
  isAmountValid,
}: BridgeButtonProps) {
  const { address, isConnected } = useAccount();
  const currentChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pendingBundleId, setPendingBundleId] = useState<string | null>(null);
  const [pendingQuoteId, setPendingQuoteId] = useState<string | null>(null);
  const [pendingTxHash, setPendingTxHash] = useState<`0x${string}` | null>(null);

  // ERC-5792 capability detection on the origin chain.
  const { data: walletCapabilities } = useCapabilities({
    account: address,
    chainId: originChainId,
    query: { enabled: !!address },
  });
  const atomicStatus = walletCapabilities?.atomic?.status;
  const supportsAtomicBatch =
    atomicStatus === "supported" || atomicStatus === "ready";

  const { sendCallsAsync } = useSendCalls();

  // Wait for the batched call (single popup containing approve + bridge) to
  // resolve. `useWaitForCallsStatus` polls under the hood until the bundle
  // reaches a terminal status — cleaner than wiring our own refetchInterval.
  const { data: bundleStatus, error: bundleError } = useWaitForCallsStatus({
    id: pendingBundleId ?? undefined,
    query: { enabled: !!pendingBundleId },
  });

  const { data: txReceipt } = useWaitForTransactionReceipt({
    hash: pendingTxHash ?? undefined,
  });

  // React to bundle status — once the bundle's tx is mined, extract the hash,
  // notify the parent (so cross-chain status polling can start), and free the
  // button. Without this the button stays stuck on "Waiting for confirmation".
  useEffect(() => {
    if (!pendingBundleId) return;

    if (bundleError) {
      setError(bundleError.message || "Bundle status failed");
      setStep("idle");
      setPendingBundleId(null);
      return;
    }

    if (!bundleStatus) return;

    if (bundleStatus.status === "success") {
      // The bridge call is the LAST entry in our calls array (after the
      // optional approve). Use the last receipt's hash for status polling.
      const receipts = bundleStatus.receipts ?? [];
      const last = receipts[receipts.length - 1];
      const hash = last?.transactionHash as `0x${string}` | undefined;
      if (hash && pendingTxHash !== hash) {
        setPendingTxHash(hash);
        onSubmitted({
          requestHash: pendingQuoteId ?? undefined,
          txHash: hash,
          chainId: originChainId,
        });
      }
      setStep("idle");
      setPendingBundleId(null);
    } else if (bundleStatus.status === "failure") {
      const reverted = (bundleStatus.receipts ?? []).some(
        (r) => r.status === "reverted",
      );
      setError(
        reverted
          ? "Bridge transaction reverted onchain."
          : "The wallet rejected or failed to submit the batch.",
      );
      setStep("idle");
      setPendingBundleId(null);
    }
  }, [
    bundleStatus,
    bundleError,
    pendingBundleId,
    pendingTxHash,
    pendingQuoteId,
    onSubmitted,
    originChainId,
  ]);

  // Same idea for the non-atomic path: once the bridge tx receipt arrives,
  // stop showing "Waiting for confirmation". The user-facing progress moves
  // to the BridgeStatus poller (cross-chain).
  useEffect(() => {
    if (!pendingTxHash || !txReceipt) return;
    if (txReceipt.status === "reverted") {
      setError("Bridge transaction reverted onchain.");
    }
    setStep("idle");
  }, [pendingTxHash, txReceipt]);

  // Check on-chain allowance for ERC20 (manual non-atomic path).
  const manualApprovalSpender = quote?.result?.manualRoutes?.[0]?.approvalData
    ?.spenderAddress as Address | undefined;
  const { data: currentAllowance } = useReadContract({
    address: inputToken as Address,
    abi: erc20Abi,
    functionName: "allowance",
    args:
      address && manualApprovalSpender
        ? [address, manualApprovalSpender]
        : undefined,
    chainId: originChainId,
    query: {
      enabled: !isNative(inputToken) && !!address && !!manualApprovalSpender,
    },
  });

  const handleBridge = async () => {
    if (!address || !isConnected) return;
    setError(null);
    setStep("switching");

    try {
      // 1) Make sure we're on the right chain
      if (currentChainId !== originChainId) {
        await switchChainAsync({ chainId: originChainId });
      }

      // 2) Refresh quote (quoteIds expire ~60s)
      setStep("quoting");
      const firm = await fetchFirmQuote(address);
      if (!firm) {
        throw new Error("Failed to fetch firm quote");
      }

      const route = firm.result.manualRoutes?.[0];
      if (!route) {
        throw new Error("No bridge route returned by Socket");
      }

      const txData = route.txData;
      const approvalData = route.approvalData ?? null;
      if (!txData?.to) {
        throw new Error("Socket did not return bridge transaction data");
      }

      // ---- Path A: ERC-5792 batched manual mode (1 popup) ----
      if (supportsAtomicBatch) {
        const calls: Array<{
          to: `0x${string}`;
          data: `0x${string}`;
          value: bigint;
        }> = [];

        if (
          approvalData &&
          !isNative(inputToken) &&
          (currentAllowance ?? 0n) < BigInt(approvalData.amount)
        ) {
          // approve(spender, amount)
          const approveData =
            "0x095ea7b3" +
            approvalData.spenderAddress.replace(/^0x/, "").padStart(64, "0") +
            BigInt(approvalData.amount)
              .toString(16)
              .padStart(64, "0");
          calls.push({
            to: approvalData.tokenAddress as `0x${string}`,
            data: approveData as `0x${string}`,
            value: 0n,
          });
        }

        calls.push({
          to: txData.to as `0x${string}`,
          data: txData.data as `0x${string}`,
          value: BigInt(txData.value || "0"),
        });

        setStep("broadcasting");
        const { id } = await sendCallsAsync({ calls });
        setPendingBundleId(id);
        setPendingQuoteId(route.quoteId);
        onSubmitted({ requestHash: route.quoteId, chainId: originChainId });
        setStep("confirming");
        return;
      }

      // ---- Path B: Manual mode without atomic batching ----
      // ERC20: approve if needed, then send the bridge tx
      // Native: skip approve, just send
      if (
        approvalData &&
        !isNative(inputToken) &&
        (currentAllowance ?? 0n) < BigInt(approvalData.amount)
      ) {
        setStep("approving");
        const approveHash = await writeContractAsync({
          address: approvalData.tokenAddress as Address,
          abi: erc20Abi,
          functionName: "approve",
          args: [
            approvalData.spenderAddress as Address,
            BigInt(approvalData.amount),
          ],
          chainId: originChainId,
        });
        // Wait for receipt before broadcasting the bridge tx
        // (best-effort: many wallets will accept the next tx anyway)
        await new Promise((r) => setTimeout(r, 2000));
        void approveHash;
      }

      setStep("broadcasting");
      const hash = await sendTransactionAsync({
        to: txData.to as Address,
        data: txData.data as `0x${string}`,
        value: BigInt(txData.value || "0"),
        chainId: originChainId,
      });
      setPendingTxHash(hash);
      setPendingQuoteId(route.quoteId);
      onSubmitted({
        requestHash: route.quoteId,
        txHash: hash,
        chainId: originChainId,
      });
      setStep("confirming");
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Strip noisy boilerplate from wallet errors
      const cleaned = msg.replace(/^.*reverted with reason string '/, "").replace(/'$/, "");
      setError(cleaned);
      setStep("idle");
    }
  };

  if (!isConnected) {
    return (
      <ConnectButton.Custom>
        {({ openConnectModal }) => (
          <Button
            variant="primary"
            size="lg"
            w="full"
            onClick={openConnectModal}
          >
            Connect Wallet
          </Button>
        )}
      </ConnectButton.Custom>
    );
  }

  const stepLabel: Record<Step, string> = {
    idle: "Bridge",
    switching: "Switching network…",
    quoting: "Getting fresh quote…",
    approving: "Approving token…",
    broadcasting: "Confirm in your wallet…",
    confirming: "Waiting for confirmation…",
  };

  const disabled = step !== "idle" || !isAmountValid || !quote;

  return (
    <VStack spacing={2} align="stretch" w="full">
      <Button
        variant="primary"
        size="lg"
        w="full"
        onClick={handleBridge}
        isDisabled={disabled}
        isLoading={step !== "idle"}
        loadingText={stepLabel[step]}
      >
        {stepLabel[step]}
      </Button>
      {error && (
        <Text fontSize="xs" color="bauhaus.red" textAlign="center">
          {error}
        </Text>
      )}
    </VStack>
  );
}
