import {
  approvalRevocationFieldNames,
  approvalRevocationMask,
} from "@/lib/erc7715ApprovalRevocation";
import { normalizeErc7715Address } from "./erc7715PermissionAddress";

export const ERC7715_SUPPORTED_RULE_TYPES = ["expiry"] as const;

export const ERC7715_SUPPORTED_PERMISSION_TYPES = [
  "erc20-token-allowance",
  "erc20-token-periodic",
  "erc20-token-stream",
  "native-token-allowance",
  "native-token-periodic",
  "native-token-stream",
  "token-approval-revocation",
] as const;

export type Erc7715SupportedPermissionType =
  (typeof ERC7715_SUPPORTED_PERMISSION_TYPES)[number];

type RuleSummary = {
  expiry: number | null;
};

const MAX_UINT256 = (1n << 256n) - 1n;
const TIMESTAMP_UPPER_BOUND_SECONDS = 253402300799;
const MAX_JUSTIFICATION_LENGTH = 500;
const MAX_PERIOD_DURATION_SECONDS = 10 * 365 * 24 * 60 * 60;

const SUPPORTED_PERMISSION_TYPES_SET = new Set<string>(
  ERC7715_SUPPORTED_PERMISSION_TYPES,
);
const SUPPORTED_RULE_TYPES_SET = new Set<string>(ERC7715_SUPPORTED_RULE_TYPES);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} contains unsupported field '${key}'`);
    }
  }
}

function assertPositiveBoundedHexAmount(
  value: unknown,
  label: string,
): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/iu.test(value)) {
    throw new Error(`${label} must be a hex quantity`);
  }

  const parsed = BigInt(value);
  if (parsed <= 0n) {
    throw new Error(`${label} must be greater than zero`);
  }
  if (parsed >= MAX_UINT256) {
    throw new Error(`${label} must be finite and bounded`);
  }
  return parsed;
}

function assertNonNegativeBoundedHexAmount(
  value: unknown,
  label: string,
): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/iu.test(value)) {
    throw new Error(`${label} must be a hex quantity`);
  }

  const parsed = BigInt(value);
  if (parsed >= MAX_UINT256) {
    throw new Error(`${label} must be finite and bounded`);
  }
  return parsed;
}

function assertPositiveStreamCap(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/iu.test(value)) {
    throw new Error(`${label} must be a hex quantity`);
  }

  const parsed = BigInt(value);
  if (parsed <= 0n) {
    throw new Error(`${label} must be greater than zero`);
  }
  if (parsed > MAX_UINT256) {
    throw new Error(`${label} is too large`);
  }
  return parsed;
}

function assertSafeTimestamp(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a Unix timestamp`);
  }
  if (value > TIMESTAMP_UPPER_BOUND_SECONDS) {
    throw new Error(`${label} is too far in the future`);
  }
  return value;
}

function assertOptionalStartTime(
  data: Record<string, unknown>,
  permissionType: string,
  rules: RuleSummary,
) {
  if (data.startTime === undefined) return;
  const startTime = assertSafeTimestamp(
    data.startTime,
    `${permissionType}.data.startTime`,
  );
  if (startTime <= 0) {
    throw new Error(`${permissionType}.data.startTime must be positive`);
  }
  if (rules.expiry !== null && startTime >= rules.expiry) {
    throw new Error(`${permissionType}.data.startTime must be before expiry`);
  }
}

function assertStartTimeIfPresent(
  data: Record<string, unknown>,
  permissionType: string,
  rules: RuleSummary,
) {
  assertOptionalStartTime(data, permissionType, rules);
}

function startTimeOrNow(data: Record<string, unknown>, permissionType: string) {
  if (data.startTime === undefined) {
    return Math.floor(Date.now() / 1000);
  }
  return assertSafeTimestamp(
    data.startTime,
    `${permissionType}.data.startTime`,
  );
}

function assertPositiveDuration(value: unknown, label: string) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(`${label} must be a positive duration in seconds`);
  }
  if (value > MAX_PERIOD_DURATION_SECONDS) {
    throw new Error(`${label} must be 10 years or less`);
  }
}

function optionalInitialAmount(
  data: Record<string, unknown>,
  permissionType: string,
): bigint {
  if (data.initialAmount === undefined || data.initialAmount === null) return 0n;
  return assertNonNegativeBoundedHexAmount(
    data.initialAmount,
    `${permissionType}.data.initialAmount`,
  );
}

function optionalMaxAmount(
  data: Record<string, unknown>,
  permissionType: string,
): bigint {
  if (data.maxAmount === undefined || data.maxAmount === null) {
    return MAX_UINT256;
  }
  return assertPositiveStreamCap(
    data.maxAmount,
    `${permissionType}.data.maxAmount`,
  );
}

