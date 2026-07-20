import type { Address, Hex } from "viem";

import { decodeBase64Bounded, decodeBase64Exact } from "../../cryptography/base64";
import { PRIVACY_POOLS_SEPOLIA_DEPLOYMENT } from "../deployment/manifest";
import { PRIVACY_SNARK_SCALAR_FIELD } from "../asp/types";

export const PRIVACY_COMMITMENTS_DATABASE = "walletchan-privacy-commitments-v1";
export const PRIVACY_COMMITMENTS_DATABASE_VERSION = 1;
export const PRIVACY_COMMITMENTS_STORE = "commitments";
export const MAX_PRIVACY_COMMITMENTS = 1_024;

export type PrivacyCommitmentStatus =
  | "awaiting_asp"
  | "asp_unavailable"
  | "private_ready"
  | "withdrawal_pending"
  | "ragequit_pending"
  | "asp_declined"
  | "asp_removed"
  | "spent"
  | "ragequit_recovered";

export interface PrivacyCommitmentDetailsV1 {
  version: 1;
  id: string;
  chainId: 11_155_111;
  scope: string;
  poolAddress: Address;
  commitment: string;
  label: string;
  valueWei: string;
  balanceWei: string;
  precommitment: string;
  depositIndex: string;
  depositor: Address;
  depositTxHash: Hex;
  depositBlockNumber: string;
  withdrawalIndex: string;
  status: PrivacyCommitmentStatus;
  sourceOperationId: string | null;
}

export interface PrivacyEncryptedCommitmentV1 {
  version: 1;
  scheme: "privacy-commitment-key";
  ciphertext: string;
  iv: string;
}

export interface StoredPrivacyCommitmentV1 {
  version: 1;
  id: string;
  keyId: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  encryptedDetails: PrivacyEncryptedCommitmentV1;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UINT = /^(?:0|[1-9]\d{0,79})$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const STATUS = new Set<PrivacyCommitmentStatus>([
  "awaiting_asp",
  "asp_unavailable",
  "private_ready",
  "withdrawal_pending",
  "ragequit_pending",
  "asp_declined",
  "asp_removed",
  "spent",
  "ragequit_recovered",
]);

export function isPrivacyCommitmentPubliclyRecoverableStatus(
  status: PrivacyCommitmentStatus,
): status is "awaiting_asp" | "asp_unavailable" | "asp_declined" | "asp_removed" {
  return status === "awaiting_asp" ||
    status === "asp_unavailable" ||
    status === "asp_declined" ||
    status === "asp_removed";
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length &&
    actual.every((key, index) => key === sorted[index]);
}

function uint(value: unknown): bigint | null {
  if (typeof value !== "string" || !UINT.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function field(value: unknown): bigint | null {
  const parsed = uint(value);
  return parsed !== null && parsed > 0n && parsed < PRIVACY_SNARK_SCALAR_FIELD
    ? parsed
    : null;
}

export function isValidPrivacyCommitmentDetails(
  value: unknown,
  expectedId?: string,
): value is PrivacyCommitmentDetailsV1 {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !exactKeys(value, [
      "balanceWei",
      "chainId",
      "commitment",
      "depositBlockNumber",
      "depositIndex",
      "depositor",
      "depositTxHash",
      "id",
      "label",
      "poolAddress",
      "precommitment",
      "scope",
      "sourceOperationId",
      "status",
      "valueWei",
      "version",
      "withdrawalIndex",
    ])
  ) return false;
  const details = value as Partial<PrivacyCommitmentDetailsV1>;
  const valueWei = uint(details.valueWei);
  const balanceWei = uint(details.balanceWei);
  const depositIndex = uint(details.depositIndex);
  const blockNumber = uint(details.depositBlockNumber);
  const withdrawalIndex = uint(details.withdrawalIndex);
  return details.version === 1 &&
    typeof details.id === "string" && UUID.test(details.id) &&
    (!expectedId || details.id === expectedId) &&
    details.chainId === PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.chainId &&
    details.scope === PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.scope.toString() &&
    typeof details.poolAddress === "string" && ADDRESS.test(details.poolAddress) &&
    details.poolAddress.toLowerCase() ===
      PRIVACY_POOLS_SEPOLIA_DEPLOYMENT.contracts.ethPool.address.toLowerCase() &&
    field(details.commitment) !== null &&
    field(details.label) !== null &&
    field(details.precommitment) !== null &&
    valueWei !== null && valueWei > 0n &&
    balanceWei !== null && balanceWei <= valueWei &&
    depositIndex !== null && depositIndex <= 0xffff_ffffn &&
    blockNumber !== null &&
    withdrawalIndex !== null && withdrawalIndex <= 0xffff_ffffn &&
    typeof details.depositor === "string" && ADDRESS.test(details.depositor) &&
    typeof details.depositTxHash === "string" && HASH.test(details.depositTxHash) &&
    typeof details.status === "string" && STATUS.has(details.status as PrivacyCommitmentStatus) &&
    (details.sourceOperationId === null ||
      (typeof details.sourceOperationId === "string" && UUID.test(details.sourceOperationId))) &&
    ((details.status === "spent" || details.status === "ragequit_recovered")
      ? balanceWei === 0n
      : balanceWei! > 0n);
}

export function isValidStoredPrivacyCommitment(
  value: unknown,
): value is StoredPrivacyCommitmentV1 {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !exactKeys(value, [
      "createdAt",
      "encryptedDetails",
      "id",
      "keyId",
      "revision",
      "updatedAt",
      "version",
    ])
  ) return false;
  const record = value as Partial<StoredPrivacyCommitmentV1>;
  const encrypted = record.encryptedDetails;
  return record.version === 1 &&
    typeof record.id === "string" && UUID.test(record.id) &&
    typeof record.keyId === "string" && record.keyId.length > 0 && record.keyId.length <= 128 &&
    typeof record.revision === "number" && Number.isSafeInteger(record.revision) &&
    record.revision >= 0 && record.revision <= 1_000_000 &&
    typeof record.createdAt === "number" && Number.isSafeInteger(record.createdAt) && record.createdAt >= 0 &&
    typeof record.updatedAt === "number" && Number.isSafeInteger(record.updatedAt) &&
    record.updatedAt >= record.createdAt &&
    typeof encrypted === "object" && encrypted !== null && !Array.isArray(encrypted) &&
    exactKeys(encrypted, ["ciphertext", "iv", "scheme", "version"]) &&
    encrypted.version === 1 && encrypted.scheme === "privacy-commitment-key" &&
    decodeBase64Exact(encrypted.iv, 12) !== null &&
    decodeBase64Bounded(encrypted.ciphertext, 17, 8_192) !== null;
}
