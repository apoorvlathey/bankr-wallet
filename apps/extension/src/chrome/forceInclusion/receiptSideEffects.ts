import { getTxById } from "../txHistoryStorage";
import {
  markErc7715PermissionRevokedFromReceipt,
  syncDelegationMirrorFromChain,
} from "./receiptAuthorityMirrors";
import { markOriginalReplacementDropped } from "./replacementReceiptMirror";
export async function applyReceiptStateMirrors(args: {
  txId: string;
  txHash: string;
  chainId: number;
  receipt: any;
  succeeded: boolean;
  rpcUrl?: string;
}): Promise<void> {
  const { txId, chainId, succeeded, rpcUrl } = args;
  await markOriginalReplacementDropped(txId).catch((error) => console.warn("[receipt] Replacement history sync failed", error));
  try {
    const { applyPrivacyShieldReceipt } = await import(
      "../privacy/operations/lifecycle"
    );
    await applyPrivacyShieldReceipt(args);
  } catch (error) {
    console.warn("[privacy-shield] receipt mirror failed", error);
  }
  try {
    const { applyPrivacyRagequitReceipt } = await import(
      "../privacy/ragequit/lifecycle"
    );
    await applyPrivacyRagequitReceipt(args);
  } catch (error) {
    console.warn("[privacy-ragequit] receipt mirror failed", error);
  }
  try {
    const { applyPrivacyUnshieldReceiptMirror } = await import(
      "../privacy/withdrawals/lifecycle"
    );
    await applyPrivacyUnshieldReceiptMirror(args);
  } catch (error) {
    console.warn("[privacy-unshield] receipt mirror failed", error);
  }
  await syncDelegationMirrorFromChain(txId, chainId, rpcUrl);
  if (succeeded) await markErc7715PermissionRevokedFromReceipt(txId);
}

export async function applyPostNotificationReceiptEffects(args: {
  txId: string;
  txHash: string;
  chainId: number;
  receipt: any;
  succeeded: boolean;
}): Promise<void> {
  const { txId, txHash, receipt, succeeded } = args;
  await maybeAdvanceSplitBundle(
    txId,
    txHash,
    succeeded ? "success" : "reverted",
    receipt,
  );
  if (succeeded) {
    try {
      const { maybeStartBridgePolling } = await import("../bridgeStatusPoller");
      await maybeStartBridgePolling(txId);
    } catch (error) {
      console.warn("[bridge] failed to start status polling", error);
    }
  }
}

export async function maybeAdvanceSplitBundle(
  txId: string,
  txHash: string | undefined,
  outcome: "success" | "reverted" | "dropped",
  receipt?: any,
): Promise<void> {
  const tx = await getTxById(txId);
  if (!tx?.parentBundleId || tx.bundleIndex === undefined) return;
  const { advanceSplitBundle } = await import("./splitBatchSequencer");
  await advanceSplitBundle({
    bundleId: tx.parentBundleId,
    bundleIndex: tx.bundleIndex,
    outcome,
    txHash,
    receipt,
  });
}
