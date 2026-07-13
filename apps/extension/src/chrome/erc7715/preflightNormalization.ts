import {
  isErc7715TokenApprovalRevocationPermissionType,
} from "@/lib/erc7715ApprovalRevocation";
import { normalizeErc7715Address } from "./address";
import {
  getErc7715PermissionJustification,
} from "./permissionValidation";
import type { Erc7715SupportedPermissionType } from "./permissionTypes";
import type {
  Address,
  Erc7715PermissionRequest,
  Hex,
} from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseHexChainId(value: unknown): number | null {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/iu.test(value)) {
    return null;
  }
  const chainId = Number.parseInt(value, 16);
  return Number.isSafeInteger(chainId) && chainId > 0 ? chainId : null;
}

export function normalizePreflightAddress(
  value: unknown,
  label: string,
): Address {
  return normalizeErc7715Address(value, label) as Address;
}

function cloneRecord(value: unknown): Record<string, unknown> {
  return isObject(value) ? { ...value } : {};
}

function clonePermissionData(value: unknown): Record<string, unknown> {
  const data = cloneRecord(value);
  delete data.justification;
  return data;
}

function isNativePermissionType(
  permissionType: Erc7715SupportedPermissionType,
): boolean {
  return permissionType.startsWith("native-token-");
}

function normalizePermissionData({
  data,
  permissionType,
  rules,
  nowSeconds,
}: {
  data: Record<string, unknown>;
  permissionType: Erc7715SupportedPermissionType;
  rules?: Erc7715PermissionRequest["rules"];
  nowSeconds: number;
}): Record<string, unknown> {
  const normalized = { ...data };

  if (!isNativePermissionType(permissionType)) {
    const tokenAddress = data.tokenAddress;
    if (tokenAddress !== undefined) {
      normalized.tokenAddress = normalizePreflightAddress(
        tokenAddress,
        `${permissionType}.data.tokenAddress`,
      );
    }
  }

  if (
    !isErc7715TokenApprovalRevocationPermissionType(permissionType) &&
    normalized.startTime === undefined
  ) {
    normalized.startTime = nowSeconds;
  }

  const expiry = rules?.find((rule) => rule.type === "expiry")?.data.timestamp;
  if (
    typeof normalized.startTime === "number" &&
    typeof expiry === "number" &&
    normalized.startTime >= expiry
  ) {
    throw new Error(`${permissionType}.data.startTime must be before expiry`);
  }

  return normalized;
}

export function normalizeErc7715PermissionRequest(
  request: Record<string, unknown>,
  permissionType: Erc7715SupportedPermissionType,
  activeAccountAddress: string,
  nowSeconds: number,
): Erc7715PermissionRequest {
  const permission = request.permission as Record<string, unknown>;
  const justification = getErc7715PermissionJustification(permission);
  const rules = Array.isArray(request.rules)
    ? request.rules.map((rule) => {
        const ruleObject = rule as Record<string, unknown>;
        return {
          type: String(ruleObject.type),
          data: cloneRecord(ruleObject.data),
        };
      })
    : undefined;

  return {
    chainId: request.chainId as Hex,
    from: normalizePreflightAddress(
      request.from ?? activeAccountAddress,
      "Permission request from address",
    ),
    to: normalizePreflightAddress(
      request.to,
      "Permission request to address",
    ),
    permission: {
      type: permissionType,
      isAdjustmentAllowed: permission.isAdjustmentAllowed === true,
      ...(justification ? { justification } : {}),
      data: normalizePermissionData({
        data: clonePermissionData(permission.data),
        permissionType,
        rules,
        nowSeconds,
      }),
    },
    ...(rules ? { rules } : {}),
  };
}

export function getPermissionExpirySeconds(
  request: Erc7715PermissionRequest,
): number | null {
  for (const rule of request.rules || []) {
    if (rule.type !== "expiry") continue;
    const timestamp = rule.data.timestamp;
    return typeof timestamp === "number" ? timestamp : null;
  }
  return null;
}
