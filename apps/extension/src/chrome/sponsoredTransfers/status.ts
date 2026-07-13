import { getActiveAccount } from "../accountStorage";
import {
  acknowledgeSponsoredTransferIntent,
  getSponsoredTransferIntentsForAddress,
  withSponsoredTransferOperation,
} from "./intentStorage";
import { reconcileSponsoredTransferRecord } from "./recovery";
import { ensureSponsoredVaultKey } from "./vaultAccess";

export async function handleCheckSponsoredTransferStatus(
  fromAddress: string,
): Promise<{
  success: boolean;
  hasUnresolved: boolean;
  completed?: boolean;
  txId?: string;
  intentId?: string;
  error?: string;
}> {
  return withSponsoredTransferOperation(async () => {
    const account = await getActiveAccount();
    if (
      !account ||
      account.type === "impersonator" ||
      !/^0x[0-9a-fA-F]{40}$/.test(fromAddress) ||
      account.address.toLowerCase() !== fromAddress.toLowerCase()
    ) {
      return {
        success: false,
        hasUnresolved: true,
        error: "Transfer account no longer matches the active account",
      };
    }
    try {
      const records = await getSponsoredTransferIntentsForAddress(
        account.address,
      );
      if (records.length === 0) {
        return { success: true, hasUnresolved: false };
      }
      const vaultKey = await ensureSponsoredVaultKey();
      if (!vaultKey) {
        return {
          success: false,
          hasUnresolved: true,
          error: "Wallet must be unlocked",
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
      if (unresolved) {
        return {
          success: true,
          hasUnresolved: true,
          error:
            "Transfer outcome is still unknown. Check again before sending another transfer.",
        };
      }
      return {
        success: true,
        hasUnresolved: false,
        completed: completedTxId !== undefined,
        txId: completedTxId,
        intentId: completedIntentId,
      };
    } catch (error) {
      return {
        success: false,
        hasUnresolved: true,
        error:
          error instanceof Error
            ? error.message
            : "Sponsored transfer recovery state is invalid",
      };
    }
  });
}

export async function handleAcknowledgeSponsoredTransfer(
  intentId: string,
  fromAddress: string,
): Promise<{ success: boolean }> {
  return withSponsoredTransferOperation(async () => {
    const account = await getActiveAccount();
    if (
      !account ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(intentId) ||
      !/^0x[0-9a-fA-F]{40}$/.test(fromAddress) ||
      account.address.toLowerCase() !== fromAddress.toLowerCase()
    ) {
      return { success: false };
    }
    return {
      success: await acknowledgeSponsoredTransferIntent(
        intentId,
        account.address,
      ),
    };
  });
}
