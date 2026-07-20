import type { AssetTransferRecord, CompletedTransaction, NftTransferRecord } from "./types";
import type { TxHistoryCursor, TxHistoryPage } from "./queryTypes";
import {
  compactHistoryTransaction,
  type StoredTransaction,
  type StoredTransfer,
} from "./recordCodec";

export const HISTORY_DATABASE_NAME = "walletchan-history";
const DATABASE_VERSION = 2;
const TRANSACTIONS_STORE = "transactions";
const TRANSFERS_STORE = "assetTransfers";
const LEGACY_HISTORY_KEY = "txHistory";

export const HISTORY_PAGE_SIZE = 30;
export const MAX_SETTLED_PER_OWNER_CHAIN = 1_000;
export const MAX_HISTORY_BYTES = 50 * 1024 * 1024;

let databasePromise: Promise<IDBDatabase> | null = null;
let migrationPromise: Promise<void> | null = null;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("History transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("History transaction failed"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(HISTORY_DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const transactions = database.objectStoreNames.contains(TRANSACTIONS_STORE)
        ? request.transaction!.objectStore(TRANSACTIONS_STORE)
        : database.createObjectStore(TRANSACTIONS_STORE, { keyPath: "id" });
      const indexes: Array<[string, string[]]> = [
        ["byCreated", ["createdAt", "id"]],
        ["byChainCreated", ["chainId", "createdAt", "id"]],
        ["byOwnerCreated", ["ownerAddress", "createdAt", "id"]],
        ["byOwnerChainCreated", ["ownerAddress", "chainId", "createdAt", "id"]],
        ["byStatusCreated", ["status", "createdAt", "id"]],
      ];
      for (const [name, keyPath] of indexes) {
        if (!transactions.indexNames.contains(name)) transactions.createIndex(name, keyPath);
      }
      const transfers = database.objectStoreNames.contains(TRANSFERS_STORE)
        ? request.transaction!.objectStore(TRANSFERS_STORE)
        : database.createObjectStore(TRANSFERS_STORE, { keyPath: "key" });
      if (!transfers.indexNames.contains("byTx")) {
        transfers.createIndex("byTx", ["txId", "leg", "index"]);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Could not open transaction history"));
    };
  });
  return databasePromise;
}

async function deleteTransferRows(
  store: IDBObjectStore,
  txId: string,
): Promise<void> {
  const index = store.index("byTx");
  const range = IDBKeyRange.bound(
    [txId, "", 0],
    [txId, "\uffff", Number.MAX_SAFE_INTEGER],
  );
  await new Promise<void>((resolve, reject) => {
    const request = index.openKeyCursor(range);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
  });
}

async function putCompacted(transaction: CompletedTransaction): Promise<void> {
  const database = await openDatabase();
  const compacted = compactHistoryTransaction(transaction);
  const dbTransaction = database.transaction(
    [TRANSACTIONS_STORE, TRANSFERS_STORE],
    "readwrite",
  );
  const transactionStore = dbTransaction.objectStore(TRANSACTIONS_STORE);
  const transferStore = dbTransaction.objectStore(TRANSFERS_STORE);
  transactionStore.put(compacted.transaction);
  await deleteTransferRows(transferStore, transaction.id);
  for (const transfer of compacted.transfers) transferStore.put(transfer);
  await transactionDone(dbTransaction);
}

async function migrateLegacyHistory(): Promise<void> {
  const stored = await chrome.storage.local.get(LEGACY_HISTORY_KEY);
  const legacy = stored[LEGACY_HISTORY_KEY];
  if (!Array.isArray(legacy)) return;
  for (const candidate of legacy) {
    if (!candidate || typeof candidate !== "object") continue;
    const transaction = candidate as CompletedTransaction;
    if (
      typeof transaction.id !== "string" ||
      typeof transaction.tx?.from !== "string" ||
      !Number.isFinite(transaction.createdAt) ||
      !Number.isSafeInteger(transaction.chainId)
    ) continue;
    await putCompacted(transaction);
  }
  await chrome.storage.local.remove(LEGACY_HISTORY_KEY);
}

export async function initializeHistoryDatabase(): Promise<void> {
  await openDatabase();
  if (!migrationPromise) {
    migrationPromise = migrateLegacyHistory().catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }
  await migrationPromise;
}

