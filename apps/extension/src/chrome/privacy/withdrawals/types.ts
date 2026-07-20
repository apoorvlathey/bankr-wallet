import type { Address, Hex } from "viem";

import { decodeBase64Bounded, decodeBase64Exact } from "../../cryptography/base64";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";

export const PRIVACY_WITHDRAWALS_DATABASES = Object.freeze([
  "walletchan-privacy-withdrawals-v1",
  "walletchan-privacy-withdrawals-mainnet-v1",
] as const);
export const PRIVACY_WITHDRAWALS_DATABASE = PRIVACY_POOLS_DEPLOYMENT.profile === "sepolia"
  ? PRIVACY_WITHDRAWALS_DATABASES[0]
  : PRIVACY_WITHDRAWALS_DATABASES[1];
export const PRIVACY_WITHDRAWALS_DATABASE_VERSION = 1;
export const PRIVACY_WITHDRAWALS_STORE = "withdrawals";
export const MAX_PRIVACY_WITHDRAWALS = 256;
export const MAX_VISIBLE_PRIVACY_WITHDRAWALS = 20;

export type PrivacyUnshieldState =
  | "quote_ready"
  | "proof_preparing"
  | "proof_verified"
  | "submitting_to_relayer"
  | "submission_unknown"
  | "submitted"
  | "public_confirmed"
  | "private_balance_updated"
  | "quote_expired"
  | "proof_failed"
  | "relayer_rejected"
  | "public_reverted"
  | "nullifier_already_spent"
  | "failed_recoverable"
  | "failed_needs_support";

export interface PrivacyUnshieldSummaryV1 {
  schema: "walletchan-privacy-unshield-v1";
  version: 1;
  id: string;
  requestId: string;
  createdAt: number;
  chainId: typeof PRIVACY_POOLS_DEPLOYMENT.chainId;
  amountWei: string;
  netRecipientAmountWei: string;
  relayFeeWei: string;
  feeBPS: string;
  recipient: Address;
  relayerName: string;
  expiresAt: number;
  recipientMatchesDepositor: boolean;
}

export interface PrivacyUnshieldTrackingV1 {
  version: 1;
  revision: number;
  state: PrivacyUnshieldState;
  updatedAt: number;
  relayerRequestId: string | null;
  txHash: Hex | null;
  blockNumber: string | null;
  errorCode: string | null;
}

export interface PrivacyUnshieldDetailsV1 {
  version: 1;
  operationId: string;
  commitmentId: string;
  commitmentRevision: number;
  commitmentHash: string;
  label: string;
  balanceWei: string;
  depositIndex: string;
  withdrawalIndex: string;
  expectedSpentNullifier: string;
  expectedNewCommitment: string;
  expectedNewBalanceWei: string;
  expectedNewWithdrawalIndex: string;
  relayerUrl: string;
  signerAddress: Address;
  feeReceiverAddress: Address;
  baseFeeBPS: string;
  gasPrice: string;
  relayGas: string;
  relayCostWei: string;
  feeCommitment: {
    expiration: number;
    withdrawalData: Hex;
    asset: Address;
    amount: string;
    extraGas: false;
    signedRelayerCommitment: Hex;
  };
}

export interface PrivacyEncryptedUnshieldDetailsV1 {
  version: 1;
  scheme: "privacy-unshield-key";
  ciphertext: string;
  iv: string;
}