function assertStreamFields(
  data: Record<string, unknown>,
  permissionType: string,
  rules: RuleSummary,
) {
  const initialAmount = optionalInitialAmount(data, permissionType);
  const maxAmount = optionalMaxAmount(data, permissionType);
  const amountPerSecond = assertPositiveBoundedHexAmount(
    data.amountPerSecond,
    `${permissionType}.data.amountPerSecond`,
  );
  const startTime = startTimeOrNow(data, permissionType);

  if (startTime <= 0) {
    throw new Error(`${permissionType}.data.startTime must be positive`);
  }
  if (rules.expiry !== null && startTime >= rules.expiry) {
    throw new Error(`${permissionType}.data.startTime must be before expiry`);
  }
  if (maxAmount <= initialAmount) {
    throw new Error(
      `${permissionType}.data.maxAmount must be greater than initialAmount`,
    );
  }
  if (rules.expiry === null) {
    throw new Error(`${permissionType} requires an expiry`);
  }

  const elapsedSeconds = BigInt(Math.max(0, rules.expiry - startTime));
  const exposureAtExpiry = initialAmount + amountPerSecond * elapsedSeconds;
  if (exposureAtExpiry > MAX_UINT256) {
    throw new Error(`${permissionType} total exposure is too large`);
  }
}

function assertApprovalRevocationFields(
  data: Record<string, unknown>,
  permissionType: string,
  rules: RuleSummary,
) {
  const fields = approvalRevocationFieldNames();
  assertOnlyKeys(data, [...fields, "justification"], `${permissionType}.data`);
  for (const field of fields) {
    if (typeof data[field] !== "boolean") {
      throw new Error(`${permissionType}.data.${field} must be boolean`);
    }
  }
  if (data.permit2InvalidateNonces === true) {
    throw new Error(
      "Permit2 nonce invalidation is not supported until requests can be scoped to exact token/spender pairs",
    );
  }
  if (approvalRevocationMask(data) === 0) {
    throw new Error(
      `${permissionType} must enable at least one revocation method`,
    );
  }
  if (rules.expiry === null) {
    throw new Error(`${permissionType} requires an expiry`);
  }
}

export function getErc7715PermissionJustification(
  permission: Record<string, unknown>,
): string | undefined {
  const data = isObject(permission.data) ? permission.data : {};
  const direct = permission.justification;
  const nested = data.justification;
  if (direct !== undefined && nested !== undefined && direct !== nested) {
    throw new Error("Permission justification is ambiguous");
  }

  const raw = direct ?? nested;
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") {
    throw new Error("Permission justification must be a string");
  }

  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_JUSTIFICATION_LENGTH) {
    throw new Error(
      `Permission justification must be ${MAX_JUSTIFICATION_LENGTH} characters or less`,
    );
  }
  return trimmed;
}

export function isErc7715SupportedPermissionType(
  permissionType: unknown,
): permissionType is Erc7715SupportedPermissionType {
  return (
    typeof permissionType === "string" &&
    SUPPORTED_PERMISSION_TYPES_SET.has(permissionType)
  );
}

export function validateErc7715Rules(
  rules: unknown,
  requestIndex: number,
): RuleSummary {
  if (rules === undefined) return { expiry: null };
  if (!Array.isArray(rules)) {
    throw new Error(`Permission request ${requestIndex} has invalid rules`);
  }

  let expiry: number | null = null;
  const nowSeconds = Math.floor(Date.now() / 1000);

  for (const [ruleIndex, rule] of rules.entries()) {
    if (!isObject(rule) || typeof rule.type !== "string") {
      throw new Error(
        `Permission request ${requestIndex} has invalid rule ${ruleIndex}`,
      );
    }
    assertOnlyKeys(rule, ["type", "data"], `Rule ${ruleIndex}`);

    if (!SUPPORTED_RULE_TYPES_SET.has(rule.type)) {
      throw new Error(`Rule type '${rule.type}' is not enabled`);
    }
    if (rule.type === "expiry") {
      if (expiry !== null) {
        throw new Error(`Permission request ${requestIndex} repeats expiry rule`);
      }
      const data = isObject(rule.data) ? rule.data : null;
      if (!data) {
        throw new Error(`Permission request ${requestIndex} has invalid expiry rule`);
      }
      assertOnlyKeys(data, ["timestamp"], `Rule ${ruleIndex} data`);
      const timestamp = assertSafeTimestamp(
        data.timestamp,
        `Permission request ${requestIndex} expiry`,
      );
      if (timestamp <= nowSeconds) {
        throw new Error(`Permission request ${requestIndex} expiry is in the past`);
      }
      expiry = timestamp;
    }
  }

  return { expiry };
}

