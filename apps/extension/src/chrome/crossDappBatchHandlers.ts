/**
 * Cross-dapp batch handlers
 *
 * Lets the user assemble a single ERC-7821 atomic batch out of N independent
 * `eth_sendTransaction` requests that came from different dapps (or in-wallet
 * transfers) and ship them in one onchain transaction via Bankr API accounts
 * or local EIP-7702 batching for Private Key / Seed Phrase accounts.
 *
 * Lifecycle:
 *   1. dapp calls `eth_sendTransaction` → standard pending tx request created
 *   2. user clicks "Add to Batch" → handleAddToCrossDappBatch
 *      - moves the request out of `pendingTxRequests` into `crossDappBatch`
 *      - the dapp promise stays open (no `txResult:{txId}` write)
 *   3. user can keep adding (same `from` + `chainId` only)
 *   4. user can remove individual entries (rejects that dapp's promise)
 *      or reject the whole batch (rejects all dapp promises)
 *   5. on confirm: encode → submit via Bankr or local 7702 → fan out the SAME
 *      tx hash/status to every source dapp
 */

import {
  submitTransactionDirect,
  type TransactionParams,
} from "./bankrApi";
import { BANKR_SUPPORTED_CHAIN_IDS } from "../constants/networks";
import { CHAIN_CONFIG } from "../constants/chainConfig";
import { getAccountById } from "./accountStorage";
import type { Account } from "./types";
import { resolveActiveDelegate } from "@/utils/delegationResolution";
import {
  signEip7702Authorization,
  signAndBroadcastTransaction,
} from "./localSigner";
import { getStoredResolvedChainById } from "@/lib/chains";
import { getNextNonce, resetNonce } from "./nonceManager";
import { hasEncryptedApiKey } from "./crypto";
import { decryptAllKeys } from "./vaultCrypto";
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
  updateEntryDataInCrossDappBatch,
  type CrossDappBatch,
  type CrossDappBatchEntry,
} from "./crossDappBatchStorage";
import {
  getCachedApiKey,
  setCachedApiKey,
  getCachedPassword,
  getAutoLockTimeout,
  tryRestoreSession,
  getCachedVaultKey,
  getPrivateKeyFromCache,
  setCachedVault,
} from "./sessionCache";
import { loadDecryptedApiKey } from "./crypto";
import { handleUnlockWallet } from "./authHandlers";
import {
  addTxToHistory,
  updateTxInHistory,
  getTxById,
} from "./txHistoryStorage";
import { startReceiptPolling } from "./txReceiptPoller";
import {
  extractAssetChangesWhenReceiptAvailable,
  fetchBundleReceipt,
  fetchRawTransactionReceipt,
  toBundleReceipt,
} from "./receiptEnrichment";
import { writeResultToStorage, showNotification } from "./txHandlers";
import {
  encodeBatchCalls,
  omitOuterValueForEip7702,
} from "./batchTxHandlers";
import {
  BUNDLE_STATUS,
  type ERC5792Call,
  type BundleReceipt,
} from "./erc5792Types";
import type { GasEstimate } from "./gasEstimation";

// Prevent double-shipping if user clicks Confirm twice in quick succession.
let isProcessing = false;

function hasConcreteRecipientAddress(
  to: TransactionParams["to"] | ERC5792Call["to"] | undefined,
): to is string {
  return typeof to === "string" && /^0x[a-fA-F0-9]{40}$/.test(to);
}

/**
 * Reject reasons for an account/chain combo when starting or joining a
 * cross-dapp batch. Returned as a human-friendly string, or null if the
 * combo is allowed.
 *
 * - Bankr accounts: chain must be Bankr-supported.
 * - PK/SP accounts: chain must have a usable 7702 path according to the same
 *   resolver used at ship time. Built-in Pectra chains qualify through the
 *   default delegate unless the EOA is already delegated to an incompatible
 *   contract; custom chains qualify only once the EOA is actually delegated
 *   onchain to an ERC-7821-compatible contract.
 * - Anything else (impersonator): rejected.
 */
