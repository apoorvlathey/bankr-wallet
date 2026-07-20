import {
  isValidPrivacyUnshieldTracking,
  isValidStoredPrivacyUnshield,
  MAX_PRIVACY_WITHDRAWALS,
  MAX_VISIBLE_PRIVACY_WITHDRAWALS,
  PRIVACY_WITHDRAWALS_DATABASE,
  PRIVACY_WITHDRAWALS_DATABASE_VERSION,
  PRIVACY_WITHDRAWALS_STORE,
  type PrivacyUnshieldTrackingV1,
  type StoredPrivacyUnshieldV1,
} from "./types";

const REQUEST_INDEX = "by-request-id";
const CREATED_INDEX = "by-created-at";
let databasePromise: Promise<IDBDatabase> | null = null;

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unshield storage failed"));
  });
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Unshield transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("Unshield transaction failed"));
  });
}

async function database(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("Unshield storage unavailable"));
    const request = indexedDB.open(PRIVACY_WITHDRAWALS_DATABASE, PRIVACY_WITHDRAWALS_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(PRIVACY_WITHDRAWALS_STORE, { keyPath: "summary.id" });
      store.createIndex(REQUEST_INDEX, "summary.requestId", { unique: true });
      store.createIndex(CREATED_INDEX, "summary.createdAt", { unique: false });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => { databasePromise = null; reject(request.error ?? new Error("Unshield storage failed")); };
    request.onblocked = () => { databasePromise = null; reject(new Error("Unshield storage blocked")); };
  });
  return databasePromise;
}

function validated(value: unknown): StoredPrivacyUnshieldV1 | null {
  if (value === undefined) return null;
  if (!isValidStoredPrivacyUnshield(value)) throw new Error("Invalid Unshield record");
  return value;
}

export async function commitPrivacyUnshield(
  record: StoredPrivacyUnshieldV1,
): Promise<{ status: "created" | "existing"; record: StoredPrivacyUnshieldV1 }> {
  if (!isValidStoredPrivacyUnshield(record)) throw new Error("Invalid Unshield record");
  const db = await database();
  const transaction = db.transaction(PRIVACY_WITHDRAWALS_STORE, "readwrite");
  const completion = complete(transaction);
  const store = transaction.objectStore(PRIVACY_WITHDRAWALS_STORE);
  try {
    const [existing, count] = await Promise.all([
      result(store.index(REQUEST_INDEX).get(record.summary.requestId)),
      result(store.count()),
    ]);
    const current = validated(existing);
    if (current) { await completion; return { status: "existing", record: current }; }
    if (count >= MAX_PRIVACY_WITHDRAWALS) throw new Error("Unshield storage capacity reached");
    store.add(record);
    await completion;
    return { status: "created", record };
  } catch (error) {
    try { transaction.abort(); } catch { /* settled */ }
    await completion.catch(() => undefined);
    throw error;
  }
}

export async function getPrivacyUnshieldById(id: string): Promise<StoredPrivacyUnshieldV1 | null> {
  const db = await database();
  const transaction = db.transaction(PRIVACY_WITHDRAWALS_STORE, "readonly");
  const completion = complete(transaction);
  const raw = await result(transaction.objectStore(PRIVACY_WITHDRAWALS_STORE).get(id));
  await completion;
  return validated(raw);
}

export async function updatePrivacyUnshieldTracking(
  id: string,
  update: (current: Readonly<PrivacyUnshieldTrackingV1>, record: Readonly<StoredPrivacyUnshieldV1>) => PrivacyUnshieldTrackingV1 | null,
): Promise<StoredPrivacyUnshieldV1 | null> {
  const db = await database();
  const transaction = db.transaction(PRIVACY_WITHDRAWALS_STORE, "readwrite");
  const completion = complete(transaction);
  const store = transaction.objectStore(PRIVACY_WITHDRAWALS_STORE);
  try {
    const current = validated(await result(store.get(id)));
    if (!current) { await completion; return null; }
    const tracking = update(current.tracking, current);
    if (!tracking) { await completion; return current; }
    if (!isValidPrivacyUnshieldTracking(tracking, current.summary)) throw new Error("Invalid Unshield transition");
    const next = { ...current, tracking };
    if (!isValidStoredPrivacyUnshield(next)) throw new Error("Invalid Unshield record");
    store.put(next);
    await completion;
    return next;
  } catch (error) {
    try { transaction.abort(); } catch { /* settled */ }
    await completion.catch(() => undefined);
    throw error;
  }
}

async function list(limit: number): Promise<StoredPrivacyUnshieldV1[]> {
  const db = await database();
  const transaction = db.transaction(PRIVACY_WITHDRAWALS_STORE, "readonly");
  const completion = complete(transaction);
  const records: StoredPrivacyUnshieldV1[] = [];
  await new Promise<void>((resolve, reject) => {
    const request = transaction.objectStore(PRIVACY_WITHDRAWALS_STORE).index(CREATED_INDEX).openCursor(null, "prev");
    request.onerror = () => reject(request.error ?? new Error("Unshield read failed"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || records.length >= limit) return resolve();
      const record = validated(cursor.value);
      if (!record) return reject(new Error("Invalid Unshield record"));
      records.push(record);
      cursor.continue();
    };
  });
  await completion;
  return records;
}

export function listPrivacyUnshields(): Promise<StoredPrivacyUnshieldV1[]> {
  return list(MAX_VISIBLE_PRIVACY_WITHDRAWALS);
}

export function listAllPrivacyUnshields(): Promise<StoredPrivacyUnshieldV1[]> {
  return list(MAX_PRIVACY_WITHDRAWALS);
}

export async function deletePrivacyWithdrawalsDatabase(): Promise<void> {
  const existing = databasePromise;
  databasePromise = null;
  if (existing) (await existing.catch(() => null))?.close();
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(PRIVACY_WITHDRAWALS_DATABASE);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Unshield reset failed"));
    request.onblocked = () => reject(new Error("Unshield reset blocked"));
  });
}
