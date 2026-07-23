import type { Address, Hex } from "viem";
import type { PrivacyShieldLifecycleState } from "../../../lib/privacyShieldLifecycle";

import { decodeBase64Bounded, decodeBase64Exact } from "../../cryptography/base64";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
import type { PrivacyPoolsMutationAccountType } from "../deployment/accountPolicy";

export const PRIVACY_OPERATIONS_DATABASES = Object.freeze([
  "walletchan-privacy-v1",
  "walletchan-privacy-mainnet-v1",
] as const);
export const PRIVACY_OPERATIONS_DATABASE = PRIVACY_POOLS_DEPLOYMENT.profile === "sepolia"
  ? PRIVACY_OPERATIONS_DATABASES[0]
  : PRIVACY_OPERATIONS_DATABASES[1];
export const PRIVACY_OPERATIONS_DATABASE_VERSION = 1;
export const PRIVACY_OPERATIONS_STORE = "operations";
export const PRIVACY_OPERATIONS_METADATA_STORE = "metadata";
export const PRIVACY_NEXT_DEPOSIT_INDEX_KEY = "nextDepositIndex";
export const MAX_PRIVACY_OPERATIONS = 100;
export const MAX_VISIBLE_PRIVACY_OPERATIONS = 20;
// The protocol's final uint32 index is reserved for ephemeral review material,
// so a persisted operation can never reuse the review precommitment.
export const MAX_PRIVACY_DEPOSIT_INDEX = 0xffff_fffe;
export const MAX_PRIVACY_OPERATION_REVISION = 1_000_000;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SERIALIZED_UINT = /^(?:0|[1-9]\d{0,79})$/;
const EXACT_NATIVE_DEPOSIT_CALL = /^0x[0-9a-fA-F]{72}$/;
const EVM_TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const MAX_KEY_ID_LENGTH = 128;
const OPERATION_IV_BYTES = 12;
const MAX_OPERATION_CIPHERTEXT_BYTES = 4_096;

export type PrivacyShieldOperationState = "awaiting_wallet_confirmation";

export type PrivacyShieldTrackingState = PrivacyShieldLifecycleState;

export type PrivacyShieldTrackingErrorCode =
  | "wallet-rejected"
  | "submission-failed"
  | "submission-unknown"
  | "public-reverted"
  | "event-mismatch"
  | "event-unavailable"
  | "asp-unavailable"
  | "asp-poi-required"
  | "asp-declined"
  | "asp-removed";

/**
 * Public lifecycle fields intentionally live outside the encrypted details.
 * A receipt can therefore advance while the privacy key is cold, while the
 * deposit index and precommitment remain bound to the immutable encrypted
 * summary AAD.
 */
export interface PrivacyShieldOperationTrackingV1 {
  version: 1;
  revision: number;
  state: PrivacyShieldTrackingState;
  updatedAt: number;
  txHash: Hex | null;
  blockNumber: string | null;
  commitment: string | null;
  label: string | null;
  poolValueWei: string | null;
  errorCode: PrivacyShieldTrackingErrorCode | null;
}

export interface PrivacyShieldOperationSummaryV1 {
  schema: "walletchan-privacy-shield-operation-v1";
  id: string;
  requestId: string;
  revision: 0;
  state: PrivacyShieldOperationState;
  createdAt: number;
  updatedAt: number;
  chainId: typeof PRIVACY_POOLS_DEPLOYMENT.chainId;
  accountId: string;
  accountAddress: Address;
  accountType: PrivacyPoolsMutationAccountType;
  amountWei: string;
  protocolFeeWei: string;
  shieldedAmountWei: string;
  gasReserveWei: string;
  totalRequiredWei: string;
  destinationAddress: Address;
  poolAddress: Address;
  dedupeKey: string;
}

export interface PrivacyEncryptedOperationDetailsV1 {
  version: 1;
  scheme: "privacy-operation-key";
  ciphertext: string;
  iv: string;
}

export interface StoredPrivacyShieldOperationV1 {
  summary: PrivacyShieldOperationSummaryV1;
  keyId: string;
  encryptedDetails: PrivacyEncryptedOperationDetailsV1;
  tracking?: PrivacyShieldOperationTrackingV1;
}

