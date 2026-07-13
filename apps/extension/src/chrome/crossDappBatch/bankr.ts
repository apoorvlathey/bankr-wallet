import { getAccountById } from "../accountStorage";
import {
  submitTransactionDirect,
  type TransactionParams,
} from "../bankr/submission";
import {
  beginPendingRequestEffectLease,
  guardPendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import { getBankrApiKeyForConfirmation } from "../transactions/bankrSession";
import { enforceCrossDappBatchAuthorizationAtConfirmation } from "./lifecycle";
import type { CrossDappBatch } from "./storage";
import type { CrossDappBatchShipResult } from "./types";

/** Submit one cross-dapp ERC-7821 transaction through the pinned Bankr signer. */
export async function shipCrossDappBatchBankr(
  batch: CrossDappBatch,
  tx: TransactionParams,
  password: string,
): Promise<CrossDappBatchShipResult> {
  const apiKey = await getBankrApiKeyForConfirmation(password);
  // Authentication failure happens before prompt consumption/effect leasing;
  // keep the staged batch and every source promise retryable.
  if (!apiKey) return { kind: "retryable", error: "Invalid password" };

  const authorization =
    await enforceCrossDappBatchAuthorizationAtConfirmation(batch);
  if (!authorization.authorized) {
    return { kind: "authorization", error: authorization.error };
  }
  const commit = authorization.commit();
  if (!commit.authorized) {
    await commit.terminalize();
    return { kind: "authorization", error: commit.error };
  }
  const effectLease = beginPendingRequestEffectLease(
    "crossDappBatch",
    "active",
  );
  if (!effectLease) {
    return { kind: "error", error: "Wallet reset is in progress" };
  }
  const effectGuard = guardPendingRequestEffectLease(effectLease);

  try {
    const result = await submitTransactionDirect(
      apiKey,
      tx,
      undefined,
      async () => {
        const latestAccount = batch.accountId
          ? await getAccountById(batch.accountId)
          : null;
        if (
          !latestAccount ||
          latestAccount.type !== "bankr" ||
          latestAccount.address.toLowerCase() !==
            batch.fromAddress.toLowerCase()
        ) {
          throw new Error("Pending batch is no longer valid");
        }
        const finalAuthorization =
          await enforceCrossDappBatchAuthorizationAtConfirmation(batch);
        if (!finalAuthorization.authorized) {
          throw new Error(finalAuthorization.error);
        }
        const finalCommit = finalAuthorization.commit();
        if (!finalCommit.authorized) {
          await finalCommit.terminalize();
          throw new Error(finalCommit.error);
        }
        effectGuard.beginEffect();
      },
    );
    effectGuard.settleEffect();
    const txHash = result.transactionHash;
    if (result.status === "reverted") {
      return { kind: "reverted", txHash, error: "Transaction reverted" };
    }
    return result.status === "success" && txHash
      ? { kind: "ok", txHash, status: "success" }
      : { kind: "ok", txHash, status: "pending" };
  } catch (error) {
    return {
      kind: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    effectGuard.releaseIfSafe();
  }
}
