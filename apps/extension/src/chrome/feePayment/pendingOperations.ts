import type { Address, Hex } from "./pimlicoTypes";
import { withStorageLock } from "../storageLock";
import {
  parseCrossDappBatchResultRoute,
  type CrossDappBatchResultRoute,
} from "../crossDappBatch/resultRoute";

export const PENDING_USER_OPERATIONS_STORAGE_KEY = "pendingUserOperations";
const MAX_PENDING_USER_OPERATIONS = 50;
const PENDING_USER_OPERATIONS_STORAGE_LOCK_KEY =
  "local:pendingUserOperations";

export interface PendingUserOperation {
  version: 1;
  family:
    | "transaction"
    | "batchTransaction"
    | "crossDappBatch"
    | "safeExecution";
  txId: string;
  userOperationHash: Hex;
  sender: Address;
  chainId: number;
  createdAt: number;
  /** Public bounded result IDs needed to resume cross-dapp fan-out. */
  crossDappResultRoute?: CrossDappBatchResultRoute;
}

export async function getPendingUserOperations(): Promise<
  PendingUserOperation[]
> {
  const stored = await chrome.storage.local.get(
    PENDING_USER_OPERATIONS_STORAGE_KEY,
  );
  const value = stored[PENDING_USER_OPERATIONS_STORAGE_KEY];
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((record): PendingUserOperation[] => {
      const familyValid =
        record?.family === "transaction" ||
        record?.family === "batchTransaction" ||
        record?.family === "crossDappBatch" ||
        record?.family === "safeExecution";
      if (
        record?.version !== 1 ||
        !familyValid ||
        typeof record.txId !== "string" ||
        record.txId.length === 0 ||
        record.txId.length > 128 ||
        !/^0x[0-9a-fA-F]{64}$/.test(record.userOperationHash) ||
        !/^0x[0-9a-fA-F]{40}$/.test(record.sender) ||
        !Number.isSafeInteger(record.chainId) ||
        !Number.isSafeInteger(record.createdAt)
      ) {
        return [];
      }
      const crossDappResultRoute =
        record.family === "crossDappBatch"
          ? parseCrossDappBatchResultRoute(record.crossDappResultRoute)
          : null;
      if (record.family === "crossDappBatch" && !crossDappResultRoute) return [];
      return [{
        version: 1,
        family: record.family,
        txId: record.txId,
        userOperationHash: record.userOperationHash,
        sender: record.sender,
        chainId: record.chainId,
        createdAt: record.createdAt,
        ...(crossDappResultRoute ? { crossDappResultRoute } : {}),
      }];
    })
    .slice(-MAX_PENDING_USER_OPERATIONS);
}

export async function savePendingUserOperation(
  record: PendingUserOperation,
): Promise<void> {
  await withStorageLock(PENDING_USER_OPERATIONS_STORAGE_LOCK_KEY, async () => {
    const records = (await getPendingUserOperations()).filter(
      (candidate) => candidate.txId !== record.txId,
    );
    records.push(record);
    await chrome.storage.local.set({
      [PENDING_USER_OPERATIONS_STORAGE_KEY]: records.slice(
        -MAX_PENDING_USER_OPERATIONS,
      ),
    });
  });
}

export async function removePendingUserOperation(txId: string): Promise<void> {
  await withStorageLock(PENDING_USER_OPERATIONS_STORAGE_LOCK_KEY, async () => {
    const records = (await getPendingUserOperations()).filter(
      (candidate) => candidate.txId !== txId,
    );
    await chrome.storage.local.set({
      [PENDING_USER_OPERATIONS_STORAGE_KEY]: records,
    });
  });
}
