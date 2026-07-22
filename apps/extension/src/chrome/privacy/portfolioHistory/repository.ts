import { formatEther } from "viem";
import { fetchNativePrice } from "../../gasEstimation";
import { getCachedPrivacyKey } from "../../sessionCache";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
import { readPrivacyVault } from "../repository";
import { verifyPrivacyVaultWithKey } from "../vault";
import {
  clearReleasedPrivacyPortfolioView,
  readReleasedPrivacyPortfolioView,
  storeReleasedPrivacyPortfolioSeries,
} from "../portfolioViewCache";
import {
  decryptPrivacyPortfolioSnapshot,
  encryptPrivacyPortfolioSnapshot,
} from "./crypto";
import {
  isValidStoredPrivacyPortfolioSnapshot,
  MAX_PRIVACY_PORTFOLIO_SNAPSHOTS,
  PRIVACY_PORTFOLIO_DATABASE,
  PRIVACY_PORTFOLIO_DATABASES,
  PRIVACY_PORTFOLIO_DATABASE_VERSION,
  PRIVACY_PORTFOLIO_RETENTION_MS,
  PRIVACY_PORTFOLIO_SAMPLE_INTERVAL_MS,
  PRIVACY_PORTFOLIO_STORE,
  type PrivacyPortfolioSnapshotDetailsV1,
  type StoredPrivacyPortfolioSnapshotV1,
} from "./types";

export interface PrivacyPortfolioSeries {
  priceUsd: number | null;
  totalValueUsd: number | null;
  snapshots: Array<{ timestamp: number; totalValueUsd: number }>;
}

let databasePromise: Promise<IDBDatabase> | null = null;
let seriesLock = Promise.resolve<PrivacyPortfolioSeries>({
  priceUsd: null,
  totalValueUsd: null,
  snapshots: [],
});

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Private portfolio storage failed"));
  });
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("Private portfolio transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("Private portfolio transaction failed"));
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Private portfolio storage unavailable"));
      return;
    }
    const request = indexedDB.open(PRIVACY_PORTFOLIO_DATABASE, PRIVACY_PORTFOLIO_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PRIVACY_PORTFOLIO_STORE)) {
        db.createObjectStore(PRIVACY_PORTFOLIO_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Private portfolio storage unavailable"));
    };
  });
  return databasePromise;
}

async function readRecords(): Promise<StoredPrivacyPortfolioSnapshotV1[]> {
  const db = await openDatabase();
  const transaction = db.transaction(PRIVACY_PORTFOLIO_STORE, "readonly");
  const records = await result(transaction.objectStore(PRIVACY_PORTFOLIO_STORE).getAll());
  return records.filter(isValidStoredPrivacyPortfolioSnapshot);
}

async function commitRecord(
  record: StoredPrivacyPortfolioSnapshotV1 | null,
  deleteIds: readonly string[],
): Promise<void> {
  if (!record && deleteIds.length === 0) return;
  const db = await openDatabase();
  const transaction = db.transaction(PRIVACY_PORTFOLIO_STORE, "readwrite");
  const done = complete(transaction);
  const store = transaction.objectStore(PRIVACY_PORTFOLIO_STORE);
  for (const id of deleteIds) store.delete(id);
  if (record) store.put(record);
  await done;
}

export function privacyPortfolioSnapshotIdsInWindow(
  snapshots: readonly {
    record: Pick<StoredPrivacyPortfolioSnapshotV1, "id">;
    details: Pick<PrivacyPortfolioSnapshotDetailsV1, "timestamp">;
  }[],
  startedAt: number,
  endedAt: number,
): string[] {
  if (!Number.isSafeInteger(startedAt) || !Number.isSafeInteger(endedAt) ||
    startedAt < 0 || endedAt < startedAt) return [];
  return snapshots
    .filter(({ details }) => details.timestamp >= startedAt && details.timestamp <= endedAt)
    .map(({ record }) => record.id);
}

/** Remove chart points produced by a private reservation that never submitted. */
export function discardPrivacyPortfolioReservationWindow(
  key: CryptoKey,
  keyId: string,
  startedAt: number,
  endedAt: number,
): Promise<void> {
  const cleanup = seriesLock
    .catch(() => ({ priceUsd: null, totalValueUsd: null, snapshots: [] }))
    .then(async (current) => {
      const decrypted = (await Promise.all(
        (await readRecords())
          .filter((record) => record.keyId === keyId)
          .map(async (record) => ({
            record,
            details: await decryptPrivacyPortfolioSnapshot(key, record),
          })),
      )).filter((item): item is {
        record: StoredPrivacyPortfolioSnapshotV1;
        details: PrivacyPortfolioSnapshotDetailsV1;
      } => Boolean(item.details));
      await commitRecord(
        null,
        privacyPortfolioSnapshotIdsInWindow(decrypted, startedAt, endedAt),
      );
      return current;
    });
  seriesLock = cleanup;
  return cleanup.then(() => undefined);
}

