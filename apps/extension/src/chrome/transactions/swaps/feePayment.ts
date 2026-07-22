import { bindPendingBankrCredential } from "../../bankr/credentialBinding";
import { processingBundleIds } from "../../batch/batchExecutionRuntime";
import { getUnlockedBankrApiKey } from "../bankrSession";
import { processUsdcBatchInBackground } from "../../feePayment/batchExecution";
import type { FeePaymentSigner } from "../../feePayment/signing";
import { consumeFeePaymentQuote } from "../../feePayment/quotes";
import { beginPendingRequestEffectLease } from "../../requests/pendingRequestResolution";
import { pinnedBatchTxRequest } from "../../requests/pinnedRequest";
import {
  resolveLocalSwapPrivateKey,
  resolveLockedSwapAccount,
  validateLockedSwapTransactions,
} from "./accountPolicy";
import { selectSwapHistoryEntry } from "./historyMetadata";
import type {
  SwapAccountLock,
  SwapExecutionResult,
  SwapTxEntry,
} from "./types";

interface FeePaymentSwapArgs {
  requestId: string;
  quoteId: string;
  originalTransactions: SwapTxEntry[];
  chainId: number;
  chainName: string;
  accountLock?: SwapAccountLock;
}

/** Submit the reviewed swap calls as one quote-bound token-funded UserOperation. */
export async function handleExecuteSwapWithFeeToken(
  args: FeePaymentSwapArgs,
): Promise<SwapExecutionResult> {
  if (!args.requestId || !args.quoteId || args.originalTransactions.length === 0) {
    return { success: false, error: "A current swap fee-token quote is required" };
  }
  const locked = await resolveLockedSwapAccount(args.accountLock);
  if (!locked.ok) return { success: false, error: locked.error };
  const validation = validateLockedSwapTransactions(
    args.originalTransactions,
    locked.account.address,
    args.chainId,
  );
  if (!validation.ok) return { success: false, error: validation.error };
  const account = locked.account;
  if (
    account.type !== "bankr" &&
    account.type !== "privateKey" &&
    account.type !== "seedPhrase"
  ) {
    return { success: false, error: "Account cannot pay swap gas with a token" };
  }

  const calls = args.originalTransactions.map(({ tx }) => ({
    to: tx.to as `0x${string}`,
    data: (tx.data ?? "0x") as `0x${string}`,
    value: BigInt(tx.value ?? "0x0"),
  }));
  let quote;
  try {
    quote = consumeFeePaymentQuote({
      quoteId: args.quoteId,
      family: "internalSwap",
      requestId: args.requestId,
      account,
      calls,
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Swap fee-token quote is invalid",
    };
  }

  const mainEntry = selectSwapHistoryEntry(args.originalTransactions);
  const bundleId = crypto.randomUUID();
  let pending = pinnedBatchTxRequest(account, {
    id: bundleId,
    params: {
      version: "1.0",
      chainId: `0x${args.chainId.toString(16)}` as `0x${string}`,
      from: account.address as `0x${string}`,
      calls: calls.map((call) => ({
        to: call.to,
        data: call.data,
        value: `0x${call.value.toString(16)}` as `0x${string}`,
      })),
    },
    origin: mainEntry?.origin ?? "swap",
    favicon: mainEntry?.favicon ?? null,
    chainName: args.chainName,
    chainId: args.chainId,
    timestamp: Date.now(),
    trustedInternal: true,
  });
  if (account.type === "bankr") {
    pending = await bindPendingBankrCredential(pending);
  }

  let signer: FeePaymentSigner;
  if (account.type === "bankr") {
    const apiKey = await getUnlockedBankrApiKey();
    if (!apiKey) return { success: false, error: "Wallet must be unlocked" };
    signer = { account, apiKey };
  } else {
    const privateKey = await resolveLocalSwapPrivateKey(account);
    if (!privateKey) return { success: false, error: "Wallet must be unlocked" };
    signer = { account, privateKey };
  }

  const effectLease = beginPendingRequestEffectLease("internalOperation", bundleId);
  if (!effectLease) {
    return { success: false, error: "Wallet reset is in progress" };
  }
  const functionNames = args.originalTransactions
    .map((entry) => entry.functionName || entry.origin)
    .filter(Boolean) as string[];
  const swapMeta = args.originalTransactions.find((entry) => entry.swapMeta)?.swapMeta;
  const bridge = args.originalTransactions.find((entry) => entry.bridge)?.bridge;
  processingBundleIds.add(bundleId);
  void processUsdcBatchInBackground({
    bundleId,
    pending,
    signer,
    functionNames,
    effectLease,
    quote,
    historyMeta: { swapMeta, bridge },
  });
  return { success: true, txIds: [bundleId] };
}
