import {
  isValidPrivacyDepositEvent,
  isValidPrivacyEventCheckpoint,
  isValidPrivacyRagequitEvent,
  isValidPrivacyWithdrawalEvent,
  MAX_PRIVACY_DEPOSIT_EVENTS,
  MAX_PRIVACY_RAGEQUIT_EVENTS,
  MAX_PRIVACY_WITHDRAWAL_EVENTS,
  PRIVACY_DEPOSIT_EVENTS_STORE,
  PRIVACY_EVENT_CHECKPOINT_STORE,
  PRIVACY_PUBLIC_EVENTS_DATABASE,
  PRIVACY_PUBLIC_EVENTS_DATABASE_VERSION,
  PRIVACY_RAGEQUIT_EVENTS_STORE,
  PRIVACY_EVENT_CHECKPOINT_KEY,
  PRIVACY_WITHDRAWAL_EVENTS_STORE,
  type PrivacyDepositEventV1,
  type PrivacyEventCheckpointV1,
  type PrivacyPoolEventPageV1,
  type PrivacyRagequitEventV1,
  type PrivacyWithdrawalEventV1,
} from "./types";

let databasePromise: Promise<IDBDatabase> | null = null;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Privacy event request failed"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Privacy event transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("Privacy event transaction failed"));
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Privacy event storage unavailable"));
      return;
    }
    const request = indexedDB.open(
      PRIVACY_PUBLIC_EVENTS_DATABASE,
      PRIVACY_PUBLIC_EVENTS_DATABASE_VERSION,
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PRIVACY_DEPOSIT_EVENTS_STORE)) {
        const deposits = database.createObjectStore(PRIVACY_DEPOSIT_EVENTS_STORE, {
          keyPath: "id",
        });
        deposits.createIndex("by-precommitment", "precommitment", { unique: true });
        deposits.createIndex("by-block", "blockNumber", { unique: false });
      }
      if (!database.objectStoreNames.contains(PRIVACY_WITHDRAWAL_EVENTS_STORE)) {
        const withdrawals = database.createObjectStore(PRIVACY_WITHDRAWAL_EVENTS_STORE, {
          keyPath: "id",
        });
        withdrawals.createIndex("by-nullifier", "spentNullifier", { unique: true });
      }
      if (!database.objectStoreNames.contains(PRIVACY_RAGEQUIT_EVENTS_STORE)) {
        const ragequits = database.createObjectStore(PRIVACY_RAGEQUIT_EVENTS_STORE, {
          keyPath: "id",
        });
        ragequits.createIndex("by-commitment", "commitment", { unique: true });
      }
      if (!database.objectStoreNames.contains(PRIVACY_EVENT_CHECKPOINT_STORE)) {
        database.createObjectStore(PRIVACY_EVENT_CHECKPOINT_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Privacy event storage failed"));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("Privacy event storage blocked"));
    };
  });
  return databasePromise;
}

export async function readPrivacyEventCheckpoint(): Promise<PrivacyEventCheckpointV1 | null> {
  const database = await openDatabase();
  const transaction = database.transaction(PRIVACY_EVENT_CHECKPOINT_STORE, "readonly");
  const completion = transactionComplete(transaction);
  const raw = await requestResult(
    transaction.objectStore(PRIVACY_EVENT_CHECKPOINT_STORE).get(
      PRIVACY_EVENT_CHECKPOINT_KEY,
    ),
  );
  await completion;
  if (raw === undefined) return null;
  if (!isValidPrivacyEventCheckpoint(raw)) throw new Error("Invalid privacy event checkpoint");
  return raw;
}

/** Commit one bounded log page and its canonical checkpoint together. */
export async function commitPrivacyDepositEventPage(
  events: PrivacyDepositEventV1[],
  checkpoint: PrivacyEventCheckpointV1,
): Promise<void> {
  return commitPrivacyPoolEventPage(
    { deposits: events, withdrawals: [], ragequits: [] },
    checkpoint,
  );
}

