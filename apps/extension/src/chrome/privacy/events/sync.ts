import { RpcResponseError } from "../../network/rpcClient";
import { resolvePrivacyPoolsRpcUrl } from "../deployment/health";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
import {
  MAX_PRIVACY_EVENT_BLOCKS_PER_REQUEST,
  readPrivacyBlockHash,
  readPrivacyPoolEvents,
  readPrivacyLatestBlock,
} from "./client";
import {
  clearPrivacyPublicEventCache,
  commitPrivacyPoolEventPage,
  readPrivacyEventCheckpoint,
} from "./repository";
import { PRIVACY_EVENT_CHECKPOINT_KEY } from "./types";

const CONFIRMATIONS = 12n;
const INITIAL_CHUNK_SIZE = MAX_PRIVACY_EVENT_BLOCKS_PER_REQUEST;
const MIN_CHUNK_SIZE = 100n;
const MAX_CHUNKS_PER_RUN = 64;

export interface PrivacyEventSyncResult {
  chainId: typeof PRIVACY_POOLS_DEPLOYMENT.chainId;
  status: "current" | "partial";
  safeHead: string;
  nextBlock: string;
  eventsAdded: number;
  lastSyncAt: number;
}

let activeSync: Promise<PrivacyEventSyncResult> | null = null;

export function shouldShrinkPrivacyEventPage(error: unknown): boolean {
  if (!(error instanceof RpcResponseError)) return false;
  const message = error.message.toLowerCase();
  return (
    error.code === -32_005 ||
    error.code === -32_602
  ) && (
    message.includes("block") ||
    message.includes("range") ||
    message.includes("response size")
  );
}

async function syncPrivacyDepositEventsInternal(): Promise<PrivacyEventSyncResult> {
  const rpcUrl = await resolvePrivacyPoolsRpcUrl();
  let checkpoint = await readPrivacyEventCheckpoint();
  if (checkpoint) {
    const canonicalHash = await readPrivacyBlockHash(
      rpcUrl,
      BigInt(checkpoint.lastBlockNumber),
    );
    if (canonicalHash.toLowerCase() !== checkpoint.lastBlockHash.toLowerCase()) {
      await clearPrivacyPublicEventCache();
      checkpoint = null;
    }
  }

  const latest = await readPrivacyLatestBlock(rpcUrl);
  const safeHead = latest > CONFIRMATIONS ? latest - CONFIRMATIONS : 0n;
  let nextBlock = checkpoint
    ? BigInt(checkpoint.nextBlock)
    : PRIVACY_POOLS_DEPLOYMENT.deploymentBlock;
  let chunkSize = INITIAL_CHUNK_SIZE;
  let chunks = 0;
  let eventsAdded = 0;
  let lastSyncAt = checkpoint?.lastSyncAt ?? 0;

  while (nextBlock <= safeHead && chunks < MAX_CHUNKS_PER_RUN) {
    const toBlock = nextBlock + chunkSize - 1n > safeHead
      ? safeHead
      : nextBlock + chunkSize - 1n;
    let events;
    try {
      events = await readPrivacyPoolEvents(rpcUrl, nextBlock, toBlock);
    } catch (error) {
      if (
        chunkSize <= MIN_CHUNK_SIZE ||
        !shouldShrinkPrivacyEventPage(error)
      ) throw error;
      chunkSize = chunkSize / 2n < MIN_CHUNK_SIZE
        ? MIN_CHUNK_SIZE
        : chunkSize / 2n;
      continue;
    }
    const blockHash = await readPrivacyBlockHash(rpcUrl, toBlock);
    lastSyncAt = Date.now();
    await commitPrivacyPoolEventPage(events, {
      version: 1,
      key: PRIVACY_EVENT_CHECKPOINT_KEY,
      chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
      nextBlock: (toBlock + 1n).toString(),
      lastBlockNumber: toBlock.toString(),
      lastBlockHash: blockHash,
      lastSyncAt,
    });
    eventsAdded += events.deposits.length + events.withdrawals.length + events.ragequits.length;
    nextBlock = toBlock + 1n;
    chunks += 1;
  }

  return {
    chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
    status: nextBlock > safeHead ? "current" : "partial",
    safeHead: safeHead.toString(),
    nextBlock: nextBlock.toString(),
    eventsAdded,
    lastSyncAt,
  };
}

/** One bounded global active-pool event sync at a time. */
export function syncPrivacyDepositEvents(): Promise<PrivacyEventSyncResult> {
  if (activeSync) return activeSync;
  activeSync = syncPrivacyDepositEventsInternal().finally(() => {
    activeSync = null;
  });
  return activeSync;
}
