import { BANKR_SUPPORTED_CHAIN_IDS } from "../../../constants/networks";
import { bindPendingBankrCredential } from "../../bankr/credentialBinding";
import type { TransactionParams } from "../../bankr/submission";
import { pinnedTxRequest } from "../../requests/pinnedRequest";
import { beginPendingRequestEffectLease } from "../../requests/pendingRequestResolution";
import { getUnlockedBankrApiKey } from "../bankrSession";
import {
  resolveLockedSwapAccount,
  validateLockedSwapTransactions,
} from "./accountPolicy";
import { processSwapTxBankr } from "./bankrLeg";
import type {
  SwapAccountLock,
  SwapExecutionResult,
  SwapTxEntry,
} from "./types";

/** Submit one reviewed ERC-7821 swap batch through the pinned Bankr account. */
export async function handleExecuteSwapBatch(
  batchTx: { to: string; data: string; value: string },
  originalTransactions: SwapTxEntry[],
  chainId: number,
  chainName: string,
  accountLock?: SwapAccountLock,
): Promise<SwapExecutionResult> {
  if (originalTransactions.length === 0) {
    return { success: false, error: "No transactions provided" };
  }
  if (!BANKR_SUPPORTED_CHAIN_IDS.has(chainId)) {
    return {
      success: false,
      error: "Chain not supported for Bankr API accounts",
    };
  }

  const locked = await resolveLockedSwapAccount(accountLock);
  if (!locked.ok) return { success: false, error: locked.error };
  const validation = validateLockedSwapTransactions(
    originalTransactions,
    locked.account.address,
    chainId,
  );
  if (!validation.ok) return { success: false, error: validation.error };
  if (locked.account.type !== "bankr") {
    return { success: false, error: "Batch swap requires a Bankr account" };
  }

  const apiKey = await getUnlockedBankrApiKey();
  if (!apiKey) return { success: false, error: "Wallet must be unlocked" };

  const txId = crypto.randomUUID();
  const functionNames = originalTransactions
    .map((transaction) => transaction.functionName || transaction.origin)
    .join(", ");
  const swapMeta = originalTransactions.find(
    (transaction) => transaction.swapMeta,
  )?.swapMeta;
  const bridge = originalTransactions.find(
    (transaction) => transaction.bridge,
  )?.bridge;
  const mainEntry =
    originalTransactions.find((transaction) => transaction.bridge) ??
    originalTransactions.find((transaction) => transaction.swapMeta) ??
    originalTransactions[0];

  const { estimateGasLimitWithBuffer } = await import("../../gasEstimation");
  const buffered = await estimateGasLimitWithBuffer(
    {
      from: locked.account.address,
      to: batchTx.to,
      data: batchTx.data,
      value: batchTx.value,
      chainId,
    },
    50,
  );
  const batchTxParams: TransactionParams = {
    from: locked.account.address,
    to: batchTx.to,
    data: batchTx.data,
    value: batchTx.value,
    chainId,
    ...(buffered ? { gas: buffered.toString() } : {}),
  };
  const pending = await bindPendingBankrCredential(
    pinnedTxRequest(locked.account, {
      id: txId,
      tx: batchTxParams,
      origin: mainEntry?.origin ?? `Batch: ${functionNames}`,
      favicon:
        mainEntry?.favicon ?? originalTransactions[0]?.favicon ?? null,
      chainName,
      timestamp: Date.now(),
      trustedInternal: true,
    }),
  );
  const effectLease = beginPendingRequestEffectLease(
    "internalOperation",
    txId,
  );
  if (!effectLease) {
    return { success: false, error: "Wallet reset is in progress" };
  }

  void processSwapTxBankr(
    txId,
    pending,
    apiKey,
    `Batch: ${functionNames}`,
    swapMeta,
    bridge,
    effectLease,
  );
  return { success: true, txIds: [txId] };
}
