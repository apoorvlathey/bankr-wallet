import { getActiveAccount } from "../accountStorage";
import type { TransactionParams } from "../bankrApi";
import { savePendingTxRequest } from "../pendingTxStorage";
import { pinnedTxRequest } from "../pinnedRequest";
import { getRpcUrl } from "./rpcConfig";

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
