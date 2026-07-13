import { getAccountById } from "../accountStorage";
import { fetchTextBounded } from "../network/boundedHttp";
import { startReceiptPolling } from "../forceInclusion/receiptPoller";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import {
  RELAYER_RESPONSE_MAX_BYTES,
  RELAYER_TIMEOUT_MS,
  SPONSORED_TRANSFER_API,
} from "./constants";
import {
  updateSponsoredTransferIntent,
  type SponsoredTransferIntentRecord,
  type SponsoredTransferRelayPayload,
} from "./intentStorage";
import { parseSponsoredTransferResponse } from "./response";
import { ensureSponsoredTransferHistory, updateTxInHistory } from "./history";
import type {
  SponsoredTransferHandlerResult,
  SponsoredTransferSignerAccount,
} from "./types";

export async function submitSponsoredTransfer(
  account: SponsoredTransferSignerAccount,
  record: SponsoredTransferIntentRecord,
  payload: SponsoredTransferRelayPayload,
): Promise<SponsoredTransferHandlerResult> {
  const latestAccount = await getAccountById(account.id);
  if (
    !latestAccount ||
    latestAccount.type !== account.type ||
    latestAccount.address.toLowerCase() !== account.address.toLowerCase()
  ) {
    return { success: false, error: "Transfer account is no longer available" };
  }

  await ensureSponsoredTransferHistory(record);
  let request: Promise<{ response: Response; text: string }> | undefined;
  await withStorageLock(WALLET_SECRET_OPERATION_LOCK_KEY, async () => {
    const current = await getAccountById(account.id);
    if (
      !current ||
      current.type !== account.type ||
      current.address.toLowerCase() !== account.address.toLowerCase()
    ) {
      throw new Error("Transfer account is no longer available");
    }
    await updateSponsoredTransferIntent(record.id, {
      state: "submitting",
      attempts: record.attempts + 1,
    });
    request = fetchTextBounded(
      SPONSORED_TRANSFER_API,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      { timeoutMs: RELAYER_TIMEOUT_MS, maxBytes: RELAYER_RESPONSE_MAX_BYTES },
    );
  });

  try {
    if (!request) throw new Error("Sponsored transfer submission did not start");
    const { response, text } = await request;
    const txHash = parseSponsoredTransferResponse(text, response.ok);
    await updateSponsoredTransferIntent(record.id, {
      state: "submitted",
      attempts: record.attempts + 1,
      txHash,
    });
    await updateTxInHistory(record.txId, {
      status: "pending",
      txHash,
      error: undefined,
      broadcastUncertain: false,
    });
    startReceiptPolling(record.txId, txHash, 8453);
    return { success: true, txId: record.txId, intentId: record.id };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Relayer response was lost";
    const retryMessage =
      "Transfer outcome is unknown. Check again before sending another transfer.";
    await updateSponsoredTransferIntent(record.id, {
      state: "ambiguous",
      attempts: record.attempts + 1,
      lastError: detail,
    }).catch(() => undefined);
    await updateTxInHistory(record.txId, {
      status: "pending",
      error: retryMessage,
      broadcastUncertain: true,
    });
    return {
      success: false,
      txId: record.txId,
      intentId: record.id,
      error: retryMessage,
      outcomeUncertain: true,
    };
  }
}
