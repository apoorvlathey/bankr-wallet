import type {
  Erc7715PermissionRequest,
  Hex,
} from "@/chrome/pendingErc7715PermissionStorage";
import {
  approvalRevocationMethodsMatch,
  isErc7715TokenApprovalRevocationPermissionType,
} from "@/lib/erc7715ApprovalRevocation";

type AmountField = "allowanceAmount" | "periodAmount" | "amountPerSecond";
export const ERC7715_MAX_UINT256_HEX =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as const;
const ERC7715_MAX_UINT256 = (1n << 256n) - 1n;

export function isErc7715PeriodicPermissionType(type: string): boolean {
  return type === "erc20-token-periodic" || type === "native-token-periodic";
}

export function isErc7715StreamPermissionType(type: string): boolean {
  return type === "native-token-stream" || type === "erc20-token-stream";
}

export function isErc7715NativePermissionType(type: string): boolean {
  return (
    type === "native-token-allowance" ||
    type === "native-token-periodic" ||
    type === "native-token-stream"
  );
}

export function isErc7715Erc20PermissionType(type: string): boolean {
  return (
    type === "erc20-token-allowance" ||
    type === "erc20-token-periodic" ||
    type === "erc20-token-stream"
  );
}

export { isErc7715TokenApprovalRevocationPermissionType };

function cloneRequest(
  request: Erc7715PermissionRequest,
): Erc7715PermissionRequest {
  return {
    ...request,
    permission: {
      ...request.permission,
      data: { ...request.permission.data },
    },
    ...(request.rules
      ? {
          rules: request.rules.map((rule) => ({
            type: rule.type,
            data: { ...rule.data },
          })),
        }
      : {}),
  };
}

function amountFieldForRequest(
  request: Erc7715PermissionRequest,
): AmountField {
  if (isErc7715StreamPermissionType(request.permission.type)) {
    return "amountPerSecond";
  }
  return isErc7715PeriodicPermissionType(request.permission.type)
    ? "periodAmount"
    : "allowanceAmount";
}

function parseHexQuantity(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/iu.test(value)) {
    throw new Error(`${label} must be a hex quantity`);
  }
  return BigInt(value);
}

function parseOptionalHexQuantity(
  value: unknown,
  defaultValue: bigint,
  label: string,
): bigint {
  if (value === undefined || value === null) return defaultValue;
  return parseHexQuantity(value, label);
}

function parseTimestamp(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a Unix timestamp`);
  }
  return value;
}

function parseDuration(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive duration`);
  }
  return value;
}

function sameAddress(a: unknown, b: unknown): boolean {
  return typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
}

export function bigintToHexQuantity(value: bigint): Hex {
  if (value < 0n) throw new Error("Hex quantity cannot be negative");
  return `0x${value.toString(16)}`;
}

export function getErc7715PermissionAmount(
  request: Erc7715PermissionRequest,
): bigint {
  return parseHexQuantity(
    request.permission.data[amountFieldForRequest(request)],
    "Permission amount",
  );
}

export function getErc7715PermissionStartTime(
  request: Erc7715PermissionRequest,
): number {
  return parseTimestamp(
    request.permission.data.startTime,
    "Permission start time",
  );
}

export function getErc7715PermissionExpiry(
  request: Erc7715PermissionRequest,
): number | null {
  for (const rule of request.rules || []) {
    if (rule.type !== "expiry") continue;
    return parseTimestamp(rule.data.timestamp, "Permission expiry");
  }
  return null;
}

export function getErc7715PermissionPeriodDuration(
  request: Erc7715PermissionRequest,
): number | null {
  if (!isErc7715PeriodicPermissionType(request.permission.type)) return null;
  return parseDuration(
    request.permission.data.periodDuration,
    "Permission period duration",
  );
}

export function getErc7715PermissionAmountPerSecond(
  request: Erc7715PermissionRequest,
): bigint {
  return parseHexQuantity(
    request.permission.data.amountPerSecond,
    "Permission stream rate",
  );
}

export function getErc7715PermissionInitialAmount(
  request: Erc7715PermissionRequest,
): bigint {
  return parseOptionalHexQuantity(
    request.permission.data.initialAmount,
    0n,
    "Permission initial allowance",
  );
}

