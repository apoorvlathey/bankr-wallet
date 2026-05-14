"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Button,
  VStack,
  Text,
  Link,
  HStack,
  Box,
  Stepper,
  Step,
  StepIndicator,
  StepStatus,
  StepIcon,
  StepNumber,
  StepSeparator,
  StepTitle,
  StepDescription,
} from "@chakra-ui/react";
import { LoadingShapes } from "../../components/ui/LoadingShapes";
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
  usePublicClient,
  useSignTypedData,
  useCapabilities,
  useSendCalls,
  useCallsStatus,
} from "wagmi";
import {
  erc20Abi,
  encodeFunctionData,
  maxUint256,
  type Address,
  type Hex,
} from "viem";

// Permit2.approve(token, spender, amount, expiration) — onchain Permit2 allowance,
// the alternative to a signed PermitSingle. Used inside ERC-5792 bundles where we
// can't include a typed-data signature mid-batch.
const permit2ApproveAbi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
] as const;

const PERMIT2_MAX_AMOUNT = (1n << 160n) - 1n;
// Compute via BigInt — plain JS `(1 << 48) - 1` silently truncates to 32-bit and
// yields 65535, which is a 1970 timestamp and trips Permit2's AllowanceExpired
// check immediately. 2^48 - 1 = 281474976710655, well below Number.MAX_SAFE_INTEGER.
const PERMIT2_MAX_EXPIRATION = Number((1n << 48n) - 1n);
import {
  type SwapDirection,
  type WchanQuote,
  getAddresses,
  isChainLive,
  applySlippage,
  encodeBuyWchan,
  encodeSellWchan,
  encodeBuyWchanViaBnkrw,
  encodeSellWchanViaBnkrw,
  getErc20AllowanceToPermit2,
  getPermit2Allowance,
  buildPermitSingle,
  getPermitTypedData,
} from "../../../lib/wchan-swap";

type SwapStep =
  | "idle"
  | "switching"
  | "approving"
  | "signing-permit"
  | "swapping";

interface SellFlowStep {
  title: string;
  description: string;
}

interface SwapButtonProps {
  direction: SwapDirection;
  quote: WchanQuote | null;
  chainId: number;
  slippageBps: number;
  isQuoteLoading: boolean;
  inputValid: boolean;
  insufficientBalance: boolean;
  onTxConfirmed?: (hash: `0x${string}`) => void;
}

