import { normalizeErc7715Address } from "./address";
import {
  ERC7710_EMPTY_CAVEAT_ARGS,
  METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS,
  type Erc7715MappedCaveat,
} from "./caveatDefinitions";

type Hex = `0x${string}`;
type Address = Hex;

export const MAX_UINT256 = (1n << 256n) - 1n;

export function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid ERC-7715 permission request");
  }
  return value as Record<string, unknown>;
}

function stripHexPrefix(value: Hex): string {
  return value.slice(2);
}

function concatHex(parts: Hex[]): Hex {
  return `0x${parts.map(stripHexPrefix).join("")}`;
}

function fixedWidthHex(value: bigint | number, bytes: number): Hex {
  const bigintValue = BigInt(value);
  if (bigintValue < 0n) {
    throw new Error("Caveat term value cannot be negative");
  }

  const width = bytes * 2;
  const hex = bigintValue.toString(16);
  if (hex.length > width) {
    throw new Error("Caveat term value is too large");
  }

  return `0x${hex.padStart(width, "0")}`;
}

const ZERO_VALUE_TERMS = fixedWidthHex(0n, 32);

export function hexQuantityToBigInt(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/iu.test(value)) {
    throw new Error(`${label} must be a hex quantity`);
  }
  return BigInt(value);
}

export function optionalHexQuantityToBigInt(
  value: unknown,
  defaultValue: bigint,
  label: string,
): bigint {
  if (value === undefined || value === null) return defaultValue;
  return hexQuantityToBigInt(value, label);
}

export function numberValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer`);
  }
  return value;
}

export function addressValue(value: unknown, label: string): Address {
  return normalizeErc7715Address(value, label);
}

export function caveat(
  enforcerName: Erc7715MappedCaveat["enforcerName"],
  terms: Hex,
): Erc7715MappedCaveat {
  return {
    enforcerName,
    enforcer: METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS[enforcerName],
    terms,
    args: ERC7710_EMPTY_CAVEAT_ARGS,
  };
}

function timestampTerms({
  afterThreshold,
  beforeThreshold,
}: {
  afterThreshold: number;
  beforeThreshold: number;
}): Hex {
  return concatHex([
    fixedWidthHex(afterThreshold, 16),
    fixedWidthHex(beforeThreshold, 16),
  ]);
}

export function approvalRevocationTerms(mask: number): Hex {
  if (!Number.isInteger(mask) || mask <= 0 || mask > 0x3f) {
    throw new Error("Approval revocation terms are invalid");
  }
  return `0x${mask.toString(16).padStart(2, "0")}`;
}

export function exactEmptyCalldataCaveat(): Erc7715MappedCaveat {
  return caveat("ExactCalldataEnforcer", "0x");
}

export function zeroNativeValueCaveat(): Erc7715MappedCaveat {
  return caveat("ValueLteEnforcer", ZERO_VALUE_TERMS);
}

export function delegationNonceCaveat(
  nonce: bigint,
): Erc7715MappedCaveat {
  return caveat("NonceEnforcer", fixedWidthHex(nonce, 32));
}

export function nativePeriodTransferTerms({
  periodAmount,
  periodDuration,
  startDate,
}: {
  periodAmount: bigint;
  periodDuration: bigint | number;
  startDate: number;
}): Hex {
  return concatHex([
    fixedWidthHex(periodAmount, 32),
    fixedWidthHex(periodDuration, 32),
    fixedWidthHex(startDate, 32),
  ]);
}

export function nativeStreamingTerms({
  initialAmount,
  maxAmount,
  amountPerSecond,
  startTime,
}: {
  initialAmount: bigint;
  maxAmount: bigint;
  amountPerSecond: bigint;
  startTime: number;
}): Hex {
  return concatHex([
    fixedWidthHex(initialAmount, 32),
    fixedWidthHex(maxAmount, 32),
    fixedWidthHex(amountPerSecond, 32),
    fixedWidthHex(startTime, 32),
  ]);
}

export function erc20PeriodTransferTerms({
  tokenAddress,
  periodAmount,
  periodDuration,
  startDate,
}: {
  tokenAddress: Address;
  periodAmount: bigint;
  periodDuration: bigint | number;
  startDate: number;
}): Hex {
  return concatHex([
    tokenAddress,
    fixedWidthHex(periodAmount, 32),
    fixedWidthHex(periodDuration, 32),
    fixedWidthHex(startDate, 32),
  ]);
}

export function erc20StreamingTerms({
  tokenAddress,
  initialAmount,
  maxAmount,
  amountPerSecond,
  startTime,
}: {
  tokenAddress: Address;
  initialAmount: bigint;
  maxAmount: bigint;
  amountPerSecond: bigint;
  startTime: number;
}): Hex {
  return concatHex([
    tokenAddress,
    fixedWidthHex(initialAmount, 32),
    fixedWidthHex(maxAmount, 32),
    fixedWidthHex(amountPerSecond, 32),
    fixedWidthHex(startTime, 32),
  ]);
}

export function expiryFromRules(rules: unknown): number | null {
  if (!Array.isArray(rules)) return null;
  for (const rule of rules) {
    const ruleObject = asObject(rule);
    if (ruleObject.type !== "expiry") continue;
    const data = asObject(ruleObject.data);
    return numberValue(data.timestamp, "expiry.timestamp");
  }
  return null;
}

export function maybeTimestampCaveat(
  afterThreshold: number,
  beforeThreshold: number | null,
): Erc7715MappedCaveat | null {
  if (afterThreshold === 0 && beforeThreshold === null) {
    return null;
  }

  return caveat(
    "TimestampEnforcer",
    timestampTerms({
      afterThreshold,
      beforeThreshold: beforeThreshold ?? 0,
    }),
  );
}
