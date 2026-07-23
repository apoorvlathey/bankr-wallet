import type { Address, Hex } from "viem";

import { decodeBase64Bounded, decodeBase64Exact } from "../../cryptography/base64";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
import type { PrivacyCommitmentStatus } from "../commitments/types";
import type { PrivacyPoolsMutationAccountType } from "../deployment/accountPolicy";

export const PRIVACY_RAGEQUITS_DATABASES = Object.freeze([
  "walletchan-privacy-ragequits-v1",
  "walletchan-privacy-ragequits-mainnet-v1",
] as const);
export const PRIVACY_RAGEQUITS_DATABASE = PRIVACY_POOLS_DEPLOYMENT.profile === "sepolia"
  ? PRIVACY_RAGEQUITS_DATABASES[0]
  : PRIVACY_RAGEQUITS_DATABASES[1];
export const PRIVACY_RAGEQUITS_DATABASE_VERSION = 1;
export const PRIVACY_RAGEQUITS_STORE = "ragequits";
export const MAX_PRIVACY_RAGEQUITS = 256;
export const MAX_VISIBLE_PRIVACY_RAGEQUITS = 20;

export type PrivacyRagequitState =
  | "awaiting_wallet_confirmation"
  | "submission_unknown"
  | "submitted"
  | "public_confirmed"
  | "recovered"
  | "wallet_rejected"
  | "submission_failed"
  | "public_reverted"
  | "failed_recoverable"
  | "failed_needs_support";

export type PrivacyRagequitErrorCode =
  | "wallet-rejected"
  | "submission-failed"
  | "submission-unknown"
  | "public-reverted"
  | "event-mismatch"
  | "event-unavailable";

export interface PrivacyRagequitSummaryV1 {
  schema: "walletchan-privacy-ragequit-v1";
  version: 1;
  id: string;
  requestId: string;
  /** Shared pending-batch id for an atomic multi-deposit public exit. */
  batchId?: string;
  createdAt: number;
  chainId: typeof PRIVACY_POOLS_DEPLOYMENT.chainId;
  accountId: string;
  accountAddress: Address;
  accountType: PrivacyPoolsMutationAccountType;
  amountWei: string;
  poolAddress: Address;
}

export interface PrivacyRagequitTrackingV1 {
  version: 1;
  revision: number;
  state: PrivacyRagequitState;
  updatedAt: number;
  txHash: Hex | null;
  blockNumber: string | null;
  errorCode: PrivacyRagequitErrorCode | null;
}

export interface PrivacyRagequitDetailsV1 {
  version: 1;
  operationId: string;
  commitmentId: string;
  commitmentRevision: number;
  commitmentHash: string;
  label: string;
  balanceWei: string;
  nullifierHash: string;
  previousStatus: Extract<
    PrivacyCommitmentStatus,
    "awaiting_asp" | "asp_unavailable" | "private_ready" | "asp_declined" | "asp_removed"
  >;
  callData: Hex;
}

export interface PrivacyEncryptedRagequitDetailsV1 {
  version: 1;
  scheme: "privacy-ragequit-key";
  ciphertext: string;
  iv: string;
}

export interface StoredPrivacyRagequitV1 {
  summary: PrivacyRagequitSummaryV1;
  keyId: string;
  encryptedDetails: PrivacyEncryptedRagequitDetailsV1;
  tracking: PrivacyRagequitTrackingV1;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const UINT = /^(?:0|[1-9]\d{0,79})$/;
const HEX_DATA = /^0x[0-9a-fA-F]{8,8192}$/;
const STATES = new Set<PrivacyRagequitState>([
  "awaiting_wallet_confirmation",
  "submission_unknown",
  "submitted",
  "public_confirmed",
  "recovered",
  "wallet_rejected",
  "submission_failed",
  "public_reverted",
  "failed_recoverable",
  "failed_needs_support",
]);
const ERRORS = new Set<PrivacyRagequitErrorCode>([
  "wallet-rejected",
  "submission-failed",
  "submission-unknown",
  "public-reverted",
  "event-mismatch",
  "event-unavailable",
]);

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function uint(value: unknown): bigint | null {
  if (typeof value !== "string" || !UINT.test(value)) return null;
  try { return BigInt(value); } catch { return null; }
}

function address(value: unknown): value is Address {
  return typeof value === "string" && ADDRESS.test(value) && !/^0x0{40}$/i.test(value);
}

export function isValidPrivacyRagequitSummary(value: unknown): value is PrivacyRagequitSummaryV1 {
  const legacyKeys = [
    "accountAddress", "accountId", "accountType", "amountWei", "chainId",
    "createdAt", "id", "poolAddress", "requestId", "schema", "version",
  ] as const;
  const batchKeys = [...legacyKeys, "batchId"] as const;
  if (!exact(value, legacyKeys) && !exact(value, batchKeys)) return false;
  const amount = uint(value.amountWei);
  return value.schema === "walletchan-privacy-ragequit-v1" &&
    value.version === 1 &&
    typeof value.id === "string" && UUID.test(value.id) &&
    typeof value.requestId === "string" && UUID.test(value.requestId) &&
    (value.batchId === undefined ||
      (typeof value.batchId === "string" && UUID.test(value.batchId))) &&
    typeof value.createdAt === "number" && Number.isSafeInteger(value.createdAt) && value.createdAt >= 0 &&
    value.chainId === PRIVACY_POOLS_DEPLOYMENT.chainId &&
    typeof value.accountId === "string" && value.accountId.length > 0 && value.accountId.length <= 128 &&
    address(value.accountAddress) &&
    (value.accountType === "bankr" || value.accountType === "privateKey" ||
      value.accountType === "seedPhrase" || value.accountType === "ledger") &&
    amount !== null && amount > 0n &&
    address(value.poolAddress) &&
    value.poolAddress.toLowerCase() ===
      PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address.toLowerCase();
}

export function isValidPrivacyRagequitTracking(
  value: unknown,
  summary: PrivacyRagequitSummaryV1,
): value is PrivacyRagequitTrackingV1 {
  if (!exact(value, [
    "blockNumber", "errorCode", "revision", "state", "txHash", "updatedAt", "version",
  ])) return false;
  const hasHash = typeof value.txHash === "string" && HASH.test(value.txHash);
  if (
    value.version !== 1 ||
    typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) ||
    value.revision < 0 || value.revision > 1_000_000 ||
    typeof value.state !== "string" || !STATES.has(value.state as PrivacyRagequitState) ||
    typeof value.updatedAt !== "number" || !Number.isSafeInteger(value.updatedAt) ||
    value.updatedAt < summary.createdAt ||
    (value.txHash !== null && !hasHash) ||
    (value.blockNumber !== null && uint(value.blockNumber) === null) ||
    (value.errorCode !== null &&
      (typeof value.errorCode !== "string" || !ERRORS.has(value.errorCode as PrivacyRagequitErrorCode)))
  ) return false;
  if (
    value.state === "awaiting_wallet_confirmation" &&
    (value.revision !== 0 || value.txHash !== null || value.blockNumber !== null || value.errorCode !== null)
  ) return false;
  if (
    (value.state === "submitted" || value.state === "public_confirmed" ||
      value.state === "recovered" || value.state === "public_reverted") &&
    !hasHash
  ) return false;
  if (value.state === "recovered" && value.blockNumber === null) return false;
  return true;
}

