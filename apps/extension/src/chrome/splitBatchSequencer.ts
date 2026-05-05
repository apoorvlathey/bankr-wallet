/**
 * Split-mode sequencer for ERC-5792 bundles.
 *
 * Lets the user manually break a dapp-pushed `wallet_sendCalls` batch into
 * N sequential single-tx confirmations as an escape hatch for non-standard
 * custom chains (where batched gas estimation can't be trusted because of
 * dual-gas models, broken simulation, etc.).
 *
 * Flow:
 *   1. User clicks "Split" on the batch confirmation popup.
 *   2. handleSplitBatchIntoIndividualTxs validates eligibility (PK/SP only,
 *      atomicRequired must be false), snapshots context onto BundleStatus,
 *      removes the PendingBatchTxRequest, queues call 0 as a single
 *      PendingTxRequest, closes the batch popup via the existing ack channel.
 *   3. The user confirms call 0. After it terminates (success / revert /
 *      drop / reject / pre-broadcast failure), the standard tx-finalization
 *      paths in txReceiptPoller.ts and txHandlers.ts call advanceSplitBundle.
 *   4. advanceSplitBundle appends the result to the bundle and either queues
 *      the next call as a fresh PendingTxRequest (so the popup auto-opens
 *      for it with up-to-date chain state) or finalizes the bundle.
 *
 * The bundle stays alive throughout — wallet_getCallsStatus aggregates the
 * accumulating receipts and returns CONFIRMED / PARTIAL_REVERT / REVERTED
 * / OFFCHAIN_FAILURE when done.
 */

import {
  getBundleStatus,
  updateBundleStatus,
} from "./bundleStatusStorage";
import {
  getPendingBatchTxRequestById,
  removePendingBatchTxRequest,
} from "./pendingBatchTxStorage";
import {
  savePendingTxRequest,
  type PendingTxRequest,
} from "./pendingTxStorage";
import { openExtensionPopup, writeResultToStorage } from "./txHandlers";
import {
  BUNDLE_STATUS,
  ERC5792_ERRORS,
  type BundleReceipt,
} from "./erc5792Types";

/** Deterministic txId scheme so the UI can compute "previous tx id" without lookups. */
export function splitTxId(bundleId: string, index: number): string {
  return `${bundleId}:split:${index}`;
}

// ---------------------------------------------------------------------------
// Entry: user clicks "Split" on the batch confirmation popup
// ---------------------------------------------------------------------------

export async function handleSplitBatchIntoIndividualTxs(
  bundleId: string,
  senderWindowId?: number,
): Promise<{ success: boolean; error?: string; code?: number }> {
  const pending = await getPendingBatchTxRequestById(bundleId);
  if (!pending) {
    return {
      success: false,
      error: "Unknown or expired bundle",
      code: ERC5792_ERRORS.UNKNOWN_BUNDLE_ID,
    };
  }

  // No sender-origin check here: this handler is invoked from the wallet's
  // own popup UI (`sender.origin` would be `chrome-extension://...`), not
  // from the dapp's content script. The user clicking "Split" in the trusted
  // popup is the authorization signal — same as them clicking "Confirm" or
  // "Reject" on the same popup.

  // Eligibility: PK/Seed only — Bankr/impersonator paths don't need this and
  // splitting an atomic Bankr batch would silently break the atomicity contract.
  if (
    pending.accountType !== "privateKey" &&
    pending.accountType !== "seedPhrase"
  ) {
    return {
      success: false,
      error: "Split mode is only available for private-key / seed-phrase accounts",
    };
  }

  // Note: `params.atomicRequired` is NOT enforced here. PK/SP auto-sequential
  // broadcast already ignores it (see ERC5792.md "supported for EOAs" note),
  // so the bundle is effectively non-atomic regardless of the dapp's request
  // — split is just another non-atomic execution path.

  if (!pending.params.calls || pending.params.calls.length === 0) {
    return { success: false, error: "Bundle has no calls to split" };
  }

  // Snapshot trusted context onto BundleStatus + flip into split mode in one
  // shallow merge. We intentionally clobber `atomic` to false because once
  // split, the bundle is non-atomic by definition (matters for getCallsStatus).
  await updateBundleStatus(bundleId, {
    splitMode: true,
    splitCalls: pending.params.calls,
    splitNextIndex: 0,
    atomic: false,
    splitContext: {
      accountId: pending.accountId,
      accountAddress: pending.accountAddress,
      accountType: pending.accountType,
      origin: pending.origin,
      favicon: pending.favicon,
      chainName: pending.chainName,
      tabId: pending.tabId,
      frameId: pending.frameId,
      senderOrigin: pending.senderOrigin,
      senderWindowId,
    },
  });

  // The batch popup's lifecycle is done: clear the pending batch request and
  // ack the dapp-side waiter (same channel used by accept/reject) so the
  // wallet_sendCalls promise resolution path is unblocked. The dapp continues
  // polling wallet_getCallsStatus on the same bundleId.
  await removePendingBatchTxRequest(bundleId);
  await writeResultToStorage(`batchTxResult:${bundleId}`, {
    success: true,
    splitMode: true,
  });

  // Surface call 0 as a normal single-tx confirmation.
  await enqueueNextSplitCall(bundleId);

  return { success: true };
}

