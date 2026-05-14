/**
 * Persistent storage for the user-assembled cross-dapp batch.
 *
 * Unlike `pendingBatchTxRequests` (which holds dapp-initiated `wallet_sendCalls`
 * requests), this stores a single batch that the user assembles by clicking
 * "Add to Batch" on individual `eth_sendTransaction` requests across multiple
 * dapps. Only one such batch can exist at a time, locked to a single
 * `from` address + `chainId` of whatever tx was added first.
 *
 * **Two entry sources:**
 *
 * 1. `eth_sendTransaction` (default) — entry came from a single-call dapp
 *    request. The dapp promise is held open via inject.ts's storage listener
 *    and resolved by writing `txResult:{txId}` on ship/reject.
 *
 * 2. `wallet_sendCalls` — entry is one call from an ERC-5792 batch. The dapp
 *    has ALREADY received its bundle id from the immediate `batchTxAck` write
 *    and is now polling `wallet_getCallsStatus`. We hold its bundle status as
 *    PENDING (status 100) while it lives in the cross-dapp batch, then
 *    transition to CONFIRMED/OFFCHAIN_FAILURE when the batch ships or is
 *    removed/rejected. All sibling calls from the same bundle share a single
 *    `bundleId` and are added/removed/resolved together so the dapp's
 *    atomicity expectation is preserved.
 *
 * Bankr-API accounts only (`type: "bankr"`).
 */

import type { TransactionParams } from "./bankrApi";

const STORAGE_KEY = "crossDappBatch";

export type CrossDappBatchEntrySource =
  | { kind: "eth_sendTransaction" }
  | {
      kind: "wallet_sendCalls";
      /** ERC-5792 bundle id this call belongs to. Shared across sibling entries. */
      bundleId: string;
      /** Index of this call within the original bundle (0-based). */
      callIndex: number;
      /** Total number of calls in the original bundle. */
      totalCalls: number;
    };

export interface CrossDappBatchEntry {
  /**
   * Stable id for this entry within the batch (used for individual removal).
   * For `eth_sendTransaction` entries this matches the original
   * `PendingTxRequest.id`; for `wallet_sendCalls` entries this is a synthetic
   * `${bundleId}:${callIndex}` id (the parent bundle id is in `source`).
   */
  txId: string;
  tx: TransactionParams;
  origin: string;
  favicon: string | null;
  addedAt: number;
  /**
   * How this entry got into the batch. Optional for backward compatibility
   * with batches written before bundle support — undefined is treated as
   * `{ kind: "eth_sendTransaction" }` everywhere it's read.
   */
  source?: CrossDappBatchEntrySource;
}

export interface CrossDappBatch {
  /** Locked at first add */
  fromAddress: string;
  /** Locked at first add */
  chainId: number;
  chainName: string;
  accountType: "bankr";
  entries: CrossDappBatchEntry[];
  createdAt: number;
  // SECURITY: pinned to the account that created the batch; optional for
  // backward compat with batches written by older builds.
  accountId?: string;
}

export async function getCrossDappBatch(): Promise<CrossDappBatch | null> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return (data[STORAGE_KEY] as CrossDappBatch | undefined) ?? null;
}

export async function setCrossDappBatch(batch: CrossDappBatch): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: batch });
  const { updateBadge } = await import("./pendingTxStorage");
  await updateBadge();
}

export async function clearCrossDappBatch(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
  const { updateBadge } = await import("./pendingTxStorage");
  await updateBadge();
}
