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

  if (forceInclusion) {
    const { FORCE_INCLUSION_CHAINS } = await import("@/constants/chainRegistry");
    if (FORCE_INCLUSION_CHAINS.get(pending.chainId)?.protocol !== "op-stack") {
      processingBundleIds.delete(bundleId);
      return { success: false, error: "Arbitrum force inclusion is not available for batch requests" };
    }
  }
  const forceInclusionProcessor = forceInclusion
    ? (await import("../forceInclusion/batch")).processForceInclusionBatchLocal
    : null;

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

  // EIP-7702 atomic / single-call shortcut / auto-sequential branching.
  //
  // Resolution order:
  //  - calls.length === 1 → send the inner call as a normal tx (no ERC-7821
  //    wrap, no 7702 overhead). The ERC-7821 self-call adds cost without
  //    benefit when there's nothing to batch.
  //  - calls.length > 1 AND a usable delegate resolves (onchain reuse OR
  //    custom override OR Pectra-supported chain default) → atomic via 7702.
  //  - else → existing auto-sequential path (preserves behavior on chains
  //    without 7702 support and on EOAs delegated to a non-ERC-7821 contract).
  //
  // Flip the bundle's `atomic` flag the moment we commit to a path. The
  // status was created with `atomic: isBankrAccount` (so PK/SP starts at
  // false), but the truth only becomes known at confirm-time: single-tx
  // and 7702 paths both ship as one onchain tx (trivially atomic by
  // EIP-5792), while the sequential fallback genuinely isn't. We update
  // here once and let the merge semantics of `updateBundleStatus` carry
  // it forward through every subsequent status transition (PENDING →
  // CONFIRMED / REVERTED). Without this the dapp's `wallet_getCallsStatus`
  // response keeps reporting `atomic: false` even after we delivered a
  // single atomic tx — caught by walletbeat's EIP-5792 conformance test.
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