async function eligibilityErrorForCrossDappBatch(
  account: { id: string; type: string; address: string } | null,
  chainId: number,
  chainName: string,
): Promise<string | null> {
  if (!account || account.type === "impersonator") {
    return "View-only accounts cannot use cross-dapp batching";
  }
  if (account.type === "bankr") {
    if (!BANKR_SUPPORTED_CHAIN_IDS.has(chainId)) {
      return `Chain ${chainName} is not supported for Bankr batching`;
    }
    return null;
  }
  if (account.type === "privateKey" || account.type === "seedPhrase") {
    const resolved = await getStoredResolvedChainById(chainId);
    if (resolved?.rpcUrl) {
      try {
        const plan = await resolveActiveDelegate({
          accountId: account.id,
          accountAddress: account.address as `0x${string}`,
          chainId,
          rpcUrl: resolved.rpcUrl,
        });
        if (plan.delegate) return null;
      } catch (err) {
        console.warn("[cross-dapp] delegate eligibility probe failed", err);
      }
    }
    return `Chain ${chainName} doesn't support atomic batching for this account — set a custom delegate in Account Settings or switch chains.`;
  }
  return "This account type cannot use cross-dapp batching";
}

async function resolvePinnedCrossDappAccount(
  pending: {
    accountId?: string;
    accountAddress?: string;
    accountType?: string;
  },
  requestedFrom?: string | null,
): Promise<
  | {
      ok: true;
      account: Account;
    }
  | { ok: false; error: string }
