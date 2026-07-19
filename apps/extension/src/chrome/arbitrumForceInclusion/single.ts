import {
  createWalletClient,
  keccak256,
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
import { showNotification } from "../transactions/notification";
import { writeResultToStorage } from "../transactions/runtime";
import { updateTxInHistory, type ForceInclusionMeta } from "../txHistoryStorage";
import { buildForceInclusionL1GasData } from "../forceInclusion/l1GasData";
import {
  createL1PublicClient,
  getL1Chain,
  getL1RpcUrl,
  L1_RECEIPT_TIMEOUT,
  L1_RPC_TIMEOUT,
} from "../forceInclusion/l1Client";
import {
  createSingleProgressWriter,
  initializeSingleForceInclusionHistory,
} from "../forceInclusion/singleHistory";
import { writeSingleForceInclusionFailure } from "../forceInclusion/singleOutcome";
import type {
  ForceInclusionAccount,
  ForceInclusionGasOverrides,
} from "../forceInclusion/types";
import { startReceiptPolling } from "../forceInclusion/receiptPoller";
import {
  ARBITRUM_INBOX_ABI,
  ARBITRUM_SEQUENCER_INBOX_ABI,
  decodeDeliveredMessage,
  encodeDelayedMessage,
} from "./contracts";
import {
  assertDelayedMessageSize,
  prepareSignedArbitrumMessage,
} from "./preparation";

export async function processArbitrumForceInclusionLocal(
  txId: string,
  pending: PendingTxRequest,
  account: ForceInclusionAccount,
  privateKey: `0x${string}`,
  gasOverrides?: ForceInclusionGasOverrides,
  effectLease?: PendingRequestEffectLease,
): Promise<void> {
  const info = FORCE_INCLUSION_CHAINS.get(pending.tx.chainId);
  if (info?.protocol !== "arbitrum" || !info.arbitrumContracts) {
    await writeSingleForceInclusionFailure(txId, "Chain does not support Arbitrum delayed inclusion");
    effectLease?.release();
    return;
  }
  const contracts = info.arbitrumContracts;
  const progress = createSingleProgressWriter(txId, info, pending.tx.chainId);
  const effectGuard = guardPendingRequestEffectLease(effectLease);
  try {
    await initializeSingleForceInclusionHistory(txId, pending, info, account);
    await progress("building");
    const { messageData, childHash } = await prepareSignedArbitrumMessage(
      pending.tx,
      info,
      privateKey,
    );
    const l1RpcUrl = await getL1RpcUrl(info.l1ChainId);
    const l1Client = createL1PublicClient(l1RpcUrl);
    const maxDataSize = await l1Client.readContract({
      address: contracts.inbox,
      abi: ARBITRUM_INBOX_ABI,
      functionName: "maxDataSize",
    });
    assertDelayedMessageSize(messageData, maxDataSize);
    const baseMeta: ForceInclusionMeta = {
      protocol: "arbitrum",
      l1TxHash: "",
      l1ChainId: info.l1ChainId,
      l2ChainId: pending.tx.chainId,
      l2TxHash: childHash,
      l2Confirmed: false,
      ...contracts,
    };
    await updateTxInHistory(txId, {
      functionName: "Force Inclusion (L1 Deposit)",
      forceInclusionMeta: baseMeta,
    });

    await progress("submitting", { l2Hash: childHash });
    const l1Chain = getL1Chain(info.l1ChainId);
    const viemAccount = privateKeyToAccount(privateKey);
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
        to: contracts.inbox,
        data: encodeDelayedMessage(messageData),
        value: 0n,
        ...(gasOverrides ? {
          gas: BigInt(gasOverrides.gasLimit),
          maxFeePerGas: BigInt(gasOverrides.maxFeePerGas),
          maxPriorityFeePerGas: BigInt(gasOverrides.maxPriorityFeePerGas),
        } : {}),
      },
      {
        chainId: info.l1ChainId,
        supportsSyncSend: false,
        beforeBroadcast: async () => {
          const { getAccountById } = await import("../accountStorage");
          const latest = await getAccountById(account.id);
          if (!latest || latest.type !== account.type || latest.address.toLowerCase() !== account.address.toLowerCase()) {
            throw new Error("Pending request account is no longer available");
          }
          const finalAuthorization = await enforcePendingRequestAuthorizationAtConfirmation(
            "transaction",
            pending,
          );
          if (!finalAuthorization.authorized) throw new Error(finalAuthorization.error);
          effectGuard.beginEffect();
        },
      },
    );
    const l1Hash = broadcast.txHash;
    const submittedMeta = { ...baseMeta, l1TxHash: l1Hash };
    await updateTxInHistory(txId, {
      status: "pending",
      txHash: childHash,
      broadcastUncertain: broadcast.broadcastUncertain === true,
      forceInclusionMeta: submittedMeta,
    });
    effectGuard.settleEffect();
    effectGuard.releaseIfSafe();
    await progress("waiting-l1", { l1Hash, l2Hash: childHash });

    let receipt: TransactionReceipt;
    try {
      receipt = await l1Client.waitForTransactionReceipt({
        hash: l1Hash as Hash,
        timeout: L1_RECEIPT_TIMEOUT,
      });
    } catch (error) {
      await writeResultToStorage(`txResult:${txId}`, { success: true, txHash: childHash });
      return;
    }
    if (receipt.status === "reverted") {
      await updateTxInHistory(txId, { txHash: l1Hash });
      await writeSingleForceInclusionFailure(txId, "L1 delayed-inbox transaction reverted onchain");
      return;
    }
    try {
      const delivered = decodeDeliveredMessage(receipt, contracts.bridge, contracts.inbox);
      if (
        delivered.kind !== 3 ||
        delivered.sender.toLowerCase() !== viemAccount.address.toLowerCase() ||
        delivered.messageDataHash.toLowerCase() !== keccak256(messageData).toLowerCase()
      ) {
        throw new Error("Arbitrum delayed-message receipt did not match the submitted payload");
      }
      const deadline = await l1Client.readContract({
        address: contracts.sequencerInbox,
        abi: ARBITRUM_SEQUENCER_INBOX_ABI,
        functionName: "forceInclusionDeadline",
        args: [receipt.blockNumber],
      });
      const completedMeta: ForceInclusionMeta = {
        ...submittedMeta,
        messageIndex: delivered.messageIndex.toString(),
        messageBlockNumber: receipt.blockNumber.toString(),
        messageBlockHash: receipt.blockHash,
        messageTimestamp: delivered.timestamp.toString(),
        kind: delivered.kind,
        sender: delivered.sender,
        baseFeeL1: delivered.baseFeeL1.toString(),
        messageDataHash: delivered.messageDataHash,
        forceDeadlineBlock: deadline.toString(),
      };
      await updateTxInHistory(txId, {
        status: "pending",
        txHash: childHash,
        broadcastUncertain: false,
        gasData: buildForceInclusionL1GasData(receipt, info.l1ChainId),
        forceInclusionMeta: completedMeta,
      });
    } catch (error) {
      console.warn("[Arbitrum Force Inclusion] L1 receipt needs recovery", error);
      await updateTxInHistory(txId, {
        status: "pending",
        txHash: childHash,
        broadcastUncertain: false,
        gasData: buildForceInclusionL1GasData(receipt, info.l1ChainId),
      });
    }
    await progress("complete", { l1Hash, l2Hash: childHash });
    await showNotification(
      `tx-success-${txId}`,
      "L1 Deposit Confirmed",
      `Deposit confirmed on ${info.l1ChainName}. Awaiting L2 sequencer inclusion (~1-10 min).`,
    );
    await writeResultToStorage(`txResult:${txId}`, { success: true, txHash: childHash });
    startReceiptPolling(txId, childHash, pending.tx.chainId);
  } catch (error: any) {
    effectGuard.releaseIfSafe();
    const message = error?.shortMessage || error?.message || "Force inclusion failed";
    await progress("error", { error: message });
    await writeSingleForceInclusionFailure(txId, message);
  }
}
