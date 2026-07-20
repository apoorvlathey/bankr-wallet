import type { Address, Hex } from "viem";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const UINT = /^(?:0|[1-9]\d{0,79})$/;
const EVENT_ID = /^0x[0-9a-fA-F]{64}:(?:0|[1-9]\d{0,9})$/;

export const PRIVACY_PUBLIC_EVENTS_DATABASE = "walletchan-privacy-events-v1";
export const PRIVACY_PUBLIC_EVENTS_DATABASE_VERSION = 2;
export const PRIVACY_DEPOSIT_EVENTS_STORE = "deposits";
export const PRIVACY_WITHDRAWAL_EVENTS_STORE = "withdrawals";
export const PRIVACY_RAGEQUIT_EVENTS_STORE = "ragequits";
export const PRIVACY_EVENT_CHECKPOINT_STORE = "checkpoints";
export const PRIVACY_SEPOLIA_EVENT_CHECKPOINT_KEY = "sepolia-pool-events";
export const MAX_PRIVACY_DEPOSIT_EVENTS = 20_000;
export const MAX_PRIVACY_WITHDRAWAL_EVENTS = 20_000;
export const MAX_PRIVACY_RAGEQUIT_EVENTS = 20_000;

export interface PrivacyDepositEventV1 {
  version: 1;
  id: string;
  chainId: 11_155_111;
  blockNumber: string;
  blockHash: Hex;
  logIndex: number;
  transactionHash: Hex;
  depositor: Address;
  commitment: string;
  label: string;
  valueWei: string;
  precommitment: string;
}

export interface PrivacyWithdrawalEventV1 {
  version: 1;
  id: string;
  chainId: 11_155_111;
  blockNumber: string;
  blockHash: Hex;
  logIndex: number;
  transactionHash: Hex;
  processooor: Address;
  valueWei: string;
  spentNullifier: string;
  newCommitment: string;
}

export interface PrivacyRagequitEventV1 {
  version: 1;
  id: string;
  chainId: 11_155_111;
  blockNumber: string;
  blockHash: Hex;
  logIndex: number;
  transactionHash: Hex;
  ragequitter: Address;
  commitment: string;
  label: string;
  valueWei: string;
}

export interface PrivacyPoolEventPageV1 {
  deposits: PrivacyDepositEventV1[];
  withdrawals: PrivacyWithdrawalEventV1[];
  ragequits: PrivacyRagequitEventV1[];
}