export async function commitPrivacyPoolEventPage(
  events: PrivacyPoolEventPageV1,
  checkpoint: PrivacyEventCheckpointV1,
): Promise<void> {
  if (
    events.deposits.length + events.withdrawals.length + events.ragequits.length > 5_000 ||
    events.deposits.some((event) => !isValidPrivacyDepositEvent(event)) ||
    events.withdrawals.some((event) => !isValidPrivacyWithdrawalEvent(event)) ||
    events.ragequits.some((event) => !isValidPrivacyRagequitEvent(event)) ||
    !isValidPrivacyEventCheckpoint(checkpoint)
  ) {
    throw new Error("Invalid privacy event page");
  }
  const database = await openDatabase();
  const transaction = database.transaction(
    [
      PRIVACY_DEPOSIT_EVENTS_STORE,
      PRIVACY_WITHDRAWAL_EVENTS_STORE,
      PRIVACY_RAGEQUIT_EVENTS_STORE,
      PRIVACY_EVENT_CHECKPOINT_STORE,
    ],
    "readwrite",
  );
  const completion = transactionComplete(transaction);
  try {
    const deposits = transaction.objectStore(PRIVACY_DEPOSIT_EVENTS_STORE);
    const withdrawals = transaction.objectStore(PRIVACY_WITHDRAWAL_EVENTS_STORE);
    const ragequits = transaction.objectStore(PRIVACY_RAGEQUIT_EVENTS_STORE);
    const [depositCount, withdrawalCount, ragequitCount] = await Promise.all([
      requestResult(deposits.count()),
      requestResult(withdrawals.count()),
      requestResult(ragequits.count()),
    ]);
    if (
      depositCount + events.deposits.length > MAX_PRIVACY_DEPOSIT_EVENTS ||
      withdrawalCount + events.withdrawals.length > MAX_PRIVACY_WITHDRAWAL_EVENTS ||
      ragequitCount + events.ragequits.length > MAX_PRIVACY_RAGEQUIT_EVENTS
    ) {
      throw new Error("Privacy event storage capacity reached");
    }
    for (const event of events.deposits) deposits.put(event);
    for (const event of events.withdrawals) withdrawals.put(event);
    for (const event of events.ragequits) ragequits.put(event);
    transaction.objectStore(PRIVACY_EVENT_CHECKPOINT_STORE).put(checkpoint);
    await completion;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // It may already be complete or aborted.
    }
    await completion.catch(() => undefined);
    throw error;
  }
}

async function listEvents<T>(
  storeName: string,
  maximum: number,
  validator: (value: unknown) => value is T,
): Promise<T[]> {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const completion = transactionComplete(transaction);
  const raw = await requestResult(transaction.objectStore(storeName).getAll());
  await completion;
  if (!Array.isArray(raw) || raw.length > maximum || raw.some((event) => !validator(event))) {
    throw new Error("Invalid privacy event collection");
  }
  return raw;
}

export function listPrivacyWithdrawalEvents(): Promise<PrivacyWithdrawalEventV1[]> {
  return listEvents(
    PRIVACY_WITHDRAWAL_EVENTS_STORE,
    MAX_PRIVACY_WITHDRAWAL_EVENTS,
    isValidPrivacyWithdrawalEvent,
  );
}

export function listPrivacyRagequitEvents(): Promise<PrivacyRagequitEventV1[]> {
  return listEvents(
    PRIVACY_RAGEQUIT_EVENTS_STORE,
    MAX_PRIVACY_RAGEQUIT_EVENTS,
    isValidPrivacyRagequitEvent,
  );
}

export async function findPrivacyDepositEventByPrecommitment(
  precommitment: string,
): Promise<PrivacyDepositEventV1 | null> {
  const database = await openDatabase();
  const transaction = database.transaction(PRIVACY_DEPOSIT_EVENTS_STORE, "readonly");
  const completion = transactionComplete(transaction);
  const raw = await requestResult(
    transaction
      .objectStore(PRIVACY_DEPOSIT_EVENTS_STORE)
      .index("by-precommitment")
      .get(precommitment),
  );
  await completion;
  if (raw === undefined) return null;
  if (!isValidPrivacyDepositEvent(raw)) throw new Error("Invalid privacy deposit event");
  return raw;
}

export async function listPrivacyDepositEvents(): Promise<PrivacyDepositEventV1[]> {
  const database = await openDatabase();
  const transaction = database.transaction(PRIVACY_DEPOSIT_EVENTS_STORE, "readonly");
  const completion = transactionComplete(transaction);
  const raw = await requestResult(
    transaction.objectStore(PRIVACY_DEPOSIT_EVENTS_STORE).getAll(),
  );
  await completion;
  if (!Array.isArray(raw) || raw.length > MAX_PRIVACY_DEPOSIT_EVENTS) {
    throw new Error("Invalid privacy deposit event collection");
  }
  if (raw.some((event) => !isValidPrivacyDepositEvent(event))) {
    throw new Error("Invalid privacy deposit event");
  }
  return raw;
}

export async function clearPrivacyPublicEventCache(): Promise<void> {
  const existing = databasePromise;
  databasePromise = null;
  if (existing) (await existing.catch(() => null))?.close();
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(PRIVACY_PUBLIC_EVENTS_DATABASE);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Privacy event reset failed"));
    request.onblocked = () => reject(new Error("Privacy event reset blocked"));
  });
}
