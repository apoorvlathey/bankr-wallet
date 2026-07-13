/** Human-readable immutable snapshots used by revoke transaction prompts. */

import {
  enabledApprovalRevocationMethods,
} from "@/lib/erc7715ApprovalRevocation";
import {
  isErc7715PeriodicPermissionType,
  isErc7715StreamPermissionType,
  isErc7715TokenApprovalRevocationPermissionType,
} from "@/lib/erc7715PermissionEditing";
import type {
  Erc7715PermissionGrant,
  Hex,
} from "./types";

export function getErc7715PermissionAmountSnapshot(
  grant: Erc7715PermissionGrant,
): Hex | undefined {
  if (isErc7715StreamPermissionType(grant.permissionType)) {
    const value = grant.request.permission.data.amountPerSecond;
    if (typeof value !== "string" || !/^0x[0-9a-f]+$/iu.test(value)) {
      return undefined;
    }
    return `0x${(BigInt(value) * 86400n).toString(16)}`;
  }
  const field = isErc7715PeriodicPermissionType(grant.permissionType)
    ? "periodAmount"
    : "allowanceAmount";
  const value = grant.request.permission.data[field];
  return typeof value === "string" && /^0x[0-9a-f]+$/iu.test(value)
    ? (value as Hex)
    : undefined;
}

export function getErc7715TokenAddressSnapshot(
  grant: Erc7715PermissionGrant,
): Hex | undefined {
  const value = grant.request.permission.data.tokenAddress;
  return typeof value === "string" && /^0x[0-9a-f]{40}$/iu.test(value)
    ? (value as Hex)
    : undefined;
}

export function getErc7715PeriodDurationSnapshot(
  grant: Erc7715PermissionGrant,
): number | undefined {
  if (isErc7715StreamPermissionType(grant.permissionType)) return 86400;
  const value = grant.request.permission.data.periodDuration;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  try {
    const parsed = value.startsWith("0x") ? Number(BigInt(value)) : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function getErc7715ApprovalRevocationMethodSnapshot(
  grant: Erc7715PermissionGrant,
): string[] | undefined {
  if (!isErc7715TokenApprovalRevocationPermissionType(grant.permissionType)) {
    return undefined;
  }
  return enabledApprovalRevocationMethods(grant.request.permission.data).map(
    (method) => method.field,
  );
}
