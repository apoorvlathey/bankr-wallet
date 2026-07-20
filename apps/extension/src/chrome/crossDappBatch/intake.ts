import {
  getPendingBatchTxRequestById,
  removePendingBatchTxRequest,
} from "../requests/pendingBatchTxStorage";
import {
  getPendingTxRequestById,
  removePendingTxRequest,
} from "../requests/pendingTxStorage";
import {
  eligibilityErrorForCrossDappBatch,
  hasConcreteRecipientAddress,
  resolvePinnedCrossDappAccount,
} from "./accountPolicy";
import {
  getCrossDappBatch,
  setCrossDappBatch,
  type CrossDappBatch,
  type CrossDappBatchEntry,
} from "./storage";

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
  if (pending.replacement) {
    return { success: false, error: "Replacement transactions cannot be batched" };
  }
  if (!hasConcreteRecipientAddress(pending.tx.to)) {
    return {
      success: false,
      error: "Contract deployment transactions cannot be added to a batch",
    };
  }
  const pinned = await resolvePinnedCrossDappAccount(pending, pending.tx.from);
  if (!pinned.ok) return { success: false, error: pinned.error };
  const account = pinned.account;
  const eligibilityError = await eligibilityErrorForCrossDappBatch(
    account,
    pending.tx.chainId,
    pending.chainName,
  );
  if (eligibilityError) return { success: false, error: eligibilityError };

  const existing = await getCrossDappBatch();
  const lockError = existingBatchLockError(
    existing,
    account.address,
    pending.tx.chainId,
  );
  if (lockError) return { success: false, error: lockError };

  const entry: CrossDappBatchEntry = {
    txId: pending.id,
    tx: pending.tx,
    origin: pending.origin,
    favicon: pending.favicon,
    addedAt: Date.now(),
    source: { kind: "eth_sendTransaction" },
    tabId: pending.tabId,
    frameId: pending.frameId,
    senderOrigin: pending.senderOrigin,
    requestChainId: pending.requestChainId,
    walletConnect: pending.walletConnect
      ? {
          topic: pending.walletConnect.topic,
          requestId: pending.walletConnect.requestId,
          method: pending.walletConnect.method,
        }
      : undefined,
    trustedInternal: pending.trustedInternal,
    accountType: pending.accountType,
    bankrCredentialTag: pending.bankrCredentialTag,
  };
  const next: CrossDappBatch = existing
    ? { ...existing, entries: [...existing.entries, entry] }
    : {
        fromAddress: account.address,
        chainId: pending.tx.chainId,
        chainName: pending.chainName,
        accountType: account.type as CrossDappBatch["accountType"],
        entries: [entry],
        createdAt: Date.now(),
        accountId: account.id,
      };
  await setCrossDappBatch(next);
  await removePendingTxRequest(pending.id);
  notifyBatchUpdated();
  return { success: true };
}

export async function handleAddCallsToCrossDappBatch(
  bundleId: string,
): Promise<{ success: boolean; error?: string }> {
  const pending = await getPendingBatchTxRequestById(bundleId);
  if (!pending) {
    return { success: false, error: "Pending batch request not found" };
  }
  if (pending.intakeStatus === "validating") {
    return { success: false, error: "Batch request is still being validated" };
  }
  const pinned = await resolvePinnedCrossDappAccount(
    pending,
    pending.params.from,
  );
  if (!pinned.ok) return { success: false, error: pinned.error };
  const account = pinned.account;
  const eligibilityError = await eligibilityErrorForCrossDappBatch(
    account,
    pending.chainId,
    pending.chainName,
  );
  if (eligibilityError) return { success: false, error: eligibilityError };
  if (!pending.params.calls || pending.params.calls.length === 0) {
    return { success: false, error: "Bundle has no calls to add" };
  }
  if (
    pending.params.calls.some(
      (call) => !hasConcreteRecipientAddress(call.to),
    )
  ) {
    return {
      success: false,
      error: "Contract deployment calls cannot be added to a batch",
    };
  }

  const fromAddress = pending.params.from || account.address;
  const existing = await getCrossDappBatch();
  const lockError = existingBatchLockError(
    existing,
    fromAddress,
    pending.chainId,
  );
  if (lockError) return { success: false, error: lockError };

  const now = Date.now();
  const totalCalls = pending.params.calls.length;
  const entries: CrossDappBatchEntry[] = pending.params.calls.map(
    (call, callIndex) => ({
      txId: `${bundleId}:${callIndex}`,
      tx: {
        from: fromAddress as `0x${string}`,
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
      tabId: pending.tabId,
      frameId: pending.frameId,
      senderOrigin: pending.senderOrigin,
      requestChainId: pending.requestChainId,
      walletConnect: pending.walletConnect,
      trustedInternal: pending.trustedInternal,
      accountType: pending.accountType,
      bankrCredentialTag: pending.bankrCredentialTag,
    }),
  );
  const next: CrossDappBatch = existing
    ? { ...existing, entries: [...existing.entries, ...entries] }
    : {
        fromAddress,
        chainId: pending.chainId,
        chainName: pending.chainName,
        accountType: account.type as CrossDappBatch["accountType"],
        entries,
        createdAt: now,
        accountId: account.id,
      };
  await setCrossDappBatch(next);
  await removePendingBatchTxRequest(bundleId);
  notifyBatchUpdated();
  return { success: true };
}

function existingBatchLockError(
  existing: CrossDappBatch | null,
  fromAddress: string,
  chainId: number,
): string | null {
  if (!existing) return null;
  if (existing.fromAddress.toLowerCase() !== fromAddress.toLowerCase()) {
    return `Pending batch is for ${existing.fromAddress.slice(0, 6)}…${existing.fromAddress.slice(-4)} — clear it first`;
  }
  return existing.chainId !== chainId
    ? `Pending batch is on ${existing.chainName} — clear it first`
    : null;
}

function notifyBatchUpdated(): void {
  chrome.runtime
    .sendMessage({ type: "crossDappBatchUpdated" })
    .catch(() => {});
}
