import { getActiveAccount } from "../accountStorage";
import { createSponsoredTransferAuthorization } from "./authorization";
import {
  findSponsoredTransferIntent,
  getSponsoredTransferIntentsForAddress,
  saveSponsoredTransferIntent,
  updateSponsoredTransferIntent,
  withSponsoredTransferOperation,
  type SponsoredTransferIntentRecord,
  type SponsoredTransferRelayPayload,
} from "./intentStorage";
import { ensureSponsoredTransferHistory, updateTxInHistory } from "./history";
import { reconcileSponsoredTransferRecord } from "./recovery";
import { submitSponsoredTransfer } from "./submission";
import type { SponsoredTransferHandlerResult } from "./types";
import { validateSponsoredTransferIntent } from "./validation";
import { ensureSponsoredVaultKey } from "./vaultAccess";

export async function handleSponsoredTransfer(message: {
  to: string;
  amount: string;
  decimals: number;
  fromAddress: string;
  intentId?: string;
}): Promise<SponsoredTransferHandlerResult> {
  return withSponsoredTransferOperation(async () => {
    const { to, amount, decimals, fromAddress } = message;
    const account = await getActiveAccount();
    if (!account) return { success: false, error: "No account found" };
    if (account.type === "impersonator") {
      return {
        success: false,
        error: "View-only accounts cannot send transactions",
      };
    }
    if (account.type === "ledger" || account.type === "safe") {
      return {
        success: false,
        error: "Sponsored transfers are not supported for this account type",
      };
    }
    const intent = validateSponsoredTransferIntent(account.address, {
      fromAddress,
      to,
      amount,
      decimals,
    });
    if (!intent.valid) return { success: false, error: intent.error };

    const intentId =
      typeof message.intentId === "string" &&
      /^[A-Za-z0-9_-]{1,128}$/.test(message.intentId)
        ? message.intentId
        : crypto.randomUUID();

    let record: SponsoredTransferIntentRecord | null;
    try {
      record = await findSponsoredTransferIntent({
        id: intentId,
        accountId: account.id,
        accountAddress: account.address,
        to: intent.to,
        value: intent.value.toString(),
      });
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Sponsored transfer intent is invalid",
        outcomeUncertain: true,
      };
    }

    if (!record) {
      const prior = await resolvePriorSponsoredTransfers(account.address);
      if (prior) return prior;
    }
    if (record?.state === "submitted" || record?.state === "consumed") {
      return { success: true, txId: record.txId, intentId: record.id };
    }

    let payload: SponsoredTransferRelayPayload;
    if (record) {
      const vaultKey = await ensureSponsoredVaultKey();
      if (!vaultKey) return { success: false, error: "Wallet must be unlocked" };
      const reconciled = await reconcileSponsoredTransferRecord(record, vaultKey);
      payload = reconciled.payload;
      if (reconciled.status === "consumed") {
        return { success: true, txId: record.txId, intentId: record.id };
      }
      if (reconciled.status === "expired-unused") {
        record = null;
      } else if (record.state !== "prepared") {
        return markExistingTransferAmbiguous(record);
      }
    }

    if (!record) {
      const authorization = await createSponsoredTransferAuthorization({
        account,
        intent,
        intentId,
        amount,
      });
      if (!authorization.success) return authorization;
      record = authorization.record;
      payload = authorization.payload;
      await saveSponsoredTransferIntent(record);
    }

    return submitSponsoredTransfer(account, record, payload!);
  });
}

async function resolvePriorSponsoredTransfers(
  accountAddress: string,
): Promise<SponsoredTransferHandlerResult | null> {
  try {
    const records = await getSponsoredTransferIntentsForAddress(accountAddress);
    if (records.length === 0) return null;
    const vaultKey = await ensureSponsoredVaultKey();
    if (!vaultKey) {
      return {
        success: false,
        error: "Wallet must be unlocked",
        outcomeUncertain: true,
      };
    }
    let completedTxId: string | undefined;
    let completedIntentId: string | undefined;
    let unresolved = false;
    for (const record of records) {
      if (record.state === "submitted" || record.state === "consumed") {
        completedTxId = record.txId;
        completedIntentId = record.id;
        continue;
      }
      const result = await reconcileSponsoredTransferRecord(record, vaultKey);
      if (result.status === "consumed") {
        completedTxId = record.txId;
        completedIntentId = record.id;
      }
      if (result.status === "unresolved") unresolved = true;
    }
    if (completedTxId && !unresolved) {
      return {
        success: true,
        txId: completedTxId,
        intentId: completedIntentId,
      };
    }
    if (!unresolved) {
      return {
        success: false,
        error:
          "The previous sponsored transfer safely expired. Review and press Send again.",
        retryReady: true,
      };
    }
    return {
      success: false,
      error: "Check the existing sponsored transfer before sending another one.",
      outcomeUncertain: true,
    };
  } catch {
    return {
      success: false,
      error: "Sponsored transfer recovery state is invalid",
      outcomeUncertain: true,
    };
  }
}

async function markExistingTransferAmbiguous(
  record: SponsoredTransferIntentRecord,
): Promise<SponsoredTransferHandlerResult> {
  const error =
    "Transfer outcome is still unknown. Check again before sending another transfer.";
  await ensureSponsoredTransferHistory(record);
  await updateSponsoredTransferIntent(record.id, {
    state: "ambiguous",
    attempts: record.attempts,
    lastError: error,
  });
  await updateTxInHistory(record.txId, {
    status: "pending",
    error,
    broadcastUncertain: true,
  });
  return {
    success: false,
    txId: record.txId,
    intentId: record.id,
    error,
    outcomeUncertain: true,
  };
}