async function allStoredTransactions(): Promise<StoredTransaction[]> {
  const database = await openDatabase();
  const transaction = database.transaction(TRANSACTIONS_STORE, "readonly");
  return requestResult(
    transaction.objectStore(TRANSACTIONS_STORE).getAll() as IDBRequest<StoredTransaction[]>,
  );
}

async function deleteTransactions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const database = await openDatabase();
  const transaction = database.transaction(
    [TRANSACTIONS_STORE, TRANSFERS_STORE],
    "readwrite",
  );
  const transactions = transaction.objectStore(TRANSACTIONS_STORE);
  const transfers = transaction.objectStore(TRANSFERS_STORE);
  for (const id of ids) {
    transactions.delete(id);
    await deleteTransferRows(transfers, id);
  }
  await transactionDone(transaction);
}

async function enforceRetention(): Promise<void> {
  const transactions = await allStoredTransactions();
  const settled = transactions.filter(
    (entry) =>
      entry.status === "success" ||
      entry.status === "failed" ||
      entry.status === "dropped",
  );
  const remove = new Set<string>();
  const groups = new Map<string, StoredTransaction[]>();
  for (const entry of settled) {
    const key = `${entry.ownerAddress}:${entry.chainId}`;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
    for (const entry of group.slice(MAX_SETTLED_PER_OWNER_CHAIN)) remove.add(entry.id);
  }
  await deleteTransactions([...remove]);

  const remaining = (await allStoredTransactions()).filter(
    (entry) => !remove.has(entry.id),
  );
  const database = await openDatabase();
  const read = database.transaction(TRANSFERS_STORE, "readonly");
  const transfers = await requestResult(
    read.objectStore(TRANSFERS_STORE).getAll() as IDBRequest<StoredTransfer[]>,
  );
  let total = remaining.reduce((sum, entry) => sum + entry.sizeBytes, 0) +
    transfers.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  if (total <= MAX_HISTORY_BYTES) return;

  const transferBytes = new Map<string, number>();
  for (const transfer of transfers) {
    transferBytes.set(
      transfer.txId,
      (transferBytes.get(transfer.txId) ?? 0) + transfer.sizeBytes,
    );
  }
  const oldest = remaining
    .filter(
      (entry) =>
        entry.status === "success" ||
        entry.status === "failed" ||
        entry.status === "dropped",
    )
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const budgetRemovals: string[] = [];
  for (const entry of oldest) {
    if (total <= MAX_HISTORY_BYTES) break;
    total -= entry.sizeBytes + (transferBytes.get(entry.id) ?? 0);
    budgetRemovals.push(entry.id);
  }
  await deleteTransactions(budgetRemovals);
}

export async function putHistoryTransaction(
  transaction: CompletedTransaction,
): Promise<void> {
  await initializeHistoryDatabase();
  await putCompacted(transaction);
  await enforceRetention();
}

async function hydrateTransaction(
  transaction: StoredTransaction,
): Promise<CompletedTransaction> {
  const database = await openDatabase();
  const read = database.transaction(TRANSFERS_STORE, "readonly");
  const store = read.objectStore(TRANSFERS_STORE).index("byTx");
  const range = IDBKeyRange.bound(
    [transaction.id, "", 0],
    [transaction.id, "\uffff", Number.MAX_SAFE_INTEGER],
  );
  const transfers = await requestResult(
    store.getAll(range) as IDBRequest<StoredTransfer[]>,
  );
  const result = structuredClone(transaction) as StoredTransaction;
  delete (result as Partial<StoredTransaction>).ownerAddress;
  delete (result as Partial<StoredTransaction>).sizeBytes;
  for (const leg of ["source", "destination"] as const) {
    const header = leg === "source" ? result.assetChanges : result.destAssetChanges;
    if (!header) continue;
    const rows = transfers.filter((entry) => entry.leg === leg);
    header.erc20Transfers = rows
      .filter((entry) => entry.kind === "erc20")
      .map((entry) => entry.record as AssetTransferRecord);
    header.nftTransfers = rows
      .filter((entry) => entry.kind === "nft")
      .map((entry) => entry.record as NftTransferRecord);
  }
  return result;
}

