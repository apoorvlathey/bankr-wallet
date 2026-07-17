import {
  createPublicClient,
  createWalletClient,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FORCE_INCLUSION_CHAINS } from "@/constants/chainRegistry";
import { prepareSignAndBroadcastTransaction } from "../localSigner";
import { secureHttpTransport } from "../network/rpcClient";
import { enforcePendingRequestAuthorizationAtConfirmation } from "../requests/pendingRequestLifecycle";
import {
  guardPendingRequestEffectLease,
  type PendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import type { PendingTxRequest } from "../requests/pendingTxStorage";
import { getRpcUrl } from "../transactions/rpcConfig";
import { updateTxInHistory } from "../txHistoryStorage";
import { buildL1DepositTxParams, DEFAULT_L2_GAS } from "./deposit";
import {
  createL1PublicClient,
  getL1Chain,
  getL1RpcUrl,
  L1_RECEIPT_TIMEOUT,
  L1_RPC_TIMEOUT,
} from "./l1Client";
import {
  createSingleProgressWriter,
  initializeSingleForceInclusionHistory,
} from "./singleHistory";
import {
  extractL2Hash,
  finishSingleForceInclusion,
  retainPendingSingleBroadcast,
  writeSingleForceInclusionFailure,
} from "./singleOutcome";
import type {
  ForceInclusionAccount,
  ForceInclusionGasOverrides,
} from "./types";

export async function processForceInclusionLocal(
  txId: string,
  pending: PendingTxRequest,
  account: ForceInclusionAccount,
  privateKey: `0x${string}`,
  gasOverrides?: ForceInclusionGasOverrides,
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
    await initializeSingleForceInclusionHistory(txId, pending, info, account);
    await progress("building");
    const l2RpcUrl = await getRpcUrl(pending.tx.chainId);
    if (!l2RpcUrl) throw new Error("No RPC URL for L2 chain");
    const l2Client = createPublicClient({
      chain: info.viemChain,
      transport: secureHttpTransport(l2RpcUrl, { timeout: L1_RPC_TIMEOUT }),
    });
    const value =
      pending.tx.value && pending.tx.value !== "0x0"
        ? BigInt(pending.tx.value)
        : 0n;
    let l2Gas = DEFAULT_L2_GAS;
    try {
      const estimated = await l2Client.estimateGas({
        account: pending.tx.from as `0x${string}`,
        to: pending.tx.to as `0x${string}` | undefined,
        value,
        data: (pending.tx.data as `0x${string}`) || undefined,
      });
      l2Gas = (estimated * 120n) / 100n;
    } catch {
      // Preserve the conservative default when L2 estimation fails.
    }

    await progress("submitting");
    const l1RpcUrl = await getL1RpcUrl(info.l1ChainId);
    const l1Chain = getL1Chain(info.l1ChainId);
    const viemAccount = privateKeyToAccount(privateKey);
    const l1PublicClient = createL1PublicClient(l1RpcUrl);
    const l1TxParams = await buildL1DepositTxParams(pending.tx, info, l2Gas);
    const nonce = await l1PublicClient.getTransactionCount({
      address: viemAccount.address,
      blockTag: "pending",
    });
    const wallet = createWalletClient({
      account: viemAccount,
      chain: l1Chain,
      transport: secureHttpTransport(l1RpcUrl, { timeout: L1_RPC_TIMEOUT }),
    });

    const authorization = await enforcePendingRequestAuthorizationAtConfirmation(
      "transaction",
      pending,
    );
    if (!authorization.authorized) throw new Error(authorization.error);
    const broadcast = await prepareSignAndBroadcastTransaction(
      wallet,
      {
        account: viemAccount,
        chain: l1Chain,
        to: l1TxParams.to as `0x${string}`,
        data: l1TxParams.data as `0x${string}`,
        value:
          l1TxParams.value && l1TxParams.value !== "0x0"
            ? BigInt(l1TxParams.value)
            : 0n,
        nonce,
        ...(gasOverrides
          ? {
              gas: BigInt(gasOverrides.gasLimit),
              maxFeePerGas: BigInt(gasOverrides.maxFeePerGas),
              maxPriorityFeePerGas: BigInt(
                gasOverrides.maxPriorityFeePerGas,
              ),
            }
          : {}),
      },
      {
        chainId: info.l1ChainId,
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
              "transaction",
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
    await updateTxInHistory(txId, {
      status: "pending",
      txHash: l1Hash,
      broadcastUncertain: broadcast.broadcastUncertain === true,
      forceInclusionMeta: {
        l1TxHash: l1Hash,
        l1ChainId: info.l1ChainId,
        l2ChainId: pending.tx.chainId,
        l2Confirmed: false,
      },
    });
    effectGuard.settleEffect();
    effectGuard.releaseIfSafe();

    await progress("waiting-l1", { l1Hash });
    let receipt: TransactionReceipt;
    try {
      receipt = await l1PublicClient.waitForTransactionReceipt({
        hash: l1Hash as Hash,
        timeout: L1_RECEIPT_TIMEOUT,
      });
    } catch (error) {
      await retainPendingSingleBroadcast(
        txId,
        pending,
        info,
        l1Hash,
        broadcast.broadcastUncertain === true,
        progress,
        error,
      );
      return;
    }
    if (receipt.status === "reverted") {
      const error = "L1 deposit transaction reverted onchain";
      await progress("error", { error });
      await writeSingleForceInclusionFailure(txId, error);
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
