/** Bankr batch confirmation, submission, and terminalization pipeline. */
import { BANKR_SUPPORTED_CHAIN_IDS, CHAIN_NAMES } from "../../constants/networks";
import { CHAIN_CONFIG } from "../../constants/chainConfig";
import { submitTransactionDirect, type TransactionParams } from "../bankr/submission";
import { authorizePendingBankrSubmit } from "../bankr/pendingAuthorization";
import { encodeBatchCalls } from "./batchTxEncoding";
import { processingBundleIds } from "./batchExecutionRuntime";
import { fetchAndStoreBatchGasData } from "./batchGasEnrichment";
import { handleBatchFailure } from "./batchFailure";
import { getAccountById } from "../accountStorage";
import { handleUnlockWallet } from "../authHandlers";
import { loadDecryptedApiKey } from "../crypto";
import { BUNDLE_STATUS } from "../erc5792Types";
import type { PendingBatchTxRequest } from "../erc5792Types";
import { updateBundleStatus } from "./bundleStatusStorage";
import { removePendingBatchTxRequest, getPendingBatchTxRequestById } from "../requests/pendingBatchTxStorage";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import { beginPendingRequestEffectLease, guardPendingRequestEffectLease, type PendingRequestEffectLease } from "../requests/pendingRequestResolution";
import { writeResultToStorage } from "../transactions/runtime";
import { fetchRawTransactionReceipt, toBundleReceipt, extractAssetChangesWhenReceiptAvailable } from "../receiptEnrichment";
import { getCachedApiKey, getCachedPassword, getAutoLockTimeout, tryRestoreSession, setCachedApiKey } from "../sessionCache";
import { startReceiptPolling } from "../forceInclusion/receiptPoller";
import { addTxToHistory, updateTxInHistory } from "../txHistoryStorage";
import { showNotification } from "../transactions/notification";

export async function handleConfirmBatchTransaction(
  bundleId: string,
  password: string,
  functionNames?: string[],
  forceInclusion?: boolean,
): Promise<{ success: boolean; error?: string }> {
  if (processingBundleIds.has(bundleId)) {
    return { success: false, error: "Bundle already being processed" };
  }

  const pending = await getPendingBatchTxRequestById(bundleId);
  if (!pending) return { success: false, error: "Batch request not found" };

  // SECURITY: resolve the pinned account; reject stale/missing bindings.
  if (!pending.accountId) {
    return { success: false, error: "Pending request is no longer valid" };
  }
  const pinnedAccount = await getAccountById(pending.accountId);
  if (!pinnedAccount) {
    return { success: false, error: "Account no longer exists" };
  }
  if (
    pending.accountAddress &&
    pinnedAccount.address.toLowerCase() !== pending.accountAddress.toLowerCase()
  ) {
    return { success: false, error: "Pending request is no longer valid" };
  }
  if (pinnedAccount.type !== "bankr") {
    return {
      success: false,
      error: "Pending request is no longer valid",
    };
  }

  // Validate chain support.
  // For force inclusion, the actual L1 deposit goes to the L1 chain — verify
  // THAT chain is in the Bankr-supported set (currently mainnet only).
  if (forceInclusion) {
    const { FORCE_INCLUSION_CHAINS } = await import(
      "../../constants/chainRegistry"
    );
    const info = FORCE_INCLUSION_CHAINS.get(pending.chainId);
    if (!info) {
      return { success: false, error: "Chain does not support force inclusion" };
    }
    if (!BANKR_SUPPORTED_CHAIN_IDS.has(info.l1ChainId)) {
      return {
        success: false,
        error: `Force inclusion via Bankr requires an L1 chain supported by the Bankr API. Use a Private Key or Seed Phrase account to force-include on testnets.`,
      };
    }
  } else if (!BANKR_SUPPORTED_CHAIN_IDS.has(pending.chainId)) {
    return {
      success: false,
      error: `Chain ${CHAIN_NAMES[pending.chainId] || pending.chainId} is not supported for Bankr API accounts`,
    };
  }

  processingBundleIds.add(bundleId);

  // Get API key (same pattern as handleConfirmTransactionAsync)
  let apiKey = getCachedApiKey();

  if (!apiKey) {
    if (!getCachedPassword()) {
      const autoLockTimeout = await getAutoLockTimeout();
      if (autoLockTimeout === 0) {
        await tryRestoreSession(handleUnlockWallet);
        apiKey = getCachedApiKey();
      }
    }

    if (!apiKey) {
      apiKey = await loadDecryptedApiKey(password);
      if (!apiKey) {
        processingBundleIds.delete(bundleId);
        return { success: false, error: "Invalid password" };
      }
      setCachedApiKey(apiKey, password);
    }
  }

  const forceInclusionProcessor = forceInclusion
    ? (await import("../forceInclusion/batch")).processForceInclusionBatchBankr
    : null;

  // Remove from pending storage
  await removePendingBatchTxRequest(bundleId);

  const authorization =
    await enforcePendingRequestAuthorizationAtConfirmation(
      "batchTransaction",
      pending,
    );
  if (!authorization.authorized) {
    processingBundleIds.delete(bundleId);
    return { success: false, error: authorization.error };
  }

  const effectLease = beginPendingRequestEffectLease(
    "batchTransaction",
    bundleId,
  );
  if (!effectLease) {
    processingBundleIds.delete(bundleId);
    return { success: false, error: "Wallet reset is in progress" };
  }

  // Branch to force inclusion if requested
  if (forceInclusionProcessor) {
    forceInclusionProcessor(
      bundleId,
      pending,
      apiKey,
      functionNames,
      effectLease,
    );
    return { success: true };
  }

  // Process in background
  processBatchTransactionInBackground(
    bundleId,
    pending,
    apiKey,
    pinnedAccount.address,
    functionNames,
    effectLease,
  );

  return { success: true };
}

