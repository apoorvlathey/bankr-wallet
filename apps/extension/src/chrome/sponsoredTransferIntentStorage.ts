import type { EncryptedData } from "./crypto";
import { withStorageLock } from "./storageLock";

export const SPONSORED_TRANSFER_INTENTS_KEY = "sponsoredTransferIntents";
const STORAGE_LOCK = `local:${SPONSORED_TRANSFER_INTENTS_KEY}`;
const MAX_INTENTS = 20;
export const SPONSORED_TRANSFER_OPERATION_LOCK_KEY =
  "operation:sponsored-transfer-intent";

export function withSponsoredTransferOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  return withStorageLock(SPONSORED_TRANSFER_OPERATION_LOCK_KEY, operation);
}

export interface SponsoredTransferRelayPayload {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
  signature: string;
}

export interface SponsoredTransferIntentRecord {
  version: 1;
  id: string;
  txId: string;
  accountId: string;
  accountAddress: string;
  accountType: "bankr" | "privateKey" | "seedPhrase";
  to: string;
  value: string;
  amount: string;
  createdAt: number;
  validBefore: number;
  state:
    | "prepared"
    | "submitting"
    | "ambiguous"
    | "submitted"
    | "consumed";
  encryptedPayload: EncryptedData;
  attempts: number;
  lastError?: string;
  txHash?: string;
}

export function parseSponsoredTransferRelayPayload(
  value: unknown,
): SponsoredTransferRelayPayload {
  if (!value || typeof value !== "object") {
    throw new Error("Sponsored transfer payload is invalid");
  }
  const payload = value as Partial<SponsoredTransferRelayPayload>;
  if (
    typeof payload.from !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(payload.from) ||
    typeof payload.to !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(payload.to) ||
    typeof payload.value !== "string" ||
    !/^[1-9][0-9]*$/.test(payload.value) ||
    typeof payload.validAfter !== "string" ||
    !/^[0-9]+$/.test(payload.validAfter) ||
    typeof payload.validBefore !== "string" ||
    !/^[1-9][0-9]*$/.test(payload.validBefore) ||
    typeof payload.nonce !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(payload.nonce) ||
    typeof payload.signature !== "string" ||
    !/^0x[0-9a-fA-F]{130}$/.test(payload.signature)
  ) {
    throw new Error("Sponsored transfer payload is invalid");
  }
  return payload as SponsoredTransferRelayPayload;
}

function isRecord(value: unknown): value is SponsoredTransferIntentRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SponsoredTransferIntentRecord>;
  return (
    item.version === 1 &&
    typeof item.id === "string" &&
    item.id.length > 0 &&
    item.id.length <= 128 &&
    typeof item.txId === "string" &&
    item.txId.length > 0 &&
    item.txId.length <= 128 &&
    typeof item.accountId === "string" &&
    typeof item.accountAddress === "string" &&
    /^(?:0x)?[0-9a-fA-F]{40}$/.test(item.accountAddress) &&
    (item.accountType === "bankr" ||
      item.accountType === "privateKey" ||
      item.accountType === "seedPhrase") &&
    typeof item.to === "string" &&
    /^(?:0x)?[0-9a-fA-F]{40}$/.test(item.to) &&
    typeof item.value === "string" &&
    /^[1-9][0-9]*$/.test(item.value) &&
    typeof item.amount === "string" &&
    item.amount.length <= 128 &&
    typeof item.createdAt === "number" &&
    Number.isFinite(item.createdAt) &&
    typeof item.validBefore === "number" &&
    Number.isSafeInteger(item.validBefore) &&
    (item.state === "prepared" ||
      item.state === "submitting" ||
      item.state === "ambiguous" ||
      item.state === "submitted" ||
      item.state === "consumed") &&
    !!item.encryptedPayload &&
    typeof item.encryptedPayload === "object" &&
    typeof item.encryptedPayload.ciphertext === "string" &&
    typeof item.encryptedPayload.iv === "string" &&
    item.encryptedPayload.salt === "" &&
    Number.isSafeInteger(item.attempts) &&
    (item.attempts ?? -1) >= 0 &&
    (item.lastError === undefined ||
      (typeof item.lastError === "string" && item.lastError.length <= 1_000)) &&
    (item.txHash === undefined ||
      (typeof item.txHash === "string" &&
        /^0x[0-9a-fA-F]{64}$/.test(item.txHash)))
  );
}

async function loadIntents(): Promise<SponsoredTransferIntentRecord[]> {
  const stored = await chrome.storage.local.get(SPONSORED_TRANSFER_INTENTS_KEY);
  const raw = stored[SPONSORED_TRANSFER_INTENTS_KEY];
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_INTENTS || !raw.every(isRecord)) {
    throw new Error(
      "Sponsored transfer recovery state is invalid; reset it before sending again",
    );
  }
  return raw;
}

