import {
  isValidPrivacyRagequitTracking,
  isValidStoredPrivacyRagequit,
  MAX_PRIVACY_RAGEQUITS,
  MAX_VISIBLE_PRIVACY_RAGEQUITS,
  PRIVACY_RAGEQUITS_DATABASE,
  PRIVACY_RAGEQUITS_DATABASES,
  PRIVACY_RAGEQUITS_DATABASE_VERSION,
  PRIVACY_RAGEQUITS_STORE,
  type PrivacyRagequitTrackingV1,
  type StoredPrivacyRagequitV1,
} from "./types";

const REQUEST_INDEX = "by-request-id";
const CREATED_INDEX = "by-created-at";
let databasePromise: Promise<IDBDatabase> | null = null;

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Public recovery storage failed"));
  });
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Public recovery transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("Public recovery transaction failed"));
  });
}

async function database(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("Public recovery storage unavailable"));
    const request = indexedDB.open(PRIVACY_RAGEQUITS_DATABASE, PRIVACY_RAGEQUITS_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(PRIVACY_RAGEQUITS_STORE, { keyPath: "summary.id" });
      store.createIndex(REQUEST_INDEX, "summary.requestId", { unique: true });
      store.createIndex(CREATED_INDEX, "summary.createdAt", { unique: false });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => { databasePromise = null; reject(request.error ?? new Error("Public recovery storage failed")); };
    request.onblocked = () => { databasePromise = null; reject(new Error("Public recovery storage blocked")); };
  });
  return databasePromise;
}

function validated(value: unknown): StoredPrivacyRagequitV1 | null {
  if (value === undefined) return null;
  if (!isValidStoredPrivacyRagequit(value)) throw new Error("Invalid public recovery record");
  return value;
}

export async function commitPrivacyRagequit(
  record: StoredPrivacyRagequitV1,
): Promise<{ status: "created" | "existing"; record: StoredPrivacyRagequitV1 }> {
  if (!isValidStoredPrivacyRagequit(record)) throw new Error("Invalid public recovery record");
  const db = await database();
  const transaction = db.transaction(PRIVACY_RAGEQUITS_STORE, "readwrite");
  const completion = complete(transaction);
  const store = transaction.objectStore(PRIVACY_RAGEQUITS_STORE);
  try {
    const [existing, count] = await Promise.all([
      result(store.index(REQUEST_INDEX).get(record.summary.requestId)),
      result(store.count()),
    ]);
    const current = validated(existing);
    if (current) { await completion; return { status: "existing", record: current }; }
    if (count >= MAX_PRIVACY_RAGEQUITS) throw new Error("Public recovery storage capacity reached");
    store.add(record);
    await completion;
    return { status: "created", record };
  } catch (error) {
    try { transaction.abort(); } catch { /* settled */ }
    await completion.catch(() => undefined);
    throw error;
  }
}

export async function getPrivacyRagequitById(id: string): Promise<StoredPrivacyRagequitV1 | null> {
  const db = await database();
  const transaction = db.transaction(PRIVACY_RAGEQUITS_STORE, "readonly");
  const completion = complete(transaction);
  const raw = await result(transaction.objectStore(PRIVACY_RAGEQUITS_STORE).get(id));
  await completion;
  return validated(raw);
}

export async function getPrivacyRagequitByRequestId(
  requestId: string,
): Promise<StoredPrivacyRagequitV1 | null> {
  const db = await database();
  const transaction = db.transaction(PRIVACY_RAGEQUITS_STORE, "readonly");
  const completion = complete(transaction);
  const raw = await result(
    transaction.objectStore(PRIVACY_RAGEQUITS_STORE).index(REQUEST_INDEX).get(requestId),
  );
  await completion;
  return validated(raw);
}

export async function updatePrivacyRagequitTracking(
  id: string,
  update: (
    current: Readonly<PrivacyRagequitTrackingV1>,
    record: Readonly<StoredPrivacyRagequitV1>,
  ) => PrivacyRagequitTrackingV1 | null,
): Promise<StoredPrivacyRagequitV1 | null> {
  const db = await database();
  const transaction = db.transaction(PRIVACY_RAGEQUITS_STORE, "readwrite");
  const completion = complete(transaction);
  const store = transaction.objectStore(PRIVACY_RAGEQUITS_STORE);
  try {
    const current = validated(await result(store.get(id)));
    if (!current) { await completion; return null; }
    const tracking = update(current.tracking, current);
    if (!tracking) { await completion; return current; }
    if (!isValidPrivacyRagequitTracking(tracking, current.summary)) {
      throw new Error("Invalid public recovery transition");
    }
    const next = { ...current, tracking };
    if (!isValidStoredPrivacyRagequit(next)) throw new Error("Invalid public recovery record");
    store.put(next);
    await completion;
    return next;
  } catch (error) {
    try { transaction.abort(); } catch { /* settled */ }
    await completion.catch(() => undefined);
    throw error;
  }
}

export async function deletePrivacyRagequit(id: string): Promise<void> {
  const db = await database();
  const transaction = db.transaction(PRIVACY_RAGEQUITS_STORE, "readwrite");
  const completion = complete(transaction);
  transaction.objectStore(PRIVACY_RAGEQUITS_STORE).delete(id);
  await completion;
}

async function list(limit: number): Promise<StoredPrivacyRagequitV1[]> {
  const db = await database();
  const transaction = db.transaction(PRIVACY_RAGEQUITS_STORE, "readonly");
  const completion = complete(transaction);
  const records: StoredPrivacyRagequitV1[] = [];
  await new Promise<void>((resolve, reject) => {
    const request = transaction.objectStore(PRIVACY_RAGEQUITS_STORE).index(CREATED_INDEX).openCursor(null, "prev");
    request.onerror = () => reject(request.error ?? new Error("Public recovery read failed"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || records.length >= limit) return resolve();
      const record = validated(cursor.value);
      if (!record) return reject(new Error("Invalid public recovery record"));
      records.push(record);
      cursor.continue();
    };
  });
  await completion;
  return records;
}

export function listPrivacyRagequits(): Promise<StoredPrivacyRagequitV1[]> {
  return list(MAX_VISIBLE_PRIVACY_RAGEQUITS);
}

export function listAllPrivacyRagequits(): Promise<StoredPrivacyRagequitV1[]> {
  return list(MAX_PRIVACY_RAGEQUITS);
}

export async function deletePrivacyRagequitsDatabase(): Promise<void> {
  const existing = databasePromise;
  databasePromise = null;
  if (existing) (await existing.catch(() => null))?.close();
  if (typeof indexedDB === "undefined") return;
  await Promise.all(PRIVACY_RAGEQUITS_DATABASES.map((name) =>
    new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Public recovery reset failed"));
      request.onblocked = () => reject(new Error("Public recovery reset blocked"));
    })
  ));
}
