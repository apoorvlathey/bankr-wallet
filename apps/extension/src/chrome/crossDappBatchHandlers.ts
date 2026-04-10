/**
 * Cross-dapp batch handlers
 *
 * Lets the user assemble a single ERC-7821 atomic batch out of N independent
 * `eth_sendTransaction` requests that came from different dapps (or in-wallet
 * transfers) and ship them in one onchain transaction via the Bankr API.
 *
 * Bankr-API accounts only (`type: "bankr"` or `type: "impersonator"`).
 *
 * Lifecycle:
 *   1. dapp calls `eth_sendTransaction` → standard pending tx request created
 *   2. user clicks "Add to Batch" → handleAddToCrossDappBatch
 *      - moves the request out of `pendingTxRequests` into `crossDappBatch`
 *      - the dapp promise stays open (no `txResult:{txId}` write)
 *   3. user can keep adding (same `from` + `chainId` only)
 *   4. user can remove individual entries (rejects that dapp's promise)
 *      or reject the whole batch (rejects all dapp promises)
 *   5. on confirm: encode → submitTransactionDirect → fan out the SAME tx hash
 *      to every entry's `txResult:{txId}` so all dapp promises resolve at once
 */

import {
  submitTransactionDirect,
  type TransactionParams,
} from "./bankrApi";
import { BANKR_SUPPORTED_CHAIN_IDS } from "../constants/networks";
import { CHAIN_CONFIG } from "../constants/chainConfig";
import { getActiveAccount } from "./accountStorage";
import {
  getPendingTxRequestById,
  removePendingTxRequest,
} from "./pendingTxStorage";
import {
  getPendingBatchTxRequestById,
  removePendingBatchTxRequest,
} from "./pendingBatchTxStorage";
import { updateBundleStatus } from "./bundleStatusStorage";
import {
  getCrossDappBatch,
  setCrossDappBatch,
  clearCrossDappBatch,
  type CrossDappBatch,
  type CrossDappBatchEntry,
} from "./crossDappBatchStorage";
import {
  getCachedApiKey,
  setCachedApiKey,
  getCachedPassword,
  getAutoLockTimeout,
  tryRestoreSession,
} from "./sessionCache";
import { loadDecryptedApiKey } from "./crypto";
import { handleUnlockWallet } from "./authHandlers";
import { addTxToHistory, updateTxInHistory } from "./txHistoryStorage";
import { startReceiptPolling } from "./txReceiptPoller";
import { writeResultToStorage, showNotification } from "./txHandlers";
import { encodeBatchCalls } from "./batchTxHandlers";
import { BUNDLE_STATUS, type ERC5792Call } from "./erc5792Types";

// Prevent double-shipping if user clicks Confirm twice in quick succession.
let isProcessing = false;

// ---------------------------------------------------------------------------
// Add a pending tx request to the cross-dapp batch
// ---------------------------------------------------------------------------

