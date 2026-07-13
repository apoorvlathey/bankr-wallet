import { getPendingBatchTxRequestById } from "./pendingBatchTxStorage";
import { getPendingSignatureRequestById } from "./pendingSignatureStorage";
import { getPendingTxRequestById } from "./pendingTxStorage";
import {
  terminalizeUnauthorizedPendingRequest,
  type PendingRequestLifecycleContext,
  type PendingRequestLifecycleKind,
} from "./pendingRequestLifecycle";
import {
  runPendingRequestResolution,
  type PendingRequestFamily,
} from "./pendingRequestResolution";

type ExpirableKind = Exclude<
  PendingRequestLifecycleKind,
  "erc7715Permission"
>;

const expiryErrors: Record<ExpirableKind, string> = {
  transaction: "Transaction request expired",
  signature: "Signature request expired",
  batchTransaction: "Batch transaction request expired",
};

const families: Record<ExpirableKind, PendingRequestFamily> = {
  transaction: "transaction",
  signature: "signature",
  batchTransaction: "batchTransaction",
};

async function getPending(
  kind: ExpirableKind,
  requestId: string,
): Promise<PendingRequestLifecycleContext | null> {
  if (kind === "transaction") return getPendingTxRequestById(requestId);
  if (kind === "signature") return getPendingSignatureRequestById(requestId);
  return getPendingBatchTxRequestById(requestId);
}

/** First-action-safe periodic expiry with a durable transport result. */
export async function expirePersistedPendingRequest(
  kind: ExpirableKind,
  requestId: string,
  expiredAtOrBefore: number,
): Promise<void> {
  await runPendingRequestResolution({
    family: families[kind],
    requestId,
    action: "expire",
    conflictResult: () => undefined,
    resolve: async () => {
      const pending = await getPending(kind, requestId);
      if (!pending) return;
      const timestamp = (pending as { timestamp?: number }).timestamp;
      if (typeof timestamp === "number" && timestamp > expiredAtOrBefore) return;
      await terminalizeUnauthorizedPendingRequest(kind, pending, {
        authorized: false,
        error: expiryErrors[kind],
        code: -32000,
      });
    },
  });
}
