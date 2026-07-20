/** Local signer credential restoration and batch execution path selection. */
import { getAccountById } from "../accountStorage";
import { handleUnlockWallet } from "../authHandlers";
import { hasEncryptedApiKey, loadDecryptedApiKey } from "../crypto";
import { resolveActiveDelegate } from "../../utils/delegationResolution";
import { getStoredResolvedChainById } from "../../lib/chains";
import { updateBundleStatus } from "./bundleStatusStorage";
import { processingBundleIds } from "./batchExecutionRuntime";
import type { PendingBatchTxRequest } from "../erc5792Types";
import { removePendingBatchTxRequest, getPendingBatchTxRequestById } from "../requests/pendingBatchTxStorage";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import { beginPendingRequestEffectLease, type PendingRequestEffectLease } from "../requests/pendingRequestResolution";
import { getPrivateKeyFromCache, getCachedVaultKey, tryRestoreSession, setCachedVault, setCachedApiKey } from "../sessionCache";
import { decryptAllKeys } from "../vaultCrypto";
import type { GasEstimate } from "../gasEstimation";
import { resolveLocalBatchForceInclusion } from "./batchForceInclusionPolicy";

type LocalBatchAccount = { id: string; address: string; type: string };
export interface LocalBatchExecutors {
  processSingle: (bundleId: string, pending: PendingBatchTxRequest, account: LocalBatchAccount, key: any, names?: string[], gas?: GasEstimate[], lease?: PendingRequestEffectLease) => void;
  processNonAtomic: (bundleId: string, pending: PendingBatchTxRequest, account: LocalBatchAccount, key: any, names?: string[], gas?: GasEstimate[], lease?: PendingRequestEffectLease) => void;
  processAtomic7702: (bundleId: string, pending: PendingBatchTxRequest, account: LocalBatchAccount, key: any, delegate: any, needsAuthorization: boolean, names?: string[], gas?: GasEstimate[], historyMeta?: undefined, lease?: PendingRequestEffectLease) => void;
}

