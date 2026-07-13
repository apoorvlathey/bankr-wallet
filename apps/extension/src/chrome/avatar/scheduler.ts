import { AVATAR_MAX_CONCURRENT_FETCHES } from "./constants";

const inFlight = new Map<string, Promise<string | null>>();
const fetchQueue: Array<() => void> = [];
const activeControllers = new Set<AbortController>();
let activeFetches = 0;
let walletImageCacheEpoch = 0;

export function getAvatarImageCacheEpoch(): number {
  return walletImageCacheEpoch;
}

export function isAvatarImageCacheEpochCurrent(epoch: number): boolean {
  return epoch === walletImageCacheEpoch;
}

/** Register a request so reset can abort all old-wallet network effects. */
export function trackAvatarImageFetchController(
  controller: AbortController,
): () => void {
  activeControllers.add(controller);
  return () => activeControllers.delete(controller);
}

/** Abort and epoch-invalidate old-wallet work before reset clears storage. */
export function invalidateAvatarImageCacheForWalletReset(): void {
  walletImageCacheEpoch += 1;
  for (const controller of activeControllers) controller.abort();
  activeControllers.clear();
  inFlight.clear();
}

async function acquireFetchSlot(): Promise<void> {
  if (activeFetches < AVATAR_MAX_CONCURRENT_FETCHES) {
    activeFetches += 1;
    return;
  }
  await new Promise<void>((resolve) => fetchQueue.push(resolve));
}

function releaseFetchSlot(): void {
  const next = fetchQueue.shift();
  if (next) {
    next();
    return;
  }
  activeFetches = Math.max(0, activeFetches - 1);
}

async function runQueued(
  expectedEpoch: number,
  operation: () => Promise<string | null>,
): Promise<string | null> {
  await acquireFetchSlot();
  try {
    if (!isAvatarImageCacheEpochCurrent(expectedEpoch)) return null;
    return await operation();
  } catch {
    return null;
  } finally {
    releaseFetchSlot();
  }
}

/** Two-concurrent FIFO scheduler with same-URL single-flight sharing. */
export function scheduleAvatarImageFetch(
  url: string,
  expectedEpoch: number,
  operation: () => Promise<string | null>,
): Promise<string | null> {
  const existing = inFlight.get(url);
  if (existing) return existing;

  const promise = runQueued(expectedEpoch, operation).finally(() => {
    if (inFlight.get(url) === promise) inFlight.delete(url);
  });
  inFlight.set(url, promise);
  return promise;
}
