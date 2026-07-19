import { hasEncryptedApiKey, loadDecryptedApiKey } from "../crypto";
import { captureEip7702DelegationAuthorization } from "../delegatedAuthorityPolicy";
import {
  processLocalTransactionInBackground,
  type GasOverrides,
  type LocalSigningAccount,
} from "./localExecution";
import {
  getPendingTxRequestById,
  removePendingTxRequest,
} from "../requests/pendingTxStorage";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import {
  processingTxIds,
  resolvePinnedAccount,
} from "./runtime";
import { beginPendingRequestEffectLease } from "../requests/pendingRequestResolution";
import {
  getCachedVaultKey,
  getPrivateKeyFromCache,
  setCachedApiKey,
  setCachedVault,
  tryRestoreSession,
} from "../sessionCache";
import { decryptAllKeys } from "../vaultCrypto";

type ConfirmationResult = { success: boolean; error?: string };

async function resolveLocalTransactionKey(
  account: LocalSigningAccount,
  password: string,
): Promise<
  | { ok: true; privateKey: `0x${string}` }
  | { ok: false; error: string }
> {
  let privateKey = getPrivateKeyFromCache(account.id);
  if (privateKey) return { ok: true, privateKey };

  if (!getCachedVaultKey()) {
    const { handleUnlockWallet } = await import("../authHandlers");
    if (await tryRestoreSession(handleUnlockWallet)) {
      privateKey = getPrivateKeyFromCache(account.id);
    }
  }
  if (privateKey) return { ok: true, privateKey };

  const cachedVaultKey = getCachedVaultKey();
  const vault = cachedVaultKey
    ? await (async () => {
        const { decryptAllKeysWithVaultKey } = await import("../authHandlers");
        return decryptAllKeysWithVaultKey(cachedVaultKey);
      })()
    : await decryptAllKeys(password);
  if (!vault) return { ok: false, error: "Invalid password" };

  setCachedVault(vault);
  if (await hasEncryptedApiKey()) {
    const apiKey = await loadDecryptedApiKey(password);
    if (apiKey) setCachedApiKey(apiKey, password);
  }
  privateKey = getPrivateKeyFromCache(account.id);
  return privateKey
    ? { ok: true, privateKey }
    : { ok: false, error: "Private key not found for account" };
}

/** Confirms a pinned private-key or seed-phrase transaction for background execution. */
export async function handleConfirmTransactionAsyncPK(
  txId: string,
  password: string,
  _tabId?: number,
  functionName?: string,
  gasOverrides?: GasOverrides,
  forceInclusion?: boolean,
  feePaymentToken?: "native" | "token",
  feePaymentQuoteId?: string,
): Promise<ConfirmationResult> {
  if (processingTxIds.has(txId)) {
    return { success: false, error: "Transaction already being processed" };
  }

  const pending = await getPendingTxRequestById(txId);
  if (!pending) return { success: false, error: "Transaction request not found" };
  processingTxIds.add(txId);

  const pinned = await resolvePinnedAccount(pending);
  if (!pinned.ok) {
    processingTxIds.delete(txId);
    return { success: false, error: pinned.error };
  }
  const account = pinned.account;
  if (account.type !== "privateKey" && account.type !== "seedPhrase") {
    processingTxIds.delete(txId);
    return { success: false, error: "Account does not support local signing" };
  }
  if (
    typeof pending.tx.from === "string" &&
    pending.tx.from.length > 0 &&
    pending.tx.from.toLowerCase() !== account.address.toLowerCase()
  ) {
    processingTxIds.delete(txId);
    return {
      success: false,
      error: "Transaction 'from' does not match active account",
    };
  }

  let expectedDelegatedAuthorityAuthEpoch: string | undefined;
  try {
    expectedDelegatedAuthorityAuthEpoch =
      await captureEip7702DelegationAuthorization(
        pending.delegation7702Meta,
      );
  } catch (error) {
    processingTxIds.delete(txId);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Master unlock required",
    };
  }

  const key = await resolveLocalTransactionKey(account, password);
  if (!key.ok) {
    processingTxIds.delete(txId);
    return { success: false, error: key.error };
  }

  let feePaymentQuote;
  if (feePaymentToken === "token") {
    try {
      const { consumeFeePaymentQuote, feePaymentSingleCalls } = await import(
        "../feePayment/quotes"
      );
      feePaymentQuote = consumeFeePaymentQuote({
        quoteId: feePaymentQuoteId ?? "",
        family: "transaction",
        requestId: txId,
        account,
        calls: feePaymentSingleCalls(pending),
      });
    } catch (error) {
      processingTxIds.delete(txId);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Fee-token quote is invalid",
      };
    }
  }

  const forceInclusionProcessor = forceInclusion
    ? (await import("../forceInclusion/single")).processForceInclusionLocal
    : null;
  await removePendingTxRequest(txId);

  const authorization =
    await enforcePendingRequestAuthorizationAtConfirmation(
      "transaction",
      pending,
    );
  if (!authorization.authorized) {
    processingTxIds.delete(txId);
    return { success: false, error: authorization.error };
  }

  const effectLease = beginPendingRequestEffectLease("transaction", txId);
  if (!effectLease) {
    processingTxIds.delete(txId);
    return { success: false, error: "Wallet reset is in progress" };
  }

  if (feePaymentToken === "token") {
    const { processUsdcTransactionInBackground } = await import(
      "../feePayment/execution"
    );
    void processUsdcTransactionInBackground({
      txId,
      pending,
      signer: { account, privateKey: key.privateKey },
      functionName,
      effectLease,
      quote: feePaymentQuote,
    });
  } else if (forceInclusionProcessor) {
    void forceInclusionProcessor(
      txId,
      pending,
      account,
      key.privateKey,
      gasOverrides,
      effectLease,
    );
  } else {
    void processLocalTransactionInBackground(
      txId,
      pending,
      account,
      key.privateKey,
      functionName,
      gasOverrides,
      effectLease,
      expectedDelegatedAuthorityAuthEpoch,
    );
  }
  return { success: true };
}
