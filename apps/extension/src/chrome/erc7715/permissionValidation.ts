import {
  approvalRevocationFieldNames,
  approvalRevocationMask,
} from "@/lib/erc7715ApprovalRevocation";
import { normalizeErc7715Address } from "./address";
import {
  isErc7715SupportedPermissionType,
  type Erc7715SupportedPermissionType,
} from "./permissionTypes";
import { validateErc7715Rules, type RuleSummary } from "./ruleValidation";
import {
  assertOnlyKeys,
  assertPositiveBoundedHexAmount,
  assertPositiveDuration,
  assertSafeTimestamp,
  isObject,
  MAX_UINT256,
  optionalInitialAmount,
  optionalMaxAmount,
} from "./validationPrimitives";

const MAX_JUSTIFICATION_LENGTH = 500;

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

function startTimeOrNow(data: Record<string, unknown>, permissionType: string) {
  if (data.startTime === undefined) {
    return Math.floor(Date.now() / 1000);
  }
  return assertSafeTimestamp(
    data.startTime,
    `${permissionType}.data.startTime`,
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
    throw new Error(
      `Permission request ${requestIndex} has invalid permission data`,
    );
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
      assertOptionalStartTime(data, permissionType, rules);
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
      assertOptionalStartTime(data, permissionType, rules);
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
      assertOptionalStartTime(data, permissionType, rules);
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
      assertOptionalStartTime(data, permissionType, rules);
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
