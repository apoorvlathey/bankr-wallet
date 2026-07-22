import type { Address, Hex } from "viem";

export const PRIVACY_ASP_REVIEW_STATUSES = [
  "pending",
  "approved",
  "declined",
  "exited",
  "spent",
  "poi_required",
] as const;

export type PrivacyAspReviewStatus =
  (typeof PRIVACY_ASP_REVIEW_STATUSES)[number];

export interface PrivacyAspRoots {
  mtRoot: string;
  createdAt: string | number;
  onchainMtRoot: string;
}

export interface PrivacyAspLeaves {
  aspLeaves: string[];
  stateTreeLeaves: string[];
}

export interface PrivacyAspDeposit {
  type: "deposit";
  amount: string;
  address: Address;
  label: string;
  txHash: Hex;
  timestamp: number;
  precommitmentHash: string;
  reviewStatus: PrivacyAspReviewStatus;
}

export const MAX_PRIVACY_ASP_LEAVES_PER_TREE = 10_000;
export const MAX_PRIVACY_ASP_LABELS_PER_REQUEST = 20;
export const PRIVACY_SNARK_SCALAR_FIELD =
  21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617n;

const UINT = /^(?:0|[1-9]\d{0,79})$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const REVIEW_STATUSES = new Set<string>(PRIVACY_ASP_REVIEW_STATUSES);

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length &&
    actual.every((key, index) => key === sorted[index]);
}

export function parsePrivacyFieldElement(value: unknown): bigint | null {
  if (typeof value !== "string" || !UINT.test(value)) return null;
  try {
    const parsed = BigInt(value);
    return parsed > 0n && parsed < PRIVACY_SNARK_SCALAR_FIELD ? parsed : null;
  } catch {
    return null;
  }
}

function isCreatedAt(value: unknown): value is string | number {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0;
  }
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 64 &&
    Number.isFinite(Date.parse(value));
}

export function parsePrivacyAspRoots(value: unknown): PrivacyAspRoots {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !exactKeys(value, ["createdAt", "mtRoot", "onchainMtRoot"])
  ) {
    throw new Error("Invalid ASP roots");
  }
  const roots = value as Partial<PrivacyAspRoots>;
  if (
    parsePrivacyFieldElement(roots.mtRoot) === null ||
    parsePrivacyFieldElement(roots.onchainMtRoot) === null ||
    !isCreatedAt(roots.createdAt)
  ) {
    throw new Error("Invalid ASP roots");
  }
  return {
    mtRoot: roots.mtRoot!,
    createdAt: roots.createdAt!,
    onchainMtRoot: roots.onchainMtRoot!,
  };
}

function parseLeaves(
  value: unknown,
  name: string,
): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_PRIVACY_ASP_LEAVES_PER_TREE
  ) {
    throw new Error(`Invalid ASP ${name}`);
  }
  const leaves: string[] = [];
  const seen = new Set<string>();
  for (const leaf of value) {
    const parsed = parsePrivacyFieldElement(leaf);
    if (parsed === null) throw new Error(`Invalid ASP ${name}`);
    const normalized = parsed.toString();
    if (seen.has(normalized)) throw new Error(`Invalid ASP ${name}`);
    seen.add(normalized);
    leaves.push(normalized);
  }
  return leaves;
}

export function parsePrivacyAspLeaves(value: unknown): PrivacyAspLeaves {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !exactKeys(value, ["aspLeaves", "stateTreeLeaves"])
  ) {
    throw new Error("Invalid ASP leaves");
  }
  const leaves = value as Partial<PrivacyAspLeaves>;
  return {
    aspLeaves: parseLeaves(leaves.aspLeaves, "label leaves"),
    stateTreeLeaves: parseLeaves(leaves.stateTreeLeaves, "state leaves"),
  };
}

function parsePrivacyAspDeposit(value: unknown): PrivacyAspDeposit {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !exactKeys(value, [
      "address",
      "amount",
      "label",
      "precommitmentHash",
      "reviewStatus",
      "timestamp",
      "txHash",
      "type",
    ])
  ) {
    throw new Error("Invalid ASP deposit status");
  }
  const deposit = value as Partial<PrivacyAspDeposit>;
  if (
    deposit.type !== "deposit" ||
    typeof deposit.amount !== "string" ||
    !UINT.test(deposit.amount) ||
    BigInt(deposit.amount) <= 0n ||
    typeof deposit.address !== "string" ||
    !ADDRESS.test(deposit.address) ||
    parsePrivacyFieldElement(deposit.label) === null ||
    typeof deposit.txHash !== "string" ||
    !TX_HASH.test(deposit.txHash) ||
    typeof deposit.timestamp !== "number" ||
    !Number.isSafeInteger(deposit.timestamp) ||
    deposit.timestamp < 0 ||
    parsePrivacyFieldElement(deposit.precommitmentHash) === null ||
    typeof deposit.reviewStatus !== "string" ||
    !REVIEW_STATUSES.has(deposit.reviewStatus)
  ) {
    throw new Error("Invalid ASP deposit status");
  }
  return {
    type: "deposit",
    amount: deposit.amount,
    address: deposit.address as Address,
    label: deposit.label!,
    txHash: deposit.txHash.toLowerCase() as Hex,
    timestamp: deposit.timestamp,
    precommitmentHash: deposit.precommitmentHash!,
    reviewStatus: deposit.reviewStatus as PrivacyAspReviewStatus,
  };
}

export function parsePrivacyAspDeposits(value: unknown): PrivacyAspDeposit[] {
  if (!Array.isArray(value) || value.length > MAX_PRIVACY_ASP_LABELS_PER_REQUEST) {
    throw new Error("Invalid ASP deposit statuses");
  }
  const deposits = value.map(parsePrivacyAspDeposit);
  const labels = new Set<string>();
  for (const deposit of deposits) {
    const normalized = BigInt(deposit.label).toString();
    if (labels.has(normalized)) throw new Error("Invalid ASP deposit statuses");
    labels.add(normalized);
  }
  return deposits;
}
