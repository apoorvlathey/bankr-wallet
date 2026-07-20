import {
  isValidStoredPrivacyShieldOperation,
  PRIVACY_OPERATIONS_DATABASE,
  PRIVACY_OPERATIONS_DATABASES,
  PRIVACY_OPERATIONS_DATABASE_VERSION,
  PRIVACY_OPERATIONS_METADATA_STORE,
  PRIVACY_OPERATIONS_STORE,
  type StoredPrivacyShieldOperationV1,
} from "./types";

let databasePromise: Promise<IDBDatabase> | null = null;

export const PRIVACY_OPERATION_REQUEST_ID_INDEX = "by-request-id";
export const PRIVACY_OPERATION_DEDUPE_INDEX = "by-dedupe-key";
export const PRIVACY_OPERATION_CREATED_AT_INDEX = "by-created-at";

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function transactionComplete(
  transaction: IDBTransaction,
): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

export async function openPrivacyOperationsDatabase(): Promise<IDBDatabase> {
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
      operations.createIndex(PRIVACY_OPERATION_REQUEST_ID_INDEX, "summary.requestId", {
        unique: true,
      });
      operations.createIndex(PRIVACY_OPERATION_DEDUPE_INDEX, "summary.dedupeKey", {
        unique: false,
      });
      operations.createIndex(PRIVACY_OPERATION_CREATED_AT_INDEX, "summary.createdAt", {
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

export function validatedOperation(
  value: unknown,
): StoredPrivacyShieldOperationV1 | null {
  if (value === undefined) return null;
  if (!isValidStoredPrivacyShieldOperation(value)) {
    throw new Error("Invalid privacy operation record");
  }
  return value;
}

export async function deletePrivacyOperationsDatabase(): Promise<void> {
  const existing = databasePromise;
  databasePromise = null;
  if (existing) {
    const database = await existing.catch(() => null);
    database?.close();
  }
  if (typeof indexedDB === "undefined") return;
  await Promise.all(
    PRIVACY_OPERATIONS_DATABASES.map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () =>
            reject(
              request.error ?? new Error("Privacy operation reset failed"),
            );
          request.onblocked = () =>
            reject(new Error("Privacy operation reset blocked"));
        }),
    ),
  );
}
