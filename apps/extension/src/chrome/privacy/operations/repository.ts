import {
  defaultPrivacyShieldOperationTracking,
  isValidPrivacyOperationMetadata,
  isValidPrivacyShieldOperationTracking,
  isValidStoredPrivacyShieldOperation,
  MAX_PRIVACY_DEPOSIT_INDEX,
  MAX_PRIVACY_OPERATIONS,
  MAX_VISIBLE_PRIVACY_OPERATIONS,
  PRIVACY_NEXT_DEPOSIT_INDEX_KEY,
  PRIVACY_OPERATIONS_METADATA_STORE,
  PRIVACY_OPERATIONS_STORE,
  privacyShieldOperationPublicSummary,
  type PrivacyOperationMetadataV1,
  type PrivacyShieldOperationTrackingV1,
  type StoredPrivacyShieldOperationV1,
} from "./types";
import {
  openPrivacyOperationsDatabase,
  PRIVACY_OPERATION_CREATED_AT_INDEX,
  PRIVACY_OPERATION_REQUEST_ID_INDEX,
  requestResult,
  transactionComplete,
  validatedOperation,
} from "./database";
import { isRejectedPrivacyShieldOperation } from "./rejectionRepository";

export { deletePrivacyOperationsDatabase } from "./database";

/** A request UUID is the sole idempotency identity; amount is never identity. */
export async function findPrivacyShieldOperation(
  requestId: string,
): Promise<StoredPrivacyShieldOperationV1 | null> {
  const database = await openPrivacyOperationsDatabase();
  const transaction = database.transaction(PRIVACY_OPERATIONS_STORE, "readonly");
  const completion = transactionComplete(transaction);
  const store = transaction.objectStore(PRIVACY_OPERATIONS_STORE);
  const byRequest = await requestResult(
    store.index(PRIVACY_OPERATION_REQUEST_ID_INDEX).get(requestId),
  );
  await completion;
  return validatedOperation(byRequest);
}

export async function getPrivacyShieldOperationById(
  operationId: string,
): Promise<StoredPrivacyShieldOperationV1 | null> {
  const database = await openPrivacyOperationsDatabase();
  const transaction = database.transaction(PRIVACY_OPERATIONS_STORE, "readonly");
  const completion = transactionComplete(transaction);
  const raw = await requestResult(
    transaction.objectStore(PRIVACY_OPERATIONS_STORE).get(operationId),
  );
  await completion;
  return validatedOperation(raw);
}

export type PrivacyTrackingUpdateResult =
  | { status: "updated"; operation: StoredPrivacyShieldOperationV1 }
  | { status: "unchanged"; operation: StoredPrivacyShieldOperationV1 }
  | { status: "missing" };