export interface PrivacyEventCheckpointV1 {
  version: 1;
  key: typeof PRIVACY_SEPOLIA_EVENT_CHECKPOINT_KEY;
  chainId: 11_155_111;
  nextBlock: string;
  lastBlockNumber: string;
  lastBlockHash: Hex;
  lastSyncAt: number;
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function uint(value: unknown): bigint | null {
  if (typeof value !== "string" || !UINT.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export function isValidPrivacyDepositEvent(value: unknown): value is PrivacyDepositEventV1 {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !exactKeys(value, [
      "blockHash",
      "blockNumber",
      "chainId",
      "commitment",
      "depositor",
      "id",
      "label",
      "logIndex",
      "precommitment",
      "transactionHash",
      "valueWei",
      "version",
    ])
  ) return false;
  const event = value as Partial<PrivacyDepositEventV1>;
  return event.version === 1 &&
    event.chainId === 11_155_111 &&
    typeof event.id === "string" && EVENT_ID.test(event.id) &&
    typeof event.blockHash === "string" && HASH.test(event.blockHash) &&
    typeof event.transactionHash === "string" && HASH.test(event.transactionHash) &&
    typeof event.depositor === "string" && ADDRESS.test(event.depositor) &&
    typeof event.logIndex === "number" && Number.isSafeInteger(event.logIndex) &&
    event.logIndex >= 0 && event.logIndex <= 0xffff_ffff &&
    uint(event.blockNumber) !== null &&
    uint(event.commitment) !== null && BigInt(event.commitment!) > 0n &&
    uint(event.label) !== null && BigInt(event.label!) > 0n &&
    uint(event.valueWei) !== null &&
    uint(event.precommitment) !== null && BigInt(event.precommitment!) > 0n &&
    event.id.toLowerCase() === `${event.transactionHash.toLowerCase()}:${event.logIndex}`;
}

function commonEvent(
  event: {
    version?: unknown;
    chainId?: unknown;
    id?: unknown;
    blockHash?: unknown;
    transactionHash?: unknown;
    logIndex?: unknown;
    blockNumber?: unknown;
  },
): boolean {
  return event.version === 1 &&
    event.chainId === 11_155_111 &&
    typeof event.id === "string" && EVENT_ID.test(event.id) &&
    typeof event.blockHash === "string" && HASH.test(event.blockHash) &&
    typeof event.transactionHash === "string" && HASH.test(event.transactionHash) &&
    typeof event.logIndex === "number" && Number.isSafeInteger(event.logIndex) &&
    event.logIndex >= 0 && event.logIndex <= 0xffff_ffff &&
    uint(event.blockNumber) !== null &&
    event.id.toLowerCase() ===
      `${event.transactionHash.toLowerCase()}:${event.logIndex}`;
}

export function isValidPrivacyWithdrawalEvent(
  value: unknown,
): value is PrivacyWithdrawalEventV1 {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) ||
    !exactKeys(value, [
      "blockHash", "blockNumber", "chainId", "id", "logIndex",
      "newCommitment", "processooor", "spentNullifier", "transactionHash",
      "valueWei", "version",
    ])
  ) return false;
  const event = value as Partial<PrivacyWithdrawalEventV1>;
  return commonEvent(event) &&
    typeof event.processooor === "string" && ADDRESS.test(event.processooor) &&
    uint(event.valueWei) !== null && BigInt(event.valueWei!) > 0n &&
    uint(event.spentNullifier) !== null && BigInt(event.spentNullifier!) > 0n &&
    uint(event.newCommitment) !== null && BigInt(event.newCommitment!) > 0n;
}

export function isValidPrivacyRagequitEvent(
  value: unknown,
): value is PrivacyRagequitEventV1 {
  if (
    typeof value !== "object" || value === null || Array.isArray(value) ||
    !exactKeys(value, [
      "blockHash", "blockNumber", "chainId", "commitment", "id", "label",
      "logIndex", "ragequitter", "transactionHash", "valueWei", "version",
    ])
  ) return false;
  const event = value as Partial<PrivacyRagequitEventV1>;
  return commonEvent(event) &&
    typeof event.ragequitter === "string" && ADDRESS.test(event.ragequitter) &&
    uint(event.commitment) !== null && BigInt(event.commitment!) > 0n &&
    uint(event.label) !== null && BigInt(event.label!) > 0n &&
    uint(event.valueWei) !== null && BigInt(event.valueWei!) > 0n;
}

export function isValidPrivacyEventCheckpoint(
  value: unknown,
): value is PrivacyEventCheckpointV1 {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !exactKeys(value, [
      "chainId",
      "key",
      "lastBlockHash",
      "lastBlockNumber",
      "lastSyncAt",
      "nextBlock",
      "version",
    ])
  ) return false;
  const checkpoint = value as Partial<PrivacyEventCheckpointV1>;
  const nextBlock = uint(checkpoint.nextBlock);
  const lastBlock = uint(checkpoint.lastBlockNumber);
  return checkpoint.version === 1 &&
    checkpoint.key === PRIVACY_SEPOLIA_EVENT_CHECKPOINT_KEY &&
    checkpoint.chainId === 11_155_111 &&
    nextBlock !== null && lastBlock !== null && nextBlock === lastBlock + 1n &&
    typeof checkpoint.lastBlockHash === "string" && HASH.test(checkpoint.lastBlockHash) &&
    typeof checkpoint.lastSyncAt === "number" &&
    Number.isSafeInteger(checkpoint.lastSyncAt) && checkpoint.lastSyncAt >= 0;
}