// ---------------------------------------------------------------------------
// Internal: queue the next call (called from handler entry + advance hook)
// ---------------------------------------------------------------------------

async function enqueueNextSplitCall(bundleId: string): Promise<void> {
  const status = await getBundleStatus(bundleId);
  if (!status || !status.splitMode || !status.splitCalls || !status.splitContext) {
    return;
  }

  const index = status.splitNextIndex ?? 0;
  if (index >= status.splitCalls.length) {
    // All calls done — finalize. Compute aggregate state from receipts.
    await finalizeSplitBundle(bundleId);
    return;
  }

  const call = status.splitCalls[index];
  const ctx = status.splitContext;
  const fromAddr = ctx.accountAddress ?? "";

  const pending: PendingTxRequest = {
    id: splitTxId(bundleId, index),
    tx: {
      from: fromAddr,
      to: call.to ?? "0x0000000000000000000000000000000000000000",
      data: call.data ?? "0x",
      value: call.value ?? "0x0",
      chainId: status.chainId,
    },
    origin: ctx.origin,
    favicon: ctx.favicon,
    chainName: ctx.chainName,
    timestamp: Date.now(),
    accountId: ctx.accountId,
    accountAddress: ctx.accountAddress,
    accountType: ctx.accountType,
    tabId: ctx.tabId,
    frameId: ctx.frameId,
    senderOrigin: ctx.senderOrigin,
    requestChainId: status.chainId,
    parentBundleId: bundleId,
    bundleIndex: index,
    bundleTotalCalls: status.splitCalls.length,
  };

  await savePendingTxRequest(pending);

  chrome.runtime
    .sendMessage({ type: "newPendingTxRequest", txRequest: pending })
    .catch(() => {});

  openExtensionPopup(ctx.senderWindowId);
}

// ---------------------------------------------------------------------------
// Hook: called from terminal-state code paths in txReceiptPoller / txHandlers
// ---------------------------------------------------------------------------

export type SplitOutcome = "success" | "reverted" | "dropped" | "rejected";

export interface SplitAdvanceParams {
  bundleId: string;
  bundleIndex: number;
  outcome: SplitOutcome;
  txHash?: string;
  /**
   * Receipt in either raw RPC shape (status: "0x1"/"0x0", hex bigints) or
   * viem-formatted shape (status: "success"/"reverted", bigints). We try
   * to coerce into the ERC-5792 BundleReceipt format expected by
   * wallet_getCallsStatus consumers.
   */
  receipt?: any;
  /** Human-readable reason — surfaced on the bundle status when terminal. */
  errorMessage?: string;
}

