import type { Hash } from "viem";
import { FORCE_INCLUSION_CHAINS } from "@/constants/chainRegistry";
import { submitTransactionDirect } from "../bankr/client";
import { authorizePendingBankrSubmit } from "../bankr/pendingAuthorization";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import {
  guardPendingRequestEffectLease,
  type PendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import type { PendingTxRequest } from "../requests/pendingTxStorage";
import { updateTxInHistory } from "../txHistoryStorage";
import { buildL1DepositTxParams } from "./deposit";
import {
  createL1PublicClient,
  getL1RpcUrl,
  L1_RECEIPT_TIMEOUT,
} from "./l1Client";
import {
  createSingleProgressWriter,
  initializeSingleForceInclusionHistory,
} from "./singleHistory";
import {
  extractL2Hash,
  finishSingleForceInclusion,
  writeSingleForceInclusionFailure,
} from "./singleOutcome";

export async function processForceInclusionBankr(
  txId: string,
  pending: PendingTxRequest,
  apiKey: string,
  effectLease?: PendingRequestEffectLease,
): Promise<void> {
  const info = FORCE_INCLUSION_CHAINS.get(pending.tx.chainId);
  if (!info) {
    await writeSingleForceInclusionFailure(
      txId,
      "Chain does not support force inclusion",
    );
    effectLease?.release();
    return;
  }
  const effectGuard = guardPendingRequestEffectLease(effectLease);
  const progress = createSingleProgressWriter(txId, info, pending.tx.chainId);

  try {
    await initializeSingleForceInclusionHistory(txId, pending, info);
    await progress("building");
    const l1TxParams = await buildL1DepositTxParams(pending.tx, info);

    await progress("submitting");
    const authorization = await enforcePendingRequestAuthorizationAtConfirmation(
      "transaction",
      pending,
    );
    if (!authorization.authorized) throw new Error(authorization.error);
    const result = await submitTransactionDirect(
      apiKey,
      l1TxParams,
      undefined,
      () =>
        authorizePendingBankrSubmit(
          "transaction",
          pending,
          effectGuard.beginEffect,
        ),
    );
    effectGuard.settleEffect();
    effectGuard.releaseIfSafe();
    const l1Hash = result.transactionHash;
    if (result.status === "reverted") {
      await progress("error", { error: "L1 deposit transaction reverted" });
      await writeSingleForceInclusionFailure(
        txId,
        "L1 deposit transaction reverted",
      );
      return;
    }

    await updateTxInHistory(txId, {
      forceInclusionMeta: {
        l1TxHash: l1Hash,
        l1ChainId: info.l1ChainId,
        l2ChainId: pending.tx.chainId,
        l2Confirmed: false,
      },
    });
    await progress("waiting-l1", { l1Hash });
    const client = createL1PublicClient(await getL1RpcUrl(info.l1ChainId));
    const receipt = await client.waitForTransactionReceipt({
      hash: l1Hash as Hash,
      timeout: L1_RECEIPT_TIMEOUT,
    });
    if (receipt.status === "reverted") {
      await progress("error", {
        error: "L1 deposit transaction reverted onchain",
      });
      await writeSingleForceInclusionFailure(
        txId,
        "L1 deposit transaction reverted onchain",
      );
      return;
    }
    await finishSingleForceInclusion(
      txId,
      pending,
      info,
      l1Hash,
      extractL2Hash(receipt),
      receipt,
      progress,
    );
  } catch (error: any) {
    effectGuard.releaseIfSafe();
    const message =
      error?.shortMessage || error?.message || "Force inclusion failed";
    await progress("error", { error: message });
    await writeSingleForceInclusionFailure(txId, message);
  }
}