> {
  if (!pending.accountId || !pending.accountAddress || !pending.accountType) {
    return { ok: false, error: "Pending request is no longer valid" };
  }

  const account = await getAccountById(pending.accountId);
  if (!account) {
    return { ok: false, error: "Account no longer exists" };
  }

  const lockedAddress = pending.accountAddress.toLowerCase();
  if (
    account.address.toLowerCase() !== lockedAddress ||
    account.type !== pending.accountType
  ) {
    return { ok: false, error: "Pending request is no longer valid" };
  }

  if (requestedFrom && requestedFrom.toLowerCase() !== lockedAddress) {
    return {
      ok: false,
      error: "Request from address does not match the locked account",
    };
  }

  return { ok: true, account };
}

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
  if (!pending.tx.from) {
    return { success: false, error: "Pending request is no longer valid" };
  }
  if (!hasConcreteRecipientAddress(pending.tx.to)) {
    return {
      success: false,
      error: "Contract deployment transactions cannot be added to a batch",
    };
  }

  const pinned = await resolvePinnedCrossDappAccount(pending, pending.tx.from);
  if (!pinned.ok) {
    return { success: false, error: pinned.error };
  }

  // Bankr (atomic via API) or PK/SP with 7702 (atomic via local-signing
  // type-4 tx) can both use cross-dapp batching. Impersonator is rejected.
  const account = pinned.account;
  const txChainId = pending.tx.chainId;
  const eligErr = await eligibilityErrorForCrossDappBatch(
    account,
    txChainId,
    pending.chainName,
  );
  if (eligErr) {
    return { success: false, error: eligErr };
  }

  const txFrom = account.address.toLowerCase();

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
        fromAddress: account.address,
        chainId: txChainId,
        chainName: pending.chainName,
        accountType: account.type as CrossDappBatch["accountType"],
        entries: [newEntry],
        createdAt: Date.now(),
        accountId: account.id,
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

  const pinned = await resolvePinnedCrossDappAccount(
    pending,
    pending.params.from,
  );
  if (!pinned.ok) {
    return { success: false, error: pinned.error };
  }

  // Bankr (atomic via API) or PK/SP with 7702 can both add an existing
  // wallet_sendCalls bundle into the cross-dapp batch.
  const account = pinned.account;
  const eligErr = await eligibilityErrorForCrossDappBatch(
    account,
    pending.chainId,
    pending.chainName,
  );
  if (eligErr) {
    return { success: false, error: eligErr };
  }

  const lockedFromAddress = pending.params.from || account.address;
  const fromAddress = lockedFromAddress.toLowerCase();
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
  if (pending.params.calls.some((call) => !hasConcreteRecipientAddress(call.to))) {
    return {
      success: false,
      error: "Contract deployment calls cannot be added to a batch",
    };
  }

  const totalCalls = pending.params.calls.length;
  const now = Date.now();

  const newEntries: CrossDappBatchEntry[] = pending.params.calls.map(
    (call, callIndex) => ({
      // Synthetic entry id — distinct from `bundleId` (the parent) so we can
      // remove an individual sibling row from the UI without colliding.
      txId: `${bundleId}:${callIndex}`,
      tx: {
        from: lockedFromAddress as `0x${string}`,
        to: call.to as string,
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
        fromAddress: lockedFromAddress,
        chainId: pending.chainId,
        chainName: pending.chainName,
        accountType: account.type as CrossDappBatch["accountType"],
        entries: newEntries,
        createdAt: now,
        accountId: account.id,
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
// Edit a single entry's calldata in the cross-dapp batch
// ---------------------------------------------------------------------------

export async function handleUpdateCallInCrossDappBatch(
  txId: string,
  newData: string,
): Promise<{ success: boolean; error?: string }> {
  const result = await updateEntryDataInCrossDappBatch(txId, newData);
  if (result.success) {
    // Wake any other popup/sidepanel context listening on this batch so they
    // re-render with the edited entry (mirrors the remove/confirm fan-out).
    chrome.runtime
      .sendMessage({ type: "crossDappBatchUpdated" })
      .catch(() => {});
  }
  return result;
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

const BATCH_EXPIRY_MS = 30 * 60 * 1000;

export async function handleConfirmCrossDappBatch(
  password: string,
  precomputedGasEstimates?: GasEstimate[],
): Promise<{ success: boolean; error?: string; txHash?: string }> {
  if (isProcessing) {
    return { success: false, error: "Batch already being processed" };
  }

  const batch = await getCrossDappBatch();
  if (!batch || batch.entries.length === 0) {
    return { success: false, error: "No batch to confirm" };
  }

  // SECURITY: re-check expiry at confirm time in case cleanup didn't run.
  if (Date.now() - batch.createdAt > BATCH_EXPIRY_MS) {
    await clearCrossDappBatch();
    return { success: false, error: "Batch request expired" };
  }

  // SECURITY: the batch is locked to the account that created the original
  // request(s). Resolve that pinned account directly instead of consulting the
  // current active account, which the user may have changed while the batch
  // confirmation was open.
  if (!batch.accountId) {
    return { success: false, error: "Pending request is no longer valid" };
  }
  const batchAccount = await getAccountById(batch.accountId);
  if (!batchAccount) {
    return { success: false, error: "Account no longer exists" };
  }
  if (batchAccount.type !== batch.accountType) {
    return { success: false, error: "Pending request is no longer valid" };
  }
  if (
    batchAccount.address.toLowerCase() !==
    batch.fromAddress.toLowerCase()
  ) {
    return { success: false, error: "Pending request is no longer valid" };
  }

  // Chain support: Bankr → Bankr-supported set; PK/SP → 7702-supported OR
  // user-configured custom delegate for this account×chain.
  const chainEligErr = await eligibilityErrorForCrossDappBatch(
    batchAccount,
    batch.chainId,
    batch.chainName,
  );
  if (chainEligErr) {
    return { success: false, error: chainEligErr };
  }
  if (batch.entries.some((entry) => !hasConcreteRecipientAddress(entry.tx.to))) {
    return {
      success: false,
      error: "Contract deployment transactions cannot be confirmed as a batch",
    };
  }

  isProcessing = true;

  try {
    // Build ERC-5792 calls and encode as a single ERC-7821 self-call tx.
    const calls: ERC5792Call[] = batch.entries.map((entry) => ({
      to: entry.tx.to as `0x${string}`,
      value: (entry.tx.value ?? "0x0") as `0x${string}`,
      data: (entry.tx.data ?? "0x") as `0x${string}`,
    }));

    const encoded = encodeBatchCalls(calls, batch.fromAddress);
    const outerBatchTx =
      batch.accountType === "bankr"
        ? encoded
        : omitOuterValueForEip7702(encoded);
    const tx: TransactionParams = {
      from: batch.fromAddress,
      to: outerBatchTx.to,
      data: outerBatchTx.data,
      value: outerBatchTx.value,
      chainId: batch.chainId,
    };

    // Use one synthetic id for the txHistory entry.
    // Origin = "Cross-Dapp Batch" so the activity tab uses it as the title row;
    // functionName holds just the call count for the secondary row.
    const historyId = `cross-dapp-batch-${Date.now()}`;
    const callCountLabel = `${calls.length} call${calls.length === 1 ? "" : "s"}`;
    const batchCallOrigins = batch.entries.map((entry) => ({
      origin: entry.origin,
      favicon: entry.favicon,
    }));

    await addTxToHistory({
      id: historyId,
      status: "processing",
      tx,
      origin: "Cross-Dapp Batch",
      favicon: null,
      chainName: batch.chainName,
      chainId: batch.chainId,
      createdAt: Date.now(),
      accountType: batch.accountType,
      functionName: callCountLabel,
      batchCallOrigins,
    });

    // Helpers that fan results out to every entry's originating dapp, routing
    // each entry by its source kind:
    //   - eth_sendTransaction resolves as soon as a tx hash exists.
    //   - wallet_sendCalls stays PENDING until the shared atomic tx receipt is
    //     terminal, then transitions to CONFIRMED/REVERTED for all contributing
    //     dapps.
    const fanOutWalletSendCalls = async (
      outcome:
        | { kind: "submitted"; txHash: string }
        | { kind: "confirmed"; txHash: string; receipt?: BundleReceipt | null }
        | { kind: "reverted"; txHash?: string; error: string }
        | { kind: "error"; error: string },
    ) => {
      const seenBundles = new Set<string>();
      await Promise.all(
        batch.entries.map(async (entry) => {
          if (entry.source?.kind !== "wallet_sendCalls") return;
          const bid = entry.source.bundleId;
          if (seenBundles.has(bid)) return;
          seenBundles.add(bid);
          // Cross-dapp batches always ship as a single onchain tx — Bankr
          // via the API's atomic path, PK/SP via the ERC-7821 / 7702
          // wrapper. So any outcome that made it onchain (submitted /
          // confirmed / reverted) is atomic by EIP-5792's definition.
          // Force-set `atomic: true` here so the dapp's
          // wallet_getCallsStatus response reflects reality — the bundle
          // status's initial `atomic` flag was set at request time when
          // we didn't yet know the user would route through cross-dapp.
          // OFFCHAIN_FAILURE keeps the initial value (the tx never ran,
          // atomicity is moot).
          if (outcome.kind === "submitted") {
            await updateBundleStatus(bid, {
              status: BUNDLE_STATUS.PENDING,
              txHash: outcome.txHash,
              atomic: true,
            });
          } else if (outcome.kind === "confirmed") {
            await updateBundleStatus(bid, {
              status: BUNDLE_STATUS.CONFIRMED,
              txHash: outcome.txHash,
              receipts: outcome.receipt ? [outcome.receipt] : undefined,
              completedAt: Date.now(),
              atomic: true,
            });
          } else if (outcome.kind === "reverted") {
            await updateBundleStatus(bid, {
              status: BUNDLE_STATUS.REVERTED,
              txHash: outcome.txHash,
              error: outcome.error,
              completedAt: Date.now(),
              atomic: true,
            });
          } else {
            await updateBundleStatus(bid, {
              status: BUNDLE_STATUS.OFFCHAIN_FAILURE,
              error: outcome.error,
              completedAt: Date.now(),
            });
          }
        }),
      );
    };

    const fanOutEthSendTransactions = async (
      outcome:
        | { kind: "submitted"; txHash: string }
        | { kind: "reverted"; txHash?: string; error: string }
        | { kind: "error"; error: string },
    ) => {
      await Promise.all(
        batch.entries.map((entry) => {
          if (entry.source?.kind === "wallet_sendCalls") return Promise.resolve();
          if (outcome.kind === "submitted") {
            return writeResultToStorage(`txResult:${entry.txId}`, {
              success: true,
              txHash: outcome.txHash,
            });
          }
          return writeResultToStorage(`txResult:${entry.txId}`, {
            success: false,
            error: outcome.error,
          });
        }),
      );
    };

    // Normalized result shape used by both Bankr and PK/SP ship paths so the
    // downstream tx-history + notification + fanOut handling stays unified.
    type ShipResult =
      | { kind: "ok"; txHash: string; status: "success" | "pending" }
      | { kind: "reverted"; txHash: string; error: string }
      | { kind: "error"; error: string };

    let ship: ShipResult;

    if (batch.accountType === "bankr") {
      // Bankr path — submit via API. Mirrors handleConfirmBatchTransaction.
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

      try {
        const result = await submitTransactionDirect(apiKey, tx);
        const txHash = result.transactionHash;
        if (result.status === "reverted") {
          ship = { kind: "reverted", txHash, error: "Transaction reverted" };
        } else if (result.status === "success" && txHash) {
          ship = { kind: "ok", txHash, status: "success" };
        } else {
          ship = { kind: "ok", txHash, status: "pending" };
        }
      } catch (err) {
        ship = {
          kind: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    } else {
      // PK / Seed Phrase path — atomic via EIP-7702 type-4 tx, local signing.
      ship = await shipCrossDappBatchPkSp({
        accountId: batchAccount.id,
        accountAddress: batchAccount.address as `0x${string}`,
        accountType: batch.accountType,
        chainId: batch.chainId,
        encoded: outerBatchTx,
        password,
        precomputedGasEstimates,
      });
    }

    if (ship.kind === "error") {
      await updateTxInHistory(historyId, {
        status: "failed",
        error: ship.error,
        completedAt: Date.now(),
      });
      await Promise.all([
        fanOutWalletSendCalls({ kind: "error", error: ship.error }),
        fanOutEthSendTransactions({ kind: "error", error: ship.error }),
      ]);
      await clearCrossDappBatch();
      await showNotification(
        `cross-dapp-batch-failed-${historyId}`,
        "Cross-Dapp Batch Failed",
        `Batch on ${batch.chainName} failed: ${ship.error}`,
      );
      return { success: false, error: ship.error };
    }

    if (ship.kind === "reverted") {
      await updateTxInHistory(historyId, {
        status: "failed",
        txHash: ship.txHash,
        error: ship.error,
        completedAt: Date.now(),
      });
      await Promise.all([
        fanOutWalletSendCalls({
          kind: "reverted",
          txHash: ship.txHash,
          error: ship.error,
        }),
        fanOutEthSendTransactions({
          kind: "reverted",
          txHash: ship.txHash,
          error: ship.error,
        }),
      ]);
      await clearCrossDappBatch();
      await showNotification(
        `cross-dapp-batch-reverted-${historyId}`,
        "Cross-Dapp Batch Reverted",
        `Batch on ${batch.chainName} reverted onchain.`,
      );
      return { success: false, error: ship.error, txHash: ship.txHash };
    }

    // ship.kind === "ok" → success or pending
    const txHash = ship.txHash;
    if (txHash) {
      await fanOutEthSendTransactions({ kind: "submitted", txHash });
    }

    if (ship.status === "success" && txHash) {
      const rawReceipt = await fetchRawTransactionReceipt(txHash, batch.chainId);
      const receipt = rawReceipt ? toBundleReceipt(rawReceipt.receipt) : null;
      await updateTxInHistory(historyId, {
        status: "success",
        txHash,
        completedAt: Date.now(),
      });
      extractAssetChangesWhenReceiptAvailable({
        txId: historyId,
        txHash,
        chainId: batch.chainId,
        userAddress: batch.fromAddress,
        receipt: rawReceipt?.receipt,
        rpcUrl: rawReceipt?.rpcUrl,
        logPrefix: "[cross-dapp]",
      });
      await fanOutWalletSendCalls({ kind: "confirmed", txHash, receipt });

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
      await updateTxInHistory(historyId, {
        status: "pending",
        txHash,
      });
      await fanOutWalletSendCalls({ kind: "submitted", txHash });
      startReceiptPolling(historyId, txHash, batch.chainId);
      void trackCrossDappBatchCompletion({
        historyId,
        txHash,
        chainId: batch.chainId,
        fanOutWalletSendCalls,
      });
    }

    await clearCrossDappBatch();

    return { success: true, txHash };
  } finally {
    isProcessing = false;
  }
}

async function trackCrossDappBatchCompletion(args: {
  historyId: string;
  txHash: string;
  chainId: number;
  fanOutWalletSendCalls: (
    outcome:
      | { kind: "confirmed"; txHash: string; receipt?: BundleReceipt | null }
      | { kind: "reverted"; txHash?: string; error: string },
  ) => Promise<void>;
}): Promise<void> {
  const MAX_WAIT_MS = 10 * 60 * 1000;
  const POLL_INTERVAL_MS = 5_000;
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_WAIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const tx = await getTxById(args.historyId);
    if (!tx || tx.status === "processing" || tx.status === "pending") continue;

    if (tx.status === "success") {
      const receipt = await fetchBundleReceipt(args.txHash, args.chainId);
      await args.fanOutWalletSendCalls({
        kind: "confirmed",
        txHash: args.txHash,
        receipt,
      });
    } else {
      await args.fanOutWalletSendCalls({
        kind: "reverted",
        txHash: args.txHash,
        error: tx.error || "Transaction reverted",
      });
    }
    return;
  }
}

/**
 * PK / Seed Phrase ship path for a cross-dapp batch. Decrypts the private
 * key (session restoration block included), resolves the active delegate
 * for the EOA × chain, signs the EIP-7702 authorization if the EOA isn't
 * already delegated, and broadcasts a type-4 tx that executes the
 * pre-encoded ERC-7821 batch.
 */
async function shipCrossDappBatchPkSp(args: {
  accountId: string;
  accountAddress: `0x${string}`;
  accountType: "privateKey" | "seedPhrase";
  chainId: number;
  encoded: { to: string; data: string; value: string };
  password: string;
  precomputedGasEstimates?: GasEstimate[];
}): Promise<
  | { kind: "ok"; txHash: string; status: "success" | "pending" }
  | { kind: "reverted"; txHash: string; error: string }
  | { kind: "error"; error: string }
> {
  // Resolve PK via cache → session restore → vault decryption.
  let privateKey = getPrivateKeyFromCache(args.accountId);
  if (!privateKey) {
    const vaultKey = getCachedVaultKey();
    if (!vaultKey) {
      const autoLockTimeout = await getAutoLockTimeout();
      if (autoLockTimeout === 0) {
        const restored = await tryRestoreSession(handleUnlockWallet);
        if (restored) {
          privateKey = getPrivateKeyFromCache(args.accountId);
        }
      }
    }
    if (!privateKey) {
      const cachedVaultKey = getCachedVaultKey();
      let vault;
      if (cachedVaultKey) {
        const { decryptAllKeysWithVaultKey } = await import("./authHandlers");
        vault = await decryptAllKeysWithVaultKey(cachedVaultKey);
      } else {
        vault = await decryptAllKeys(args.password);
      }
      if (!vault) return { kind: "error", error: "Invalid password" };
      setCachedVault(vault);
      if (await hasEncryptedApiKey()) {
        const apiKey = await loadDecryptedApiKey(args.password);
        if (apiKey) setCachedApiKey(apiKey, args.password);
      }
      privateKey = getPrivateKeyFromCache(args.accountId);
      if (!privateKey) {
        return { kind: "error", error: "Private key not found for account" };
      }
    }
  }

  const resolved = await getStoredResolvedChainById(args.chainId);
  if (!resolved?.rpcUrl) {
    return { kind: "error", error: "Chain has no RPC URL configured" };
  }
  const rpcUrl = resolved.rpcUrl;
  const customChainMeta = resolved.isCustom
    ? {
        name: resolved.name,
        nativeCurrency: resolved.nativeCurrency,
        explorer: resolved.explorer || undefined,
      }
    : undefined;

  const resolution = await resolveActiveDelegate({
    accountId: args.accountId,
    accountAddress: args.accountAddress,
    chainId: args.chainId,
    rpcUrl,
  });
  if (!resolution.delegate) {
    return {
      kind: "error",
      error:
        "This account isn't delegated to a compatible smart account on this chain. Set a custom delegate in Account Settings or switch chains.",
    };
  }

  try {
    const txNonce = await getNextNonce(args.accountAddress, args.chainId);

    // Race-window defense (mirror of processBatchTransactionAtomic7702InBackground):
    // if the EOA's onchain delegation changed between resolveActiveDelegate
    // and broadcast (revoked via Settings, switched via another wallet, etc.),
    // force re-authorization so the tx doesn't ride into a code-less EOA
    // where the ERC-7821 calldata silently no-ops.
    let needsAuthorization = resolution.needsAuthorization;
    if (!needsAuthorization) {
      try {
        const { getOnchainDelegate } = await import(
          "../utils/delegationResolution"
        );
        const onchain = await getOnchainDelegate(
          rpcUrl,
          args.chainId,
          args.accountAddress,
        );
        if (
          !onchain ||
          onchain.toLowerCase() !== resolution.delegate.toLowerCase()
        ) {
          console.warn(
            "[cross-dapp-7702] onchain delegate changed between resolve and broadcast — re-authorizing",
            { expected: resolution.delegate, actual: onchain },
          );
          needsAuthorization = true;
        }
      } catch (err) {
        console.warn(
          "[cross-dapp-7702] onchain delegate re-check failed — re-authorizing defensively",
          err,
        );
        needsAuthorization = true;
      }
    }

    let authorizationList:
      | readonly import("viem").SignedAuthorization[]
      | undefined;
    if (needsAuthorization) {
      const auth = await signEip7702Authorization(privateKey, {
        contractAddress: resolution.delegate,
        chainId: args.chainId,
        nonce: txNonce + 1,
        rpcUrl,
        customChainMeta,
      });
      authorizationList = [auth];
    }

    const summedFromEstimates = args.precomputedGasEstimates?.reduce(
      (acc, e) => acc + (Number(e?.gasLimit) || 0),
      0,
    );
    const fallbackGas =
      120_000 * Math.max(1, args.precomputedGasEstimates?.length ?? 8) +
      80_000;

    let maxFeePerGas: string | undefined;
    let maxPriorityFeePerGas: string | undefined;
    for (const est of args.precomputedGasEstimates ?? []) {
      if (est?.maxFeePerGas) {
        if (!maxFeePerGas || BigInt(est.maxFeePerGas) > BigInt(maxFeePerGas)) {
          maxFeePerGas = est.maxFeePerGas;
        }
      }
      if (est?.maxPriorityFeePerGas) {
        if (
          !maxPriorityFeePerGas ||
          BigInt(est.maxPriorityFeePerGas) > BigInt(maxPriorityFeePerGas)
        ) {
          maxPriorityFeePerGas = est.maxPriorityFeePerGas;
        }
      }
    }

    const result = await signAndBroadcastTransaction(
      privateKey,
      {
        from: args.accountAddress,
        to: args.encoded.to,
        data: args.encoded.data,
        value: args.encoded.value,
        chainId: args.chainId,
        nonce: txNonce,
        gas: `0x${Math.ceil(
          summedFromEstimates && summedFromEstimates > 0
            ? summedFromEstimates
            : fallbackGas,
        ).toString(16)}`,
        maxFeePerGas,
        maxPriorityFeePerGas,
        ...(authorizationList
          ? { type: "eip7702", authorizationList }
          : {}),
      },
      rpcUrl,
      customChainMeta,
    );

    if (result.receipt) {
      const success =
        result.receipt.status === "success" ||
        (result.receipt.status as unknown) === "0x1";
      return success
        ? { kind: "ok", txHash: result.txHash, status: "success" }
        : {
            kind: "reverted",
            txHash: result.txHash,
            error: "Transaction reverted",
          };
    }
    return { kind: "ok", txHash: result.txHash, status: "pending" };
  } catch (error) {
    resetNonce(args.accountAddress, args.chainId);
    return {
      kind: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