export interface PrivacyShieldOperationPublicV1
  extends Omit<
    PrivacyShieldOperationSummaryV1,
    "revision" | "state" | "updatedAt"
  > {
  revision: number;
  state: PrivacyShieldTrackingState;
  updatedAt: number;
  txHash: Hex | null;
  blockNumber: string | null;
  commitment: string | null;
  label: string | null;
  poolValueWei: string | null;
  errorCode: PrivacyShieldTrackingErrorCode | null;
}

export interface PrivacyShieldOperationDetailsV1 {
  version: 1;
  operationId: string;
  depositIndex: string;
  precommitment: string;
  callData: Hex;
}

export interface PrivacyOperationMetadataV1 {
  key: typeof PRIVACY_NEXT_DEPOSIT_INDEX_KEY;
  value: number;
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function isAddress(value: unknown): value is Address {
  return (
    typeof value === "string" &&
    EVM_ADDRESS.test(value) &&
    !/^0x0{40}$/i.test(value)
  );
}

function parseUint(value: unknown): bigint | null {
  if (typeof value !== "string" || !SERIALIZED_UINT.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export function privacyShieldOperationDedupeKey(input: {
  chainId: number;
  accountId: string;
  amountWei: string;
}): string {
  return `${input.chainId}:${input.accountId}:${input.amountWei}`;
}

export function isValidPrivacyShieldOperationSummary(
  value: unknown,
): value is PrivacyShieldOperationSummaryV1 {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !hasExactKeys(value, [
      "accountAddress",
      "accountId",
      "accountType",
      "amountWei",
      "chainId",
      "createdAt",
      "dedupeKey",
      "destinationAddress",
      "gasReserveWei",
      "id",
      "poolAddress",
      "protocolFeeWei",
      "requestId",
      "revision",
      "schema",
      "shieldedAmountWei",
      "state",
      "totalRequiredWei",
      "updatedAt",
    ])
  ) {
    return false;
  }
  const summary = value as Partial<PrivacyShieldOperationSummaryV1>;
  const amountWei = parseUint(summary.amountWei);
  const protocolFeeWei = parseUint(summary.protocolFeeWei);
  const shieldedAmountWei = parseUint(summary.shieldedAmountWei);
  const gasReserveWei = parseUint(summary.gasReserveWei);
  const totalRequiredWei = parseUint(summary.totalRequiredWei);
  if (
    summary.schema !== "walletchan-privacy-shield-operation-v1" ||
    typeof summary.id !== "string" ||
    !UUID.test(summary.id) ||
    typeof summary.requestId !== "string" ||
    !UUID.test(summary.requestId) ||
    summary.revision !== 0 ||
    summary.state !== "awaiting_wallet_confirmation" ||
    typeof summary.createdAt !== "number" ||
    !Number.isSafeInteger(summary.createdAt) ||
    summary.createdAt < 0 ||
    summary.updatedAt !== summary.createdAt ||
    summary.chainId !== PRIVACY_POOLS_DEPLOYMENT.chainId ||
    typeof summary.accountId !== "string" ||
    summary.accountId.length === 0 ||
    summary.accountId.length > 128 ||
    !isAddress(summary.accountAddress) ||
    (summary.accountType !== "bankr" &&
      summary.accountType !== "privateKey" &&
      summary.accountType !== "seedPhrase" &&
      summary.accountType !== "ledger") ||
    !isAddress(summary.destinationAddress) ||
    summary.destinationAddress.toLowerCase() !==
      PRIVACY_POOLS_DEPLOYMENT.contracts.entrypointProxy.address.toLowerCase() ||
    !isAddress(summary.poolAddress) ||
    summary.poolAddress.toLowerCase() !==
      PRIVACY_POOLS_DEPLOYMENT.contracts.ethPool.address.toLowerCase() ||
    amountWei === null ||
    protocolFeeWei === null ||
    shieldedAmountWei === null ||
    gasReserveWei === null ||
    totalRequiredWei === null ||
    amountWei < PRIVACY_POOLS_DEPLOYMENT.assetConfig.minimumDepositAmount ||
    amountWei !== protocolFeeWei + shieldedAmountWei ||
    totalRequiredWei !== amountWei + gasReserveWei ||
    summary.dedupeKey !==
      privacyShieldOperationDedupeKey({
        chainId: summary.chainId,
        accountId: summary.accountId,
        amountWei: amountWei.toString(),
      })
  ) {
    return false;
  }
  return true;
}

export function isValidStoredPrivacyShieldOperation(
  value: unknown,
): value is StoredPrivacyShieldOperationV1 {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (!hasExactKeys(value, ["encryptedDetails", "keyId", "summary"]) &&
      !hasExactKeys(value, ["encryptedDetails", "keyId", "summary", "tracking"]))
  ) {
    return false;
  }
  const stored = value as Partial<StoredPrivacyShieldOperationV1>;
  if (
    !isValidPrivacyShieldOperationSummary(stored.summary) ||
    typeof stored.keyId !== "string" ||
    stored.keyId.length === 0 ||
    stored.keyId.length > MAX_KEY_ID_LENGTH ||
    typeof stored.encryptedDetails !== "object" ||
    stored.encryptedDetails === null ||
    Array.isArray(stored.encryptedDetails) ||
    !hasExactKeys(stored.encryptedDetails, [
      "ciphertext",
      "iv",
      "scheme",
      "version",
    ])
  ) {
    return false;
  }
  const encrypted = stored.encryptedDetails as Partial<PrivacyEncryptedOperationDetailsV1>;
  if (!(
    encrypted.version === 1 &&
    encrypted.scheme === "privacy-operation-key" &&
    decodeBase64Exact(encrypted.iv, OPERATION_IV_BYTES) !== null &&
    decodeBase64Bounded(
      encrypted.ciphertext,
      17,
      MAX_OPERATION_CIPHERTEXT_BYTES,
    ) !== null
  )) {
    return false;
  }
  return stored.tracking === undefined ||
    isValidPrivacyShieldOperationTracking(stored.tracking, stored.summary);
}

const TRACKING_STATES = new Set<PrivacyShieldTrackingState>([
  "awaiting_wallet_confirmation",
  "submission_unknown",
  "submitted",
  "public_confirmed",
  "awaiting_event",
  "awaiting_asp",
  "asp_unavailable",
  "asp_poi_required",
  "asp_approved",
  "private_ready",
  "wallet_rejected",
  "submission_failed",
  "public_reverted",
  "asp_declined",
  "asp_removed",
  "ragequit_available",
  "ragequit_recovered",
  "failed_recoverable",
  "failed_needs_support",
]);

const TRACKING_ERROR_CODES = new Set<PrivacyShieldTrackingErrorCode>([
  "wallet-rejected",
  "submission-failed",
  "submission-unknown",
  "public-reverted",
  "event-mismatch",
  "event-unavailable",
  "asp-unavailable",
  "asp-poi-required",
  "asp-declined",
  "asp-removed",
]);

export function defaultPrivacyShieldOperationTracking(
  summary: PrivacyShieldOperationSummaryV1,
): PrivacyShieldOperationTrackingV1 {
  return {
    version: 1,
    revision: 0,
    state: "awaiting_wallet_confirmation",
    updatedAt: summary.updatedAt,
    txHash: null,
    blockNumber: null,
    commitment: null,
    label: null,
    poolValueWei: null,
    errorCode: null,
  };
}

export function isValidPrivacyShieldOperationTracking(
  value: unknown,
  summary: PrivacyShieldOperationSummaryV1,
): value is PrivacyShieldOperationTrackingV1 {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !hasExactKeys(value, [
      "blockNumber",
      "commitment",
      "errorCode",
      "label",
      "poolValueWei",
      "revision",
      "state",
      "txHash",
      "updatedAt",
      "version",
    ])
  ) {
    return false;
  }
  const tracking = value as Partial<PrivacyShieldOperationTrackingV1>;
  const blockNumber = tracking.blockNumber === null
    ? null
    : parseUint(tracking.blockNumber);
  const commitment = tracking.commitment === null
    ? null
    : parseUint(tracking.commitment);
  const label = tracking.label === null ? null : parseUint(tracking.label);
  const poolValueWei = tracking.poolValueWei === null
    ? null
    : parseUint(tracking.poolValueWei);
  if (
    tracking.version !== 1 ||
    typeof tracking.revision !== "number" ||
    !Number.isSafeInteger(tracking.revision) ||
    tracking.revision < 0 ||
    tracking.revision > MAX_PRIVACY_OPERATION_REVISION ||
    typeof tracking.state !== "string" ||
    !TRACKING_STATES.has(tracking.state as PrivacyShieldTrackingState) ||
    typeof tracking.updatedAt !== "number" ||
    !Number.isSafeInteger(tracking.updatedAt) ||
    tracking.updatedAt < summary.createdAt ||
    (tracking.txHash !== null &&
      (typeof tracking.txHash !== "string" || !EVM_TX_HASH.test(tracking.txHash))) ||
    blockNumber === null && tracking.blockNumber !== null ||
    commitment === null && tracking.commitment !== null ||
    label === null && tracking.label !== null ||
    poolValueWei === null && tracking.poolValueWei !== null ||
    (tracking.errorCode !== null &&
      (typeof tracking.errorCode !== "string" ||
        !TRACKING_ERROR_CODES.has(tracking.errorCode as PrivacyShieldTrackingErrorCode)))
  ) {
    return false;
  }
  if (
    tracking.state === "awaiting_wallet_confirmation" &&
    (tracking.revision !== 0 ||
      tracking.txHash !== null ||
      tracking.blockNumber !== null ||
      tracking.commitment !== null ||
      tracking.label !== null ||
      tracking.poolValueWei !== null ||
      tracking.errorCode !== null)
  ) {
    return false;
  }
  if (
    (tracking.state === "submitted" ||
      tracking.state === "public_confirmed" ||
      tracking.state === "awaiting_event" ||
      tracking.state === "awaiting_asp" ||
      tracking.state === "asp_unavailable" ||
      tracking.state === "asp_poi_required" ||
      tracking.state === "asp_approved" ||
      tracking.state === "private_ready" ||
      tracking.state === "ragequit_recovered" ||
      tracking.state === "public_reverted") &&
    tracking.txHash === null
  ) {
    return false;
  }
  if (
    (tracking.state === "awaiting_asp" ||
      tracking.state === "asp_unavailable" ||
      tracking.state === "asp_poi_required" ||
      tracking.state === "asp_approved" ||
      tracking.state === "private_ready" ||
      tracking.state === "ragequit_recovered") &&
    (commitment === null || label === null || poolValueWei === null || blockNumber === null)
  ) {
    return false;
  }
  return true;
}

