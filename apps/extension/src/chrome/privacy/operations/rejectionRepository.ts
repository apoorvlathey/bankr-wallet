import {
  defaultPrivacyShieldOperationTracking,
  PRIVACY_OPERATIONS_STORE,
  type StoredPrivacyShieldOperationV1,
} from "./types";
import {
  openPrivacyOperationsDatabase,
  requestResult,
  transactionComplete,
  validatedOperation,
} from "./database";

export function isRejectedPrivacyShieldOperation(
  operation: StoredPrivacyShieldOperationV1,
): boolean {
  return (operation.tracking ??
    defaultPrivacyShieldOperationTracking(operation.summary)).state ===
    "wallet_rejected";
}

/** Delete only a rejection that was durably terminalized before pending cleanup. */
export async function deleteRejectedPrivacyShieldOperation(
  operationId: string,
): Promise<boolean> {
  const database = await openPrivacyOperationsDatabase();
  const transaction = database.transaction(PRIVACY_OPERATIONS_STORE, "readwrite");
  const completion = transactionComplete(transaction);
  const store = transaction.objectStore(PRIVACY_OPERATIONS_STORE);
  try {
    const operation = validatedOperation(await requestResult(store.get(operationId)));
    if (!operation || !isRejectedPrivacyShieldOperation(operation)) {
      await completion;
      return false;
    }
    store.delete(operationId);
    await completion;
    return true;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction may already have completed or aborted.
    }
    await completion.catch(() => undefined);
    throw error;
  }
}

/** Remove captured rejected records without touching newer concurrent operations. */
export async function deleteRejectedPrivacyShieldOperations(
  operationIds: readonly string[],
): Promise<number> {
  const ids = new Set(operationIds);
  if (ids.size === 0) return 0;
  const database = await openPrivacyOperationsDatabase();
  const transaction = database.transaction(PRIVACY_OPERATIONS_STORE, "readwrite");
  const completion = transactionComplete(transaction);
  const store = transaction.objectStore(PRIVACY_OPERATIONS_STORE);
  try {
    const raw = await requestResult(store.getAll());
    const rejected = (Array.isArray(raw) ? raw : [])
      .map(validatedOperation)
      .filter((operation): operation is StoredPrivacyShieldOperationV1 =>
        operation !== null &&
        ids.has(operation.summary.id) &&
        isRejectedPrivacyShieldOperation(operation)
      );
    for (const operation of rejected) store.delete(operation.summary.id);
    await completion;
    return rejected.length;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction may already have completed or aborted.
    }
    await completion.catch(() => undefined);
    throw error;
  }
}