/** Atomically advance only the public lifecycle sidecar for one operation. */
export async function updatePrivacyShieldOperationTracking(
  operationId: string,
  update: (
    current: Readonly<PrivacyShieldOperationTrackingV1>,
    operation: Readonly<StoredPrivacyShieldOperationV1>,
  ) => PrivacyShieldOperationTrackingV1 | null,
): Promise<PrivacyTrackingUpdateResult> {
  const database = await openPrivacyOperationsDatabase();
  const transaction = database.transaction(PRIVACY_OPERATIONS_STORE, "readwrite");
  const completion = transactionComplete(transaction);
  const store = transaction.objectStore(PRIVACY_OPERATIONS_STORE);
  try {
    const raw = await requestResult(store.get(operationId));
    const operation = validatedOperation(raw);
    if (!operation) {
      await completion;
      return { status: "missing" };
    }
    const current = operation.tracking ??
      defaultPrivacyShieldOperationTracking(operation.summary);
    const next = update(current, operation);
    if (next === null || JSON.stringify(next) === JSON.stringify(current)) {
      await completion;
      return { status: "unchanged", operation };
    }
    if (!isValidPrivacyShieldOperationTracking(next, operation.summary)) {
      throw new Error("Invalid privacy operation tracking transition");
    }
    const updated: StoredPrivacyShieldOperationV1 = {
      ...operation,
      tracking: next,
    };
    if (!isValidStoredPrivacyShieldOperation(updated)) {
      throw new Error("Invalid privacy operation record");
    }
    store.put(updated);
    await completion;
    return { status: "updated", operation: updated };
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

export async function readNextPrivacyDepositIndex(): Promise<number> {
  const database = await openPrivacyOperationsDatabase();
  const transaction = database.transaction(
    PRIVACY_OPERATIONS_METADATA_STORE,
    "readonly",
  );
  const completion = transactionComplete(transaction);
  const raw = await requestResult(
    transaction
      .objectStore(PRIVACY_OPERATIONS_METADATA_STORE)
      .get(PRIVACY_NEXT_DEPOSIT_INDEX_KEY),
  );
  await completion;
  if (raw === undefined) return 0;
  if (!isValidPrivacyOperationMetadata(raw)) {
    throw new Error("Invalid privacy operation metadata");
  }
  if (raw.value > MAX_PRIVACY_DEPOSIT_INDEX) {
    throw new Error("Privacy deposit index exhausted");
  }
  return raw.value;
}

/** Recovery may only move the derivation cursor forward; it can never reuse an index. */
export async function advanceNextPrivacyDepositIndex(minimum: number): Promise<number> {
  if (
    !Number.isSafeInteger(minimum) ||
    minimum < 0 ||
    minimum > MAX_PRIVACY_DEPOSIT_INDEX + 1
  ) {
    throw new Error("Invalid privacy deposit cursor");
  }
  const database = await openPrivacyOperationsDatabase();
  const transaction = database.transaction(PRIVACY_OPERATIONS_METADATA_STORE, "readwrite");
  const completion = transactionComplete(transaction);
  const store = transaction.objectStore(PRIVACY_OPERATIONS_METADATA_STORE);
  try {
    const raw = await requestResult(store.get(PRIVACY_NEXT_DEPOSIT_INDEX_KEY));
    const current = raw === undefined
      ? 0
      : isValidPrivacyOperationMetadata(raw)
        ? raw.value
        : null;
    if (current === null) throw new Error("Invalid privacy operation metadata");
    const next = Math.max(current, minimum);
    if (next !== current) {
      store.put({ key: PRIVACY_NEXT_DEPOSIT_INDEX_KEY, value: next });
    }
    await completion;
    return next;
  } catch (error) {
    try { transaction.abort(); } catch { /* already settled */ }
    await completion.catch(() => undefined);
    throw error;
  }
}

export type PrivacyOperationCommitResult =
  | { status: "created"; operation: StoredPrivacyShieldOperationV1 }
  | { status: "existing"; operation: StoredPrivacyShieldOperationV1 }
  | { status: "conflict" };

export async function commitPrivacyShieldOperation(
  operation: StoredPrivacyShieldOperationV1,
  expectedDepositIndex: number,
): Promise<PrivacyOperationCommitResult> {
  if (!isValidStoredPrivacyShieldOperation(operation)) {
    throw new Error("Invalid privacy operation record");
  }
  const database = await openPrivacyOperationsDatabase();
  const transaction = database.transaction(
    [PRIVACY_OPERATIONS_STORE, PRIVACY_OPERATIONS_METADATA_STORE],
    "readwrite",
  );
  const completion = transactionComplete(transaction);
  const operations = transaction.objectStore(PRIVACY_OPERATIONS_STORE);
  const metadata = transaction.objectStore(PRIVACY_OPERATIONS_METADATA_STORE);
  try {
    const [rawMetadata, byRequest, operationCount] = await Promise.all([
      requestResult(metadata.get(PRIVACY_NEXT_DEPOSIT_INDEX_KEY)),
      requestResult(
        operations
          .index(PRIVACY_OPERATION_REQUEST_ID_INDEX)
          .get(operation.summary.requestId),
      ),
      requestResult(operations.count()),
    ]);
    const existingByRequest = validatedOperation(byRequest);
    if (existingByRequest) {
      await completion;
      return { status: "existing", operation: existingByRequest };
    }
    const currentIndex = rawMetadata === undefined
      ? 0
      : isValidPrivacyOperationMetadata(rawMetadata)
        ? rawMetadata.value
        : null;
    if (currentIndex === null) {
      throw new Error("Invalid privacy operation metadata");
    }
    if (currentIndex !== expectedDepositIndex) {
      transaction.abort();
      await completion.catch(() => undefined);
      return { status: "conflict" };
    }
    if (
      operationCount >= MAX_PRIVACY_OPERATIONS ||
      currentIndex > MAX_PRIVACY_DEPOSIT_INDEX
    ) {
      throw new Error("Privacy operation storage capacity reached");
    }
    const nextMetadata: PrivacyOperationMetadataV1 = {
      key: PRIVACY_NEXT_DEPOSIT_INDEX_KEY,
      value: currentIndex + 1,
    };
    metadata.put(nextMetadata);
    operations.add(operation);
    await completion;
    return { status: "created", operation };
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

async function readPrivacyShieldOperations(
  limit: number,
): Promise<StoredPrivacyShieldOperationV1[]> {
  const database = await openPrivacyOperationsDatabase();
  const transaction = database.transaction(PRIVACY_OPERATIONS_STORE, "readonly");
  const completion = transactionComplete(transaction);
  const index = transaction
    .objectStore(PRIVACY_OPERATIONS_STORE)
    .index(PRIVACY_OPERATION_CREATED_AT_INDEX);
  const operations: StoredPrivacyShieldOperationV1[] = [];
  await new Promise<void>((resolve, reject) => {
    const request = index.openCursor(null, "prev");
    request.onerror = () => reject(request.error ?? new Error("Privacy operation read failed"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || operations.length >= limit) {
        resolve();
        return;
      }
      const operation = validatedOperation(cursor.value);
      if (!operation) {
        reject(new Error("Invalid privacy operation record"));
        return;
      }
      operations.push(operation);
      cursor.continue();
    };
  });
  await completion;
  return operations;
}

/** Public/UI reads stay capped so a renderer cannot request the full vault history. */
export function listPrivacyShieldOperations(): Promise<StoredPrivacyShieldOperationV1[]> {
  return readPrivacyShieldOperations(MAX_VISIBLE_PRIVACY_OPERATIONS);
}

/** Background recovery/indexing must inspect every bounded durable operation. */
export function listAllPrivacyShieldOperations(): Promise<StoredPrivacyShieldOperationV1[]> {
  return readPrivacyShieldOperations(MAX_PRIVACY_OPERATIONS);
}

export async function listPrivacyShieldOperationSummaries() {
  return (await listAllPrivacyShieldOperations())
    .filter((operation) => !isRejectedPrivacyShieldOperation(operation))
    .slice(0, MAX_VISIBLE_PRIVACY_OPERATIONS)
    .map(privacyShieldOperationPublicSummary);
}

export function isTerminalPrivacyShieldState(
  state: PrivacyShieldOperationTrackingV1["state"],
): boolean {
  return state === "asp_approved" ||
    state === "private_ready" ||
    state === "wallet_rejected" ||
    state === "submission_failed" ||
    state === "public_reverted" ||
    state === "asp_declined" ||
    state === "asp_removed" ||
    state === "ragequit_available" ||
    state === "ragequit_recovered" ||
    state === "failed_needs_support";
}
