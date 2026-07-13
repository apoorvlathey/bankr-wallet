import { getL2TransactionHashes } from "viem/op-stack";
import type { TransactionReceipt } from "viem";
import type { ForceInclusionChainInfo } from "@/constants/chainRegistry";
import { showNotification } from "../transactions/notification";
import { writeResultToStorage } from "../transactions/runtime";
import type { PendingTxRequest } from "../requests/pendingTxStorage";
import { updateTxInHistory } from "../txHistoryStorage";
import type { ForceInclusionProgressWriter } from "./types";

export function extractL2Hash(receipt: TransactionReceipt): string | undefined {
  try {
    const [l2Hash] = getL2TransactionHashes(receipt);
    return l2Hash;
  } catch {
    return undefined;
  }
}

export async function finishSingleForceInclusion(
  txId: string,
  pending: PendingTxRequest,
  info: ForceInclusionChainInfo,
  l1Hash: string,
  l2Hash: string | undefined,
  progress: ForceInclusionProgressWriter,
): Promise<void> {
  const resultHash = l2Hash || l1Hash;
  await progress("complete", { l1Hash, l2Hash });
  await updateTxInHistory(txId, {
    status: "pending",
    txHash: resultHash,
    broadcastUncertain: false,
    forceInclusionMeta: {
      l1TxHash: l1Hash,
      l1ChainId: info.l1ChainId,
      l2ChainId: pending.tx.chainId,
      l2Confirmed: false,
    },
  });

  const { CHAIN_CONFIG } = await import("@/constants/chainConfig");
  const explorer = CHAIN_CONFIG[info.l1ChainId]?.explorer;
  if (explorer) {
    await chrome.storage.local.set({
      [`notification-tx-success-${txId}`]: `${explorer}/tx/${l1Hash}`,
    });
  }
  await showNotification(
    `tx-success-${txId}`,
    "L1 Deposit Confirmed",
    `Deposit confirmed on ${info.l1ChainName}. Awaiting L2 sequencer inclusion (~1-10 min).`,
  );
  await writeResultToStorage(`txResult:${txId}`, {
    success: true,
    txHash: resultHash,
  });
}

export async function retainPendingSingleBroadcast(
  txId: string,
  pending: PendingTxRequest,
  info: ForceInclusionChainInfo,
  l1Hash: string,
  broadcastUncertain: boolean,
  progress: ForceInclusionProgressWriter,
  error?: unknown,
): Promise<void> {
  await progress("waiting-l1", {
    l1Hash,
    error:
      error instanceof Error
        ? `L1 receipt pending: ${error.message}`
        : "L1 receipt pending",
  });
  await updateTxInHistory(txId, {
    status: "pending",
    txHash: l1Hash,
    broadcastUncertain,
    forceInclusionMeta: {
      l1TxHash: l1Hash,
      l1ChainId: info.l1ChainId,
      l2ChainId: pending.tx.chainId,
      l2Confirmed: false,
    },
  });
  await writeResultToStorage(`txResult:${txId}`, {
    success: true,
    txHash: l1Hash,
  });
}

export async function writeSingleForceInclusionFailure(
  txId: string,
  error: string,
): Promise<void> {
  await updateTxInHistory(txId, {
    status: "failed",
    broadcastUncertain: false,
    error,
    completedAt: Date.now(),
  });
  await showNotification(
    `tx-failed-${txId}`,
    "Force Inclusion Failed",
    error.length > 100 ? `${error.substring(0, 100)}...` : error,
  );
  await writeResultToStorage(`txResult:${txId}`, { success: false, error });
}
