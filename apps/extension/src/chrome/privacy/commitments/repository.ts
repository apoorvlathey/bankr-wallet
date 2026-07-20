import {
  decryptPrivacyCommitmentDetails,
  encryptPrivacyCommitmentDetails,
} from "./crypto";
import {
  isValidStoredPrivacyCommitment,
  MAX_PRIVACY_COMMITMENTS,
  PRIVACY_COMMITMENTS_DATABASE,
  PRIVACY_COMMITMENTS_DATABASES,
  PRIVACY_COMMITMENTS_DATABASE_VERSION,
  PRIVACY_COMMITMENTS_STORE,
  type PrivacyCommitmentDetailsV1,
  type PrivacyCommitmentStatus,
  type StoredPrivacyCommitmentV1,
} from "./types";

let databasePromise: Promise<IDBDatabase> | null = null;

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Commitment storage failed"));
  });
}

export async function updatePrivacyCommitmentStatus(
  key: CryptoKey,
  keyId: string,
  commitmentId: string,
  status: PrivacyCommitmentStatus,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const records = await readPrivacyCommitmentRecords();
    const current = records.find((record) => record.id === commitmentId);
    if (!current || current.keyId !== keyId) {
      throw new Error("Private commitment is unavailable");
    }
    const details = await decryptPrivacyCommitmentDetails(key, current);
    if (!details) throw new Error("Private commitment recovery failed");
    if (details.status === status) return;
    const terminal = status === "spent" || status === "ragequit_recovered";
    const nextDetails: PrivacyCommitmentDetailsV1 = {
      ...details,
      status,
      balanceWei: terminal ? "0" : details.balanceWei,
    };
    const header = {
      version: 1 as const,
      id: current.id,
      keyId,
      revision: current.revision + 1,
      createdAt: current.createdAt,
      updatedAt: Math.max(Date.now(), current.updatedAt),
    };
    const next: StoredPrivacyCommitmentV1 = {
      ...header,
      encryptedDetails: await encryptPrivacyCommitmentDetails(key, header, nextDetails),
    };
    const database = await openDatabase();
    const transaction = database.transaction(PRIVACY_COMMITMENTS_STORE, "readwrite");
    const completion = complete(transaction);
    const store = transaction.objectStore(PRIVACY_COMMITMENTS_STORE);
    try {
      const latest = await result(store.get(commitmentId));
      if (
        !isValidStoredPrivacyCommitment(latest) ||
        latest.keyId !== keyId ||
        latest.revision !== current.revision
      ) {
        transaction.abort();
        await completion.catch(() => undefined);
        continue;
      }
      store.put(next);
      await completion;
      return;
    } catch (error) {
      try { transaction.abort(); } catch { /* already settled */ }
      await completion.catch(() => undefined);
      throw error;
    }
  }
  throw new Error("Private commitment changed during update");
}

/** Mark older encrypted records from the same deposit lineage as spent. */
export async function markPrivacyCommitmentLineageSuperseded(
  key: CryptoKey,
  keyId: string,
  current: PrivacyCommitmentDetailsV1,
): Promise<void> {
  const commitments = await readPrivacyCommitments(key, keyId);
  for (const item of commitments) {
    const details = item.details;
    if (
      details.id !== current.id &&
      details.depositIndex === current.depositIndex &&
      details.depositTxHash.toLowerCase() === current.depositTxHash.toLowerCase() &&
      details.label === current.label &&
      details.status !== "spent" &&
      details.status !== "ragequit_recovered"
    ) {
      await updatePrivacyCommitmentStatus(key, keyId, details.id, "spent");
    }
  }
}

