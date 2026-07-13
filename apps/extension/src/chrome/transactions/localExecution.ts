import { getStoredResolvedChainById } from "@/lib/chains";
import { attachClearSignedMetaToHistory } from "../clearSignedMetaSnapshot";
import { assertDelegatedAuthorityMasterAuthorization } from "../delegatedAuthorityPolicy";
import { bumpGasForEip7702Auth } from "../gasEstimation";
import {
  signAndBroadcastTransaction,
  signEip7702Authorization,
} from "../localSigner";
import { getNextNonce, resetNonce } from "../forceInclusion/nonceManager";
import type { PendingTxRequest } from "../requests/pendingTxStorage";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import {
  activeAbortControllers,
  processingTxIds,
  writeResultToStorage,
} from "./runtime";
import {
  guardPendingRequestEffectLease,
  type PendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import { addTxToHistory, updateTxInHistory } from "../txHistoryStorage";
import { applyReceiptToHistory, startReceiptPolling } from "../forceInclusion/receiptPoller";
import { getAccountById } from "../accountStorage";
import type { Account } from "../types";
import { lookupFunctionName } from "./displayMetadata";
import { handleTransactionFailure } from "./failure";

export interface GasOverrides {
  gasLimit: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
}

export type LocalSigningAccount = Extract<
  Account,
  { type: "privateKey" | "seedPhrase" }
>;

/**
 * Prepares, signs once, and broadcasts one pinned local-account transaction.
 * The callback passed to localSigner is the final pre-RPC authority boundary.
 */
export async function processLocalTransactionInBackground(
  txId: string,
  pending: PendingTxRequest,
  account: LocalSigningAccount,
  privateKey: `0x${string}`,
  functionName?: string,
  gasOverrides?: GasOverrides,
  effectLease?: PendingRequestEffectLease,
  expectedDelegatedAuthorityAuthEpoch?: string,
): Promise<void> {
  const abortController = new AbortController();
  activeAbortControllers.set(txId, abortController);
  const effectGuard = guardPendingRequestEffectLease(effectLease);

  try {
    const txForHistory = gasOverrides
      ? {
          ...pending.tx,
          gas: gasOverrides.gasLimit,
          maxFeePerGas: gasOverrides.maxFeePerGas,
          maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
          gasPrice: undefined,
        }
      : pending.tx;

    await addTxToHistory({
      id: txId,
      status: "processing",
      tx: txForHistory,
      origin: pending.origin,
      favicon: pending.favicon,
      chainName: pending.chainName,
      chainId: pending.tx.chainId,
      createdAt: pending.timestamp,
      accountType: account.type,
      functionName,
      parentBundleId: pending.parentBundleId,
      bundleIndex: pending.bundleIndex,
      delegation7702Meta: pending.delegation7702Meta,
      erc7715PermissionRevokeMeta: pending.erc7715PermissionRevokeMeta,
      accountId: pending.accountId,
    });

    if (!functionName && pending.tx.data && pending.tx.data !== "0x") {
      void lookupFunctionName(pending.tx.data).then((name) => {
        if (name) void updateTxInHistory(txId, { functionName: name });
      });
    }
    void attachClearSignedMetaToHistory(
      txId,
      { ...pending.tx, to: pending.tx.to ?? undefined },
      pending.tx.chainId,
    );

    const resolvedChain = await getStoredResolvedChainById(pending.tx.chainId);
    const rpcUrl = resolvedChain?.rpcUrl;
    const customChainMeta = resolvedChain?.isCustom
      ? {
          name: resolvedChain.name,
          nativeCurrency: resolvedChain.nativeCurrency,
          explorer: resolvedChain.explorer || undefined,
        }
      : undefined;
    const nonce = await getNextNonce(pending.tx.from, pending.tx.chainId);
    const baseTx = gasOverrides
      ? {
          ...pending.tx,
          data: pending.tx.data ?? "0x",
          value: pending.tx.value ?? "0x0",
          nonce,
          gas: gasOverrides.gasLimit,
          maxFeePerGas: gasOverrides.maxFeePerGas,
          maxPriorityFeePerGas: gasOverrides.maxPriorityFeePerGas,
          gasPrice: undefined,
        }
      : {
          ...pending.tx,
          data: pending.tx.data ?? "0x",
          value: pending.tx.value ?? "0x0",
          nonce,
        };

    const meta = pending.delegation7702Meta;
    if (expectedDelegatedAuthorityAuthEpoch) {
      assertDelegatedAuthorityMasterAuthorization(
        expectedDelegatedAuthorityAuthEpoch,
      );
    }
    const bumpedGasHex = `0x${bumpGasForEip7702Auth(
      pending.tx.chainId,
      baseTx.gas ? BigInt(baseTx.gas) : 0n,
      1,
    ).toString(16)}` as `0x${string}`;
    const txForSigning = meta
      ? {
          ...baseTx,
          gas: bumpedGasHex,
          type: "eip7702" as const,
          authorizationList: [
            await signEip7702Authorization(privateKey, {
              contractAddress: meta.targetDelegate,
              chainId: pending.tx.chainId,
              nonce: nonce + 1,
              rpcUrl,
              customChainMeta,
            }),
          ],
        }
      : baseTx;

    const authorization =
      await enforcePendingRequestAuthorizationAtConfirmation(
        "transaction",
        pending,
      );
    if (!authorization.authorized) throw new Error(authorization.error);

    const result = await signAndBroadcastTransaction(
      privateKey,
      txForSigning,
      rpcUrl,
      customChainMeta,
      async () => {
        const latestAccount = await getAccountById(account.id);
        if (
          !latestAccount ||
          latestAccount.type !== account.type ||
          latestAccount.address.toLowerCase() !== account.address.toLowerCase()
        ) {
          throw new Error("Pending request account is no longer available");
        }
        const finalAuthorization =
          await enforcePendingRequestAuthorizationAtConfirmation(
            "transaction",
            pending,
          );
        if (!finalAuthorization.authorized) {
          throw new Error(finalAuthorization.error);
        }
        if (expectedDelegatedAuthorityAuthEpoch) {
          assertDelegatedAuthorityMasterAuthorization(
            expectedDelegatedAuthorityAuthEpoch,
          );
        }
        effectGuard.beginEffect();
      },
    );
    effectGuard.settleEffect();

    const txHash = result.txHash;
    if (txHash && result.receipt) {
      await applyReceiptToHistory(
        txId,
        txHash,
        pending.tx.chainId,
        result.receipt,
        { rpcUrl, signedGasLimit: result.signedGasLimit },
      );
    } else {
      await updateTxInHistory(txId, {
        status: "pending",
        txHash,
        broadcastUncertain: result.broadcastUncertain === true,
      });
      if (txHash) startReceiptPolling(txId, txHash, pending.tx.chainId);
    }
    await writeResultToStorage(`txResult:${txId}`, { success: true, txHash });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    resetNonce(pending.tx.from, pending.tx.chainId);
    await handleTransactionFailure(txId, pending, errorMessage);
  } finally {
    effectGuard.releaseIfSafe();
    activeAbortControllers.delete(txId);
    processingTxIds.delete(txId);
  }
}
