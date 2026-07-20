import { getStoredResolvedChainById } from "@/lib/chains";
import { getAccountById } from "../accountStorage";
import { attachClearSignedMetaToHistory } from "../clearSignedMetaSnapshot";
import {
  getNextNonce,
  reserveNonce,
  resetNonce,
} from "../forceInclusion/nonceManager";
import {
  applyReceiptToHistory,
  startReceiptPolling,
} from "../forceInclusion/receiptPoller";
import {
  beginPendingRequestEffectLease,
  guardPendingRequestEffectLease,
  type PendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import {
  getPendingTxRequestById,
  removePendingTxRequest,
  type PendingTxRequest,
} from "../requests/pendingTxStorage";
import { addTxToHistory, updateTxInHistory } from "../txHistoryStorage";
import type { LedgerAccount } from "../types";
import { lookupFunctionName } from "../transactions/displayMetadata";
import { handleTransactionFailure } from "../transactions/failure";
import {
  activeAbortControllers,
  processingTxIds,
  resolvePinnedAccount,
  writeResultToStorage,
} from "../transactions/runtime";
import type { GasOverrides } from "../transactions/localExecution";
import { cancelLedgerOperation } from "./offscreenBridge";
import { ensureLedgerSigningSession } from "./session";
import { signAndBroadcastLedgerTransaction } from "./signing";
import { validateTransactionNonceSelection } from "../transactions/noncePolicy";
import { replacementGasSelectionError } from "@/lib/transactionReplacement";

type ConfirmationResult = { success: boolean; error?: string };

/** Confirms one pinned Ledger transaction and starts device execution. */
export async function handleConfirmTransactionAsyncLedger(
  txId: string,
  password: string,
  _tabId?: number,
  functionName?: string,
  gasOverrides?: GasOverrides,
  forceInclusion?: boolean,
  nonce?: unknown,
): Promise<ConfirmationResult> {
  if (processingTxIds.has(txId)) {
    return { success: false, error: "Transaction already being processed" };
  }
  const pending = await getPendingTxRequestById(txId);
  if (!pending) return { success: false, error: "Transaction request not found" };
  processingTxIds.add(txId);

  const fail = (error: string): ConfirmationResult => {
    processingTxIds.delete(txId);
    return { success: false, error };
  };
  const pinned = await resolvePinnedAccount(pending);
  if (!pinned.ok) return fail(pinned.error);
  if (pinned.account.type !== "ledger") {
    return fail("Account does not support Ledger signing");
  }
  if (forceInclusion) {
    return fail("Force inclusion is not supported for Ledger accounts");
  }
  if (pending.delegation7702Meta) {
    return fail("EIP-7702 delegation is not supported for Ledger accounts");
  }
  if (
    pending.tx.from?.toLowerCase() !== pinned.account.address.toLowerCase()
  ) {
    return fail("Transaction 'from' does not match active account");
  }
  const nonceSelection = validateTransactionNonceSelection(
    nonce,
    "native",
    pending.replacement?.nonce,
  );
  if (!nonceSelection.ok) return fail(nonceSelection.error);
  const replacementGasError = replacementGasSelectionError(
    pending.replacement,
    gasOverrides,
  );
  if (replacementGasError) return fail(replacementGasError);

  try {
    await ensureLedgerSigningSession(password);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Wallet must be unlocked");
  }

  const authorization = await enforcePendingRequestAuthorizationAtConfirmation(
    "transaction",
    pending,
  );
  if (!authorization.authorized) return fail(authorization.error);
  const effectLease = beginPendingRequestEffectLease("transaction", txId);
  if (!effectLease) return fail("Wallet reset is in progress");

  return processLedgerTransaction({
    txId,
    pending,
    account: pinned.account,
    functionName,
    gasOverrides,
    nonce: nonceSelection.nonce,
    effectLease,
  });
}

async function processLedgerTransaction(input: {
  txId: string;
  pending: PendingTxRequest;
  account: LedgerAccount;
  functionName?: string;
  gasOverrides?: GasOverrides;
  nonce?: number;
  effectLease: PendingRequestEffectLease;
}): Promise<ConfirmationResult> {
  const {
    txId,
    pending,
    account,
    functionName,
    gasOverrides,
    nonce: nonceOverride,
    effectLease,
  } = input;
  const abortController = new AbortController();
  activeAbortControllers.set(txId, abortController);
  abortController.signal.addEventListener(
    "abort",
    () => void cancelLedgerOperation(txId).catch(() => undefined),
    { once: true },
  );
  const effectGuard = guardPendingRequestEffectLease(effectLease);
  let requestCommitted = false;

  try {
    const txForHistory = gasOverrides
      ? {
          ...pending.tx,
          gas: gasOverrides.gasLimit,
          maxFeePerGas: gasOverrides.maxFeePerGas,
          maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
          gasPrice: undefined,
          ...(nonceOverride !== undefined ? { nonce: nonceOverride } : {}),
        }
      : {
          ...pending.tx,
          ...(nonceOverride !== undefined ? { nonce: nonceOverride } : {}),
        };
    const resolvedChain = await getStoredResolvedChainById(pending.tx.chainId);
    const nonce =
      nonceOverride === undefined
        ? await getNextNonce(account.address, pending.tx.chainId)
        : reserveNonce(account.address, pending.tx.chainId, nonceOverride);
    let result;
    try {
      result = await signAndBroadcastLedgerTransaction({
        opId: txId,
        account,
        tx: { ...pending.tx, nonce },
        gasOverrides,
        beforeBroadcast: async () => {
          const latest = await getAccountById(account.id);
          if (
            !latest ||
            latest.type !== "ledger" ||
            latest.address.toLowerCase() !== account.address.toLowerCase() ||
            latest.deviceId !== account.deviceId ||
            latest.hdPath !== account.hdPath
          ) {
            throw new Error("Pending request account is no longer available");
          }
          const finalAuthorization =
            await enforcePendingRequestAuthorizationAtConfirmation(
              "transaction",
              pending,
            );
          if (!finalAuthorization.authorized) {
            throw new Error(finalAuthorization.error);
          }

          // Keep the confirmation screen and request editor mounted while the
          // device is waiting. The Ledger signature has been recovered at this
          // point, so the request can now cross its terminal boundary before
          // the raw transaction is broadcast.
          await removePendingTxRequest(txId);
          requestCommitted = true;
          await addTxToHistory({
            id: txId,
            status: "processing",
            tx: { ...txForHistory, nonce },
            origin: pending.origin,
            favicon: pending.favicon,
            chainName: pending.chainName,
            chainId: pending.tx.chainId,
            createdAt: pending.timestamp,
            accountType: "ledger",
            functionName,
            parentBundleId: pending.parentBundleId,
            bundleIndex: pending.bundleIndex,
            replacement: pending.replacement,
            accountId: pending.accountId,
          });
          if (!functionName && pending.tx.data && pending.tx.data !== "0x") {
            void lookupFunctionName(pending.tx.data).then((name) => {
              if (name) void updateTxInHistory(txId, { functionName: name });
            });
          }
          void attachClearSignedMetaToHistory(
            txId,
            { ...pending.tx, to: pending.tx.to ?? undefined },
            pending.tx.chainId,
          );
          effectGuard.beginEffect();
        },
      });
      effectGuard.settleEffect();
    } catch (error) {
      // Device/preparation failures occur before raw RPC broadcast. The shared
      // broadcaster converts post-send transport ambiguity into a tracked hash.
      effectGuard.settleEffect();
      throw error;
    }

    if (result.txHash && result.receipt) {
      if (pending.replacement) {
        await updateTxInHistory(
          pending.replacement.originalTxId,
          { replacedByTxId: txId },
        ).catch(() => undefined);
      }
      await applyReceiptToHistory(
        txId,
        result.txHash,
        pending.tx.chainId,
        result.receipt,
        { rpcUrl: resolvedChain?.rpcUrl, signedGasLimit: result.signedGasLimit },
      );
    } else {
      if (pending.replacement && result.txHash) {
        await updateTxInHistory(
          pending.replacement.originalTxId,
          { replacedByTxId: txId },
        ).catch(() => undefined);
      }
      await updateTxInHistory(txId, {
        status: "pending",
        txHash: result.txHash,
        broadcastUncertain: result.broadcastUncertain === true,
      });
      if (result.txHash) {
        startReceiptPolling(txId, result.txHash, pending.tx.chainId);
      }
    }
    await writeResultToStorage(`txResult:${txId}`, {
      success: true,
      txHash: result.txHash,
    });
    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Ledger transaction failed";
    resetNonce(account.address, pending.tx.chainId);
    if (requestCommitted) {
      await handleTransactionFailure(txId, pending, errorMessage);
    }
    return { success: false, error: errorMessage };
  } finally {
    effectGuard.releaseIfSafe();
    activeAbortControllers.delete(txId);
    processingTxIds.delete(txId);
  }
}
