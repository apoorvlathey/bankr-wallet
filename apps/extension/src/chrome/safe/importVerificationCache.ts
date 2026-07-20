import { getAddress } from "viem";
import { decodeSafeChainSnapshot } from "./accountRepository";
import type { SafeAddress, SafeChainSnapshot } from "./types";

const VERIFICATION_TTL_MS = 30 * 60_000;
const MAX_VERIFICATIONS = 256;
const MAX_RECEIPTS_PER_IMPORT = 100;

interface SafeImportVerification {
  address: SafeAddress;
  snapshots: SafeChainSnapshot[];
  expiresAt: number;
}

const verifications = new Map<string, SafeImportVerification>();

function pruneVerifications(now = Date.now()): void {
  for (const [id, verification] of verifications) {
    if (verification.expiresAt <= now) verifications.delete(id);
  }
  while (verifications.size >= MAX_VERIFICATIONS) {
    const oldest = verifications.keys().next().value;
    if (typeof oldest !== "string") break;
    verifications.delete(oldest);
  }
}

export function registerSafeImportVerification(input: {
  address: SafeAddress;
  snapshots: SafeChainSnapshot[];
}): string {
  if (input.snapshots.length === 0) {
    throw new Error("Safe verification requires chain state");
  }
  pruneVerifications();
  const id = crypto.randomUUID();
  verifications.set(id, {
    address: getAddress(input.address).toLowerCase() as SafeAddress,
    snapshots: input.snapshots.map(decodeSafeChainSnapshot),
    expiresAt: Date.now() + VERIFICATION_TTL_MS,
  });
  return id;
}

export function resolveSafeImportVerifications(input: {
  verificationIds: unknown;
  address: unknown;
  chainIds: unknown;
}): { address: SafeAddress; snapshots: SafeChainSnapshot[] } {
  pruneVerifications();
  if (
    !Array.isArray(input.verificationIds) ||
    input.verificationIds.length === 0 ||
    input.verificationIds.length > MAX_RECEIPTS_PER_IMPORT ||
    input.verificationIds.some((id) => typeof id !== "string")
  ) {
    throw new Error("Safe verification expired. Check the Safe again");
  }
  const address = getAddress(String(input.address)).toLowerCase() as SafeAddress;
  const requestedChainIds = Array.isArray(input.chainIds)
    ? new Set(input.chainIds.filter(Number.isSafeInteger))
    : null;
  const snapshots = new Map<number, SafeChainSnapshot>();

  for (const id of new Set(input.verificationIds as string[])) {
    const verification = verifications.get(id);
    if (!verification || verification.address !== address) {
      throw new Error("Safe verification expired. Check the Safe again");
    }
    for (const snapshot of verification.snapshots) {
      if (!requestedChainIds || requestedChainIds.has(snapshot.chainId)) {
        snapshots.set(snapshot.chainId, decodeSafeChainSnapshot(snapshot));
      }
    }
  }
  if (
    requestedChainIds &&
    [...requestedChainIds].some((chainId) => !snapshots.has(chainId))
  ) {
    throw new Error("Safe verification expired. Check the Safe again");
  }
  if (snapshots.size === 0) {
    throw new Error("No verified Safe found");
  }
  return { address, snapshots: [...snapshots.values()] };
}

export function discardSafeImportVerifications(verificationIds: unknown): void {
  if (!Array.isArray(verificationIds)) return;
  for (const id of verificationIds) {
    if (typeof id === "string") verifications.delete(id);
  }
}

export function clearSafeImportVerificationsForTests(): void {
  verifications.clear();
}