export function getErc7715PermissionMaxAmount(
  request: Erc7715PermissionRequest,
): bigint {
  return parseOptionalHexQuantity(
    request.permission.data.maxAmount,
    ERC7715_MAX_UINT256,
    "Permission max allowance",
  );
}

export function isErc7715UnlimitedMaxAmount(value: bigint): boolean {
  return value === ERC7715_MAX_UINT256;
}

export function getErc7715PermissionTokenAddress(
  request: Erc7715PermissionRequest,
): string | null {
  const tokenAddress = request.permission.data.tokenAddress;
  return typeof tokenAddress === "string" ? tokenAddress : null;
}

export function withErc7715PermissionAmount(
  request: Erc7715PermissionRequest,
  amount: bigint,
): Erc7715PermissionRequest {
  const next = cloneRequest(request);
  next.permission.data[amountFieldForRequest(next)] = bigintToHexQuantity(amount);
  return next;
}

export function withErc7715PermissionStartTime(
  request: Erc7715PermissionRequest,
  startTime: number,
): Erc7715PermissionRequest {
  const next = cloneRequest(request);
  next.permission.data.startTime = startTime;
  return next;
}

export function withErc7715PermissionExpiry(
  request: Erc7715PermissionRequest,
  expiry: number | null,
): Erc7715PermissionRequest {
  const next = cloneRequest(request);
  const rules = (next.rules || []).filter((rule) => rule.type !== "expiry");
  if (expiry !== null) {
    rules.push({ type: "expiry", data: { timestamp: expiry } });
  }
  if (rules.length > 0) next.rules = rules;
  else delete next.rules;
  return next;
}

export function withErc7715PermissionPeriodDuration(
  request: Erc7715PermissionRequest,
  periodDuration: number,
): Erc7715PermissionRequest {
  const next = cloneRequest(request);
  next.permission.data.periodDuration = periodDuration;
  return next;
}

export function withErc7715PermissionAmountPerSecond(
  request: Erc7715PermissionRequest,
  amountPerSecond: bigint,
): Erc7715PermissionRequest {
  const next = cloneRequest(request);
  next.permission.data.amountPerSecond = bigintToHexQuantity(amountPerSecond);
  return next;
}

export function withErc7715PermissionInitialAmount(
  request: Erc7715PermissionRequest,
  initialAmount: bigint,
): Erc7715PermissionRequest {
  const next = cloneRequest(request);
  if (initialAmount === 0n) delete next.permission.data.initialAmount;
  else next.permission.data.initialAmount = bigintToHexQuantity(initialAmount);
  return next;
}

export function withErc7715PermissionMaxAmount(
  request: Erc7715PermissionRequest,
  maxAmount: bigint,
): Erc7715PermissionRequest {
  const next = cloneRequest(request);
  next.permission.data.maxAmount = bigintToHexQuantity(maxAmount);
  return next;
}

