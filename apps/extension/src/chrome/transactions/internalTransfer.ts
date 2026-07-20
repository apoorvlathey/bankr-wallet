import { getActiveAccount } from "../accountStorage";
import type { TransactionParams } from "../bankr/submission";
import { savePendingTxRequest } from "../requests/pendingTxStorage";
import { pinnedTxRequest } from "../requests/pinnedRequest";
import { getRpcUrl } from "./rpcConfig";
import { normalizeTransactionValue } from "../transactionValidation";
import { createReviewedSafeProposal } from "../safe/proposalLifecycle";
import { requireSafeFeature } from "../safe/featurePolicy";

/** Creates a pinned confirmation request for an extension-initiated transfer. */
export async function handleInitiateTransfer(message: {
  tx: TransactionParams;
  chainName: string;
  tokenName?: string;
  tokenLogo?: string | null;
}): Promise<{ success: boolean; txId?: string; error?: string }> {
  const { tx, chainName, tokenName, tokenLogo } = message;

  const configuredRpc = await getRpcUrl(tx.chainId);
  if (!configuredRpc) {
    return {
      success: false,
      error: `Chain ${tx.chainId} not configured. Add it in Settings → Chains.`,
    };
  }

  const activeAccount = await getActiveAccount();
  if (!activeAccount) {
    return { success: false, error: "No active account" };
  }
  if (activeAccount.type === "impersonator") {
    return {
      success: false,
      error: "View-only accounts cannot send transactions",
    };
  }
  if (activeAccount.type === "safe") {
    try {
      requireSafeFeature("sendProposal");
      const normalizedValue = normalizeTransactionValue(tx.value);
      if (!normalizedValue.ok) return { success: false, error: normalizedValue.error };
      if (!tx.to) return { success: false, error: "Safe contract creation is unsupported" };
      const proposal = await createReviewedSafeProposal({
        safeAccountId: activeAccount.id,
        chainId: tx.chainId,
        calls: [{
          to: tx.to as `0x${string}`,
          value: normalizedValue.value as `${bigint}`,
          data: (tx.data || "0x") as `0x${string}`,
          operation: 0,
        }],
        route: { kind: "wallet", origin: tokenName ? `Send ${tokenName}` : "WalletChan" },
      });
      chrome.runtime.sendMessage({ type: "newSafeProposalRequest", proposalId: proposal.id }).catch(() => {});
      return { success: true, txId: proposal.id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Could not create Safe proposal" };
    }
  }

  const txId = crypto.randomUUID();
  const pendingRequest = pinnedTxRequest(activeAccount, {
    id: txId,
    tx,
    origin: tokenName ? `Send ${tokenName}` : "WalletChan",
    favicon: tokenLogo ?? null,
    chainName,
    timestamp: Date.now(),
    trustedInternal: true,
  });

  await savePendingTxRequest(pendingRequest);
  chrome.runtime
    .sendMessage({ type: "newPendingTxRequest", txRequest: pendingRequest })
    .catch(() => {});

  return { success: true, txId };
}