export async function readHistoryTransaction(
  id: string,
  hydrate = true,
): Promise<CompletedTransaction | null> {
  await initializeHistoryDatabase();
  const database = await openDatabase();
  const transaction = database.transaction(TRANSACTIONS_STORE, "readonly");
  const stored = await requestResult(
    transaction.objectStore(TRANSACTIONS_STORE).get(id) as IDBRequest<StoredTransaction | undefined>,
  );
  if (!stored) return null;
  if (hydrate) return hydrateTransaction(stored);
  const compact = structuredClone(stored);
  delete (compact as Partial<StoredTransaction>).ownerAddress;
  delete (compact as Partial<StoredTransaction>).sizeBytes;
  return compact;
}

export async function readAllHistoryTransactions(): Promise<CompletedTransaction[]> {
  await initializeHistoryDatabase();
  const transactions = await allStoredTransactions();
  return transactions
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
    .map((entry) => {
      const compact = structuredClone(entry);
      delete (compact as Partial<StoredTransaction>).ownerAddress;
      delete (compact as Partial<StoredTransaction>).sizeBytes;
      return compact;
    });
}

export async function queryHistoryPage(options: {
  ownerAddress?: string;
  chainId?: number | null;
  cursor?: TxHistoryCursor | null;
  limit?: number;
}): Promise<TxHistoryPage> {
  await initializeHistoryDatabase();
  const owner = options.ownerAddress?.toLowerCase();
  const limit = Math.max(1, Math.min(options.limit ?? HISTORY_PAGE_SIZE, 100));
  const database = await openDatabase();
  const read = database.transaction(TRANSACTIONS_STORE, "readonly");
  const store = read.objectStore(TRANSACTIONS_STORE);
  const chainId = options.chainId;
  let source: IDBIndex;
  let prefix: Array<string | number>;
  if (owner && chainId != null) {
    source = store.index("byOwnerChainCreated");
    prefix = [owner, chainId];
  } else if (owner) {
    source = store.index("byOwnerCreated");
    prefix = [owner];
  } else if (chainId != null) {
    source = store.index("byChainCreated");
    prefix = [chainId];
  } else {
    source = store.index("byCreated");
    prefix = [];
  }
  const lower = [...prefix, 0, ""];
  const upper = options.cursor
    ? [...prefix, options.cursor.createdAt, options.cursor.id]
    : [...prefix, Number.MAX_SAFE_INTEGER, "\uffff"];
  const range = IDBKeyRange.bound(lower, upper, false, Boolean(options.cursor));
  const stored = await new Promise<StoredTransaction[]>((resolve, reject) => {
    const items: StoredTransaction[] = [];
    const request = source.openCursor(range, "prev");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || items.length > limit) {
        resolve(items);
        return;
      }
      items.push(cursor.value as StoredTransaction);
      cursor.continue();
    };
  });
  const hasMore = stored.length > limit;
  const items = stored.slice(0, limit).map((entry) => {
    const compact = structuredClone(entry);
    delete (compact as Partial<StoredTransaction>).ownerAddress;
    delete (compact as Partial<StoredTransaction>).sizeBytes;
    return compact;
  });
  const last = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}

export async function updateHistoryTransaction(
  id: string,
  updates: Partial<CompletedTransaction>,
): Promise<CompletedTransaction | null> {
  const current = await readHistoryTransaction(id, true);
  if (!current) return null;
  const next = { ...current, ...updates };
  await putHistoryTransaction(next);
  return readHistoryTransaction(id, true);
}

export async function removeHistoryTransactions(ids: string[]): Promise<void> {
  await initializeHistoryDatabase();
  await deleteTransactions(ids);
}

export async function clearHistoryDatabase(): Promise<void> {
  if (typeof indexedDB === "undefined") {
    await chrome.storage.local.remove(LEGACY_HISTORY_KEY);
    return;
  }
  const database = await openDatabase();
  const transaction = database.transaction(
    [TRANSACTIONS_STORE, TRANSFERS_STORE],
    "readwrite",
  );
  transaction.objectStore(TRANSACTIONS_STORE).clear();
  transaction.objectStore(TRANSFERS_STORE).clear();
  await transactionDone(transaction);
  await chrome.storage.local.remove(LEGACY_HISTORY_KEY);
}

/** Test-only connection reset; production reset clears records without deleting schema. */
export async function resetHistoryDatabaseConnectionForTests(): Promise<void> {
  const database = await databasePromise?.catch(() => null);
  database?.close();
  databasePromise = null;
  migrationPromise = null;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(HISTORY_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("History database deletion blocked"));
  });
}