/** Apply the exact replacement commitment after its Withdrawn event is verified. */
export async function applyPrivacyCommitmentWithdrawal(
  key: CryptoKey,
  keyId: string,
  input: {
    commitmentId: string;
    expectedRevision: number;
    expectedCommitment: string;
    expectedBalanceWei: string;
    expectedWithdrawalIndex: string;
    newCommitment: string;
    newBalanceWei: string;
    newWithdrawalIndex: string;
  },
): Promise<void> {
  const records = await readPrivacyCommitmentRecords();
  const current = records.find((record) => record.id === input.commitmentId);
  if (
    !current || current.keyId !== keyId ||
    current.revision !== input.expectedRevision
  ) throw new Error("Private commitment changed during Unshield");
  const details = await decryptPrivacyCommitmentDetails(key, current);
  if (
    !details || details.commitment !== input.expectedCommitment ||
    details.balanceWei !== input.expectedBalanceWei ||
    details.withdrawalIndex !== input.expectedWithdrawalIndex ||
    details.status !== "withdrawal_pending"
  ) throw new Error("Private commitment changed during Unshield");
  const balance = BigInt(input.newBalanceWei);
  const nextDetails: PrivacyCommitmentDetailsV1 = {
    ...details,
    commitment: input.newCommitment,
    balanceWei: input.newBalanceWei,
    withdrawalIndex: input.newWithdrawalIndex,
    status: balance === 0n ? "spent" : "private_ready",
  };
  const header = {
    version: 1 as const,
    id: current.id,
    keyId,
    revision: current.revision + 1,
    createdAt: current.createdAt,
    updatedAt: Math.max(Date.now(), current.updatedAt),
  };
  const next: StoredPrivacyCommitmentV1 = {
    ...header,
    encryptedDetails: await encryptPrivacyCommitmentDetails(key, header, nextDetails),
  };
  const database = await openDatabase();
  const transaction = database.transaction(PRIVACY_COMMITMENTS_STORE, "readwrite");
  const completion = complete(transaction);
  const store = transaction.objectStore(PRIVACY_COMMITMENTS_STORE);
  try {
    const latest = await result(store.get(current.id));
    if (
      !isValidStoredPrivacyCommitment(latest) ||
      latest.keyId !== keyId || latest.revision !== current.revision
    ) throw new Error("Private commitment changed during Unshield");
    store.put(next);
    await completion;
  } catch (error) {
    try { transaction.abort(); } catch { /* settled */ }
    await completion.catch(() => undefined);
    throw error;
  }
}

/** Finalize a public recovery only after its exact Ragequit event is verified. */
export async function applyPrivacyCommitmentRagequit(
  key: CryptoKey,
  keyId: string,
  input: {
    commitmentId: string;
    expectedRevision: number;
    expectedCommitment: string;
    expectedBalanceWei: string;
  },
): Promise<void> {
  const records = await readPrivacyCommitmentRecords();
  const current = records.find((record) => record.id === input.commitmentId);
  if (!current || current.keyId !== keyId) {
    throw new Error("Private commitment changed during public recovery");
  }
  const details = await decryptPrivacyCommitmentDetails(key, current);
  if (
    current.revision === input.expectedRevision + 1 &&
    details?.status === "ragequit_recovered" &&
    details.balanceWei === "0" &&
    details.commitment === input.expectedCommitment
  ) return;
  if (
    current.revision !== input.expectedRevision || !details ||
    details.commitment !== input.expectedCommitment ||
    details.balanceWei !== input.expectedBalanceWei ||
    details.status !== "ragequit_pending"
  ) {
    throw new Error("Private commitment changed during public recovery");
  }
  const nextDetails: PrivacyCommitmentDetailsV1 = {
    ...details,
    balanceWei: "0",
    status: "ragequit_recovered",
  };
  const header = {
    version: 1 as const,
    id: current.id,
    keyId,
    revision: current.revision + 1,
    createdAt: current.createdAt,
    updatedAt: Math.max(Date.now(), current.updatedAt),
  };
  const next: StoredPrivacyCommitmentV1 = {
    ...header,
    encryptedDetails: await encryptPrivacyCommitmentDetails(key, header, nextDetails),
  };
  const database = await openDatabase();
  const transaction = database.transaction(PRIVACY_COMMITMENTS_STORE, "readwrite");
  const completion = complete(transaction);
  const store = transaction.objectStore(PRIVACY_COMMITMENTS_STORE);
  try {
    const latest = await result(store.get(current.id));
    if (
      !isValidStoredPrivacyCommitment(latest) ||
      latest.keyId !== keyId ||
      latest.revision !== current.revision
    ) throw new Error("Private commitment changed during public recovery");
    store.put(next);
    await completion;
  } catch (error) {
    try { transaction.abort(); } catch { /* settled */ }
    await completion.catch(() => undefined);
    throw error;
  }
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Commitment transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("Commitment transaction failed"));
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Commitment storage unavailable"));
      return;
    }
    const request = indexedDB.open(
      PRIVACY_COMMITMENTS_DATABASE,
      PRIVACY_COMMITMENTS_DATABASE_VERSION,
    );
    request.onupgradeneeded = () => {
      request.result.createObjectStore(PRIVACY_COMMITMENTS_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Commitment storage failed"));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("Commitment storage blocked"));
    };
  });
  return databasePromise;
}

