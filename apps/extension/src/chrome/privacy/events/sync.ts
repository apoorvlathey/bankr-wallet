import { resolvePrivacyPoolsSepoliaRpcUrl } from "../deployment/health";
import { PRIVACY_POOLS_SEPOLIA_DEPLOYMENT } from "../deployment/manifest";
import {
  readPrivacyBlockHash,
  readPrivacyPoolEvents,
  readPrivacyLatestBlock,
} from "./client";
import {
  clearPrivacyPublicEventCache,
  commitPrivacyPoolEventPage,
  readPrivacyEventCheckpoint,
} from "./repository";

const CONFIRMATIONS = 12n;
const INITIAL_CHUNK_SIZE = 50_000n;
const MIN_CHUNK_SIZE = 1_000n;
const MAX_CHUNKS_PER_RUN = 64;

export interface PrivacyEventSyncResult {
  chainId: 11_155_111;
  status: "current" | "partial";
  safeHead: string;
  nextBlock: string;
  eventsAdded: number;
  lastSyncAt: number;
}

let activeSync: Promise<PrivacyEventSyncResult> | null = null;

async function syncPrivacyDepositEventsInternal(): Promise<PrivacyEventSyncResult> {
  const rpcUrl = await resolvePrivacyPoolsSepoliaRpcUrl();
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
    : PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.deploymentBlock;
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
      if (chunkSize <= MIN_CHUNK_SIZE) throw error;
      chunkSize = chunkSize / 2n < MIN_CHUNK_SIZE
        ? MIN_CHUNK_SIZE
        : chunkSize / 2n;
      continue;
    }
    const blockHash = await readPrivacyBlockHash(rpcUrl, toBlock);
    lastSyncAt = Date.now();
    await commitPrivacyPoolEventPage(events, {
      version: 1,
      key: "sepolia-pool-events",
      chainId: 11_155_111,
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
    chainId: 11_155_111,
    status: nextBlock > safeHead ? "current" : "partial",
    safeHead: safeHead.toString(),
    nextBlock: nextBlock.toString(),
    eventsAdded,
    lastSyncAt,
  };
}

/** One bounded global Sepolia deposit sync at a time. */
export function syncPrivacyDepositEvents(): Promise<PrivacyEventSyncResult> {
  if (activeSync) return activeSync;
  activeSync = syncPrivacyDepositEventsInternal().finally(() => {
    activeSync = null;
  });
  return activeSync;
}