export interface StoredPrivacyUnshieldV1 {
  summary: PrivacyUnshieldSummaryV1;
  keyId: string;
  encryptedDetails: PrivacyEncryptedUnshieldDetailsV1;
  tracking: PrivacyUnshieldTrackingV1;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
const UINT = /^(?:0|[1-9]\d{0,79})$/;
const STATES = new Set<PrivacyUnshieldState>([
  "quote_ready", "proof_preparing", "proof_verified", "submitting_to_relayer",
  "submission_unknown", "submitted", "public_confirmed", "private_balance_updated",
  "quote_expired", "proof_failed", "relayer_rejected", "public_reverted",
  "nullifier_already_spent", "failed_recoverable", "failed_needs_support",
]);

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function uint(value: unknown): bigint | null {
  if (typeof value !== "string" || !UINT.test(value)) return null;
  try { return BigInt(value); } catch { return null; }
}

function address(value: unknown): value is Address {
  return typeof value === "string" && ADDRESS.test(value) && !/^0x0{40}$/i.test(value);
}

export function isValidPrivacyUnshieldSummary(value: unknown): value is PrivacyUnshieldSummaryV1 {
  if (!exact(value, [
    "amountWei", "chainId", "createdAt", "expiresAt", "feeBPS", "id",
    "netRecipientAmountWei", "recipient", "recipientMatchesDepositor", "relayFeeWei",
    "relayerName", "requestId", "schema", "version",
  ])) return false;
  const amount = uint(value.amountWei);
  const net = uint(value.netRecipientAmountWei);
  const fee = uint(value.relayFeeWei);
  const bps = uint(value.feeBPS);
  return value.schema === "walletchan-privacy-unshield-v1" && value.version === 1 &&
    typeof value.id === "string" && UUID.test(value.id) &&
    typeof value.requestId === "string" && UUID.test(value.requestId) &&
    typeof value.createdAt === "number" && Number.isSafeInteger(value.createdAt) && value.createdAt >= 0 &&
    value.chainId === PRIVACY_POOLS_DEPLOYMENT.chainId &&
    amount !== null && amount > 0n && net !== null && fee !== null && net + fee === amount &&
    bps !== null && bps <= PRIVACY_POOLS_DEPLOYMENT.assetConfig.maxRelayFeeBPS &&
    fee === amount * bps / 10_000n && address(value.recipient) &&
    typeof value.relayerName === "string" && value.relayerName.length > 0 && value.relayerName.length <= 64 &&
    typeof value.expiresAt === "number" && Number.isSafeInteger(value.expiresAt) && value.expiresAt >= value.createdAt &&
    typeof value.recipientMatchesDepositor === "boolean";
}

export function isValidPrivacyUnshieldTracking(
  value: unknown,
  summary: PrivacyUnshieldSummaryV1,
): value is PrivacyUnshieldTrackingV1 {
  if (!exact(value, [
    "blockNumber", "errorCode", "relayerRequestId", "revision", "state",
    "txHash", "updatedAt", "version",
  ])) return false;
  return value.version === 1 &&
    typeof value.revision === "number" && Number.isSafeInteger(value.revision) && value.revision >= 0 && value.revision <= 1_000_000 &&
    typeof value.state === "string" && STATES.has(value.state as PrivacyUnshieldState) &&
    typeof value.updatedAt === "number" && Number.isSafeInteger(value.updatedAt) && value.updatedAt >= summary.createdAt &&
    (value.relayerRequestId === null || (typeof value.relayerRequestId === "string" && UUID.test(value.relayerRequestId))) &&
    (value.txHash === null || (typeof value.txHash === "string" && HASH.test(value.txHash))) &&
    (value.blockNumber === null || uint(value.blockNumber) !== null) &&
    (value.errorCode === null || (typeof value.errorCode === "string" && value.errorCode.length > 0 && value.errorCode.length <= 64));
}

export function isValidPrivacyUnshieldDetails(
  value: unknown,
  operationId?: string,
): value is PrivacyUnshieldDetailsV1 {
  if (!exact(value, [
    "balanceWei", "baseFeeBPS", "commitmentHash", "commitmentId", "commitmentRevision",
    "depositIndex", "expectedNewBalanceWei", "expectedNewCommitment",
    "expectedNewWithdrawalIndex", "expectedSpentNullifier", "feeCommitment",
    "feeReceiverAddress", "gasPrice", "label", "operationId", "relayCostWei",
    "relayGas", "relayerUrl", "signerAddress", "version", "withdrawalIndex",
  ]) || !exact(value.feeCommitment, [
    "amount", "asset", "expiration", "extraGas", "signedRelayerCommitment", "withdrawalData",
  ])) return false;
  const numeric = [
    value.balanceWei, value.baseFeeBPS, value.commitmentHash, value.depositIndex,
    value.expectedNewBalanceWei, value.expectedNewCommitment,
    value.expectedNewWithdrawalIndex, value.expectedSpentNullifier, value.gasPrice,
    value.label, value.relayCostWei, value.relayGas, value.withdrawalIndex,
    value.feeCommitment.amount,
  ].map(uint);
  return value.version === 1 && typeof value.operationId === "string" && UUID.test(value.operationId) &&
    (!operationId || value.operationId === operationId) &&
    typeof value.commitmentId === "string" && UUID.test(value.commitmentId) &&
    typeof value.commitmentRevision === "number" && Number.isSafeInteger(value.commitmentRevision) && value.commitmentRevision >= 0 &&
    numeric.every((item) => item !== null) && numeric[0]! > 0n && numeric[2]! > 0n && numeric[5]! > 0n && numeric[7]! > 0n && numeric[9]! > 0n &&
    numeric[4]! <= numeric[0]! && numeric[6] === numeric[12]! + 1n &&
    typeof value.relayerUrl === "string" && PRIVACY_POOLS_DEPLOYMENT.services.relayers.some((pin) => pin.url === value.relayerUrl) &&
    address(value.signerAddress) && address(value.feeReceiverAddress) &&
    typeof value.feeCommitment.expiration === "number" && Number.isSafeInteger(value.feeCommitment.expiration) && value.feeCommitment.expiration >= 0 &&
    typeof value.feeCommitment.withdrawalData === "string" && /^0x[0-9a-fA-F]{192}$/.test(value.feeCommitment.withdrawalData) &&
    address(value.feeCommitment.asset) && value.feeCommitment.asset.toLowerCase() === PRIVACY_POOLS_DEPLOYMENT.nativeAsset.toLowerCase() &&
    value.feeCommitment.extraGas === false &&
    typeof value.feeCommitment.signedRelayerCommitment === "string" && SIGNATURE.test(value.feeCommitment.signedRelayerCommitment);
}

export function isValidStoredPrivacyUnshield(value: unknown): value is StoredPrivacyUnshieldV1 {
  if (!exact(value, ["encryptedDetails", "keyId", "summary", "tracking"]) ||
      !isValidPrivacyUnshieldSummary(value.summary) ||
      !isValidPrivacyUnshieldTracking(value.tracking, value.summary) ||
      typeof value.keyId !== "string" || value.keyId.length === 0 || value.keyId.length > 128 ||
      !exact(value.encryptedDetails, ["ciphertext", "iv", "scheme", "version"])) return false;
  return value.encryptedDetails.version === 1 && value.encryptedDetails.scheme === "privacy-unshield-key" &&
    decodeBase64Exact(value.encryptedDetails.iv, 12) !== null &&
    decodeBase64Bounded(value.encryptedDetails.ciphertext, 17, 16_384) !== null;
}

export function defaultPrivacyUnshieldTracking(
  summary: PrivacyUnshieldSummaryV1,
): PrivacyUnshieldTrackingV1 {
  return {
    version: 1,
    revision: 0,
    state: "quote_ready",
    updatedAt: summary.createdAt,
    relayerRequestId: null,
    txHash: null,
    blockNumber: null,
    errorCode: null,
  };
}
