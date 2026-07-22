/** Trusted WalletChan renderer presence and inactivity-lease transitions. */

import { isWalletUnlocked } from "./cacheAccess";
import {
  decrementUIConnections,
  incrementUIConnections,
} from "./inMemoryCache";
import { updateSessionCapabilityLease } from "./capabilityPersistence";
import { runSerializedAuthTransition } from "../authTransition";

const MAX_ACTIVE_SURFACES = 16;
const activeSurfaceIds = new Set<string>();
let transitionTail: Promise<void> = Promise.resolve();

export function isValidWalletUiSurfaceId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

export function getActiveWalletUiSurfaceIds(): string[] {
  return [...activeSurfaceIds].sort();
}

async function serialize<T>(transition: () => Promise<T>): Promise<T> {
  const previous = transitionTail;
  let release!: () => void;
  transitionTail = new Promise<void>((resolve) => { release = resolve; });
  await previous.catch(() => undefined);
  try {
    return await transition();
  } finally {
    release();
  }
}

export function registerWalletUiSurface(surfaceId: string): Promise<boolean> {
  return serialize(() => runSerializedAuthTransition(async () => {
    if (
      !isValidWalletUiSurfaceId(surfaceId) ||
      (!activeSurfaceIds.has(surfaceId) && activeSurfaceIds.size >= MAX_ACTIVE_SURFACES)
    ) return false;
    if (activeSurfaceIds.has(surfaceId)) return false;

    // Evaluate the old idle lease before recording fresh user presence. An
    // already-expired session cannot be revived by opening a new surface.
    const hadLiveCapability = isWalletUnlocked();
    activeSurfaceIds.add(surfaceId);
    incrementUIConnections();
    if (hadLiveCapability) {
      await updateSessionCapabilityLease(getActiveWalletUiSurfaceIds());
    }
    return true;
  }));
}

export function heartbeatWalletUiSurface(surfaceId: string): Promise<boolean> {
  return serialize(() => runSerializedAuthTransition(async () => {
    if (!activeSurfaceIds.has(surfaceId)) return false;
    if (isWalletUnlocked()) {
      await updateSessionCapabilityLease(getActiveWalletUiSurfaceIds());
    }
    return true;
  }));
}

export function disconnectWalletUiSurface(surfaceId: string): Promise<void> {
  return serialize(() => runSerializedAuthTransition(async () => {
    if (!activeSurfaceIds.delete(surfaceId)) return;
    decrementUIConnections();
    if (isWalletUnlocked()) {
      await updateSessionCapabilityLease(getActiveWalletUiSurfaceIds());
    }
  }));
}