export async function handleAddToCrossDappBatch(
  txId: string,
): Promise<{ success: boolean; error?: string }> {
  const pending = await getPendingTxRequestById(txId);
  if (!pending) {
    return { success: false, error: "Pending request not found" };
  }

  // Only Bankr-API accounts can use cross-dapp batching.
  const account = await getActiveAccount();
  if (!account || (account.type !== "bankr" && account.type !== "impersonator")) {
    return {
      success: false,
      error: "Cross-dapp batching is only available for Bankr accounts",
    };
  }

  const txFrom = pending.tx.from?.toLowerCase();
  const txChainId = pending.tx.chainId;

  // Validate chain is Bankr-supported (the ship path requires this anyway).
  if (!BANKR_SUPPORTED_CHAIN_IDS.has(txChainId)) {
    return {
      success: false,
      error: `Chain ${pending.chainName} is not supported for Bankr batching`,
    };
  }

  const existing = await getCrossDappBatch();

  // Lock the batch to the first tx's from + chain. Subsequent adds must match.
  if (existing) {
    if (existing.fromAddress.toLowerCase() !== txFrom) {
      return {
        success: false,
        error: `Pending batch is for ${existing.fromAddress.slice(0, 6)}…${existing.fromAddress.slice(-4)} — clear it first`,
      };
    }
    if (existing.chainId !== txChainId) {
      return {
        success: false,
        error: `Pending batch is on ${existing.chainName} — clear it first`,
      };
    }
  }

  const newEntry: CrossDappBatchEntry = {
    txId: pending.id,
    tx: pending.tx,
    origin: pending.origin,
    favicon: pending.favicon,
    addedAt: Date.now(),
    source: { kind: "eth_sendTransaction" },
  };

  const next: CrossDappBatch = existing
    ? { ...existing, entries: [...existing.entries, newEntry] }
    : {
        fromAddress: pending.tx.from,
        chainId: txChainId,
        chainName: pending.chainName,
        accountType: account.type as "bankr" | "impersonator",
        entries: [newEntry],
        createdAt: Date.now(),
      };

  await setCrossDappBatch(next);

  // Move the request out of the standard pending list. The dapp promise stays
  // open in inject.ts (no `txResult:{txId}` written) until ship/reject.
  await removePendingTxRequest(pending.id);

  // Notify any open popup windows so they pick up the change immediately.
  chrome.runtime
    .sendMessage({ type: "crossDappBatchUpdated" })
    .catch(() => {});

  return { success: true };
}

// ---------------------------------------------------------------------------
// Add an entire pending ERC-5792 batch (wallet_sendCalls) to the cross-dapp batch
// ---------------------------------------------------------------------------

/**
 * Pull every call from a pending dapp-initiated batch (wallet_sendCalls) into
 * the cross-dapp batch. The dapp already has its bundle id (returned by the
 * immediate `batchTxAck` write when the request first arrived) and is now
 * polling `wallet_getCallsStatus` — its bundle status stays at PENDING (100)
 * while the calls live in the cross-dapp batch and only transitions on
 * confirm/reject/remove.
 */
export async function handleAddCallsToCrossDappBatch(
  bundleId: string,
): Promise<{ success: boolean; error?: string }> {
  const pending = await getPendingBatchTxRequestById(bundleId);
  if (!pending) {
    return { success: false, error: "Pending batch request not found" };
  }

  // Only Bankr-API accounts can use cross-dapp batching.
  const account = await getActiveAccount();
  if (!account || (account.type !== "bankr" && account.type !== "impersonator")) {
    return {
      success: false,
      error: "Cross-dapp batching is only available for Bankr accounts",
    };
  }

  if (!BANKR_SUPPORTED_CHAIN_IDS.has(pending.chainId)) {
    return {
      success: false,
      error: `Chain ${pending.chainName} is not supported for Bankr batching`,
    };
  }

  const fromAddress = (pending.params.from || account.address).toLowerCase();
  const existing = await getCrossDappBatch();

  if (existing) {
    if (existing.fromAddress.toLowerCase() !== fromAddress) {
      return {
        success: false,
        error: `Pending batch is for ${existing.fromAddress.slice(0, 6)}…${existing.fromAddress.slice(-4)} — clear it first`,
      };
    }
    if (existing.chainId !== pending.chainId) {
      return {
        success: false,
        error: `Pending batch is on ${existing.chainName} — clear it first`,
      };
    }
  }

  if (!pending.params.calls || pending.params.calls.length === 0) {
    return { success: false, error: "Bundle has no calls to add" };
  }

  const totalCalls = pending.params.calls.length;
  const now = Date.now();

  const newEntries: CrossDappBatchEntry[] = pending.params.calls.map(
    (call, callIndex) => ({
      // Synthetic entry id — distinct from `bundleId` (the parent) so we can
      // remove an individual sibling row from the UI without colliding.
      txId: `${bundleId}:${callIndex}`,
      tx: {
        from: pending.params.from || (account.address as `0x${string}`),
        to: (call.to ?? "0x") as string,
        data: (call.data ?? "0x") as string,
        value: (call.value ?? "0x0") as string,
        chainId: pending.chainId,
      },
      origin: pending.origin,
      favicon: pending.favicon,
      addedAt: now,
      source: {
        kind: "wallet_sendCalls",
        bundleId,
        callIndex,
        totalCalls,
      },
    }),
  );

  const next: CrossDappBatch = existing
    ? { ...existing, entries: [...existing.entries, ...newEntries] }
    : {
        fromAddress: pending.params.from || account.address,
        chainId: pending.chainId,
        chainName: pending.chainName,
        accountType: account.type as "bankr" | "impersonator",
        entries: newEntries,
        createdAt: now,
      };

  await setCrossDappBatch(next);

  // Pull the dapp batch out of the pending list. The dapp's wallet_sendCalls
  // promise has already resolved with the bundle id (via batchTxAck), so the
  // dapp will keep polling wallet_getCallsStatus — we leave the bundle status
  // at PENDING (its initial state) until ship/reject/remove transitions it.
  await removePendingBatchTxRequest(bundleId);

  chrome.runtime
    .sendMessage({ type: "crossDappBatchUpdated" })
    .catch(() => {});

  return { success: true };
}

