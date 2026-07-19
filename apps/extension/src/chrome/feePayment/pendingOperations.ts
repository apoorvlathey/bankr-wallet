import type { Address, Hex } from "./pimlicoTypes";
import { withStorageLock } from "../storageLock";

export const PENDING_USER_OPERATIONS_STORAGE_KEY = "pendingUserOperations";
const MAX_PENDING_USER_OPERATIONS = 50;
const PENDING_USER_OPERATIONS_STORAGE_LOCK_KEY =
  "local:pendingUserOperations";

export interface PendingUserOperation {
  version: 1;
  family: "transaction" | "batchTransaction";
  txId: string;
  userOperationHash: Hex;
  sender: Address;
  chainId: number;
  createdAt: number;
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
    .filter(
      (record): record is PendingUserOperation =>
        record?.version === 1 &&
        (record.family === "transaction" ||
          record.family === "batchTransaction") &&
        typeof record.txId === "string" &&
        /^0x[0-9a-fA-F]{64}$/.test(record.userOperationHash) &&
        /^0x[0-9a-fA-F]{40}$/.test(record.sender) &&
        Number.isSafeInteger(record.chainId) &&
        Number.isSafeInteger(record.createdAt),
    )
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