export async function advanceSplitBundle(params: SplitAdvanceParams): Promise<void> {
  const { bundleId, bundleIndex, outcome, txHash, receipt, errorMessage } = params;
  const status = await getBundleStatus(bundleId);
  if (!status || !status.splitMode) return;

  // Idempotency guard: if splitNextIndex has already advanced past this call,
  // a duplicate finalization slipped through (sync-send + an opportunistic
  // poll, etc.). Drop the duplicate silently.
  if ((status.splitNextIndex ?? 0) > bundleIndex) return;

  const txHashes = [...(status.txHashes ?? [])];
  const receipts = [...(status.receipts ?? [])];

  if (txHash) txHashes.push(txHash);
  if (receipt && txHash) {
    const coerced = coerceToBundleReceipt(receipt, txHash);
    if (coerced) receipts.push(coerced);
  }

  if (outcome === "success") {
    await updateBundleStatus(bundleId, {
      splitNextIndex: bundleIndex + 1,
      txHashes,
      receipts,
      // Keep the most recent successful hash exposed on `txHash` (matches the
      // non-atomic "last meaningful tx" convention).
      txHash,
    });
    // Recurse via enqueue (which finalizes if we've hit the end).
    await enqueueNextSplitCall(bundleId);
    return;
  }

  // Terminal failure of any kind stops the sequence. Decide the bundle status
  // based on whether anything succeeded before this.
  const anyPriorSuccess = (status.txHashes?.length ?? 0) > 0;
  let finalStatus: number;
  if (outcome === "rejected") {
    finalStatus = BUNDLE_STATUS.OFFCHAIN_FAILURE;
  } else if (outcome === "dropped") {
    finalStatus = anyPriorSuccess
      ? BUNDLE_STATUS.PARTIAL_REVERT
      : BUNDLE_STATUS.OFFCHAIN_FAILURE;
  } else {
    // reverted
    finalStatus = anyPriorSuccess
      ? BUNDLE_STATUS.PARTIAL_REVERT
      : BUNDLE_STATUS.REVERTED;
  }

  await updateBundleStatus(bundleId, {
    status: finalStatus,
    completedAt: Date.now(),
    txHashes,
    // Reverse receipts at finalization so dapps using `receipts.find()` pick
    // the most meaningful call first (matches the non-atomic batch
    // convention — see processBatchTransactionNonAtomicInBackground).
    receipts: receipts.length > 0 ? [...receipts].reverse() : undefined,
    // Convention: `txHash` reflects the LAST SUCCESSFUL tx (e.g., swap, not
    // approve). On a terminal failure here, that's still the prior advance's
    // status.txHash — don't overwrite with the failed/rejected hash.
    txHash: status.txHash,
    error:
      errorMessage ??
      (outcome === "rejected"
        ? `User rejected call ${bundleIndex + 1} of split batch`
        : outcome === "dropped"
          ? `Call ${bundleIndex + 1} of split batch was dropped from the mempool`
          : `Call ${bundleIndex + 1} of split batch reverted on-chain`),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function finalizeSplitBundle(bundleId: string): Promise<void> {
  const status = await getBundleStatus(bundleId);
  if (!status) return;
  // Already finalized by an earlier failure path? Don't downgrade.
  if (status.status !== BUNDLE_STATUS.PENDING) return;
  // Reverse receipts at finalization so dapps using `receipts.find()` pick
  // the most meaningful call first (matches the non-atomic batch convention).
  const reversedReceipts =
    status.receipts && status.receipts.length > 0
      ? [...status.receipts].reverse()
      : undefined;
  await updateBundleStatus(bundleId, {
    status: BUNDLE_STATUS.CONFIRMED,
    completedAt: Date.now(),
    receipts: reversedReceipts,
  });
}

/** Convert any-shape receipt into the ERC-5792 BundleReceipt format. */
function coerceToBundleReceipt(receipt: any, txHash: string): BundleReceipt | null {
  try {
    const status: `0x${string}` =
      receipt.status === "success" || receipt.status === "0x1" || receipt.status === 1 || receipt.status === 1n
        ? "0x1"
        : "0x0";

    const toHex = (v: any): `0x${string}` => {
      if (typeof v === "string") {
        return (v.startsWith("0x") ? v : `0x${BigInt(v).toString(16)}`) as `0x${string}`;
      }
      if (typeof v === "bigint" || typeof v === "number") {
        return `0x${BigInt(v).toString(16)}` as `0x${string}`;
      }
      return "0x0" as `0x${string}`;
    };

    return {
      status,
      blockHash: (receipt.blockHash ?? "0x") as `0x${string}`,
      blockNumber: toHex(receipt.blockNumber ?? "0x0"),
      gasUsed: toHex(receipt.gasUsed ?? "0x0"),
      transactionHash: txHash as `0x${string}`,
      logs: Array.isArray(receipt.logs)
        ? receipt.logs.map((l: any) => ({
            address: (l.address ?? "0x") as `0x${string}`,
            topics: (l.topics ?? []) as `0x${string}`[],
            data: (l.data ?? "0x") as `0x${string}`,
          }))
        : [],
    };
  } catch {
    return null;
  }
}
