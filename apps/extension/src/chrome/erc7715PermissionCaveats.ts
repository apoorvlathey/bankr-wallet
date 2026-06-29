import { isAddress } from "viem";
import { approvalRevocationMask } from "@/lib/erc7715ApprovalRevocation";
import { validateErc7715PermissionRequestPayload } from "./erc7715PermissionRegistry";

type Hex = `0x${string}`;
type Address = Hex;
const MAX_UINT256 = (1n << 256n) - 1n;

export const ERC7710_ROOT_AUTHORITY =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as const;

export const ERC7710_DELEGATION_MANAGER =
  "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3" as const;

export const ERC7710_EMPTY_CAVEAT_ARGS = "0x" as const;

export const METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS = {
  ERC20PeriodTransferEnforcer:
    "0x474e3Ae7E169e940607cC624Da8A15Eb120139aB",
  ERC20StreamingEnforcer: "0x56c97aE02f233B29fa03502Ecc0457266d9be00e",
  ERC20TransferAmountEnforcer:
    "0xf100b0819427117EcF76Ed94B358B1A5b5C6D2Fc",
  ApprovalRevocationEnforcer:
    "0xe264F1f09A19505a1ca1a86D5b01E8bFdb64324A",
  ExactCalldataEnforcer: "0x99F2e9bF15ce5eC84685604836F71aB835DBBdED",
  NativeTokenPeriodTransferEnforcer:
    "0x9BC0FAf4Aca5AE429F4c06aEEaC517520CB16BD9",
  NativeTokenStreamingEnforcer:
    "0xD10b97905a320b13a0608f7E9cC506b56747df19",
  NativeTokenTransferAmountEnforcer:
    "0xF71af580b9c3078fbc2BBF16FbB8EEd82b330320",
  NonceEnforcer: "0xDE4f2FAC4B3D87A1d9953Ca5FC09FCa7F366254f",
  TimestampEnforcer: "0x1046bb45C8d673d4ea75321280DB34899413c069",
  ValueLteEnforcer: "0x92Bf12322527cAA612fd31a0e810472BBB106A8F",
} as const satisfies Record<string, Address>;

export type Erc7715MappedCaveat = {
  enforcerName: keyof typeof METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS;
  enforcer: Address;
  terms: Hex;
  args: typeof ERC7710_EMPTY_CAVEAT_ARGS;
};

function asObject(value: unknown): Record<string, unknown> {
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

function hexQuantityToBigInt(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/iu.test(value)) {
    throw new Error(`${label} must be a hex quantity`);
  }
  return BigInt(value);
}

function optionalHexQuantityToBigInt(
  value: unknown,
  defaultValue: bigint,
  label: string,
): bigint {
  if (value === undefined || value === null) return defaultValue;
  return hexQuantityToBigInt(value, label);
}

function numberValue(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer`);
  }
  return value;
}

function addressValue(value: unknown, label: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${label} must be an address`);
  }
  return value;
}