export async function confirmLocalBatchWithExecutors(
  executors: LocalBatchExecutors,
  bundleId: string,
  password: string,
  _tabId?: number,
  functionNames?: string[],
  precomputedGasEstimates?: import("../gasEstimation").GasEstimate[],
  forceInclusion?: boolean,
  feePaymentToken?: "native" | "token",
  feePaymentQuoteId?: string,
): Promise<{ success: boolean; error?: string }> {
  if (processingBundleIds.has(bundleId)) {
    return { success: false, error: "Bundle already being processed" };
  }

  const pending = await getPendingBatchTxRequestById(bundleId);
  if (!pending) return { success: false, error: "Batch request not found" };
  if (pending.intakeStatus === "validating") {
    return { success: false, error: "Batch request is still being validated" };
  }

  processingBundleIds.add(bundleId);

  // SECURITY: resolve the pinned account; do NOT fall back to getActiveAccount().
  if (!pending.accountId) {
    processingBundleIds.delete(bundleId);
    return { success: false, error: "Pending request is no longer valid" };
  }
  const account = await getAccountById(pending.accountId);
  if (!account) {
    processingBundleIds.delete(bundleId);
    return { success: false, error: "Account no longer exists" };
  }
  if (
    pending.accountAddress &&
    account.address.toLowerCase() !== pending.accountAddress.toLowerCase()
  ) {
    processingBundleIds.delete(bundleId);
    return { success: false, error: "Pending request is no longer valid" };
  }

  if (account.type !== "privateKey" && account.type !== "seedPhrase") {
    processingBundleIds.delete(bundleId);
    return { success: false, error: "Account does not support local signing" };
  }

  // Get private key — try cache, then session restoration, then vault decryption
  let privateKey = getPrivateKeyFromCache(account.id);

  if (!privateKey) {
    const vaultKey = getCachedVaultKey();
    if (!vaultKey) {
      const restored = await tryRestoreSession(handleUnlockWallet);
      if (restored) {
        privateKey = getPrivateKeyFromCache(account.id);
      }
    }

    if (!privateKey) {
      const cachedVaultKey = getCachedVaultKey();
      let vault;

      if (cachedVaultKey) {
        const { decryptAllKeysWithVaultKey } = await import("../authHandlers");
        vault = await decryptAllKeysWithVaultKey(cachedVaultKey);
      } else {
        vault = await decryptAllKeys(password);
      }

      if (!vault) {
        processingBundleIds.delete(bundleId);
        return { success: false, error: "Invalid password" };
      }
      setCachedVault(vault);

      // Also cache API key if available
      const hasApiKeyStored = await hasEncryptedApiKey();
      if (hasApiKeyStored) {
        const apiKey = await loadDecryptedApiKey(password);
        if (apiKey) {
          setCachedApiKey(apiKey, password);
        }
      }

      privateKey = getPrivateKeyFromCache(account.id);
      if (!privateKey) {
        processingBundleIds.delete(bundleId);
        return { success: false, error: "Private key not found for account" };
      }
    }
  }

  const forceResolution = await resolveLocalBatchForceInclusion(
    pending.chainId,
    forceInclusion === true,
  );
  if (!forceResolution.ok) {
    processingBundleIds.delete(bundleId);
    return { success: false, error: forceResolution.error };
  }
  const forceInclusionProcessor = forceResolution.processor;
  let feePaymentQuote;
  if (feePaymentToken === "token") {
    try {
      const { consumeFeePaymentQuote, feePaymentBatchCalls } = await import(
        "../feePayment/quotes"
      );
      feePaymentQuote = consumeFeePaymentQuote({
        quoteId: feePaymentQuoteId ?? "",
        family: "batchTransaction",
        requestId: bundleId,
        account,
        calls: feePaymentBatchCalls(pending),
      });
    } catch (error) {
      processingBundleIds.delete(bundleId);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Fee-token quote is invalid",
      };
    }
  }
  // Remove from pending storage
  await removePendingBatchTxRequest(bundleId);

  const authorizeFinalEffect = async (): Promise<
    { authorized: true } | { authorized: false; error: string }
  > => {
    const authorization =
      await enforcePendingRequestAuthorizationAtConfirmation(
        "batchTransaction",
        pending,
      );
    if (!authorization.authorized) {
      processingBundleIds.delete(bundleId);
      return { authorized: false, error: authorization.error };
    }
    return { authorized: true };
  };

  if (feePaymentToken === "token") {
    const authorization = await authorizeFinalEffect();
    if (!authorization.authorized) {
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
    await updateBundleStatus(bundleId, { atomic: true });
    const { processUsdcBatchInBackground } = await import(
      "../feePayment/batchExecution"
    );
    void processUsdcBatchInBackground({
      bundleId,
      pending,
      signer: { account, privateKey },
      functionNames,
      effectLease,
      quote: feePaymentQuote,
    });
    return { success: true };
  }

  // Branch to force inclusion if requested
  if (forceInclusionProcessor) {
    const authorization = await authorizeFinalEffect();
    if (!authorization.authorized) {
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
    forceInclusionProcessor(
      bundleId,
      pending,
      account,
      privateKey,
      functionNames,
      precomputedGasEstimates,
      effectLease,
    );
    return { success: true };
  }

  // One call sends directly; multiple calls use an active/default ERC-7821
  // delegate atomically or fall back to sequential nonces. Commit `atomic`
  // when choosing the path so every later EIP-5792 status keeps that truth.
  const calls = pending.params.calls;
  if (calls.length === 1) {
    await updateBundleStatus(bundleId, { atomic: true });
    const authorization = await authorizeFinalEffect();
    if (!authorization.authorized) {
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
    executors.processSingle(
      bundleId,
      pending,
      account,
      privateKey,
      functionNames,
      precomputedGasEstimates,
      effectLease,
    );
    return { success: true };
  }

  const resolution = await resolveActiveDelegate({
    accountId: account.id,
    accountAddress: account.address as `0x${string}`,
    chainId: pending.chainId,
    rpcUrl:
      (await getStoredResolvedChainById(pending.chainId))?.rpcUrl ?? "",
  });

  if (resolution.delegate) {
    await updateBundleStatus(bundleId, { atomic: true });
    const authorization = await authorizeFinalEffect();
    if (!authorization.authorized) {
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
    executors.processAtomic7702(
      bundleId,
      pending,
      account,
      privateKey,
      resolution.delegate,
      resolution.needsAuthorization,
      functionNames,
      precomputedGasEstimates,
      undefined,
      effectLease,
    );
    return { success: true };
  }

  // Process in background (non-atomic: sequential nonces, individual
  // broadcasts). `atomic` stays at its initial `false` — that's the
  // correct EIP-5792 value here.
  const authorization = await authorizeFinalEffect();
  if (!authorization.authorized) {
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
  executors.processNonAtomic(
    bundleId,
    pending,
    account,
    privateKey,
    functionNames,
    precomputedGasEstimates,
    effectLease,
  );

  return { success: true };
}