export function SwapButton({
  direction,
  quote,
  chainId,
  slippageBps,
  isQuoteLoading,
  inputValid,
  insufficientBalance,
  onTxConfirmed,
}: SwapButtonProps) {
  const { address, isConnected } = useAccount();
  const currentChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const client = usePublicClient({ chainId });

  const [step, setStep] = useState<SwapStep>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState<string | null>(null);

  // Sell flow: which steps are needed and which one is next
  const [sellFlowSteps, setSellFlowSteps] = useState<SellFlowStep[]>([]);
  const [sellCurrentStepIdx, setSellCurrentStepIdx] = useState(0);
  // Stores the approval tx hash so we can show a "View Tx" link on the completed Approve step
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>();
  // Permit signature stored between the "Sign Permit" click and "Swap" click
  const permitRef = useRef<
    { permitSingle: ReturnType<typeof buildPermitSingle>; signature: Hex } | undefined
  >(undefined);

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  // ERC-5792 capability check — when supported, sell collapses [approve →
  // sign permit → swap] into a single popup using onchain Permit2 allowance
  // instead of a signed PermitSingle.
  const { data: walletCapabilities } = useCapabilities({
    account: address,
    chainId,
    query: { enabled: !!address },
  });
  const atomicStatus = walletCapabilities?.atomic?.status;
  const supportsAtomicBatch =
    atomicStatus === "supported" || atomicStatus === "ready";

  const {
    sendCalls: sendBatchedCalls,
    data: batchData,
    isPending: isBatchSending,
    reset: resetBatch,
  } = useSendCalls();
  const batchBundleId = batchData?.id;
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
  const isBatchConfirming =
    !!batchBundleId &&
    (batchStatusData?.status === "pending" ||
      batchStatusData?.status === undefined);
  const isBatchConfirmed = batchStatusData?.status === "success";
  const batchTxHash = batchStatusData?.receipts?.[0]?.transactionHash;

  const live = isChainLive(chainId);

  // Stable reference: only re-run when the actual sell amount changes,
  // not on every parent re-render that creates a new quote object.
  const quoteAmountIn = quote?.amountIn;

  // Pre-fetch allowances for sell direction to show the multi-step stepper
  // before the user clicks, so they know how many wallet interactions are needed.
  // When ERC-5792 atomic batching is supported, the entire sell flow collapses
  // to a single popup, so we skip the stepper entirely.
  useEffect(() => {
    if (
      direction !== "sell" ||
      !quoteAmountIn ||
      !client ||
      !address ||
      supportsAtomicBatch
    ) {
      setSellFlowSteps([]);
      setSellCurrentStepIdx(0);
      setApproveTxHash(undefined);
      permitRef.current = undefined;
      return;
    }

    let cancelled = false;
    const check = async () => {
      const addrs = getAddresses(chainId);
      const erc20Allowance = await getErc20AllowanceToPermit2(
        client,
        chainId,
        address
      );
      const permit2Allowance = await getPermit2Allowance(
        client,
        chainId,
        address,
        addrs.universalRouter
      );
      const now = Math.floor(Date.now() / 1000);
      if (cancelled) return;

      const steps: SellFlowStep[] = [];
      if (erc20Allowance < quoteAmountIn) {
        steps.push({
          title: "Approve",
          description: "Allow WCHAN to be traded",
        });
      }
      if (
        permit2Allowance.amount < quoteAmountIn ||
        permit2Allowance.expiration < now
      ) {
        steps.push({
          title: "Sign Permit",
          description: "Sign spending permit",
        });
      }
      steps.push({ title: "Swap", description: "Execute the sell" });
      setSellFlowSteps(steps);
      setSellCurrentStepIdx(0);
      setApproveTxHash(undefined);
      permitRef.current = undefined;
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [direction, quoteAmountIn, client, address, chainId]);

  // Stepper index: current step is "active", earlier steps are "complete",
  // after final confirmation all are "complete" (index = length).
  const sellActiveStep = useMemo(() => {
    if (isConfirmed && txHash) return sellFlowSteps.length;
    return sellCurrentStepIdx;
  }, [sellCurrentStepIdx, isConfirmed, txHash, sellFlowSteps.length]);

  // Store callback in a ref so the effect below doesn't depend on the
  // parent's function reference.  Without this, an unstable onTxConfirmed
  // (e.g. inline arrow or non-memoized handler) causes the effect to
  // re-fire on every parent re-render while isConfirmed is still true,
  // creating an infinite refetch loop that can trigger duplicate wallet
  // tx requests during the multi-step sell flow (approve → permit → swap).
  const onTxConfirmedRef = useRef(onTxConfirmed);
  onTxConfirmedRef.current = onTxConfirmed;

  // Guard: ensure we only notify the parent once per confirmed tx hash.
  // isConfirmed stays true until txHash is reset, so without this guard
  // any re-render would re-fire the callback.
  const firedForHash = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (isConfirmed && txHash && firedForHash.current !== txHash) {
      firedForHash.current = txHash;
      onTxConfirmedRef.current?.(txHash);
    }
  }, [isConfirmed, txHash]);

  // Notify parent + reset batch state when an ERC-5792 bundle confirms.
  const firedForBundle = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      isBatchConfirmed &&
      batchBundleId &&
      firedForBundle.current !== batchBundleId
    ) {
      firedForBundle.current = batchBundleId;
      if (batchTxHash) onTxConfirmedRef.current?.(batchTxHash);
    }
  }, [isBatchConfirmed, batchBundleId, batchTxHash]);

  // The current sell step title determines what clicking the button does.
  const currentSellStepTitle = sellFlowSteps[sellCurrentStepIdx]?.title;

  const handleSwap = async () => {
    if (!address || !isConnected || !quote || !client) return;

    setError(null);
    setTxHash(undefined);
    resetBatch();

    try {
      // Switch chain if needed
      if (currentChainId !== chainId) {
        setStep("switching");
        await switchChainAsync({ chainId });
      }

      if (direction === "buy") {
        // Buy: single step — ETH → WCHAN (direct or via BNKRW)
        setStep("swapping");
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
        const minAmountOut = applySlippage(quote.amountOut, slippageBps);
        const tx =
          quote.route === "via-bnkrw"
            ? encodeBuyWchanViaBnkrw(chainId, quote.amountIn, minAmountOut, deadline)
            : encodeBuyWchan(chainId, quote.amountIn, minAmountOut, deadline);
        const hash = await sendTransactionAsync({
          to: tx.to,
          data: tx.data,
          value: tx.value,
          chainId,
        });
        setTxHash(hash);
        setStep("idle");
      } else if (supportsAtomicBatch) {
        // Sell via ERC-5792 bundle: collapses approve + permit2.approve + UR.execute
        // into a single wallet popup. We use onchain Permit2 allowance instead
        // of a signed PermitSingle, since typed-data signatures can't ride inside
        // wallet_sendCalls.
        const addrs = getAddresses(chainId);
        const erc20Allowance = await getErc20AllowanceToPermit2(
          client,
          chainId,
          address
        );
        const permit2Allowance = await getPermit2Allowance(
          client,
          chainId,
          address,
          addrs.universalRouter
        );
        const now = Math.floor(Date.now() / 1000);

        const calls: { to: Address; value: bigint; data: Hex }[] = [];

        if (erc20Allowance < quote.amountIn) {
          calls.push({
            to: addrs.wchan,
            value: 0n,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [addrs.permit2, maxUint256],
            }),
          });
        }

        if (
          permit2Allowance.amount < quote.amountIn ||
          permit2Allowance.expiration < now
        ) {
          calls.push({
            to: addrs.permit2,
            value: 0n,
            data: encodeFunctionData({
              abi: permit2ApproveAbi,
              functionName: "approve",
              args: [
                addrs.wchan,
                addrs.universalRouter,
                PERMIT2_MAX_AMOUNT,
                PERMIT2_MAX_EXPIRATION,
              ],
            }),
          });
        }

        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
        const minAmountOut = applySlippage(quote.amountOut, slippageBps);
        const sellTx =
          quote.route === "via-bnkrw"
            ? encodeSellWchanViaBnkrw(
                chainId,
                quote.amountIn,
                minAmountOut,
                deadline
              )
            : encodeSellWchan(chainId, quote.amountIn, minAmountOut, deadline);
        calls.push({ to: sellTx.to, value: sellTx.value, data: sellTx.data });

        setStep("swapping");
        sendBatchedCalls(
          { calls, chainId, forceAtomic: true },
          {
            onError: (err) => {
              setStep("idle");
              if (
                err.message.includes("User rejected") ||
                err.message.includes("User denied")
              ) {
                return;
              }
              setError(err.message.slice(0, 200));
            },
            onSuccess: () => {
              setStep("idle");
            },
          }
        );
      } else {
        // Sell: each button press executes only the current step.
        const addrs = getAddresses(chainId);

        if (currentSellStepTitle === "Approve") {
          setStep("approving");
          const approveHash = await writeContractAsync({
            address: addrs.wchan,
            abi: erc20Abi,
            functionName: "approve",
            args: [addrs.permit2, maxUint256],
            chainId,
          });
          await client.waitForTransactionReceipt({ hash: approveHash });
          setApproveTxHash(approveHash);
          setStep("idle");
          setSellCurrentStepIdx((prev) => prev + 1);
        } else if (currentSellStepTitle === "Sign Permit") {
          setStep("signing-permit");
          const permit2Allowance = await getPermit2Allowance(
            client,
            chainId,
            address,
            addrs.universalRouter
          );
          const permitSingle = buildPermitSingle(
            chainId,
            quote.amountIn,
            permit2Allowance.nonce,
            addrs.universalRouter
          );
          const typedData = getPermitTypedData(chainId, permitSingle);
          const signature = await signTypedDataAsync({
            domain: typedData.domain,
            types: typedData.types,
            primaryType: typedData.primaryType,
            message: typedData.message,
          });
          permitRef.current = { permitSingle, signature };
          setStep("idle");
          setSellCurrentStepIdx((prev) => prev + 1);
        } else {
          // "Swap" step
          setStep("swapping");
          const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
          const minAmountOut = applySlippage(quote.amountOut, slippageBps);
          const tx =
            quote.route === "via-bnkrw"
              ? encodeSellWchanViaBnkrw(
                  chainId,
                  quote.amountIn,
                  minAmountOut,
                  deadline,
                  permitRef.current
                )
              : encodeSellWchan(
                  chainId,
                  quote.amountIn,
                  minAmountOut,
                  deadline,
                  permitRef.current
                );
          const hash = await sendTransactionAsync({
            to: tx.to,
            data: tx.data,
            value: tx.value,
            chainId,
          });
          setTxHash(hash);
          setStep("idle");
          permitRef.current = undefined;
        }
      }
    } catch (err: unknown) {
      setStep("idle");
      if (err instanceof Error) {
        if (
          err.message.includes("User rejected") ||
          err.message.includes("User denied")
        ) {
          return;
        }
        setError(err.message.slice(0, 200));
      } else {
        setError("Swap failed");
      }
    }
  };

  const getButtonText = () => {
    if (!isConnected) return "Connect Wallet";
    if (!live) return "Coming Soon";
    if (!inputValid) return "Enter Amount";
    if (insufficientBalance) return "Insufficient Balance";
    if (isQuoteLoading) return "Fetching Quote...";
    if (!quote) return "Enter Amount";
    if (currentChainId !== chainId) return "Switch to Base";
    if (step === "switching") return "Switching Chain...";
    if (step === "approving") return "Approving...";
    if (step === "signing-permit") return "Signing...";
    if (step === "swapping") return "Confirm in Wallet...";
    if (isConfirming || isBatchConfirming) return "Confirming...";

    // Sell with legacy multi-step flow: button text matches the current step.
    // When ERC-5792 batching is supported, the stepper is hidden and we always
    // show the action label ("Sell WCHAN").
    if (
      direction === "sell" &&
      !supportsAtomicBatch &&
      sellFlowSteps.length > 1
    ) {
      if (currentSellStepTitle === "Approve") return "Approve WCHAN";
      if (currentSellStepTitle === "Sign Permit") return "Sign Permit";
    }

    return direction === "buy" ? "Buy WCHAN" : "Sell WCHAN";
  };

  const isDisabled =
    !isConnected ||
    !live ||
    !quote ||
    !inputValid ||
    insufficientBalance ||
    step !== "idle" ||
    isQuoteLoading ||
    isConfirming ||
    isBatchSending ||
    isBatchConfirming;

  const explorerBase = "https://basescan.org";

  const showStepper = direction === "sell" && sellFlowSteps.length > 1;

  return (
    <VStack spacing={3} align="stretch">
      {/* Sell flow: vertical stepper showing approve → permit → swap steps */}
      {showStepper && (
        <Stepper
          index={sellActiveStep}
          orientation="vertical"
          colorScheme="blue"
          size="sm"
          gap={0}
        >
          {sellFlowSteps.map((s, i) => {
            const isComplete = i < sellActiveStep;
            const showViewTx = isComplete && s.title === "Approve" && approveTxHash;

            return (
              <Step key={i}>
                <StepIndicator>
                  <StepStatus
                    complete={<StepIcon />}
                    incomplete={<StepNumber />}
                    active={<StepNumber />}
                  />
                </StepIndicator>
                <Box flexShrink={0} flex={1}>
                  <HStack justify="space-between" align="center">
                    <StepTitle
                      fontSize="sm"
                      fontWeight="800"
                      textTransform="uppercase"
                      letterSpacing="wide"
                    >
                      {s.title}
                    </StepTitle>
                    {showViewTx && (
                      <Link
                        href={`${explorerBase}/tx/${approveTxHash}`}
                        isExternal
                        fontSize="xs"
                        fontWeight="bold"
                        color="bauhaus.blue"
                        textDecoration="underline"
                        textTransform="uppercase"
                      >
                        View Tx
                      </Link>
                    )}
                  </HStack>
                  <StepDescription
                    fontSize="xs"
                    color="gray.500"
                    fontWeight="medium"
                  >
                    {s.description}
                  </StepDescription>
                </Box>
                <StepSeparator />
              </Step>
            );
          })}
        </Stepper>
      )}

      <Button
        variant={direction === "buy" ? "green" : "primary"}
        size="lg"
        w="full"
        onClick={handleSwap}
        isDisabled={isDisabled}
        fontSize="md"
        py={6}
      >
        <HStack spacing={3}>
          {(step !== "idle" ||
            isConfirming ||
            isQuoteLoading ||
            isBatchSending ||
            isBatchConfirming) && <LoadingShapes />}
          <Text>{getButtonText()}</Text>
        </HStack>
      </Button>

      {error && (
        <Text
          fontSize="sm"
          color="bauhaus.red"
          fontWeight="bold"
          textAlign="center"
        >
          {error}
        </Text>
      )}

      {((isConfirmed && txHash) || (isBatchConfirmed && batchTxHash)) && (
        <Text fontSize="sm" fontWeight="bold" textAlign="center">
          Swap confirmed!{" "}
          <Link
            href={`${explorerBase}/tx/${batchTxHash || txHash}`}
            isExternal
            color="bauhaus.blue"
            textDecoration="underline"
          >
            View on BaseScan
          </Link>
        </Text>
      )}
    </VStack>
  );
}
