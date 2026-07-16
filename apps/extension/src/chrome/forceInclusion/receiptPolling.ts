import { FLASHBLOCKS_CHAIN_IDS } from "../../constants/networks";
import { getPendingConfirmationTxs, getTxById } from "../txHistoryStorage";
import { getReceiptPollingWindowMs } from "./broadcastPolicy";
import {
  checkAndFinalizeReceipt,
  clearReceiptObservationState,
} from "./receiptFinalizer";

const INITIAL_INTERVAL_MS = 2_000;
const MAX_INTERVAL_MS = 30_000;
const BACKOFF_FACTOR = 1.5;
const FLASHBLOCKS_FAST_INTERVAL_MS = 250;
const FLASHBLOCKS_FAST_PHASE_MS = 5_000;
const activePollers = new Set<string>();

export function startReceiptPolling(
  txId: string,
  txHash: string,
  chainId: number,
): void {
  if (activePollers.has(txId)) return;
  activePollers.add(txId);
  pollReceipt(txId, txHash, chainId).finally(() => {
    activePollers.delete(txId);
    clearReceiptObservationState(txId);
  });
}

async function pollReceipt(
  txId: string,
  txHash: string,
  chainId: number,
): Promise<void> {
  const startTime = Date.now();
  const maxPollDurationMs = getReceiptPollingWindowMs(
    await getTxById(txId),
    txHash,
  );
  if (FLASHBLOCKS_CHAIN_IDS.has(chainId)) {
    const fastPhaseEnd = startTime + FLASHBLOCKS_FAST_PHASE_MS;
    while (Date.now() < fastPhaseEnd) {
      await sleep(FLASHBLOCKS_FAST_INTERVAL_MS);
      if ((await checkAndFinalizeReceipt(txId, txHash, chainId)) !== null) return;
    }
  }
  let interval = INITIAL_INTERVAL_MS;
  while (Date.now() - startTime < maxPollDurationMs) {
    await sleep(interval);
    if ((await checkAndFinalizeReceipt(txId, txHash, chainId)) !== null) return;
    interval = Math.min(interval * BACKOFF_FACTOR, MAX_INTERVAL_MS);
  }
  await checkAndFinalizeReceipt(txId, txHash, chainId);
}

export async function checkPendingTxReceipt(
  txId: string,
  txHash: string,
  chainId: number,
): Promise<"success" | "failed" | null> {
  if (activePollers.has(txId)) return null;
  const result = await checkAndFinalizeReceipt(txId, txHash, chainId);
  return result === true ? "success" : result === false ? "failed" : null;
}

export async function resumePendingPollers(): Promise<void> {
  const pending = await getPendingConfirmationTxs();
  for (const tx of pending) {
    if (tx.txHash) startReceiptPolling(tx.id, tx.txHash, tx.chainId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