export async function readPrivacyCommitmentRecords(): Promise<StoredPrivacyCommitmentV1[]> {
  const database = await openDatabase();
  const transaction = database.transaction(PRIVACY_COMMITMENTS_STORE, "readonly");
  const completion = complete(transaction);
  const raw = await result(transaction.objectStore(PRIVACY_COMMITMENTS_STORE).getAll());
  await completion;
  if (
    !Array.isArray(raw) ||
    raw.length > MAX_PRIVACY_COMMITMENTS ||
    raw.some((record) => !isValidStoredPrivacyCommitment(record))
  ) {
    throw new Error("Invalid private commitment collection");
  }
  return raw;
}

export async function readPrivacyCommitments(
  key: CryptoKey,
  keyId: string,
): Promise<Array<{ record: StoredPrivacyCommitmentV1; details: PrivacyCommitmentDetailsV1 }>> {
  const records = await readPrivacyCommitmentRecords();
  const commitments = [];
  for (const record of records) {
    if (record.keyId !== keyId) throw new Error("Private commitment identity changed");
    const details = await decryptPrivacyCommitmentDetails(key, record);
    if (!details) throw new Error("Private commitment recovery failed");
    commitments.push({ record, details });
  }
  return commitments;
}

/** Idempotently insert one verified recovered commitment under the live privacy key. */
export async function upsertPrivacyCommitment(
  key: CryptoKey,
  keyId: string,
  details: PrivacyCommitmentDetailsV1,
): Promise<"created" | "existing"> {
  const existing = await readPrivacyCommitments(key, keyId);
  const same = existing.find((item) =>
    item.details.chainId === details.chainId &&
    item.details.commitment === details.commitment
  );
  if (same) {
    const immutableMatch =
      same.details.label === details.label &&
      same.details.valueWei === details.valueWei &&
      same.details.precommitment === details.precommitment &&
      same.details.depositIndex === details.depositIndex &&
      same.details.depositor.toLowerCase() === details.depositor.toLowerCase() &&
      same.details.depositTxHash.toLowerCase() === details.depositTxHash.toLowerCase();
    if (!immutableMatch) throw new Error("Private commitment collision");
    return "existing";
  }
  if (existing.length >= MAX_PRIVACY_COMMITMENTS) {
    throw new Error("Private commitment capacity reached");
  }
  const now = Date.now();
  const header = {
    version: 1 as const,
    id: details.id,
    keyId,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
  const record: StoredPrivacyCommitmentV1 = {
    ...header,
    encryptedDetails: await encryptPrivacyCommitmentDetails(key, header, details),
  };
  if (!isValidStoredPrivacyCommitment(record)) {
    throw new Error("Invalid private commitment record");
  }
  const database = await openDatabase();
  const transaction = database.transaction(PRIVACY_COMMITMENTS_STORE, "readwrite");
  const completion = complete(transaction);
  try {
    transaction.objectStore(PRIVACY_COMMITMENTS_STORE).add(record);
    await completion;
    return "created";
  } catch (error) {
    try { transaction.abort(); } catch { /* already settled */ }
    await completion.catch(() => undefined);
    throw error;
  }
}

export async function deletePrivacyCommitmentsDatabase(): Promise<void> {
  const existing = databasePromise;
  databasePromise = null;
  if (existing) (await existing.catch(() => null))?.close();
  if (typeof indexedDB === "undefined") return;
  await Promise.all(PRIVACY_COMMITMENTS_DATABASES.map((name) =>
    new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Commitment reset failed"));
      request.onblocked = () => reject(new Error("Commitment reset blocked"));
    })
  ));
}
