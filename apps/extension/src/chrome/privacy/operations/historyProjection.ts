import { toHex } from "viem";

import type {
  CompletedTransaction,
  PrivacyShieldHistoryMeta,
} from "../../txHistoryStorage";
import {
  getTxById,
  updateTxInHistory,
} from "../../txHistoryStorage";
import {
  defaultPrivacyShieldOperationTracking,
  type StoredPrivacyShieldOperationV1,
} from "./types";

function sameProjection(
  left: PrivacyShieldHistoryMeta | undefined,
  right: PrivacyShieldHistoryMeta,
): boolean {
  return !!left &&
    left.version === right.version &&
    left.operationId === right.operationId &&
    left.state === right.state &&
    left.updatedAt === right.updatedAt &&
    left.amountWei === right.amountWei &&
    left.shieldedAmountWei === right.shieldedAmountWei;
}

/**
 * Build a projection only when the ordinary history row is exactly bound to
 * the encrypted Shield operation. The projection contains public lifecycle
 * fields only.
 */
export function buildPrivacyShieldHistoryProjection(
  tx: CompletedTransaction,
  operation: StoredPrivacyShieldOperationV1,
): PrivacyShieldHistoryMeta | null {
  const summary = operation.summary;
  if (
    tx.id !== summary.id ||
    tx.origin !== "WalletChan Shield" ||
    tx.chainId !== summary.chainId ||
    tx.tx.chainId !== summary.chainId ||
    tx.accountId !== summary.accountId ||
    tx.accountType !== summary.accountType ||
    tx.tx.from.toLowerCase() !== summary.accountAddress.toLowerCase() ||
    tx.tx.to?.toLowerCase() !== summary.destinationAddress.toLowerCase() ||
    tx.tx.value?.toLowerCase() !== toHex(BigInt(summary.amountWei)).toLowerCase()
  ) {
    return null;
  }
  const tracking = operation.tracking ??
    defaultPrivacyShieldOperationTracking(summary);
  return {
    version: 1,
    operationId: summary.id,
    state: tracking.state,
    updatedAt: tracking.updatedAt,
    amountWei: summary.amountWei,
    shieldedAmountWei: summary.shieldedAmountWei,
  };
}

/** Best-effort mirror; the durable Privacy Pools record remains authoritative. */
export async function mirrorPrivacyShieldHistoryProjection(
  operation: StoredPrivacyShieldOperationV1,
): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  const tx = await getTxById(operation.summary.id);
  if (!tx) return;
  const projection = buildPrivacyShieldHistoryProjection(tx, operation);
  if (!projection || sameProjection(tx.privacyShieldMeta, projection)) return;
  await updateTxInHistory(tx.id, { privacyShieldMeta: projection });
}