export function isValidPrivacyRagequitDetails(
  value: unknown,
  operationId?: string,
): value is PrivacyRagequitDetailsV1 {
  if (!exact(value, [
    "balanceWei", "callData", "commitmentHash", "commitmentId", "commitmentRevision",
    "label", "nullifierHash", "operationId", "previousStatus", "version",
  ])) return false;
  return value.version === 1 &&
    typeof value.operationId === "string" && UUID.test(value.operationId) &&
    (!operationId || value.operationId === operationId) &&
    typeof value.commitmentId === "string" && UUID.test(value.commitmentId) &&
    typeof value.commitmentRevision === "number" && Number.isSafeInteger(value.commitmentRevision) &&
    value.commitmentRevision >= 0 &&
    uint(value.commitmentHash) !== null && BigInt(value.commitmentHash as string) > 0n &&
    uint(value.label) !== null && BigInt(value.label as string) > 0n &&
    uint(value.balanceWei) !== null && BigInt(value.balanceWei as string) > 0n &&
    uint(value.nullifierHash) !== null && BigInt(value.nullifierHash as string) > 0n &&
    (value.previousStatus === "awaiting_asp" ||
      value.previousStatus === "asp_unavailable" ||
      value.previousStatus === "private_ready" ||
      value.previousStatus === "asp_declined" ||
      value.previousStatus === "asp_removed") &&
    typeof value.callData === "string" && HEX_DATA.test(value.callData) &&
    value.callData.length % 2 === 0;
}

export function isValidStoredPrivacyRagequit(value: unknown): value is StoredPrivacyRagequitV1 {
  if (!exact(value, ["encryptedDetails", "keyId", "summary", "tracking"]) ||
    !isValidPrivacyRagequitSummary(value.summary) ||
    !isValidPrivacyRagequitTracking(value.tracking, value.summary) ||
    typeof value.keyId !== "string" || value.keyId.length === 0 || value.keyId.length > 128 ||
    !exact(value.encryptedDetails, ["ciphertext", "iv", "scheme", "version"])) return false;
  return value.encryptedDetails.version === 1 &&
    value.encryptedDetails.scheme === "privacy-ragequit-key" &&
    decodeBase64Exact(value.encryptedDetails.iv, 12) !== null &&
    decodeBase64Bounded(value.encryptedDetails.ciphertext, 17, 16_384) !== null;
}

export function defaultPrivacyRagequitTracking(
  summary: PrivacyRagequitSummaryV1,
): PrivacyRagequitTrackingV1 {
  return {
    version: 1,
    revision: 0,
    state: "awaiting_wallet_confirmation",
    updatedAt: summary.createdAt,
    txHash: null,
    blockNumber: null,
    errorCode: null,
  };
}

export function privacyRagequitPublicSummary(record: StoredPrivacyRagequitV1) {
  if (!isValidStoredPrivacyRagequit(record)) throw new Error("Invalid public recovery record");
  return {
    id: record.summary.id,
    state: record.tracking.state,
    revision: record.tracking.revision,
    createdAt: record.summary.createdAt,
    updatedAt: record.tracking.updatedAt,
    chainId: record.summary.chainId,
    amountWei: record.summary.amountWei,
    accountAddress: record.summary.accountAddress,
    txHash: record.tracking.txHash,
    blockNumber: record.tracking.blockNumber,
    errorCode: record.tracking.errorCode,
  };
}
