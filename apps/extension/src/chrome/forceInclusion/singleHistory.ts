import type { ForceInclusionChainInfo } from "@/constants/chainRegistry";
import { attachClearSignedMetaToHistory } from "../clearSignedMetaSnapshot";
import type { PendingTxRequest } from "../requests/pendingTxStorage";
import { addTxToHistory } from "../txHistoryStorage";
import { writeForceInclusionProgress } from "./l1Client";
import type {
  ForceInclusionAccount,
  ForceInclusionProgressWriter,
} from "./types";

export function createSingleProgressWriter(
  txId: string,
  info: ForceInclusionChainInfo,
  l2ChainId: number,
): ForceInclusionProgressWriter {
  return (stage, extra) =>
    writeForceInclusionProgress(txId, {
      stage,
      l1ChainId: info.l1ChainId,
      l2ChainId,
      timestamp: Date.now(),
      ...extra,
    });
}

export async function initializeSingleForceInclusionHistory(
  txId: string,
  pending: PendingTxRequest,
  info: ForceInclusionChainInfo,
  account?: ForceInclusionAccount,
): Promise<void> {
  await addTxToHistory({
    id: txId,
    status: "processing",
    tx: pending.tx,
    origin: pending.origin,
    favicon: pending.favicon,
    chainName: pending.chainName,
    chainId: pending.tx.chainId,
    createdAt: pending.timestamp,
    accountType: account
      ? (account.type as "privateKey" | "seedPhrase")
      : "bankr",
    accountId: account?.id,
    functionName: "Force Inclusion (L1 Deposit)",
    forceInclusionMeta: {
      l1TxHash: "",
      l1ChainId: info.l1ChainId,
      l2ChainId: pending.tx.chainId,
      l2Confirmed: false,
      protocol: info.protocol,
    },
  });
  attachClearSignedMetaToHistory(
    txId,
    { ...pending.tx, to: pending.tx.to ?? undefined },
    pending.tx.chainId,
  );
}
