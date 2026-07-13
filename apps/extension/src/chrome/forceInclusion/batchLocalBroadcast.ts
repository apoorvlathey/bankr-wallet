import { createWalletClient } from "viem";
import { prepareSignAndBroadcastTransaction } from "../localSigner";
import { secureHttpTransport } from "../network/rpcClient";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import type { PendingRequestEffectGuard } from "../requests/pendingRequestResolution";
import type { PendingBatchTxRequest } from "../erc5792Types";
import { updateTxInHistory } from "../txHistoryStorage";
import { shouldHaltForceInclusionTail } from "./broadcastPolicy";
import type { PreparedLocalForceInclusionBatch } from "./batchLocalPreparation";
import type { ForceInclusionBroadcastResult } from "./batchTypes";
import { L1_RPC_TIMEOUT } from "./l1Client";
import type { ForceInclusionAccount } from "./types";

export async function broadcastLocalForceInclusionBatch(args: {
  pending: PendingBatchTxRequest;
  account: ForceInclusionAccount;
  prepared: PreparedLocalForceInclusionBatch;
  effectGuard: PendingRequestEffectGuard;
}): Promise<ForceInclusionBroadcastResult[]> {
  const { pending, account, prepared, effectGuard } = args;
  const wallet = createWalletClient({
    account: prepared.viemAccount,
    chain: prepared.l1Chain,
    transport: secureHttpTransport(prepared.l1RpcUrl, {
      timeout: L1_RPC_TIMEOUT,
    }),
  });
  const results: ForceInclusionBroadcastResult[] = [];

  for (let index = 0; index < prepared.deposits.length; index++) {
    const deposit = prepared.deposits[index];
    const value =
      deposit.l1TxParams.value && deposit.l1TxParams.value !== "0x0"
        ? BigInt(deposit.l1TxParams.value)
        : 0n;
    console.log(
      `[ForceInclusion] broadcasting L1 deposit ${index + 1}/${prepared.deposits.length}: txId=${deposit.txId} nonce=${deposit.nonce} gas=${prepared.l1GasLimits[index].toString()} value=${value.toString()}`,
    );
    try {
      const authorization =
        await enforcePendingRequestAuthorizationAtConfirmation(
          "batchTransaction",
          pending,
        );
      if (!authorization.authorized) throw new Error(authorization.error);
      const broadcast = await prepareSignAndBroadcastTransaction(
        wallet,
        {
          account: prepared.viemAccount,
          chain: prepared.l1Chain,
          to: deposit.l1TxParams.to as `0x${string}`,
          data: deposit.l1TxParams.data as `0x${string}`,
          value,
          nonce: deposit.nonce,
          gas: prepared.l1GasLimits[index],
          maxFeePerGas: prepared.l1Fees?.maxFeePerGas ?? undefined,
          maxPriorityFeePerGas:
            prepared.l1Fees?.maxPriorityFeePerGas ?? undefined,
        },
        {
          chainId: prepared.l1Chain.id,
          supportsSyncSend: false,
          beforeBroadcast: async () => {
            const { getAccountById } = await import("../accountStorage");
            const latest = await getAccountById(account.id);
            if (
              !latest ||
              latest.type !== account.type ||
              latest.address.toLowerCase() !== account.address.toLowerCase()
            ) {
              throw new Error("Pending request account is no longer available");
            }
            const finalAuthorization =
              await enforcePendingRequestAuthorizationAtConfirmation(
                "batchTransaction",
                pending,
              );
            if (!finalAuthorization.authorized) {
              throw new Error(finalAuthorization.error);
            }
            effectGuard.beginEffect();
          },
        },
      );
      const l1Hash = broadcast.txHash;
      console.log(
        `[ForceInclusion] L1 deposit ${index + 1}/${prepared.deposits.length} accepted by RPC: hash=${l1Hash}`,
      );
      await updateTxInHistory(deposit.txId, {
        status: "pending",
        txHash: l1Hash,
        broadcastUncertain: broadcast.broadcastUncertain === true,
        forceInclusionMeta: {
          l1TxHash: l1Hash,
          l1ChainId: prepared.l1Chain.id,
          l2ChainId: pending.chainId,
          l2Confirmed: false,
        },
      });
      effectGuard.settleEffect();
      const broadcastUncertain = shouldHaltForceInclusionTail(broadcast);
      results.push({
        txId: deposit.txId,
        success: true,
        l1TxHash: l1Hash,
        broadcastUncertain,
      });
      if (broadcastUncertain) {
        await skipTail(
          prepared,
          index,
          results,
          "Skipped — previous L1 deposit broadcast is still unconfirmed",
          "Skipped — previous L1 deposit broadcast is still unconfirmed",
        );
        break;
      }
    } catch (error: any) {
      effectGuard.releaseIfSafe();
      const message =
        error?.shortMessage || error?.message || "L1 broadcast failed";
      console.warn(
        `[ForceInclusion] L1 deposit ${index + 1}/${prepared.deposits.length} broadcast failed: ${message}`,
      );
      await updateTxInHistory(deposit.txId, {
        status: "failed",
        error: message,
        completedAt: Date.now(),
      });
      results.push({ txId: deposit.txId, success: false, error: message });
      await skipTail(
        prepared,
        index,
        results,
        `Skipped — earlier deposit (${index + 1}/${prepared.deposits.length}) failed`,
        "Skipped — earlier deposit failed",
      );
      break;
    }
  }
  return results;
}

async function skipTail(
  prepared: PreparedLocalForceInclusionBatch,
  failedIndex: number,
  results: ForceInclusionBroadcastResult[],
  historyError: string,
  resultError: string,
): Promise<void> {
  for (let index = failedIndex + 1; index < prepared.deposits.length; index++) {
    const deposit = prepared.deposits[index];
    await updateTxInHistory(deposit.txId, {
      status: "failed",
      error: historyError,
      completedAt: Date.now(),
    });
    results.push({
      txId: deposit.txId,
      success: false,
      error: resultError,
    });
  }
}