async function processBatchTransactionInBackground(
  bundleId: string,
  pending: PendingBatchTxRequest,
  apiKey: string,
  pinnedAddress: string,
  functionNames?: string[],
  effectLease?: PendingRequestEffectLease,
): Promise<void> {
  const effectGuard = guardPendingRequestEffectLease(effectLease);
  try {
    // Encode calls into single ERC-7821 tx using the pinned account address.
    const batchTx = encodeBatchCalls(pending.params.calls, pinnedAddress);

    const tx: TransactionParams = {
      from: pinnedAddress,
      to: batchTx.to,
      data: batchTx.data,
      value: batchTx.value,
      chainId: pending.chainId,
    };

    // Compose display function name
    const displayName = functionNames?.length
      ? `Batch: ${functionNames.join(", ")}`
      : `Batch (${pending.params.calls.length} calls)`;

    // Save to tx history as "processing"
    await addTxToHistory({
      id: bundleId,
      status: "processing",
      tx,
      origin: pending.origin,
      favicon: pending.favicon,
      chainName: pending.chainName,
      chainId: pending.chainId,
      createdAt: pending.timestamp,
      accountType: "bankr",
      functionName: displayName,
    });

    const authorization =
      await enforcePendingRequestAuthorizationAtConfirmation(
        "batchTransaction",
        pending,
      );
    if (!authorization.authorized) {
      throw new Error(authorization.error);
    }

    const result = await submitTransactionDirect(
      apiKey,
      tx,
      undefined,
      () =>
        authorizePendingBankrSubmit(
          "batchTransaction",
          pending,
          effectGuard.beginEffect,
        ),
    );
    effectGuard.settleEffect();
    const txHash = result.transactionHash;

    if (result.status === "reverted") {
      await handleBatchFailure(bundleId, pending, "Transaction reverted");
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.REVERTED,
        txHash,
        completedAt: Date.now(),
      });
    } else if (result.status === "success" && txHash) {
      // Fetch receipt once: sanitized shape goes to wallet_getCallsStatus,
      // raw shape feeds internal history enrichers such as asset changes.
      const rawReceipt = await fetchRawTransactionReceipt(
        txHash,
        pending.chainId,
      );
      const receipt = rawReceipt ? toBundleReceipt(rawReceipt.receipt) : null;

      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.CONFIRMED,
        txHash,
        receipts: receipt ? [receipt] : undefined,
        completedAt: Date.now(),
      });

      await updateTxInHistory(bundleId, {
        status: "success",
        txHash,
        completedAt: Date.now(),
      });

      extractAssetChangesWhenReceiptAvailable({
        txId: bundleId,
        txHash,
        chainId: pending.chainId,
        userAddress: pinnedAddress,
        receipt: rawReceipt?.receipt,
        rpcUrl: rawReceipt?.rpcUrl,
        logPrefix: "[batch]",
      });

      // Fire-and-forget gas fee fetch
      fetchAndStoreBatchGasData(bundleId, txHash, pending.chainId);

      const chainConfig = CHAIN_CONFIG[pending.chainId];
      const explorerUrl = chainConfig?.explorer
        ? `${chainConfig.explorer}/tx/${txHash}`
        : null;

      const notificationId = `tx-success-${bundleId}`;
      if (explorerUrl) {
        chrome.storage.local.set({
          [`notification-${notificationId}`]: explorerUrl,
        });
      }

      await showNotification(
        notificationId,
        "Batch Transaction Confirmed",
        `Batch transaction (${pending.params.calls.length} calls) on ${pending.chainName} was successful.`,
      );

      await writeResultToStorage(`batchTxResult:${bundleId}`, {
        success: true,
        txHash,
      });
    } else {
      // Pending — submitted but not yet confirmed
      await updateBundleStatus(bundleId, {
        status: BUNDLE_STATUS.PENDING,
        txHash,
      });

      await updateTxInHistory(bundleId, {
        status: "pending",
        txHash,
      });

      if (txHash) {
        startReceiptPolling(bundleId, txHash, pending.chainId);
      }

      await writeResultToStorage(`batchTxResult:${bundleId}`, {
        success: true,
        txHash,
      });
    }
  } catch (error) {
    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    await handleBatchFailure(bundleId, pending, errorMessage);
  } finally {
    effectGuard.releaseIfSafe();
    processingBundleIds.delete(bundleId);
  }
}


// ---------------------------------------------------------------------------
// Confirm batch transaction (PK/SP non-atomic path)
// ---------------------------------------------------------------------------