function retainedIntents(
  records: SponsoredTransferIntentRecord[],
): SponsoredTransferIntentRecord[] {
  // A renderer's wall clock is not authoritative for an ERC-3009 deadline or
  // for whether a success response reached the popup. Every record remains
  // until finalized-chain reconciliation proves safe expiry or the trusted UI
  // explicitly acknowledges a submitted/consumed result.
  return records;
}

function matchesReviewedTransfer(
  record: SponsoredTransferIntentRecord,
  input: {
    accountAddress: string;
    to: string;
    value: string;
  },
): boolean {
  return (
    record.accountAddress.toLowerCase() === input.accountAddress.toLowerCase() &&
    record.to.toLowerCase() === input.to.toLowerCase() &&
    record.value === input.value
  );
}

export async function findSponsoredTransferIntent(input: {
  id: string;
  accountId: string;
  accountAddress: string;
  to: string;
  value: string;
}): Promise<SponsoredTransferIntentRecord | null> {
  const records = retainedIntents(await loadIntents());
  const exact = records.find((record) => record.id === input.id);
  if (exact) {
    if (!matchesReviewedTransfer(exact, input)) {
      throw new Error(
        "Sponsored transfer intent does not match the reviewed transfer",
      );
    }
    return exact;
  }
  return (
    records.find((record) => matchesReviewedTransfer(record, input)) ?? null
  );
}

export async function hasUnresolvedSponsoredTransferIntent(
  accountAddress?: string,
): Promise<boolean> {
  const records = retainedIntents(await loadIntents());
  return records.some(
    (record) =>
      !accountAddress ||
      record.accountAddress.toLowerCase() === accountAddress.toLowerCase(),
  );
}

export async function getUnresolvedSponsoredTransferIntents(
  accountAddress: string,
): Promise<SponsoredTransferIntentRecord[]> {
  return retainedIntents(await loadIntents()).filter(
    (record) =>
      record.state !== "submitted" &&
      record.state !== "consumed" &&
      record.accountAddress.toLowerCase() === accountAddress.toLowerCase(),
  );
}

export async function getSponsoredTransferIntentsForAddress(
  accountAddress: string,
): Promise<SponsoredTransferIntentRecord[]> {
  return retainedIntents(await loadIntents()).filter(
    (record) =>
      record.accountAddress.toLowerCase() === accountAddress.toLowerCase(),
  );
}

export async function acknowledgeSponsoredTransferIntent(
  id: string,
  accountAddress: string,
): Promise<boolean> {
  return withStorageLock(STORAGE_LOCK, async () => {
    const records = retainedIntents(await loadIntents());
    const record = records.find((item) => item.id === id);
    if (
      !record ||
      record.accountAddress.toLowerCase() !== accountAddress.toLowerCase() ||
      (record.state !== "submitted" && record.state !== "consumed")
    ) {
      return false;
    }
    const next = records.filter((item) => item.id !== id);
    if (next.length === 0) {
      await chrome.storage.local.remove(SPONSORED_TRANSFER_INTENTS_KEY);
    } else {
      await chrome.storage.local.set({
        [SPONSORED_TRANSFER_INTENTS_KEY]: next,
      });
    }
    return true;
  });
}

export async function saveSponsoredTransferIntent(
  record: SponsoredTransferIntentRecord,
): Promise<void> {
  if (!isRecord(record)) throw new Error("Invalid sponsored transfer intent");
  await withStorageLock(STORAGE_LOCK, async () => {
    const records = retainedIntents(await loadIntents()).filter(
      (item) => item.id !== record.id,
    );
    if (records.length >= MAX_INTENTS) {
      throw new Error("Too many unresolved sponsored transfers");
    }
    records.push(record);
    await chrome.storage.local.set({
      [SPONSORED_TRANSFER_INTENTS_KEY]: records,
    });
  });
}

export async function updateSponsoredTransferIntent(
  id: string,
  update: Pick<SponsoredTransferIntentRecord, "state" | "attempts"> & {
    lastError?: string;
    txHash?: string;
  },
): Promise<void> {
  await withStorageLock(STORAGE_LOCK, async () => {
    const records = retainedIntents(await loadIntents());
    const index = records.findIndex((record) => record.id === id);
    if (index < 0) throw new Error("Sponsored transfer intent not found");
    records[index] = {
      ...records[index],
      ...update,
      lastError: update.lastError?.slice(0, 1_000),
      txHash: update.txHash,
    };
    await chrome.storage.local.set({
      [SPONSORED_TRANSFER_INTENTS_KEY]: records,
    });
  });
}

export async function removeSponsoredTransferIntent(id: string): Promise<void> {
  await withStorageLock(STORAGE_LOCK, async () => {
    const records = retainedIntents(await loadIntents()).filter(
      (record) => record.id !== id,
    );
    if (records.length === 0) {
      await chrome.storage.local.remove(SPONSORED_TRANSFER_INTENTS_KEY);
    } else {
      await chrome.storage.local.set({
        [SPONSORED_TRANSFER_INTENTS_KEY]: records,
      });
    }
  });
}
