/** Durable user-assembled cross-dapp batch storage. */
import type { TransactionParams } from "../bankr/submission";

const STORAGE_KEY = "crossDappBatch";

export type CrossDappBatchEntrySource =
  | { kind: "eth_sendTransaction" }
  | {
      kind: "wallet_sendCalls";
      bundleId: string;
      callIndex: number;
      totalCalls: number;
    };

export interface CrossDappBatchEntry {
  txId: string;
  tx: TransactionParams;
  origin: string;
  favicon: string | null;
  addedAt: number;
  source?: CrossDappBatchEntrySource;
  tabId?: number;
  frameId?: number;
  senderOrigin?: string;
  requestChainId?: number;
  walletConnect?: {
    topic: string;
    requestId: number;
    method: string;
  };
  trustedInternal?: true;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  bankrCredentialTag?: string;
}

export interface CrossDappBatch {
  fromAddress: string;
  chainId: number;
  chainName: string;
  accountType: "bankr" | "privateKey" | "seedPhrase";
  entries: CrossDappBatchEntry[];
  createdAt: number;
  accountId?: string;
}

export async function getCrossDappBatch(): Promise<CrossDappBatch | null> {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return (data[STORAGE_KEY] as CrossDappBatch | undefined) ?? null;
}

export async function setCrossDappBatch(
  batch: CrossDappBatch,
): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: batch });
  const { updateBadge } = await import("../requests/pendingTxStorage");
  await updateBadge();
}

export async function updateEntryDataInCrossDappBatch(
  txId: string,
  newData: string,
): Promise<{ success: boolean; error?: string }> {
  const batch = await getCrossDappBatch();
  if (!batch) return { success: false, error: "No active batch" };

  const index = batch.entries.findIndex((entry) => entry.txId === txId);
  if (index === -1) {
    return { success: false, error: "Entry not found in batch" };
  }
  if (!/^0x[0-9a-fA-F]*$/.test(newData)) {
    return { success: false, error: "Invalid calldata hex" };
  }
  const entries = batch.entries.map((entry, entryIndex) =>
    entryIndex === index
      ? { ...entry, tx: { ...entry.tx, data: newData } }
      : entry,
  );
  await setCrossDappBatch({ ...batch, entries });
  return { success: true };
}

export async function clearCrossDappBatch(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
  const { updateBadge } = await import("../requests/pendingTxStorage");
  await updateBadge();
}
