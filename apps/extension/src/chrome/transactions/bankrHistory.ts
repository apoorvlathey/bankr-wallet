import { attachClearSignedMetaToHistory } from "../clearSignedMetaSnapshot";
import type { PendingTxRequest } from "../requests/pendingTxStorage";
import { addTxToHistory, updateTxInHistory } from "../txHistoryStorage";
import { lookupFunctionName } from "./displayMetadata";

export async function initializeBankrTransactionHistory(
  txId: string,
  pending: PendingTxRequest,
  functionName?: string,
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
    accountType: "bankr",
    functionName,
    accountId: pending.accountId,
    privacyRagequitMeta: pending.privacyRagequitMeta ? { version: 1 } : undefined,
    privacyUnshieldMeta: pending.privacyUnshieldMeta ? { version: 1 } : undefined,
  });
  if (!functionName && pending.tx.data && pending.tx.data !== "0x") {
    lookupFunctionName(pending.tx.data).then((name) => {
      if (name) updateTxInHistory(txId, { functionName: name });
    });
  }
  attachClearSignedMetaToHistory(
    txId,
    { ...pending.tx, to: pending.tx.to ?? undefined },
    pending.tx.chainId,
  );
}
