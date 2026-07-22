/**
 * ERC-5792 pending-request UI controls and origin-scoped status queries.
 *
 * Signing, key access, and execution do not belong here. These handlers only
 * mutate a still-pending request or expose an existing bundle status to the
 * origin that created it.
 */

import { CHAIN_CONFIG } from "../../constants/chainConfig";
import {
  getBundleStatus,
  updateBundleStatus,
} from "./bundleStatusStorage";
import { BUNDLE_STATUS, ERC5792_ERRORS } from "../erc5792Types";
import type { WalletGetCallsStatusResult } from "../erc5792Types";
import {
  getPendingBatchTxRequestById,
  removeCallFromPendingBatchTxRequest,
  removePendingBatchTxRequest,
} from "../requests/pendingBatchTxStorage";
import { writeResultToStorage } from "../transactions/runtime";

export async function handleRejectBatchTransaction(
  bundleId: string,
): Promise<{ success: boolean; error?: string }> {
  // A missing request may already have been submitted by another extension
  // surface. Never overwrite its bundle status/result with a late rejection.
  const pending = await getPendingBatchTxRequestById(bundleId);
  if (!pending) {
    return { success: false, error: "Batch request not found" };
  }
  if (pending.privacyRagequitMeta) {
    const { recordPrivacyRagequitBatchWalletRejected } = await import(
      "../privacy/ragequit/lifecycle"
    );
    await recordPrivacyRagequitBatchWalletRejected(pending);
  }
  await removePendingBatchTxRequest(bundleId);

  await updateBundleStatus(bundleId, {
    status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
    error: "User rejected batch transaction",
    completedAt: Date.now(),
  });

  await writeResultToStorage(`batchTxResult:${bundleId}`, {
    success: false,
    error: "Batch transaction rejected by user",
  });

  return { success: true };
}

/** Drop one call; removing the last call rejects the whole request. */
export async function handleRemoveCallFromPendingBatch(
  bundleId: string,
  callIndex: number,
): Promise<{ success: boolean; error?: string; rejected?: boolean }> {
  const pending = await getPendingBatchTxRequestById(bundleId);
  if (pending?.privacyRagequitMeta) {
    return { success: false, error: "Public exit calls cannot be changed" };
  }
  const result = await removeCallFromPendingBatchTxRequest(bundleId, callIndex);
  if (!result.found) {
    return { success: false, error: "Pending batch not found" };
  }
  if (result.error) {
    return { success: false, error: result.error };
  }
  if (result.remainingCalls === 0) {
    await handleRejectBatchTransaction(bundleId);
    return { success: true, rejected: true };
  }
  return { success: true };
}

/** Replace calldata in a pending call before confirmation re-reads storage. */
export async function handleUpdateCallInPendingBatch(
  bundleId: string,
  callIndex: number,
  newData: string,
): Promise<{ success: boolean; error?: string }> {
  const pending = await getPendingBatchTxRequestById(bundleId);
  if (pending?.privacyRagequitMeta) {
    return { success: false, error: "Public exit calls cannot be changed" };
  }
  const { updateCallInPendingBatchTxRequest } = await import(
    "../requests/pendingBatchTxStorage"
  );
  return updateCallInPendingBatchTxRequest(bundleId, callIndex, newData);
}

export async function handleWalletGetCallsStatus(
  bundleId: string,
  requestOrigin?: string,
): Promise<WalletGetCallsStatusResult | { error: string; code: number }> {
  const status = await getBundleStatus(bundleId);
  // Legacy entries without origin are unknown rather than cross-origin data.
  if (!status || !status.origin || status.origin !== requestOrigin) {
    return {
      error: "Unknown bundle ID",
      code: ERC5792_ERRORS.UNKNOWN_BUNDLE_ID,
    };
  }

  return {
    version: "2.0.0",
    id: bundleId,
    chainId: `0x${status.chainId.toString(16)}` as `0x${string}`,
    status: status.status,
    atomic: status.atomic,
    receipts: status.receipts,
  };
}

export async function handleWalletShowCallsStatus(
  bundleId: string,
  requestOrigin?: string,
): Promise<void> {
  const status = await getBundleStatus(bundleId);
  if (!status || !status.origin || status.origin !== requestOrigin) return;
  if (!status.txHash) return;

  const chainConfig = CHAIN_CONFIG[status.chainId];
  if (chainConfig?.explorer) {
    chrome.tabs.create({
      url: `${chainConfig.explorer}/tx/${status.txHash}`,
    });
  }
}
