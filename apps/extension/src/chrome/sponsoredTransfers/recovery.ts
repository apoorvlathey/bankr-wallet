import {
  removeSponsoredTransferIntent,
  updateSponsoredTransferIntent,
  type SponsoredTransferIntentRecord,
  type SponsoredTransferRelayPayload,
} from "./intentStorage";
import { reconcileSponsoredTransferAuthorization } from "./reconciliation";
import {
  ensureSponsoredTransferHistory,
  updateTxInHistory,
} from "./history";
import { decryptSponsoredTransferPayload } from "./vaultAccess";

export async function reconcileSponsoredTransferRecord(
  record: SponsoredTransferIntentRecord,
  vaultKey: CryptoKey,
): Promise<{
  status: "consumed" | "expired-unused" | "unresolved";
  payload: SponsoredTransferRelayPayload;
}> {
  const payload = await decryptSponsoredTransferPayload(record, vaultKey);
  const status = await reconcileSponsoredTransferAuthorization(
    payload,
    record.validBefore,
  );
  if (status === "consumed") {
    await ensureSponsoredTransferHistory(record);
    await updateTxInHistory(record.txId, {
      status: "success",
      completedAt: Date.now(),
      error: undefined,
      broadcastUncertain: false,
    });
    await updateSponsoredTransferIntent(record.id, {
      state: "consumed",
      attempts: record.attempts,
    });
  } else if (status === "expired-unused") {
    await ensureSponsoredTransferHistory(record);
    await updateTxInHistory(record.txId, {
      status: "failed",
      completedAt: Date.now(),
      error: "Sponsored authorization expired without being used",
      broadcastUncertain: false,
    });
    await removeSponsoredTransferIntent(record.id);
  }
  return { status, payload };
}
