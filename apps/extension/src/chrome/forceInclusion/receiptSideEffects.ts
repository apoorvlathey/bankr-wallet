import { getRpcUrl } from "../transactions/rpcConfig";
import { getTxById, updateTxInHistory } from "../txHistoryStorage";
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
  await syncDelegationMirrorFromChain(txId, chainId, rpcUrl);
  if (succeeded) await markErc7715PermissionRevokedFromReceipt(txId);
}

async function markOriginalReplacementDropped(txId: string): Promise<void> {
  let replacementTx = await getTxById(txId);
  while (replacementTx?.replacement) {
    const replacement = replacementTx.replacement;
    const original = await getTxById(replacement.originalTxId);
    if (!original || original.txHash !== replacement.originalTxHash) return;
    if (original.status === "pending" || original.status === "processing") {
      await updateTxInHistory(original.id, {
        status: "dropped",
        error: "Transaction replaced by a mined transaction",
        completedAt: Date.now(),
      });
    } else if (original.status !== "dropped") {
      return;
    }
    replacementTx = original;
  }
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

async function markErc7715PermissionRevokedFromReceipt(
  txId: string,
): Promise<void> {
  try {
    const tx = await getTxById(txId);
    const grantId = tx?.erc7715PermissionRevokeMeta?.grantId;
    const accountId = tx?.accountId;
    if (!grantId || !accountId) return;
    const { revokeErc7715PermissionGrant } = await import(
      "../pendingErc7715PermissionStorage"
    );
    await revokeErc7715PermissionGrant({ grantId, accountId });
  } catch (error) {
    console.warn("[receipt] ERC-7715 grant local revoke sync failed", error);
  }
}

async function syncDelegationMirrorFromChain(
  txId: string,
  chainId: number,
  rpcUrlOverride?: string,
): Promise<void> {
  try {
    const tx = await getTxById(txId);
    const accountId = tx?.accountId;
    const accountAddress = tx?.tx?.from;
    if (!tx?.delegation7702Meta || !accountId || !accountAddress) return;
    const rpcUrl = rpcUrlOverride ?? (await getRpcUrl(chainId));
    if (!rpcUrl) return;
    const [resolution, storage, registry] = await Promise.all([
      import("../../utils/delegationResolution"),
      import("../delegationStorage"),
      import("../../constants/chainRegistry"),
    ]);
    const read = await resolution.readOnchainDelegate(
      rpcUrl,
      chainId,
      accountAddress as `0x${string}`,
    );
    if (!read.ok) return;
    if (
      !read.delegate ||
      read.delegate.toLowerCase() ===
        registry.EIP_7702_DEFAULT_DELEGATE.toLowerCase()
    ) {
      await storage.removeCustomDelegate(accountId, chainId);
      return;
    }
    await storage.setCustomDelegate(accountId, chainId, read.delegate);
  } catch (error) {
    console.warn("[receipt] 7702 delegation mirror sync failed", error);
  }
}