async function readSeries(readyBalanceWei: string): Promise<PrivacyPortfolioSeries> {
  const [vault, privacyKey] = await Promise.all([
    readPrivacyVault(),
    Promise.resolve(getCachedPrivacyKey()),
  ]);
  if (vault.status !== "valid" || !privacyKey || privacyKey.keyId !== vault.record.keyId ||
    !(await verifyPrivacyVaultWithKey(vault.record, privacyKey.key))) {
    const released = await readReleasedPrivacyPortfolioView().catch(() => null);
    return released?.series ?? { priceUsd: null, totalValueUsd: null, snapshots: [] };
  }

  const [records, priceResult] = await Promise.all([
    readRecords(),
    fetchNativePrice(PRIVACY_POOLS_DEPLOYMENT.chainId).catch(() => null),
  ]);
  const decrypted = (await Promise.all(
    records
      .filter((record) => record.keyId === privacyKey.keyId)
      .map(async (record) => ({ record, details: await decryptPrivacyPortfolioSnapshot(privacyKey.key, record) })),
  )).filter((item): item is { record: StoredPrivacyPortfolioSnapshotV1; details: PrivacyPortfolioSnapshotDetailsV1 } => Boolean(item.details));
  decrypted.sort((left, right) => left.details.timestamp - right.details.timestamp);

  const now = Date.now();
  const cutoff = now - PRIVACY_PORTFOLIO_RETENTION_MS;
  const expiredIds = decrypted
    .filter((item) => item.details.timestamp < cutoff)
    .map((item) => item.record.id);
  let current = decrypted.filter((item) => item.details.timestamp >= cutoff);
  const priceUsd = typeof priceResult === "number" && Number.isFinite(priceResult) && priceResult > 0
    ? priceResult
    : current.at(-1)?.details.priceUsd ?? null;
  const totalValueUsd = priceUsd === null
    ? null
    : Number(formatEther(BigInt(readyBalanceWei))) * priceUsd;
  const last = current.at(-1)?.details;
  const shouldRecord = priceUsd !== null && totalValueUsd !== null &&
    (!last || last.confirmedBalanceWei !== readyBalanceWei || now - last.timestamp >= PRIVACY_PORTFOLIO_SAMPLE_INTERVAL_MS);

  let nextRecord: StoredPrivacyPortfolioSnapshotV1 | null = null;
  if (shouldRecord && priceUsd !== null && totalValueUsd !== null) {
    const id = crypto.randomUUID();
    const header = { version: 1 as const, id, keyId: privacyKey.keyId, createdAt: now };
    const details: PrivacyPortfolioSnapshotDetailsV1 = {
      version: 1,
      id,
      timestamp: now,
      // The V1 encrypted field name is retained; points now represent the
      // compliance-cleared balance used by the private-home headline.
      confirmedBalanceWei: readyBalanceWei,
      priceUsd,
      totalValueUsd,
    };
    nextRecord = {
      ...header,
      encryptedDetails: await encryptPrivacyPortfolioSnapshot(privacyKey.key, header, details),
    };
    current = [...current, { record: nextRecord, details }];
  }

  const overflow = Math.max(0, current.length - MAX_PRIVACY_PORTFOLIO_SNAPSHOTS);
  const overflowIds = current.slice(0, overflow).map((item) => item.record.id);
  const retained = current.slice(overflow);
  await commitRecord(nextRecord, [...expiredIds, ...overflowIds]);
  const series = {
    priceUsd,
    totalValueUsd,
    snapshots: retained.map(({ details }) => ({
      timestamp: details.timestamp,
      totalValueUsd: details.totalValueUsd,
    })),
  };
  await storeReleasedPrivacyPortfolioSeries(series).catch(() => undefined);
  return series;
}

export function readPrivacyPortfolioSeries(readyBalanceWei: string): Promise<PrivacyPortfolioSeries> {
  seriesLock = seriesLock.catch(() => ({ priceUsd: null, totalValueUsd: null, snapshots: [] })).then(
    () => readSeries(readyBalanceWei),
  );
  return seriesLock;
}

export async function deletePrivacyPortfolioDatabase(): Promise<void> {
  const existing = databasePromise;
  databasePromise = null;
  if (existing) (await existing.catch(() => null))?.close();
  await clearReleasedPrivacyPortfolioView();
  if (typeof indexedDB === "undefined") return;
  await Promise.all(PRIVACY_PORTFOLIO_DATABASES.map((name) =>
    new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onblocked = () => reject(new Error("Private portfolio storage is busy"));
      request.onerror = () => reject(request.error ?? new Error("Private portfolio reset failed"));
    })
  ));
}