export function assertErc7715PermissionEditIsAllowed(
  original: Erc7715PermissionRequest,
  edited: Erc7715PermissionRequest,
): void {
  if (original.chainId.toLowerCase() !== edited.chainId.toLowerCase()) {
    throw new Error("Permission chain cannot be changed");
  }
  if (!sameAddress(original.from, edited.from)) {
    throw new Error("Permission account cannot be changed");
  }
  if (!sameAddress(original.to, edited.to)) {
    throw new Error("Permission delegate cannot be changed");
  }
  if (original.permission.type !== edited.permission.type) {
    throw new Error("Permission type cannot be changed");
  }
  if (
    original.permission.isAdjustmentAllowed !==
    edited.permission.isAdjustmentAllowed
  ) {
    throw new Error("Permission adjustment policy cannot be changed");
  }

  if (isErc7715Erc20PermissionType(original.permission.type)) {
    if (
      !sameAddress(
        original.permission.data.tokenAddress,
        edited.permission.data.tokenAddress,
      )
    ) {
      throw new Error("Permission token cannot be changed");
    }
  }

  if (isErc7715TokenApprovalRevocationPermissionType(original.permission.type)) {
    if (
      !approvalRevocationMethodsMatch(
        original.permission.data,
        edited.permission.data,
      )
    ) {
      throw new Error("Permission revocation methods cannot be changed");
    }

    const originalExpiry = getErc7715PermissionExpiry(original);
    const editedExpiry = getErc7715PermissionExpiry(edited);
    if (editedExpiry === null) {
      throw new Error(
        "Token approval revocation permissions require an expiration date",
      );
    }
    if (!original.permission.isAdjustmentAllowed && editedExpiry !== originalExpiry) {
      throw new Error("This permission does not allow user adjustments");
    }
    if (originalExpiry !== null && editedExpiry > originalExpiry) {
      throw new Error("Permission expiry cannot be later than requested");
    }
    return;
  }

  const originalAmount = getErc7715PermissionAmount(original);
  const editedAmount = getErc7715PermissionAmount(edited);
  const originalStart = getErc7715PermissionStartTime(original);
  const editedStart = getErc7715PermissionStartTime(edited);
  const originalExpiry = getErc7715PermissionExpiry(original);
  const editedExpiry = getErc7715PermissionExpiry(edited);
  const originalPeriod = getErc7715PermissionPeriodDuration(original);
  const editedPeriod = getErc7715PermissionPeriodDuration(edited);
  const originalInitial = isErc7715StreamPermissionType(original.permission.type)
    ? getErc7715PermissionInitialAmount(original)
    : null;
  const editedInitial = isErc7715StreamPermissionType(edited.permission.type)
    ? getErc7715PermissionInitialAmount(edited)
    : null;
  const originalMax = isErc7715StreamPermissionType(original.permission.type)
    ? getErc7715PermissionMaxAmount(original)
    : null;
  const editedMax = isErc7715StreamPermissionType(edited.permission.type)
    ? getErc7715PermissionMaxAmount(edited)
    : null;

  // MetaMask allows users to change non-stream expiry even when dapps lock
  // permission-term edits with isAdjustmentAllowed: false.
  const permissionTermsChanged =
    editedAmount !== originalAmount ||
    editedStart !== originalStart ||
    editedPeriod !== originalPeriod ||
    editedInitial !== originalInitial ||
    editedMax !== originalMax;
  const expiryChanged = editedExpiry !== originalExpiry;

  if (!original.permission.isAdjustmentAllowed && permissionTermsChanged) {
    throw new Error("This permission does not allow user adjustments");
  }
  if (
    !original.permission.isAdjustmentAllowed &&
    isErc7715StreamPermissionType(original.permission.type) &&
    expiryChanged
  ) {
    throw new Error("This permission does not allow user adjustments");
  }

  if (isErc7715StreamPermissionType(edited.permission.type)) {
    const amountPerSecond = getErc7715PermissionAmountPerSecond(edited);
    const initialAmount = getErc7715PermissionInitialAmount(edited);
    const maxAmount = getErc7715PermissionMaxAmount(edited);
    if (amountPerSecond <= 0n) {
      throw new Error("Permission stream rate must be greater than zero");
    }
    if (amountPerSecond >= ERC7715_MAX_UINT256) {
      throw new Error("Permission stream rate must be finite and bounded");
    }
    if (initialAmount >= ERC7715_MAX_UINT256) {
      throw new Error("Permission initial allowance must be finite and bounded");
    }
    if (maxAmount > ERC7715_MAX_UINT256) {
      throw new Error("Permission max allowance is too large");
    }
    if (maxAmount <= initialAmount) {
      throw new Error(
        "Permission max allowance must be greater than initial allowance",
      );
    }
    if (editedExpiry === null) {
      throw new Error("Streaming permissions require an expiration date");
    }
    if (editedExpiry !== null) {
      const elapsedSeconds = BigInt(Math.max(0, editedExpiry - editedStart));
      const exposureAtExpiry =
        initialAmount + amountPerSecond * elapsedSeconds;
      if (exposureAtExpiry > ERC7715_MAX_UINT256) {
        throw new Error("Permission total stream exposure is too large");
      }
    }
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (editedStart < originalStart && originalStart > nowSeconds) {
    throw new Error("Permission start time cannot be earlier than requested");
  }

  if (
    isErc7715StreamPermissionType(edited.permission.type) &&
    originalExpiry !== null
  ) {
    if (editedExpiry !== null && editedExpiry > originalExpiry) {
      throw new Error("Permission expiry cannot be later than requested");
    }
  }
}