// ---------------------------------------------------------------------------
// Remove a single entry from the cross-dapp batch
// ---------------------------------------------------------------------------

export async function handleRemoveFromCrossDappBatch(
  txId: string,
): Promise<{ success: boolean; error?: string }> {
  const batch = await getCrossDappBatch();
  if (!batch) return { success: false, error: "No active batch" };

  const entry = batch.entries.find((e) => e.txId === txId);
  if (!entry) return { success: false, error: "Entry not found in batch" };

  // For wallet_sendCalls entries, removing one sibling removes the WHOLE
  // bundle — we never want to ship a partial dapp batch (the dapp asked for
  // an atomic group, and we already locked that group in place by storing it).
  let toRemove: CrossDappBatchEntry[];
  if (entry.source?.kind === "wallet_sendCalls") {
    const bundleId = entry.source.bundleId;
    toRemove = batch.entries.filter(
      (e) =>
        e.source?.kind === "wallet_sendCalls" &&
        e.source.bundleId === bundleId,
    );
  } else {
    toRemove = [entry];
  }

  const removeIds = new Set(toRemove.map((e) => e.txId));
  const remaining = batch.entries.filter((e) => !removeIds.has(e.txId));

  // Resolve every removed entry's originating dapp.
  // - eth_sendTransaction: write the txResult rejection.
  // - wallet_sendCalls: update bundleStatuses to OFFCHAIN_FAILURE so the dapp's
  //   next wallet_getCallsStatus poll sees the rejection (only do this once per
  //   bundle even if multiple sibling rows were removed together).
  const seenBundles = new Set<string>();
  for (const e of toRemove) {
    if (e.source?.kind === "wallet_sendCalls") {
      const bid = e.source.bundleId;
      if (seenBundles.has(bid)) continue;
      seenBundles.add(bid);
      await updateBundleStatus(bid, {
        status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
        error: "Removed from cross-dapp batch by user",
        completedAt: Date.now(),
      });
    } else {
      await writeResultToStorage(`txResult:${e.txId}`, {
        success: false,
        error: "Removed from batch by user",
      });
    }
  }

  if (remaining.length === 0) {
    await clearCrossDappBatch();
  } else {
    await setCrossDappBatch({ ...batch, entries: remaining });
  }

  chrome.runtime
    .sendMessage({ type: "crossDappBatchUpdated" })
    .catch(() => {});

  return { success: true };
}

// ---------------------------------------------------------------------------
// Reject the entire cross-dapp batch
// ---------------------------------------------------------------------------

