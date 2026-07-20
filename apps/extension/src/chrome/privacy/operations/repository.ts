import {
  defaultPrivacyShieldOperationTracking,
  isValidPrivacyOperationMetadata,
  isValidPrivacyShieldOperationTracking,
  isValidStoredPrivacyShieldOperation,
  MAX_PRIVACY_DEPOSIT_INDEX,
  MAX_PRIVACY_OPERATIONS,
  MAX_VISIBLE_PRIVACY_OPERATIONS,
  PRIVACY_NEXT_DEPOSIT_INDEX_KEY,
  PRIVACY_OPERATIONS_DATABASE,
  PRIVACY_OPERATIONS_DATABASES,
  PRIVACY_OPERATIONS_DATABASE_VERSION,
  PRIVACY_OPERATIONS_METADATA_STORE,
  PRIVACY_OPERATIONS_STORE,
  privacyShieldOperationPublicSummary,
  type PrivacyOperationMetadataV1,
  type PrivacyShieldOperationTrackingV1,
  type StoredPrivacyShieldOperationV1,
} from "./types";

const REQUEST_ID_INDEX = "by-request-id";
const DEDUPE_INDEX = "by-dedupe-key";
const CREATED_AT_INDEX = "by-created-at";

let databasePromise: Promise<IDBDatabase> | null = null;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

async function openPrivacyOperationsDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Privacy operation storage unavailable"));
      return;
    }
    const request = indexedDB.open(
      PRIVACY_OPERATIONS_DATABASE,
      PRIVACY_OPERATIONS_DATABASE_VERSION,
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      const operations = database.createObjectStore(PRIVACY_OPERATIONS_STORE, {
        keyPath: "summary.id",
      });
      operations.createIndex(REQUEST_ID_INDEX, "summary.requestId", {
        unique: true,
      });
      operations.createIndex(DEDUPE_INDEX, "summary.dedupeKey", {
        unique: false,
      });
      operations.createIndex(CREATED_AT_INDEX, "summary.createdAt", {
        unique: false,
      });
      database.createObjectStore(PRIVACY_OPERATIONS_METADATA_STORE, {
        keyPath: "key",
      });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Privacy operation storage failed"));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("Privacy operation storage blocked"));
    };
  });
  return databasePromise;
}

function validatedOperation(value: unknown): StoredPrivacyShieldOperationV1 | null {
  if (value === undefined) return null;
  if (!isValidStoredPrivacyShieldOperation(value)) {
    throw new Error("Invalid privacy operation record");
  }
  return value;
}

export async function findPrivacyShieldOperation(input: {
  requestId: string;
  dedupeKey: string;
}): Promise<StoredPrivacyShieldOperationV1 | null> {
  const database = await openPrivacyOperationsDatabase();
  const transaction = database.transaction(PRIVACY_OPERATIONS_STORE, "readonly");
  const completion = transactionComplete(transaction);
  const store = transaction.objectStore(PRIVACY_OPERATIONS_STORE);
  const byRequest = await requestResult(
    store.index(REQUEST_ID_INDEX).get(input.requestId),
  );
  if (byRequest !== undefined) {
    await completion;
    return validatedOperation(byRequest);
  }
  const byDedupe = await requestResult(
    store.index(DEDUPE_INDEX).getAll(input.dedupeKey),
  );
  await completion;
  const active = (Array.isArray(byDedupe) ? byDedupe : [])
    .map(validatedOperation)
    .filter((operation): operation is StoredPrivacyShieldOperationV1 =>
      operation !== null && !isTerminalPrivacyShieldState(
        (operation.tracking ??
          defaultPrivacyShieldOperationTracking(operation.summary)).state,
      ),
    )
    .sort((left, right) => right.summary.createdAt - left.summary.createdAt);
  return active[0] ?? null;
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
    const [rawMetadata, byRequest, byDedupe, operationCount] = await Promise.all([
      requestResult(metadata.get(PRIVACY_NEXT_DEPOSIT_INDEX_KEY)),
      requestResult(
        operations.index(REQUEST_ID_INDEX).get(operation.summary.requestId),
      ),
      requestResult(
        operations.index(DEDUPE_INDEX).get(operation.summary.dedupeKey),
      ),
      requestResult(operations.count()),
    ]);
    const existing = validatedOperation(byRequest ?? byDedupe);
    if (existing) {
      await completion;
      return { status: "existing", operation: existing };
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
    .index(CREATED_AT_INDEX);
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
  return (await listPrivacyShieldOperations()).map(
    privacyShieldOperationPublicSummary,
  );
}

export function isTerminalPrivacyShieldState(
  state: PrivacyShieldOperationTrackingV1["state"],
): boolean {
  return state === "private_ready" ||
    state === "wallet_rejected" ||
    state === "submission_failed" ||
    state === "public_reverted" ||
    state === "asp_declined" ||
    state === "asp_removed" ||
    state === "ragequit_available" ||
    state === "ragequit_recovered" ||
    state === "failed_needs_support";
}

export async function deletePrivacyOperationsDatabase(): Promise<void> {
  const existing = databasePromise;
  databasePromise = null;
  if (existing) {
    const database = await existing.catch(() => null);
    database?.close();
  }
  if (typeof indexedDB === "undefined") return;
  await Promise.all(PRIVACY_OPERATIONS_DATABASES.map((name) =>
    new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Privacy operation reset failed"));
      request.onblocked = () => reject(new Error("Privacy operation reset blocked"));
    })
  ));
}
