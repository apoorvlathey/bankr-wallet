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
 * Account-type support:
 *   - Bankr accounts: ship via Bankr API on Bankr-supported chains.
 *   - PK / Seed Phrase accounts: ship via local signing + EIP-7702 atomic
 *     batch on chains where a delegate can be resolved (Pectra-supported
 *     built-in chains, or any chain with a user-configured custom delegate
 *     in Account Settings). On chains without a usable delegate, "Add to
 *     Batch" is disabled at the entry point so we never end up with an
 *     unshippable PK/SP batch.
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
  /**
   * Pinned at first add so the ship path knows which submission flow to use
   * (Bankr API for bankr; EIP-7702 atomic via local signing for PK/SP).
   * If the user switches accounts mid-flow, the confirm handler still resolves
   * this pinned account directly instead of rebinding to the live active account.
   */
  accountType: "bankr" | "privateKey" | "seedPhrase";
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

/**
 * Replace one entry's `tx.data` field in the cross-dapp batch. Mirrors
 * `updateCallInPendingBatchTxRequest` for dapp-initiated batches — used by the
 * batch confirmation UI when the user edits a built-in field (e.g. ERC-20
 * approve amount). The cross-dapp confirm handler reads `batch.entries[i].tx`
 * at sign time, so persisting here is enough; the wrapper's storage listener
 * re-renders with fresh entries and simulation/gas re-run automatically.
 */
export async function updateEntryDataInCrossDappBatch(
  txId: string,
  newData: string,
): Promise<{ success: boolean; error?: string }> {
  const batch = await getCrossDappBatch();
  if (!batch) return { success: false, error: "No active batch" };

  const idx = batch.entries.findIndex((e) => e.txId === txId);
  if (idx === -1) return { success: false, error: "Entry not found in batch" };
  if (!/^0x[0-9a-fA-F]*$/.test(newData)) {
    return { success: false, error: "Invalid calldata hex" };
  }

  const nextEntries = batch.entries.map((e, i) =>
    i === idx ? { ...e, tx: { ...e.tx, data: newData } } : e,
  );
  await setCrossDappBatch({ ...batch, entries: nextEntries });
  return { success: true };
}

export async function clearCrossDappBatch(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
  const { updateBadge } = await import("./pendingTxStorage");
  await updateBadge();
}