export async function handleRejectCrossDappBatch(): Promise<{
  success: boolean;
  error?: string;
}> {
  const batch = await getCrossDappBatch();
  if (!batch) return { success: true }; // already empty

  // Reject every dapp promise. wallet_sendCalls bundles update bundleStatuses
  // (one update per unique bundle); plain eth_sendTransaction entries write
  // a txResult key.
  const seenBundles = new Set<string>();
  await Promise.all(
    batch.entries.map((entry) => {
      if (entry.source?.kind === "wallet_sendCalls") {
        const bid = entry.source.bundleId;
        if (seenBundles.has(bid)) return Promise.resolve();
        seenBundles.add(bid);
        return updateBundleStatus(bid, {
          status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
          error: "Cross-dapp batch rejected by user",
          completedAt: Date.now(),
        });
      }
      return writeResultToStorage(`txResult:${entry.txId}`, {
        success: false,
        error: "Batch rejected by user",
      });
    }),
  );

  await clearCrossDappBatch();

  chrome.runtime
    .sendMessage({ type: "crossDappBatchUpdated" })
    .catch(() => {});

  return { success: true };
}

// ---------------------------------------------------------------------------
// Ship the cross-dapp batch (atomic via Bankr API)
// ---------------------------------------------------------------------------

export async function handleConfirmCrossDappBatch(
  password: string,
): Promise<{ success: boolean; error?: string; txHash?: string }> {
  if (isProcessing) {
    return { success: false, error: "Batch already being processed" };
  }

  const batch = await getCrossDappBatch();
  if (!batch || batch.entries.length === 0) {
    return { success: false, error: "No batch to confirm" };
  }

  if (!BANKR_SUPPORTED_CHAIN_IDS.has(batch.chainId)) {
    return {
      success: false,
      error: `Chain ${batch.chainName} is not supported for Bankr API accounts`,
    };
  }

  isProcessing = true;

  try {
    // Resolve API key — same pattern as handleConfirmBatchTransaction.
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
          return { success: false, error: "Invalid password" };
        }
        setCachedApiKey(apiKey, password);
      }
    }

    // Build ERC-5792 calls and encode as a single ERC-7821 self-call tx.
    const calls: ERC5792Call[] = batch.entries.map((entry) => ({
      to: (entry.tx.to ?? "0x") as `0x${string}`,
      value: (entry.tx.value ?? "0x0") as `0x${string}`,
      data: (entry.tx.data ?? "0x") as `0x${string}`,
    }));

    const encoded = encodeBatchCalls(calls, batch.fromAddress);
    const tx: TransactionParams = {
      from: batch.fromAddress,
      to: encoded.to,
      data: encoded.data,
      value: encoded.value,
      chainId: batch.chainId,
    };

    // Use one synthetic id for the txHistory entry.
    // Origin = "Cross-Dapp Batch" so the activity tab uses it as the title row;
    // functionName holds just the call count for the secondary row.
    const historyId = `cross-dapp-batch-${Date.now()}`;
    const callCountLabel = `${calls.length} call${calls.length === 1 ? "" : "s"}`;

    await addTxToHistory({
      id: historyId,
      status: "processing",
      tx,
      origin: "Cross-Dapp Batch",
      favicon: null,
      chainName: batch.chainName,
      chainId: batch.chainId,
      createdAt: Date.now(),
      accountType: "bankr",
      functionName: callCountLabel,
    });

    // Helper that fans a single result out to every entry's originating dapp,
    // routing each entry by its source kind:
    //   - eth_sendTransaction → write `txResult:{txId}`
    //   - wallet_sendCalls    → updateBundleStatus on the parent bundle id
    //                           (deduplicated so siblings only update once)
    const fanOut = async (
      outcome:
        | { kind: "success"; txHash: string }
        | { kind: "reverted"; txHash?: string; error: string }
        | { kind: "error"; error: string },
    ) => {
      const seenBundles = new Set<string>();
      await Promise.all(
        batch.entries.map(async (entry) => {
          if (entry.source?.kind === "wallet_sendCalls") {
            const bid = entry.source.bundleId;
            if (seenBundles.has(bid)) return;
            seenBundles.add(bid);
            if (outcome.kind === "success") {
              await updateBundleStatus(bid, {
                status: BUNDLE_STATUS.CONFIRMED,
                txHash: outcome.txHash,
                completedAt: Date.now(),
              });
            } else if (outcome.kind === "reverted") {
              await updateBundleStatus(bid, {
                status: BUNDLE_STATUS.REVERTED,
                txHash: outcome.txHash,
                error: outcome.error,
                completedAt: Date.now(),
              });
            } else {
              await updateBundleStatus(bid, {
                status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
                error: outcome.error,
                completedAt: Date.now(),
              });
            }
            return;
          }
          // eth_sendTransaction (default)
          if (outcome.kind === "success") {
            await writeResultToStorage(`txResult:${entry.txId}`, {
              success: true,
              txHash: outcome.txHash,
            });
          } else {
            await writeResultToStorage(`txResult:${entry.txId}`, {
              success: false,
              error: outcome.error,
            });
          }
        }),
      );
    };

    let result;
    try {
      result = await submitTransactionDirect(apiKey, tx);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      await updateTxInHistory(historyId, {
        status: "failed",
        error: message,
        completedAt: Date.now(),
      });

      await fanOut({ kind: "error", error: message });

      await clearCrossDappBatch();

      await showNotification(
        `cross-dapp-batch-failed-${historyId}`,
        "Cross-Dapp Batch Failed",
        `Batch on ${batch.chainName} failed: ${message}`,
      );

      return { success: false, error: message };
    }

    const txHash = result.transactionHash;

    if (result.status === "reverted") {
      const errMsg = "Transaction reverted";

      await updateTxInHistory(historyId, {
        status: "failed",
        txHash,
        error: errMsg,
        completedAt: Date.now(),
      });

      await fanOut({ kind: "reverted", txHash, error: errMsg });

      await clearCrossDappBatch();

      await showNotification(
        `cross-dapp-batch-reverted-${historyId}`,
        "Cross-Dapp Batch Reverted",
        `Batch on ${batch.chainName} reverted onchain.`,
      );

      return { success: false, error: errMsg, txHash };
    }

    // Success or pending — fan out the same hash to every dapp.
    // (For pending we still report success: the dapp gets the hash and either
    // its receipt poller or the next wallet_getCallsStatus call will see the
    // CONFIRMED status once the receipt lands.)
    if (txHash) {
      await fanOut({ kind: "success", txHash });
    }

    if (result.status === "success" && txHash) {
      await updateTxInHistory(historyId, {
        status: "success",
        txHash,
        completedAt: Date.now(),
      });

      const chainConfig = CHAIN_CONFIG[batch.chainId];
      const explorerUrl = chainConfig?.explorer
        ? `${chainConfig.explorer}/tx/${txHash}`
        : null;

      const notificationId = `cross-dapp-batch-success-${historyId}`;
      if (explorerUrl) {
        chrome.storage.local.set({
          [`notification-${notificationId}`]: explorerUrl,
        });
      }

      await showNotification(
        notificationId,
        "Cross-Dapp Batch Confirmed",
        `Batch (${calls.length} call${calls.length === 1 ? "" : "s"}) on ${batch.chainName} was successful.`,
      );
    } else if (txHash) {
      // Submitted but not yet confirmed — start a poller so the activity
      // tab transitions to success/failed once the receipt lands.
      await updateTxInHistory(historyId, {
        status: "pending",
        txHash,
      });
      startReceiptPolling(historyId, txHash, batch.chainId);
    }

    await clearCrossDappBatch();

    return { success: true, txHash };
  } finally {
    isProcessing = false;
  }
}