export function validateErc7715Permission(
  permission: unknown,
  requestIndex: number,
  rules: RuleSummary,
): Erc7715SupportedPermissionType {
  if (!isObject(permission)) {
    throw new Error(`Permission request ${requestIndex} has invalid permission`);
  }
  assertOnlyKeys(
    permission,
    ["type", "isAdjustmentAllowed", "data", "justification"],
    `Permission request ${requestIndex} permission`,
  );

  const permissionType = permission.type;
  if (!isErc7715SupportedPermissionType(permissionType)) {
    throw new Error(
      `Permission type '${
        typeof permissionType === "string" ? permissionType : "unknown"
      }' is not enabled`,
    );
  }
  if (typeof permission.isAdjustmentAllowed !== "boolean") {
    throw new Error(
      `Permission request ${requestIndex} permission.isAdjustmentAllowed must be boolean`,
    );
  }
  if (!isObject(permission.data)) {
    throw new Error(`Permission request ${requestIndex} has invalid permission data`);
  }

  const data = permission.data;
  getErc7715PermissionJustification(permission);

  switch (permissionType) {
    case "native-token-allowance":
      assertOnlyKeys(
        data,
        ["allowanceAmount", "startTime", "justification"],
        `${permissionType}.data`,
      );
      assertPositiveBoundedHexAmount(
        data.allowanceAmount,
        `${permissionType}.data.allowanceAmount`,
      );
      assertStartTimeIfPresent(data, permissionType, rules);
      return permissionType;

    case "native-token-periodic":
      assertOnlyKeys(
        data,
        ["periodAmount", "periodDuration", "startTime", "justification"],
        `${permissionType}.data`,
      );
      assertPositiveBoundedHexAmount(
        data.periodAmount,
        `${permissionType}.data.periodAmount`,
      );
      assertPositiveDuration(
        data.periodDuration,
        `${permissionType}.data.periodDuration`,
      );
      assertStartTimeIfPresent(data, permissionType, rules);
      return permissionType;

    case "native-token-stream":
      assertOnlyKeys(
        data,
        [
          "initialAmount",
          "maxAmount",
          "amountPerSecond",
          "startTime",
          "justification",
        ],
        `${permissionType}.data`,
      );
      assertStreamFields(data, permissionType, rules);
      return permissionType;

    case "erc20-token-allowance":
      assertOnlyKeys(
        data,
        ["tokenAddress", "allowanceAmount", "startTime", "justification"],
        `${permissionType}.data`,
      );
      normalizeErc7715Address(
        data.tokenAddress,
        `${permissionType}.data.tokenAddress`,
      );
      assertPositiveBoundedHexAmount(
        data.allowanceAmount,
        `${permissionType}.data.allowanceAmount`,
      );
      assertStartTimeIfPresent(data, permissionType, rules);
      return permissionType;

    case "erc20-token-periodic":
      assertOnlyKeys(
        data,
        [
          "tokenAddress",
          "periodAmount",
          "periodDuration",
          "startTime",
          "justification",
        ],
        `${permissionType}.data`,
      );
      normalizeErc7715Address(
        data.tokenAddress,
        `${permissionType}.data.tokenAddress`,
      );
      assertPositiveBoundedHexAmount(
        data.periodAmount,
        `${permissionType}.data.periodAmount`,
      );
      assertPositiveDuration(
        data.periodDuration,
        `${permissionType}.data.periodDuration`,
      );
      assertStartTimeIfPresent(data, permissionType, rules);
      return permissionType;

    case "erc20-token-stream":
      assertOnlyKeys(
        data,
        [
          "tokenAddress",
          "initialAmount",
          "maxAmount",
          "amountPerSecond",
          "startTime",
          "justification",
        ],
        `${permissionType}.data`,
      );
      normalizeErc7715Address(
        data.tokenAddress,
        `${permissionType}.data.tokenAddress`,
      );
      assertStreamFields(data, permissionType, rules);
      return permissionType;

    case "token-approval-revocation":
      assertApprovalRevocationFields(data, permissionType, rules);
      return permissionType;
  }
}

export function validateErc7715PermissionRequestPayload(
  request: Record<string, unknown>,
  requestIndex: number,
): Erc7715SupportedPermissionType {
  assertOnlyKeys(
    request,
    ["chainId", "from", "to", "permission", "rules"],
    `Permission request ${requestIndex}`,
  );

  const rules = validateErc7715Rules(request.rules, requestIndex);
  return validateErc7715Permission(request.permission, requestIndex, rules);
}