function caveat(
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

function approvalRevocationTerms(mask: number): Hex {
  if (!Number.isInteger(mask) || mask <= 0 || mask > 0x3f) {
    throw new Error("Approval revocation terms are invalid");
  }
  return `0x${mask.toString(16).padStart(2, "0")}`;
}

function nonceTerms(nonce: bigint): Hex {
  return fixedWidthHex(nonce, 32);
}

function exactEmptyCalldataCaveat(): Erc7715MappedCaveat {
  return caveat("ExactCalldataEnforcer", "0x");
}

function zeroNativeValueCaveat(): Erc7715MappedCaveat {
  return caveat("ValueLteEnforcer", ZERO_VALUE_TERMS);
}

function delegationNonceCaveat(nonce: bigint): Erc7715MappedCaveat {
  return caveat("NonceEnforcer", nonceTerms(nonce));
}

function nativePeriodTransferTerms({
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

function nativeStreamingTerms({
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

function erc20PeriodTransferTerms({
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

function erc20StreamingTerms({
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

function expiryFromRules(rules: unknown): number | null {
  if (!Array.isArray(rules)) return null;
  for (const rule of rules) {
    const ruleObject = asObject(rule);
    if (ruleObject.type !== "expiry") continue;
    const data = asObject(ruleObject.data);
    return numberValue(data.timestamp, "expiry.timestamp");
  }
  return null;
}

function maybeTimestampCaveat(
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

export function buildErc7715PermissionCaveats(
  request: Record<string, unknown>,
  requestIndex = 0,
  options: { delegationNonce: bigint },
): Erc7715MappedCaveat[] {
  const permissionType = validateErc7715PermissionRequestPayload(
    request,
    requestIndex,
  );
  const permission = asObject(request.permission);
  const data = asObject(permission.data);
  const expiry = expiryFromRules(request.rules);
  const nonceCaveat = delegationNonceCaveat(options.delegationNonce);
  const exactCalldataCaveat = exactEmptyCalldataCaveat();
  const valueLteCaveat = zeroNativeValueCaveat();

  switch (permissionType) {
    case "native-token-allowance": {
      const amountCaveat = caveat(
        "NativeTokenPeriodTransferEnforcer",
        nativePeriodTransferTerms({
          periodAmount: hexQuantityToBigInt(
            data.allowanceAmount,
            "native-token-allowance.data.allowanceAmount",
          ),
          periodDuration: MAX_UINT256,
          startDate: numberValue(
            data.startTime,
            "native-token-allowance.data.startTime",
          ),
        }),
      );
      const timestampCaveat = maybeTimestampCaveat(0, expiry);
      return [
        amountCaveat,
        exactCalldataCaveat,
        nonceCaveat,
        ...(timestampCaveat ? [timestampCaveat] : []),
      ];
    }

    case "native-token-periodic": {
      const periodCaveat = caveat(
        "NativeTokenPeriodTransferEnforcer",
        nativePeriodTransferTerms({
          periodAmount: hexQuantityToBigInt(
            data.periodAmount,
            "native-token-periodic.data.periodAmount",
          ),
          periodDuration: numberValue(
            data.periodDuration,
            "native-token-periodic.data.periodDuration",
          ),
          startDate: numberValue(
            data.startTime,
            "native-token-periodic.data.startTime",
          ),
        }),
      );
      const timestampCaveat = maybeTimestampCaveat(0, expiry);
      return [
        periodCaveat,
        exactCalldataCaveat,
        nonceCaveat,
        ...(timestampCaveat ? [timestampCaveat] : []),
      ];
    }

    case "native-token-stream": {
      const streamCaveat = caveat(
        "NativeTokenStreamingEnforcer",
        nativeStreamingTerms({
          initialAmount: optionalHexQuantityToBigInt(
            data.initialAmount,
            0n,
            "native-token-stream.data.initialAmount",
          ),
          maxAmount: optionalHexQuantityToBigInt(
            data.maxAmount,
            MAX_UINT256,
            "native-token-stream.data.maxAmount",
          ),
          amountPerSecond: hexQuantityToBigInt(
            data.amountPerSecond,
            "native-token-stream.data.amountPerSecond",
          ),
          startTime: numberValue(
            data.startTime,
            "native-token-stream.data.startTime",
          ),
        }),
      );
      const timestampCaveat = maybeTimestampCaveat(0, expiry);
      return [
        streamCaveat,
        exactCalldataCaveat,
        nonceCaveat,
        ...(timestampCaveat ? [timestampCaveat] : []),
      ];
    }

    case "erc20-token-allowance": {
      const amountCaveat = caveat(
        "ERC20PeriodTransferEnforcer",
        erc20PeriodTransferTerms({
          tokenAddress: addressValue(
            data.tokenAddress,
            "erc20-token-allowance.data.tokenAddress",
          ),
          periodAmount: hexQuantityToBigInt(
            data.allowanceAmount,
            "erc20-token-allowance.data.allowanceAmount",
          ),
          periodDuration: MAX_UINT256,
          startDate: numberValue(
            data.startTime,
            "erc20-token-allowance.data.startTime",
          ),
        }),
      );
      const timestampCaveat = maybeTimestampCaveat(0, expiry);
      return [
        amountCaveat,
        valueLteCaveat,
        nonceCaveat,
        ...(timestampCaveat ? [timestampCaveat] : []),
      ];
    }

    case "erc20-token-periodic": {
      const periodCaveat = caveat(
        "ERC20PeriodTransferEnforcer",
        erc20PeriodTransferTerms({
          tokenAddress: addressValue(
            data.tokenAddress,
            "erc20-token-periodic.data.tokenAddress",
          ),
          periodAmount: hexQuantityToBigInt(
            data.periodAmount,
            "erc20-token-periodic.data.periodAmount",
          ),
          periodDuration: numberValue(
            data.periodDuration,
            "erc20-token-periodic.data.periodDuration",
          ),
          startDate: numberValue(
            data.startTime,
            "erc20-token-periodic.data.startTime",
          ),
        }),
      );
      const timestampCaveat = maybeTimestampCaveat(0, expiry);
      return [
        periodCaveat,
        valueLteCaveat,
        nonceCaveat,
        ...(timestampCaveat ? [timestampCaveat] : []),
      ];
    }

    case "erc20-token-stream": {
      const streamCaveat = caveat(
        "ERC20StreamingEnforcer",
        erc20StreamingTerms({
          tokenAddress: addressValue(
            data.tokenAddress,
            "erc20-token-stream.data.tokenAddress",
          ),
          initialAmount: optionalHexQuantityToBigInt(
            data.initialAmount,
            0n,
            "erc20-token-stream.data.initialAmount",
          ),
          maxAmount: optionalHexQuantityToBigInt(
            data.maxAmount,
            MAX_UINT256,
            "erc20-token-stream.data.maxAmount",
          ),
          amountPerSecond: hexQuantityToBigInt(
            data.amountPerSecond,
            "erc20-token-stream.data.amountPerSecond",
          ),
          startTime: numberValue(
            data.startTime,
            "erc20-token-stream.data.startTime",
          ),
        }),
      );
      const timestampCaveat = maybeTimestampCaveat(0, expiry);
      return [
        streamCaveat,
        valueLteCaveat,
        nonceCaveat,
        ...(timestampCaveat ? [timestampCaveat] : []),
      ];
    }

    case "token-approval-revocation": {
      const approvalCaveat = caveat(
        "ApprovalRevocationEnforcer",
        approvalRevocationTerms(approvalRevocationMask(data)),
      );
      const timestampCaveat = maybeTimestampCaveat(0, expiry);
      return timestampCaveat
        ? [approvalCaveat, nonceCaveat, timestampCaveat]
        : [approvalCaveat, nonceCaveat];
    }
  }
}