export function privacyShieldOperationPublicSummary(
  operation: StoredPrivacyShieldOperationV1,
): PrivacyShieldOperationPublicV1 {
  if (!isValidStoredPrivacyShieldOperation(operation)) {
    throw new Error("Invalid privacy operation record");
  }
  const tracking = operation.tracking ??
    defaultPrivacyShieldOperationTracking(operation.summary);
  return {
    ...operation.summary,
    revision: tracking.revision,
    state: tracking.state,
    updatedAt: tracking.updatedAt,
    txHash: tracking.txHash,
    blockNumber: tracking.blockNumber,
    commitment: tracking.commitment,
    label: tracking.label,
    poolValueWei: tracking.poolValueWei,
    errorCode: tracking.errorCode,
  };
}

export function isValidPrivacyShieldOperationDetails(
  value: unknown,
  expectedOperationId?: string,
): value is PrivacyShieldOperationDetailsV1 {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !hasExactKeys(value, [
      "callData",
      "depositIndex",
      "operationId",
      "precommitment",
      "version",
    ])
  ) {
    return false;
  }
  const details = value as Partial<PrivacyShieldOperationDetailsV1>;
  const depositIndex = parseUint(details.depositIndex);
  const precommitment = parseUint(details.precommitment);
  return (
    details.version === 1 &&
    typeof details.operationId === "string" &&
    UUID.test(details.operationId) &&
    (!expectedOperationId || details.operationId === expectedOperationId) &&
    depositIndex !== null &&
    depositIndex <= BigInt(MAX_PRIVACY_DEPOSIT_INDEX) &&
    precommitment !== null &&
    precommitment > 0n &&
    typeof details.callData === "string" &&
    EXACT_NATIVE_DEPOSIT_CALL.test(details.callData)
  );
}

export function isValidPrivacyOperationMetadata(
  value: unknown,
): value is PrivacyOperationMetadataV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    hasExactKeys(value, ["key", "value"]) &&
    (value as Partial<PrivacyOperationMetadataV1>).key ===
      PRIVACY_NEXT_DEPOSIT_INDEX_KEY &&
    Number.isSafeInteger((value as Partial<PrivacyOperationMetadataV1>).value) &&
    ((value as Partial<PrivacyOperationMetadataV1>).value ?? -1) >= 0 &&
    ((value as Partial<PrivacyOperationMetadataV1>).value ?? Infinity) <=
      MAX_PRIVACY_DEPOSIT_INDEX + 1
  );
}
